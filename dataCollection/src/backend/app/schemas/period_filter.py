"""
schemas/period_filter.py

"""
from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import datetime

from app.schemas.enums import PeriodFilterTypeEnum


class PeriodFilterCreate(BaseModel):
    """
    Création d'un filtre de période pour un dashboard.

    Types dynamiques (is_dynamic=True) : date_from/date_to calculés à la volée.
    Type custom (is_dynamic=False)     : date_from/date_to saisis manuellement.

    ✅ FIX : pour les types dynamiques, les dates fournies sont ignorées
    (set à None) plutôt que de lever une erreur — évite des rejets inutiles
    quand le frontend envoie des valeurs résiduelles.
    """
    dashboard_id: int
    type:         PeriodFilterTypeEnum = PeriodFilterTypeEnum.lastMonth
    date_from:    Optional[datetime]   = None
    date_to:      Optional[datetime]   = None
    is_dynamic:   Optional[bool]       = None

    @model_validator(mode="after")
    def validate_and_set_dynamic(self) -> "PeriodFilterCreate":
        # Auto-set is_dynamic selon le type si non fourni
        if self.is_dynamic is None:
            self.is_dynamic = (self.type != PeriodFilterTypeEnum.custom)

        if self.type == PeriodFilterTypeEnum.custom:
            # Type custom : date_from et date_to OBLIGATOIRES
            if not self.date_from or not self.date_to:
                raise ValueError(
                    "date_from et date_to sont obligatoires pour le type 'custom'."
                )
            if self.date_from >= self.date_to:
                raise ValueError(
                    "date_from doit être strictement antérieur à date_to."
                )
        else:
            # ✅ FIX : types dynamiques → ignorer les dates plutôt qu'erreur
            # Le frontend peut envoyer des dates résiduelles lors d'un changement
            # de type — on les efface silencieusement au lieu de rejeter la requête.
            self.date_from = None
            self.date_to   = None

        return self


class PeriodFilterUpdate(BaseModel):
    type:       Optional[PeriodFilterTypeEnum] = None
    date_from:  Optional[datetime]             = None
    date_to:    Optional[datetime]             = None
    is_dynamic: Optional[bool]                 = None

    @model_validator(mode="after")
    def validate_update(self) -> "PeriodFilterUpdate":
        """Si le type change vers custom, valider les dates."""
        if self.type == PeriodFilterTypeEnum.custom:
            if not self.date_from or not self.date_to:
                raise ValueError(
                    "date_from et date_to sont obligatoires pour le type 'custom'."
                )
            if self.date_from >= self.date_to:
                raise ValueError("date_from doit être antérieur à date_to.")
        elif self.type is not None and self.type != PeriodFilterTypeEnum.custom:
            # Changement vers un type dynamique → effacer les dates
            self.date_from = None
            self.date_to   = None
        return self


class PeriodFilterResponse(BaseModel):
    id:           int
    dashboard_id: int
    type:         str
    date_from:    Optional[datetime]
    date_to:      Optional[datetime]
    is_dynamic:   bool
    created_at:   datetime

    model_config = {"from_attributes": True}