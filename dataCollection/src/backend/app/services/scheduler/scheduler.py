"""services/scheduler/scheduler.py — inchangé."""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

def create_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        func=_run_monthly_job,
        trigger=CronTrigger(day="last", hour=20, minute=0),
        id="monthly_kpi_job",
        name="Monthly KPI Generation",
        replace_existing=True,
        misfire_grace_time=3600,
        coalesce=True,
        max_instances=1,
    )
    logger.info("Scheduler configured — last day of month 20:00 UTC")
    return scheduler

async def _run_monthly_job() -> None:
    from app.database.session import SessionLocal
    from app.services.scheduler.monthly_dump_service import MonthlyDumpService
    db = SessionLocal()
    try:
        service = MonthlyDumpService(db)
        result  = await service.run()
        logger.info(f"[Scheduler] Monthly job success: {result}")
    except Exception as e:
        logger.error(f"[Scheduler] Monthly job failed: {e}", exc_info=True)
    finally:
        db.close()