"""
api/routers/profiles.py

Routes API pour la gestion des profils d'accès aux menus.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.profile import (
    ProfileCreate, ProfileUpdate, ProfileResponse, ProfileWithMenus,
    ProfileMenuItemAccess, ProfileMenuItemBatchUpdate,
)
from app.services.admin.profile_service import ProfileService
from app.api.dependencies import get_current_user
from app.models.app_user import AppUser
from app.models.app_user import UserRoleEnum

router = APIRouter(prefix="/profiles", tags=["Profiles"])
profile_service = ProfileService()


@router.get("/", response_model=list[ProfileResponse])
def get_all_profiles(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Récupère tous les profils.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    return profile_service.get_all(db)


@router.get("/{profile_id}", response_model=ProfileResponse)
def get_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Récupère un profil par son ID.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    profile = profile_service.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profil non trouvé"
        )
    
    return profile


@router.post("/", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
def create_profile(
    profile_data: ProfileCreate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Crée un nouveau profil.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    return profile_service.create(db, profile_data)


@router.put("/{profile_id}", response_model=ProfileResponse)
def update_profile(
    profile_id: int,
    profile_data: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Met à jour un profil.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    profile = profile_service.update(db, profile_id, profile_data)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profil non trouvé"
        )
    
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Supprime un profil.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    success = profile_service.delete(db, profile_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profil non trouvé"
        )


@router.get("/{profile_id}/menu-items", response_model=list[dict])
def get_profile_menu_items(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Récupère tous les menus avec leur statut d'accès pour un profil.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    profile = profile_service.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profil non trouvé"
        )
    
    return profile_service.get_menu_items_with_access(db, profile_id)


@router.put("/{profile_id}/menu-items", status_code=status.HTTP_200_OK)
def update_profile_menu_items(
    profile_id: int,
    menu_access_data: ProfileMenuItemBatchUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Met à jour les accès d'un profil aux menus en lot.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    profile = profile_service.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profil non trouvé"
        )
    
    menu_access_list = [item.model_dump() for item in menu_access_data.menu_items]
    profile_service.batch_update_menu_access(db, profile_id, menu_access_list)
    
    return {"message": "Accès mis à jour avec succès"}
