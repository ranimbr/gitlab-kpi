"""
api/dependencies.py
"""
from fastapi import Depends, HTTPException, Path, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser, UserRoleEnum
from app.repositories.dashboard_repository import DashboardRepository

dashboard_repo = DashboardRepository()


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


# ── Dashboard Access ──────────────────────────────────────────────────────────

def check_dashboard_access(
    dashboard_id: int,
    current_user: AppUser  = Depends(get_current_user),
    db:           Session  = Depends(get_db),
) -> None:
    """
    Vérifie l'accès à un dashboard.
    super_admin → accès total.
    is_public=True → accès à tous.
    sinon → vérifie dashboard_access[].
    """
    if current_user.role == UserRoleEnum.super_admin:
        return
    dashboard = dashboard_repo.get_by_id(db, dashboard_id)
    if dashboard and dashboard.is_public:
        return
    access_list = list(current_user.dashboard_access or [])
    if dashboard_id not in access_list:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès à ce dashboard refusé.",
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
    "get_current_manager",
    "get_current_team_lead_or_above",
    "check_dashboard_access",
    "require_site_access",
]