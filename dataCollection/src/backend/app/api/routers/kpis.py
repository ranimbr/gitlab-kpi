from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database.session import get_db
from app.api.dependencies import get_current_user
from app.models.app_user import AppUser
from app.services.kpi.analytics_service import AnalyticsService
from app.schemas.kpi import DashboardSummaryResponse

router = APIRouter(prefix="/kpis", tags=["KPIs"])


@router.get("/dashboard", response_model=DashboardSummaryResponse)
def get_dashboard_kpis(
    project_id  : int           = Query(...),
    site        : Optional[str] = Query(default=None, description="Filtrer par site"),
    db          : Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user)
):
    service = AnalyticsService(db)
    result  = service.get_dashboard_summary(project_id, site)

    if not result["latest_metrics"]:
        raise HTTPException(
            status_code = 404,
            detail      = "No KPI data found for this project"
        )

    return result