"""
repositories/profile_repository.py

Repository pour Profile.
"""

from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.models.menu_item import MenuItem
from app.models.profile_menu_item import ProfileMenuItem
from app.repositories.base import BaseRepository


class ProfileRepository(BaseRepository[Profile]):
    """Repository pour les opérations CRUD sur Profile."""
    
    def __init__(self):
        super().__init__(Profile)
    
    def get_with_menu_items(self, db: Session, profile_id: int) -> Optional[Profile]:
        """
        Récupère un profil avec ses associations de menus.
        
        Args:
            db: Session SQLAlchemy
            profile_id: ID du profil
            
        Returns:
            Profile avec menu_items chargés, ou None
        """
        return db.query(Profile).filter(Profile.id == profile_id).first()
    
    def get_menu_items_with_access(self, db: Session, profile_id: int) -> List[dict]:
        """
        Récupère tous les menus avec leur statut d'accès pour un profil.
        
        Le profil "Super Admin" a TOUJOURS accès à tous les menus actifs.
        
        Args:
            db: Session SQLAlchemy
            profile_id: ID du profil
            
        Returns:
            Liste de dictionnaires {menu_item, has_access}
        """
        # Récupérer le profil pour vérifier si c'est Super Admin
        profile = db.query(Profile).filter(Profile.id == profile_id).first()
        is_super_admin = profile and profile.name == "Super Admin"
        
        # Récupérer tous les menus actifs
        all_menus = db.query(MenuItem).filter(MenuItem.is_active == True).order_by(MenuItem.order_index).all()
        
        # Pour Super Admin, tous les menus sont accessibles
        if is_super_admin:
            result = []
            for menu in all_menus:
                result.append({
                    "menu_item": {
                        "id": menu.id,
                        "label": menu.label,
                        "route": menu.route,
                        "icon": menu.icon,
                        "parent_id": menu.parent_id,
                        "order_index": menu.order_index,
                        "is_active": menu.is_active,
                        "created_at": menu.created_at.isoformat() if menu.created_at else None,
                        "updated_at": menu.updated_at.isoformat() if menu.updated_at else None,
                    },
                    "has_access": True  # Super Admin a toujours accès
                })
            return result
        
        # Pour les autres profils, utiliser les accès stockés en base
        existing_access = db.query(ProfileMenuItem).filter(
            ProfileMenuItem.profile_id == profile_id
        ).all()
        
        # Créer un mapping menu_item_id -> has_access
        access_map = {access.menu_item_id: access.has_access for access in existing_access}
        
        # Construire la réponse avec des dictionnaires sérialisables
        result = []
        for menu in all_menus:
            result.append({
                "menu_item": {
                    "id": menu.id,
                    "label": menu.label,
                    "route": menu.route,
                    "icon": menu.icon,
                    "parent_id": menu.parent_id,
                    "order_index": menu.order_index,
                    "is_active": menu.is_active,
                    "created_at": menu.created_at.isoformat() if menu.created_at else None,
                    "updated_at": menu.updated_at.isoformat() if menu.updated_at else None,
                },
                "has_access": access_map.get(menu.id, False)
            })
        
        return result
    
    def update_menu_access(self, db: Session, profile_id: int, menu_item_id: int, has_access: bool) -> ProfileMenuItem:
        """
        Met à jour l'accès d'un profil à un menu.
        
        Args:
            db: Session SQLAlchemy
            profile_id: ID du profil
            menu_item_id: ID du menu
            has_access: Nouveau statut d'accès
            
        Returns:
            ProfileMenuItem mis à jour ou créé
        """
        # Chercher une association existante
        existing = db.query(ProfileMenuItem).filter(
            ProfileMenuItem.profile_id == profile_id,
            ProfileMenuItem.menu_item_id == menu_item_id
        ).first()
        
        if existing:
            existing.has_access = has_access
            db.commit()
            db.refresh(existing)
            return existing
        else:
            # Créer une nouvelle association
            new_access = ProfileMenuItem(
                profile_id=profile_id,
                menu_item_id=menu_item_id,
                has_access=has_access
            )
            db.add(new_access)
            db.commit()
            db.refresh(new_access)
            return new_access
    
    def batch_update_menu_access(self, db: Session, profile_id: int, menu_access_list: List[dict]) -> None:
        """
        Met à jour les accès d'un profil en lot.
        
        Args:
            db: Session SQLAlchemy
            profile_id: ID du profil
            menu_access_list: Liste de {menu_item_id, has_access}
        """
        for item in menu_access_list:
            self.update_menu_access(db, profile_id, item["menu_item_id"], item["has_access"])
    
    def get_accessible_menus_for_user(self, db: Session, profile_id: Optional[int]) -> List[MenuItem]:
        """
        Récupère les menus accessibles pour un profil donné.
        
        Args:
            db: Session SQLAlchemy
            profile_id: ID du profil (None = pas de profil personnalisé)
            
        Returns:
            Liste des MenuItem accessibles
        """
        if profile_id is None:
            # Pas de profil personnalisé : retourner tous les menus actifs
            return db.query(MenuItem).filter(MenuItem.is_active == True).order_by(MenuItem.order_index).all()
        
        # Récupérer les menus avec has_access = True pour ce profil
        accessible_ids = db.query(ProfileMenuItem.menu_item_id).filter(
            ProfileMenuItem.profile_id == profile_id,
            ProfileMenuItem.has_access == True
        ).all()
        
        accessible_ids = [id[0] for id in accessible_ids]
        
        if not accessible_ids:
            return []
        
        return db.query(MenuItem).filter(
            MenuItem.id.in_(accessible_ids),
            MenuItem.is_active == True
        ).order_by(MenuItem.order_index).all()
