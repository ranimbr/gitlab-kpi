"""api/routers/sites.py"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database.session import get_db
from app.api.dependencies import get_current_user, get_current_admin
from app.schemas.site import SiteCreate, SiteUpdate, SiteResponse
from app.services.admin.site_service import SiteService
from app.services.location_service import LocationService
from app.models.app_user import AppUser

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/sites", tags=["Sites"])
service = SiteService()


@router.get("", response_model=List[SiteResponse])
def list_sites(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
    active_only: bool = True,
):
    return service.get_all_sites(db, active_only)


@router.get("/{site_id}", response_model=SiteResponse)
def get_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    return service.get_site(db, site_id)


@router.post("", response_model=SiteResponse, status_code=201)
def create_site(
    request: SiteCreate,
    req: Request,
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    return service.create_site(
        db=db, payload=request,
        created_by=current_admin.id,
        ip_address=req.client.host if req.client else None,
    )


@router.put("/{site_id}", response_model=SiteResponse)
def update_site(
    site_id: int,
    request: SiteUpdate,
    req: Request,
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    return service.update_site(
        db=db, site_id=site_id, payload=request,
        updated_by=current_admin.id,
        ip_address=req.client.host if req.client else None,
    )


@router.delete("/{site_id}", status_code=204)
def delete_site(
    site_id: int,
    req: Request,
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    service.delete_site(
        db=db, site_id=site_id,
        deleted_by=current_admin.id,
        ip_address=req.client.host if req.client else None,
    )


@router.get("/timezones")
def list_timezones(current_user: AppUser = Depends(get_current_user)):
    """Retourne la liste complète des fuseaux horaires IANA."""
    return LocationService.get_all_timezones()


@router.get("/guess")
def guess_site_info(name: str, current_user: AppUser = Depends(get_current_user)):
    """Tente de deviner le pays et le fuseau horaire à partir d'un nom."""
    return LocationService.guess_metadata(name)


# =============================================================================
#  TEAM OVERVIEW — GET /sites/{site_id}/team
#  Vision centrée-développeur souhaitée par l'encadrant.
#  Le manager voit toute son équipe par site : devs, groupes, KPIs résumés.
# =============================================================================

@router.get("/{site_id}/team")
def get_site_team(
    site_id:    str,
    project_id: Optional[int] = None,
    db:         Session       = Depends(get_db),
    current_user: AppUser     = Depends(get_current_user),
):
    """
    Vue équipe complète d'un site pour le manager.

    Paramètres :
        site_id    — identifiant du site
        project_id — (optionnel) si fourni, enrichit chaque dev avec son
                     dernier KpiSnapshot sur ce projet

    Retourne :
        site_id / site_name
        total / active / inactive / pending  (compteurs)
        groups       — breakdown par groupe (count)
        developers   — liste enrichie avec KPI résumé

    Accès : tout utilisateur connecté (lecture seule).
    """
    from app.models.developer       import Developer
    from app.models.developer_site  import DeveloperSite
    from app.models.developer_group import DeveloperGroup
    from app.models.kpi_snapshot    import KpiSnapshot
    from app.models.site            import Site

    # ── 1. Gérer le cas "Tous les sites" ("all") ─────────────────────────────
    from sqlalchemy.orm import joinedload
    from app.models.developer_project import DeveloperProject

    query = (
        db.query(Developer)
        .options(
            joinedload(Developer.groups),
            joinedload(Developer.project_associations).joinedload(DeveloperProject.project)
        )
        .filter(Developer.is_bot.is_(False))
    )
    
    if site_id == "all":
        site_name = "Tous les sites"
        # LOGIQUE SENIOR : si project_id est fourni, on filtrera directement la query de base plus bas
        primary_map = {}
    else:
        site_id_int = int(site_id)
        site = db.query(Site).filter(Site.id == site_id_int).first()
        if not site:
            raise HTTPException(status_code=404, detail="Site introuvable.")
        site_name = site.name

        dev_site_rows = (
            db.query(DeveloperSite)
            .filter(DeveloperSite.site_id == site_id_int)
            .all()
        )
        developer_ids = [row.developer_id for row in dev_site_rows]
        primary_map   = {row.developer_id: row.is_primary for row in dev_site_rows}

        if not developer_ids:
            return {
                "site_id":    site_id,
                "site_name":  site_name,
                "total":      0,
                "active":     0,
                "inactive":   0,
                "pending":    0,
                "groups":     [],
                "developers": [],
            }
        
        query = query.filter(Developer.id.in_(developer_ids))

    # ── 1bis. Appliquer le filtre Projet (Optionnel) ─────────────────────────
    if project_id:
        # LOGIQUE SENIOR : Join interne strict + DISTINCT pour assurer l'unicité des résultats
        query = query.join(Developer.project_associations).filter(
            DeveloperProject.project_id == project_id,
            DeveloperProject.is_active.is_(True)
        ).distinct()

    developers = query.order_by(Developer.name).all()
    logger.info(f"API site_team: Found {len(developers)} developers for project {project_id}")
    
    # ✅ Mise à jour CRITIQUE des IDs pour les compteurs et les jointures suivantes
    developer_ids = [d.id for d in developers]


    # ── 4. Charger les groupes présents sur ce site ───────────────────────────
    # ✅ FIX M2M : dev.group_id n'existe plus — on passe par dev.groups
    all_group_ids = set()
    for dev in developers:
        for g in dev.groups:
            all_group_ids.add(g.id)
    group_ids = list(all_group_ids)
    groups    = (
        db.query(DeveloperGroup)
        .filter(DeveloperGroup.id.in_(group_ids))
        .all()
    ) if group_ids else []
    group_map = {g.id: g.name for g in groups}

    # ── 5. Dernier KPI snapshot par dev (si project_id fourni) ───────────────
    kpi_map: dict = {}
    if project_id:
        from app.models.extraction_lot import ExtractionLot, ExtractionStatusEnum
        
        # ✅ LOGIQUE SENIOR : on cherche la période de la dernière extraction réussie
        # pour s'ancrer dessus (ex: Mars même si on est en Avril).
        latest_lot = (
            db.query(ExtractionLot)
            .filter(
                ExtractionLot.project_id == project_id,
                ExtractionLot.status     == ExtractionStatusEnum.completed
            )
            .order_by(ExtractionLot.completed_at.desc())
            .first()
        )
        target_period_id = latest_lot.period_id if latest_lot else None

        q_snaps = db.query(KpiSnapshot).filter(
            KpiSnapshot.developer_id.in_(developer_ids),
            KpiSnapshot.project_id == project_id,
            KpiSnapshot.developer_id.isnot(None),
        )
        
        if target_period_id:
            # On filtre strictement sur cette période pour la cohérence Hub/Lots
            q_snaps = q_snaps.filter(KpiSnapshot.period_id == target_period_id)
        
        snapshots = q_snaps.order_by(KpiSnapshot.snapshot_date.desc()).all()
        
        for snap in snapshots:
            if snap.developer_id not in kpi_map:
                kpi_map[snap.developer_id] = snap

    # ── 6. Construction de la liste développeurs ──────────────────────────────
    dev_list                               = []
    active_count = inactive_count = pending_count = 0

    for dev in developers:
        snap  = kpi_map.get(dev.id)
        score = (
            snap.developer_score
            if (snap and snap.developer_score is not None)
            else None
        )

        if not dev.is_active:
            inactive_count += 1
            status = "inactive"
        elif not dev.is_validated:
            pending_count  += 1
            status = "pending"
        else:
            active_count   += 1
            status = "active"

        # Groupes du dev (M2M) — on prend le premier pour affichage
        dev_groups = dev.groups
        primary_group_id   = dev_groups[0].id   if dev_groups else None
        primary_group_name = dev_groups[0].name if dev_groups else None

        dev_list.append({
            "id":              dev.id,
            "name":            dev.name,
            "gitlab_username": dev.gitlab_username,
            "email":           dev.email,
            "avatar_url":      dev.avatar_url,
            "is_validated":    dev.is_validated,
            "is_active":       dev.is_active,
            "is_primary_site": primary_map.get(dev.id, False),
            "group_id":        primary_group_id,
            "group_name":      primary_group_name,
            "source":          dev.source,
            "onboarding_date": dev.onboarding_date.isoformat() if dev.onboarding_date else None,
            "last_active_at":  dev.last_active_at.isoformat()  if dev.last_active_at  else None,
            "status":          status,
            # ── KPI résumé (None si pas encore extrait) ──────────────────────
            "developer_score":       score,
            "score_rank_in_site":    snap.score_rank_in_site    if snap else None,
            "total_commits":         snap.total_commits          if snap else None,
            "total_mrs_created":     snap.total_mrs_created      if snap else None,
            "approved_mr_rate":      snap.approved_mr_rate       if snap else None,
            "avg_review_time_hours": snap.avg_review_time_hours  if snap else None,
            "delta_commit_rate":     snap.delta_commit_rate      if snap else None,
            # ✅ Ajout des projets pour les badges
            "projects": [
                {
                    "project_id": pa.project_id,
                    "gitlab_project_id": pa.project.gitlab_project_id if pa.project else None,
                    "is_active": pa.is_active
                }
                for pa in dev.project_associations
            ]
        })

    # ── 7. Breakdown par groupe ───────────────────────────────────────────────
    groups_breakdown = []
    for g in groups:
        members = [d for d in dev_list if d["group_id"] == g.id]
        groups_breakdown.append({
            "group_id":   g.id,
            "group_name": g.name,
            "count":      len(members),
        })
    no_group = [d for d in dev_list if not d["group_id"]]
    if no_group:
        groups_breakdown.append({
            "group_id":   None,
            "group_name": "Sans groupe",
            "count":      len(no_group),
        })

    return {
        "_diag_project_id": project_id,
        "site_id":    site_id,
        "site_name":  site_name,
        "total":      len(dev_list),
        "active":     active_count,
        "inactive":   inactive_count,
        "pending":    pending_count,
        "groups":     groups_breakdown,
        "developers": dev_list,
    }
