from pydantic import BaseModel, model_validator
from typing import Optional
from datetime import datetime


class PeriodCreate(BaseModel):
    year  : int
    month : int

    @model_validator(mode="after")
    def validate_period(self):
        if not (1 <= self.month <= 12):
            raise ValueError("month must be between 1 and 12")
        if self.year < 2000:
            raise ValueError("year must be >= 2000")
        return self


class PeriodResponse(BaseModel):
    id        : int
    year      : int
    month     : int
    status    : str
    closed_at : Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class PeriodCloseResponse(BaseModel):
    message   : str
    period_id : int
    year      : int
    month     : int
    closed_at : datetime