from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# ─── Developer Group ─────────────────────────────────────────────

class DeveloperGroupCreate(BaseModel):
    name: str
    site: str
    project_id: int


class DeveloperGroupResponse(BaseModel):
    id: int
    name: str
    site: str
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Developer ───────────────────────────────────────────────────

class DeveloperCreate(BaseModel):
    gitlab_user_id: Optional[int] = None
    username: str
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    project_id: int
    group_id: Optional[int] = None


class DeveloperUpdate(BaseModel):
    group_id: Optional[int] = None
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    # site supprimé — dérivé automatiquement du groupe via hybrid_property


class DeveloperResponse(BaseModel):
    id: int
    gitlab_user_id: Optional[int]
    username: str
    name: Optional[str]
    email: Optional[str]
    site: Optional[str]   # retourné via hybrid_property depuis le groupe
    project_id: int
    group_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True