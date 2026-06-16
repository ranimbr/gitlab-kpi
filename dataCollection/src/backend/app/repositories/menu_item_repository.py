"""
repositories/menu_item_repository.py

Repository pour MenuItem.
"""

from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.menu_item import MenuItem
from app.repositories.base import BaseRepository


class MenuItemRepository(BaseRepository[MenuItem]):
    """Repository pour les opérations CRUD sur MenuItem."""
    
    def __init__(self):
        super().__init__(MenuItem)
    
    def get_tree(self, db: Session) -> List[MenuItem]:
        """
        Récupère tous les menus sous forme d'arbre (avec enfants).
        
        Args:
            db: Session SQLAlchemy
            
        Returns:
            Liste des menus racines (parent_id = NULL) avec leurs enfants chargés
        """
        # Récupérer tous les menus actifs
        all_menus = db.query(MenuItem).filter(
            MenuItem.is_active == True
        ).order_by(MenuItem.order_index).all()
        
        # Construire l'arbre
        menu_map = {menu.id: menu for menu in all_menus}
        root_menus = []
        
        for menu in all_menus:
            if menu.parent_id is None:
                root_menus.append(menu)
            else:
                parent = menu_map.get(menu.parent_id)
                if parent:
                    parent.children.append(menu)
        
        return root_menus
    
    def get_by_route(self, db: Session, route: str) -> Optional[MenuItem]:
        """
        Récupère un menu par sa route.
        
        Args:
            db: Session SQLAlchemy
            route: Route du menu
            
        Returns:
            MenuItem ou None
        """
        return db.query(MenuItem).filter(MenuItem.route == route).first()
    
    def get_active_only(self, db: Session) -> List[MenuItem]:
        """
        Récupère uniquement les menus actifs.
        
        Args:
            db: Session SQLAlchemy
            
        Returns:
            Liste des menus actifs triés par order_index
        """
        return db.query(MenuItem).filter(
            MenuItem.is_active == True
        ).order_by(MenuItem.order_index).all()
