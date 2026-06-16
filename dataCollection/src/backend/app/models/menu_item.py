"""
models/menu_item.py

Modèle MenuItem pour la gestion des menus de l'application.
Un menu item représente un élément de navigation (menu ou sous-menu).
"""

from sqlalchemy import Column, Integer, String, ForeignKey, Index, Boolean
from sqlalchemy.orm import relationship

from app.models.base import Base


class MenuItem(Base):
    """
    Élément de menu de l'application.
    
    Un menu item peut être :
    - Un menu principal (parent_id = NULL)
    - Un sous-menu (parent_id renseigné)
    
    Structure hiérarchique pour l'interface admin de gestion des profils.
    """
    
    __tablename__ = "menu_item"
    
    id = Column(Integer, primary_key=True)
    label = Column(String(100), nullable=False, index=True)
    route = Column(String(255), nullable=True, index=True)
    icon = Column(String(50), nullable=True)  # Nom de l'icône (ex: "Dashboard", "Users")
    
    # Hiérarchie
    parent_id = Column(
        Integer,
        ForeignKey("menu_item.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    
    # Ordre d'affichage
    order_index = Column(Integer, default=0, nullable=False)
    
    # Active/inactive (pour désactiver un menu sans le supprimer)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # ── Relations ────────────────────────────────────────────────────────────
    # Self-relation pour la hiérarchie parent/enfant
    children = relationship(
        "MenuItem",
        back_populates="parent",
        cascade="all, delete-orphan",
        foreign_keys=[parent_id],
    )
    parent = relationship(
        "MenuItem",
        back_populates="children",
        remote_side=[id],
    )
    
    # Relations avec les profils
    profile_associations = relationship(
        "ProfileMenuItem",
        back_populates="menu_item",
        cascade="all, delete-orphan",
    )
    
    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_menuitem_label", "label"),
        Index("idx_menuitem_route", "route"),
        Index("idx_menuitem_parent", "parent_id"),
        Index("idx_menuitem_order", "order_index"),
    )
