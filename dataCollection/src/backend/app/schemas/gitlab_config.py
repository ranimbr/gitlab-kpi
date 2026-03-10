from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class GitLabConfigCreate(BaseModel):
    name        : str = Field(min_length=2, max_length=100)
    domain      : str = Field(description="URL complète ex: https://gitlab.mycompany.com")
    token       : str = Field(min_length=10, description="Token GitLab (sera chiffré en base)")
    description : Optional[str] = None


class GitLabConfigUpdate(BaseModel):
    name        : Optional[str]  = None
    token       : Optional[str]  = Field(default=None, min_length=10)
    is_active   : Optional[bool] = None
    description : Optional[str]  = None


class GitLabConfigResponse(BaseModel):
    id             : int
    name           : str
    domain         : str
    is_active      : bool
    description    : Optional[str] = None
    created_at     : datetime
    projects_count : int = 0

    class Config:
        from_attributes = True