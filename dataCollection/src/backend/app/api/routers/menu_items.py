"""
api/routers/menu_items.py

Routes API pour la gestion des menus de l'application.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.menu_item import (
    MenuItemCreate, MenuItemUpdate, MenuItemResponse, MenuItemTree,
)
from app.services.admin.menu_item_service import MenuItemService
from app.api.dependencies import get_current_user
from app.models.app_user import AppUser
from app.models.app_user import UserRoleEnum

router = APIRouter(prefix="/menu-items", tags=["Menu Items"])
menu_item_service = MenuItemService()


@router.get("/", response_model=list[MenuItemResponse])
def get_all_menu_items(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Récupère tous les menus.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    return menu_item_service.get_all(db)


@router.get("/tree", response_model=list[MenuItemTree])
def get_menu_tree(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Récupère tous les menus sous forme d'arbre hiérarchique.
    
    Accès : Tous les rôles (pour affichage sidebar)
    """
    return menu_item_service.get_tree(db)


@router.get("/active", response_model=list[MenuItemResponse])
def get_active_menu_items(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Récupère les menus actifs accessibles à l'utilisateur selon son profil.
    
    Accès : Tous les rôles (pour affichage sidebar)
    """
    # Les super_admin ont accès à tous les menus sans vérification de profil
    if current_user.role == UserRoleEnum.super_admin:
        return menu_item_service.get_active_only(db)
    
    # Si l'utilisateur a un profil, filtrer les menus selon ses droits d'accès
    if current_user.profile_id:
        from app.repositories.profile_menu_item_repository import ProfileMenuItemRepository
        from app.repositories.menu_item_repository import MenuItemRepository
        
        profile_menu_repo = ProfileMenuItemRepository()
        menu_item_repo = MenuItemRepository()
        
        # Récupérer les menus accessibles pour le profil de l'utilisateur
        accessible_menu_ids = profile_menu_repo.get_accessible_menu_ids(db, current_user.profile_id)
        
        # Récupérer tous les menus actifs
        all_active_menus = menu_item_repo.get_active_only(db)
        
        # Filtrer pour ne retourner que les menus accessibles
        accessible_menus = [menu for menu in all_active_menus if menu.id in accessible_menu_ids]
        return accessible_menus
    
    # Sinon, retourner tous les menus actifs (comportement par défaut)
    return menu_item_service.get_active_only(db)


@router.get("/{menu_item_id}", response_model=MenuItemResponse)
def get_menu_item(
    menu_item_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Récupère un menu par son ID.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    menu_item = menu_item_service.get_by_id(db, menu_item_id)
    if not menu_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu non trouvé"
        )
    
    return menu_item


@router.post("/", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
def create_menu_item(
    menu_data: MenuItemCreate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Crée un nouveau menu.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    return menu_item_service.create(db, menu_data)


@router.put("/{menu_item_id}", response_model=MenuItemResponse)
def update_menu_item(
    menu_item_id: int,
    menu_data: MenuItemUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Met à jour un menu.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    menu_item = menu_item_service.update(db, menu_item_id, menu_data)
    if not menu_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu non trouvé"
        )
    
    return menu_item


@router.delete("/{menu_item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_menu_item(
    menu_item_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Supprime un menu.
    
    Accès : super_admin uniquement
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super admins"
        )
    
    success = menu_item_service.delete(db, menu_item_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu non trouvé"
        )
