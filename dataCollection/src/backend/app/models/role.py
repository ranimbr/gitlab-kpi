"""
models/role.py

Modèle Role pour la gestion des rôles utilisateurs dynamiques.
Remplace l'enum UserRoleEnum pour permettre la création de rôles personnalisés.
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.models.base import Base


class Role(Base):
    """
    Rôle utilisateur dynamique.
    
    Un rôle définit un ensemble de permissions fonctionnelles.
    Remplace l'enum UserRoleEnum pour plus de flexibilité.
    """
    
    __tablename__ = "role"
    
    id = Column(Integer, primary_key=True)
    code = Column(String(100), unique=True, nullable=False, index=True)  # Pour compatibilité avec l'ancien enum
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)  # True pour les rôles système (Super Admin, etc.)
    is_active = Column(Boolean, default=True, nullable=False)
    
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
    permissions = relationship(
        "RolePermission",
        back_populates="role",
        cascade="all, delete-orphan",
    )
    users = relationship(
        "AppUser",
        back_populates="role_obj",
        foreign_keys="AppUser.role_id",
    )
    
    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_role_code", "code"),
        Index("idx_role_active", "is_active"),
    )
