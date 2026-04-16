"""
api/routers/analytics.py

AJOUTS :
    - GET /analytics/developer/{developer_id}/heatmap
      Activité jour par jour (GitHub-style) — amélioration Heatmap.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.database.session import get_db
from app.models.app_user import AppUser
from app.repositories.commit_repository import CommitRepository
from app.schemas.kpi import (
    DashboardSummaryResponse,
    KpiHistoryResponse,
    KpiSnapshotResponse,
    SnapshotGeneratedResponse,
)
from app.services.kpi.analytics_service import AnalyticsService
from app.services.kpi.kpi_aggregator import KpiAggregator

logger      = logging.getLogger(__name__)
router      = APIRouter(prefix="/analytics", tags=["Analytics"])
commit_repo = CommitRepository()


# ── Latest KPIs ───────────────────────────────────────────────────────────────

@router.get("/{project_id}/latest", response_model=KpiSnapshotResponse)
def get_latest_kpis(
    project_id:   int,
    site_id:      Optional[int] = Query(default=None),
    group_id:     Optional[int] = Query(default=None),
    developer_id: Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    service = AnalyticsService(db)
    result  = service.get_latest_kpis(project_id, site_id, group_id, developer_id)

    if not result:
        raise HTTPException(
            status_code=404,
            detail="No KPI snapshot found for this project",
        )
    return result


# ── History ───────────────────────────────────────────────────────────────────

@router.get("/{project_id}/history", response_model=KpiHistoryResponse)
def get_kpi_history(
    project_id:   int,
    site_id:      Optional[int]  = Query(default=None),
    group_id:     Optional[int]  = Query(default=None),
    developer_id: Optional[int]  = Query(default=None),
    start_date:   Optional[date] = Query(default=None),
    end_date:     Optional[date] = Query(default=None),
    db:           Session        = Depends(get_db),
    current_user: AppUser        = Depends(get_current_user),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    service   = AnalyticsService(db)
    snapshots = service.get_kpi_history(
        project_id, site_id, group_id, developer_id, start_date, end_date
    )

    return KpiHistoryResponse.from_snapshots(
        snapshots  = snapshots,
        project_id = project_id,
        site_id    = site_id,
    )


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/{project_id}/dashboard", response_model=DashboardSummaryResponse)
def get_dashboard(
    project_id:   int,
    site_id:      Optional[int] = Query(default=None),
    group_id:     Optional[int] = Query(default=None),
    developer_id: Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    summary = AnalyticsService(db).get_dashboard_summary(
        project_id, site_id, group_id, developer_id
    )
    summary["project_id"] = project_id
    summary["site_id"]    = site_id
    return summary


# ── Generate Snapshot (Admin) ─────────────────────────────────────────────────

@router.post("/{project_id}/generate-snapshot", response_model=SnapshotGeneratedResponse)
def generate_snapshot(
    project_id:    int,
    year:          int           = Query(..., ge=2000),
    month:         int           = Query(..., ge=1, le=12),
    site_id:       Optional[int] = Query(default=None),
    db:            Session       = Depends(get_db),
    current_admin: AppUser       = Depends(get_current_admin),
):
    """Génère manuellement les snapshots KPI. Admin uniquement."""
    aggregator = KpiAggregator(db)
    snapshots  = aggregator.generate_monthly_snapshots(project_id, year, month)

    if not snapshots:
        raise HTTPException(status_code=404, detail="No snapshots generated")

    target = next(
        (s for s in snapshots if s.site_id == site_id),
        snapshots[0],
    )

    return SnapshotGeneratedResponse(
        message               = f"Snapshots generated successfully ({len(snapshots)} total)",
        snapshot_date         = target.snapshot_date,
        period_id             = target.period_id,
        project_id            = target.project_id,
        site_id               = target.site_id,
        mr_rate_per_site      = target.mr_rate_per_site,
        avg_review_time_hours = target.avg_review_time_hours,
    )


# ── Heatmap d'activité développeur ───────────────────────────────────────────

@router.get("/developer/{developer_id}/heatmap")
def get_developer_heatmap(
    developer_id: int,
    months:       int     = Query(default=12, ge=1, le=24,
                                  description="Nombre de mois à remonter (1–24)"),
    db:           Session = Depends(get_db),
    _:            AppUser = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Activité jour par jour d'un développeur — heatmap GitHub-style.

    Retourne uniquement les jours avec activité :
      { "date": "2025-03-15", "count": 4 }

    Le frontend remplit les jours sans activité avec count=0
    pour construire la grille calendrier complète.

    Paramètres :
      developer_id : ID du développeur
      months       : fenêtre temporelle (défaut 12 mois)

    Réponse :
      {
        "developer_id"     : 42,
        "start_date"       : "2024-04-01",
        "end_date"         : "2025-03-30",
        "total_days_active": 87,
        "total_commits"    : 312,
        "max_day_count"    : 15,
        "activity"         : [ { "date": "...", "count": N }, ... ]
      }
    """
    end_date   = datetime.now()
    start_date = end_date - timedelta(days=months * 30)

    activity = commit_repo.get_daily_activity(
        db,
        developer_id = developer_id,
        start_date   = start_date,
        end_date     = end_date,
    )

    total_commits    = sum(d["count"] for d in activity)
    max_day_count    = max((d["count"] for d in activity), default=0)

    return {
        "developer_id":      developer_id,
        "start_date":        start_date.date().isoformat(),
        "end_date":          end_date.date().isoformat(),
        "total_days_active": len(activity),
        "total_commits":     total_commits,
        "max_day_count":     max_day_count,
        "activity":          activity,
    }


# ── Insights de performance (Manager Only) ───────────────────────────────────

@router.get("/developer/{developer_id}/insights")
def get_developer_insights(
    developer_id: int,
    project_id:   int           = Query(...),
    period_id:    Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    """
    Analyse comparative du développeur par rapport aux moyennes de son site.
    Réservé aux Managers / Admins dans la logique métier.
    """
    # Note : La vérification de rôle Manager/Admin peut être faite ici 
    # ou gérée nativement via current_user.role
    service = AnalyticsService(db)
    return service.get_developer_insights(developer_id, project_id, period_id)


# ── Team Velocity (Manager Only) ──────────────────────────────────────────────

@router.get("/team/velocity")
def get_team_velocity(
    project_id: int           = Query(..., description="ID du projet"),
    weeks:      int           = Query(default=12, ge=1, le=52,
                                      description="Nombre de semaines à analyser"),
    site_id:    Optional[int] = Query(default=None),
    db:         Session       = Depends(get_db),
    _:          AppUser       = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    [SENIOR] Vélocité hebdomadaire de l'équipe — pour les rétrospectives de sprint.

    Retourne, pour chaque semaine, le nombre de :
      - commits réalisés
      - MRs ouvertes
      - MRs mergées (= livrables réels)

    Permet au manager de détecter :
      - Les semaines de creux (vacances, blocages techniques)
      - La tendance globale (équipe qui accélère ou ralentit)
      - Les sprints surchargés (MRs ouvertes >> MRs mergées)

    Réponse :
      {
        "project_id": 1,
        "weeks": 12,
        "data": [
          { "week_start": "2025-01-06", "commits": 42, "mrs_opened": 8, "mrs_merged": 6 },
          ...
        ],
        "summary": { "avg_commits_week": 38.5, "avg_mrs_merged_week": 5.2 }
      }
    """
    from sqlalchemy import func, case
    from app.models.commit import Commit
    from app.models.merge_request import MergeRequest

    end_date   = datetime.now()
    start_date = end_date - timedelta(weeks=weeks)

    # ── Commits par semaine ──
    commits_by_week = (
        db.query(
            func.date_trunc("week", Commit.committed_date).label("week_start"),
            func.count(Commit.id).label("commits"),
        )
        .filter(
            Commit.project_id    == project_id,
            Commit.committed_date >= start_date,
            Commit.is_merge_commit == False,
        )
    )
    if site_id:
        from app.models.developer_site import DeveloperSite
        commits_by_week = commits_by_week.join(
            DeveloperSite, DeveloperSite.developer_id == Commit.developer_id
        ).filter(DeveloperSite.site_id == site_id)

    commits_by_week = (
        commits_by_week
        .group_by(func.date_trunc("week", Commit.committed_date))
        .order_by(func.date_trunc("week", Commit.committed_date))
        .all()
    )
    commits_map = {str(row.week_start.date()): row.commits for row in commits_by_week}

    # ── MRs par semaine ──
    mrs_by_week = (
        db.query(
            func.date_trunc("week", MergeRequest.created_at).label("week_start"),
            func.count(MergeRequest.id).label("mrs_opened"),
            func.sum(
                case((MergeRequest.state == "merged", 1), else_=0)
            ).label("mrs_merged"),
        )
        .filter(
            MergeRequest.project_id == project_id,
            MergeRequest.created_at >= start_date,
        )
        .group_by(func.date_trunc("week", MergeRequest.created_at))
        .order_by(func.date_trunc("week", MergeRequest.created_at))
        .all()
    )
    mrs_map = {
        str(row.week_start.date()): {
            "mrs_opened": row.mrs_opened,
            "mrs_merged": int(row.mrs_merged or 0),
        }
        for row in mrs_by_week
    }

    # ── Fusion par semaine ──
    all_weeks = sorted(set(list(commits_map.keys()) + list(mrs_map.keys())))
    data = [
        {
            "week_start":  w,
            "commits":     commits_map.get(w, 0),
            "mrs_opened":  mrs_map.get(w, {}).get("mrs_opened", 0),
            "mrs_merged":  mrs_map.get(w, {}).get("mrs_merged", 0),
        }
        for w in all_weeks
    ]

    # ── Résumé ──
    n = len(data) or 1
    summary = {
        "avg_commits_week":    round(sum(d["commits"]    for d in data) / n, 1),
        "avg_mrs_merged_week": round(sum(d["mrs_merged"] for d in data) / n, 1),
        "total_commits":       sum(d["commits"]    for d in data),
        "total_mrs_merged":    sum(d["mrs_merged"] for d in data),
    }

    return {
        "project_id": project_id,
        "site_id":    site_id,
        "weeks":      weeks,
        "summary":    summary,
        "data":       data,
    }


@router.get("/{project_id}/trends/comparative", response_model=List[Dict])
def get_comparative_trends(
    project_id:   int,
    site_ids:     List[int]      = Query(default=[]),
    group_ids:    List[int]      = Query(default=[]),
    start_date:   Optional[date] = Query(default=None),
    end_date:     Optional[date] = Query(default=None),
    db:           Session        = Depends(get_db),
    current_user: AppUser        = Depends(get_current_user),
):
    """
    [SENIOR] Endpoint pour la comparaison multi-séries (Sites ou Équipes).
    Utilisé par la page 'Pilotage' pour l'analyse multidimensionnelle.
    """
    service = AnalyticsService(db)
    return service.get_comparative_trends(
        project_id=project_id,
        site_ids=site_ids if site_ids else None,
        group_ids=group_ids if group_ids else None,
        start_date=start_date,
        end_date=end_date
    )