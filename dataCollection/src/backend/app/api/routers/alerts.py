"""
api/routers/alerts.py
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.database.session import get_db
from app.models.alert import AlertLevelEnum
from app.models.app_user import AppUser
from app.schemas.alert import (
    AlertAcknowledgeRequest,
    AlertResponse,
    AlertSummaryResponse,
    DeveloperAlertSummary,
)
from app.services.kpi.alert_service import AlertService

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/alerts", tags=["Alerts"])
service = AlertService()


@router.get("/summary", response_model=AlertSummaryResponse)
def get_alert_summary(
    project_id:   Optional[int] = Query(default=None),
    dashboard_id: Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    return service.get_alert_summary(db, project_id, dashboard_id)


@router.get("/developer/{developer_id}/summary", response_model=DeveloperAlertSummary)
def get_developer_alert_summary(
    developer_id: int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """✅ NOUVEAU : résumé alertes pour la page profil développeur."""
    return service.get_developer_alert_summary(db, developer_id)


@router.get("/developer/{developer_id}", response_model=List[AlertResponse])
def list_developer_alerts(
    developer_id: int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """✅ NOUVEAU : alertes non résolues d'un développeur."""
    from app.repositories.alert_repository import AlertRepository
    alert_repo = AlertRepository()
    return alert_repo.get_by_developer(db, developer_id, unresolved_only=True)


@router.get("", response_model=List[AlertResponse])
def list_alerts(
    project_id:   Optional[int]            = Query(default=None),
    dashboard_id: Optional[int]            = Query(default=None),
    level:        Optional[AlertLevelEnum] = Query(default=None),
    site_id:      Optional[int]            = Query(default=None),
    # ✅ AJOUT : filtre par développeur
    developer_id: Optional[int]            = Query(default=None),
    limit:        int                      = Query(default=100, ge=1, le=500),
    offset:       int                      = Query(default=0, ge=0),
    db:           Session                  = Depends(get_db),
    current_user: AppUser                  = Depends(get_current_user),
):
    return service.get_active_alerts(
        db, project_id=project_id, dashboard_id=dashboard_id,
        level=level, site_id=site_id, developer_id=developer_id,
        limit=limit, offset=offset,
    )


@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(
    alert_id:     int,
    request:      AlertAcknowledgeRequest,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    return service.acknowledge_alert(
        db=db, alert_id=alert_id, user_id=current_user.id, is_resolved=request.is_resolved
    )


@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(
    alert_id:      int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    return service.resolve_alert(db, alert_id)
