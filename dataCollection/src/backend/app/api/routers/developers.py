"""
api/routers/developers.py
"""
import csv
import io
import logging
import calendar
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Request, UploadFile, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_manager, get_current_team_lead_or_above, get_current_user
from app.database.session import get_db
from app.repositories.user_repository import AppUserRepository
from app.models.app_user import AppUser
from app.models.project import Project
from app.models.site import Site
from app.repositories.developer_import_log_repository import DeveloperImportLogRepository
from app.repositories.developer_project_repository import DeveloperProjectRepository
from app.repositories.developer_repository import DeveloperGroupRepository, DeveloperRepository
from app.repositories.developer_site_repository import DeveloperSiteRepository
from app.schemas.developer import (
    DeveloperCreate,
    DeveloperGroupCreate,
    DeveloperGroupResponse,
    DeveloperGroupUpdate,
    DeveloperImportLogResponse,
    DeveloperImportResponse,
    DeveloperResponse,
    DeveloperSummary,
    PaginatedDeveloperSummary,
    DeveloperUpdate,
    DeveloperValidate,
    TimelineEvent,
    ProjectAssociationResponse,
    SiteAssociationResponse,
)
from app.services.admin.developer_service import DeveloperService

logger          = logging.getLogger(__name__)
router          = APIRouter(prefix="/developers", tags=["Developers"])
group_router    = APIRouter(tags=["Developer Groups"])

# ──────────────────────────────────────────────────────────────────────────────────
# HELPER : DÉTECTION DES CHANGEMENTS D'AFFECTATION
# ──────────────────────────────────────────────────────────────────────────────────

def _detect_changes(old_val: dict, new_val: dict, field_name: str, id_field: str) -> list:
    """
    Détecte les changements dans un tableau d'affectation (sites, group_ids, projects).
    Retourne une liste de descriptions des changements.
    """
    old_items = old_val.get(field_name, [])
    new_items = new_val.get(field_name, [])
    
    if not old_items and not new_items:
        return []
    
    # Convertir en listes si ce sont des objets
    if old_items and isinstance(old_items[0], dict):
        old_ids = [item.get(id_field) for item in old_items if item.get(id_field)]
    else:
        old_ids = old_items if old_items else []
    
    if new_items and isinstance(new_items[0], dict):
        new_ids = [item.get(id_field) for item in new_items if item.get(id_field)]
    else:
        new_ids = new_items if new_items else []
    
    changes = []
    
    # Ajouts
    for new_id in new_ids:
        if new_id not in old_ids:
            changes.append(f"Ajouté {id_field}={new_id}")
    
    # Suppressions
    for old_id in old_ids:
        if old_id not in new_ids:
            changes.append(f"Supprimé {id_field}={old_id}")
    
    return changes
dev_repo        = DeveloperRepository()
group_repo      = DeveloperGroupRepository()
import_log_repo = DeveloperImportLogRepository()
user_repo       = AppUserRepository()


def _get_tenant_user_id(db: Session, current_user: AppUser) -> int:
    """Récupère l'ID du tenant_user correspondant à l'utilisateur courant."""
    tenant_user = user_repo.get_by_email(db, current_user.email)
    if not tenant_user:
        raise HTTPException(status_code=404, detail="USER_NOT_FOUND_IN_TENANT: Utilisateur non trouvé dans la base tenant")
    return tenant_user.id

from pydantic import BaseModel as PydanticModel


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPER GROUPS
# ═══════════════════════════════════════════════════════════════════════════════

@group_router.get("/developer-groups", response_model=List[DeveloperGroupResponse])
def list_groups(
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
    site_id:      Optional[int] = Query(default=None),
    group_id:     Optional[int] = Query(default=None),
    active_only:  bool          = Query(default=False),
    period_id:    Optional[int] = Query(default=None), # ✅ AJOUT SENIOR
):
    # DEBUG: Log parameters
    print(f"DEBUG /developer-groups - current_user.role: {current_user.role}, current_user.site_id: {current_user.site_id}, current_user.group_id: {current_user.group_id}")
    print(f"DEBUG /developer-groups - site_id param: {site_id}, group_id param: {group_id}, active_only: {active_only}, period_id: {period_id}")
    
    # Enforce site-based access control for site_manager
    if current_user.is_site_manager:
        if site_id is None:
            site_id = current_user.site_id
            print(f"DEBUG /developer-groups - site_manager: using current_user.site_id: {site_id}")
        elif site_id != current_user.site_id:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=403,
                detail=f"Accès aux groupes du site {site_id} refusé. Vous gérez uniquement le site {current_user.site_id}."
            )
    
    # Enforce group-based access control for team_lead
    if current_user.is_team_lead:
        # ✅ ARCHITECTURE MULTI-TENANT: Charger les assignations multi-équipes depuis tenant
        from app.repositories.user_group_access_repository import UserGroupAccessRepository
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations d'équipes depuis tenant
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single group
        if current_user.group_id:
            accessible_group_ids.append(current_user.group_id)
        
        print(f"DEBUG /developer-groups - team_lead accessible_group_ids: {accessible_group_ids}")
        
        if not accessible_group_ids:
            # Team lead without group assignments - return empty list
            print(f"DEBUG /developer-groups - team_lead has no group assignments, returning empty list")
            return []
        
        if group_id is None:
            # Retourner tous les groupes accessibles
            all_groups = group_repo.get_all(db, active_only=active_only, period_id=period_id)
            accessible_groups = [g for g in all_groups if g.id in accessible_group_ids]
            print(f"DEBUG /developer-groups - team_lead returning {len(accessible_groups)} accessible groups")
            return accessible_groups
        elif group_id not in accessible_group_ids:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=403,
                detail=f"Accès au groupe {group_id} refusé. Vous gérez uniquement les groupes {accessible_group_ids}."
            )
        # For team_lead with specific group_id, return that group
        group = group_repo.get_by_id(db, group_id)
        print(f"DEBUG /developer-groups - team_lead: group by id returned: {group.name if group else 'None'}")
        return [group] if group else []
    
    # Enforce project-based access control for project_manager
    if current_user.is_project_manager:
        # ✅ ARCHITECTURE MULTI-TENANT: Charger les assignations multi-projets depuis tenant
        from app.repositories.user_project_access_repository import UserProjectAccessRepository
        project_access_repo = UserProjectAccessRepository()
        
        accessible_project_ids = [access.project_id for access in project_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single project
        if current_user.project_ids:
            accessible_project_ids.extend(current_user.project_ids)
        
        if not accessible_project_ids:
            # Project manager without projects assigned - return empty list
            print(f"DEBUG /developer-groups - project_manager has no projects assigned, returning empty list")
            return []
        
        # Filter groups by user's assigned projects
        # Get all groups, then filter by project associations
        all_groups = group_repo.get_all(db, active_only=active_only, period_id=period_id)
        # Filter groups that belong to the user's projects
        # This requires checking group-project associations
        # For now, return all groups and let frontend filter by project
        # TODO: Implement proper project-based group filtering
        print(f"DEBUG /developer-groups - project_manager: returning all groups (frontend will filter by project)")
        return all_groups
    
    # ✅ FIX: Filter groups for viewer - only show their assigned groups (same logic as sites)
    if current_user.role == 'viewer':
        from app.repositories.user_group_access_repository import UserGroupAccessRepository
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations de groupes depuis tenant
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        print(f"DEBUG /developer-groups - viewer accessible_group_ids: {accessible_group_ids}")
        
        # Filtrer pour ne garder que les groupes accessibles
        if accessible_group_ids:
            all_groups = group_repo.get_all(db, active_only=active_only, period_id=period_id)
            filtered_groups = [g for g in all_groups if g.id in accessible_group_ids]
            print(f"DEBUG /developer-groups - viewer returning {len(filtered_groups)} assigned groups")
            return filtered_groups
        else:
            # Si aucun groupe assigné, retourner une liste vide
            print(f"DEBUG /developer-groups - viewer has no group assignments, returning empty list")
            return []
    
    if site_id:
        groups = group_repo.get_by_site_id(db, site_id, active_only=active_only, period_id=period_id)
        print(f"DEBUG /developer-groups - groups by site_id returned: {len(groups)}")
        for g in groups:
            print(f"DEBUG /developer-groups - group: {g.name} (id={g.id})")
        return groups
    if group_id:
        group = group_repo.get_by_id(db, group_id)
        print(f"DEBUG /developer-groups - group by id returned: {group.name if group else 'None'}")
        return [group] if group else []
    groups = group_repo.get_all(db, active_only=active_only, period_id=period_id)
    print(f"DEBUG /developer-groups - all groups returned: {len(groups)}")
    return groups


@group_router.post("/developer-groups", response_model=DeveloperGroupResponse, status_code=201)
def create_group(
    request:       DeveloperGroupCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    # Résolution intelligente du site_id (Backward Compatibility)
    site_id = request.site_id
    if site_id is None and request.site_ids:
        site_id = request.site_ids[0]

    #  FALLBACK SENIOR : Si toujours None, on prend le premier site pour éviter le crash (NOT NULL constraint)
    if site_id is None:
        first_site = db.query(Site).first()
        if first_site:
            site_id = first_site.id
            logger.warning(f"Import/API : Aucun site fourni pour le groupe '{request.name}', rattachage automatique au site '{first_site.name}' (ID {site_id})")

    data = request.model_dump(exclude={"site_ids", "site_id"})
    data["site_id"] = site_id
    
    group = group_repo.create(db, data)
    
    db.commit()
    db.refresh(group)
    
    # Enrichissement de la réponse pour la compatibilité
    res = DeveloperGroupResponse.model_validate(group)
    if group.site:
        res.sites = [group.site]
    return res


@group_router.put("/developer-groups/{group_id}", response_model=DeveloperGroupResponse)
def update_group(
    group_id:      int,
    request:       DeveloperGroupUpdate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    group = group_repo.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Groupe introuvable.")
        
    # Résolution intelligente du site_id
    site_id = request.site_id
    if site_id is None and request.site_ids:
        site_id = request.site_ids[0]

    update_data = request.model_dump(exclude_unset=True, exclude={"site_ids", "site_id"})
    
    #  FALLBACK SENIOR : Si on essaie de mettre à null un site (ou si absent à la création forcée par l'UI)
    if site_id is not None:
        update_data["site_id"] = site_id
    elif "site_id" in update_data and update_data["site_id"] is None:
        # Empêcher de mettre à NULL car la base l'interdit
        first_site = db.query(Site).first()
        if first_site:
            update_data["site_id"] = first_site.id
            logger.info(f"Update : site_id forcé au premier site ({first_site.name}) car requis.")

    group_repo.update(db, group, update_data)
    
    db.commit()
    db.refresh(group)

    # Enrichissement de la réponse pour la compatibilité
    res = DeveloperGroupResponse.model_validate(group)
    if group.site:
        res.sites = [group.site]
    return res


@group_router.delete("/developer-groups/{group_id}", status_code=204)
def delete_group(
    group_id:      int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    group = group_repo.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Groupe introuvable.")
    db.delete(group)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPERS — Routes statiques (AVANT /{developer_id})
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/summary")
def get_developer_summary(
    db:               Session       = Depends(get_db),
    current_user:     AppUser       = Depends(get_current_user),
    project_id:       Optional[int] = Query(default=None),
    site_id:          Optional[int] = Query(default=None),
    group_id:         Optional[int] = Query(default=None),
    period_id:        Optional[int] = Query(default=None),
):
    return dev_repo.get_summary(
        db=db, project_id=project_id, site_id=site_id, group_id=group_id, period_id=period_id
    )


@router.get("/leaderboard")
def get_developer_leaderboard(
    project_id:   int           = Query(...),
    period_id:    Optional[int] = Query(default=None),
    site_id:      Optional[int] = Query(default=None),
    limit:        int           = Query(default=20, ge=1, le=50),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    from app.models.kpi_snapshot import KpiSnapshot
    from app.services.kpi.analytics_service import AnalyticsService

    service = AnalyticsService(db)

    if period_id is None:
        snap = (
            db.query(KpiSnapshot)
            .filter(
                KpiSnapshot.project_id   == project_id,
                KpiSnapshot.developer_id.isnot(None),
            )
            .order_by(KpiSnapshot.snapshot_date.desc())
            .first()
        )
        if snap:
            period_id = snap.period_id
        else:
            return {"site_id": site_id, "period_label": "—", "total_devs": 0, "entries": []}

    return service.get_leaderboard(
        project_id=project_id, period_id=period_id, site_id=site_id, limit=limit
    )


@router.get("/import-logs", response_model=List[DeveloperImportLogResponse])
def list_import_logs(
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
    limit:         int     = Query(default=20, ge=1, le=100),
    offset:        int     = Query(default=0, ge=0),
):
    return import_log_repo.get_recent(db, limit=limit, offset=offset)


@router.get("/import/template",
    summary="Télécharger le template CSV d'import développeurs",
    response_class=StreamingResponse,
)
def download_import_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "email", "gitlab_username", "sites", "projects", "group", "onboarding_date", "offboarding_date"])
    writer.writerow(["Ahmed Ben Ali",  "ahmed.benali@example.com",  "ahmed.benali",  "Tunis,Paris", "backend-api:1234,frontend:5678", "Équipe A", "2024-01-01", ""])
    writer.writerow(["Sara Trabelsi",  "sara.trabelsi@example.com", "sara.trabelsi", "Tunis",       "backend-api:1234",             "Équipe B", "2024-02-15", ""])
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=import_developers_template.csv"},
    )


@router.get("", response_model=PaginatedDeveloperSummary)
def list_developers(
    db:               Session       = Depends(get_db),
    current_user:     AppUser       = Depends(get_current_user),
    project_id:       Optional[int] = Query(default=None),
    site_id:          Optional[int] = Query(default=None),
    group_id:         Optional[int] = Query(default=None),
    gitlab_config_id: Optional[int] = Query(default=None),
    tab:              str           = Query(default="validated"),
    active_only:      bool          = Query(default=False),
    period_id:        Optional[int] = Query(default=None),
    page:             int           = Query(default=1, ge=1),
    size:             int           = Query(default=20, ge=1, le=100),
):
    # SENIOR : active_only force le tab 'validated' pour les KPIs
    effective_tab = "validated" if active_only else tab
    
    skip = (page - 1) * size
    devs, total = dev_repo.get_by_tab(
        db=db, tab=effective_tab, 
        project_id=project_id, site_id=site_id, group_id=group_id,
        gitlab_config_id=gitlab_config_id,
        period_id=period_id, active_only=active_only,
        skip=skip, limit=size
    )

    # ✅ SENIOR : Intelligence post-filtrage pour l'extraction
    # On nettoie les associations pour ne garder que ce qui est UNIQUE
    if tab == "extraction":
        for dev in devs:
            # 1. Si period_id est fourni, on ne fait pas de dé-duplication hâtive qui détruit l'historique SCD Type 2.
            # On laisse le filtrage temporel par période s'occuper de sélectionner la bonne association.
            if period_id is None:
                all_pas = dev.project_associations
                seen_projects = set()
                unique_pas = []
                for pa in all_pas:
                    if pa.project_id not in seen_projects:
                        unique_pas.append(pa)
                        seen_projects.add(pa.project_id)
                dev.project_associations = unique_pas
            
            # 3. On garde les missions sites (on ne filtre plus par is_active ici)
            dev.site_associations = dev.site_associations

            # 4. ✅ [SENIOR] FIX : Override rh_status pour le frontend
            # Puisque le repository nous a renvoyé ce dev pour l'extraction,
            # on le force en "ACTIVE" pour que les cases à cocher ne soient pas grisées
            # même si le dev est OFFBOARDED aujourd'hui.
            dev._rh_status_override = "ACTIVE"

    # AJOUT SENIOR : Résolution de la période pour le calcul du statut RH
    start_period, end_period = None, None
    if period_id:
        try:
            from app.repositories.period_repository import PeriodRepository
            period = PeriodRepository().get_by_id(db, period_id)
            if period:
                start_period = date(period.year, period.month, 1)
                last_day = calendar.monthrange(period.year, period.month)[1]
                end_period = date(period.year, period.month, last_day)
        except Exception as e:
            logger.error(f"Error resolving period dates: {e}")

    # ✅ [FIX] Apply DeveloperContext for proper historical RH status calculation
    context_manager = None
    if period_id and start_period:
        from app.models.developer import DeveloperContext
        context_manager = DeveloperContext(db, start_period)
        context_manager.__enter__()

    # ✅ [SENIOR] FIX 2 : Batch pre-fetching ultra-sécurisé
    site_ids = set()
    project_ids = set()
    try:
        for d in devs:
            if hasattr(d, 'site_associations') and d.site_associations:
                for sa in d.site_associations: 
                    if sa.site_id: site_ids.add(sa.site_id)
            if hasattr(d, 'project_associations') and d.project_associations:
                for pa in d.project_associations: 
                    if pa.project_id: project_ids.add(pa.project_id)
        
        site_names = {}
        if site_ids:
            s_rows = db.query(Site.id, Site.name).filter(Site.id.in_(list(site_ids))).all()
            site_names = {r.id: r.name for r in s_rows}
            
        project_names = {}
        project_gitlab_ids = {}
        if project_ids:
            p_rows = db.query(Project.id, Project.name, Project.gitlab_project_id).filter(Project.id.in_(list(project_ids))).all()
            project_names = {r.id: r.name for r in p_rows}
            project_gitlab_ids = {r.id: r.gitlab_project_id for r in p_rows}
    except Exception as e:
        logger.error(f"CRITICAL: Error in batch pre-fetching: {e}")
        site_names, project_names, project_gitlab_ids = {}, {}, {}

    results = []
    for d in devs:
        # ✅ SENIOR : Filtrage temporel intelligent des SITES (SCD Type 2)
        visible_sites = []
        primary_site_id = None
        for sa in d.site_associations:
            is_visible = True
            if start_period and end_period:
                if sa.end_date and sa.end_date < start_period:
                    is_visible = False
                if sa.start_date and sa.start_date > end_period:
                    is_visible = False
            
            if is_visible:
                # ✅ [SENIOR] FIX : Guard against null site relationship
                sname = site_names.get(sa.site_id)
                if not sname and sa.site:
                    sname = sa.site.name
                if not sname:
                    sname = f"Site #{sa.site_id}"
                
                visible_sites.append(SiteAssociationResponse(
                    site_id=sa.site_id, 
                    site_name=sname, 
                    is_primary=sa.is_primary or False
                ))
                if sa.is_primary:
                    primary_site_id = sa.site_id

        # ✅ SENIOR : Filtrage temporel intelligent des GROUPES (SCD Type 2)
        visible_group_ids = []
        for gl in d.group_links:
            is_visible = True
            if start_period and end_period:
                if gl.end_date and gl.end_date < start_period:
                    is_visible = False
                if gl.start_date and gl.start_date > end_period:
                    is_visible = False
            
            if is_visible:
                visible_group_ids.append(gl.group_id)

        official_projects = []
        seen_serialized_projects = set()
        for pa in d.project_associations:
            # On ne montre que les projets actifs durant cette période spécifique si demandée
            if period_id is not None:
                if pa.period_id != period_id:
                    if pa.period_id is not None:
                        # Lié à une AUTRE période explicite
                        continue
                    
                    # SCD Type 2 (period_id is None) : vérifier le chevauchement des dates
                    if end_period and pa.start_date and pa.start_date > end_period:
                        continue # Projet commencé APRES la fin de cette période
                    if start_period and pa.end_date and pa.end_date < start_period:
                        continue # Projet terminé AVANT le début de cette période
            
            # Dé-duplication post-filtrage
            if pa.project_id in seen_serialized_projects:
                continue
            seen_serialized_projects.add(pa.project_id)
            
            # ✅ [SENIOR] FIX : Guard against null project relationship
            pname = project_names.get(pa.project_id)
            if not pname and pa.project:
                pname = pa.project.name
            if not pname:
                pname = f"Projet #{pa.project_id}"
                
            pgitid = project_gitlab_ids.get(pa.project_id)
            if not pgitid and pa.project:
                pgitid = pa.project.gitlab_project_id
            
            official_projects.append({
                "project_id": pa.project_id,
                "project_name": pname,
                "gitlab_project_id": pgitid,
                "is_active": pa.is_active or False,
                "period_id": pa.period_id,
            })

        # ✅ [ENTERPRISE] Statut RH contextuel selon la période sélectionnée
        # FUTURE : le dev n'a pas encore commencé pendant cette période (onboarding > fin_période)
        # ✅ [FIX] Use DeveloperContext-calculated rh_status directly
        current_status = d.rh_status
        
        # ✅ [SENIOR] Override rh_status si explicitement défini (ex: pour l'onglet d'extraction)
        if hasattr(d, '_rh_status_override') and d._rh_status_override:
            current_status = d._rh_status_override
        
        results.append(DeveloperSummary(
            id=d.id,
            gitlab_username=d.gitlab_username,
            name=d.name,
            email=d.email,
            is_external=d.is_external,
            is_active=d.is_active,
            is_validated=d.is_validated,
            is_bot=d.is_bot,
            group_ids=visible_group_ids,
            primary_site_id=primary_site_id,
            onboarding_date=d.onboarding_date,
            offboarding_date=d.offboarding_date,
            rh_status=current_status,
            sites=visible_sites,
            projects=official_projects
        ))

    # ✅ [FIX] Cleanup DeveloperContext
    if context_manager:
        context_manager.__exit__(None, None, None)

    import math
    return {
        "items": results,
        "total": total,
        "page":  page,
        "size":  size,
        "pages": math.ceil(total / size) if size > 0 else 1
    }



# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPERS — Écriture
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("", response_model=DeveloperResponse, status_code=201)
def create_developer(
    request:       DeveloperCreate,
    req:           Request,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    service   = DeveloperService()
    developer = service.create_developer(
        db=db, payload=request,
        created_by=current_admin.id,
        ip_address=req.client.host if req.client else None,
    )
    return _build_developer_response(db, developer)


@router.post("/import", response_model=DeveloperImportResponse, status_code=201)
async def import_developers(
    background_tasks:        BackgroundTasks,
    file:                    UploadFile    = File(..., description="Fichier CSV ou Excel"),
    period_id:               Optional[int] = Form(default=None, description="Période cible pour cet import (Laisser vide pour mission permanente)"),
    default_site_id:         Optional[int] = Form(default=None),
    default_group_id:        Optional[int] = Form(default=None),
    default_gitlab_config_id: Optional[int] = Form(default=None),
    dry_run:                 bool          = Form(default=False),
    #  NOUVEAU : paramètres enterprise auto-création
    create_missing_sites:    bool          = Form(
        default=False,
        description=(
            "Si True : les sites du CSV absents en base sont créés automatiquement "
            "(name=<nom>, country='À définir', is_active=True). "
            "Désactivé par défaut — activer seulement si vous faites confiance au fichier source."
        ),
    ),
    create_missing_projects: bool          = Form(
        default=False,
        description=(
            "Si True : les projets du CSV absents en base sont créés automatiquement. "
            "Même comportement que create_missing_sites."
        ),
    ),
    create_missing_groups: bool            = Form(default=False),
    full_sync:             bool            = Form(
        default=False,
        description="Si True : désactive les développeurs absents du fichier (Sync totale)."
    ),
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """
    Import en masse de développeurs depuis un fichier CSV ou Excel.

    Paramètres enterprise :
        create_missing_sites    → crée les sites inconnus automatiquement.
        create_missing_projects → crée les projets inconnus automatiquement.
        create_missing_groups   → crée les groupes inconnus automatiquement.
        full_sync               → désactive les développeurs absents du fichier.

    Si ces paramètres sont False (défaut), les entités inconnues sont listées
    dans unknown_sites / unknown_projects / unknown_groups dans la réponse,
    avec des warnings par ligne dans rows[].warnings.

    Téléchargez le template via GET /developers/import/template.
    """
    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Format non supporté. Utilisez CSV (.csv) ou Excel (.xlsx, .xls).",
        )

    content = await file.read()
    service = DeveloperService()

    #  LOGIQUE SENIOR : Résilience — Si aucun domaine n'est spécifié, on prend le premier disponible
    # pour éviter de créer des projets orphelins (gitlab_config_id=None).
    if default_gitlab_config_id is None:
        from app.models.gitlab_config import GitLabConfig
        first_config = db.query(GitLabConfig).first()
        if first_config:
            default_gitlab_config_id = first_config.id
            logger.info("Import: Aucun domaine spécifié, utilisation automatique du Domaine ID %d", default_gitlab_config_id)

    result = service.import_from_file(
        db                      = db,
        file_content            = content,
        file_name               = file.filename,
        period_id               = period_id,  #  AJOUT SENIOR
        imported_by             = current_admin.id,
        default_site_id         = default_site_id,
        default_group_id        = default_group_id,
        default_gitlab_config_id = default_gitlab_config_id,
        dry_run                 = dry_run,
        create_missing_sites    = create_missing_sites,
        create_missing_projects = create_missing_projects,
        create_missing_groups   = create_missing_groups,
        full_sync               = full_sync,
    )

    # ✅ [SOLUTION SOLIDE] : Recalcul automatique après import
    processed_ids = result.get("processed_ids", [])
    if not dry_run and processed_ids:
        from app.services.kpi.kpi_service import KpiService
        kpi_service = KpiService()
        logger.info(f"[ENTERPRISE] Import finished. Triggering background recalculation for {len(processed_ids)} developers.")
        
        # On regroupe les recalculs (un appel par dev suffit, il traitera toutes ses périodes impactées)
        for d_id in processed_ids:
            background_tasks.add_task(
                kpi_service.recalculate_developer_history,
                developer_id=d_id,
                changed_fields=["import_sync"]
            )
            
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPERS — Validation en masse
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/validate-all")
def validate_all_developers(
    req:           Request,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_team_lead_or_above),
):
    """
    Valide en masse tous les développeurs non-bots en attente de validation.
    Solution enterprise : un seul appel API pour valider tous les contributeurs humains.
    """
    from app.models.developer import Developer
    pending = db.query(Developer).filter(
        Developer.is_validated == False,
        Developer.is_bot == False,
    ).all()

    count = 0
    for dev in pending:
        dev.is_validated = True
        dev.is_active    = True
        count += 1

    db.commit()
    logger.info(f"[validate-all] {count} développeurs validés par admin id={current_admin.id}")
    return {"validated": count, "message": f"{count} développeurs validés avec succès."}


@router.patch("/{developer_id}/validate")
def validate_developer(
    developer_id: int,
    payload:       dict = Body(...),
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_team_lead_or_above),
):
    """
    Valide ou rejette un développeur spécifique.
    """
    from app.models.developer import Developer
    developer = db.query(Developer).filter(Developer.id == developer_id).first()
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")
    
    is_validated = payload.get("is_validated", True)
    developer.is_validated = is_validated
    if is_validated:
        developer.is_active = True
        
    db.commit()
    logger.info(f"[validate] Développeur id={developer_id} {'validé' if is_validated else 'rejeté'} par admin id={current_admin.id}")
    return {"success": True, "is_validated": is_validated}


class BulkValidateRequest(PydanticModel):
    ids: List[int]


@router.post("/validate-selected")
def validate_selected_developers(
    payload:       BulkValidateRequest,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_team_lead_or_above),
):
    """
    Valide une liste spécifique d'IDs de développeurs.
    """
    from app.models.developer import Developer
    count = 0
    for dev_id in payload.ids:
        dev = db.query(Developer).filter(Developer.id == dev_id).first()
        if dev:
            dev.is_validated = True
            dev.is_active = True
            count += 1
            
    db.commit()
    logger.info(f"[validate-selected] {count} développeurs validés par admin id={current_admin.id}")
    return {"count": count, "message": f"{count} développeurs validés avec succès."}


@router.post("/{developer_id}/merge/{duplicate_id}")
def merge_developers(
    developer_id: int,
    duplicate_id: int,
    db:           Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    """
    Fusionne un doublon vers un profil canonique.
    """
    service = DeveloperService()
    try:
        service.merge(db, developer_id, duplicate_id)
        db.commit()
        logger.info(f"[merge] Doublon id={duplicate_id} fusionné vers id={developer_id} par admin id={current_admin.id}")
        return {"success": True, "message": "Fusion réussie."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPERS — Routes paramétrées (APRÈS les routes statiques)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{developer_id}", response_model=DeveloperResponse)
def get_developer(
    developer_id: int,
    period_id:    Optional[int] = None,
    db:           Session = Depends(get_db),
    _:            AppUser = Depends(get_current_user),
):
    """
    [ENTERPRISE] Retourne le profil du développeur.
    Si period_id est fourni, tente de retourner le snapshot historique (CASE B).
    Si le snapshot est vide (Future Joiner), bascule automatiquement sur la Master View.
    """
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")

    if period_id:
        from app.models.period import Period
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            from app.models.developer import DeveloperContext
            # 1. Tentative de snapshot à la période demandée
            with DeveloperContext(db, period.start_date):
                response = _build_developer_response(db, developer)
            
            # 2. Logique de repli (Fallback) pour les Future Joiners
            # Si aucune affectation n'est trouvée ET que le dev commence plus tard
            has_assignments = (len(response.group_ids) > 0 or len(response.projects) > 0)
            is_future_joiner = (developer.onboarding_date and developer.onboarding_date > period.start_date)
            
            if not has_assignments and is_future_joiner:
                # Retourne la Master View (données futures)
                return _build_developer_response(db, developer)
            
            return response

    # Par défaut ou si pas de période : Master View
    return _build_developer_response(db, developer, is_master_view=True)


# ✅ [REMOVED] Analyse de Performance 360° - Non fonctionnelle
# Endpoint désactivé car la fonctionnalité n'est pas fonctionnelle

# @router.get("/{developer_id}/kpis")
# def get_developer_kpis(
#     developer_id: int,
#     project_id:   int     = Query(...),
#     db:           Session = Depends(get_db),
#     current_user: AppUser = Depends(get_current_user),
# ):
#     from app.services.kpi.analytics_service import AnalyticsService
#     developer = dev_repo.get_by_id(db, developer_id)
#     if not developer:
#         raise HTTPException(status_code=404, detail="Développeur introuvable.")
#     service = AnalyticsService(db)
#     return service.get_developer_kpi_summary(developer_id=developer_id, project_id=project_id)


@router.get("/{developer_id}/timeline", response_model=List[TimelineEvent])
def get_developer_timeline(
    developer_id: int,
    period_id: Optional[int] = Query(None, description="Filter timeline by period"),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        from app.models.audit_log import AuditLog
        developer = dev_repo.get_by_id(db, developer_id)
        if not developer:
            raise HTTPException(status_code=404, detail="Développeur introuvable.")

        events = []
    
        # 1. Onboarding Event (always the first historically)
        # Use onboarding_date if available, otherwise created_at
        onboarding_date = developer.onboarding_date or developer.created_at.date()
        # Convert date to datetime if necessary for proper sorting
        from datetime import datetime, time
        import pytz
        
        if isinstance(onboarding_date, datetime):
            onboard_dt = onboarding_date
        else:
            onboard_dt = datetime.combine(onboarding_date, time.min).replace(tzinfo=pytz.UTC)

        events.append(TimelineEvent(
            date=onboard_dt,
            title="Onboarding",
            description="Création du profil ou intégration dans l'entreprise",
            icon="ri-user-add-line",
            color="success"
        ))

        # 2. Fetch Mission Assignments (RH Presence - Focus on Mission Presence)
        # ─────────────────────────────────────────────────────────────────────────
        from sqlalchemy import or_
        from app.models.period import Period
        from app.models.developer_project import DeveloperProject
        from app.models.project import Project
        
        # Get the selected period if provided
        selected_period = None
        if period_id:
            selected_period = db.query(Period).filter(Period.id == period_id).first()
        
        # Get all mission assignments for this developer
        try:
            # Get ALL active project assignments regardless of period
            project_assignments = db.query(
                DeveloperProject,
                Project.name
            ).join(Project, Project.id == DeveloperProject.project_id)\
             .filter(
                 DeveloperProject.developer_id == developer_id,
                 DeveloperProject.is_active == True
             ).all()
            
            # Build projects_map: (year, month) -> list of project names
            projects_map = {}
            for dp, proj_name in project_assignments:
                # Determine which months this assignment covers
                start_date = dp.start_date or developer.created_at.date()
                end_date = dp.end_date or date.today()
                
                # Get all periods this assignment covers
                period_query = db.query(Period).filter(
                    Period.year >= start_date.year,
                    (Period.year < end_date.year) | ((Period.year == end_date.year) & (Period.month <= end_date.month))
                )
                
                periods = period_query.all()
                
                for period in periods:
                    key = (period.year, period.month)
                    if key not in projects_map:
                        projects_map[key] = []
                    projects_map[key].append(proj_name)
        except Exception as e:
            print(f"Error fetching project assignments: {e}")
            projects_map = {}
        
        # Collect deactivation/reactivation events from AuditLog for suspension filtering
        deactivation_events = []
        reactivation_events = []
        
        logs = db.query(AuditLog).filter(
            AuditLog.entity_type == "Developer",
            AuditLog.entity_id == developer_id
        ).order_by(AuditLog.created_at.asc()).all()
        
        for log in logs:
            old_val = log.old_value or {}
            new_val = log.new_value or {}
            
            # Track deactivation events
            if log.action == "DEV_DEACTIVATED_VIA_SYNC":
                deactivation_events.append(log.created_at)
            elif log.action == "UPDATE_DEVELOPER":
                if old_val.get("is_active") is True and new_val.get("is_active") is False:
                    deactivation_events.append(log.created_at)
                elif old_val.get("is_active") is False and new_val.get("is_active") is True:
                    reactivation_events.append(log.created_at)
        
        # Build active periods: [(start_date, end_date), ...]
        # Start with onboarding date as first active period
        active_periods = []
        current_active_start = developer.onboarding_date or developer.created_at.date()
        
        for deactivation_date in sorted(deactivation_events):
            active_periods.append((current_active_start, deactivation_date.date()))
            # Find next reactivation
            next_reactivation = None
            for reactivation_date in sorted(reactivation_events):
                if reactivation_date.date() > deactivation_date.date():
                    next_reactivation = reactivation_date.date()
                    break
            if next_reactivation:
                current_active_start = next_reactivation
            else:
                # No reactivation, end of active period
                current_active_start = None
                break
        
        if current_active_start:
            active_periods.append((current_active_start, None))  # Still active
        
        # Generate Monthly Mission Events (Focus on RH Presence)
        # ─────────────────────────────────────────────────────────────────────────
        MOIS_FR = {
            1: "Janvier", 2: "Février", 3: "Mars", 4: "Avril", 
            5: "Mai", 6: "Juin", 7: "Juillet", 8: "Août", 
            9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre"
        }
        
        # Sort periods in descending order
        all_periods = sorted(projects_map.keys(), key=lambda x: (x[0], x[1]), reverse=True)
        
        for y, m in all_periods:
            project_names = projects_map.get((y, m), [])
            if project_names:
                # Use DeveloperContext to check if developer was active during this month
                month_date = date(y, m, 15)  # Use mid-month for status check
                
                # Save current context state
                original_context = getattr(developer, "_context_period_date", None)
                
                from app.models.developer import DeveloperContext
                with DeveloperContext(db, month_date):
                    # Reload developer with context date
                    db.refresh(developer)
                    status = developer.rh_status
                
                # Restore original context state to avoid affecting KPI queries
                developer._context_period_date = original_context
                db.expire(developer)  # Clear session cache to restore original state
                
                # Only show mission if developer was ACTIVE during this month
                if status == "ACTIVE":
                    dt = datetime(y, m, 1, tzinfo=pytz.UTC)
                    month_name = f"{MOIS_FR.get(m, 'Mois')} {y}"
                    proj_list = ", ".join(project_names)
                    
                    events.append(TimelineEvent(
                        date=dt,
                        title=f"Mission : {month_name}",
                        description=f"Affectation RH : {proj_list}",
                        icon="ri-briefcase-line",
                        color="primary",
                        is_mission=True
                    ))
                elif status == "INACTIVE":
                    # Developer was inactive (suspended/sabbatical) during this month
                    dt = datetime(y, m, 1, tzinfo=pytz.UTC)
                    month_name = f"{MOIS_FR.get(m, 'Mois')} {y}"
                    
                    events.append(TimelineEvent(
                        date=dt,
                        title=f"Inactivité : {month_name}",
                        description="Développeur sans affectation active (Sabbat/Suspension)",
                        icon="ri-user-unfollow-line",
                        color="warning"
                    ))

        # 3. Process AuditLog for other events (mutations, corrections, etc.)
        # Note: logs already fetched above for suspension detection

        for log in logs:
            old_val = log.old_value or {}
            new_val = log.new_value or {}
            
            # Determine human readable titles based on Senior Enterprise patterns
            if log.action == "DEV_DEACTIVATED_VIA_SYNC":
                reason = new_val.get("reason", "Absent du fichier de synchronisation RH")
                events.append(TimelineEvent(
                    date=log.created_at,
                    title="Désactivation automatique (Sync)",
                    description=f"Profil désactivé : {reason}",
                    icon="ri-user-unfollow-line",
                    color="danger",
                    details=new_val
                ))
            elif log.action == "UPDATE_DEVELOPER":
                # ✅ [INTELLIGENT] Détecte mutations (Case B) vs corrections (Case A)
                mutation_date = new_val.get("mutation_date")
                is_mutation = mutation_date is not None
                
                # Reactivation
                if old_val.get("is_active") is False and new_val.get("is_active") is True:
                    events.append(TimelineEvent(
                        date=log.created_at,
                        title="Réactivation du profil",
                        description="Retour dans l'effectif actif détecté (Synchronisation).",
                        icon="ri-user-follow-line",
                        color="success",
                        details=new_val
                    ))
                
                # Deactivation
                elif old_val.get("is_active") is True and new_val.get("is_active") is False:
                    reason = new_val.get("reason") or "Désactivation manuelle ou administrative"
                    events.append(TimelineEvent(
                        date=log.created_at,
                        title="Désactivation (Offboarding)",
                        description=f"Profil désactivé : {reason}",
                        icon="ri-user-unfollow-line",
                        color="danger",
                        details=new_val
                    ))
                
                # ✅ [INTELLIGENT] Détecte mutations historiques (Case B)
                elif is_mutation:
                    site_changes = _detect_changes(old_val, new_val, "sites", "site_id")
                    group_changes = _detect_changes(old_val, new_val, "group_ids", "group_id")
                    project_changes = _detect_changes(old_val, new_val, "projects", "project_id")
                    
                    if site_changes or group_changes or project_changes:
                        desc_parts = []
                        if site_changes:
                            desc_parts.append(f"Mutation de site : {', '.join(site_changes)}")
                        if group_changes:
                            desc_parts.append(f"Mutation d'équipe : {', '.join(group_changes)}")
                        if project_changes:
                            desc_parts.append(f"Mutation de projet : {', '.join(project_changes)}")
                        
                        events.append(TimelineEvent(
                            date=log.created_at,
                            title="Mutation historique (SCD Type 2)",
                            description=f"Changement d'affectation à date d'effet : {mutation_date}. {' '.join(desc_parts)}",
                            icon="ri-arrow-right-line",
                            color="primary",
                            details=new_val
                        ))
                    else:
                        # Mutation sans changement d'affectation
                        events.append(TimelineEvent(
                            date=log.created_at,
                            title="Mutation historique (SCD Type 2)",
                            description=f"Mutation à date d'effet : {mutation_date} (sans changement d'affectation)",
                            icon="ri-arrow-right-line",
                            color="primary",
                            details=new_val
                        ))
                
                # ✅ [INTELLIGENT] Détecte corrections rétroactives (Case A)
                elif not is_mutation:
                    site_changes = _detect_changes(old_val, new_val, "sites", "site_id")
                    group_changes = _detect_changes(old_val, new_val, "group_ids", "group_id")
                    project_changes = _detect_changes(old_val, new_val, "projects", "project_id")
                    
                    if site_changes or group_changes or project_changes:
                        desc_parts = []
                        if site_changes:
                            desc_parts.append(f"Correction de site : {', '.join(site_changes)}")
                        if group_changes:
                            desc_parts.append(f"Correction d'équipe : {', '.join(group_changes)}")
                        if project_changes:
                            desc_parts.append(f"Correction de projet : {', '.join(project_changes)}")
                        
                        # Skip retroactive corrections - they are not useful in the timeline
                        continue
                
                # Mobility / Data Change
                else:
                    # Check for specific changes like Site/Group if possible, or just generic update
                    events.append(TimelineEvent(
                        date=log.created_at,
                        title="Mise à jour administrative",
                        description="Modification des métadonnées RH (Site, Groupe ou Identité).",
                        icon="ri-edit-line",
                        color="info",
                        details=new_val
                    ))
            elif log.action == "MERGE_DEVELOPER":
                events.append(TimelineEvent(
                    date=log.created_at,
                    title="Fusion de profil (Dédoublonnage)",
                    description="Un compte en doublon a été fusionné vers ce profil principal.",
                    icon="ri-merge-cells-horizontal-line",
                    color="warning"
                ))

        # Sort descending
        events.sort(key=lambda x: x.date, reverse=True)
        return events
    except Exception as e:
        print(f"Error in get_developer_timeline: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


# ✅ [REMOVED] Alerts endpoint - Non fonctionnelle
# @router.get("/{developer_id}/alerts")
# def get_developer_alerts(
#     developer_id: int,
#     db:           Session = Depends(get_db),
#     current_user: AppUser = Depends(get_current_user),
# ):
#     from app.services.kpi.alert_service import AlertService
#     developer = dev_repo.get_by_id(db, developer_id)
#     if not developer:
#         raise HTTPException(status_code=404, detail="Développeur introuvable.")
#     alert_service = AlertService()
#     return alert_service.get_developer_alert_summary(db, developer_id)


@router.patch("/{developer_id}/validate", response_model=DeveloperResponse)
def validate_developer(
    developer_id:  int,
    request:       DeveloperValidate,
    req:           Request,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_team_lead_or_above),
):
    service   = DeveloperService()
    developer = service.validate_developer(
        db=db, developer_id=developer_id, payload=request,
        validated_by=current_admin.id,
        ip_address=req.client.host if req.client else None,
    )
    return _build_developer_response(db, developer)


@router.put("/{developer_id}")
def update_developer(
    developer_id:    int,
    request:         DeveloperUpdate,
    req:             Request,
    background_tasks: BackgroundTasks,
    db:              Session = Depends(get_db),
    current_admin:   AppUser = Depends(get_current_admin),
):
    try:
        service = DeveloperService()
        result  = service.update_developer(
            db=db, developer_id=developer_id, payload=request,
            updated_by=current_admin.id,
            ip_address=req.client.host if req.client else None,
        )

        # [ENTERPRISE] Le service retourne un dict enrichi avec les métadonnées
        # de recalcul pour informer l'UI qu'une correction sensible a eu lieu.
        developer           = result["developer"]
        recalculation_needed = result.get("recalculation_needed", False)
        changed_fields       = result.get("changed_fields", [])

        # Construction de la réponse developer standard
        dev_response = _build_developer_response(db, developer)

        # Enrichissement de la réponse avec les métadonnées de recalcul
        response_dict = dev_response.model_dump()
        response_dict["recalculation_needed"] = recalculation_needed
        response_dict["changed_fields"]       = changed_fields

        if recalculation_needed:
            logger.info(
                f"[ENTERPRISE] Developer {developer_id} ({developer.name}) updated "
                f"with sensitive changes: {changed_fields}. Triggering autonomous background recalculation."
            )
            from app.services.kpi.kpi_service import KpiService
            kpi_service = KpiService()
            
            # ✅ [REAL-TIME AGILITY] : Recalcul autonome de l'historique
            background_tasks.add_task(
                kpi_service.recalculate_developer_history,
                developer_id=developer_id,
                changed_fields=changed_fields
            )
 
        return response_dict

    except Exception as e:
        logger.error(f"Error updating developer {developer_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Backend Error: {str(e)}")



@router.post("/{canonical_id}/merge/{duplicate_id}", response_model=DeveloperResponse)
def merge_developers(
    canonical_id:  int,
    duplicate_id:  int,
    req:           Request,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    service   = DeveloperService()
    developer = service.merge_developers(
        db=db, canonical_id=canonical_id, duplicate_id=duplicate_id,
        merged_by=current_admin.id,
        ip_address=req.client.host if req.client else None,
    )
    return _build_developer_response(db, developer)


@router.delete("/{developer_id}", status_code=204)
def delete_developer(
    developer_id:  int,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")
    db.delete(developer)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER PRIVÉ
# ═══════════════════════════════════════════════════════════════════════════════

def _build_developer_response(db: Session, developer, site_names: dict = None, project_names: dict = None, is_master_view: bool = False) -> DeveloperResponse:
    #  [SCD TYPE 2] Use context-aware properties instead of raw associations
    # If a DeveloperContext is active, developer.sites and developer.projects are already filtered.
    # When is_master_view=True, we bypass the context filter to return ALL historical segments.
    
    sites = []
    site_source = developer.site_associations if is_master_view else developer.sites
    for sa in site_source:
        sname = site_names.get(sa.site_id) if site_names else (sa.site.name if sa.site else None)
        sites.append(SiteAssociationResponse(
            site_id    = sa.site_id,
            site_name  = sname,
            is_primary = sa.is_primary,
            is_active  = sa.is_active,
            start_date = sa.start_date,
            end_date   = sa.end_date,
        ))

    projects = []
    project_source = developer.project_associations if is_master_view else developer.projects
    for pa in project_source:
        pname = project_names.get(pa.project_id) if project_names else (pa.project.name if pa.project else None)
        projects.append(ProjectAssociationResponse(
            project_id   = pa.project_id,
            project_name = pname,
            is_active    = pa.is_active,
            start_date   = pa.start_date,
            end_date     = pa.end_date,
        ))

    return DeveloperResponse(
        id              = developer.id,
        gitlab_user_id  = developer.gitlab_user_id,
        gitlab_username = developer.gitlab_username,
        name            = developer.name or developer.gitlab_username or "Unknown",
        email           = developer.email,
        is_external     = developer.is_external,
        auto_created    = developer.auto_created,
        onboarding_date = developer.onboarding_date,
        offboarding_date = developer.offboarding_date,
        last_active_at  = developer.last_active_at,
        group_ids       = [g.group_id for g in developer.group_links] if is_master_view else developer.group_ids,
        is_active       = developer.is_active,
        is_validated    = developer.is_validated,
        is_bot          = developer.is_bot,
        source          = developer.source if hasattr(developer, 'source') else "UNKNOWN",
        created_by      = developer.created_by,
        created_at      = developer.created_at,
        rh_status       = developer.rh_status,
        sites           = sites,
        projects        = projects,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  [ENTERPRISE] GESTION DES STATUTS RH — Audit Trail
# ═══════════════════════════════════════════════════════════════════════════════

from pydantic import BaseModel as PydanticModel
from app.models.developer_status_history import DeveloperStatusEnum
from app.services.admin.developer_status_service import developer_status_service


class StatusChangeRequest(PydanticModel):
    new_status: DeveloperStatusEnum
    reason:     Optional[str]  = None
    period_id:  Optional[int]  = None


class StatusHistoryEntry(PydanticModel):
    id:              int
    previous_status: Optional[str]
    new_status:      str
    reason:          Optional[str]
    changed_at:      str
    changed_by_name: Optional[str]

    class Config:
        from_attributes = True


@router.post(
    "/{developer_id}/status",
    summary="[ENTERPRISE] Changer le statut RH d'un développeur",
    description=(
        "Change le statut RH avec audit trail complet.\n\n"
        "**Statuts disponibles :**\n"
        "- `ACTIVE` : Dev opérationnel → compté dans les KPIs\n"
        "- `ON_LEAVE` : Congé → exclu temporairement des KPIs\n"
        "- `SUSPENDED` : Suspendu par manager → exclu des KPIs\n"
        "- `OFFBOARDED` : Départ définitif → archivé, ne peut plus être ACTIVE directement\n\n"
        "**Règle des 15 jours :** Un dev désactivé avant le 15 du mois n'est pas compté "
        "dans le headcount de ce mois."
    ),
)
def change_developer_status(
    developer_id: int,
    payload:      StatusChangeRequest,
    db:           Session    = Depends(get_db),
    current_user: AppUser    = Depends(get_current_manager),
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")

    # RG : site_manager ne peut changer que les devs de SON site
    from app.models.app_user import UserRoleEnum
    if current_user.role == UserRoleEnum.site_manager:
        dev_site_ids = [a.site_id for a in developer.site_associations]
        if current_user.site_id not in dev_site_ids:
            raise HTTPException(
                status_code=403,
                detail="Vous ne pouvez gérer que les développeurs de votre site.",
            )

    try:
        entry = developer_status_service.change_status(
            db            = db,
            developer     = developer,
            new_status    = payload.new_status,
            changed_by_id = current_user.id,
            reason        = payload.reason,
            period_id     = payload.period_id,
        )
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "success":       True,
        "developer_id":  developer_id,
        "developer_name": developer.name,
        "new_status":    payload.new_status,
        "changed_at":    entry.changed_at.isoformat(),
        "message":       f"Statut de {developer.name} changé en {payload.new_status} avec succès.",
    }


@router.get(
    "/{developer_id}/status/history",
    summary="[ENTERPRISE] Historique des statuts RH d'un développeur",
)
def get_developer_status_history(
    developer_id: int,
    limit:        int     = Query(default=20, le=100),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_team_lead_or_above),
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")

    from app.models.developer_status_history import DeveloperStatusHistory
    history = (
        db.query(DeveloperStatusHistory)
        .filter(DeveloperStatusHistory.developer_id == developer_id)
        .order_by(DeveloperStatusHistory.changed_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "developer_id":   developer_id,
        "developer_name": developer.name,
        "current_status": "ACTIVE" if developer.is_active else "INACTIVE",
        "history": [
            {
                "id":              h.id,
                "previous_status": h.previous_status,
                "new_status":      h.new_status,
                "reason":          h.reason,
                "changed_at":      h.changed_at.isoformat() if h.changed_at else None,
                "changed_by_name": h.changed_by.username if h.changed_by else "System",
                "period":          f"{h.period.year}/{h.period.month:02d}" if h.period else None,
            }
            for h in history
        ],
    }


@router.get(
    "/headcount/{period_id}",
    summary="[ENTERPRISE] Effectif d'une période (règle des 15 jours)",
)
def get_period_headcount(
    period_id:    int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_team_lead_or_above),
):
    from app.models.period import Period
    period = db.query(Period).filter(Period.id == period_id).first()
    if not period:
        raise HTTPException(status_code=404, detail="Période introuvable.")

    headcount = developer_status_service.get_headcount_for_kpi(db, period)

    return {
        "period_id":           period_id,
        "period_label":        f"{period.year}/{period.month:02d}",
        "period_status":       period.status,
        "headcount":           headcount,
        "is_frozen":           period.headcount_snapshot is not None,
        "headcount_snapshot":  period.headcount_snapshot,
        "rule_applied":        "15-day rule (dev must be active >= 15 days in period to be counted)",
    }