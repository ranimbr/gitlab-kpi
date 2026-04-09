"""
schemas/project.py

CORRECTIONS MAJEURES (remarques encadrant + modèles mis à jour) :
──────────────────────────────────────────────────────────────────
1. SUPPRESSION de site_id comme champ direct dans ProjectCreate/Update.
   Un projet peut appartenir à PLUSIEURS sites (M2M via ProjectSite).
   → Remplacé par une liste de site_ids dans ProjectCreate.
   → ProjectResponse inclut une liste de SiteInfo imbriquée.

2. AJOUT de last_commit_date dans ProjectResponse (nouveau champ modèle).

3. AJOUT de ProjectSiteAssign : schema pour POST /projects/{id}/sites
   (assigner/désassigner un site à un projet).

4. AJOUT de ProjectSummary : version allégée pour les listes.
"""
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime


class SiteInfo(BaseModel):
    """Site associé à un projet (version imbriquée dans ProjectResponse)."""
    site_id:   int
    site_name: Optional[str] = None

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    gitlab_project_id: int
    gitlab_config_id:  int
    is_active:         bool = True

    # ✅ CORRECTION : plus de site_id direct → liste de site_ids (M2M)
    site_ids: List[int] = Field(
        default=[],
        description="IDs des sites auxquels ce projet appartient (M2M)",
    )


class ProjectUpdate(BaseModel):
    name:           Optional[str]      = Field(default=None, max_length=255)
    is_active:      Optional[bool]     = None
    archived:       Optional[bool]     = None
    description:    Optional[str]      = None
    default_branch: Optional[str]      = Field(default=None, max_length=100)
    gitlab_project_id: Optional[int]   = None
    gitlab_config_id:  Optional[int]   = None

    # ✅ CORRECTION : mise à jour des sites via liste (remplace l'ancien site_id)
    # Si fourni, remplace la liste actuelle des sites du projet
    site_ids: Optional[List[int]] = Field(
        default=None,
        description="Si fourni, remplace entièrement la liste des sites associés",
    )


class ProjectSiteAssign(BaseModel):
    """
    Schema pour POST /projects/{id}/sites/{site_id}
    Assigner ou désassigner un site à un projet.
    """
    site_id: int


class ProjectResponse(BaseModel):
    id:                int
    gitlab_project_id: Optional[int]
    name:              str
    path:              Optional[str]
    namespace:         Optional[str]
    description:       Optional[str]
    visibility:        Optional[str]
    default_branch:    Optional[str]
    archived:          bool
    is_active:         bool
    gitlab_config_id:  Optional[int]
    last_commit_date:  Optional[datetime] = None   # ✅ AJOUT

    # ✅ CORRECTION : liste de sites associés (plus de site_id direct)
    sites: List[SiteInfo] = []

    # Compteurs calculés
    commit_count:      int = 0
    contributor_count: int = 0

    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectSummary(BaseModel):
    """Version allégée pour les listes de projets."""
    id:                int
    name:              str
    gitlab_project_id: Optional[int]
    is_active:         bool
    archived:          bool
    last_commit_date:  Optional[datetime] = None
    site_count:        int = 0    # Nombre de sites associés

    model_config = {"from_attributes": True}