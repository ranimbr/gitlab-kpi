"""schemas/commit.py — inchangé fonctionnellement."""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CommitResponse(BaseModel):
    id:                int
    gitlab_commit_id:  str
    title:             str
    message:           Optional[str]
    authored_date:     datetime
    committed_date:    datetime
    additions:         int
    deletions:         int
    total_changes:     int
    project_id:        int
    developer_id:      Optional[int]
    extraction_lot_id: Optional[int]
    created_at:        datetime

    model_config = {"from_attributes": True}
