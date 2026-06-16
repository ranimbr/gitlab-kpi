"""
models/permission.py

Modèle Permission pour la gestion des droits d'accès fonctionnels.
Une permission représente une action spécifique dans le système.
"""

from sqlalchemy import Column, Integer, String, DateTime, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.models.base import Base


class Permission(Base):
    """
    Permission fonctionnelle.
    
    Une permission définit une capacité spécifique (ex: manage_sites, view_all_kpis).
    Les rôles sont associés à plusieurs permissions via RolePermission.
    """
    
    __tablename__ = "permission"
    
    id = Column(Integer, primary_key=True)
    code = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    category = Column(String(100), nullable=True)  # Pour grouper les permissions (ex: 'admin', 'kpi', 'extraction')
    
    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    
    # ── Relations ────────────────────────────────────────────────────────────
    role_permissions = relationship(
        "RolePermission",
        back_populates="permission",
        cascade="all, delete-orphan",
    )
    
    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_permission_code", "code"),
        Index("idx_permission_category", "category"),
    )
