"""schemas/merge_request.py — CORRIGÉ : time_to_approve → review_time_hours, complexity supprimé."""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MergeRequestResponse(BaseModel):
    id:                int
    gitlab_mr_id:      int
    title:             str
    description:       Optional[str]
    state:             str
    is_draft:          bool
    approved:          bool
    review_time_hours: Optional[float]   # (approved_at - created_at_gitlab) en heures
    additions:         Optional[int]
    deletions:         Optional[int]
    total_changes:     Optional[int]
    created_at_gitlab: datetime
    merged_at:         Optional[datetime]
    closed_at:         Optional[datetime]
    approved_at:       Optional[datetime]
    project_id:        int
    developer_id:      Optional[int]
    extraction_lot_id: Optional[int]

    model_config = {"from_attributes": True}
