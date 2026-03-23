"""schemas/period.py — inchangé fonctionnellement."""
from pydantic import BaseModel, model_validator
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
    id:         int
    year:       int
    month:      int
    status:     str
    closed_at:  Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class PeriodCloseResponse(BaseModel):
    message:   str
    period_id: int
    year:      int
    month:     int
    closed_at: Optional[datetime]
