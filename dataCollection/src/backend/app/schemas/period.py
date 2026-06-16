"""schemas/period.py """
from pydantic import BaseModel, model_validator, computed_field
from typing import Optional
from datetime import datetime


class PeriodCreate(BaseModel):
    year:  int
    month: int

    @model_validator(mode="after")
    def validate_period(self) -> "PeriodCreate":
        if not (1 <= self.month <= 12):
            raise ValueError("month doit être entre 1 et 12.")
        if self.year < 2000:
            raise ValueError("year doit être >= 2000.")
        return self


class PeriodResponse(BaseModel):
    id:              int
    year:            int
    month:           int
    status:          str
    created_at:      datetime
    closed_at:       Optional[datetime] = None
    closed_by_id:    Optional[int] = None
    closed_by_name:  Optional[str] = None
    closure_summary: Optional[dict] = None
    headcount_snapshot: Optional[int] = None

    @computed_field
    @property
    def name(self) -> str:
        mois_fr = [
            "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
            "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
        ]
        return f"{mois_fr[self.month - 1]} {self.year}"

    model_config = {
        "from_attributes": True,
    }


class PeriodCloseResponse(BaseModel):
    message:         str
    period_id:       int
    year:            int
    month:           int
    closed_at:       Optional[datetime]
    closed_by_id:    Optional[int] = None
    closure_summary: Optional[dict] = None

