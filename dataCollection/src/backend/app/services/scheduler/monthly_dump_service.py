import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.project_repository import ProjectRepository
from app.services.extraction.extraction_service import ExtractionService
from app.services.kpi.kpi_aggregator import KpiAggregator
from app.services.scheduler.cleanup_service import CleanupService

logger = logging.getLogger(__name__)


class MonthlyDumpService:
    """
    Processus mensuel complet — déclenché par le Scheduler APScheduler.

    Workflow (un seul commit final) :
      1. Clôture de la période mensuelle
      2. Pour chaque projet actif :
         a. Extraction MONTHLY GitLab
         b. Cleanup des lots REALTIME de la période
         c. Génération des snapshots KPI (global + par site)
      3. Commit unique final

    [FIX] Appel corrigé : get_active_projects() au lieu de get_all()
    """

    def __init__(self, db: Session):
        self.db = db

        self.period_repo  = PeriodRepository()
        self.project_repo = ProjectRepository()
        self.config_repo  = GitLabConfigRepository()

        self.extraction_service = ExtractionService()
        self.aggregator         = KpiAggregator(db)
        self.cleanup_service    = CleanupService(db)

    # ─────────────────────────────────────────────────────────────────────────

    async def run(self) -> dict:

        now   = datetime.utcnow()
        year  = now.year
        month = now.month

        logger.info(f"[MonthlyDump] Starting process for {year}/{month:02d}")

        summary = {
            "period":           f"{year}/{month:02d}",
            "projects_ok":      [],
            "projects_failed":  [],
            "total_snapshots":  0,
        }

        try:
            # ─── STEP 1 : Clôture période ─────────────────────────────────────
            period = self.period_repo.get_or_create(self.db, year, month)

            if period.status.value == "closed":
                logger.warning(
                    f"[MonthlyDump] Period {year}/{month:02d} already closed — skipping"
                )
                return summary

            self.period_repo.close_period(self.db, period)
            self.db.flush()

            logger.info(f"[MonthlyDump] Period {year}/{month:02d} closed (flush only)")

            # ─── STEP 2 : Traitement des projets actifs ───────────────────────
            # [FIX] get_active_projects() au lieu de get_all()
            projects = self.project_repo.get_active_projects(self.db)

            logger.info(f"[MonthlyDump] Processing {len(projects)} active projects")

            for project in projects:
                try:
                    nb = await self._process_project(project, period)
                    summary["projects_ok"].append(project.name)
                    summary["total_snapshots"] += nb

                except Exception as e:
                    logger.error(
                        f"[MonthlyDump] FAILED project id={project.id} "
                        f"name={project.name}: {e}",
                        exc_info=True,
                    )
                    summary["projects_failed"].append({
                        "project": project.name,
                        "error":   str(e),
                    })

            # ─── STEP 3 : Commit unique final ─────────────────────────────────
            self.db.commit()

            logger.info(
                f"[MonthlyDump] COMPLETED — "
                f"OK={len(summary['projects_ok'])} "
                f"FAILED={len(summary['projects_failed'])} "
                f"Snapshots={summary['total_snapshots']}"
            )

        except Exception:
            logger.error("[MonthlyDump] Global failure — rollback", exc_info=True)
            self.db.rollback()
            raise

        return summary

    # ─────────────────────────────────────────────────────────────────────────

    async def _process_project(self, project, period) -> int:
        """
        Traite un projet pour le dump mensuel.
        Retourne le nombre de snapshots KPI générés.
        """
        if not project.gitlab_config_id:
            logger.warning(
                f"[MonthlyDump] Project id={project.id} has no gitlab_config — skipped"
            )
            return 0

        gitlab_config = self.config_repo.get_by_id(self.db, project.gitlab_config_id)

        if not gitlab_config or not gitlab_config.is_active:
            logger.warning(
                f"[MonthlyDump] GitLabConfig inactive or not found "
                f"(project_id={project.id}) — skipped"
            )
            return 0

        # ── Extraction MONTHLY ─────────────────────────────────────────────
        lot = await self.extraction_service.run_monthly_extraction(
            db            = self.db,
            project_id    = project.id,
            period_id     = period.id,
            gitlab_config = gitlab_config,
        )
        logger.info(f"[MonthlyDump] MONTHLY lot created id={lot.id}")

        # ── Cleanup REALTIME ───────────────────────────────────────────────
        deleted = self.cleanup_service.delete_realtime_lots(
            project_id = project.id,
            period_id  = period.id,
        )
        logger.info(f"[MonthlyDump] REALTIME lots deleted: {deleted}")

        # ── Génération snapshots KPI ───────────────────────────────────────
        snapshots = self.aggregator.generate_monthly_snapshots(
            project_id = project.id,
            year       = period.year,
            month      = period.month,
        )
        logger.info(f"[MonthlyDump] KPI snapshots generated: {len(snapshots)}")

        return len(snapshots)
