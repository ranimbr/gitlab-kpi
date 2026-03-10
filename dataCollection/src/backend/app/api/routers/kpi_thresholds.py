import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.api.dependencies import get_current_user, get_current_admin
from app.models.app_user import AppUser
from app.schemas.kpi_threshold import (
    KpiThresholdCreate,
    KpiThresholdUpdate,
    KpiThresholdResponse,
    KpiAlertLevel,
)
from app.services.kpi.threshold_service import ThresholdService

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/kpi-thresholds", tags=["KPI Thresholds"])
service = ThresholdService()


# =============================================================================
# IMPORTANT — ordre des routes
# =============================================================================
# La route /evaluate DOIT être déclarée AVANT /{threshold_id}.
# Sinon FastAPI interpréterait /evaluate comme threshold_id="evaluate"
# et retournerait 422 (int attendu).
# =============================================================================


# ─── Évaluer les KPIs d'un projet ────────────────────────────────────────────
# Déclarée EN PREMIER avant /{threshold_id}

@router.get(
    "/evaluate",
    response_model=List[KpiAlertLevel],
    summary="Évaluer les KPIs par rapport aux seuils configurés",
)
def evaluate_kpis(
    project_id:   int     = Query(..., description="ID du projet à évaluer"),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Compare les dernières valeurs KPI du projet aux seuils configurés.
    Retourne le niveau d'alerte pour chaque KPI : ok / warning / critical / unknown.
    Utilisé par le frontend pour afficher 🟢🟡🔴.

    Si aucun seuil n'est configuré pour un KPI → level="ok" par défaut.
    Si la valeur est None (extraction incomplète) → level="unknown" / color="gray".
    """
    from app.services.kpi.analytics_service import AnalyticsService

    analytics = AnalyticsService(db)
    latest    = analytics.get_latest_kpis(project_id)

    if not latest:
        raise HTTPException(
            status_code=404,
            detail=f"Aucun snapshot KPI trouvé pour le projet {project_id}.",
        )

    kpi_values = {
        "mr_rate_per_site":       latest.mr_rate_per_site,
        "approved_mr_rate":       latest.approved_mr_rate,
        "merged_mr_rate":         latest.merged_mr_rate,
        "commit_rate_per_site":   latest.commit_rate_per_site,
        "nb_commits_per_project": float(latest.nb_commits_per_project) if latest.nb_commits_per_project is not None else None,
        "avg_review_time_hours":  latest.avg_review_time_hours,
    }

    return service.evaluate_kpis(db, project_id, kpi_values)


# ─── Lister les seuils d'un projet ───────────────────────────────────────────
# [FIX] "" au lieu de "/" — redirect_slashes=False dans main.py

@router.get(
    "",
    response_model=List[KpiThresholdResponse],
    summary="Lister les seuils KPI d'un projet",
)
def list_thresholds(
    project_id:   int     = Query(..., description="ID du projet"),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Retourne tous les seuils KPI configurés pour un projet."""
    return service.get_project_thresholds(db, project_id)


# ─── Créer un seuil ──────────────────────────────────────────────────────────
# [FIX] "" au lieu de "/" — redirect_slashes=False dans main.py

@router.post(
    "",
    response_model=KpiThresholdResponse,
    status_code=201,
    summary="Créer un seuil KPI (admin)",
)
def create_threshold(
    request:       KpiThresholdCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """
    Crée un seuil d'alerte pour un KPI. **Admin uniquement.**

    KPIs valides :
    - `mr_rate_per_site`       — LOWER_IS_WORSE (warning > critical)
    - `approved_mr_rate`       — LOWER_IS_WORSE (warning > critical)
    - `merged_mr_rate`         — LOWER_IS_WORSE (warning > critical)
    - `commit_rate_per_site`   — LOWER_IS_WORSE (warning > critical)
    - `nb_commits_per_project` — Neutre (warning < critical)
    - `avg_review_time_hours`  — HIGHER_IS_WORSE (warning < critical)

    Retourne HTTP 409 si un seuil existe déjà pour ce KPI/projet.
    """
    return service.create_threshold(db, request, current_admin.id)


# ─── Mettre à jour un seuil ──────────────────────────────────────────────────

@router.put(
    "/{threshold_id}",
    response_model=KpiThresholdResponse,
    summary="Mettre à jour un seuil KPI (admin)",
)
def update_threshold(
    threshold_id:  int,
    request:       KpiThresholdUpdate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """
    Met à jour `warning_value` et/ou `critical_value`. **Admin uniquement.**
    Accepte un patch partiel (un seul champ).
    Valide l'ordre warning/critical selon la sémantique du KPI.
    """
    return service.update_threshold(db, threshold_id, request)


# ─── Supprimer un seuil ──────────────────────────────────────────────────────

@router.delete(
    "/{threshold_id}",
    status_code=204,
    summary="Supprimer un seuil KPI (admin)",
)
def delete_threshold(
    threshold_id:  int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """Supprime un seuil KPI. **Admin uniquement.**"""
    service.delete_threshold(db, threshold_id)
