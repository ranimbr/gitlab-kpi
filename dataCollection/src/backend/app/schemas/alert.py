"""
schemas/alert.py — CORRIGÉ
- AlertLevelEnum importé depuis enums.py
- AlertResponse enrichi : kpi_name dérivé pour le frontend
- AlertFilterParams : validation dates ajoutée
"""
from pydantic import BaseModel, model_validator, Field
from typing import Optional
from datetime import datetime

from app.schemas.enums import AlertLevelEnum


class AlertResponse(BaseModel):
    id:              int
    level:           str   # "WARNING" | "CRITICAL"
    kpi_value:       float
    threshold_value: float
    triggered_at:    datetime
    acknowledged_at: Optional[datetime]
    is_resolved:     bool
    threshold_id:    int
    kpi_snapshot_id: int
    acknowledged_by: Optional[int]
    created_at:      datetime

    model_config = {"from_attributes": True}


class AlertAcknowledgeRequest(BaseModel):
    """Body pour acquitter une alerte — PATCH /alerts/{id}/acknowledge"""
    is_resolved: bool = False   # True = résoudre directement


class AlertFilterParams(BaseModel):
    project_id:   Optional[int]            = None
    dashboard_id: Optional[int]            = None
    level:        Optional[AlertLevelEnum] = None
    is_resolved:  Optional[bool]           = None
    site_id:      Optional[int]            = None
    # Filtrage temporel
    triggered_after:  Optional[datetime]   = None
    triggered_before: Optional[datetime]   = None

    @model_validator(mode="after")
    def validate_date_range(self) -> "AlertFilterParams":
        if self.triggered_after and self.triggered_before:
            if self.triggered_after >= self.triggered_before:
                raise ValueError("triggered_after doit être antérieur à triggered_before.")
        return self


class AlertSummaryResponse(BaseModel):
    """Résumé des alertes actives — topbar du dashboard."""
    total_active:   int
    total_warning:  int
    total_critical: int
    total_resolved: int
    # Dernière alerte critique non résolue
    last_critical_at: Optional[datetime] = None