"""
services/admin/role_service.py

Service pour la gestion des rôles dynamiques.
"""
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from app.repositories.role_repository import RoleRepository
from app.repositories.permission_repository import PermissionRepository
from app.models.role import Role
from app.models.permission import Permission


class RoleService:
    """Service pour la logique métier des rôles."""
    
    def __init__(self):
        self.role_repo = RoleRepository()
        self.permission_repo = PermissionRepository()
    
    def get_all_roles(self, db: Session, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """
        Récupère tous les rôles avec leurs permissions.
        
        Args:
            db: Session de base de données
            include_inactive: Si True, inclut les rôles inactifs
            
        Returns:
            Liste des rôles avec leurs permissions
        """
        roles = self.role_repo.get_all(db, include_inactive)
        result = []
        
        for role in roles:
            permissions = self.role_repo.get_permissions(db, role.id)
            result.append({
                "id": role.id,
                "code": role.code,
                "name": role.name,
                "description": role.description,
                "is_system": role.is_system,
                "is_active": role.is_active,
                "created_at": role.created_at,
                "updated_at": role.updated_at,
                "permissions": [
                    {
                        "id": p.id,
                        "code": p.code,
                        "name": p.name,
                        "category": p.category
                    }
                    for p in permissions
                ]
            })
        
        return result
    
    def get_role_by_id(self, db: Session, role_id: int) -> Optional[Dict[str, Any]]:
        """
        Récupère un rôle par son ID avec ses permissions.
        
        Args:
            db: Session de base de données
            role_id: ID du rôle
            
        Returns:
            Le rôle avec ses permissions ou None
        """
        role = self.role_repo.get_by_id(db, role_id)
        if not role:
            return None
        
        permissions = self.role_repo.get_permissions(db, role.id)
        
        return {
            "id": role.id,
            "code": role.code,
            "name": role.name,
            "description": role.description,
            "is_system": role.is_system,
            "is_active": role.is_active,
            "created_at": role.created_at,
            "updated_at": role.updated_at,
            "permissions": [
                {
                    "id": p.id,
                    "code": p.code,
                    "name": p.name,
                    "category": p.category
                }
                for p in permissions
            ]
        }
    
    def create_role(self, db: Session, code: str, name: str, description: Optional[str] = None,
                   permission_ids: Optional[List[int]] = None) -> Dict[str, Any]:
        """
        Crée un nouveau rôle avec ses permissions.
        
        Args:
            db: Session de base de données
            code: Code unique du rôle
            name: Nom du rôle
            description: Description du rôle
            permission_ids: Liste des IDs des permissions à assigner
            
        Returns:
            Le rôle créé
        """
        # Vérifier que le code n'existe pas déjà
        existing = self.role_repo.get_by_code(db, code)
        if existing:
            raise ValueError(f"Un rôle avec le code '{code}' existe déjà")
        
        # Créer le rôle
        role = self.role_repo.create(db, code, name, description, is_system=False)
        
        # Assigner les permissions si fournies
        if permission_ids:
            self.role_repo.set_permissions(db, role.id, permission_ids)
        
        db.commit()
        
        return self.get_role_by_id(db, role.id)
    
    def update_role(self, db: Session, role_id: int, name: Optional[str] = None,
                   description: Optional[str] = None, is_active: Optional[bool] = None,
                   permission_ids: Optional[List[int]] = None) -> Dict[str, Any]:
        """
        Met à jour un rôle.
        
        Args:
            db: Session de base de données
            role_id: ID du rôle
            name: Nouveau nom (optionnel)
            description: Nouvelle description (optionnel)
            is_active: Nouveau statut actif (optionnel)
            permission_ids: Nouvelle liste des IDs des permissions (optionnel)
            
        Returns:
            Le rôle mis à jour
        """
        role = self.role_repo.get_by_id(db, role_id)
        if not role:
            raise ValueError(f"Rôle avec ID {role_id} non trouvé")
        
        # Empêcher la modification des rôles système
        if role.is_system:
            raise ValueError("Les rôles système ne peuvent pas être modifiés")
        
        # Mettre à jour les champs
        self.role_repo.update(db, role, name, description, is_active)
        
        # Mettre à jour les permissions si fournies
        if permission_ids is not None:
            self.role_repo.set_permissions(db, role.id, permission_ids)
        
        db.commit()
        
        return self.get_role_by_id(db, role.id)
    
    def delete_role(self, db: Session, role_id: int) -> None:
        """
        Supprime un rôle.
        
        Args:
            db: Session de base de données
            role_id: ID du rôle
        """
        role = self.role_repo.get_by_id(db, role_id)
        if not role:
            raise ValueError(f"Rôle avec ID {role_id} non trouvé")
        
        # Empêcher la suppression des rôles système
        if role.is_system:
            raise ValueError("Les rôles système ne peuvent pas être supprimés")
        
        self.role_repo.delete(db, role)
        db.commit()
    
    def get_all_permissions(self, db: Session, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Récupère toutes les permissions organisées par catégorie.
        
        Args:
            db: Session de base de données
            category: Filtrer par catégorie (optionnel)
            
        Returns:
            Liste des permissions
        """
        permissions = self.permission_repo.get_all(db, category)
        
        return [
            {
                "id": p.id,
                "code": p.code,
                "name": p.name,
                "description": p.description,
                "category": p.category
            }
            for p in permissions
        ]
    
    def get_permission_categories(self, db: Session) -> List[str]:
        """
        Récupère toutes les catégories de permissions.
        
        Args:
            db: Session de base de données
            
        Returns:
            Liste des catégories
        """
        return self.permission_repo.get_categories(db)
    
    def sync_user_role_from_enum(self, db: Session, user) -> None:
        """
        Synchronise le rôle_id d'un utilisateur depuis son enum role.
        Utile pour la migration progressive vers le nouveau système.
        
        Args:
            db: Session de base de données
            user: L'utilisateur AppUser
        """
        if user.role_id is None and user.role:
            # Trouver le rôle correspondant à l'enum
            role = self.role_repo.get_by_code(db, user.role.value)
            if role:
                user.role_id = role.id
                db.commit()
