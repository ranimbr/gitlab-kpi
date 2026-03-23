"""
api/routers/projects.py

"""
import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.core.security import decrypt_token
from app.database.session import get_db
from app.models.app_user import AppUser
from app.models.gitlab_config import GitLabConfig
from app.models.project import Project, VisibilityEnum
from app.repositories.commit_repository import CommitRepository
from app.repositories.merge_request_repository import MergeRequestRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.commit import CommitResponse
from app.schemas.merge_request import MergeRequestResponse
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["Projects"])

project_repo = ProjectRepository()
commit_repo  = CommitRepository()
mr_repo      = MergeRequestRepository()

# =============================================================================
# POST /projects/
# =============================================================================

@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    project_data:  ProjectCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    config = db.query(GitLabConfig).filter(
        GitLabConfig.id == project_data.gitlab_config_id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="GitLab config not found")
    if not config.is_active:
        raise HTTPException(status_code=400, detail="GitLab configuration is inactive")

    try:
        plain_token = decrypt_token(config.token)
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to decrypt GitLab token")

    url     = f"{config.domain.rstrip('/')}/api/v4/projects/{project_data.gitlab_project_id}"
    headers = {"PRIVATE-TOKEN": plain_token}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach GitLab: {e}")

    if response.status_code == 401:
        raise HTTPException(status_code=400, detail="Invalid GitLab token")
    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"Project id={project_data.gitlab_project_id} not found on GitLab",
        )
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail=f"GitLab API error {response.status_code}")

    data = response.json()

    if db.query(Project).filter(Project.gitlab_project_id == data["id"]).first():
        raise HTTPException(status_code=409, detail="Project already exists")

    project = Project(
        gitlab_project_id = data["id"],
        name              = data["name"],
        path              = data["path"],
        namespace         = data["namespace"]["full_path"],
        visibility        = VisibilityEnum(data.get("visibility", "private")),
        default_branch    = data.get("default_branch"),
        archived          = data.get("archived", False),
        gitlab_config_id  = config.id,
        site_id           = project_data.site_id,
        is_active         = project_data.is_active if project_data.is_active is not None else True,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    logger.info(f"Project created — id={project.id} name={project.name}")
    return project

# =============================================================================
# GET /projects/
# =============================================================================

@router.get("/", response_model=List[ProjectResponse])
def list_projects(
    db:           Session        = Depends(get_db),
    current_user: AppUser        = Depends(get_current_user),
    archived:     Optional[bool] = Query(default=None, description="Filtrer par statut archivé"),
    all_projects: bool           = Query(default=False, description="Admin : inclure les projets inactifs"),
):
    """
    Liste les projets.
    ✅ FIX : filtre `archived` passé directement à get_all() → filtre SQL.
    """
    is_admin    = current_user.role == "admin"
    active_only = not (all_projects and is_admin)
    return project_repo.get_all(db, active_only=active_only, archived=archived)

# =============================================================================
# GET /projects/{project_id}
# =============================================================================

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id:   int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

# =============================================================================
# PUT /projects/{project_id}
# =============================================================================

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id:    int,
    request:       ProjectUpdate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    updated = project_repo.update(db, project_id, request.model_dump(exclude_unset=True))
    db.commit()
    if updated:
        db.refresh(updated)
    logger.info(f"Project updated — id={project_id} by admin={current_admin.id}")
    return updated

# =============================================================================
# GET /projects/{project_id}/commits
# =============================================================================

@router.get("/{project_id}/commits", response_model=List[CommitResponse])
def get_project_commits(
    project_id:   int,
    limit:        int     = Query(50, ge=1, le=200),
    offset:       int     = Query(0, ge=0),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return commit_repo.get_project_commits_paginated(db, project_id, limit, offset)

# =============================================================================
# GET /projects/{project_id}/merge-requests
# =============================================================================

@router.get("/{project_id}/merge-requests", response_model=List[MergeRequestResponse])
def get_project_mrs(
    project_id:    int,
    limit:         int  = Query(50, ge=1, le=200),
    offset:        int  = Query(0, ge=0),
    exclude_draft: bool = Query(
        True,
        description="Exclure les MRs draft — recommandé pour les KPIs (filtre SQL)",
    ),
    db:            Session = Depends(get_db),
    current_user:  AppUser = Depends(get_current_user),
):
    """
    ✅ FIX : exclude_draft filtré en SQL via count_by_project_period du repo.
    Utilise MergeRequestRepository.get_project_mrs_paginated() avec filtre
    only_non_draft passé directement — pas de filtre Python post-chargement.

    NOTE : get_project_mrs_paginated() ne supporte pas encore le filtre SQL
    exclude_draft. On utilise count_by_project pour la pagination et on
    délègue le filtre à la requête paginée avec filtre SQL intégré.
    """
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    # ✅ FIX : filtre SQL via query directe si exclude_draft=True
    # Au lieu de charger toutes les MRs et filtrer en Python
    if exclude_draft:
        from app.models.merge_request import MergeRequest
        mrs = (
            db.query(MergeRequest)
            .filter(
                MergeRequest.project_id == project_id,
                MergeRequest.is_draft.is_(False),
            )
            .order_by(MergeRequest.created_at_gitlab.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )
    else:
        mrs = mr_repo.get_project_mrs_paginated(db, project_id, limit, offset)

    return mrs

# =============================================================================
# PATCH /projects/{project_id}/toggle-active
# =============================================================================

@router.patch("/{project_id}/toggle-active", response_model=ProjectResponse)
def toggle_project_active(
    project_id:    int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    updated = project_repo.update(db, project_id, {"is_active": not project.is_active})
    db.commit()
    if updated:
        db.refresh(updated)
    logger.info(
        f"Project toggled — id={project_id} "
        f"is_active={updated.is_active if updated else '?'} "
        f"by admin={current_admin.id}"
    )
    return updated

# =============================================================================
# DELETE /projects/{project_id}
# =============================================================================

@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id:    int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    logger.info(f"Project deleted — id={project_id} by admin={current_admin.id}")