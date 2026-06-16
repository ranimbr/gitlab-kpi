"""
repositories/user_group_access_repository.py

Repository pour la gestion des accès multi-équipes des utilisateurs.
"""
from sqlalchemy.orm import Session
from typing import List, Optional
from app.models.user_group_access import UserGroupAccess


class UserGroupAccessRepository:
    """Repository pour les accès multi-équipes des utilisateurs."""
    
    def get_by_user_id(self, db: Session, user_id: int) -> List[UserGroupAccess]:
        """Retourne tous les accès équipes pour un utilisateur."""
        return db.query(UserGroupAccess).filter(UserGroupAccess.user_id == user_id).all()
    
    def get_by_group_id(self, db: Session, group_id: int) -> List[UserGroupAccess]:
        """Retourne tous les utilisateurs ayant accès à une équipe."""
        return db.query(UserGroupAccess).filter(UserGroupAccess.group_id == group_id).all()
    
    def get_primary_group(self, db: Session, user_id: int) -> Optional[UserGroupAccess]:
        """Retourne l'équipe principale d'un utilisateur."""
        return db.query(UserGroupAccess).filter(
            UserGroupAccess.user_id == user_id,
            UserGroupAccess.is_primary == True
        ).first()
    
    def create(self, db: Session, user_id: int, group_id: int, is_primary: bool = False) -> UserGroupAccess:
        """Crée un nouvel accès équipe pour un utilisateur."""
        access = UserGroupAccess(
            user_id=user_id,
            group_id=group_id,
            is_primary=is_primary
        )
        db.add(access)
        db.flush()
        return access
    
    def delete_by_user_group(self, db: Session, user_id: int, group_id: int) -> bool:
        """Supprime un accès équipe spécifique pour un utilisateur."""
        access = db.query(UserGroupAccess).filter(
            UserGroupAccess.user_id == user_id,
            UserGroupAccess.group_id == group_id
        ).first()
        if access:
            db.delete(access)
            return True
        return False
    
    def delete_all_by_user(self, db: Session, user_id: int) -> int:
        """Supprime tous les accès équipes pour un utilisateur."""
        count = db.query(UserGroupAccess).filter(UserGroupAccess.user_id == user_id).count()
        db.query(UserGroupAccess).filter(UserGroupAccess.user_id == user_id).delete()
        return count
    
    def set_primary_group(self, db: Session, user_id: int, group_id: int) -> bool:
        """Définit une équipe comme principale pour un utilisateur."""
        # D'abord, retirer le statut primary de toutes les équipes de l'utilisateur
        db.query(UserGroupAccess).filter(
            UserGroupAccess.user_id == user_id
        ).update({"is_primary": False})
        
        # Ensuite, définir la nouvelle équipe comme primary
        access = db.query(UserGroupAccess).filter(
            UserGroupAccess.user_id == user_id,
            UserGroupAccess.group_id == group_id
        ).first()
        
        if access:
            access.is_primary = True
            db.flush()
            return True
        return False
    
    def bulk_create(self, db: Session, user_id: int, group_ids: List[int], primary_group_id: Optional[int] = None) -> List[UserGroupAccess]:
        """Crée plusieurs accès équipes pour un utilisateur en une seule opération."""
        # Supprimer les accès existants
        self.delete_all_by_user(db, user_id)
        
        accesses = []
        for group_id in group_ids:
            is_primary = (group_id == primary_group_id) if primary_group_id else False
            access = self.create(db, user_id, group_id, is_primary)
            accesses.append(access)
        
        return accesses
