"""
api/routers/developers.py
"""
import csv
import io
import logging
import calendar
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_manager, get_current_team_lead_or_above, get_current_user
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
    TimelineEvent,
    ProjectAssociationResponse,
    SiteAssociationResponse,
)
from app.services.admin.developer_service import DeveloperService

logger          = logging.getLogger(__name__)
router          = APIRouter(prefix="/developers", tags=["Developers"])
group_router    = APIRouter(tags=["Developer Groups"])
dev_repo        = DeveloperRepository()
group_repo      = DeveloperGroupRepository()
import_log_repo = DeveloperImportLogRepository()


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPER GROUPS
# ═══════════════════════════════════════════════════════════════════════════════

@group_router.get("/developer-groups", response_model=List[DeveloperGroupResponse])
def list_groups(
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
    site_id:      Optional[int] = Query(default=None),
    active_only:  bool          = Query(default=False),
):
    if site_id:
        return group_repo.get_by_site_id(db, site_id, active_only=active_only)
    return group_repo.get_all(db, active_only=active_only)


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
def developers_summary(
    db:               Session       = Depends(get_db),
    current_user:     AppUser       = Depends(get_current_user),
    project_id:       Optional[int] = Query(default=None),
    site_id:          Optional[int] = Query(default=None),
    gitlab_config_id: Optional[int] = Query(default=None),
    period_id:        Optional[int] = Query(default=None),
):
    return dev_repo.get_summary(
        db, project_id=project_id, site_id=site_id, gitlab_config_id=gitlab_config_id, period_id=period_id
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


@router.get("", response_model=List[DeveloperSummary])
def list_developers(
    db:               Session       = Depends(get_db),
    current_user:     AppUser       = Depends(get_current_user),
    project_id:       Optional[int] = Query(default=None),
    site_id:          Optional[int] = Query(default=None),
    gitlab_config_id: Optional[int] = Query(default=None),
    tab:              str           = Query(default="validated"),
    active_only:      bool          = Query(default=False),
    period_id:        Optional[int] = Query(default=None), # AJOUT SENIOR
):
    # SENIOR : active_only force le tab 'validated' pour les KPIs
    effective_tab = "validated" if active_only else tab
    
    devs = dev_repo.get_by_tab(
        db=db, tab=effective_tab, project_id=project_id, site_id=site_id, gitlab_config_id=gitlab_config_id,
        period_id=period_id, active_only=active_only
    )

    # AJOUT SENIOR : Résolution de la période pour le calcul du statut RH
    start_period, end_period = None, None
    if period_id:
        from app.repositories.period_repository import PeriodRepository
        period = PeriodRepository().get_by_id(db, period_id)
        if period:
            start_period = date(period.year, period.month, 1)
            last_day = calendar.monthrange(period.year, period.month)[1]
            end_period = date(period.year, period.month, last_day)

    results = []
    for d in devs:
        # Calcul du statut RH dynamique pour l'affichage (badge)
        rh_status = "ACTIVE"
        if start_period and end_period:
            if d.onboarding_date and d.onboarding_date > end_period:
                rh_status = "FUTURE_JOINER"
            elif d.offboarding_date and d.offboarding_date < start_period:
                rh_status = "OFFBOARDED"
            elif d.onboarding_date and start_period <= d.onboarding_date <= end_period:
                rh_status = "ONBOARDING"

        primary_site_id = None
        for sa in d.site_associations:
            if sa.is_primary:
                primary_site_id = sa.site_id
                break

        official_projects = []
        for pa in d.project_associations:
            # On ne montre que les projets associés à cette période spécifique si demandée
            if period_id is not None and pa.period_id != period_id:
                continue

            p = pa.project
            official_projects.append({
                "project_id": pa.project_id,
                "project_name": p.name if p else None,
                "gitlab_project_id": p.gitlab_project_id if p else None,
                "is_active": pa.is_active,
                "period_id": pa.period_id,
            })

        results.append(DeveloperSummary(
            id               = d.id,
            gitlab_username  = d.gitlab_username,
            name             = d.name,
            email            = d.email,
            avatar_url       = d.avatar_url,
            is_external      = d.is_external,
            is_active        = d.is_active,
            is_validated     = d.is_validated,
            is_bot           = d.is_bot,
            group_ids        = [g.id for g in d.groups],
            primary_site_id  = primary_site_id,
            sites            = [SiteAssociationResponse(site_id=sa.site_id, site_name=sa.site.name if sa.site else None, is_primary=sa.is_primary) for sa in d.site_associations],
            projects         = official_projects,
            onboarding_date  = d.onboarding_date,
            offboarding_date = d.offboarding_date,
            rh_status        = rh_status,
        ))
    return results


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
    file:                    UploadFile    = File(..., description="Fichier CSV ou Excel"),
    period_id:               int           = Form(..., description="Période cible pour cet import"),
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

    return service.import_from_file(
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


# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPERS — Routes paramétrées (APRÈS les routes statiques)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{developer_id}", response_model=DeveloperResponse)
def get_developer(
    developer_id: int,
    db:           Session = Depends(get_db),
    _:            AppUser = Depends(get_current_user),
):
    developer = dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise HTTPException(status_code=404, detail="Développeur introuvable.")
    return _build_developer_response(db, developer)


@router.get("/{developer_id}/kpis")
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


@router.get("/{developer_id}/timeline", response_model=List[TimelineEvent])
def get_developer_timeline(
    developer_id: int,
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
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

    # 2. Fetch Monthly Activity (Commits + Extraction Presence + Project Assignments)
    # ─────────────────────────────────────────────────────────────────────────
    from sqlalchemy import extract, func
    from app.models.period import Period
    from app.models.extraction_lot import ExtractionLot, ExtractionTypeEnum
    from app.models.commit import Commit
    from app.models.developer_project import DeveloperProject
    from app.models.project import Project
    
    # Get commits per month
    commit_stats = db.query(
        extract('year', Commit.authored_date).label("year"),
        extract('month', Commit.authored_date).label("month"),
        func.count(Commit.id).label("count")
    ).filter(
        Commit.developer_id == developer_id,
        Commit.is_merge_commit == False
    )\
     .group_by("year", "month")\
     .all()
    
    commits_map = {(int(r.year), int(r.month)): r.count for r in commit_stats}
    
    # Get project assignments per month
    project_assignments = db.query(
        Period.year,
        Period.month,
        func.string_agg(Project.name, ', ').label("project_names")
    ).join(DeveloperProject, DeveloperProject.period_id == Period.id)\
     .join(Project, Project.id == DeveloperProject.project_id)\
     .filter(
         DeveloperProject.developer_id == developer_id,
         DeveloperProject.is_active == True
     )\
     .group_by(Period.year, Period.month).all()
    
    projects_map = {(int(r.year), int(r.month)): r.project_names for r in project_assignments}
    
    # Get administrative presence (Extraction Lots)
    lot_stats = db.query(
        Period.year,
        Period.month
    ).join(ExtractionLot, ExtractionLot.period_id == Period.id)\
     .filter(
         ExtractionLot.extraction_type == ExtractionTypeEnum.MONTHLY
     ).distinct().all()

    lots_map = {(int(r.year), int(r.month)) for r in lot_stats}
    
    # Generate Monthly Events
    all_active_periods = sorted(list(set(commits_map.keys()) | lots_map | projects_map.keys()), reverse=True)
    
    for y, m in all_active_periods:
        commit_count = commits_map.get((y, m), 0)
        project_names = projects_map.get((y, m))
        has_lot      = (y, m) in lots_map
        
        # Traduction manuelle
        MOIS_FR = {
            1: "Janvier", 2: "Février", 3: "Mars", 4: "Avril", 
            5: "Mai", 6: "Juin", 7: "Juillet", 8: "Août", 
            9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre"
        }
        
        dt = datetime(y, m, 1, tzinfo=pytz.UTC)
        month_name = f"{MOIS_FR.get(m, 'Mois')} {y}"
        
        if project_names:
            desc = f"Affectation : {project_names}."
            if commit_count > 0:
                desc += f" Production de {commit_count} commits."
            
            events.append(TimelineEvent(
                date=dt,
                title=f"Mission : {month_name}",
                description=desc,
                icon="ri-briefcase-line" if commit_count > 0 else "ri-clipboard-line",
                color="primary" if commit_count > 0 else "info"
            ))
        elif commit_count > 0:
            events.append(TimelineEvent(
                date=dt,
                title=f"Activité : {month_name}",
                description=f"Activité hors mission officielle — {commit_count} commits détectés.",
                icon="ri-history-line",
                color="warning"
            ))

    # 3. Fetch AuditLog for this developer
    logs = db.query(AuditLog).filter(
        AuditLog.entity_type == "Developer",
        AuditLog.entity_id == developer_id
    ).order_by(AuditLog.created_at.asc()).all()

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


@router.get("/{developer_id}/alerts")
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


@router.put("/{developer_id}", response_model=DeveloperResponse)
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
        name            = developer.name or developer.gitlab_username or "Unknown",
        email           = developer.email,
        company         = developer.company,
        avatar_url      = developer.avatar_url,
        is_external     = developer.is_external,
        auto_created    = developer.auto_created,
        onboarding_date = developer.onboarding_date,
        offboarding_date = developer.offboarding_date,
        last_active_at  = developer.last_active_at,
        group_ids       = [g.id for g in developer.groups] if hasattr(developer, 'groups') else [],
        is_active       = developer.is_active,
        is_validated    = developer.is_validated,
        is_bot          = developer.is_bot,
        source          = developer.source if hasattr(developer, 'source') else "UNKNOWN",
        created_by      = developer.created_by,
        created_at      = developer.created_at,
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