"""
repositories/permission_repository.py

Repository pour la gestion des permissions.
"""
from sqlalchemy.orm import Session
from typing import List, Optional
from app.models.permission import Permission


class PermissionRepository:
    """Repository pour les opérations CRUD sur les permissions."""
    
    def get_all(self, db: Session, category: Optional[str] = None) -> List[Permission]:
        """
        Récupère toutes les permissions.
        
        Args:
            db: Session de base de données
            category: Filtrer par catégorie (optionnel)
            
        Returns:
            Liste des permissions
        """
        query = db.query(Permission)
        if category:
            query = query.filter(Permission.category == category)
        return query.order_by(Permission.category, Permission.name).all()
    
    def get_by_id(self, db: Session, permission_id: int) -> Optional[Permission]:
        """
        Récupère une permission par son ID.
        
        Args:
            db: Session de base de données
            permission_id: ID de la permission
            
        Returns:
            La permission ou None
        """
        return db.query(Permission).filter(Permission.id == permission_id).first()
    
    def get_by_code(self, db: Session, code: str) -> Optional[Permission]:
        """
        Récupère une permission par son code.
        
        Args:
            db: Session de base de données
            code: Code de la permission
            
        Returns:
            La permission ou None
        """
        return db.query(Permission).filter(Permission.code == code).first()
    
    def get_categories(self, db: Session) -> List[str]:
        """
        Récupère toutes les catégories de permissions uniques.
        
        Args:
            db: Session de base de données
            
        Returns:
            Liste des catégories
        """
        result = db.query(Permission.category).distinct().all()
        return [row[0] for row in result if row[0] is not None]
    
    def create(self, db: Session, code: str, name: str, description: Optional[str] = None,
               category: Optional[str] = None) -> Permission:
        """
        Crée une nouvelle permission.
        
        Args:
            db: Session de base de données
            code: Code unique de la permission
            name: Nom de la permission
            description: Description de la permission
            category: Catégorie de la permission
            
        Returns:
            La permission créée
        """
        permission = Permission(
            code=code,
            name=name,
            description=description,
            category=category
        )
        db.add(permission)
        db.flush()
        return permission
    
    def update(self, db: Session, permission: Permission, name: Optional[str] = None,
              description: Optional[str] = None, category: Optional[str] = None) -> Permission:
        """
        Met à jour une permission.
        
        Args:
            db: Session de base de données
            permission: La permission à mettre à jour
            name: Nouveau nom (optionnel)
            description: Nouvelle description (optionnel)
            category: Nouvelle catégorie (optionnel)
            
        Returns:
            La permission mise à jour
        """
        if name is not None:
            permission.name = name
        if description is not None:
            permission.description = description
        if category is not None:
            permission.category = category
        db.flush()
        return permission
    
    def delete(self, db: Session, permission: Permission) -> None:
        """
        Supprime une permission.
        
        Args:
            db: Session de base de données
            permission: La permission à supprimer
        """
        db.delete(permission)
        db.flush()
