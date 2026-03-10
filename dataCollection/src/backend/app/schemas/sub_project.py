from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SubProjectCreate(BaseModel):
    gitlab_project_id : int
    project_id        : int
    name              : str
    path              : str
    description       : Optional[str] = None


class SubProjectResponse(BaseModel):
    id                : int
    gitlab_project_id : int
    project_id        : int
    name              : str
    path              : str
    description       : Optional[str]
    archived          : bool
    created_at        : datetime

    class Config:
        from_attributes = True