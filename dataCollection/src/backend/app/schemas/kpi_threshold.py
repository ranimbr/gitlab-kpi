"""
schemas/kpi_threshold.py

CORRECTIONS :

    1. FIX CRITIQUE — KpiThresholdCreate : champ `type` → `threshold_type`
       Le modèle KpiThreshold.type a été renommé en threshold_type.
       AVANT : type: ThresholdTypeEnum → ne mappe plus sur le modèle
       ✅ FIX : threshold_type: ThresholdTypeEnum

    2. FIX — KpiThresholdResponse : idem, type → threshold_type.
       alias="type" pour rétrocompatibilité JSON si besoin.

    3. FIX — KpiThresholdUpdate : idem.

    4. KpiThresholdCreate.kpi_definition_id : OBLIGATOIRE (NOT NULL en DB).
       kpi_name reste optionnel — utilisé uniquement pour la validation
       métier du sens des seuils (warning < critical vs warning > critical).

    5. Enums importés depuis enums.py (source unique).
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
    "KpiAlertLevel", "KpiNameEnum", "ThresholdTypeEnum",
    "HIGHER_IS_WORSE", "LOWER_IS_WORSE", "NEUTRAL_KPIS", "ALL_KPI_NAMES",
]


class KpiThresholdCreate(BaseModel):
    """
    Création d'un seuil KPI.

    kpi_definition_id OBLIGATOIRE (NOT NULL dans le modèle).
    threshold_type remplace l'ancien champ `type`.

    Règles warning/critical selon le sens du KPI :
        HIGHER_IS_WORSE (AVG_REVIEW_TIME)  : warning < critical
        LOWER_IS_WORSE  (APPROVED_MR_RATE) : warning > critical
    """
    project_id:        int
    kpi_definition_id: int = Field(
        description="ID de la KpiDefinition associée (obligatoire — NOT NULL en DB)"
    )
    warning_value:  float = Field(..., description="Valeur seuil d'avertissement")
    critical_value: float = Field(..., description="Valeur seuil critique")

    # ✅ FIX : threshold_type au lieu de type
    threshold_type: ThresholdTypeEnum = Field(
        default=ThresholdTypeEnum.MONTHLY,
        description="REALTIME = seuil temps réel | MONTHLY = seuil clôture mensuelle",
    )
    dashboard_id: Optional[int] = None

    # kpi_name optionnel — pour validation métier du sens (warning/critical)
    # Si fourni, le validator vérifie la cohérence warning vs critical.
    # Dérivé de kpi_definition.code côté service après création.
    kpi_name: Optional[str] = Field(
        default=None,
        description="Code KPI ex: AVG_REVIEW_TIME (optionnel, pour validation sens)",
    )

    @model_validator(mode="after")
    def validate_threshold_order(self) -> "KpiThresholdCreate":
        """Valide la cohérence warning/critical selon le sens du KPI."""
        kpi = self.kpi_name
        w   = self.warning_value
        c   = self.critical_value

        if kpi is None:
            # Sans kpi_name, validation impossible ici → faite dans le service
            return self

        if kpi in HIGHER_IS_WORSE:
            if w >= c:
                raise ValueError(
                    f"Pour '{kpi}' (plus grand = pire), "
                    f"warning ({w}) doit être < critical ({c}). "
                    f"Exemple : warning=48h, critical=72h."
                )
        elif kpi in LOWER_IS_WORSE:
            if w <= c:
                raise ValueError(
                    f"Pour '{kpi}' (plus petit = pire), "
                    f"warning ({w}) doit être > critical ({c}). "
                    f"Exemple : warning=0.6, critical=0.3."
                )
        # NEUTRAL_KPIS : pas de contrainte d'ordre
        return self


class KpiThresholdUpdate(BaseModel):
    warning_value:  Optional[float]             = None
    critical_value: Optional[float]             = None
    # ✅ FIX : threshold_type au lieu de type
    threshold_type: Optional[ThresholdTypeEnum] = None
    dashboard_id:   Optional[int]               = None


class KpiThresholdResponse(BaseModel):
    id:                int
    project_id:        int
    kpi_definition_id: int

    # kpi_name lit la @property SQLAlchemy via from_attributes=True
    # La @property retourne kpi_definition.code — toujours cohérent
    # Optional car nécessite que kpi_definition soit chargé (joinedload)
    kpi_name: Optional[str] = None

    warning_value:  float
    critical_value: float

    # ✅ FIX : threshold_type au lieu de type
    threshold_type: str = Field(
        alias="threshold_type",
        description="REALTIME | MONTHLY",
    )

    created_by:   Optional[int]
    dashboard_id: Optional[int]
    created_at:   datetime

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class KpiAlertLevel(BaseModel):
    """
    Résultat de l'évaluation d'un KPI par rapport à ses seuils.
    Affiché comme badge coloré dans le dashboard frontend.

    level : "ok" | "warning" | "critical" | "unknown"
    color : "green" | "yellow" | "red" | "gray"
    """
    kpi_name:          str
    kpi_code:          Optional[str]   = None
    value:             Optional[float]
    warning_value:     float
    critical_value:    float
    level:             Literal["ok", "warning", "critical", "unknown"]
    color:             Literal["green", "yellow", "red", "gray"]
    dashboard_id:      Optional[int]   = None
    kpi_definition_id: Optional[int]   = None