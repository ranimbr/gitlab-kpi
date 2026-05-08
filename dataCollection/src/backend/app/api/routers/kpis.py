"""KPI router endpoints for dashboard analytics and rankings."""
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.models.developer import Developer
from app.models.kpi_snapshot import KpiSnapshot
from app.models.period import Period
from app.models.site import Site
from app.models.project_site import ProjectSite
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.developer_site_repository import DeveloperSiteRepository
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.site_repository import SiteRepository
from app.repositories.project_site_repository import ProjectSiteRepository
from app.schemas.developer import DeveloperSummary
from app.schemas.kpi import (
    DashboardSummaryResponse,
    DeveloperKpiSnapshotResponse,
    DeveloperLeaderboardResponse,
    KpiSnapshotResponse,
)
from app.schemas.site import SiteResponse
from app.services.kpi.analytics_service import AnalyticsService
from app.services.kpi.kpi_calculator import KpiCalculator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kpis", tags=["KPIs"])

snapshot_repo = KpiSnapshotRepository()
dev_repo      = DeveloperRepository()
site_repo     = SiteRepository()
period_repo   = PeriodRepository()
project_site_repo = ProjectSiteRepository()

# Libellés des mois en français
MOIS_FR_LONG = {
    1: "Janvier", 2: "Février",  3: "Mars",      4: "Avril",
    5: "Mai",     6: "Juin",     7: "Juillet",   8: "Août",
    9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre",
}
MOIS_FR_SHORT = {
    1: "Jan", 2: "Fév", 3: "Mar", 4: "Avr",
    5: "Mai", 6: "Jun", 7: "Jul", 8: "Aoû",
    9: "Sep", 10: "Oct", 11: "Nov", 12: "Déc",
}

# Champs KPI autorisés pour les endpoints trend/compare/top-developers
ALLOWED_KPI_FIELDS = {
    "mr_rate_per_site",
    "approved_mr_rate",
    "merged_mr_rate",
    "commit_rate_per_site",
    "nb_commits_per_project",
    "total_commits",
    "avg_review_time_hours",
    "developer_score",
}


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    """Return a standardized API error payload."""
    return HTTPException(status_code=status_code, detail=f"{code}: {message}")


# ── Dashboard Principal ───────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardSummaryResponse)
def get_dashboard_kpis(
    project_id:   str           = Query(..., description="ID du projet ou 'all'"),
    period_id:    Optional[int] = Query(default=None, description="Filtrer par période (Mois)"),
    site_id:      Optional[int] = Query(default=None),
    group_id:     Optional[int] = Query(default=None),
    developer_id: Optional[int] = Query(default=None),
    lot_id:       Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    service = AnalyticsService(db)
    
    # Support global mode (project_id = "all" or 0).
    p_id = None if (project_id == "all" or project_id == "0") else int(project_id)
    
    result = service.get_dashboard_summary(
        project_id=p_id, 
        period_id=period_id,
        site_id=site_id, 
        group_id=group_id, 
        developer_id=developer_id, 
        lot_id=lot_id
    )

    result["project_id"] = p_id
    result["site_id"]    = site_id
    return result


# ── Vue KPI Individuelle Développeur ─────────────────────────────────────────

@router.get("/developer/{developer_id}", response_model=DeveloperKpiSnapshotResponse)
def get_developer_kpi_view(
    developer_id: int,
    project_id:   int           = Query(...),
    lot_id:       Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    """Vue KPI individuelle complète (page profil développeur)."""
    service = AnalyticsService(db)
    result  = service.get_developer_kpi_summary(
        developer_id=developer_id, project_id=project_id, lot_id=lot_id
    )
    if not result:
        raise _http_error(404, "KPI_NOT_FOUND", "Developpeur ou snapshot introuvable.")
    return result


@router.get("/developer/{developer_id}/summary", summary="Résumé global d'un développeur (toutes périodes)")
def get_developer_global_summary(
    developer_id: int,
    project_id:   Any           = Query(None, description="ID du projet ou None pour global"),
    lot_id:       Optional[int] = Query(None, description="Filtrer par session d'extraction"),
    db:           Session = Depends(get_db)
):
    """
    Retourne les totaux ALL-TIME (depuis le début) d'un développeur sur le projet.
    Idéal pour la page de profil afin d'éviter d'afficher 0 si le développeur 
    n'a rien fait le mois dernier.
    """
    from app.models.commit import Commit
    from app.models.merge_request import MergeRequest
    from app.models.comment import Comment
    
    # Normalize project_id
    if project_id in ("all", "0", 0, ""):
        p_id = None
    else:
        try:
            p_id = int(project_id)
        except (ValueError, TypeError):
            p_id = None

    total_commits_query = db.query(func.count(Commit.id)).filter(Commit.developer_id == developer_id)
    if p_id: total_commits_query = total_commits_query.filter(Commit.project_id == p_id)
    if lot_id:     total_commits_query = total_commits_query.filter(Commit.extraction_lot_id == lot_id)
    total_commits = total_commits_query.scalar() or 0

    total_mrs_created_query = db.query(func.count(MergeRequest.id)).filter(MergeRequest.developer_id == developer_id)
    if p_id: total_mrs_created_query = total_mrs_created_query.filter(MergeRequest.project_id == p_id)
    if lot_id:     total_mrs_created_query = total_mrs_created_query.filter(MergeRequest.extraction_lot_id == lot_id)
    total_mrs_created = total_mrs_created_query.scalar() or 0

    total_comments_query = db.query(func.count(Comment.id)).join(MergeRequest, Comment.merge_request_id == MergeRequest.id).filter(Comment.developer_id == developer_id)
    if p_id: total_comments_query = total_comments_query.filter(MergeRequest.project_id == p_id)
    if lot_id:     total_comments_query = total_comments_query.filter(MergeRequest.extraction_lot_id == lot_id)
    total_comments = total_comments_query.scalar() or 0

    # Enterprise Metric: "Active Review Involvement"
    # Includes explicit assignments AND organic reviews (comments left by the developer)
    mr_with_comments_by_dev_q = db.query(Comment.merge_request_id).filter(
        Comment.developer_id == developer_id
    )
    if lot_id:
        mr_with_comments_by_dev_q = mr_with_comments_by_dev_q.join(MergeRequest, Comment.merge_request_id == MergeRequest.id).filter(MergeRequest.extraction_lot_id == lot_id)
    
    mr_with_comments_by_dev = mr_with_comments_by_dev_q.subquery()

    total_reviews_query = db.query(func.count(MergeRequest.id)).filter(
        MergeRequest.developer_id.is_distinct_from(developer_id),
        (
            (MergeRequest.reviewer_id == developer_id) | 
            (MergeRequest.assignee_id == developer_id) | 
            MergeRequest.id.in_(select(mr_with_comments_by_dev))
        )
    )
    if p_id: total_reviews_query = total_reviews_query.filter(MergeRequest.project_id == p_id)
    if lot_id:     total_reviews_query = total_reviews_query.filter(MergeRequest.extraction_lot_id == lot_id)
    total_reviews = total_reviews_query.scalar() or 0

    total_mrs_approved_query = db.query(func.count(MergeRequest.id)).filter(MergeRequest.developer_id == developer_id, MergeRequest.approved.is_(True))
    if p_id: total_mrs_approved_query = total_mrs_approved_query.filter(MergeRequest.project_id == p_id)
    if lot_id:     total_mrs_approved_query = total_mrs_approved_query.filter(MergeRequest.extraction_lot_id == lot_id)
    total_mrs_approved = total_mrs_approved_query.scalar() or 0

    total_mrs_merged_query = db.query(func.count(MergeRequest.id)).filter(MergeRequest.developer_id == developer_id, MergeRequest.state == "merged")
    if p_id: total_mrs_merged_query = total_mrs_merged_query.filter(MergeRequest.project_id == p_id)
    if lot_id:     total_mrs_merged_query = total_mrs_merged_query.filter(MergeRequest.extraction_lot_id == lot_id)
    total_mrs_merged = total_mrs_merged_query.scalar() or 0

    if lot_id:
        from app.services.kpi.analytics_service import AnalyticsService
        latest_snap = AnalyticsService(db)._calculate_virtual_snapshot_for_lot(
            p_id, lot_id, developer_id=developer_id, site_id=None, group_id=None
        )
    else:
        latest_snap_query = db.query(KpiSnapshot).filter(KpiSnapshot.developer_id == developer_id)
        if p_id: latest_snap_query = latest_snap_query.filter(KpiSnapshot.project_id == p_id)
        latest_snap = latest_snap_query.order_by(KpiSnapshot.snapshot_date.desc()).first()

    # Ratios all-time.
    approved_mr_rate = round(total_mrs_approved / total_mrs_created, 4) if total_mrs_created > 0 else 0.0
    merged_mr_rate   = round(total_mrs_merged / total_mrs_approved, 4) if total_mrs_approved > 0 else 0.0

    return {
        "developer_id": developer_id,
        "project_id": p_id,
        "total_commits": total_commits,
        "total_mrs_created": total_mrs_created,
        "total_mrs_approved": total_mrs_approved,
        "total_mrs_merged": total_mrs_merged,
        "total_comments": total_comments,
        "total_reviews": total_reviews,
        "approved_mr_rate": approved_mr_rate,
        "merged_mr_rate": merged_mr_rate,
        "developer_score": latest_snap.developer_score if latest_snap else 0.0,
        "score_rank_in_site": latest_snap.score_rank_in_site if latest_snap else None,
        "latest_snapshot": latest_snap
    }


# ── Leaderboard ───────────────────────────────────────────────────────────────

@router.get("/leaderboard", response_model=DeveloperLeaderboardResponse)
def get_leaderboard(
    project_id: str           = Query("all"),
    period_id:  Optional[int] = Query(default=None),
    site_id:    Optional[int] = Query(default=None),
    group_id:   Optional[int] = Query(default=None),
    limit:      int           = Query(default=20, ge=1, le=50),
    lot_id:     Optional[int] = Query(default=None),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
):
    """Leaderboard développeurs pour un site, un groupe et une période."""
    # Support global leaderboard across projects.
    # Support global mode (project_id="all", "0" or 0)
    p_id = None if project_id in ("all", "0", 0, None) else int(project_id)

    if period_id is None:
        q = db.query(KpiSnapshot).filter(KpiSnapshot.developer_id.isnot(None))
        if p_id:
            q = q.filter(KpiSnapshot.project_id == p_id)
        
        snap = q.order_by(KpiSnapshot.snapshot_date.desc()).first()
        if not snap:
            return {"site_id": site_id, "group_id": group_id, "period_label": "—", "total_devs": 0, "entries": []}
        period_id = snap.period_id

    service = AnalyticsService(db)
    return service.get_leaderboard(
        project_id=p_id, period_id=period_id, site_id=site_id, group_id=group_id, limit=limit, lot_id=lot_id
    )


# ── Multi-Period ──────────────────────────────────────────────────────────────

@router.get("/multi-period", summary="Comparaison KPIs sur plusieurs mois par site")
def get_multi_period_kpis(
    project_id: int           = Query(...),
    months:     int           = Query(default=3, ge=1, le=12),
    site_id:    Optional[int] = Query(default=None),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    service = AnalyticsService(db)
    
    # Support global mode.
    if project_id == 0:
        # 1. Récupérer les periods ayant des données (tous projets confondus)
        # Correction PostgreSQL : DISTINCT sur un entier (period_id)
        period_ids_subquery = db.query(KpiSnapshot.period_id).distinct().subquery()
        periods = (
            db.query(Period)
            .filter(Period.id.in_(period_ids_subquery))
            .order_by(Period.year.desc(), Period.month.desc())
            .limit(months)
            .all()
        )
        
        result = []
        for period in periods:
            # Pour chaque période, on agrège les données par site à travers tous les projets
            site_snapshots = service.get_site_comparison_global(period.id)
            
            snapshots_data = []
            for snap in site_snapshots:
                snapshots_data.append({
                    "snapshot_id":            None, # Virtuel
                    "site_id":               snap.site_id,
                    "site_name":             getattr(snap, "site_name", f"Site {snap.site_id}"),
                    "total_commits":         snap.total_commits,
                    "nb_commits_per_project": snap.total_commits, # Alias compatibilité
                    "total_mrs":             snap.total_mrs_created,
                    "mr_rate":               snap.mr_rate_per_site,
                    "approved_mr_rate":      snap.approved_mr_rate,
                    "avg_review_time":       snap.avg_review_time_hours,
                    "nb_developers":         snap.nb_developers
                })
            
            result.append({
                "period_id":    period.id,
                "year":         period.year,
                "month":        period.month,
                "period_label": f"{MOIS_FR_LONG.get(period.month, '')} {period.year}",
                "snapshots":    snapshots_data
            })
        
        return result

    # Project-scoped mode. Avoid DISTINCT on full Period model (PostgreSQL/json).
    period_ids_query = (
        db.query(KpiSnapshot.period_id)
        .filter(KpiSnapshot.project_id == project_id)
        .filter(KpiSnapshot.developer_id.is_(None)) # On ne veut que les périodes ayant des snapshots agrégés
        .distinct()
    )
    
    periods_with_data = (
        db.query(Period)
        .filter(Period.id.in_(period_ids_query))
        .order_by(Period.year.desc(), Period.month.desc())
        .limit(months)
        .all()
    )
    if not periods_with_data:
        return []

    result = []
    for period in reversed(periods_with_data):
        q = db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.period_id    == period.id,
            KpiSnapshot.developer_id.is_(None),
        )
        if site_id is not None:
            q = q.filter(KpiSnapshot.site_id == site_id)
        snapshots = q.order_by(KpiSnapshot.site_id).all()

        snapshots_data = []
        for snap in snapshots:
            site_name = None
            if snap.site_id:
                site_obj  = db.query(Site).filter(Site.id == snap.site_id).first()
                site_name = site_obj.name if site_obj else f"Site {snap.site_id}"
            snapshots_data.append({
                "snapshot_id":            snap.id,
                "site_id":                snap.site_id,
                "site_name":              site_name or "Global",
                "mr_rate_per_site":       snap.mr_rate_per_site,
                "approved_mr_rate":       snap.approved_mr_rate,
                "merged_mr_rate":         snap.merged_mr_rate,
                "commit_rate_per_site":   snap.commit_rate_per_site,
                "nb_commits_per_project": snap.nb_commits_per_project,
                "avg_review_time_hours":  snap.avg_review_time_hours,
                "nb_developers":          snap.nb_developers,
                "total_mrs_created":      snap.total_mrs_created,
                "total_commits":          snap.total_commits,
                "delta_mr_rate":          snap.delta_mr_rate,
                "delta_approved_mr_rate": snap.delta_approved_mr_rate,
                "delta_merged_mr_rate":   snap.delta_merged_mr_rate,
                "delta_commit_rate":      snap.delta_commit_rate,
                "delta_avg_review_time":  snap.delta_avg_review_time,
            })
        result.append({
            "period_id":    period.id,
            "year":         period.year,
            "month":        period.month,
            "period_label": f"{MOIS_FR_LONG.get(period.month, '')} {period.year}",
            "snapshots":    snapshots_data,
        })
    return result


# ── Trend ─────────────────────────────────────────────────────────────────────

@router.get("/trend", summary="Tendance KPI sur 12 mois (graphiques linéaires)")
def get_kpi_trend(
    project_id: str           = Query(...),
    kpi_field:  str           = Query(default="mr_rate_per_site"),
    months:     int           = Query(default=12, ge=1, le=24),
    site_id:    Optional[int] = Query(default=None),
    developer_id: Optional[int] = Query(default=None),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
) -> Dict[str, Any]:
    if kpi_field not in ALLOWED_KPI_FIELDS:
            raise _http_error(
                400,
                "KPI_FIELD_INVALID",
                f"kpi_field '{kpi_field}' invalide. Valeurs autorisees: {sorted(ALLOWED_KPI_FIELDS)}",
            )

    # Support global mode (p_id="all", "0" or 0)
    if project_id in ("all", "0", 0):
        service = AnalyticsService(db)
        history = service._get_global_history(site_id, developer_id=developer_id)
        if not history:
            return {"labels": [], "datasets": []}

        period_map = {
            p.id: p
            for p in db.query(Period).filter(Period.id.in_([s.period_id for s in history])).all()
        }
        labels = []
        for snap in history:
            period = period_map.get(snap.period_id)
            labels.append(f"{MOIS_FR_SHORT.get(period.month, '')} {period.year}" if period else "")
        data   = [round(float(getattr(s, kpi_field, 0) or 0), 2) for s in history]
        
        return {
            "labels":   labels,
            "datasets": [{
                "label": f"{kpi_field} (Global)",
                "data":  data,
            }]
        }

    periods = (
        db.query(Period)
        .join(KpiSnapshot, KpiSnapshot.period_id == Period.id)
        .filter(KpiSnapshot.project_id == project_id)
        .distinct()
        .order_by(Period.year.desc(), Period.month.desc())
        .limit(months)
        .all()
    )
    if not periods:
        return {"labels": [], "datasets": []}
    periods = list(reversed(periods))
    labels  = [f"{MOIS_FR_SHORT.get(p.month, p.month)} {p.year}" for p in periods]

    site_rows = (
        db.query(KpiSnapshot.site_id)
        .filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.site_id.isnot(None),
            KpiSnapshot.developer_id.is_(None),
        )
        .distinct()
        .all()
    )
    site_ids = [r.site_id for r in site_rows]
    if site_id is not None:
        site_ids = [s for s in site_ids if s == site_id]

    datasets = []
    for sid in site_ids:
        site_obj  = db.query(Site).filter(Site.id == sid).first()
        site_name = site_obj.name if site_obj else f"Site {sid}"
        data = []
        for period in periods:
            snap = db.query(KpiSnapshot).filter(
                KpiSnapshot.project_id   == project_id,
                KpiSnapshot.period_id    == period.id,
            )
            if developer_id:
                snap = snap.filter(KpiSnapshot.developer_id == developer_id)
            elif site_id:
                snap = snap.filter(KpiSnapshot.site_id == site_id, KpiSnapshot.developer_id.is_(None))
            else:
                snap = snap.filter(KpiSnapshot.site_id.is_(None), KpiSnapshot.developer_id.is_(None))
                
            snap = snap.first()
            value = getattr(snap, kpi_field, None) if snap else None
            data.append(round(float(value), 2) if value is not None else None)
        datasets.append({"site_id": sid, "site_name": site_name, "data": data})

    return {
        "project_id": project_id,
        "kpi_field":  kpi_field,
        "labels":     labels,
        "datasets":   datasets,
    }


# ── Sites disponibles ─────────────────────────────────────────────────────────

@router.get("/sites", response_model=List[SiteResponse], summary="Sites disponibles pour un projet")
def get_available_sites(
    project_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Return sites attached to a project (explicit + discovered)."""
    explicit_ids   = project_site_repo.get_site_ids_for_project(db, project_id)
    discovered_ids = project_site_repo.get_discovered_site_ids(db, project_id)
    all_site_ids   = list(set(explicit_ids) | set(discovered_ids))

    return (
        db.query(Site)
        .filter(Site.id.in_(all_site_ids), Site.is_active.is_(True))
        .order_by(Site.name)
        .all()
    )


# ── Développeurs disponibles ──────────────────────────────────────────────────

@router.get(
    "/developers",
    response_model=List[DeveloperSummary],
    summary="Développeurs validés d'un projet",
)
def get_available_developers(
    project_id: int           = Query(...),
    site_id:    Optional[int] = Query(default=None),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
):
    
    if site_id is not None:
        devs = dev_repo.get_by_site(db, site_id=site_id, active_only=True)
    else:
        devs = dev_repo.get_by_project(db, project_id=project_id, active_only=True)

    site_repo_m2m = DeveloperSiteRepository()
    return [
        DeveloperSummary(
            id              = d.id,
            gitlab_username = d.gitlab_username,
            name            = d.name,
            email           = d.email,
            avatar_url      = d.avatar_url,
            is_external     = d.is_external,
            is_active       = d.is_active,
            is_validated    = d.is_validated,
            is_bot          = d.is_bot,
            group_id        = d.group_ids[0] if d.group_ids else None,
            primary_site_id = site_repo_m2m.get_primary_site_id(db, d.id),
        )
        for d in devs
    ]


# ── Compare inter-sites ───────────────────────────────────────────────────────

@router.get(
    "/compare",
    response_model=List[KpiSnapshotResponse],
    summary="Comparaison KPIs inter-sites",
)
def compare_sites(
    project_id: int           = Query(...),
    period_id:  Optional[int] = Query(default=None),
    kpi_field:  str           = Query(default="mr_rate_per_site"),
    lot_id:     Optional[int] = Query(default=None),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
):
    service = AnalyticsService(db)

    # 1. Mode Session (Real-time Isolation par Lot)
    if lot_id:
        return service.get_site_comparison_for_lot(project_id, lot_id, kpi_field)

    # 1.5 Mode Vision Globale (Agrégation inter-projets)
    if project_id == 0:
        if period_id is None:
            # Trouver la dernière période avec des données
            latest_snap = db.query(KpiSnapshot).order_by(KpiSnapshot.snapshot_date.desc()).first()
            if not latest_snap:
                return []
            period_id = latest_snap.period_id
        try:
            return service.get_site_comparison_global(period_id, kpi_field)
        except ValueError as e:
            raise _http_error(400, "KPI_COMPARE_INVALID", str(e))

    # 2. Mode Période (Données archivées)
    if period_id is None:
        latest_date = db.query(func.max(KpiSnapshot.snapshot_date)).filter(
            KpiSnapshot.project_id == project_id
        ).scalar()
        if latest_date is None:
            raise _http_error(404, "KPI_SNAPSHOT_NOT_FOUND", f"Aucun snapshot pour le projet {project_id}.")
        snap = db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.snapshot_date == latest_date,
        ).first()
        if not snap:
            raise _http_error(404, "KPI_PERIOD_NOT_RESOLVED", "Impossible de resoudre la periode.")
        period_id = snap.period_id

    try:
        snapshots = snapshot_repo.get_site_comparison(
            db=db, project_id=project_id, period_id=period_id, kpi_field=kpi_field
        )
    except ValueError as e:
        raise _http_error(400, "KPI_COMPARE_INVALID", str(e))

    if not snapshots:
        snapshots = db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.period_id    == period_id,
            KpiSnapshot.site_id.is_(None),
            KpiSnapshot.developer_id.is_(None),
        ).order_by(KpiSnapshot.snapshot_date.desc()).all()

    if not snapshots:
        raise _http_error(404, "KPI_SITE_SNAPSHOT_NOT_FOUND", "Aucun snapshot inter-sites trouve.")

    # Populate display names for frontend consumption.
    for snap in snapshots:
        if snap.site_id:
            site_obj = db.query(Site).filter(Site.id == snap.site_id).first()
            snap.site_name = site_obj.name if site_obj else f"Site {snap.site_id}"
        if snap.developer_id:
            dev_obj = db.query(Developer).filter(Developer.id == snap.developer_id).first()
            snap.developer_name = dev_obj.name if dev_obj else f"Dev {snap.developer_id}"

    return snapshots


# ── Top Developers ────────────────────────────────────────────────────────────

@router.get(
    "/top-developers",
    response_model=List[KpiSnapshotResponse],
    summary="Classement développeurs par KPI",
)
def get_top_developers(
    project_id: int           = Query(...),
    period_id:  Optional[int] = Query(default=None),
    site_id:    Optional[int] = Query(default=None),
    kpi_field:  str           = Query(default="mr_rate_per_site"),
    limit:      int           = Query(default=10, ge=1, le=50),
    ascending:  bool          = Query(default=False),
    lot_id:     Optional[int] = Query(default=None),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
):
    service = AnalyticsService(db)

    # 1. Mode Session (Real-time Leaderboard par Lot)
    if lot_id:
        lb = service.get_leaderboard(
            project_id=project_id, period_id=0, site_id=site_id, limit=limit, lot_id=lot_id
        )
        results = []
        for entry in lb["entries"]:
            results.append(KpiSnapshot(
                project_id=project_id,
                developer_id=entry["developer_id"],
                total_commits=entry["commit_count"],
                total_mrs_created=entry["mr_count"],
                total_mrs_approved=entry["approved_mr_count"],
                approved_mr_rate=entry["approved_rate"],
                avg_review_time_hours=entry["avg_review_time_hours"],
                developer_score=entry["developer_score"],
                site_id=site_id
            ))
        
        from app.models.developer import Developer
        for snap in results:
            dev_obj = db.query(Developer).filter(Developer.id == snap.developer_id).first()
            snap.developer_name = dev_obj.name if dev_obj else f"Dev {snap.developer_id}"
            if site_id:
                site_obj = db.query(Site).filter(Site.id == site_id).first()
                snap.site_name = site_obj.name if site_obj else f"Site {site_id}"
        
        return results

    # 2. Mode Période (Données archivées)
    if period_id is None:
        snap = db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.developer_id.isnot(None),
        ).order_by(KpiSnapshot.snapshot_date.desc()).first()
        if not snap:
            return []
        period_id = snap.period_id

    try:
        snapshots = snapshot_repo.get_developers_ranking(
            db=db, project_id=project_id, period_id=period_id,
            kpi_field=kpi_field, site_id=site_id, limit=limit, ascending=ascending,
        )
    except ValueError as e:
            raise _http_error(400, "KPI_RANKING_INVALID", str(e))

    if not snapshots:
        return []

    for snap in snapshots:
        if snap.site_id:
            site_obj = db.query(Site).filter(Site.id == snap.site_id).first()
            snap.site_name = site_obj.name if site_obj else f"Site {snap.site_id}"
        if snap.developer_id:
            dev_obj = db.query(Developer).filter(Developer.id == snap.developer_id).first()
            snap.developer_name = dev_obj.name if dev_obj else f"Dev {snap.developer_id}"

    return snapshots


# ── DORA METRICS ───────────────────────────────────────────────────────────────

@router.get("/dora", summary="DORA Metrics — Deployment Frequency & Lead Time")
def get_dora_metrics(
    project_id:   int            = Query(...),
    period_id:    Optional[int]  = Query(None),
    db:           Session        = Depends(get_db),
    current_user: AppUser        = Depends(get_current_user),
):
    """
    [DORA — Google Research Standard]
    Retourne les métriques Deployment Frequency et Lead Time for Changes
    par site pour le projet donné.
    """
    # Résolution de la période
    if period_id is not None:
        period = period_repo.get_by_id(db, period_id)
    else:
        latest = (
            db.query(KpiSnapshot)
            .filter(KpiSnapshot.project_id == project_id)
            .order_by(KpiSnapshot.snapshot_date.desc())
            .first()
        )
        if not latest:
            return []
        period = period_repo.get_by_id(db, latest.period_id)

    if not period:
        return []

    start_date = datetime(period.year, period.month, 1)
    end_date   = (
        datetime(period.year + 1, 1, 1)
        if period.month == 12
        else datetime(period.year, period.month + 1, 1)
    )

    # Sites du projet (auto-discovery)
    ps_repo = ProjectSiteRepository()
    explicit_ids   = ps_repo.get_site_ids_for_project(db, project_id)
    discovered_ids = ps_repo.get_discovered_site_ids(db, project_id)
    all_site_ids   = list(set(explicit_ids) | set(discovered_ids))

    calculator = KpiCalculator(db)

    def _df_level(count: int) -> str:
        if count >= 30:  return "Elite"
        if count >= 4:   return "High"
        if count >= 1:   return "Medium"
        return "Low"

    def _lt_level(hours: float) -> str:
        if hours == 0:      return "N/A"
        if hours < 1:       return "Elite"
        if hours < 24:      return "High"
        if hours < 168:     return "Medium"
        return "Low"

    results = []
    total_dep_for_project = calculator._count_deployments(project_id, start_date, end_date, None, None, None)
    total_lead_for_project = calculator._avg_lead_time(project_id, start_date, end_date, None, None, None)
    
    sum_site_deps = 0
    for sid in all_site_ids:
        site_obj = db.query(Site).filter(Site.id == sid).first()
        if not site_obj:
            continue

        dep_count  = calculator._count_deployments(project_id, start_date, end_date, sid, None, None)
        lead_time  = calculator._avg_lead_time(project_id, start_date, end_date, sid, None, None)
        sum_site_deps += dep_count

        results.append({
            "site_id":          sid,
            "site_name":        site_obj.name,
            "deployment_count": dep_count,
            "lead_time_hours":  lead_time,
            "dora_df_level":    _df_level(dep_count),
            "dora_lt_level":    _lt_level(lead_time),
            "period_label":     f"{MOIS_FR_LONG.get(period.month, period.month)} {period.year}",
        })

    # Gestion des déploiements non assignés
    unassigned_deps = total_dep_for_project - sum_site_deps
    if unassigned_deps > 0:
        results.append({
            "site_id":          -1,
            "site_name":        "Autres / Non-assignés",
            "deployment_count": unassigned_deps,
            "lead_time_hours":  total_lead_for_project,
            "dora_df_level":    _df_level(unassigned_deps),
            "dora_lt_level":    _lt_level(total_lead_for_project),
            "period_label":     f"{MOIS_FR_LONG.get(period.month, period.month)} {period.year}",
            "is_unassigned":    True
        })

    return sorted(results, key=lambda x: x["deployment_count"], reverse=True)