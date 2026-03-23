"""
services/admin/audit_service.py

CORRECTION — get_filtered() :
    AVANT : appliquait UN SEUL filtre à la fois (if/elif) → si user_id ET action
    étaient fournis, seul user_id était utilisé → résultats incorrects.

    APRÈS : délègue à AuditLogRepository.get_filtered() qui combine TOUS les
    filtres avec AND. Supporte aussi la pagination (page/limit).
"""
import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.audit_log import AuditLogFilterParams

logger = logging.getLogger(__name__)


class AuditService:

    def __init__(self):
        self.audit_repo = AuditLogRepository()

    def get_recent(self, db: Session, limit: int = 50, offset: int = 0) -> List[AuditLog]:
        return self.audit_repo.get_recent(db, limit=limit, offset=offset)

    def get_by_user(
        self, db: Session, user_id: int, limit: int = 100, offset: int = 0,
    ) -> List[AuditLog]:
        return self.audit_repo.get_by_user(db, user_id, limit=limit, offset=offset)

    def get_filtered(
        self,
        db:      Session,
        filters: AuditLogFilterParams,
    ) -> List[AuditLog]:
        """
        ✅ FIX : délègue au repo qui combine TOUS les filtres avec AND.
        Support pagination via filters.page et filters.limit.
        """
        offset = (filters.page - 1) * filters.limit

        return self.audit_repo.get_filtered(
            db             = db,
            user_id        = filters.user_id,
            action         = filters.action,
            entity_type    = filters.entity_type,
            entity_id      = filters.entity_id,
            created_after  = filters.created_after,
            created_before = filters.created_before,
            limit          = filters.limit,
            offset         = offset,
        )

    def count_filtered(
        self,
        db:      Session,
        filters: AuditLogFilterParams,
    ) -> int:
        """Compte total pour la pagination frontend."""
        return self.audit_repo.count_filtered(
            db          = db,
            user_id     = filters.user_id,
            action      = filters.action,
            entity_type = filters.entity_type,
        )