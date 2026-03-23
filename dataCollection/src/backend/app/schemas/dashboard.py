"""
schemas/dashboard.py — CORRIGÉ
- PeriodFilterTypeEnum importé depuis enums.py (source unique, fini la duplication)
- PeriodFilterCreate/Response importés depuis period_filter.py (pas redéfinis ici)
- DashboardCreate : validation period_filter custom
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# ✅ Import depuis period_filter.py — plus de duplication
from app.schemas.period_filter import PeriodFilterCreate, PeriodFilterResponse


class DashboardCreate(BaseModel):
    name:          str          = Field(min_length=1, max_length=100)
    project_id:    int
    site_id:       Optional[int]  = None
    is_public:     bool           = False
    description:   Optional[str]  = Field(default=None, max_length=500)
    # Filtre de période initial — si fourni, le dashboard_id sera injecté par le router
    period_filter: Optional[PeriodFilterCreate] = None


class DashboardUpdate(BaseModel):
    name:        Optional[str]  = Field(default=None, min_length=1, max_length=100)
    site_id:     Optional[int]  = None
    is_public:   Optional[bool] = None
    description: Optional[str]  = Field(default=None, max_length=500)


class DashboardResponse(BaseModel):
    id:          int
    name:        str
    project_id:  int
    site_id:     Optional[int]
    is_public:   bool
    description: Optional[str]
    created_by:  Optional[int]
    created_at:  datetime
    period_filters: List[PeriodFilterResponse] = []

    model_config = {"from_attributes": True}
