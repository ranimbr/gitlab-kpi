"""
api/routers/kpis.py

"""
import logging
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.repositories.period_repository import PeriodRepository
from app.repositories.site_repository import SiteRepository
from app.schemas.developer import DeveloperResponse
from app.schemas.kpi import DashboardSummaryResponse, KpiSnapshotResponse
from app.schemas.site import SiteResponse
from app.services.kpi.analytics_service import AnalyticsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kpis", tags=["KPIs"])

snapshot_repo = KpiSnapshotRepository()
dev_repo      = DeveloperRepository()
site_repo     = SiteRepository()
period_repo   = PeriodRepository()

# =============================================================================
# GET /kpis/dashboard  — endpoint principal du dashboard KPI
# =============================================================================

@router.get("/dashboard", response_model=DashboardSummaryResponse)
def get_dashboard_kpis(
    project_id:   int           = Query(..., description="ID du projet"),
    site_id:      Optional[int] = Query(default=None, description="Filtrer par site"),
    group_id:     Optional[int] = Query(default=None, description="Filtrer par groupe"),
    developer_id: Optional[int] = Query(default=None, description="Filtrer par développeur"),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    """
    Retourne le résumé KPI complet pour le dashboard frontend.

    Filtres disponibles (cumulables) :
        - site_id      → KPIs du site uniquement
        - developer_id → KPIs d'un développeur individuel
        - group_id     → KPIs d'un groupe de développeurs

    Si aucun filtre → snapshot global du projet.

    Cascade de fallback (graceful degradation) :
        1. Snapshot exact avec tous les filtres
        2. Si vide et filtre site/developer → snapshot global du projet
        3. Si toujours vide → 404
    """
    service = AnalyticsService(db)

    # ── Niveau 1 : cherche le snapshot exact avec les filtres fournis ─────────
    result = service.get_dashboard_summary(
        project_id   = project_id,
        site_id      = site_id,
        group_id     = group_id,
        developer_id = developer_id,
    )

    # ── Niveau 2 : fallback global si snapshot exact absent ───────────────────
    if not result["latest_metrics"] and (site_id or developer_id or group_id):
        logger.info(
            f"[KPI Dashboard] Snapshot exact absent pour project={project_id} "
            f"site={site_id} dev={developer_id} — fallback sur snapshot global"
        )
        result = service.get_dashboard_summary(
            project_id   = project_id,
            site_id      = None,
            group_id     = None,
            developer_id = None,
        )

    # ── Niveau 3 : vraiment pas de données → 404 explicite ───────────────────
    if not result["latest_metrics"]:
        detail = f"Aucun snapshot KPI trouvé pour le projet {project_id}"
        if site_id:
            detail += f" / site {site_id}"
        if developer_id:
            detail += f" / développeur {developer_id}"
        detail += ". Lancez d'abord une extraction."
        raise HTTPException(status_code=404, detail=detail)

    result["project_id"] = project_id
    result["site_id"]    = site_id
    return result


# =============================================================================
# GET /kpis/multi-period  — tableau comparatif multi-mois (PDF encadrant)
# =============================================================================

@router.get(
    "/multi-period",
    summary = "Comparaison KPIs sur plusieurs mois par site",
)
def get_multi_period_kpis(
    project_id: int           = Query(..., description="ID du projet"),
    months:     int           = Query(default=3, ge=1, le=12, description="Nombre de mois à comparer"),
    site_id:    Optional[int] = Query(default=None, description="Filtrer sur un site spécifique"),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Retourne les KPIs des N derniers mois pour chaque site.

    Reproduit le tableau du dashboard PDF de l'encadrant :
        Site    | Déc 2025               | Jan 2026               | Fév 2026
        France  | mrs=99 devs=17 rate=5.8| mrs=102 devs=17 rate=6 | ...
        Tunisie | mrs=133 devs=26 rate=5 | ...                    | ...

    Chaque élément de la réponse contient :
        - period_label : ex "Février 2026"
        - year, month
        - snapshots : liste des snapshots par site pour ce mois
    """
    from app.models.kpi_snapshot import KpiSnapshot
    from app.models.period import Period
    from app.models.site import Site
    from sqlalchemy import distinct

    # Récupère les N dernières périodes avec des snapshots pour ce projet
    periods_with_data = (
        db.query(Period)
        .join(KpiSnapshot, KpiSnapshot.period_id == Period.id)
        .filter(KpiSnapshot.project_id == project_id)
        .distinct()
        .order_by(Period.year.desc(), Period.month.desc())
        .limit(months)
        .all()
    )

    if not periods_with_data:
        raise HTTPException(
            status_code=404,
            detail=f"Aucun snapshot trouvé pour le projet {project_id}.",
        )

    # Noms des mois en français
    mois_fr = {
        1: "Janvier", 2: "Février",  3: "Mars",     4: "Avril",
        5: "Mai",     6: "Juin",     7: "Juillet",  8: "Août",
        9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre",
    }

    result = []

    for period in reversed(periods_with_data):  # ordre chronologique
        # Récupère les snapshots de niveau site pour cette période
        q = (
            db.query(KpiSnapshot)
            .filter(
                KpiSnapshot.project_id    == project_id,
                KpiSnapshot.period_id     == period.id,
                KpiSnapshot.developer_id.is_(None),  # snapshots agrégés uniquement
            )
        )

        if site_id is not None:
            q = q.filter(KpiSnapshot.site_id == site_id)
        else:
            # Inclut snapshots par site ET snapshot global (site_id=NULL)
            pass

        snapshots = q.order_by(KpiSnapshot.site_id).all()

        # Enrichir chaque snapshot avec le nom du site
        snapshots_data = []
        for snap in snapshots:
            site_name = None
            if snap.site_id:
                site_obj = db.query(Site).filter(Site.id == snap.site_id).first()
                site_name = site_obj.name if site_obj else f"Site {snap.site_id}"

            snapshots_data.append({
                "snapshot_id":           snap.id,
                "site_id":               snap.site_id,
                "site_name":             site_name or "Global",
                # KPI #1
                "mr_rate_per_site":      snap.mr_rate_per_site,
                # KPI #3
                "approved_mr_rate":      snap.approved_mr_rate,
                # KPI #4
                "merged_mr_rate":        snap.merged_mr_rate,
                # KPI #5
                "commit_rate_per_site":  snap.commit_rate_per_site,
                # KPI #6
                "nb_commits_per_project": snap.nb_commits_per_project,
                # KPI #7
                "avg_review_time_hours": snap.avg_review_time_hours,
                # Compteurs bruts
                "nb_developers":         snap.nb_developers,
                "total_mrs_created":     snap.total_mrs_created,
                "total_mrs_approved":    snap.total_mrs_approved,
                "total_mrs_merged":      snap.total_mrs_merged,
                "total_commits":         snap.total_commits,
                # Deltas vs mois précédent
                "delta_mr_rate":          snap.delta_mr_rate,
                "delta_approved_mr_rate": snap.delta_approved_mr_rate,
                "delta_merged_mr_rate":   snap.delta_merged_mr_rate,
                "delta_commit_rate":      snap.delta_commit_rate,
                "delta_nb_commits":       snap.delta_nb_commits,
                "delta_avg_review_time":  snap.delta_avg_review_time,
            })

        result.append({
            "period_id":    period.id,
            "year":         period.year,
            "month":        period.month,
            "period_label": f"{mois_fr.get(period.month, '')} {period.year}",
            "snapshots":    snapshots_data,
        })

    return result


# =============================================================================
# GET /kpis/trend  — historique 12 mois pour graphiques linéaires
# =============================================================================

@router.get(
    "/trend",
    summary = "Tendance KPI sur 12 mois par site (graphiques linéaires)",
)
def get_kpi_trend(
    project_id: int           = Query(..., description="ID du projet"),
    kpi_field:  str           = Query(
        default="mr_rate_per_site",
        description=(
            "KPI à tracer : mr_rate_per_site | approved_mr_rate | "
            "merged_mr_rate | commit_rate_per_site | "
            "nb_commits_per_project | avg_review_time_hours"
        ),
    ),
    months:     int           = Query(default=12, ge=1, le=24, description="Nombre de mois"),
    site_id:    Optional[int] = Query(default=None, description="Un site spécifique (null = tous)"),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Retourne les données pour tracer les graphiques linéaires du dashboard.

    Format de réponse optimisé pour Chart.js / Recharts :
        labels   : ["Mars 2025", "Avr 2025", ..., "Fév 2026"]
        datasets : [
            { site_name: "France",  data: [5.8, 4.4, 6.1, ...] },
            { site_name: "Tunisie", data: [5.1, 3.6, 4.2, ...] },
        ]

    Reproduit les graphiques linéaires du PDF encadrant (France vs Tunisie).
    """
    allowed_fields = {
        "mr_rate_per_site", "approved_mr_rate", "merged_mr_rate",
        "commit_rate_per_site", "nb_commits_per_project", "avg_review_time_hours",
    }
    if kpi_field not in allowed_fields:
        raise HTTPException(
            status_code=400,
            detail=f"kpi_field '{kpi_field}' invalide. Valeurs: {sorted(allowed_fields)}",
        )

    from app.models.kpi_snapshot import KpiSnapshot
    from app.models.period import Period
    from app.models.site import Site

    # Récupère les N dernières périodes
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
        raise HTTPException(
            status_code=404,
            detail=f"Aucun snapshot trouvé pour le projet {project_id}.",
        )

    periods = list(reversed(periods))  # ordre chronologique

    mois_fr = {
        1: "Jan", 2: "Fév", 3: "Mar", 4: "Avr",
        5: "Mai", 6: "Jun", 7: "Jul", 8: "Aoû",
        9: "Sep", 10: "Oct", 11: "Nov", 12: "Déc",
    }

    labels = [f"{mois_fr.get(p.month, p.month)} {p.year}" for p in periods]

    # Récupère les sites distincts ayant des snapshots pour ce projet
    site_rows = (
        db.query(KpiSnapshot.site_id)
        .filter(
            KpiSnapshot.project_id == project_id,
            KpiSnapshot.site_id.isnot(None),
            KpiSnapshot.developer_id.is_(None),
        )
        .distinct()
        .all()
    )
    site_ids = [r.site_id for r in site_rows]

    if site_id is not None:
        site_ids = [s for s in site_ids if s == site_id]

    # Construit les datasets par site
    datasets = []

    for sid in site_ids:
        site_obj  = db.query(Site).filter(Site.id == sid).first()
        site_name = site_obj.name if site_obj else f"Site {sid}"

        data = []
        for period in periods:
            snap = (
                db.query(KpiSnapshot)
                .filter(
                    KpiSnapshot.project_id    == project_id,
                    KpiSnapshot.period_id     == period.id,
                    KpiSnapshot.site_id       == sid,
                    KpiSnapshot.developer_id.is_(None),
                )
                .first()
            )
            value = getattr(snap, kpi_field, None) if snap else None
            data.append(round(float(value), 2) if value is not None else None)

        datasets.append({
            "site_id":   sid,
            "site_name": site_name,
            "data":      data,
        })

    # Si aucun dataset par site → fallback snapshots globaux
    if not datasets:
        global_data = []
        for period in periods:
            snap = (
                db.query(KpiSnapshot)
                .filter(
                    KpiSnapshot.project_id == project_id,
                    KpiSnapshot.period_id  == period.id,
                    KpiSnapshot.site_id.is_(None),
                    KpiSnapshot.developer_id.is_(None),
                )
                .first()
            )
            value = getattr(snap, kpi_field, None) if snap else None
            global_data.append(round(float(value), 2) if value is not None else None)

        datasets.append({
            "site_id":   None,
            "site_name": "Global",
            "data":      global_data,
        })

    return {
        "project_id": project_id,
        "kpi_field":  kpi_field,
        "labels":     labels,
        "datasets":   datasets,
    }


# =============================================================================
# GET /kpis/sites  — sites disponibles (dropdown frontend)
# =============================================================================

@router.get(
    "/sites",
    response_model = List[SiteResponse],
    summary        = "Sites disponibles pour un projet",
)
def get_available_sites(
    project_id:   int     = Query(..., description="ID du projet"),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Retourne les sites qui ont au moins un snapshot KPI pour ce projet.
    Utilisé par le frontend pour alimenter le dropdown "Filtrer par site".
    """
    from sqlalchemy import distinct
    from app.models.kpi_snapshot import KpiSnapshot
    from app.models.site import Site

    rows = (
        db.query(distinct(KpiSnapshot.site_id))
        .filter(
            KpiSnapshot.project_id == project_id,
            KpiSnapshot.site_id.isnot(None),
        )
        .all()
    )
    site_ids = [row[0] for row in rows]

    if not site_ids:
        return []

    return (
        db.query(Site)
        .filter(Site.id.in_(site_ids), Site.is_active.is_(True))
        .order_by(Site.name)
        .all()
    )


# =============================================================================
# GET /kpis/developers  — développeurs disponibles (dropdown frontend)
# =============================================================================

@router.get(
    "/developers",
    response_model = List[DeveloperResponse],
    summary        = "Développeurs validés d'un projet",
)
def get_available_developers(
    project_id: int           = Query(..., description="ID du projet"),
    site_id:    Optional[int] = Query(default=None, description="Filtrer par site"),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
):
    """
    Retourne les développeurs validés d'un projet.
    Filtrable par site. Alimente le dropdown "Filtrer par développeur".
    """
    if site_id is not None:
        return dev_repo.get_by_site_id(db, site_id=site_id, project_id=project_id)
    return dev_repo.get_project_developers(db, project_id=project_id)


# =============================================================================
# GET /kpis/compare  — comparaison inter-sites (exigence encadrant)
# =============================================================================

@router.get(
    "/compare",
    response_model = List[KpiSnapshotResponse],
    summary        = "Comparaison KPIs inter-sites",
)
def compare_sites(
    project_id: int           = Query(..., description="ID du projet"),
    period_id:  Optional[int] = Query(default=None, description="Période (défaut = dernière)"),
    kpi_field:  str           = Query(
        default="mr_rate_per_site",
        description=(
            "KPI pour le tri : mr_rate_per_site | approved_mr_rate | "
            "merged_mr_rate | commit_rate_per_site | "
            "nb_commits_per_project | avg_review_time_hours"
        ),
    ),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
):
    """
    Retourne un snapshot par site pour le projet sur la même période.
    Fallback : snapshots globaux si aucun snapshot par site disponible.
    """
    from app.models.kpi_snapshot import KpiSnapshot
    from sqlalchemy import func

    if period_id is None:
        latest_date = (
            db.query(func.max(KpiSnapshot.snapshot_date))
            .filter(KpiSnapshot.project_id == project_id)
            .scalar()
        )
        if latest_date is None:
            raise HTTPException(
                status_code=404,
                detail=f"Aucun snapshot trouvé pour le projet {project_id}.",
            )
        latest_snap = (
            db.query(KpiSnapshot)
            .filter(
                KpiSnapshot.project_id    == project_id,
                KpiSnapshot.snapshot_date == latest_date,
            )
            .first()
        )
        if not latest_snap:
            raise HTTPException(status_code=404, detail="Impossible de résoudre la période.")
        period_id = latest_snap.period_id

    try:
        snapshots = snapshot_repo.get_site_comparison(
            db=db, project_id=project_id, period_id=period_id, kpi_field=kpi_field,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not snapshots:
        snapshots = (
            db.query(KpiSnapshot)
            .filter(
                KpiSnapshot.project_id == project_id,
                KpiSnapshot.period_id  == period_id,
                KpiSnapshot.site_id.is_(None),
                KpiSnapshot.developer_id.is_(None),
            )
            .order_by(KpiSnapshot.snapshot_date.desc())
            .all()
        )

    if not snapshots:
        raise HTTPException(
            status_code=404,
            detail="Aucun snapshot inter-sites trouvé pour ces critères.",
        )
    return snapshots


# =============================================================================
# GET /kpis/top-developers  — top/bottom performers (prise de décision)
# =============================================================================

@router.get(
    "/top-developers",
    response_model = List[KpiSnapshotResponse],
    summary        = "Classement des développeurs par KPI",
)
def get_top_developers(
    project_id: int           = Query(..., description="ID du projet"),
    period_id:  Optional[int] = Query(default=None),
    site_id:    Optional[int] = Query(default=None, description="Filtrer par site"),
    kpi_field:  str           = Query(default="mr_rate_per_site"),
    limit:      int           = Query(default=10, ge=1, le=50),
    ascending:  bool          = Query(
        default=False,
        description="False = top performers | True = bottom performers",
    ),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
):
    """
    Classement des développeurs par valeur KPI sur une période.
    ascending=False → top performers | ascending=True → bottom performers
    Retourne liste vide (pas 404) si aucun snapshot individuel trouvé.
    """
    from app.models.kpi_snapshot import KpiSnapshot

    if period_id is None:
        latest_snap = (
            db.query(KpiSnapshot)
            .filter(
                KpiSnapshot.project_id       == project_id,
                KpiSnapshot.developer_id.isnot(None),
            )
            .order_by(KpiSnapshot.snapshot_date.desc())
            .first()
        )
        if not latest_snap:
            return []
        period_id = latest_snap.period_id

    try:
        snapshots = snapshot_repo.get_developers_ranking(
            db=db, project_id=project_id, period_id=period_id,
            kpi_field=kpi_field, site_id=site_id, limit=limit, ascending=ascending,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return snapshots or []