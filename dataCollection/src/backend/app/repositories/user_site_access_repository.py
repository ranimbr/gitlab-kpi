"""
repositories/user_site_access_repository.py

Repository pour la gestion des accès multi-sites des utilisateurs.
"""
from sqlalchemy.orm import Session
from typing import List, Optional
from app.models.user_site_access import UserSiteAccess


class UserSiteAccessRepository:
    """Repository pour les accès multi-sites des utilisateurs."""
    
    def get_by_user_id(self, db: Session, user_id: int) -> List[UserSiteAccess]:
        """Retourne tous les accès sites pour un utilisateur."""
        return db.query(UserSiteAccess).filter(UserSiteAccess.user_id == user_id).all()
    
    def get_by_site_id(self, db: Session, site_id: int) -> List[UserSiteAccess]:
        """Retourne tous les utilisateurs ayant accès à un site."""
        return db.query(UserSiteAccess).filter(UserSiteAccess.site_id == site_id).all()
    
    def get_primary_site(self, db: Session, user_id: int) -> Optional[UserSiteAccess]:
        """Retourne le site principal d'un utilisateur."""
        return db.query(UserSiteAccess).filter(
            UserSiteAccess.user_id == user_id,
            UserSiteAccess.is_primary == True
        ).first()
    
    def create(self, db: Session, user_id: int, site_id: int, is_primary: bool = False) -> UserSiteAccess:
        """Crée un nouvel accès site pour un utilisateur."""
        access = UserSiteAccess(
            user_id=user_id,
            site_id=site_id,
            is_primary=is_primary
        )
        db.add(access)
        db.flush()
        return access
    
    def delete_by_user_site(self, db: Session, user_id: int, site_id: int) -> bool:
        """Supprime un accès site spécifique pour un utilisateur."""
        access = db.query(UserSiteAccess).filter(
            UserSiteAccess.user_id == user_id,
            UserSiteAccess.site_id == site_id
        ).first()
        if access:
            db.delete(access)
            return True
        return False
    
    def delete_all_by_user(self, db: Session, user_id: int) -> int:
        """Supprime tous les accès sites pour un utilisateur."""
        count = db.query(UserSiteAccess).filter(UserSiteAccess.user_id == user_id).count()
        db.query(UserSiteAccess).filter(UserSiteAccess.user_id == user_id).delete()
        return count
    
    def set_primary_site(self, db: Session, user_id: int, site_id: int) -> bool:
        """Définit un site comme principal pour un utilisateur."""
        # D'abord, retirer le statut primary de tous les sites de l'utilisateur
        db.query(UserSiteAccess).filter(
            UserSiteAccess.user_id == user_id
        ).update({"is_primary": False})
        
        # Ensuite, définir le nouveau site comme primary
        access = db.query(UserSiteAccess).filter(
            UserSiteAccess.user_id == user_id,
            UserSiteAccess.site_id == site_id
        ).first()
        
        if access:
            access.is_primary = True
            db.flush()
            return True
        return False
    
    def bulk_create(self, db: Session, user_id: int, site_ids: List[int], primary_site_id: Optional[int] = None) -> List[UserSiteAccess]:
        """Crée plusieurs accès sites pour un utilisateur en une seule opération."""
        # Supprimer les accès existants
        self.delete_all_by_user(db, user_id)
        
        accesses = []
        for site_id in site_ids:
            is_primary = (site_id == primary_site_id) if primary_site_id else False
            access = self.create(db, user_id, site_id, is_primary)
            accesses.append(access)
        
        return accesses
