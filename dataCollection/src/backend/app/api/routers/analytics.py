"""
api/routers/analytics.py

"""
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.schemas.kpi import (
    DashboardSummaryResponse,
    KpiHistoryResponse,
    KpiSnapshotResponse,
    SnapshotGeneratedResponse,
)
from app.services.kpi.analytics_service import AnalyticsService
from app.services.kpi.kpi_aggregator import KpiAggregator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/{project_id}/latest", response_model=KpiSnapshotResponse)
def get_latest_kpis(
    project_id:   int,
    site_id:      Optional[int] = Query(default=None),
    group_id:     Optional[int] = Query(default=None),
    developer_id: Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    service = AnalyticsService(db)
    result  = service.get_latest_kpis(project_id, site_id, group_id, developer_id)

    if not result:
        raise HTTPException(
            status_code=404,
            detail="No KPI snapshot found for this project",
        )
    return result


@router.get("/{project_id}/history", response_model=KpiHistoryResponse)
def get_kpi_history(
    project_id:   int,
    site_id:      Optional[int]  = Query(default=None),
    group_id:     Optional[int]  = Query(default=None),
    developer_id: Optional[int]  = Query(default=None),
    start_date:   Optional[date] = Query(default=None),
    end_date:     Optional[date] = Query(default=None),
    db:           Session        = Depends(get_db),
    current_user: AppUser        = Depends(get_current_user),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    service   = AnalyticsService(db)
    snapshots = service.get_kpi_history(
        project_id, site_id, group_id, developer_id, start_date, end_date
    )

    # ✅ FIX : utilise le factory method qui renseigne project_id, site_id, total
    return KpiHistoryResponse.from_snapshots(
        snapshots  = snapshots,
        project_id = project_id,
        site_id    = site_id,
    )


@router.get("/{project_id}/dashboard", response_model=DashboardSummaryResponse)
def get_dashboard(
    project_id:   int,
    site_id:      Optional[int] = Query(default=None),
    group_id:     Optional[int] = Query(default=None),
    developer_id: Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    summary = AnalyticsService(db).get_dashboard_summary(
        project_id, site_id, group_id, developer_id
    )
    # Enrichir avec les métadonnées requises par DashboardSummaryResponse
    summary["project_id"]   = project_id
    summary["site_id"]      = site_id
    return summary


@router.post("/{project_id}/generate-snapshot", response_model=SnapshotGeneratedResponse)
def generate_snapshot(
    project_id:    int,
    year:          int           = Query(..., ge=2000),
    month:         int           = Query(..., ge=1, le=12),
    site_id:       Optional[int] = Query(default=None),
    db:            Session       = Depends(get_db),
    current_admin: AppUser       = Depends(get_current_admin),
):
    """Génère manuellement les snapshots KPI. Admin uniquement."""
    aggregator = KpiAggregator(db)
    snapshots  = aggregator.generate_monthly_snapshots(project_id, year, month)

    if not snapshots:
        raise HTTPException(status_code=404, detail="No snapshots generated")

    # Filtre par site_id si fourni, sinon premier snapshot
    target = next(
        (s for s in snapshots if s.site_id == site_id),
        snapshots[0],
    )

    return SnapshotGeneratedResponse(
        message               = f"Snapshots generated successfully ({len(snapshots)} total)",
        snapshot_date         = target.snapshot_date,
        period_id             = target.period_id,
        project_id            = target.project_id,
        site_id               = target.site_id,
        mr_rate_per_site      = target.mr_rate_per_site,
        avg_review_time_hours = target.avg_review_time_hours,
    )