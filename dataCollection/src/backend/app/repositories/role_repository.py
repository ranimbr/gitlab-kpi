"""
repositories/role_repository.py

Repository pour la gestion des rôles dynamiques.
"""
from sqlalchemy.orm import Session
from typing import List, Optional
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission


class RoleRepository:
    """Repository pour les opérations CRUD sur les rôles."""
    
    def get_all(self, db: Session, include_inactive: bool = False) -> List[Role]:
        """
        Récupère tous les rôles.
        
        Args:
            db: Session de base de données
            include_inactive: Si True, inclut les rôles inactifs
            
        Returns:
            Liste des rôles
        """
        query = db.query(Role)
        if not include_inactive:
            query = query.filter(Role.is_active == True)
        return query.order_by(Role.name).all()
    
    def get_by_id(self, db: Session, role_id: int) -> Optional[Role]:
        """
        Récupère un rôle par son ID.
        
        Args:
            db: Session de base de données
            role_id: ID du rôle
            
        Returns:
            Le rôle ou None
        """
        return db.query(Role).filter(Role.id == role_id).first()
    
    def get_by_code(self, db: Session, code: str) -> Optional[Role]:
        """
        Récupère un rôle par son code.
        
        Args:
            db: Session de base de données
            code: Code du rôle (ex: 'super_admin')
            
        Returns:
            Le rôle ou None
        """
        return db.query(Role).filter(Role.code == code).first()
    
    def create(self, db: Session, code: str, name: str, description: Optional[str] = None, 
               is_system: bool = False) -> Role:
        """
        Crée un nouveau rôle.
        
        Args:
            db: Session de base de données
            code: Code unique du rôle
            name: Nom du rôle
            description: Description du rôle
            is_system: Si True, marque comme rôle système (non modifiable)
            
        Returns:
            Le rôle créé
        """
        role = Role(
            code=code,
            name=name,
            description=description,
            is_system=is_system
        )
        db.add(role)
        db.flush()
        return role
    
    def update(self, db: Session, role: Role, name: Optional[str] = None, 
              description: Optional[str] = None, is_active: Optional[bool] = None) -> Role:
        """
        Met à jour un rôle.
        
        Args:
            db: Session de base de données
            role: Le rôle à mettre à jour
            name: Nouveau nom (optionnel)
            description: Nouvelle description (optionnel)
            is_active: Nouveau statut actif (optionnel)
            
        Returns:
            Le rôle mis à jour
        """
        if name is not None:
            role.name = name
        if description is not None:
            role.description = description
        if is_active is not None:
            role.is_active = is_active
        db.flush()
        return role
    
    def delete(self, db: Session, role: Role) -> None:
        """
        Supprime un rôle.
        
        Args:
            db: Session de base de données
            role: Le rôle à supprimer
        """
        db.delete(role)
        db.flush()
    
    def get_permissions(self, db: Session, role_id: int) -> List[Permission]:
        """
        Récupère les permissions d'un rôle.
        
        Args:
            db: Session de base de données
            role_id: ID du rôle
            
        Returns:
            Liste des permissions
        """
        return db.query(Permission).join(RolePermission).filter(
            RolePermission.role_id == role_id
        ).order_by(Permission.category, Permission.name).all()
    
    def add_permission(self, db: Session, role_id: int, permission_id: int) -> RolePermission:
        """
        Ajoute une permission à un rôle.
        
        Args:
            db: Session de base de données
            role_id: ID du rôle
            permission_id: ID de la permission
            
        Returns:
            L'association créée
        """
        association = RolePermission(role_id=role_id, permission_id=permission_id)
        db.add(association)
        db.flush()
        return association
    
    def remove_permission(self, db: Session, role_id: int, permission_id: int) -> None:
        """
        Supprime une permission d'un rôle.
        
        Args:
            db: Session de base de données
            role_id: ID du rôle
            permission_id: ID de la permission
        """
        association = db.query(RolePermission).filter(
            RolePermission.role_id == role_id,
            RolePermission.permission_id == permission_id
        ).first()
        if association:
            db.delete(association)
            db.flush()
    
    def set_permissions(self, db: Session, role_id: int, permission_ids: List[int]) -> None:
        """
        Définit les permissions d'un rôle (remplace les existantes).
        
        Args:
            db: Session de base de données
            role_id: ID du rôle
            permission_ids: Liste des IDs des permissions
        """
        # Supprimer les associations existantes
        db.query(RolePermission).filter(RolePermission.role_id == role_id).delete()
        
        # Ajouter les nouvelles associations
        for permission_id in permission_ids:
            association = RolePermission(role_id=role_id, permission_id=permission_id)
            db.add(association)
        
        db.flush()
    
    def has_permission(self, db: Session, role_id: int, permission_code: str) -> bool:
        """
        Vérifie si un rôle a une permission spécifique.
        
        Args:
            db: Session de base de données
            role_id: ID du rôle
            permission_code: Code de la permission
            
        Returns:
            True si le rôle a la permission, False sinon
        """
        return db.query(RolePermission).join(Permission).filter(
            RolePermission.role_id == role_id,
            Permission.code == permission_code
        ).first() is not None
