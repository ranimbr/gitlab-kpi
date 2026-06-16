"""
models/profile_menu_item.py

Modèle ProfileMenuItem pour la liaison entre Profile et MenuItem.
Définit quels menus sont accessibles pour un profil donné.
"""

from sqlalchemy import Column, Integer, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship

from app.models.base import Base


class ProfileMenuItem(Base):
    """
    Liaison entre Profile et MenuItem.
    
    Table d'association many-to-many avec un champ has_access pour
    définir si un profil a accès à un menu spécifique.
    """
    
    __tablename__ = "profile_menu_item"
    
    profile_id = Column(
        Integer,
        ForeignKey("profile.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    menu_item_id = Column(
        Integer,
        ForeignKey("menu_item.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    
    # Indique si le profil a accès à ce menu
    has_access = Column(Boolean, default=False, nullable=False)
    
    # ── Relations ────────────────────────────────────────────────────────────
    profile = relationship(
        "Profile",
        back_populates="menu_items",
    )
    menu_item = relationship(
        "MenuItem",
        back_populates="profile_associations",
    )
    
    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_profilemenu_profile", "profile_id"),
        Index("idx_profilemenu_menu", "menu_item_id"),
        Index("idx_profilemenu_access", "profile_id", "has_access"),
    )
