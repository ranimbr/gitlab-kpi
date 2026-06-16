"""
services/admin/menu_item_service.py

Service pour la gestion des menus de l'application.
"""

from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.menu_item import MenuItem
from app.schemas.menu_item import MenuItemCreate, MenuItemUpdate
from app.repositories.menu_item_repository import MenuItemRepository


class MenuItemService:
    """Service pour la logique métier des menus."""
    
    def __init__(self):
        self.menu_item_repo = MenuItemRepository()
    
    def get_all(self, db: Session) -> List[MenuItem]:
        """Récupère tous les menus."""
        return self.menu_item_repo.get_all(db)
    
    def get_by_id(self, db: Session, menu_item_id: int) -> Optional[MenuItem]:
        """Récupère un menu par son ID."""
        return self.menu_item_repo.get_by_id(db, menu_item_id)
    
    def get_tree(self, db: Session) -> List[MenuItem]:
        """Récupère tous les menus sous forme d'arbre hiérarchique."""
        return self.menu_item_repo.get_tree(db)
    
    def get_active_only(self, db: Session) -> List[MenuItem]:
        """Récupère uniquement les menus actifs."""
        return self.menu_item_repo.get_active_only(db)
    
    def create(self, db: Session, menu_data: MenuItemCreate) -> MenuItem:
        """Crée un nouveau menu."""
        menu = MenuItem(**menu_data.model_dump())
        return self.menu_item_repo.create(db, menu)
    
    def update(self, db: Session, menu_item_id: int, menu_data: MenuItemUpdate) -> Optional[MenuItem]:
        """Met à jour un menu."""
        return self.menu_item_repo.update(db, menu_item_id, menu_data.model_dump(exclude_unset=True))
    
    def delete(self, db: Session, menu_item_id: int) -> bool:
        """Supprime un menu."""
        return self.menu_item_repo.delete(db, menu_item_id)
    
    def get_by_route(self, db: Session, route: str) -> Optional[MenuItem]:
        """Récupère un menu par sa route."""
        return self.menu_item_repo.get_by_route(db, route)
