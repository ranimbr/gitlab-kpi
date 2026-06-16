"""
Admin Scheduler API Router

Provides endpoints for:
- Scheduler status monitoring
- Manual extraction triggers
- Scheduler pause/resume control
- Execution history
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.core.config import get_settings
from app.services.scheduler.team_monthly_dump_service import TeamMonthlyDumpService
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.period_repository import PeriodRepository
from app.services.notification_service import get_notification_service

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/admin/scheduler", tags=["Admin Scheduler"])


@router.get("/status")
async def get_scheduler_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get current scheduler status and next scheduled run.
    
    Returns:
        - enabled: Whether scheduler is enabled
        - running: Whether scheduler is currently running
        - next_run: Next scheduled execution time
        - last_run: Last successful execution
        - recent_extractions: Recent extraction lots
    """
    try:
        # Check if scheduler is enabled in config
        enabled = settings.SCHEDULER_ENABLED
        
        # Get recent extraction lots for history (using available methods)
        lot_repo = ExtractionLotRepository()
        # Use get_by_status to get recent lots, ordered by created_at desc
        recent_lots = lot_repo.get_by_status(db, status="completed")[:10]
        
        # Get current period info (using correct method name)
        period_repo = PeriodRepository()
        current_period = period_repo.get_current_period(db)
        
        # Calculate next run (last day of current month at 20:00 UTC)
        now = datetime.now(timezone.utc)
        if now.month == 12:
            next_run = datetime(now.year + 1, 1, 31, 20, 0, 0, tzinfo=timezone.utc)
        else:
            # Last day of current month
            import calendar
            last_day = calendar.monthrange(now.year, now.month)[1]
            next_run = datetime(now.year, now.month, last_day, 20, 0, 0, tzinfo=timezone.utc)
        
        return {
            "enabled": enabled,
            "running": enabled,  # Simplified - would need actual scheduler instance check
            "next_run": next_run.isoformat() if enabled else None,
            "current_period": {
                "year": current_period.year if current_period else None,
                "month": current_period.month if current_period else None,
                "status": current_period.status if current_period else None
            } if current_period else None,
            "recent_extractions": [
                {
                    "id": lot.id,
                    "project_id": lot.project_id,
                    "period_id": lot.period_id,
                    "status": lot.status,
                    "created_at": lot.created_at.isoformat() if lot.created_at else None,
                    "completed_at": lot.completed_at.isoformat() if lot.completed_at else None,
                    "items_count": lot.items_count,
                    "error_message": lot.error_message
                }
                for lot in recent_lots
            ]
        }
        
    except Exception as e:
        logger.error(f"[Admin Scheduler] Failed to get status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get scheduler status: {str(e)}"
        )


@router.post("/trigger")
async def trigger_manual_extraction(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Manually trigger monthly extraction for a specific period.
    
    If no year/month provided, uses current period.
    This is useful for:
    - Re-running failed extractions
    - Testing extraction process
    - Backfilling missing data
    
    Args:
        year: Target year (default: current year)
        month: Target month (default: current month)
        
    Returns:
        Extraction result summary
    """
    try:
        now = datetime.now(timezone.utc)
        target_year = year or now.year
        target_month = month or now.month
        
        logger.info(f"[Admin Scheduler] Manual extraction triggered for {target_year}/{target_month:02d}")
        
        service = TeamMonthlyDumpService(db)
        result = await service.run()
        
        # Send notification for manual trigger
        notification_service = get_notification_service()
        notification_service.send_monthly_extraction_report(
            period=f"{target_year}/{target_month:02d}",
            summary=result
        )
        
        return {
            "success": True,
            "message": f"Manual extraction completed for {target_year}/{target_month:02d}",
            "result": result
        }
        
    except Exception as e:
        logger.error(f"[Admin Scheduler] Manual extraction failed: {e}", exc_info=True)
        
        # Send alert for manual trigger failure
        notification_service = get_notification_service()
        notification_service.send_scheduler_error_alert(
            error_message=str(e),
            job_name="manual_extraction_trigger"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Manual extraction failed: {str(e)}"
        )


@router.get("/history")
async def get_extraction_history(
    limit: int = 20,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get extraction history with filtering options.

    Args:
        limit: Maximum number of records to return (default: 20)

    Returns:
        List of extraction lots with details including developer and period info
    """
    try:
        lot_repo = ExtractionLotRepository()
        # Get all lots (not just completed) to show full history including failures
        # Direct query since get_by_status requires a specific status
        from app.models.extraction_lot import ExtractionLot
        lots = db.query(ExtractionLot).order_by(ExtractionLot.created_at.desc()).limit(limit).all()

        # Fetch related data
        from app.models.developer import Developer
        from app.models.period import Period
        from app.models.app_user import AppUser
        from app.models.commit import Commit
        from app.models.merge_request import MergeRequest

        developer_ids = {lot.developer_id for lot in lots if lot.developer_id}
        period_ids = {lot.period_id for lot in lots if lot.period_id}
        user_ids = {lot.triggered_by for lot in lots if lot.triggered_by}

        developers = db.query(Developer).filter(Developer.id.in_(developer_ids)).all() if developer_ids else []
        period_data = db.query(Period).filter(Period.id.in_(period_ids)).all() if period_ids else []
        users = db.query(AppUser).filter(AppUser.id.in_(user_ids)).all() if user_ids else []

        developer_map = {d.id: d.name for d in developers}
        period_map = {p.id: f"{p.year}/{p.month:02d}" for p in period_data}
        user_map = {u.id: u.email for u in users}

        # [ENTERPRISE SOLUTION] Use certified mission logic for consistency
        # Display only developers certified for the mission (same logic as extraction)
        from app.utils.mission_utils import get_certified_developers_for_mission
        lot_developers_map = {}
        for lot in lots:
            # Get certified developers for this project/period (mission-based targeting)
            certified_ids = set(get_certified_developers_for_mission(
                db=db,
                project_id=lot.project_id,
                period_id=lot.period_id
            ))
            
            # Query commits for this lot to find actual contributors
            commit_devs = db.query(Commit.developer_id).filter(
                Commit.extraction_lot_id == lot.id,
                Commit.developer_id.isnot(None)
            ).distinct().all()
            
            # Query MRs for this lot
            mr_devs = db.query(MergeRequest.developer_id).filter(
                MergeRequest.extraction_lot_id == lot.id,
                MergeRequest.developer_id.isnot(None)
            ).distinct().all()
            
            # Combine and filter by certified mission
            all_contributor_ids = set(d[0] for d in commit_devs + mr_devs)
            certified_contributor_ids = all_contributor_ids & certified_ids
            
            # Fetch developer names (only certified contributors)
            if certified_contributor_ids:
                lot_devs = db.query(Developer).filter(Developer.id.in_(certified_contributor_ids)).all()
                lot_developers_map[lot.id] = [d.name for d in lot_devs]
            else:
                lot_developers_map[lot.id] = []

        # Log for debugging
        logger.info(f"[Admin Scheduler] Found {len(lots)} extraction lots")
        for lot in lots:
            logger.info(f"  Lot {lot.id}: project_id={lot.project_id}, developer_id={lot.developer_id}, created_at={lot.created_at}")

        return {
            "count": len(lots),
            "extractions": [
                {
                    "id": lot.id,
                    "extraction_type": lot.extraction_type,
                    "status": lot.status,
                    "period_id": lot.period_id,
                    "period": period_map.get(lot.period_id),
                    "project_id": lot.project_id,
                    "developer_id": lot.developer_id,
                    "developer_name": developer_map.get(lot.developer_id),
                    "targeted_developers": lot_developers_map.get(lot.id, []),
                    "triggered_by": user_map.get(lot.triggered_by),
                    "is_manual": lot.triggered_by is not None,
                    "created_at": lot.created_at.isoformat() if lot.created_at else None,
                    "completed_at": lot.completed_at.isoformat() if lot.completed_at else None,
                    "items_count": lot.items_count,
                    "duration_ms": lot.duration_ms,
                    "api_calls_count": lot.api_calls_count,
                    "error_message": lot.error_message,
                    "metadata_summary": lot.metadata_summary
                }
                for lot in lots
            ]
        }

    except Exception as e:
        logger.error(f"[Admin Scheduler] Failed to get history: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get extraction history: {str(e)}"
        )


@router.get("/periods")
async def get_periods(
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get all periods with their status.
    
    Returns:
        List of periods with extraction status
    """
    try:
        period_repo = PeriodRepository()
        periods = period_repo.get_all(db)
        
        lot_repo = ExtractionLotRepository()
        
        periods_with_status = []
        for period in periods:
            # Count extractions for this period using available methods
            # Since get_by_period doesn't exist, we'll use a query approach
            from app.models.extraction_lot import ExtractionLot
            lots = db.query(ExtractionLot).filter(
                ExtractionLot.period_id == period.id
            ).order_by(ExtractionLot.created_at.desc()).all()
            
            periods_with_status.append({
                "id": period.id,
                "year": period.year,
                "month": period.month,
                "status": period.status,
                "extraction_count": len(lots),
                "last_extraction": lots[0].created_at.isoformat() if lots else None
            })
        
        return {
            "count": len(periods_with_status),
            "periods": periods_with_status
        }
        
    except Exception as e:
        logger.error(f"[Admin Scheduler] Failed to get periods: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get periods: {str(e)}"
        )


@router.post("/period/{period_id}/close")
async def close_period(
    period_id: int,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Manually close a period.
    
    This prevents further extractions for this period.
    Use with caution - this is typically done automatically by the scheduler.
    
    Args:
        period_id: ID of the period to close
        
    Returns:
        Success message
    """
    try:
        period_repo = PeriodRepository()
        period = period_repo.get_by_id(db, period_id)
        
        if not period:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Period {period_id} not found"
            )
        
        if period.status == "closed":
            return {
                "success": True,
                "message": f"Period {period_id} is already closed"
            }
        
        period_repo.close_period(db, period)
        db.commit()
        
        logger.info(f"[Admin Scheduler] Period {period_id} manually closed")
        
        return {
            "success": True,
            "message": f"Period {period_id} closed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin Scheduler] Failed to close period: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to close period: {str(e)}"
        )


@router.post("/period/{period_id}/open")
async def open_period(
    period_id: int,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Manually open a closed period.
    
    This allows extractions for this period again.
    Use with caution - this should only be done for corrections.
    
    Args:
        period_id: ID of the period to open
        
    Returns:
        Success message
    """
    try:
        period_repo = PeriodRepository()
        period = period_repo.get_by_id(db, period_id)
        
        if not period:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Period {period_id} not found"
            )
        
        if period.status == "open":
            return {
                "success": True,
                "message": f"Period {period_id} is already open"
            }
        
        period_repo.open_period(db, period)
        db.commit()
        
        logger.info(f"[Admin Scheduler] Period {period_id} manually opened")
        
        return {
            "success": True,
            "message": f"Period {period_id} opened successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin Scheduler] Failed to open period: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to open period: {str(e)}"
        )
