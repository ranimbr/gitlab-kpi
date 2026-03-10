from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DeveloperSummary(BaseModel):
    """Sous-schema Developer embarqué dans CommitResponse."""
    id:             int
    username:       str
    name:           Optional[str] = None
    email:          Optional[str] = None
    site:           Optional[str] = None
    gitlab_user_id: Optional[int] = None

    class Config:
        from_attributes = True


class CommitResponse(BaseModel):
    id:               int
    gitlab_commit_id: str
    title:            str
    message:          Optional[str] = None
    authored_date:    datetime
    additions:        int
    deletions:        int
    total_changes:    int
    project_id:       int
    developer_id:     Optional[int] = None
    extraction_lot_id: Optional[int] = None

    # [NEW] Relation Developer embarquée — permet author/site côté frontend
    developer: Optional[DeveloperSummary] = None

    class Config:
        from_attributes = True