"""Analytics router endpoints for KPI history, snapshots and team insights."""
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


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    """Return a standardized API error payload."""
    return HTTPException(status_code=status_code, detail=f"{code}: {message}")


# ── Latest KPIs ───────────────────────────────────────────────────────────────

@router.get("/{project_id}/latest", response_model=KpiSnapshotResponse)
def get_latest_kpis(
    project_id:   str,
    site_id:      Optional[int] = Query(default=None),
    group_id:     Optional[int] = Query(default=None),
    developer_id: Optional[int] = Query(default=None),
    lot_id:       Optional[int] = Query(default=None, description="Filtrer par session d'extraction"),
    period_id:    Optional[int] = Query(default=None, description="Filtrer par période spécifique"),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    service = AnalyticsService(db)
    # Support 'all'
    p_id = None if project_id == "all" else int(project_id)
    result  = service.get_latest_kpis(p_id, site_id, group_id, developer_id, lot_id=lot_id, period_id=period_id)

    if not result:
        raise _http_error(404, "ANALYTICS_SNAPSHOT_NOT_FOUND", "No KPI snapshot found for this project/lot")
    return result


# ── History ───────────────────────────────────────────────────────────────────

@router.get("/{project_id}/history", response_model=KpiHistoryResponse)
def get_kpi_history(
    project_id:   str,
    site_id:      Optional[int]  = Query(default=None),
    group_id:     Optional[int]  = Query(default=None),
    developer_id: Optional[int]  = Query(default=None),
    start_date:   Optional[date] = Query(default=None),
    end_date:     Optional[date] = Query(default=None),
    db:           Session        = Depends(get_db),
    current_user: AppUser        = Depends(get_current_user),
):
    if start_date and end_date and start_date > end_date:
        raise _http_error(400, "ANALYTICS_DATE_RANGE_INVALID", "start_date cannot be after end_date")

    service   = AnalyticsService(db)
    p_id = None if project_id == "all" else int(project_id)
    snapshots = service.get_kpi_history(
        p_id, site_id, group_id, developer_id, start_date, end_date
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
        raise _http_error(404, "ANALYTICS_SNAPSHOT_NOT_GENERATED", "No snapshots generated")

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
    project_id:   str           = Query(...),
    period_id:    Optional[int] = Query(default=None),
    db:           Session       = Depends(get_db),
    current_user: AppUser       = Depends(get_current_user),
):
    
    service = AnalyticsService(db)
    p_id = None if project_id in ("all", "0") else int(project_id)
    return service.get_developer_insights(developer_id, p_id, period_id)


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
    """Return weekly team velocity metrics for retrospectives and trend tracking."""
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
    
    service = AnalyticsService(db)
    return service.get_comparative_trends(
        project_id=project_id,
        site_ids=site_ids if site_ids else None,
        group_ids=group_ids if group_ids else None,
        start_date=start_date,
        end_date=end_date
    )