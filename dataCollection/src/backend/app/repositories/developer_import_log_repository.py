"""
repositories/developer_import_log_repository.py

"""
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.developer_import_log import DeveloperImportLog, ImportStatusEnum
from app.repositories.base import BaseRepository
from app.database.session import get_auth_session


class DeveloperImportLogRepository(BaseRepository[DeveloperImportLog]):

    def __init__(self):
        super().__init__(DeveloperImportLog)

    # ── READ ──────────────────────────────────────────────────────────────────

    def get_by_user(
        self,
        db:      Session,  # Gardé pour compatibilité, mais non utilisé
        user_id: int,
        limit:   int = 50,
        offset:  int = 0,
    ) -> List[DeveloperImportLog]:
        """Historique des imports d'un administrateur."""
        auth_db = get_auth_session()
        try:
            return (
                auth_db.query(DeveloperImportLog)
                .filter(DeveloperImportLog.imported_by == user_id)
                .order_by(DeveloperImportLog.created_at.desc())
                .limit(limit)
                .offset(offset)
                .all()
            )
        finally:
            auth_db.close()

    def get_recent(
        self,
        db:     Session,  # Gardé pour compatibilité, mais non utilisé
        limit:  int = 20,
        offset: int = 0,
    ) -> List[DeveloperImportLog]:
        """Derniers imports — page admin."""
        auth_db = get_auth_session()
        try:
            return (
                auth_db.query(DeveloperImportLog)
                .order_by(DeveloperImportLog.created_at.desc())
                .limit(limit)
                .offset(offset)
                .all()
            )
        finally:
            auth_db.close()

    def get_by_status(
        self,
        db:     Session,  # Gardé pour compatibilité, mais non utilisé
        status: ImportStatusEnum,
    ) -> List[DeveloperImportLog]:
        auth_db = get_auth_session()
        try:
            return (
                auth_db.query(DeveloperImportLog)
                .filter(DeveloperImportLog.status == status)
                .order_by(DeveloperImportLog.created_at.desc())
                .all()
            )
        finally:
            auth_db.close()

    def get_pending(self, db: Session) -> List[DeveloperImportLog]:
        return self.get_by_status(db, ImportStatusEnum.pending)

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def create_log(
        self,
        db:              Session,  # Gardé pour compatibilité, mais non utilisé
        file_name:       str,
        imported_by:     Optional[int],
        target_database: str,  # ✅ AJOUT: Base de données cible
        file_type:       Optional[str] = None,
    ) -> int:  # ✅ FIX: Retourner l'ID au lieu de l'objet détaché
        """Crée un log d'import en statut 'pending' dans auth_db et retourne son ID."""
        auth_db = get_auth_session()
        try:
            log = DeveloperImportLog(
                file_name       = file_name,
                file_type       = file_type,
                imported_by     = imported_by,
                target_database = target_database,  # ✅ AJOUT
                status          = ImportStatusEnum.pending,
                total_rows      = 0,
            )
            auth_db.add(log)
            auth_db.flush()
            auth_db.commit()
            log_id = log.id  # ✅ Récupérer l'ID avant la fermeture de session
            return log_id
        except Exception:
            auth_db.rollback()
            raise
        finally:
            auth_db.close()

    def update_status(
        self,
        db:     Session,
        log:    DeveloperImportLog,
        status: ImportStatusEnum,
    ) -> DeveloperImportLog:
        auth_db = get_auth_session()
        try:
            log_from_db = auth_db.query(DeveloperImportLog).filter(DeveloperImportLog.id == log.id).first()
            if log_from_db:
                log_from_db.status = status
                auth_db.flush()
                auth_db.commit()
                return log_from_db
            return log
        except Exception:
            auth_db.rollback()
            raise
        finally:
            auth_db.close()

    def complete(
        self,
        db:              Session,
        log_id:          int,  # ✅ FIX: Accepter log_id au lieu de l'objet détaché
        total_rows:      int,
        success_count:   int,
        error_count:     int,
        duplicate_count: int,
        report_data:     Optional[dict] = None,
    ) -> DeveloperImportLog:
        """Met à jour le log après traitement complet."""
        auth_db = get_auth_session()
        try:
            log_from_db = auth_db.query(DeveloperImportLog).filter(DeveloperImportLog.id == log_id).first()
            if log_from_db:
                log_from_db.status          = ImportStatusEnum.completed
                log_from_db.total_rows      = total_rows
                log_from_db.success_count   = success_count
                log_from_db.error_count     = error_count
                log_from_db.duplicate_count = duplicate_count
                log_from_db.report_data     = report_data
                auth_db.flush()
                auth_db.commit()
                return log_from_db
            return None
        except Exception:
            auth_db.rollback()
            raise
        finally:
            auth_db.close()

    def fail(
        self,
        db:            Session,
        log_id:         int,  # ✅ FIX: Accepter log_id au lieu de l'objet détaché
        error_message: str,
    ) -> DeveloperImportLog:
        auth_db = get_auth_session()
        try:
            log_from_db = auth_db.query(DeveloperImportLog).filter(DeveloperImportLog.id == log_id).first()
            if log_from_db:
                log_from_db.status        = ImportStatusEnum.failed
                log_from_db.error_message = error_message
                auth_db.flush()
                auth_db.commit()
                return log_from_db
            return None
        except Exception:
            auth_db.rollback()
            raise
        finally:
            auth_db.close()