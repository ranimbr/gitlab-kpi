"""schemas/project.py — CORRIGÉ : site_id ajouté."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    gitlab_project_id: int
    gitlab_config_id:  int
    site_id:           Optional[int]  = None
    is_active:         Optional[bool] = True


class ProjectUpdate(BaseModel):
    name:           Optional[str]  = None
    is_active:      Optional[bool] = None
    archived:       Optional[bool] = None
    description:    Optional[str]  = None
    default_branch: Optional[str]  = None
    site_id:        Optional[int]  = None


class ProjectResponse(BaseModel):
    id:                int
    gitlab_project_id: int
    name:              str
    path:              str
    namespace:         Optional[str]
    description:       Optional[str]
    visibility:        Optional[str]
    default_branch:    Optional[str]
    archived:          bool
    is_active:         bool
    gitlab_config_id:  Optional[int]
    site_id:           Optional[int]
    commit_count:      Optional[int]      = 0
    contributor_count: Optional[int]      = 0
    last_commit_date:  Optional[datetime] = None
    created_at:        datetime

    model_config = {"from_attributes": True}
