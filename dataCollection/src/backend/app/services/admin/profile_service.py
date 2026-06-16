"""
services/admin/profile_service.py

Service pour la gestion des profils d'accès aux menus.
"""

from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.models.menu_item import MenuItem
from app.schemas.profile import ProfileCreate, ProfileUpdate
from app.repositories.profile_repository import ProfileRepository
from app.repositories.menu_item_repository import MenuItemRepository


class ProfileService:
    """Service pour la logique métier des profils."""
    
    def __init__(self):
        self.profile_repo = ProfileRepository()
        self.menu_item_repo = MenuItemRepository()
    
    def get_all(self, db: Session) -> List[Profile]:
        """Récupère tous les profils."""
        return self.profile_repo.get_all(db)
    
    def get_by_id(self, db: Session, profile_id: int) -> Optional[Profile]:
        """Récupère un profil par son ID."""
        return self.profile_repo.get_by_id(db, profile_id)
    
    def create(self, db: Session, profile_data: ProfileCreate) -> Profile:
        """Crée un nouveau profil."""
        profile_dict = profile_data.model_dump()
        return self.profile_repo.create(db, profile_dict)
    
    def update(self, db: Session, profile_id: int, profile_data: ProfileUpdate) -> Optional[Profile]:
        """Met à jour un profil."""
        return self.profile_repo.update(db, profile_id, profile_data.model_dump(exclude_unset=True))
    
    def delete(self, db: Session, profile_id: int) -> bool:
        """Supprime un profil."""
        return self.profile_repo.delete(db, profile_id)
    
    def get_menu_items_with_access(self, db: Session, profile_id: int) -> List[dict]:
        """
        Récupère tous les menus avec leur statut d'accès pour un profil.
        
        Returns:
            Liste de {menu_item, has_access}
        """
        return self.profile_repo.get_menu_items_with_access(db, profile_id)
    
    def update_menu_access(self, db: Session, profile_id: int, menu_item_id: int, has_access: bool):
        """Met à jour l'accès d'un profil à un menu."""
        self.profile_repo.update_menu_access(db, profile_id, menu_item_id, has_access)
    
    def batch_update_menu_access(self, db: Session, profile_id: int, menu_access_list: List[dict]):
        """
        Met à jour les accès d'un profil en lot.
        
        Le profil "Super Admin" ne peut pas être modifié car il a accès à tous les menus par définition.
        
        Raises:
            ValueError: Si on tente de modifier les accès du profil Super Admin
        """
        # Vérifier si c'est le profil Super Admin
        profile = self.get_by_id(db, profile_id)
        if profile and profile.name == "Super Admin":
            raise ValueError(
                "Le profil Super Admin a accès à tous les menus automatiquement. "
                "Les modifications ne sont pas autorisées."
            )
        
        self.profile_repo.batch_update_menu_access(db, profile_id, menu_access_list)
    
    def get_accessible_menus_for_user(self, db: Session, profile_id: Optional[int]) -> List[MenuItem]:
        """
        Récupère les menus accessibles pour un utilisateur donné.
        
        Args:
            db: Session SQLAlchemy
            profile_id: ID du profil de l'utilisateur (None = pas de profil personnalisé)
            
        Returns:
            Liste des MenuItem accessibles
        """
        return self.profile_repo.get_accessible_menus_for_user(db, profile_id)
