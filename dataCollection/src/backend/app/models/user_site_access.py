"""
models/user_site_access.py

Table de liaison many-to-many entre AppUser et Site.
Permet à un utilisateur d'avoir accès à plusieurs sites.
"""

from sqlalchemy import Column, Integer, ForeignKey, Boolean, DateTime, Index, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class UserSiteAccess(Base):
    """
    [M2M] Liaison User ↔ Site pour le contrôle d'accès multi-sites.
    
    Permet à un utilisateur (notamment site_manager) d'avoir accès à
    plusieurs sites et de voir les dashboards de tous ces sites.
    """
    __tablename__ = "user_site_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    user_id = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # is_primary: site principal utilisé par défaut
    is_primary = Column(Boolean, default=False, nullable=False)
    
    assigned_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    user = relationship("AppUser", back_populates="site_accesses")
    site = relationship("Site", back_populates="user_accesses")

    # ── Index et contraintes ─────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_usersite_user", "user_id"),
        Index("idx_usersite_site", "site_id"),
        Index("idx_usersite_primary", "user_id", "is_primary"),
        UniqueConstraint("user_id", "site_id", name="uq_usersite_user_site"),
    )
