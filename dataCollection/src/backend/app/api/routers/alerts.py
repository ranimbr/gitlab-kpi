"""api/routers/alerts.py — inchangé."""
import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database.session import get_db
from app.api.dependencies import get_current_user, get_current_admin
from app.schemas.alert import AlertResponse, AlertAcknowledgeRequest, AlertSummaryResponse
from app.services.kpi.alert_service import AlertService
from app.models.alert import AlertLevelEnum
from app.models.app_user import AppUser

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/alerts", tags=["Alerts"])
service = AlertService()

@router.get("/summary", response_model=AlertSummaryResponse)
def get_alert_summary(project_id: Optional[int] = Query(default=None), dashboard_id: Optional[int] = Query(default=None), db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    return service.get_alert_summary(db, project_id, dashboard_id)

@router.get("/", response_model=List[AlertResponse])
def list_alerts(project_id: Optional[int] = Query(default=None), dashboard_id: Optional[int] = Query(default=None), level: Optional[AlertLevelEnum] = Query(default=None), db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    return service.get_active_alerts(db, project_id, dashboard_id, level)

@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(alert_id: int, request: AlertAcknowledgeRequest, db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_user)):
    return service.acknowledge_alert(db=db, alert_id=alert_id, user_id=current_user.id, is_resolved=request.is_resolved)

@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(alert_id: int, db: Session = Depends(get_db), current_admin: AppUser = Depends(get_current_admin)):
    return service.resolve_alert(db, alert_id)