"""
Retry Service - Enterprise-grade retry mechanism for failed extractions

Implements:
- Exponential backoff retry strategy
- Configurable retry limits and delays
- Automatic retry scheduling
- Notification escalation after max retries
"""
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.project_repository import ProjectRepository
from app.services.extraction.extraction_service import ExtractionService
from app.services.notification_service import get_notification_service

logger = logging.getLogger(__name__)
settings = get_settings()


class RetryService:
    """
    Enterprise retry service for failed extractions.
    
    Features:
    - Exponential backoff: 1min, 5min, 25min, 2h, 10h
    - Configurable max retries (default: 3)
    - Automatic retry scheduling
    - Notification escalation after max retries
    """

    def __init__(self):
        self.max_retries = getattr(settings, "EXTRACTION_MAX_RETRIES", 3)
        self.retry_delays = getattr(settings, "EXTRACTION_RETRY_DELAYS", [60, 300, 1500, 7200, 36000])  # seconds
        self.extraction_service = ExtractionService()
        self.notification_service = get_notification_service()

    async def schedule_retry(
        self,
        db: Session,
        lot_id: int,
        delay_seconds: Optional[int] = None
    ) -> bool:
        """
        Schedule a retry for a failed extraction lot.
        
        Args:
            db: Database session
            lot_id: ID of the failed extraction lot
            delay_seconds: Custom delay (uses default if not provided)
            
        Returns:
            bool: True if retry scheduled successfully
        """
        try:
            lot_repo = ExtractionLotRepository()
            lot = lot_repo.get_by_id(db, lot_id)
            
            if not lot:
                logger.error(f"[Retry] Lot {lot_id} not found")
                return False
            
            if lot.status != ExtractionStatusEnum.failed:
                logger.warning(f"[Retry] Lot {lot_id} is not in failed state (status: {lot.status})")
                return False
            
            # Check retry count
            retry_count = lot.retry_count or 0
            if retry_count >= self.max_retries:
                logger.warning(f"[Retry] Lot {lot_id} has reached max retries ({self.max_retries})")
                
                # Send escalation notification
                await self._send_retry_escalation(db, lot)
                return False
            
            # Calculate delay
            if delay_seconds is None:
                delay_index = min(retry_count, len(self.retry_delays) - 1)
                delay_seconds = self.retry_delays[delay_index]
            
            # Update lot with retry info
            lot.retry_count = retry_count + 1
            lot.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
            lot.status = ExtractionStatusEnum.pending  # Use existing status instead of non-existent pending_retry
            db.commit()
            
            logger.info(
                f"[Retry] Scheduled retry #{retry_count + 1} for lot {lot_id} "
                f"in {delay_seconds}s ({timedelta(seconds=delay_seconds)})"
            )
            
            # Schedule the actual retry (in production, this would use a proper job queue)
            # For now, we'll use asyncio.sleep for demonstration
            asyncio.create_task(self._execute_retry_after_delay(db, lot_id, delay_seconds))
            
            return True
            
        except Exception as e:
            logger.error(f"[Retry] Failed to schedule retry for lot {lot_id}: {e}", exc_info=True)
            db.rollback()
            return False

    async def _execute_retry_after_delay(
        self,
        db: Session,
        lot_id: int,
        delay_seconds: int
    ) -> None:
        """
        Execute retry after delay (async wrapper).
        
        Args:
            db: Database session
            lot_id: ID of the extraction lot
            delay_seconds: Delay before retry
        """
        try:
            await asyncio.sleep(delay_seconds)
            
            # Get fresh session and lot
            from app.database.session import SessionLocal
            db_retry = SessionLocal()
            
            try:
                lot_repo = ExtractionLotRepository()
                lot = lot_repo.get_by_id(db_retry, lot_id)
                
                if not lot or lot.status != ExtractionStatusEnum.pending:
                    logger.warning(f"[Retry] Lot {lot_id} no longer pending retry, skipping")
                    return
                
                # Execute the retry
                success = await self._execute_retry(db_retry, lot)
                
                if success:
                    logger.info(f"[Retry] Retry successful for lot {lot_id}")
                else:
                    logger.error(f"[Retry] Retry failed for lot {lot_id}")
                    
            finally:
                db_retry.close()
                
        except Exception as e:
            logger.error(f"[Retry] Error in delayed retry execution: {e}", exc_info=True)

    async def _execute_retry(
        self,
        db: Session,
        lot: ExtractionLot
    ) -> bool:
        """
        Execute the actual retry extraction.
        
        Args:
            db: Database session
            lot: Extraction lot to retry
            
        Returns:
            bool: True if retry successful
        """
        try:
            # Get project and config
            project_repo = ProjectRepository()
            project = project_repo.get_by_id(db, lot.project_id)
            
            if not project:
                logger.error(f"[Retry] Project {lot.project_id} not found")
                return False
            
            config_repo = GitLabConfigRepository()
            gitlab_config = config_repo.get_by_id(db, project.gitlab_config_id)
            
            if not gitlab_config:
                logger.error(f"[Retry] GitLab config not found for project {lot.project_id}")
                return False
            
            # Reset lot status to running
            lot.status = ExtractionStatusEnum.running
            lot.error_message = None
            db.commit()
            
            # Execute extraction with backfill=True
            result = await self.extraction_service.run_monthly_extraction(
                db=db,
                project_id=lot.project_id,
                period_id=lot.period_id,
                gitlab_config=gitlab_config,
                is_backfill=True
            )
            
            logger.info(f"[Retry] Retry extraction completed for lot {lot.id}")
            return True
            
        except Exception as e:
            logger.error(f"[Retry] Retry execution failed for lot {lot.id}: {e}", exc_info=True)
            
            # Update lot with error
            lot.status = ExtractionStatusEnum.failed
            lot.error_message = f"Retry failed: {str(e)[:500]}"
            db.commit()
            
            return False

    async def _send_retry_escalation(
        self,
        db: Session,
        lot: ExtractionLot
    ) -> None:
        """
        Send escalation notification when max retries reached.
        
        Args:
            db: Database session
            lot: Extraction lot that failed all retries
        """
        try:
            project_repo = ProjectRepository()
            project = project_repo.get_by_id(db, lot.project_id)
            
            project_name = project.name if project else f"Project {lot.project_id}"
            
            self.notification_service.send_extraction_failure_alert(
                project_name=project_name,
                period=f"{lot.period.year}/{lot.period.month:02d}",
                error_message=f"Extraction failed after {self.max_retries} retries. Last error: {lot.error_message}",
                extraction_lot_id=lot.id
            )
            
            logger.info(f"[Retry] Escalation notification sent for lot {lot.id}")
            
        except Exception as e:
            logger.error(f"[Retry] Failed to send escalation notification: {e}", exc_info=True)

    async def check_and_retry_failed_extractions(self, db: Session) -> Dict[str, Any]:
        """
        Check for failed extractions and schedule retries.
        
        This should be called periodically (e.g., every hour) to process
        failed extractions that are ready for retry.
        
        Args:
            db: Database session
            
        Returns:
            Dict with retry statistics
        """
        try:
            lot_repo = ExtractionLotRepository()
            
            # Get failed lots that haven't reached max retries
            # Use get_by_status instead of non-existent get_failed_lots
            failed_lots = lot_repo.get_by_status(db, status="failed")[:50]
            
            stats = {
                "checked": len(failed_lots),
                "scheduled": 0,
                "skipped": 0,
                "errors": 0
            }
            
            now = datetime.now(timezone.utc)
            
            for lot in failed_lots:
                try:
                    # Check if lot is ready for retry
                    if lot.next_retry_at and lot.next_retry_at > now:
                        stats["skipped"] += 1
                        continue
                    
                    # Check retry count
                    retry_count = lot.retry_count or 0
                    if retry_count >= self.max_retries:
                        stats["skipped"] += 1
                        continue
                    
                    # Schedule retry
                    success = await self.schedule_retry(db, lot.id)
                    
                    if success:
                        stats["scheduled"] += 1
                    else:
                        stats["errors"] += 1
                        
                except Exception as e:
                    logger.error(f"[Retry] Error processing lot {lot.id}: {e}", exc_info=True)
                    stats["errors"] += 1
            
            logger.info(f"[Retry] Check completed: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"[Retry] Failed to check and retry failed extractions: {e}", exc_info=True)
            return {
                "checked": 0,
                "scheduled": 0,
                "skipped": 0,
                "errors": 1
            }


# Singleton instance
_retry_service: Optional[RetryService] = None


def get_retry_service() -> RetryService:
    """Get or create retry service singleton."""
    global _retry_service
    if _retry_service is None:
        _retry_service = RetryService()
    return _retry_service
