"""services/scheduler/scheduler.py — ."""
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
    from app.database.session import SessionLocal, current_db_var
    from app.services.scheduler.team_monthly_dump_service import TeamMonthlyDumpService
    from app.services.notification_service import get_notification_service
    
    databases = ["gitlab_kpi1", "telnetdb"]
    for db_name in databases:
        token = current_db_var.set(db_name)
        db = SessionLocal()
        notification_service = get_notification_service()
        
        try:
            logger.info(f"[Scheduler] Running monthly job for database: {db_name}")
            service = TeamMonthlyDumpService(db)
            result  = await service.run()
            logger.info(f"[Scheduler] Monthly Team-Centric job success for {db_name}: {result}")
            
            # Send monthly report notification
            notification_service.send_monthly_extraction_report(
                period=result.get("period", "Unknown"),
                summary=result
            )
            
        except Exception as e:
            logger.error(f"[Scheduler] Monthly Team-Centric job failed for {db_name}: {e}", exc_info=True)
            
            # Send alert notification
            notification_service.send_scheduler_error_alert(
                error_message=str(e),
                job_name=f"monthly_kpi_job_{db_name}"
            )
            
        finally:
            db.close()
            current_db_var.reset(token)