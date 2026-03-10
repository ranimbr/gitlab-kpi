from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database.session import get_db
from app.api.dependencies import (
    get_current_user,
    get_current_admin,
    check_dashboard_access
)

from app.schemas.dashboard import (
    DashboardCreate,
    DashboardResponse,
    DashboardAccessCreate,
    DashboardAccessResponse
)

from app.repositories.dashboard_repository import (
    DashboardRepository,
    DashboardAccessRepository
)

from app.models.app_user import AppUser


router = APIRouter(prefix="/dashboards", tags=["Dashboards"])

dash_repo = DashboardRepository()
access_repo = DashboardAccessRepository()


# ─── Dashboards accessibles ─────────────────────────────

@router.get("/", response_model=List[DashboardResponse])
def list_my_dashboards(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):

    if current_user.role == "admin":
        return dash_repo.get_all(db)

    return dash_repo.get_accessible_by_user(
        db,
        user_id=current_user.id,
        view_group=current_user.dashboard_view_group
    )


# ─── Création dashboard ─────────────────────────────

@router.post("/", response_model=DashboardResponse, status_code=201)
def create_dashboard(
    request: DashboardCreate,
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):

    dashboard = dash_repo.create(db, request.model_dump())

    db.commit()
    db.refresh(dashboard)

    return dashboard


# ─── Get dashboard sécurisé ─────────────────────────────

@router.get("/{dashboard_id}", response_model=DashboardResponse)
def get_dashboard(

    dashboard_id: int,

    db: Session = Depends(get_db),

    current_user: AppUser = Depends(get_current_user),

    _: None = Depends(check_dashboard_access)

):

    dashboard = dash_repo.get_by_id(db, dashboard_id)

    if not dashboard:
        raise HTTPException(404, "Dashboard not found")

    return dashboard


# ─── Delete dashboard ─────────────────────────────

@router.delete("/{dashboard_id}", status_code=204)
def delete_dashboard(

    dashboard_id: int,

    db: Session = Depends(get_db),

    current_admin: AppUser = Depends(get_current_admin)

):

    dashboard = dash_repo.get_by_id(db, dashboard_id)

    if not dashboard:
        raise HTTPException(404, "Dashboard not found")

    db.delete(dashboard)
    db.commit()


# ─── Grant access ─────────────────────────────

@router.post(
    "/{dashboard_id}/access",
    response_model=DashboardAccessResponse,
    status_code=201
)
def grant_access(

    dashboard_id: int,

    request: DashboardAccessCreate,

    db: Session = Depends(get_db),

    current_admin: AppUser = Depends(get_current_admin)

):

    if access_repo.access_exists(
        db,
        request.user_id,
        dashboard_id
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "User already has access"
        )

    access = access_repo.create(db, {

        "user_id": request.user_id,
        "dashboard_id": dashboard_id

    })

    db.commit()
    db.refresh(access)

    return access


# ─── Revoke access ─────────────────────────────

@router.delete("/{dashboard_id}/access/{user_id}", status_code=204)
def revoke_access(

    dashboard_id: int,

    user_id: int,

    db: Session = Depends(get_db),

    current_admin: AppUser = Depends(get_current_admin)

):

    access = access_repo.get_by_user_and_dashboard(
        db,
        user_id,
        dashboard_id
    )

    if not access:
        raise HTTPException(404, "Access not found")

    db.delete(access)
    db.commit()