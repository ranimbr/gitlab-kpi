"""
repositories/developer_import_log_repository.py

"""
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.developer_import_log import DeveloperImportLog, ImportStatusEnum
from app.repositories.base import BaseRepository


class DeveloperImportLogRepository(BaseRepository[DeveloperImportLog]):

    def __init__(self):
        super().__init__(DeveloperImportLog)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_by_user(
        self,
        db:      Session,
        user_id: int,
        limit:   int = 50,
        offset:  int = 0,
    ) -> List[DeveloperImportLog]:
        """Historique des imports d'un administrateur."""
        return (
            db.query(DeveloperImportLog)
            .filter(DeveloperImportLog.imported_by == user_id)
            .order_by(DeveloperImportLog.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def get_recent(
        self,
        db:     Session,
        limit:  int = 20,
        offset: int = 0,
    ) -> List[DeveloperImportLog]:
        """Derniers imports — page admin."""
        return (
            db.query(DeveloperImportLog)
            .order_by(DeveloperImportLog.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def get_by_status(
        self,
        db:     Session,
        status: ImportStatusEnum,
    ) -> List[DeveloperImportLog]:
        return (
            db.query(DeveloperImportLog)
            .filter(DeveloperImportLog.status == status)
            .order_by(DeveloperImportLog.created_at.desc())
            .all()
        )

    def get_pending(self, db: Session) -> List[DeveloperImportLog]:
        return self.get_by_status(db, ImportStatusEnum.pending)

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def create_log(
        self,
        db:          Session,
        file_name:   str,
        imported_by: Optional[int],
        file_type:   Optional[str] = None,
    ) -> DeveloperImportLog:
        """Crée un log d'import en statut 'pending'."""
        log = DeveloperImportLog(
            file_name   = file_name,
            file_type   = file_type,
            imported_by = imported_by,
            status      = ImportStatusEnum.pending,
            total_rows  = 0,
        )
        db.add(log)
        db.flush()
        return log

    def update_status(
        self,
        db:     Session,
        log:    DeveloperImportLog,
        status: ImportStatusEnum,
    ) -> DeveloperImportLog:
        log.status = status
        db.flush()
        return log

    def complete(
        self,
        db:              Session,
        log:             DeveloperImportLog,
        total_rows:      int,
        success_count:   int,
        error_count:     int,
        duplicate_count: int,
        report_data:     Optional[dict] = None,
    ) -> DeveloperImportLog:
        """Met à jour le log après traitement complet."""
        log.status          = ImportStatusEnum.completed
        log.total_rows      = total_rows
        log.success_count   = success_count
        log.error_count     = error_count
        log.duplicate_count = duplicate_count
        log.report_data     = report_data
        db.flush()
        return log

    def fail(
        self,
        db:            Session,
        log:           DeveloperImportLog,
        error_message: str,
    ) -> DeveloperImportLog:
        log.status        = ImportStatusEnum.failed
        log.error_message = error_message
        db.flush()
        return log