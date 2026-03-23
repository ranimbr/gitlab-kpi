"""schemas/developer.py — CORRIGÉ : is_validated, is_bot, source + DeveloperValidate."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class DeveloperGroupCreate(BaseModel):
    name:       str = Field(min_length=1, max_length=100)
    project_id: int
    site_id:    Optional[int] = None
    manager_id: Optional[int] = None


class DeveloperGroupUpdate(BaseModel):
    name:       Optional[str] = None
    site_id:    Optional[int] = None
    manager_id: Optional[int] = None


class DeveloperGroupResponse(BaseModel):
    id:         int
    name:       str
    project_id: int
    site_id:    Optional[int]
    manager_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class DeveloperCreate(BaseModel):
    username:       str = Field(min_length=1, max_length=255)
    name:           Optional[str] = None
    email:          Optional[str] = None
    company:        Optional[str] = None
    gitlab_user_id: Optional[int] = None
    project_id:     int
    group_id:       Optional[int] = None
    site_id:        Optional[int] = None
    is_active:      bool = True
    # source forcé à "manual" côté router — non exposé au client


class DeveloperUpdate(BaseModel):
    username:  Optional[str]  = None
    name:      Optional[str]  = None
    email:     Optional[str]  = None
    company:   Optional[str]  = None
    group_id:  Optional[int]  = None
    site_id:   Optional[int]  = None
    is_active: Optional[bool] = None


class DeveloperValidate(BaseModel):
    """PATCH /developers/{id}/validate — validation ou rejet par l'admin."""
    is_validated: bool
    is_bot:       Optional[bool] = None   # correction détection auto
    site_id:      Optional[int]  = None   # assigner un site au moment de validation
    group_id:     Optional[int]  = None   # assigner un groupe au moment de validation


class DeveloperResponse(BaseModel):
    id:             int
    gitlab_user_id: Optional[int]
    username:       str
    name:           Optional[str]
    email:          Optional[str]
    company:        Optional[str]
    project_id:     int
    group_id:       Optional[int]
    site_id:        Optional[int]
    is_active:      bool
    is_validated:   bool
    is_bot:         bool
    source:         str
    created_by:     Optional[int]
    created_at:     datetime

    model_config = {"from_attributes": True}
