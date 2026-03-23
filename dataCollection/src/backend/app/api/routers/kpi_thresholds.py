"""
api/routers/kpi_thresholds.py

"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.schemas.kpi_threshold import (
    KpiAlertLevel,
    KpiThresholdCreate,
    KpiThresholdResponse,
    KpiThresholdUpdate,
)
from app.services.kpi.threshold_service import ThresholdService

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/kpi-thresholds", tags=["KPI Thresholds"])
service = ThresholdService()

# IMPORTANT : /evaluate et routes sans path param AVANT /{threshold_id}

# ─── Évaluer les KPIs ─────────────────────────────────────────────────────────

@router.get(
    "/evaluate",
    response_model = List[KpiAlertLevel],
    summary        = "Évaluer les KPIs par rapport aux seuils configurés",
)
def evaluate_kpis(
    project_id:   int           = Query(...),
    dashboard_id: Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    """
    Compare les dernières valeurs KPI aux seuils configurés.
    Retourne le niveau d'alerte (ok/warning/critical) pour chaque KPI.
    """
    from app.services.kpi.analytics_service import AnalyticsService

    analytics = AnalyticsService(db)
    latest    = analytics.get_latest_kpis(project_id)

    if not latest:
        raise HTTPException(
            status_code=404,
            detail=f"Aucun snapshot KPI trouvé pour le projet {project_id}.",
        )

    # ✅ FIX : clés = codes KpiDefinition (uppercase) qui correspondent à
    # HIGHER_IS_WORSE / LOWER_IS_WORSE dans enums.py
    # Mapping : champ snapshot → code KpiDefinition
    kpi_values = {
        "MR_RATE_SITE":       latest.mr_rate_per_site,
        "APPROVED_MR_RATE":   latest.approved_mr_rate,
        "MERGED_MR_RATE":     latest.merged_mr_rate,
        "COMMIT_RATE_SITE":   latest.commit_rate_per_site,
        "NB_COMMITS_PROJECT": float(latest.nb_commits_per_project or 0),
        "AVG_REVIEW_TIME":    latest.avg_review_time_hours,
    }

    return service.evaluate_kpis(db, project_id, kpi_values, dashboard_id)


# ─── Lister les seuils ────────────────────────────────────────────────────────

@router.get("", response_model=List[KpiThresholdResponse])
def list_thresholds(
    project_id:   int           = Query(...),
    dashboard_id: Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    if dashboard_id:
        return service.get_dashboard_thresholds(db, dashboard_id)
    return service.get_project_thresholds(db, project_id)


# ─── Créer un seuil ───────────────────────────────────────────────────────────

@router.post("", response_model=KpiThresholdResponse, status_code=201)
def create_threshold(
    request:       KpiThresholdCreate,
    req:           Request,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    return service.create_threshold(
        db         = db,
        payload    = request,
        created_by = current_admin.id,
        ip_address = req.client.host if req.client else None,
    )


# ─── Mettre à jour ────────────────────────────────────────────────────────────

@router.put("/{threshold_id}", response_model=KpiThresholdResponse)
def update_threshold(
    threshold_id:  int,
    request:       KpiThresholdUpdate,
    req:           Request,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    return service.update_threshold(
        db           = db,
        threshold_id = threshold_id,
        payload      = request,
        updated_by   = current_admin.id,
        ip_address   = req.client.host if req.client else None,
    )


# ─── Supprimer ────────────────────────────────────────────────────────────────

@router.delete("/{threshold_id}", status_code=204)
def delete_threshold(
    threshold_id:  int,
    req:           Request,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    service.delete_threshold(
        db           = db,
        threshold_id = threshold_id,
        deleted_by   = current_admin.id,
        ip_address   = req.client.host if req.client else None,
    )