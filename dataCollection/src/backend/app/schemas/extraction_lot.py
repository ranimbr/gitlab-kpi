"""
schemas/extraction_lot.py

"""
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime

from app.schemas.enums import ExtractionTypeEnum


# ── Objets imbriqués légers (évite de serializer toute l'entité) ──────────────

class DeveloperSummary(BaseModel):
    """Résumé minimal d'un développeur pour les lots d'extraction."""
    id:               int
    name:             Optional[str] = None
    gitlab_username:  Optional[str] = None
    site:             Optional[str] = None

    model_config = {"from_attributes": True}


class UserSummary(BaseModel):
    """Résumé minimal d'un utilisateur (triggered_by_user)."""
    id:    int
    name:  Optional[str] = None
    email: Optional[str] = None

    model_config = {"from_attributes": True}



class PeriodSummary(BaseModel):
    """Résumé minimal d'une période pour les lots d'extraction."""
    id:    int
    year:  int
    month: int

    model_config = {"from_attributes": True}


class ProjectSummary(BaseModel):
    """Résumé minimal d'un projet pour les lots d'extraction."""
    id:   int
    name: Optional[str] = None

    model_config = {"from_attributes": True}

class ExtractionLotCreate(BaseModel):
    """
    Body POST /extraction/run.
    extraction_type est obligatoire.
    period_id obligatoire si MONTHLY.
    is_backfill optionnel — si True + MONTHLY : recalcule sans lever 409.
    """
    project_id:       Optional[int]       = None
    developer_ids:    Optional[List[int]] = Field(default=None, description="Axe optionnel : extraire pour un ou plusieurs contributeurs spécifiques")
    gitlab_config_id: Optional[int]       = Field(default=None, description="Requis si project_id est absent pour identifier l'instance GitLab")
    
    extraction_type: ExtractionTypeEnum = Field(
        description="REALTIME = extraction manuelle | MONTHLY = clôture mensuelle"
    )
    period_id: Optional[int] = Field(
        default=None,
        description="Obligatoire si extraction_type=MONTHLY",
    )
    # ✅ AJOUT : auto_target_by_period pour le mode "Smart-Sync" (Senior)
    auto_target_by_period: bool = Field(
        default=False,
        description="Si True : sélectionne automatiquement les développeurs actifs durant la période (Sync RH)."
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
    def validate_extraction_targets(self) -> "ExtractionLotCreate":
        # ✅ RÉVISION SENIOR : On n'exige plus project_id si on fait une extraction par IDs
        # OU si on utilise auto_target_by_period.
        if not self.project_id and not self.developer_ids and not self.auto_target_by_period:
            raise ValueError("Vous devez spécifier au moins un 'project_id', des 'developer_ids' ou activer 'auto_target_by_period'.")
        return self

    @model_validator(mode="after")
    def validate_monthly_requires_period(self) -> "ExtractionLotCreate":
        if self.extraction_type == ExtractionTypeEnum.MONTHLY and not self.period_id:
            raise ValueError("period_id est obligatoire pour une extraction MONTHLY.")
        return self



class ExtractionLotResponse(BaseModel):
    """
    Réponse GET /extraction-lots — inclut les objets imbriqués
    developer et triggered_by_user pour éviter les lookups côté frontend.
    """
    id:              int
    extraction_type: str = Field(alias="extraction_type")
    status:          str
    project_id:      Optional[int]
    developer_id:    Optional[int] = None
    period_id:       int
    triggered_by:    Optional[int]
    generated_file:  Optional[str]
    md5sum:          Optional[str]
    error_message:   Optional[str]
    created_at:      datetime
    completed_at:    Optional[datetime]
    commit_count:    int = 0
    mr_count:        int = 0

    # ── [SENIOR] Observabilité & Monitoring ──
    step_progress:     int            = 0
    current_action:    Optional[str]  = None
    duration_ms:       int            = 0
    items_count:       int            = 0
    api_calls_count:   int            = 0
    retry_count:       int            = 0
    metadata_summary:  Optional[str]  = None

    # ✅ AJOUT : objets imbriqués — évite d'afficher "User #1" et "Dev #42"
    developer:          Optional[DeveloperSummary] = None
    triggered_by_user:  Optional[UserSummary]      = None
    period:             Optional[PeriodSummary]    = None
    project:            Optional[ProjectSummary]   = None

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
    project_id:      Optional[int]
    developer_id:    Optional[int] = None
    period_id:       int
    generated_file:  Optional[str] = None
    md5sum:          Optional[str] = None


class BulkDeleteRequest(BaseModel):
    """Requête de suppression en masse."""
    lot_ids: List[int]