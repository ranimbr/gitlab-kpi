"""
schemas/merge_request.py

"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


from app.schemas.commit import CommitDeveloperInfo

class MergeRequestResponse(BaseModel):
    """Réponse complète GET /merge-requests/{id}."""
    id:                int
    gitlab_mr_id:      int
    title:             str
    description:       Optional[str]
    state:             str
    is_draft:          bool
    approved:          bool
    review_time_hours: Optional[float]

    # ✅ AJOUT
    source_branch:     Optional[str]  = None
    target_branch:     Optional[str]  = None
    author_name:       Optional[str]  = None

    additions:         Optional[int]
    deletions:         Optional[int]
    total_changes:     Optional[int]
    created_at_gitlab: datetime
    updated_at_gitlab: Optional[datetime] = None
    merged_at:         Optional[datetime]
    closed_at:         Optional[datetime]
    approved_at:       Optional[datetime]
    project_id:        int
    developer_id:      Optional[int]
    # ✅ AJOUT
    reviewer_id:       Optional[int]  = None
    assignee_id:       Optional[int]  = None
    extraction_lot_id: Optional[int]
    
    # ✅ Nouveaux indicateurs de performance
    user_notes_count:  Optional[int] = 0
    commits_count:     Optional[int] = 0
    
    # ✅ Alias pour le Frontend (Mapping review_time_hours -> time_to_approve)
    time_to_approve:   Optional[float] = None

    developer:         Optional[CommitDeveloperInfo] = None
    reviewer:          Optional[CommitDeveloperInfo] = None
    assignee:          Optional[CommitDeveloperInfo] = None

    model_config = {"from_attributes": True}


class MergeRequestSummary(BaseModel):
    """Version allégée pour les listes."""
    id:            int
    gitlab_mr_id:  int
    title:         str
    state:         str
    is_draft:      bool
    approved:      bool
    review_time_hours: Optional[float]
    source_branch: Optional[str]
    target_branch: Optional[str]
    developer_id:  Optional[int]
    reviewer_id:   Optional[int]
    created_at_gitlab: datetime
    updated_at_gitlab: Optional[datetime] = None
    
    # ✅ Indicateurs légers pour listes
    user_notes_count:  Optional[int] = 0
    commits_count:     Optional[int] = 0
    time_to_approve:   Optional[float] = None

    model_config = {"from_attributes": True}


class UnmatchedMRResponse(BaseModel):
    """
    MR sans developer_id — à matcher manuellement par l'admin.
    Retourné par GET /merge-requests/unmatched.
    """
    id:              int
    gitlab_mr_id:    int
    title:           str
    state:           str
    author_name:     Optional[str]
    source_branch:   Optional[str]
    target_branch:   Optional[str]
    created_at_gitlab: datetime
    project_id:      int

    model_config = {"from_attributes": True}


class ReviewerWorkloadResponse(BaseModel):
    """
    Charge de review d'un développeur sur une période.
    Retourné par GET /merge-requests/reviewer-workload.
    Utile pour détecter les relecteurs surchargés.
    """
    reviewer_id:           int
    reviewer_name:         Optional[str] = None
    total_reviews_assigned: int
    pending_reviews:        int           # MRs ouvertes sans approved_at
    avg_review_time_hours:  Optional[float] = None
    project_id:            int