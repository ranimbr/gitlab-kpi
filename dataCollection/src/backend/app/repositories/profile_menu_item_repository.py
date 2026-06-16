"""
repositories/profile_menu_item_repository.py

Repository pour ProfileMenuItem.
"""

from typing import List
from sqlalchemy.orm import Session

from app.models.profile_menu_item import ProfileMenuItem
from app.repositories.base import BaseRepository


class ProfileMenuItemRepository(BaseRepository[ProfileMenuItem]):
    """Repository pour les opérations CRUD sur ProfileMenuItem."""
    
    def __init__(self):
        super().__init__(ProfileMenuItem)
    
    def get_accessible_menu_ids(self, db: Session, profile_id: int) -> List[int]:
        """
        Récupère les IDs des menus accessibles pour un profil.
        
        Args:
            db: Session SQLAlchemy
            profile_id: ID du profil
            
        Returns:
            Liste des IDs des menus accessibles
        """
        access_records = db.query(ProfileMenuItem).filter(
            ProfileMenuItem.profile_id == profile_id,
            ProfileMenuItem.has_access == True
        ).all()
        
        return [record.menu_item_id for record in access_records]
