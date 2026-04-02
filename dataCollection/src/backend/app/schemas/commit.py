"""
schemas/commit.py

CORRECTIONS (modèles mis à jour) :
────────────────────────────────────
1. AJOUT des nouveaux champs du modèle Commit :
       is_merge_commit → distingue les vrais commits des merges automatiques
       branch_name     → branche source du commit
       author_name     → nom brut de l'auteur (fallback quand developer_id=NULL)
       author_email    → email brut de l'auteur (fallback)

2. AJOUT CommitSummary : version allégée pour les listes.

3. AJOUT UnmatchedCommitResponse : commits sans developer_id
   (à traiter par l'admin pour matcher aux Developer).
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class CommitDeveloperInfo(BaseModel):
    id: int
    name: Optional[str] = None
    gitlab_username: Optional[str] = None
    
    model_config = {"from_attributes": True}


class CommitResponse(BaseModel):
    """Réponse complète GET /commits/{id}."""
    id:               int
    gitlab_commit_id: str
    title:            str
    message:          Optional[str]
    authored_date:    datetime
    committed_date:   datetime
    additions:        int
    deletions:        int
    total_changes:    int

    # ✅ AJOUT
    is_merge_commit:  bool           = False
    branch_name:      Optional[str]  = None
    author_name:      Optional[str]  = None
    author_email:     Optional[str]  = None

    project_id:        int
    developer_id:      Optional[int]
    extraction_lot_id: Optional[int]
    created_at:        datetime
    
    developer:         Optional[CommitDeveloperInfo] = None

    model_config = {"from_attributes": True}


class CommitSummary(BaseModel):
    """Version allégée pour les listes."""
    id:               int
    gitlab_commit_id: str
    title:            str
    authored_date:    datetime
    additions:        int
    deletions:        int
    is_merge_commit:  bool
    developer_id:     Optional[int]
    branch_name:      Optional[str]

    model_config = {"from_attributes": True}


class UnmatchedCommitResponse(BaseModel):
    """
    Commit sans developer_id — à traiter par l'admin.
    Retourné par GET /commits/unmatched.
    Permet à l'admin de matcher manuellement le commit à un Developer existant.
    """
    id:              int
    gitlab_commit_id: str
    title:           str
    authored_date:   datetime
    author_name:     Optional[str]
    author_email:    Optional[str]
    project_id:      int
    branch_name:     Optional[str]

    model_config = {"from_attributes": True}