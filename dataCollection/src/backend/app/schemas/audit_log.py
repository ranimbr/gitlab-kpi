"""
schemas/audit_log.py — CORRIGÉ
- Lecture seule (créé automatiquement par audit_service)
- Ajout pagination params
"""
from pydantic import BaseModel, Field
from typing import Optional, Any, Dict
from datetime import datetime


class AuditLogResponse(BaseModel):
    id:          int
    user_id:     Optional[int]
    action:      str
    entity_type: str
    entity_id:   Optional[int]
    old_value:   Optional[Dict[str, Any]]
    new_value:   Optional[Dict[str, Any]]
    ip_address:  Optional[str]
    created_at:  datetime

    model_config = {"from_attributes": True}


class AuditLogFilterParams(BaseModel):
    user_id:        Optional[int] = None
    action:         Optional[str] = None
    entity_type:    Optional[str] = None
    entity_id:      Optional[int] = None
    created_after:  Optional[datetime] = None
    created_before: Optional[datetime] = None
    # Pagination
    page:  int = Field(default=1, ge=1)
    limit: int = Field(default=50, ge=1, le=500)