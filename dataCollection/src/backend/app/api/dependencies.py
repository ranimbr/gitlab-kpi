"""
api/dependencies.py
"""
from fastapi import Depends, HTTPException, Path, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser, UserRoleEnum
# DISABLED: Dashboard functionality removed
# from app.repositories.dashboard_repository import DashboardRepository

# dashboard_repo = DashboardRepository()


# ── Admin (super_admin uniquement) ────────────────────────────────────────────

def get_current_admin(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    """
    ✅ FIX : vérifie super_admin (remplace l'ancien admin/user).
    Utilisé pour les opérations d'administration complètes.
    """
    if current_user.role != UserRoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits super_admin requis.",
        )
    return current_user


# Alias explicite pour les opérations critiques
get_current_super_admin = get_current_admin


# ── Active User ────────────────────────────────────────────────────────────────

def get_current_active_user(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    """
    Vérifie que l'utilisateur est actif.
    Utilisé pour les opérations nécessitant un compte actif.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte utilisateur désactivé.",
        )
    return current_user


# ── Site Manager ou Super Admin ───────────────────────────────────────────────

def get_current_manager(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    """
    Accès pour : super_admin, site_manager.
    Utilisé pour les opérations de consultation/modification au niveau site.
    """
    if current_user.role not in (
        UserRoleEnum.super_admin,
        UserRoleEnum.site_manager,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits super_admin ou site_manager requis.",
        )
    return current_user


# ── Team Lead, Site Manager ou Super Admin ────────────────────────────────────

def get_current_team_lead_or_above(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    """
    Accès pour : super_admin, site_manager, team_lead.
    Utilisé pour la gestion d'équipe (validation développeurs, etc.).
    """
    if current_user.role not in (
        UserRoleEnum.super_admin,
        UserRoleEnum.site_manager,
        UserRoleEnum.team_lead,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits team_lead ou supérieur requis.",
        )
    return current_user


# ── Project Manager, Team Lead, Site Manager ou Super Admin ───────────────────

def get_current_project_manager_or_above(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    """
    Accès pour : super_admin, site_manager, team_lead, project_manager.
    Utilisé pour les endpoints d'intelligence (admin et team).
    """
    if current_user.role not in (
        UserRoleEnum.super_admin,
        UserRoleEnum.site_manager,
        UserRoleEnum.team_lead,
        UserRoleEnum.project_manager,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits project_manager ou supérieur requis.",
        )
    return current_user


# ── Viewer, Project Manager, Team Lead, Site Manager ou Super Admin ───────────

def get_current_viewer_or_above(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    """
    Accès pour : super_admin, site_manager, team_lead, project_manager, viewer.
    Utilisé pour les endpoints d'intelligence et analytics avec assignations flexibles.
    Viewer peut avoir des assignations combinées (sites, équipes, projets).
    """
    if current_user.role not in (
        UserRoleEnum.super_admin,
        UserRoleEnum.site_manager,
        UserRoleEnum.team_lead,
        UserRoleEnum.project_manager,
        UserRoleEnum.viewer,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits viewer ou supérieur requis.",
        )
    return current_user


# ── Dashboard Access ──────────────────────────────────────────────────────────

def check_dashboard_access(
    dashboard_id: int,
    current_user: AppUser  = Depends(get_current_user),
    db:           Session  = Depends(get_db),
) -> None:
    """
    DISABLED: Dashboard functionality removed
    """
    # DISABLED: Dashboard functionality removed
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Dashboard functionality has been removed.",
    )


# ── Site Access ───────────────────────────────────────────────────────────────

def require_site_access(
    site_id:      int     = Path(...),
    current_user: AppUser = Depends(get_current_user),
) -> None:
    """
     AJOUT : vérifie qu'un site_manager a accès au site demandé.
    super_admin → accès à tous les sites.
    site_manager → accès uniquement à son site (site_id FK dans AppUser).
    """
    if current_user.role == UserRoleEnum.super_admin:
        return
    if current_user.role == UserRoleEnum.site_manager:
        if current_user.site_id != site_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Accès au site {site_id} refusé. Vous gérez le site {current_user.site_id}.",
            )
        return
    # team_lead et developer n'ont pas accès aux opérations site
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Droits site_manager ou supérieur requis.",
    )


__all__ = [
    "get_current_user",
    "get_current_admin",
    "get_current_super_admin",
    "get_current_active_user",
    "get_current_manager",
    "get_current_team_lead_or_above",
    "get_current_project_manager_or_above",
    "get_current_viewer_or_above",
    # "check_dashboard_access",  # DISABLED: Dashboard functionality removed
    "require_site_access",
]