"""services/scheduler/monthly_dump_service.py — ."""
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.period import PeriodStatusEnum
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.project_repository import ProjectRepository
from app.services.extraction.extraction_service import ExtractionService
from app.services.kpi.kpi_aggregator import KpiAggregator
from app.services.scheduler.cleanup_service import CleanupService

logger = logging.getLogger(__name__)

class MonthlyDumpService:
    def __init__(self, db: Session):
        self.db           = db
        self.period_repo  = PeriodRepository()
        self.project_repo = ProjectRepository()
        self.config_repo  = GitLabConfigRepository()
        self.extraction_service = ExtractionService()
        self.aggregator         = KpiAggregator(db)
        self.cleanup_service    = CleanupService(db)

    async def run(self) -> dict:
        from datetime import timezone
        now   = datetime.now(timezone.utc)
        year  = now.year
        month = now.month
        logger.info(f"[MonthlyDump] Starting process for {year}/{month:02d}")
        summary = {"period": f"{year}/{month:02d}", "projects_ok": [], "projects_failed": [], "total_snapshots": 0}
        try:
            period = self.period_repo.get_or_create(self.db, year, month)
            if period.status == PeriodStatusEnum.closed:
                logger.warning(f"[MonthlyDump] Period {year}/{month:02d} already closed — skipping")
                return summary
            self.period_repo.close_period(self.db, period)
            self.db.flush()
            projects = self.project_repo.get_all(self.db, active_only=True)
            logger.info(f"[MonthlyDump] Processing {len(projects)} active projects")
            for project in projects:
                try:
                    nb = await self._process_project(project, period)
                    summary["projects_ok"].append(project.name)
                    summary["total_snapshots"] += nb
                except Exception as e:
                    logger.error(f"[MonthlyDump] FAILED project id={project.id}: {e}", exc_info=True)
                    summary["projects_failed"].append({"project": project.name, "error": str(e)})
            self.db.commit()
            logger.info(f"[MonthlyDump] COMPLETED — OK={len(summary['projects_ok'])} FAILED={len(summary['projects_failed'])} Snapshots={summary['total_snapshots']}")
        except Exception:
            logger.error("[MonthlyDump] Global failure — rollback", exc_info=True)
            self.db.rollback()
            raise
        return summary

    async def _process_project(self, project, period) -> int:
        if not project.gitlab_config_id:
            logger.warning(f"[MonthlyDump] Project id={project.id} has no gitlab_config — skipped")
            return 0
        gitlab_config = self.config_repo.get_by_id(self.db, project.gitlab_config_id)
        if not gitlab_config or not gitlab_config.is_active:
            logger.warning(f"[MonthlyDump] GitLabConfig inactive (project_id={project.id}) — skipped")
            return 0
        lot = await self.extraction_service.run_monthly_extraction(
            db=self.db, project_id=project.id, period_id=period.id, gitlab_config=gitlab_config)
        deleted   = self.cleanup_service.delete_realtime_lots(project_id=project.id, period_id=period.id)
        snapshots = self.aggregator.generate_monthly_snapshots(
            project_id=project.id, year=period.year, month=period.month, lot_id=lot.id)
        return len(snapshots)