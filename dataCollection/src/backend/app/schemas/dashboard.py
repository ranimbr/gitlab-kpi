from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ─── Dashboard ────────────────────────────────────────────────────────────────

class DashboardCreate(BaseModel):
    name       : str
    project_id : int
    view_group : Optional[str] = None


class DashboardResponse(BaseModel):
    id         : int
    name       : str
    project_id : int
    view_group : Optional[str]
    created_at : datetime

    class Config:
        from_attributes = True


# ─── Dashboard Access ─────────────────────────────────────────────────────────

class DashboardAccessCreate(BaseModel):
    user_id      : int
    dashboard_id : int


class DashboardAccessResponse(BaseModel):
    id           : int
    user_id      : int
    dashboard_id : int
    created_at   : datetime

    class Config:
        from_attributes = True