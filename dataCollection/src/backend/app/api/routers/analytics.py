from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional

from app.database.session import get_db
from app.services.kpi.analytics_service import AnalyticsService
from app.services.kpi.kpi_aggregator import KpiAggregator
from app.api.dependencies import get_current_user, get_current_admin
from app.models.app_user import AppUser
from app.schemas.kpi import (
    KpiSnapshotResponse, KpiHistoryResponse,
    DashboardSummaryResponse, SnapshotGeneratedResponse
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/{project_id}/latest", response_model=KpiSnapshotResponse)
def get_latest_kpis(
    project_id  : int,
    site        : Optional[str] = Query(default=None),
    db          : Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user)
):
    service = AnalyticsService(db)
    result  = service.get_latest_kpis(project_id, site)

    if not result:
        raise HTTPException(
            status_code = 404,
            detail      = "No KPI snapshot found for this project"
        )
    return result


@router.get("/{project_id}/history", response_model=KpiHistoryResponse)
def get_kpi_history(
    project_id  : int,
    site        : Optional[str]  = Query(default=None),
    start_date  : Optional[date] = Query(default=None),
    end_date    : Optional[date] = Query(default=None),
    db          : Session        = Depends(get_db),
    current_user: AppUser        = Depends(get_current_user)
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code = 400,
            detail      = "start_date cannot be after end_date"
        )

    service   = AnalyticsService(db)
    snapshots = service.get_kpi_history(project_id, site, start_date, end_date)
    return {"snapshots": snapshots}


@router.get("/{project_id}/dashboard", response_model=DashboardSummaryResponse)
def get_dashboard(
    project_id  : int,
    site        : Optional[str] = Query(default=None),
    db          : Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user)
):
    return AnalyticsService(db).get_dashboard_summary(project_id, site)


@router.post(
    "/{project_id}/generate-snapshot",
    response_model = SnapshotGeneratedResponse
)
def generate_snapshot(
    project_id   : int,
    year         : int           = Query(..., ge=2000),
    month        : int           = Query(..., ge=1, le=12),
    site         : Optional[str] = Query(default=None),
    db           : Session       = Depends(get_db),
    current_admin: AppUser       = Depends(get_current_admin)
):
    """
    Génère manuellement les snapshots KPI pour un projet/période.
    Admin uniquement.
    """
    aggregator = KpiAggregator(db)
    snapshots  = aggregator.generate_monthly_snapshots(project_id, year, month)

    if not snapshots:
        raise HTTPException(status_code=404, detail="No snapshots generated")

    target = next((s for s in snapshots if s.site == site), snapshots[0])

    return SnapshotGeneratedResponse(
        message       = f"Snapshots generated successfully ({len(snapshots)} total)",
        snapshot_date = target.snapshot_date,
        period_id     = target.period_id,
        project_id    = target.project_id,
        site          = target.site
    )