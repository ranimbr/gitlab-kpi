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

    Priorité :
      1. super_admin → tous les menus
      2. profile_id explicite → menus du profil
      3. profile_id=NULL → cherche le profil par défaut selon le nom du rôle
      4. Sinon → liste vide (aucune restriction implicite)
    
    Accès : Tous les rôles (pour affichage sidebar)
    """
    from app.repositories.profile_menu_item_repository import ProfileMenuItemRepository
    from app.repositories.menu_item_repository import MenuItemRepository
    from app.models.profile import Profile

    menu_item_repo = MenuItemRepository()
    profile_menu_repo = ProfileMenuItemRepository()

    # 1. super_admin → accès total
    if current_user.role == UserRoleEnum.super_admin:
        return menu_item_service.get_active_only(db)

    # Déterminer le profile_id effectif dans la base du tenant
    effective_profile_id = None
    profile_name = None

    # 2. Résoudre le nom du profil dans la base globale d'authentification (auth_db)
    if current_user.profile_id:
        from app.database.session import get_auth_session
        from app.models.profile import Profile as AuthProfile
        auth_db = get_auth_session()
        try:
            auth_prof = auth_db.query(AuthProfile).filter(AuthProfile.id == current_user.profile_id).first()
            if auth_prof:
                profile_name = auth_prof.name
        finally:
            auth_db.close()

    # 3. Chercher le profil du même nom dans la base de données courante (db)
    if profile_name:
        tenant_profile = db.query(Profile).filter(Profile.name == profile_name).first()
        if tenant_profile:
            effective_profile_id = tenant_profile.id

    # 4. Fallback par défaut selon le rôle de l'utilisateur
    if not effective_profile_id:
        # Mapping rôle technique → nom du profil par défaut
        ROLE_TO_PROFILE_NAME = {
            UserRoleEnum.site_manager:    "Site Manager",
            UserRoleEnum.team_lead:       "Team Lead",
            UserRoleEnum.project_manager: "Project Manager",
            UserRoleEnum.developer:       "Developer",
            UserRoleEnum.viewer:          "Viewer",
        }
        default_profile_name = ROLE_TO_PROFILE_NAME.get(current_user.role)
        if default_profile_name:
            default_profile = db.query(Profile).filter(
                Profile.name == default_profile_name
            ).first()
            if default_profile:
                effective_profile_id = default_profile.id

    # 5. Filtrer par profil effectif
    if effective_profile_id:
        accessible_menu_ids = profile_menu_repo.get_accessible_menu_ids(db, effective_profile_id)
        all_active_menus = menu_item_repo.get_active_only(db)
        return [menu for menu in all_active_menus if menu.id in accessible_menu_ids]

    # 6. Aucun profil trouvé → retourner liste vide (sécurité par défaut)
    return []


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
