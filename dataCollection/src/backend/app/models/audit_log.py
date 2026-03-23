"""
models/audit_log.py

Journal de traçabilité des actions sensibles effectuées par les admins.

Obligatoire en contexte grande entreprise pour la conformité,
l'audit et le debugging des extractions.

CORRECTION BUG :
    Index("idx_audit_created_at", AuditLog.created_at) échouait
    silencieusement car created_at est défini sur Base (classe parente),
    pas directement sur AuditLog. La référence au column object hérité
    est instable selon la version SQLAlchemy.
    
    FIX : tous les indexes déplacés dans __table_args__ avec des
    références par NOM DE COLONNE (string) — toujours fiable,
    y compris pour les colonnes héritées (created_at, updated_at).

Actions tracées :
    CREATE_DEVELOPER   | UPDATE_DEVELOPER   | DELETE_DEVELOPER
    CREATE_THRESHOLD   | UPDATE_THRESHOLD
    LAUNCH_EXTRACTION  | CREATE_SITE        | UPDATE_USER_ACCESS
    CLOSE_PERIOD       | CREATE_GITLAB_CONFIG
"""

from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship

from app.models.base import Base


class AuditLog(Base):

    __tablename__ = "audit_log"

    id          = Column(Integer, primary_key=True)
    action      = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)   # ex: "Developer", "KpiThreshold"
    entity_id   = Column(Integer,     nullable=True)    # ID de l'entité modifiée
    old_value   = Column(JSON,        nullable=True)    # État avant modification
    new_value   = Column(JSON,        nullable=True)    # État après modification
    ip_address  = Column(String(45),  nullable=True)    # IPv4 (15 chars) ou IPv6 (45 chars)

    user_id = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,  # nullable : si l'user est supprimé, l'audit reste
    )

    # ── Relations ────────────────────────────────────────────────────────────
    user = relationship(
        "AppUser",
        back_populates="audit_logs",
        foreign_keys=[user_id],
    )

    # ── Index — tous dans __table_args__ avec références STRING ──────────────
    # ✅ FIX : utiliser le nom de colonne en string (pas AuditLog.created_at)
    # pour les colonnes héritées de Base (created_at, updated_at)
    __table_args__ = (
        Index("idx_audit_user",       "user_id"),
        Index("idx_audit_action",     "action"),
        # Index composite : retrouver tous les logs sur une entité donnée
        Index("idx_audit_entity",     "entity_type", "entity_id"),
        # ✅ FIX : "created_at" en string — fonctionne même pour colonnes héritées
        Index("idx_audit_created_at", "created_at"),
        # Index composite pour filtrage temporel par utilisateur
        Index("idx_audit_user_date",  "user_id", "created_at"),
    )