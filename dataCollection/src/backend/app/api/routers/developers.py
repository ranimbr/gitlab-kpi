"""
api/routers/developers.py

MODIFICATION v4 — Enterprise-grade import :
──────────────────────────────────────────────────────────────────
POST /developers/import :
    AJOUT des paramètres Form :
        create_missing_sites    (bool, default=False)
        create_missing_projects (bool, default=False)
    → Transmis à DeveloperService.import_from_file().

Tout le reste est identique à v3.
"""
import csv
import io
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_team_lead_or_above, get_current_user
from app.database.session import get_db
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
    DeveloperUpdate,
    DeveloperValidate,
    ProjectAssociationResponse,
    SiteAssociationResponse,
)
from app.services.admin.developer_service import DeveloperService

logger          = logging.getLogger(__name__)
router          = APIRouter(tags=["Developers"])
dev_repo        = DeveloperRepository()
group_repo      = DeveloperGroupRepository()
import_log_repo = DeveloperImportLogRepository()


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPER GROUPS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/developer-groups", response_model=List[DeveloperGroupResponse])
def list_groups(
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
    site_id:      Optional[int] = Query(default=None),
):
    if site_id:
        return group_repo.get_by_site_id(db, site_id)
    return group_repo.get_all(db)


@router.post("/developer-groups", response_model=DeveloperGroupResponse, status_code=201)
def create_group(
    request:       DeveloperGroupCreate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    data = request.model_dump(exclude={"site_ids"})
    group = group_repo.create(db, data)
    
    if request.site_ids:
        sites = db.query(Site).filter(Site.id.in_(request.site_ids)).all()
        group.sites = sites
        
    db.commit()
    db.refresh(group)
    return group


@router.put("/developer-groups/{group_id}", response_model=DeveloperGroupResponse)
def update_group(
    group_id:      int,
    request:       DeveloperGroupUpdate,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    group = group_repo.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Groupe introuvable.")
        
    update_data = request.model_dump(exclude_unset=True, exclude={"site_ids"})
    group_repo.update(db, group, update_data)
    
    if request.site_ids is not None:
        sites = db.query(Site).filter(Site.id.in_(request.site_ids)).all()
        group.sites = sites
        
    db.commit()
    db.refresh(group)
    return group


@router.delete("/developer-groups/{group_id}", status_code=204)
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

@router.get("/developers/summary")
def developers_summary(
    db:               Session       = Depends(get_db),
    current_user:     AppUser       = Depends(get_current_user),
    project_id:       Optional[int] = Query(default=None),
    site_id:          Optional[int] = Query(default=None),
    gitlab_config_id: Optional[int] = Query(default=None),
):
    return dev_repo.get_summary(
        db, project_id=project_id, site_id=site_id, gitlab_config_id=gitlab_config_id
    )


@router.get("/developers/leaderboard")
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


@router.get("/developers/import-logs", response_model=List[DeveloperImportLogResponse])
def list_import_logs(
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
    limit:         int     = Query(default=20, ge=1, le=100),
    offset:        int     = Query(default=0, ge=0),
):
    return import_log_repo.get_recent(db, limit=limit, offset=offset)


@router.get(
    "/developers/import/template",
    summary="Télécharger le template CSV d'import développeurs",
    response_class=StreamingResponse,
)
def download_import_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "email", "gitlab_username", "sites", "projects", "group"])
    writer.writerow(["Ahmed Ben Ali",  "ahmed.benali@example.com",  "ahmed.benali",  "Tunis,Paris", "backend-api:1234,frontend:5678", "Équipe A"])
    writer.writerow(["Sara Trabelsi",  "sara.trabelsi@example.com", "sara.trabelsi", "Tunis",       "backend-api:1234",             "Équipe B"])
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=import_developers_template.csv"},
    )


@router.get("/developers", response_model=List[DeveloperSummary])
def list_developers(
    db:               Session       = Depends(get_db),
    current_user:     AppUser       = Depends(get_current_user),
    project_id:       Optional[int] = Query(default=None),
    site_id:          Optional[int] = Query(default=None),
    gitlab_config_id: Optional[int] = Query(default=None),
    tab:              str           = Query(default="validated"),
):
    devs = dev_repo.get_by_tab(
        db=db, tab=tab, project_id=project_id, site_id=site_id, gitlab_config_id=gitlab_config_id
    )
    site_repo_m2m = DeveloperSiteRepository()

    results = []
    for dev in devs:
        primary_site_id = site_repo_m2m.get_primary_site_id(db, dev.id)
        results.append(DeveloperSummary(
            id              = dev.id,
            gitlab_username = dev.gitlab_username,
            name            = dev.name,
            email           = dev.email,
            avatar_url      = dev.avatar_url,
            is_external     = dev.is_external,
            is_active       = dev.is_active,
            is_validated    = dev.is_validated,
            is_bot          = dev.is_bot,
            group_id        = dev.group_id,
            primary_site_id = primary_site_id,
        ))
    return results


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPERS — Écriture
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/developers", response_model=DeveloperResponse, status_code=201)
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


@router.post("/developers/import", response_model=DeveloperImportResponse, status_code=201)
async def import_developers(
    file:                    UploadFile    = File(..., description="Fichier CSV ou Excel"),
    default_site_id:         Optional[int] = Form(default=None),
    default_group_id:        Optional[int] = Form(default=None),
    default_gitlab_config_id: Optional[int] = Form(default=None),
    dry_run:                 bool          = Form(default=False),
    # ✅ NOUVEAU : paramètres enterprise auto-création
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
    create_missing_groups: bool            = Form(
        default=False,
        description="Si True : les groupes du CSV absents en base sont créés automatiquement.",
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

    # ✅ LOGIQUE SENIOR : Résilience — Si aucun domaine n'est spécifié, on prend le premier disponible
    # pour éviter de créer des projets orphelins (gitlab_config_id=None).
    if default_gitlab_config_id is None:
        from app.models.gitlab_config import GitLabConfig
        first_config = db.query(GitLabConfig).first()
        if first_config:
            default_gitlab_config_id = first_config.id
            logger.info("Import: Aucun domaine spécifié, utilisation automatique du Domaine ID %d", default_gitlab_config_id)

    return service.import_from_file(
        db                      = db,
        file_content            = content,
        file_name               = file.filename,
        imported_by             = current_admin.id,
        default_site_id         = default_site_id,
        default_group_id        = default_group_id,
        default_gitlab_config_id = default_gitlab_config_id,
        dry_run                 = dry_run,
        create_missing_sites    = create_missing_sites,
        create_missing_projects = create_missing_projects,
        create_missing_groups   = create_missing_groups,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPERS — Validation en masse
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/developers/validate-all")
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


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPERS — Routes paramétrées (APRÈS les routes statiques)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/developers/{developer_id}", response_model=DeveloperResponse)
def get_developer(
    developer_id: int,
    db:           Session = Depends(get_db),
    _:            AppUser = Depends(get_current_user),
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")
    return _build_developer_response(db, developer)


@router.get("/developers/{developer_id}/kpis")
def get_developer_kpis(
    developer_id: int,
    project_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from app.services.kpi.analytics_service import AnalyticsService
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")
    service = AnalyticsService(db)
    return service.get_developer_kpi_summary(developer_id=developer_id, project_id=project_id)


@router.get("/developers/{developer_id}/alerts")
def get_developer_alerts(
    developer_id: int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from app.services.kpi.alert_service import AlertService
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")
    alert_service = AlertService()
    return alert_service.get_developer_alert_summary(db, developer_id)


@router.patch("/developers/{developer_id}/validate", response_model=DeveloperResponse)
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


@router.put("/developers/{developer_id}", response_model=DeveloperResponse)
def update_developer(
    developer_id:  int,
    request:       DeveloperUpdate,
    req:           Request,
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    service   = DeveloperService()
    developer = service.update_developer(
        db=db, developer_id=developer_id, payload=request,
        updated_by=current_admin.id,
        ip_address=req.client.host if req.client else None,
    )
    return _build_developer_response(db, developer)


@router.post("/developers/{canonical_id}/merge/{duplicate_id}", response_model=DeveloperResponse)
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


@router.delete("/developers/{developer_id}", status_code=204)
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

def _build_developer_response(db: Session, developer) -> DeveloperResponse:
    site_assocs    = DeveloperSiteRepository().get_by_developer(db, developer.id)
    project_assocs = DeveloperProjectRepository().get_by_developer(db, developer.id)

    sites = []
    for sa in site_assocs:
        site_obj = db.query(Site).filter(Site.id == sa.site_id).first()
        sites.append(SiteAssociationResponse(
            site_id    = sa.site_id,
            site_name  = site_obj.name if site_obj else None,
            is_primary = sa.is_primary,
        ))

    projects = []
    for pa in project_assocs:
        proj_obj = db.query(Project).filter(Project.id == pa.project_id).first()
        projects.append(ProjectAssociationResponse(
            project_id   = pa.project_id,
            project_name = proj_obj.name if proj_obj else None,
            is_active    = pa.is_active,
        ))

    return DeveloperResponse(
        id              = developer.id,
        gitlab_user_id  = developer.gitlab_user_id,
        gitlab_username = developer.gitlab_username,
        name            = developer.name,
        email           = developer.email,
        company         = getattr(developer, "company", None),
        avatar_url      = developer.avatar_url,
        is_external     = developer.is_external,
        auto_created    = developer.auto_created,
        onboarding_date = developer.onboarding_date,
        last_active_at  = developer.last_active_at,
        group_id        = developer.group_id,
        is_active       = developer.is_active,
        is_validated    = developer.is_validated,
        is_bot          = developer.is_bot,
        source          = developer.source,
        created_by      = developer.created_by,
        created_at      = developer.created_at,
        sites           = sites,
        projects        = projects,
    )