"""api/dependencies.py — inchangé fonctionnellement."""
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.security import get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.repositories.dashboard_repository import DashboardRepository

dashboard_repo = DashboardRepository()

def get_current_admin(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user

def check_dashboard_access(dashboard_id: int, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    if current_user.role == "admin":
        return
    dashboard = dashboard_repo.get_by_id(db, dashboard_id)
    if dashboard and dashboard.is_public:
        return
    access_list = list(current_user.dashboard_access or [])
    if dashboard_id not in access_list:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to this dashboard is denied")

__all__ = ["get_current_user", "get_current_admin", "check_dashboard_access"]