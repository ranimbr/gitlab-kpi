"""
repositories/audit_log_repository.py

CORRECTION : nom de fichier corrigé (audit_log_repositories.py → audit_log_repository.py).
L'ancien nom cassait l'import dans __init__.py silencieusement.

Le journal d'audit est en lecture seule côté API publique.
Les entrées sont créées exclusivement par audit_service.py.
"""

from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from app.models.audit_log import AuditLog
from app.repositories.base import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):

    def __init__(self):
        super().__init__(AuditLog)

    # ─────────────────────────────────────────────────────────────────────────
    # READ
    # ─────────────────────────────────────────────────────────────────────────

    def get_by_user(
        self,
        db:      Session,
        user_id: int,
        limit:   int = 100,
        offset:  int = 0,
    ) -> List[AuditLog]:
        return (
            db.query(AuditLog)
            .filter(AuditLog.user_id == user_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def get_by_entity(
        self,
        db:          Session,
        entity_type: str,
        entity_id:   Optional[int] = None,
        limit:       int = 100,
    ) -> List[AuditLog]:
        q = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == entity_type)
        )
        if entity_id is not None:
            q = q.filter(AuditLog.entity_id == entity_id)
        return q.order_by(AuditLog.created_at.desc()).limit(limit).all()

    def get_by_action(
        self,
        db:     Session,
        action: str,
        limit:  int = 100,
        offset: int = 0,
    ) -> List[AuditLog]:
        return (
            db.query(AuditLog)
            .filter(AuditLog.action == action)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def get_recent(
        self,
        db:     Session,
        limit:  int = 50,
        offset: int = 0,
    ) -> List[AuditLog]:
        """Dernières entrées d'audit — page AuditLogPage admin."""
        return (
            db.query(AuditLog)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def get_filtered(
        self,
        db:             Session,
        user_id:        Optional[int]      = None,
        action:         Optional[str]      = None,
        entity_type:    Optional[str]      = None,
        entity_id:      Optional[int]      = None,
        created_after:  Optional[datetime] = None,
        created_before: Optional[datetime] = None,
        limit:          int = 50,
        offset:         int = 0,
    ) -> List[AuditLog]:
        """Recherche multi-critères avec pagination — pour GET /audit-logs/."""
        q = db.query(AuditLog)

        if user_id is not None:
            q = q.filter(AuditLog.user_id == user_id)
        if action is not None:
            q = q.filter(AuditLog.action == action)
        if entity_type is not None:
            q = q.filter(AuditLog.entity_type == entity_type)
        if entity_id is not None:
            q = q.filter(AuditLog.entity_id == entity_id)
        if created_after is not None:
            q = q.filter(AuditLog.created_at >= created_after)
        if created_before is not None:
            q = q.filter(AuditLog.created_at <= created_before)

        return (
            q.order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def count_filtered(
        self,
        db:          Session,
        user_id:     Optional[int] = None,
        action:      Optional[str] = None,
        entity_type: Optional[str] = None,
    ) -> int:
        """Compte total pour la pagination frontend."""
        from sqlalchemy import func
        q = db.query(func.count(AuditLog.id))
        if user_id is not None:
            q = q.filter(AuditLog.user_id == user_id)
        if action is not None:
            q = q.filter(AuditLog.action == action)
        if entity_type is not None:
            q = q.filter(AuditLog.entity_type == entity_type)
        return q.scalar() or 0

    # ─────────────────────────────────────────────────────────────────────────
    # WRITE
    # ─────────────────────────────────────────────────────────────────────────

    def log(
        self,
        db:          Session,
        user_id:     Optional[int],
        action:      str,
        entity_type: str,
        entity_id:   Optional[int] = None,
        old_value:   Optional[dict] = None,
        new_value:   Optional[dict] = None,
        ip_address:  Optional[str]  = None,
    ) -> AuditLog:
        """
        Crée une entrée d'audit.
        Appelé par audit_service.py après chaque action sensible.
        Pas de flush ici — géré par le service qui appelle commit().
        """
        entry = AuditLog(
            user_id     = user_id,
            action      = action,
            entity_type = entity_type,
            entity_id   = entity_id,
            old_value   = old_value,
            new_value   = new_value,
            ip_address  = ip_address,
        )
        db.add(entry)
        return entry