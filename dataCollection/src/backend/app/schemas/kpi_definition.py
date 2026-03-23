"""
schemas/kpi_definition.py — CORRIGÉ
- AggregationLevelEnum importé depuis enums.py
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.schemas.enums import AggregationLevelEnum


class KpiDefinitionCreate(BaseModel):
    code:                str  = Field(min_length=2, max_length=100,
                                      description="Code unique ex: MR_RATE_SITE")
    label:               str  = Field(min_length=2, max_length=255)
    formula_description: Optional[str] = None
    unit:                Optional[str] = Field(default=None, max_length=50,
                                               description="'ratio', 'hours', 'count'")
    aggregation_level:   AggregationLevelEnum = AggregationLevelEnum.site
    is_active:           bool = True


class KpiDefinitionUpdate(BaseModel):
    label:               Optional[str]                  = None
    formula_description: Optional[str]                  = None
    unit:                Optional[str]                  = None
    aggregation_level:   Optional[AggregationLevelEnum] = None
    is_active:           Optional[bool]                 = None


class KpiDefinitionResponse(BaseModel):
    id:                  int
    code:                str
    label:               str
    formula_description: Optional[str]
    unit:                Optional[str]
    aggregation_level:   str
    is_active:           bool
    created_at:          datetime

    model_config = {"from_attributes": True}
