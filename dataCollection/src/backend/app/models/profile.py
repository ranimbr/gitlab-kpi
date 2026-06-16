"""
models/profile.py

Modèle Profile pour la gestion des profils d'accès aux menus.
Un profil définit quels menus sont accessibles à un utilisateur.
"""

from sqlalchemy import Column, Integer, String, DateTime, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.models.base import Base


class Profile(Base):
    """
    Profil d'accès aux menus.
    
    Un profil définit un ensemble de droits d'accès aux menus de l'application.
    Les utilisateurs sont associés à un profil via AppUser.profile_id.
    """
    
    __tablename__ = "profile"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(500), nullable=True)
    
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
    menu_items = relationship(
        "ProfileMenuItem",
        back_populates="profile",
        cascade="all, delete-orphan",
    )
    
    users = relationship(
        "AppUser",
        back_populates="profile",
        foreign_keys="AppUser.profile_id",
    )
    
    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_profile_name", "name"),
    )
