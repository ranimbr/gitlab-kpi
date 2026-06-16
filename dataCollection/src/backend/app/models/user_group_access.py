"""
models/user_group_access.py

Table de liaison many-to-many entre AppUser et DeveloperGroup.
Permet à un utilisateur d'avoir accès à plusieurs équipes.
"""

from sqlalchemy import Column, Integer, ForeignKey, Boolean, DateTime, Index, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class UserGroupAccess(Base):
    """
    [M2M] Liaison User ↔ DeveloperGroup pour le contrôle d'accès multi-équipes.
    
    Permet à un utilisateur (notamment team_lead) d'avoir accès à
    plusieurs équipes et de voir les dashboards des projets de toutes ces équipes.
    """
    __tablename__ = "user_group_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    user_id = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    group_id = Column(
        Integer,
        ForeignKey("developer_group.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # is_primary: équipe principale utilisée par défaut
    is_primary = Column(Boolean, default=False, nullable=False)
    
    assigned_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    user = relationship("AppUser", back_populates="group_accesses")
    group = relationship("DeveloperGroup", back_populates="user_accesses")

    # ── Index et contraintes ─────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_usergroup_user", "user_id"),
        Index("idx_usergroup_group", "group_id"),
        Index("idx_usergroup_primary", "user_id", "is_primary"),
        UniqueConstraint("user_id", "group_id", name="uq_usergroup_user_group"),
    )
