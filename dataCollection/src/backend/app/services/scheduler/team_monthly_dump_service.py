"""
backend/app/services/scheduler/team_monthly_dump_service.py

VERSION SENIOR — Automatisation centrée-développeur (Team-Centric Tracking).

REMPLACE l'ancienne approche par projet pure par une approche par développeurs validés.
Garantit que 100% du staff géré (Sites/Squads) est archivé proprement chaque mois.
"""
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.period import PeriodStatusEnum
from app.models.extraction_lot import ExtractionTypeEnum, ExtractionStatusEnum, ExtractionLot
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.project_repository import ProjectRepository
from app.services.extraction.extraction_service import ExtractionService
from app.services.kpi.kpi_aggregator import KpiAggregator
from app.services.scheduler.cleanup_service import CleanupService

logger = logging.getLogger(__name__)

class TeamMonthlyDumpService:
    def __init__(self, db: Session):
        self.db           = db
        self.period_repo  = PeriodRepository()
        self.dev_repo     = DeveloperRepository()
        self.project_repo = ProjectRepository()
        self.config_repo  = GitLabConfigRepository()
        self.extraction_service = ExtractionService()
        self.aggregator         = KpiAggregator(db)
        self.cleanup_service    = CleanupService(db)

    async def run(self) -> dict:
        """
        Point d'entrée principal appelé par le Scheduler (dernier jour du mois).
        """
        now   = datetime.now(timezone.utc)
        year  = now.year
        month = now.month
        
        logger.info(f"[TeamMonthlyDump] Starting Team-Centric process for {year}/{month:02d}")
        
        summary = {
            "period": f"{year}/{month:02d}", 
            "devs_processed": 0, 
            "devs_failed": [], 
            "total_snapshots": 0
        }
        
        try:
            # 1. Gestion de la période
            period = self.period_repo.get_or_create(self.db, year, month)
            if period.status == PeriodStatusEnum.closed:
                logger.warning(f"[TeamMonthlyDump] Period {year}/{month:02d} already closed — skipping")
                return summary
                
            # Clôture symbolique (Senior Practice : on fige les KPIs du mois)
            self.period_repo.close_period(self.db, period)
            self.db.flush()

            # 2. Récupération des cibles (Tous les devs validés et actifs)
            # Priorité managériale : "On track les personnes"
            developers = self.dev_repo.get_all(self.db, active_only=True)
            logger.info(f"[TeamMonthlyDump] Targeting {len(developers)} validated developers")

            for dev in developers:
                try:
                    nb = await self._process_developer(dev, period)
                    summary["devs_processed"] += 1
                    summary["total_snapshots"] += nb
                except Exception as e:
                    logger.error(f"[TeamMonthlyDump] FAILED developer {dev.name} (id={dev.id}): {e}")
                    summary["devs_failed"].append({"dev": dev.name, "error": str(e)})

            self.db.commit()
            logger.info(f"[TeamMonthlyDump] COMPLETED — Devs={summary['devs_processed']} FAILED={len(summary['devs_failed'])} Snapshots={summary['total_snapshots']}")

        except Exception:
            logger.error("[TeamMonthlyDump] Global failure — rollback", exc_info=True)
            self.db.rollback()
            raise
            
        return summary

    async def _process_developer(self, dev, period) -> int:
        """
        Traite un développeur spécifique : identifie ses projets et force l'extraction.
        """
        snapshots_count = 0
        
        # On identifie les projets actifs de ce développeur
        # On utilise les project_associations du modèle Developer
        projects_to_sync = [assoc.project for assoc in dev.project_associations if assoc.is_active and assoc.project.is_active]
        
        if not projects_to_sync:
            logger.debug(f"[TeamMonthlyDump] Dev {dev.name} has no active project associations — skipped")
            return 0

        # On a besoin d'une config GitLab. Généralement un dev appartient à une instance ou on prend la première active.
        # Amélioration Senior : Utiliser la config du premier projet trouvé.
        first_project = projects_to_sync[0]
        gitlab_config = self.config_repo.get_by_id(self.db, first_project.gitlab_config_id)
        
        if not gitlab_config or not gitlab_config.is_active:
            logger.warning(f"[TeamMonthlyDump] No active GitLab config for project {first_project.name} (Dev: {dev.name})")
            return 0

        logger.info(f"[TeamMonthlyDump] Processing Dev: {dev.name} on {len(projects_to_sync)} projects")

        # Création du lot MONTHLY UNIQUE pour ce développeur
        # FIX-SENIOR : Un lot par développeur permet un audit granulaire.
        lot = ExtractionLot(
            extraction_type  = ExtractionTypeEnum.MONTHLY,
            status           = ExtractionStatusEnum.running,
            period_id        = period.id,
            developer_id     = dev.id,
            gitlab_config_id = gitlab_config.id,
            triggered_by     = 1, # System/Admin id
        )
        self.db.add(lot)
        self.db.flush()

        from app.services.gitlab.gitlab_client import GitLabClient
        client = GitLabClient(gitlab_config)

        # Extraction sur tous les projets de l'individu
        for project in projects_to_sync:
            try:
                # On réutilise la logique interne de l'extraction service
                # Note: On passe developer_ids=[dev.id] pour isoler le tracking
                await self.extraction_service._extract_data(
                    db            = self.db, 
                    project       = project, 
                    lot           = lot, 
                    client        = client, 
                    developer_ids = [dev.id],
                    fast_mode     = True
                )
                
                # Relink & Aggregation
                self.extraction_service._relink_commits_to_developers(self.db, project.id)
                self.db.flush()
                
                # Génération des snapshots
                snapshots = self.aggregator.generate_monthly_snapshots(
                    project_id = project.id, 
                    year       = period.year, 
                    month      = period.month, 
                    lot_id     = lot.id
                )
                snapshots_count += len(snapshots)

            except Exception as e:
                logger.error(f"[TeamMonthlyDump] Error on project {project.name} for dev {dev.name}: {e}")

        # Finalisation du lot
        lot.status       = ExtractionStatusEnum.completed
        lot.completed_at = datetime.now(timezone.utc)
        self.db.flush()

        return snapshots_count
