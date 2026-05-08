"""
schemas/kpi_threshold.py


"""
from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from datetime import datetime

from app.schemas.enums import (
    KpiNameEnum, ThresholdTypeEnum,
    HIGHER_IS_WORSE, LOWER_IS_WORSE, NEUTRAL_KPIS, ALL_KPI_NAMES,
)

__all__ = [
    "KpiThresholdCreate", "KpiThresholdUpdate", "KpiThresholdResponse",
    "KpiAlertLevel",
]


class KpiThresholdCreate(BaseModel):
    project_id:        int
    kpi_definition_id: int = Field(
        description="ID de la KpiDefinition (obligatoire — NOT NULL en DB)"
    )
    warning_value:     float = Field(..., ge=0, description="Valeur seuil d'avertissement")
    critical_value:    float = Field(..., ge=0, description="Valeur seuil critique")
    threshold_type:    ThresholdTypeEnum = ThresholdTypeEnum.MONTHLY
    dashboard_id:      Optional[int] = None
    # ✅ AJOUT : seuil configurable par site
    site_id:           Optional[int] = Field(
        default=None,
        description="Site concerné (NULL = seuil global tous sites)",
    )
    kpi_name: Optional[str] = Field(
        default=None,
        description="Code KPI ex: AVG_REVIEW_TIME (optionnel, pour validation sens)",
    )

    @model_validator(mode="after")
    def validate_threshold_order(self) -> "KpiThresholdCreate":
        kpi = self.kpi_name
        w   = self.warning_value
        c   = self.critical_value

        if w == c:
            raise ValueError("warning_value et critical_value ne peuvent pas être égaux.")

        if kpi is None:
            return self

        if kpi in HIGHER_IS_WORSE:
            if w >= c:
                raise ValueError(
                    f"Pour '{kpi}' (plus grand = pire), "
                    f"warning ({w}) doit être < critical ({c})."
                )
        elif kpi in LOWER_IS_WORSE:
            if w <= c:
                raise ValueError(
                    f"Pour '{kpi}' (plus petit = pire), "
                    f"warning ({w}) doit être > critical ({c})."
                )
        return self


class KpiThresholdUpdate(BaseModel):
    warning_value:  Optional[float]             = Field(default=None, ge=0)
    critical_value: Optional[float]             = Field(default=None, ge=0)
    threshold_type: Optional[ThresholdTypeEnum] = None
    dashboard_id:   Optional[int]               = None
    # ✅ AJOUT
    site_id:        Optional[int]               = None


class KpiThresholdResponse(BaseModel):
    id:                int
    project_id:        int
    kpi_definition_id: int
    kpi_name:          Optional[str]  = None   # @property SQLAlchemy via from_attributes
    warning_value:     float
    critical_value:    float
    threshold_type:    str
    created_by:        Optional[int]
    dashboard_id:      Optional[int]
    # ✅ AJOUT
    site_id:           Optional[int]  = None
    created_at:        datetime

    model_config = {
        "from_attributes":   True,
        "populate_by_name":  True,
    }


class KpiAlertLevel(BaseModel):
    """
    Résultat de l'évaluation d'un KPI par rapport à ses seuils.
    Affiché comme badge coloré dans le dashboard frontend.
    """
    kpi_name:          str
    kpi_code:          Optional[str]  = None
    value:             Optional[float]
    warning_value:     float
    critical_value:    float
    level:             Literal["ok", "warning", "critical", "unknown"]
    color:             Literal["green", "yellow", "red", "gray"]
    dashboard_id:      Optional[int]  = None
    kpi_definition_id: Optional[int]  = None
    # ✅ AJOUT : site concerné par ce seuil
    site_id:           Optional[int]  = None