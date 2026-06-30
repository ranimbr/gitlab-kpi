"""
backend/app/services/scheduler/team_monthly_dump_service.py

VERSION SENIOR — Automatisation par Cohorte (Project-Level Grouping).

Garantit que 100% du staff actif durant la période est archivé via un Master Lot par projet.
Optimise les appels API GitLab en regroupant les extractions par projet au lieu de par développeur.
"""
import logging
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.period import PeriodStatusEnum
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.project_repository import ProjectRepository
from app.services.extraction.extraction_service import ExtractionService
from app.services.kpi.kpi_aggregator import KpiAggregator

logger = logging.getLogger(__name__)

class TeamMonthlyDumpService:
    def __init__(self, db: Session):
        self.db           = db
        self.period_repo  = PeriodRepository()
        self.project_repo = ProjectRepository()
        self.config_repo  = GitLabConfigRepository()
        self.extraction_service = ExtractionService()
        self.aggregator         = KpiAggregator(db)

    async def run(self, year: Optional[int] = None, month: Optional[int] = None) -> dict:
        """
        [SENIOR REFACTOR] - Extraction par Cohorte.
        Délègue l'extraction à ExtractionService qui gère désormais la sélection 
        temporelle intelligente (Tenure Window) par projet.
        """
        now   = datetime.now(timezone.utc)
        target_year  = year or now.year
        target_month = month or now.month
        
        logger.info(f"[TeamMonthlyDump] Starting Cohort-Centric sync for {target_year}/{target_month:02d}")
        
        summary = {
            "period": f"{target_year}/{target_month:02d}", 
            "projects_processed": 0, 
            "projects_failed": [], 
            "total_snapshots": 0
        }
        
        try:
            # 1. Gestion de la période
            period = self.period_repo.get_or_create(self.db, target_year, target_month)
            if period.status == PeriodStatusEnum.closed:
                logger.warning(f"[TeamMonthlyDump] Period {target_year}/{target_month:02d} already closed — skipping")
                return summary
                
            # 2. Clôture de la période (Senior Practice)
            self.period_repo.close_period(self.db, period)
            self.db.flush()

            # 3. Traitement par Projet (Master Lots)
            # On itère sur les projets actifs pour déclencher les extractions de clôture.
            projects = self.project_repo.get_all(self.db, active_only=True)
            logger.info(f"[TeamMonthlyDump] Processing {len(projects)} active projects")

            for project in projects:
                try:
                    # On récupère la config GitLab du projet
                    gitlab_config = self.config_repo.get_by_id(self.db, project.gitlab_config_id)
                    if not gitlab_config or not gitlab_config.is_active:
                        continue

                    # On délègue l'extraction au service dédié (qui gère déjà le filtrage intelligent par dev)
                    lot = await self.extraction_service.run_monthly_extraction(
                        db            = self.db,
                        project_id    = project.id,
                        period_id     = period.id,
                        gitlab_config = gitlab_config,
                        is_backfill   = True
                    )
                    
                    # 4. Génération des snapshots (Calcul des KPIs finaux)
                    snapshots = self.aggregator.generate_monthly_snapshots(
                        project_id = project.id, 
                        year       = period.year, 
                        month      = period.month, 
                        lot_id     = lot.id
                    )
                    
                    summary["projects_processed"] += 1
                    summary["total_snapshots"] += len(snapshots)
                    
                except Exception as e:
                    logger.error(f"[TeamMonthlyDump] FAILED project {project.name}: {e}")
                    summary["projects_failed"].append({"project": project.name, "error": str(e)})

            self.db.commit()
            logger.info(f"[TeamMonthlyDump] COMPLETED — Projects={summary['projects_processed']} Snapshots={summary['total_snapshots']}")

        except Exception:
            logger.error("[TeamMonthlyDump] Global failure — rollback", exc_info=True)
            self.db.rollback()
            raise
            
        return summary
