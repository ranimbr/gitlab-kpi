"""
api/routers/projects.py
"""
import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, aliased, joinedload

from app.api.dependencies import get_current_admin, get_current_user
from app.core.security import decrypt_token
from app.database.session import get_db
from app.models.app_user import AppUser
from app.models.developer import Developer
from app.models.gitlab_config import GitLabConfig
from app.models.merge_request import MergeRequest
from app.models.project import Project, VisibilityEnum
from app.models.extraction_lot import ExtractionLot
from app.models.commit import Commit
from app.repositories.commit_repository import CommitRepository
from app.repositories.merge_request_repository import MergeRequestRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.project_site_repository import ProjectSiteRepository
from app.repositories.site_repository import SiteRepository
from app.schemas.commit import CommitResponse
from app.schemas.merge_request import MergeRequestResponse
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectSiteAssign, ProjectUpdate, ProjectImportCreate
from app.schemas.site import SiteResponse
from app.utils.date_utils import resolve_period_dates_from_db
from app.utils.mission_utils import get_certified_developers_for_mission

logger     = logging.getLogger(__name__)
router     = APIRouter(prefix="/projects", tags=["Projects"])

project_repo  = ProjectRepository()
project_site_repo = ProjectSiteRepository()
commit_repo   = CommitRepository()
mr_repo       = MergeRequestRepository()
site_repo     = SiteRepository()


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    """Return standardized error payload without leaking internals."""
    return HTTPException(status_code=status_code, detail=f"{code}: {message}")


def _build_project_response(db: Session, project: Project) -> ProjectResponse:
    """Construit ProjectResponse avec la liste des sites associés (M2M)."""
    from app.schemas.project import SiteInfo

    # Logic Senior : Fusionner les sites explicitement configurés ET les sites découverts via les développeurs
    explicit_ids  = project_site_repo.get_site_ids_for_project(db, project.id)
    discovered_ids = project_site_repo.get_discovered_site_ids(db, project.id)
    all_site_ids   = list(set(explicit_ids) | set(discovered_ids))
    
    sites_out = []
    for sid in all_site_ids:
        site_obj = site_repo.get_by_id(db, sid)
        if site_obj and site_obj.is_active:
            sites_out.append(SiteInfo(
                site_id   = sid,
                site_name = site_obj.name,
            ))


    return ProjectResponse(
        id                = project.id,
        gitlab_project_id = project.gitlab_project_id,
        name              = project.name,
        path              = project.path,
        namespace         = project.namespace,
        description       = project.description,
        visibility        = project.visibility.value if project.visibility else None,
        default_branch    = project.default_branch,
        archived          = project.archived,
        is_active         = project.is_active,
        gitlab_config_id  = project.gitlab_config_id,
        last_commit_date  = project.last_commit_date,
        sites             = sites_out,
        commit_count      = getattr(project, "commit_count", 0),
        contributor_count = getattr(project, "contributor_count", 0),
        created_at        = project.created_at,
    )


# ── CREATE ────────────────────────────────────────────────────────────────────

@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    project_data:  ProjectCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    
    config = db.query(GitLabConfig).filter(
        GitLabConfig.id == project_data.gitlab_config_id
    ).first()
    if not config:
        raise _http_error(404, "PROJECT_GITLAB_CONFIG_NOT_FOUND", "GitLab config introuvable.")
    if not config.is_active:
        raise _http_error(400, "PROJECT_GITLAB_CONFIG_INACTIVE", "Configuration GitLab inactive.")

    try:
        plain_token = decrypt_token(config.token)
    except Exception:
        logger.warning("GitLab token decryption failed for config_id=%s", config.id)
        raise _http_error(500, "PROJECT_GITLAB_TOKEN_INVALID", "Configuration GitLab invalide.")

    url     = f"{config.domain.rstrip('/')}/api/v4/projects/{project_data.gitlab_project_id}"
    headers = {"PRIVATE-TOKEN": plain_token}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.RequestError:
        raise _http_error(503, "PROJECT_GITLAB_UNREACHABLE", "Impossible de joindre GitLab.")

    if response.status_code == 401:
        raise _http_error(400, "PROJECT_GITLAB_TOKEN_UNAUTHORIZED", "Token GitLab invalide.")
    if response.status_code == 404:
        raise _http_error(404, "PROJECT_GITLAB_NOT_FOUND", "Projet introuvable sur GitLab.")
    if response.status_code != 200:
        raise _http_error(400, "PROJECT_GITLAB_API_ERROR", f"Erreur API GitLab ({response.status_code}).")

    data = response.json()

    if db.query(Project).filter(Project.gitlab_project_id == data["id"]).first():
        raise _http_error(409, "PROJECT_ALREADY_EXISTS", "Ce projet existe deja.")

   
    project = Project(
        gitlab_project_id = data["id"],
        name              = data["name"],
        path              = data["path"],
        namespace         = data["namespace"]["full_path"],
        visibility        = VisibilityEnum(data.get("visibility", "private")),
        default_branch    = data.get("default_branch"),
        archived          = data.get("archived", False),
        gitlab_config_id  = config.id,
        is_active         = project_data.is_active if project_data.is_active is not None else True,
    )
    db.add(project)
    db.flush()

    
    if project_data.site_ids:
        project_site_repo.sync(db, project.id, project_data.site_ids)

    db.commit()
    db.refresh(project)
    logger.info(f"Project created — id={project.id} name={project.name}")
    return _build_project_response(db, project)


@router.post("/import", response_model=ProjectResponse, status_code=201)
def create_project_import(
    project_data:  ProjectImportCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
   
    project = project_repo.create_from_import(
        db, 
        name=project_data.name, 
        gitlab_project_id=project_data.gitlab_project_id,
        gitlab_config_id=project_data.gitlab_config_id
    )
    
    
    if project_data.site_ids:
        project_site_repo.sync(db, project.id, project_data.site_ids)
        
    db.commit()
    db.refresh(project)
    
    logger.info(f"Project created via Import Resolution — id={project.id} name={project.name}")
    return _build_project_response(db, project)


# ── LIST ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ProjectResponse])
def list_projects(
    db:           Session        = Depends(get_db),
    current_user: AppUser        = Depends(get_current_user),
    site_id:      Optional[int]  = Query(default=None, description="Filtrer par site (via ProjectSite M2M)"),
    archived:     Optional[bool] = Query(default=None),
    all_projects: bool           = Query(default=False),
    period_id:    Optional[int]  = Query(default=None, description="Filtrer les compteurs par période"),
):
    
    from app.models.app_user import UserRoleEnum
    is_admin    = current_user.role == UserRoleEnum.super_admin
    active_only = not (all_projects and is_admin)

    if site_id is not None:
        projects = project_repo.get_by_site_id(db, site_id, period_id=period_id)
    else:
        projects = project_repo.get_all(db, active_only=active_only, archived=archived, period_id=period_id)

    return [_build_project_response(db, p) for p in projects]


# ── GET ───────────────────────────────────────────────────────────────────────

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id:   int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable.")
    return _build_project_response(db, project)


# ── UPDATE ────────────────────────────────────────────────────────────────────

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id:    int,
    request:       ProjectUpdate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Projet introuvable.")

   
    update_data = request.model_dump(exclude_unset=True, exclude={"site_ids"})
    updated     = project_repo.update(db, project_id, update_data)

   
    if request.site_ids is not None:
        project_site_repo.sync(db, project_id, request.site_ids)

    db.commit()
    if updated:
        db.refresh(updated)
    return _build_project_response(db, updated)


# ── SITES M2M ─────────────────────────────────────────────────────────────────

@router.get("/{project_id}/sites", response_model=List[SiteResponse])
def get_project_sites(
    project_id:   int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
  
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Projet introuvable.")
    site_ids = project_site_repo.get_site_ids_for_project(db, project_id)
    
    # Filter sites for site_manager - only show their assigned site
    if current_user.is_site_manager:
        if current_user.site_id in site_ids:
            site_ids = [current_user.site_id]
        else:
            site_ids = []
    
    return [site_repo.get_by_id(db, sid) for sid in site_ids if site_repo.get_by_id(db, sid)]


@router.post("/{project_id}/sites/{site_id}", status_code=201)
def assign_site_to_project(
    project_id:    int,
    site_id:       int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Projet introuvable.")
    if not site_repo.get_by_id(db, site_id):
        raise HTTPException(status_code=404, detail="Site introuvable.")
    project_site_repo.add(db, project_id, site_id)
    db.commit()
    return {"message": f"Site {site_id} associé au projet {project_id}."}


@router.delete("/{project_id}/sites/{site_id}", status_code=204)
def remove_site_from_project(
    project_id:    int,
    site_id:       int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    
    removed = project_site_repo.remove(db, project_id, site_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Association projet-site introuvable.")
    db.commit()


# ── COMMITS / MRs ────────────────────────────────────────────────────────────

@router.get("/{project_id}/commits", response_model=List[CommitResponse])
def get_project_commits(
    project_id:            str,
    limit:                 int           = Query(5000, ge=1, le=10000),
    offset:                int           = Query(0, ge=0),
    lot_id:                Optional[int] = Query(None, description="Filtrer par session d'extraction — priorité maximale"),
    period_id:             Optional[int] = Query(None, description="Filtrer par période (Mois/Année)"),
    developer_id:          Optional[str] = Query(None, description="Filtrer par développeur"),
    exclude_merge_commits: bool          = Query(True, description="Exclure les merge commits"),
    db:                    Session       = Depends(get_db),
    current_user:          AppUser       = Depends(get_current_user),
):
    from app.models.commit import Commit

    # Mapping Senior : support pour "all" ou ID numérique
    p_id = None if project_id == "all" else int(project_id)

    if p_id and not project_repo.get_by_id(db, p_id):
        raise HTTPException(status_code=404, detail="Projet introuvable.")

    # Robustesse contre le 'NaN' ou 'null' du frontend
    dev_id = None
    if developer_id and developer_id not in ["null", "undefined", "NaN", "none"]:
        try:
            dev_id = int(developer_id)
        except (ValueError, TypeError):
            dev_id = None

   
    # ── PRIORITÉ 1 : Lot d'extraction (session)
    if lot_id is not None:
        lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
        if not lot:
            raise HTTPException(status_code=404, detail="Lot d'extraction introuvable.")
        
        # Isolation stricte par lot : le lot_id est prioritaire sur period_id
        # Le lot contient déjà les commits filtrés par sa période associée
        commits = commit_repo.get_project_commits_paginated(
            db,
            project_id=lot.project_id,
            limit=limit,
            offset=offset,
            lot_id=lot_id,
            exclude_merge_commits=exclude_merge_commits,
        )
        if dev_id is not None:
            commits = [c for c in commits if c.developer_id == dev_id]
        return commits

    # ── PRIORITÉ 2 : Période (filtre mensuel standard)
    if period_id is not None:
        commits = commit_repo.get_by_period_paginated(
            db, period_id, p_id, limit, offset,
            exclude_merge_commits=exclude_merge_commits
        )
        # Appliquer le filtre developer_id côté Python si le repo ne le supporte pas
        if dev_id is not None:
            commits = [c for c in commits if c.developer_id == dev_id]
        return commits

    # ── PRIORITÉ 3 : Tous les commits du projet (vue globale)
    if not p_id:
        return commit_repo.get_all_paginated(
            db, project_id=None, limit=limit, offset=offset,
            exclude_merge_commits=exclude_merge_commits
        )

    return commit_repo.get_project_commits_paginated(
        db, p_id, limit, offset,
        lot_id=lot_id,
        exclude_merge_commits=exclude_merge_commits,
    )


@router.get("/{project_id}/merge-requests", response_model=List[MergeRequestResponse])
def get_project_mrs(
    project_id:    str,
    limit:         int  = Query(100, ge=1, le=5000),
    offset:        int  = Query(0, ge=0),
    exclude_draft: bool = Query(True),
    lot_id:        Optional[int] = Query(None, description="Filtrer par session d'extraction"),
    period_id:             Optional[int] = Query(None, description="Filtrer par période (Mois/Année)"),
    developer_id:          Optional[str] = Query(None, description="Filtrer par développeur (Auteur)"),
    author_only:   bool = Query(False, description="Filtrer uniquement sur l'auteur principal de la MR"),
    db:            Session = Depends(get_db),
    current_user:  AppUser = Depends(get_current_user),
):
    # Mapping Senior : support pour "all" ou ID numérique
    p_id = None if project_id == "all" else int(project_id)

    if p_id and not project_repo.get_by_id(db, p_id):
        raise HTTPException(status_code=404, detail="Projet introuvable.")

    # [SENIOR FIX] Robustesse contre le 'NaN' ou 'null' du frontend
    dev_id = None
    if developer_id and developer_id not in ["null", "undefined", "NaN", "none"]:
        try:
            dev_id = int(developer_id)
        except (ValueError, TypeError):
            dev_id = None

    Rev = aliased(Developer)
    Ass = aliased(Developer)

    # ── 1. Base query avec jointures optimisées ───────────────────────────────
    query = (
        db.query(MergeRequest)
        .outerjoin(Developer, MergeRequest.developer_id == Developer.id)
        .outerjoin(Rev,       MergeRequest.reviewer_id  == Rev.id)
        .outerjoin(Ass,       MergeRequest.assignee_id  == Ass.id)
        .options(
            joinedload(MergeRequest.developer),
            joinedload(MergeRequest.reviewer),
            joinedload(MergeRequest.assignee),
        )
    )

    # ── 2. Résolution de la période cible (period_id prioritaire sur lot_id) ──
    target_period_id = period_id
    if lot_id is not None:
        lot = db.query(ExtractionLot).filter(ExtractionLot.id == lot_id).first()
        if not lot:
            raise HTTPException(status_code=404, detail="Lot d'extraction introuvable.")
        if target_period_id is None:
            target_period_id = lot.period_id
        if p_id is None:  # project_id='all' → périmètre limité au projet du lot
            query = query.filter(MergeRequest.project_id == lot.project_id)

    # ── 3. Filtre MISSION-STRICT sur les développeurs certifiés ──────────────
    if dev_id is not None:
        if author_only:
            # Mode strict : uniquement si le développeur est l'auteur principal
            query = query.filter(MergeRequest.developer_id == dev_id)
        else:
            # Vue 360 individuelle : MRs où le dev est Auteur, Reviewer ou Assignee
            query = query.filter(
                or_(
                    MergeRequest.developer_id == dev_id,
                    MergeRequest.reviewer_id  == dev_id,
                    MergeRequest.assignee_id  == dev_id,
                )
            )
    elif p_id is not None:
        # Périmètre projet : uniquement les devs certifiés sur la mission
        certified_ids = get_certified_developers_for_mission(
            db=db,
            project_id=p_id,
            period_id=target_period_id,  # None accepté → tous les devs actifs
        )
        if author_only:
            query = query.filter(MergeRequest.developer_id.in_(certified_ids))
        else:
            query = query.filter(
                or_(
                    MergeRequest.developer_id.in_(certified_ids),
                    MergeRequest.reviewer_id.in_(certified_ids),
                    MergeRequest.assignee_id.in_(certified_ids),
                )
            )
    else:
        # Vue globale "all projects" — filtre humain minimal (exclure les bots)
        query = query.filter(
            or_(
                Developer.id.is_(None),
                Developer.is_validated.is_(True) & Developer.is_bot.is_(False),
            )
        )

    # ── 4. Filtres contextuels ───────────────────────────────────────────────
    if p_id is not None:
        query = query.filter(MergeRequest.project_id == p_id)

    if exclude_draft:
        query = query.filter(MergeRequest.is_draft.is_(False))

    # ── 5. ALIGNEMENT KPI — Filtre sur la date de CRÉATION réelle ou appartenance au lot ──
    # Si lot_id est fourni, on filtre strictement par lot_id.
    # Si target_period_id est fourni, on filtre strictement par la date de création de la période.
    if lot_id is not None:
        query = query.filter(MergeRequest.extraction_lot_id == lot_id)
    elif target_period_id is not None:
        date_range = resolve_period_dates_from_db(db, target_period_id)
        if date_range:
            start_dt, end_dt = date_range
            query = query.filter(
                MergeRequest.created_at_gitlab >= start_dt,
                MergeRequest.created_at_gitlab <= end_dt,
            )

    # ── 6. Exécution paginée ─────────────────────────────────────────────────
    return (
        query
        .order_by(MergeRequest.created_at_gitlab.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )







# ── HELPERS ───────────────────────────────────────────────────────────────────

@router.patch("/{project_id}/toggle-active", response_model=ProjectResponse)
def toggle_project_active(
    project_id:    int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable.")
    updated = project_repo.update(db, project_id, {"is_active": not project.is_active})
    db.commit()
    if updated:
        db.refresh(updated)
    return _build_project_response(db, updated)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id:    int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable.")
    db.delete(project)
    db.commit()