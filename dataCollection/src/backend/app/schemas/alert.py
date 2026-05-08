"""
schemas/alert.py

"""
from pydantic import BaseModel, model_validator, Field
from typing import Optional, List
from datetime import datetime

from app.schemas.enums import AlertLevelEnum


class AlertResponse(BaseModel):
    id:              int
    level:           str         # "WARNING" | "CRITICAL"
    kpi_value:       float
    threshold_value: float
    triggered_at:    datetime
    acknowledged_at: Optional[datetime]
    is_resolved:     bool
    threshold_id:    int
    kpi_snapshot_id: int
    acknowledged_by: Optional[int]
    acknowledged_by_name: Optional[str] = None
    # ✅ AJOUT : développeur concerné (NULL = alerte globale)
    developer_id:    Optional[int] = None
    created_at:      datetime

    model_config = {"from_attributes": True}


class AlertAcknowledgeRequest(BaseModel):
    """Body PATCH /alerts/{id}/acknowledge."""
    is_resolved: bool = False


class AlertFilterParams(BaseModel):
    project_id:   Optional[int]            = None
    dashboard_id: Optional[int]            = None
    level:        Optional[AlertLevelEnum] = None
    is_resolved:  Optional[bool]           = None
    site_id:      Optional[int]            = None
    # ✅ AJOUT : filtrer les alertes d'un développeur spécifique
    developer_id: Optional[int]            = None

    triggered_after:  Optional[datetime] = None
    triggered_before: Optional[datetime] = None

    # Pagination
    page:  int = Field(default=1, ge=1)
    limit: int = Field(default=50, ge=1, le=200)

    @model_validator(mode="after")
    def validate_date_range(self) -> "AlertFilterParams":
        if self.triggered_after and self.triggered_before:
            if self.triggered_after >= self.triggered_before:
                raise ValueError("triggered_after doit être antérieur à triggered_before.")
        return self


class AlertSummaryResponse(BaseModel):
    """Résumé des alertes actives — topbar du dashboard."""
    total_active:     int
    total_warning:    int
    total_critical:   int
    total_resolved:   int
    last_critical_at: Optional[datetime] = None


class DeveloperAlertSummary(BaseModel):
    """
    Résumé des alertes actives pour un développeur spécifique.
    Affiché dans la page profil développeur.
    Retourné par GET /alerts/developer/{developer_id}/summary.
    """
    developer_id:    int
    developer_name:  Optional[str] = None
    total_active:    int
    total_warning:   int
    total_critical:  int
    last_alert_at:   Optional[datetime] = None
    # Dernière alerte non résolue (pour affichage immédiat)
    last_alert:      Optional[AlertResponse] = None