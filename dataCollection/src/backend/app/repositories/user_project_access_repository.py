"""
repositories/user_project_access_repository.py

Repository pour les assignations utilisateurs-projets dans la base tenant database.
Architecture multi-tenant : les assignations sont stockées dans chaque tenant.
"""

from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.user_project_access import UserProjectAccess


class UserProjectAccessRepository:
    """Repository pour gérer les assignations utilisateurs-projets dans la base tenant."""

    def get_by_user_id(self, db: Session, user_id: int) -> List[UserProjectAccess]:
        """
        Récupère toutes les assignations de projets pour un utilisateur.
        
        Args:
            db: Session de la base tenant
            user_id: ID de l'utilisateur (depuis auth_db)
            
        Returns:
            Liste des assignations de projets
        """
        return db.query(UserProjectAccess).filter(
            UserProjectAccess.user_id == user_id
        ).all()

    def get_by_project_id(self, db: Session, project_id: int) -> List[UserProjectAccess]:
        """
        Récupère tous les utilisateurs assignés à un projet.
        
        Args:
            db: Session de la base tenant
            project_id: ID du projet
            
        Returns:
            Liste des assignations utilisateurs
        """
        return db.query(UserProjectAccess).filter(
            UserProjectAccess.project_id == project_id
        ).all()

    def create(self, db: Session, user_id: int, project_id: int, is_primary: bool = False) -> UserProjectAccess:
        """
        Crée une nouvelle assignation utilisateur-projet.
        
        Args:
            db: Session de la base tenant
            user_id: ID de l'utilisateur (depuis auth_db)
            project_id: ID du projet
            is_primary: Si c'est le projet principal
            
        Returns:
            L'assignation créée
        """
        access = UserProjectAccess(
            user_id=user_id,
            project_id=project_id,
            is_primary=is_primary
        )
        db.add(access)
        db.flush()
        return access

    def delete_by_user_id(self, db: Session, user_id: int) -> int:
        """
        Supprime toutes les assignations de projets pour un utilisateur.
        
        Args:
            db: Session de la base tenant
            user_id: ID de l'utilisateur (depuis auth_db)
            
        Returns:
            Nombre de lignes supprimées
        """
        return db.query(UserProjectAccess).filter(
            UserProjectAccess.user_id == user_id
        ).delete()

    def delete_by_user_project(self, db: Session, user_id: int, project_id: int) -> int:
        """
        Supprime une assignation spécifique utilisateur-projet.
        
        Args:
            db: Session de la base tenant
            user_id: ID de l'utilisateur (depuis auth_db)
            project_id: ID du projet
            
        Returns:
            Nombre de lignes supprimées
        """
        return db.query(UserProjectAccess).filter(
            UserProjectAccess.user_id == user_id,
            UserProjectAccess.project_id == project_id
        ).delete()

    def sync_smart(
        self, 
        db: Session, 
        user_id: int, 
        project_ids: List[int],
        is_primary: bool = False
    ) -> List[UserProjectAccess]:
        """
        Synchronise intelligemment les assignations de projets pour un utilisateur.
        Supprime les assignations retirées et crée les nouvelles.
        
        Args:
            db: Session de la base tenant
            user_id: ID de l'utilisateur (depuis auth_db)
            project_ids: Liste des IDs de projets à assigner
            is_primary: Si c'est le projet principal
            
        Returns:
            Liste des assignations créées
        """
        # Récupérer les assignations actuelles
        current = self.get_by_user_id(db, user_id)
        current_ids = {a.project_id for a in current}
        desired_ids = set(project_ids)

        # 1. Supprimer les assignations retirées
        for access in current:
            if access.project_id not in desired_ids:
                db.delete(access)

        # 2. Créer les nouvelles assignations
        created = []
        for project_id in desired_ids:
            if project_id not in current_ids:
                access = self.create(db, user_id, project_id, is_primary)
                created.append(access)

        db.commit()
        return created
