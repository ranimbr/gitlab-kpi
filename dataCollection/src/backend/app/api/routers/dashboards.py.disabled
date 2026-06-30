"""
api/routers/dashboards.py

"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import check_dashboard_access, get_current_admin, get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.repositories.dashboard_repository import DashboardRepository
from app.repositories.period_filter_repository import PeriodFilterRepository
from app.schemas.dashboard import DashboardCreate, DashboardResponse, DashboardUpdate
from app.schemas.period_filter import PeriodFilterCreate, PeriodFilterResponse, PeriodFilterUpdate

logger      = logging.getLogger(__name__)
router      = APIRouter(prefix="/dashboards", tags=["Dashboards"])
dash_repo   = DashboardRepository()
filter_repo = PeriodFilterRepository()


# ─── Liste dashboards accessibles ─────────────────────────────────────────────

@router.get("", response_model=List[DashboardResponse])
def list_my_dashboards(
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    if current_user.role == "admin":
        return dash_repo.get_all(db)
    return dash_repo.get_accessible_by_user(db, user_id=current_user.id)


# ─── Créer un dashboard ───────────────────────────────────────────────────────

@router.post("", response_model=DashboardResponse, status_code=201)
def create_dashboard(
    request:       DashboardCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    data               = request.model_dump(exclude={"period_filter"})
    data["created_by"] = current_admin.id

    dashboard = dash_repo.create(db, data)

    # Crée le PeriodFilter initial si fourni
    if request.period_filter:
        pf_data               = request.period_filter.model_dump()
        pf_data["dashboard_id"] = dashboard.id
        filter_repo.create(db, pf_data)

    db.commit()
    db.refresh(dashboard)
    logger.info(f"Dashboard created — id={dashboard.id} by admin={current_admin.id}")
    return dashboard


# ─── Get dashboard ────────────────────────────────────────────────────────────

@router.get("/{dashboard_id}", response_model=DashboardResponse)
def get_dashboard(
    dashboard_id: int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
    _:            None    = Depends(check_dashboard_access),
):
    dashboard = dash_repo.get_by_id(db, dashboard_id)
    if not dashboard:
        raise HTTPException(404, "Dashboard not found")
    return dashboard


# ─── Update dashboard ─────────────────────────────────────────────────────────

@router.put("/{dashboard_id}", response_model=DashboardResponse)
def update_dashboard(
    dashboard_id:  int,
    request:       DashboardUpdate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    dashboard = dash_repo.get_by_id(db, dashboard_id)
    if not dashboard:
        raise HTTPException(404, "Dashboard not found")

    # ✅ FIX : exclude_unset=True pour permettre la mise à NULL
    dash_repo.update(db, dashboard, request.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(dashboard)
    return dashboard


# ─── Delete dashboard ─────────────────────────────────────────────────────────

@router.delete("/{dashboard_id}", status_code=204)
def delete_dashboard(
    dashboard_id:  int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    dashboard = dash_repo.get_by_id(db, dashboard_id)
    if not dashboard:
        raise HTTPException(404, "Dashboard not found")
    db.delete(dashboard)
    db.commit()


# ─── Period Filters ───────────────────────────────────────────────────────────

@router.get("/{dashboard_id}/period-filters", response_model=List[PeriodFilterResponse])
def list_period_filters(
    dashboard_id: int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
    _:            None    = Depends(check_dashboard_access),
):
    return filter_repo.get_by_dashboard(db, dashboard_id)


@router.post(
    "/{dashboard_id}/period-filters",
    response_model = PeriodFilterResponse,
    status_code    = 201,
)
def create_period_filter(
    dashboard_id:  int,
    request:       PeriodFilterCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    if not dash_repo.get_by_id(db, dashboard_id):
        raise HTTPException(404, "Dashboard not found")

    data               = request.model_dump()
    data["dashboard_id"] = dashboard_id
    pf = filter_repo.create(db, data)
    db.commit()
    db.refresh(pf)
    return pf


@router.put(
    "/{dashboard_id}/period-filters/{filter_id}",
    response_model = PeriodFilterResponse,
)
def update_period_filter(
    dashboard_id:  int,
    filter_id:     int,
    request:       PeriodFilterUpdate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    pf = filter_repo.get_by_id(db, filter_id)
    if not pf or pf.dashboard_id != dashboard_id:
        raise HTTPException(404, "Period filter not found")
    # ✅ FIX : exclude_unset=True
    filter_repo.update(db, pf, request.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(pf)
    return pf


@router.delete("/{dashboard_id}/period-filters/{filter_id}", status_code=204)
def delete_period_filter(
    dashboard_id:  int,
    filter_id:     int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    pf = filter_repo.get_by_id(db, filter_id)
    if not pf or pf.dashboard_id != dashboard_id:
        raise HTTPException(404, "Period filter not found")
    db.delete(pf)
    db.commit()
