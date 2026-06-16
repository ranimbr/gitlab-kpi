"""
api/routers/roles.py

Router pour la gestion des rôles et permissions dynamiques.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from app.database.session import get_db
from app.services.admin.role_service import RoleService
from app.api.dependencies import get_current_admin, get_current_active_user
from app.models.app_user import AppUser


router = APIRouter()
role_service = RoleService()


# ── Schemas ────────────────────────────────────────────────────────────────────

class PermissionSchema(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    
    class Config:
        from_attributes = True


class RoleSchema(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    is_system: bool
    is_active: bool
    created_at: str
    updated_at: str
    permissions: List[PermissionSchema] = []
    
    class Config:
        from_attributes = True


class RoleCreateSchema(BaseModel):
    code: str = Field(..., min_length=1, max_length=100, description="Code unique du rôle")
    name: str = Field(..., min_length=1, max_length=255, description="Nom du rôle")
    description: Optional[str] = Field(None, max_length=500, description="Description du rôle")
    permission_ids: Optional[List[int]] = Field(default=[], description="Liste des IDs des permissions")


class RoleUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None
    permission_ids: Optional[List[int]] = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[RoleSchema])
def get_all_roles(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_active_user)
):
    """
    Récupère tous les rôles.
    
    Nécessite: manage_roles
    """
    # Vérifier la permission (pour l'instant, seul super_admin peut gérer les rôles)
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas la permission de gérer les rôles"
        )
    
    return role_service.get_all_roles(db, include_inactive)


@router.get("/{role_id}", response_model=RoleSchema)
def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_active_user)
):
    """
    Récupère un rôle par son ID.
    
    Nécessite: manage_roles
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas la permission de gérer les rôles"
        )
    
    role = role_service.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rôle avec ID {role_id} non trouvé"
        )
    
    return role


@router.post("/", response_model=RoleSchema, status_code=status.HTTP_201_CREATED)
def create_role(
    role_data: RoleCreateSchema,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_active_user)
):
    """
    Crée un nouveau rôle.
    
    Nécessite: manage_roles
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas la permission de gérer les rôles"
        )
    
    try:
        return role_service.create_role(
            db=db,
            code=role_data.code,
            name=role_data.name,
            description=role_data.description,
            permission_ids=role_data.permission_ids
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/{role_id}", response_model=RoleSchema)
def update_role(
    role_id: int,
    role_data: RoleUpdateSchema,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_active_user)
):
    """
    Met à jour un rôle.
    
    Nécessite: manage_roles
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas la permission de gérer les rôles"
        )
    
    try:
        return role_service.update_role(
            db=db,
            role_id=role_id,
            name=role_data.name,
            description=role_data.description,
            is_active=role_data.is_active,
            permission_ids=role_data.permission_ids
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_active_user)
):
    """
    Supprime un rôle.
    
    Nécessite: manage_roles
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas la permission de gérer les rôles"
        )
    
    try:
        role_service.delete_role(db, role_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/permissions/all", response_model=List[PermissionSchema])
def get_all_permissions(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_active_user)
):
    """
    Récupère toutes les permissions.
    
    Nécessite: manage_roles
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas la permission de gérer les rôles"
        )
    
    return role_service.get_all_permissions(db, category)


@router.get("/permissions/categories", response_model=List[str])
def get_permission_categories(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_active_user)
):
    """
    Récupère toutes les catégories de permissions.
    
    Nécessite: manage_roles
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas la permission de gérer les rôles"
        )
    
    return role_service.get_permission_categories(db)
