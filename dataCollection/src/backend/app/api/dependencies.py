"""
api/dependencies.py

Dépendances FastAPI centralisées.

[FIX] get_current_user est défini dans core/security.py et ré-exporté ici
pour éviter la duplication de logique entre les deux fichiers.
"""
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user  # ré-export depuis security.py
from app.database.session import get_db
from app.models.app_user import AppUser
from app.repositories.dashboard_repository import DashboardRepository

dashboard_repo = DashboardRepository()


def get_current_admin(
    current_user: AppUser = Depends(get_current_user),
) -> AppUser:
    """
    Dependency — vérifie que l'utilisateur connecté est un admin.
    Lève HTTP 403 sinon.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


def check_dashboard_access(
    dashboard_id: int,
    current_user: AppUser  = Depends(get_current_user),
    db:           Session  = Depends(get_db),
) -> None:
    """
    Dependency — vérifie que l'utilisateur a accès au dashboard demandé.
    Les admins ont accès à tous les dashboards.
    """
    if current_user.role == "admin":
        return

    accessible = dashboard_repo.get_accessible_by_user(
        db,
        user_id    = current_user.id,
        view_group = current_user.dashboard_view_group,
    )

    allowed_ids = {d.id for d in accessible}

    if dashboard_id not in allowed_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this dashboard is denied",
        )


# Ré-export explicite pour les routers qui importent depuis dependencies
__all__ = ["get_current_user", "get_current_admin", "check_dashboard_access"]
