"""
schemas/extraction_lot.py

CORRECTIONS :

    1. FIX CRITIQUE — ExtractionLotResponse : champ `type` → `extraction_type`

    2. FIX — ExtractionRunResponse : idem, type → extraction_type.

    3. FIX — ExtractionLotCreate : champ extraction_type cohérent avec le router.

    4. AJOUT — is_backfill: bool = False dans ExtractionLotCreate
       Permet au frontend d'envoyer { "is_backfill": true } pour le mode Backfill.
       Sans ce champ, le router reçoit toujours False via getattr() — comportement
       correct mais non documenté dans le schéma OpenAPI.

    5. AJOUT — ExtractionLotResponse inclut completed_at et error_message.
"""
from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import datetime

from app.schemas.enums import ExtractionTypeEnum


class ExtractionLotCreate(BaseModel):
    """
    Body POST /extraction/run.
    extraction_type est obligatoire.
    period_id obligatoire si MONTHLY.
    is_backfill optionnel — si True + MONTHLY : recalcule sans lever 409.
    """
    project_id:      int
    extraction_type: ExtractionTypeEnum = Field(
        description="REALTIME = extraction manuelle | MONTHLY = clôture mensuelle"
    )
    period_id: Optional[int] = Field(
        default=None,
        description="Obligatoire si extraction_type=MONTHLY",
    )
    # ✅ AJOUT : is_backfill pour le mode Backfill historique
    is_backfill: bool = Field(
        default=False,
        description=(
            "Si True + MONTHLY : recalcule les KPIs sur une période déjà extraite "
            "sans lever 409. Équivalent Airflow --backfill ou dbt run --full-refresh."
        ),
    )

    @model_validator(mode="after")
    def validate_monthly_requires_period(self) -> "ExtractionLotCreate":
        if self.extraction_type == ExtractionTypeEnum.MONTHLY and not self.period_id:
            raise ValueError("period_id est obligatoire pour une extraction MONTHLY.")
        return self


class ExtractionLotResponse(BaseModel):
    """
    Réponse GET /extraction-lots/{id}.
    """
    id:              int
    extraction_type: str = Field(alias="extraction_type")
    status:          str
    project_id:      int
    period_id:       int
    triggered_by:    Optional[int]
    generated_file:  Optional[str]
    md5sum:          Optional[str]
    error_message:   Optional[str]
    created_at:      datetime
    completed_at:    Optional[datetime]

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class ExtractionRunResponse(BaseModel):
    """
    Réponse POST /extraction/run.
    """
    message:         str
    lot_id:          int
    extraction_type: str = Field(description="REALTIME | MONTHLY")
    project_id:      int
    period_id:       int
    generated_file:  Optional[str] = None
    md5sum:          Optional[str] = None