"""
api/routers/projects.py

CORRECTIONS MAJEURES (modèles mis à jour — remarques encadrant) :
──────────────────────────────────────────────────────────────────
1. create_project() : Project.site_id supprimé → ProjectSite M2M.
   Après création du projet, créer les associations via project_site_repo.sync().

2. ProjectCreate.site_ids → liste de site_ids (plus site_id unique).

3. list_projects() : get_by_site_id() via ProjectSite M2M.

4. AJOUT POST /projects/{id}/sites/{site_id} : associer un site à un projet.
   AJOUT DELETE /projects/{id}/sites/{site_id} : dissocier un site.
   AJOUT GET /projects/{id}/sites : lister les sites d'un projet.

5. ProjectResponse.sites : liste imbriquée (plus site_id unique).

6. Rôle admin → super_admin.
"""
import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_admin, get_current_user
from app.core.security import decrypt_token
from app.database.session import get_db
from app.models.app_user import AppUser
from app.models.gitlab_config import GitLabConfig
from app.models.project import Project, VisibilityEnum
from app.repositories.commit_repository import CommitRepository
from app.repositories.merge_request_repository import MergeRequestRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.project_site_repository import ProjectSiteRepository
from app.repositories.site_repository import SiteRepository
from app.schemas.commit import CommitResponse
from app.schemas.merge_request import MergeRequestResponse
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectSiteAssign, ProjectUpdate, ProjectImportCreate
from app.schemas.site import SiteResponse

logger     = logging.getLogger(__name__)
router     = APIRouter(prefix="/projects", tags=["Projects"])

project_repo  = ProjectRepository()
project_site_repo = ProjectSiteRepository()
commit_repo   = CommitRepository()
mr_repo       = MergeRequestRepository()
site_repo     = SiteRepository()


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
    """
    ✅ FIX : suppression de Project.site_id → associations via ProjectSite M2M.
    project_data.site_ids → liste de site_ids à associer.
    """
    config = db.query(GitLabConfig).filter(
        GitLabConfig.id == project_data.gitlab_config_id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="GitLab config introuvable.")
    if not config.is_active:
        raise HTTPException(status_code=400, detail="Configuration GitLab inactive.")

    try:
        plain_token = decrypt_token(config.token)
    except Exception:
        raise HTTPException(status_code=500, detail="Impossible de déchiffrer le token GitLab.")

    url     = f"{config.domain.rstrip('/')}/api/v4/projects/{project_data.gitlab_project_id}"
    headers = {"PRIVATE-TOKEN": plain_token}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Impossible de joindre GitLab : {e}")

    if response.status_code == 401:
        raise HTTPException(status_code=400, detail="Token GitLab invalide.")
    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"Projet id={project_data.gitlab_project_id} introuvable sur GitLab.",
        )
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Erreur API GitLab {response.status_code}.")

    data = response.json()

    if db.query(Project).filter(Project.gitlab_project_id == data["id"]).first():
        raise HTTPException(status_code=409, detail="Ce projet existe déjà.")

    # ✅ FIX : pas de site_id dans Project — association via ProjectSite
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

    # ✅ AJOUT : associations sites via ProjectSite (M2M)
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
    """
    ✅ NOUVEAU : Création résiliente pour l'assistant d'import.
    N'effectue PAS d'appel API GitLab bloquant. Permet de créer un projet
    'offline' s'il n'est pas trouvable ou accessible immédiatement.
    """
    # 1. Création via la logique de repository dédiée à l'import
    project = project_repo.create_from_import(
        db, 
        name=project_data.name, 
        gitlab_project_id=project_data.gitlab_project_id,
        gitlab_config_id=project_data.gitlab_config_id
    )
    
    # 2. Association des sites (M2M)
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
):
    """
    ✅ FIX : site_id filtre via ProjectSite (M2M) — plus Project.site_id.
    """
    from app.models.app_user import UserRoleEnum
    is_admin    = current_user.role == UserRoleEnum.super_admin
    active_only = not (all_projects and is_admin)

    if site_id is not None:
        projects = project_repo.get_by_site_id(db, site_id)
    else:
        projects = project_repo.get_all(db, active_only=active_only, archived=archived)

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

    # Extraire site_ids avant l'update (géré séparément via M2M)
    update_data = request.model_dump(exclude_unset=True, exclude={"site_ids"})
    updated     = project_repo.update(db, project_id, update_data)

    # ✅ FIX : mise à jour des sites via ProjectSite (M2M)
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
    """✅ NOUVEAU : liste les sites associés à un projet."""
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Projet introuvable.")
    site_ids = project_site_repo.get_site_ids_for_project(db, project_id)
    return [site_repo.get_by_id(db, sid) for sid in site_ids if site_repo.get_by_id(db, sid)]


@router.post("/{project_id}/sites/{site_id}", status_code=201)
def assign_site_to_project(
    project_id:    int,
    site_id:       int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """✅ NOUVEAU : associe un site à un projet (M2M)."""
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
    """✅ NOUVEAU : dissocie un site d'un projet (M2M)."""
    removed = project_site_repo.remove(db, project_id, site_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Association projet-site introuvable.")
    db.commit()


# ── COMMITS / MRs ────────────────────────────────────────────────────────────

@router.get("/{project_id}/commits", response_model=List[CommitResponse])
def get_project_commits(
    project_id:            str,
    limit:                 int           = Query(100, ge=1, le=5000),
    offset:                int           = Query(0, ge=0),
    lot_id:                Optional[int] = Query(None, description="Filtrer par session d'extraction"),
    period_id:             Optional[int] = Query(None, description="Filtrer par période (Mois/Année)"),
    exclude_merge_commits: bool          = Query(False, description="Exclure les merge commits"),
    db:                    Session       = Depends(get_db),
    current_user:          AppUser       = Depends(get_current_user),
):
    # Mapping Senior : support pour "all" ou ID numérique
    p_id = None if project_id == "all" else int(project_id)
    
    if p_id and not project_repo.get_by_id(db, p_id):
        raise HTTPException(status_code=404, detail="Projet introuvable.")
    
    # Priorité 1 : Recherche unifiée par Période (Modern)
    if period_id is not None:
        return commit_repo.get_by_period_paginated(
            db, period_id, p_id, limit, offset,
            exclude_merge_commits=exclude_merge_commits
        )
    
    # Priorité 2 : Recherche par Lot (Legacy/Debug)
    if not p_id:
        # [SENIOR FIX] "Toutes les périodes" = retourner TOUS les commits, pas juste la dernière période
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
    period_id:     Optional[int] = Query(None, description="Filtrer par période (Mois/Année)"),
    db:            Session = Depends(get_db),
    current_user:  AppUser = Depends(get_current_user),
):
    # Mapping Senior : support pour "all" ou ID numérique
    p_id = None if project_id == "all" else int(project_id)

    if p_id and not project_repo.get_by_id(db, p_id):
        raise HTTPException(status_code=404, detail="Projet introuvable.")
    
    # Option 1 : Recherche unifiée par Période (Modern)
    if period_id is not None:
        return mr_repo.get_by_period_paginated(
            db, period_id, p_id, limit, offset
        )
    
    # Option 2 : "Toutes les périodes" — retourner TOUTES les MRs
    if not p_id:
        from app.models.merge_request import MergeRequest
        from app.models.developer import Developer
        query = (
            db.query(MergeRequest)
            .options(
                joinedload(MergeRequest.developer),
                joinedload(MergeRequest.reviewer),
                joinedload(MergeRequest.assignee)
            )
            .join(Developer, MergeRequest.developer_id == Developer.id)
            .filter(
                Developer.is_active == True,
                Developer.is_validated == True,
                Developer.is_bot == False
            )
        )
        if exclude_draft:
            query = query.filter(MergeRequest.is_draft.is_(False))
        return (
            query
            .order_by(MergeRequest.created_at_gitlab.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    from app.models.merge_request import MergeRequest
    from app.models.developer import Developer
    query = (
        db.query(MergeRequest)
        .options(
            joinedload(MergeRequest.developer),
            joinedload(MergeRequest.reviewer),
            joinedload(MergeRequest.assignee)
        )
        .join(Developer, MergeRequest.developer_id == Developer.id)
        .filter(
            MergeRequest.project_id == p_id,
            Developer.is_active == True,
            Developer.is_validated == True,
            Developer.is_bot == False
        )
    )
    
    if exclude_draft:
        query = query.filter(MergeRequest.is_draft.is_(False))
    
    if lot_id is not None:
        query = query.filter(MergeRequest.extraction_lot_id == lot_id)
        
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