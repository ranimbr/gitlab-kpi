from pydantic import BaseModel, HttpUrl, model_validator
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    name:              Optional[str]  = None
    gitlab_project_id: int
    gitlab_config_id:  int
    is_active:         Optional[bool] = True


class ProjectUpdate(BaseModel):
    name:           Optional[str]  = None
    description:    Optional[str]  = None
    default_branch: Optional[str]  = None
    is_active:      Optional[bool] = None
    archived:       Optional[bool] = None


class ProjectResponse(BaseModel):
    id:                int
    gitlab_project_id: int
    name:              str
    path:              str
    namespace:         Optional[str]      = None
    description:       Optional[str]      = None
    visibility:        Optional[str]      = None
    default_branch:    Optional[str]      = None
    archived:          bool
    gitlab_config_id:  Optional[int]      = None
    is_active:         bool
    created_at:        datetime

    commit_count:      Optional[int]      = 0
    contributor_count: Optional[int]      = 0
    last_commit_date:  Optional[datetime] = None

    class Config:
        from_attributes = True


class ExtractionRequest(BaseModel):
    project_id:  Optional[int]     = None
    project_url: Optional[HttpUrl] = None

    @model_validator(mode="after")
    def validate_input(self):
        if not self.project_id and not self.project_url:
            raise ValueError("Either project_id or project_url must be provided")
        return self