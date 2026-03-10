from pydantic import BaseModel, computed_field
from typing import Optional
from datetime import datetime


class DeveloperSummary(BaseModel):
    """Sous-schema Developer embarqué dans MergeRequestResponse."""
    id:             int
    username:       str
    name:           Optional[str] = None
    email:          Optional[str] = None
    site:           Optional[str] = None
    gitlab_user_id: Optional[int] = None

    class Config:
        from_attributes = True


class MergeRequestResponse(BaseModel):
    id:                int
    gitlab_mr_id:      int
    title:             str
    state:             str
    is_draft:          bool
    created_at_gitlab: datetime
    merged_at:         Optional[datetime] = None
    closed_at:         Optional[datetime] = None
    approved_at:       Optional[datetime] = None
    approved:          bool
    time_to_approve:   Optional[float]    = None
    project_id:        int
    developer_id:      Optional[int]      = None
    extraction_lot_id: Optional[int]      = None

    # [FIX] "merged" retiré du model SQLAlchemy — calculé depuis merged_at
    @computed_field
    @property
    def merged(self) -> bool:
        return self.merged_at is not None or self.state == "merged"

    # [NEW] Relation Developer embarquée
    developer: Optional[DeveloperSummary] = None

    class Config:
        from_attributes = True