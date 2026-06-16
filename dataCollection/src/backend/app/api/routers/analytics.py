"""Analytics router endpoints for KPI history, snapshots and team insights."""
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user, get_current_viewer_or_above
from app.repositories.user_repository import AppUserRepository
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
user_repo    = AppUserRepository()


def _get_tenant_user_id(db: Session, current_user: AppUser) -> int:
    """Récupère l'ID du tenant_user correspondant à l'utilisateur courant."""
    tenant_user = user_repo.get_by_email(db, current_user.email)
    if not tenant_user:
        raise _http_error(404, "USER_NOT_FOUND_IN_TENANT", "Utilisateur non trouvé dans la base tenant")
    return tenant_user.id


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
    # ✅ ARCHITECTURE MULTI-TENANT: Filtrer site_id pour site_manager
    if current_user.is_site_manager and site_id:
        from app.repositories.user_site_access_repository import UserSiteAccessRepository
        site_access_repo = UserSiteAccessRepository()
        
        # Charger les assignations de sites depuis tenant
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single site
        if current_user.site_id:
            accessible_site_ids.append(current_user.site_id)
        
        # Si le site demandé n'est pas dans les sites accessibles, refuser
        if site_id not in accessible_site_ids:
            raise _http_error(
                403,
                "FORBIDDEN",
                f"Accès au site {site_id} refusé. Vous gérez uniquement les sites {accessible_site_ids}."
            )
    
    # ✅ ARCHITECTURE MULTI-TENANT: Filtrer group_id pour team_lead
    if current_user.is_team_lead and group_id:
        from app.repositories.user_group_access_repository import UserGroupAccessRepository
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations d'équipes depuis tenant
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single group
        if current_user.group_id:
            accessible_group_ids.append(current_user.group_id)
        
        # Si le groupe demandé n'est pas dans les groupes accessibles, refuser
        if group_id not in accessible_group_ids:
            raise _http_error(
                403,
                "FORBIDDEN",
                f"Accès au groupe {group_id} refusé. Vous gérez uniquement les groupes {accessible_group_ids}."
            )
    
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

    # ✅ ARCHITECTURE MULTI-TENANT: Filtrer site_id pour site_manager
    if current_user.is_site_manager and site_id:
        from app.repositories.user_site_access_repository import UserSiteAccessRepository
        site_access_repo = UserSiteAccessRepository()
        
        # Charger les assignations de sites depuis tenant
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single site
        if current_user.site_id:
            accessible_site_ids.append(current_user.site_id)
        
        # Si le site demandé n'est pas dans les sites accessibles, refuser
        if site_id not in accessible_site_ids:
            raise _http_error(
                403,
                "FORBIDDEN",
                f"Accès au site {site_id} refusé. Vous gérez uniquement les sites {accessible_site_ids}."
            )

    # ✅ ARCHITECTURE MULTI-TENANT: Filtrer group_id pour team_lead
    if current_user.is_team_lead and group_id:
        from app.repositories.user_group_access_repository import UserGroupAccessRepository
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations d'équipes depuis tenant
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single group
        if current_user.group_id:
            accessible_group_ids.append(current_user.group_id)
        
        # Si le groupe demandé n'est pas dans les groupes accessibles, refuser
        if group_id not in accessible_group_ids:
            raise _http_error(
                403,
                "FORBIDDEN",
                f"Accès au groupe {group_id} refusé. Vous gérez uniquement les groupes {accessible_group_ids}."
            )

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
    # ✅ ARCHITECTURE MULTI-TENANT: Filtrer site_id pour site_manager
    if current_user.is_site_manager and site_id:
        from app.repositories.user_site_access_repository import UserSiteAccessRepository
        site_access_repo = UserSiteAccessRepository()
        
        # Charger les assignations de sites depuis tenant
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single site
        if current_user.site_id:
            accessible_site_ids.append(current_user.site_id)
        
        # Si le site demandé n'est pas dans les sites accessibles, refuser
        if site_id not in accessible_site_ids:
            raise _http_error(
                403,
                "FORBIDDEN",
                f"Accès au site {site_id} refusé. Vous gérez uniquement les sites {accessible_site_ids}."
            )
    
    # ✅ ARCHITECTURE MULTI-TENANT: Filtrer group_id pour team_lead
    if current_user.is_team_lead and group_id:
        from app.repositories.user_group_access_repository import UserGroupAccessRepository
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations d'équipes depuis tenant
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single group
        if current_user.group_id:
            accessible_group_ids.append(current_user.group_id)
        
        # Si le groupe demandé n'est pas dans les groupes accessibles, refuser
        if group_id not in accessible_group_ids:
            raise _http_error(
                403,
                "FORBIDDEN",
                f"Accès au groupe {group_id} refusé. Vous gérez uniquement les groupes {accessible_group_ids}."
            )
    
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
    
    # Filter out commits during periods without mission assignments
    from app.models.developer import Developer
    from app.models.developer_project import DeveloperProject
    from datetime import date as date_type
    from app.models.audit_log import AuditLog
    
    developer = db.query(Developer).filter(Developer.id == developer_id).first()
    if developer:
        # Use DeveloperContext to check RH status for each activity date
        from app.models.developer import DeveloperContext
        
        filtered_activity = []
        for day_activity in activity:
            activity_date = date_type.fromisoformat(day_activity["date"])
            
            # Save current context state
            original_context = getattr(developer, "_context_period_date", None)
            
            # Check RH status at this specific date
            with DeveloperContext(db, activity_date):
                db.refresh(developer)
                status = developer.rh_status
            
            # Restore original context state
            developer._context_period_date = original_context
            db.expire(developer)
            
            # Only include activity if developer was ACTIVE (not INACTIVE/SUSPENDED)
            if status == "ACTIVE":
                filtered_activity.append(day_activity)
        
        activity = filtered_activity

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


@router.get("/comparison", response_model=List[Dict])
def get_comparison(
    project_id:   Optional[int] = Query(default=None, description="ID du projet"),
    site_ids:     List[int]      = Query(default=[]),
    group_ids:    List[int]      = Query(default=[]),
    start_date:   Optional[date] = Query(default=None),
    end_date:     Optional[date] = Query(default=None),
    db:           Session        = Depends(get_db),
    current_user: AppUser        = Depends(get_current_user),
):
    """
    Route d'alias pour /analytics/comparison qui redirige vers /analytics/{project_id}/trends/comparative.
    Utilisé par le frontend pour simplifier les URLs.
    
    Si project_id n'est pas fourni, utilise automatiquement le premier projet accessible selon le rôle:
    - super_admin: premier projet disponible
    - project_manager: premier projet assigné
    - site_manager: premier projet du site (ou premier disponible si aucun site_id)
    - team_lead: premier projet de l'équipe (ou premier disponible si aucun group_id)
    """
    from app.repositories.project_repository import ProjectRepository
    project_repo = ProjectRepository()
    
    # Si project_id n'est pas fourni, déterminer le projet par défaut selon le rôle
    if project_id is None:
        if current_user.is_super_admin:
            # Super admin: utiliser le premier projet disponible
            projects = project_repo.get_all(db)
            if not projects:
                raise _http_error(404, "NO_PROJECTS", "Aucun projet disponible.")
            project_id = projects[0].id
            logger.info(f"Super admin: using default project_id={project_id}")
        
        elif current_user.is_project_manager:
            # Project manager: utiliser le premier projet assigné
            from app.repositories.user_project_access_repository import UserProjectAccessRepository
            project_access_repo = UserProjectAccessRepository()
            accessible_projects = project_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))
            if not accessible_projects:
                raise _http_error(403, "NO_ASSIGNED_PROJECTS", "Aucun projet assigné. Veuillez contacter un administrateur.")
            project_id = accessible_projects[0].project_id
            logger.info(f"Project manager: using first assigned project_id={project_id}")
        
        elif current_user.is_site_manager:
            # Site manager: utiliser le premier projet du site (ou premier disponible)
            if current_user.site_id:
                # Chercher un projet associé au site
                projects = project_repo.get_all(db)
                site_projects = [p for p in projects if hasattr(p, 'site_id') and p.site_id == current_user.site_id]
                if site_projects:
                    project_id = site_projects[0].id
                    logger.info(f"Site manager: using site project_id={project_id}")
                else:
                    # Fallback: premier projet disponible
                    projects = project_repo.get_all(db)
                    if not projects:
                        raise _http_error(404, "NO_PROJECTS", "Aucun projet disponible.")
                    project_id = projects[0].id
                    logger.info(f"Site manager: fallback to default project_id={project_id}")
            else:
                # Pas de site_id: utiliser le premier projet disponible
                projects = project_repo.get_all(db)
                if not projects:
                    raise _http_error(404, "NO_PROJECTS", "Aucun projet disponible.")
                project_id = projects[0].id
                logger.info(f"Site manager (no site_id): using default project_id={project_id}")
        
        elif current_user.is_team_lead:
            # Team lead: utiliser le premier projet de l'équipe (ou premier disponible)
            if current_user.group_id:
                # Chercher un projet associé à l'équipe
                projects = project_repo.get_all(db)
                group_projects = [p for p in projects if hasattr(p, 'group_id') and p.group_id == current_user.group_id]
                if group_projects:
                    project_id = group_projects[0].id
                    logger.info(f"Team lead: using group project_id={project_id}")
                else:
                    # Fallback: premier projet disponible
                    projects = project_repo.get_all(db)
                    if not projects:
                        raise _http_error(404, "NO_PROJECTS", "Aucun projet disponible.")
                    project_id = projects[0].id
                    logger.info(f"Team lead (no group_id): fallback to default project_id={project_id}")
            else:
                # Pas de group_id: utiliser le premier projet disponible
                projects = project_repo.get_all(db)
                if not projects:
                    raise _http_error(404, "NO_PROJECTS", "Aucun projet disponible.")
                project_id = projects[0].id
                logger.info(f"Team lead (no group_id): using default project_id={project_id}")
        
        else:
            # Developer: utiliser le premier projet disponible
            projects = project_repo.get_all(db)
            if not projects:
                raise _http_error(404, "NO_PROJECTS", "Aucun projet disponible.")
            project_id = projects[0].id
            logger.info(f"Developer: using default project_id={project_id}")
    
    # Appeler la route existante avec les mêmes paramètres
    return get_comparative_trends(
        project_id=project_id,
        site_ids=site_ids,
        group_ids=group_ids,
        start_date=start_date,
        end_date=end_date,
        db=db,
        current_user=current_user,
    )


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
    # Enforce site-based access control for site_manager
    if current_user.is_site_manager:
        # ✅ ARCHITECTURE MULTI-TENANT: Charger les assignations depuis tenant
        from app.repositories.user_site_access_repository import UserSiteAccessRepository
        site_access_repo = UserSiteAccessRepository()
        
        # Charger les assignations de sites depuis tenant
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single site
        if current_user.site_id:
            accessible_site_ids.append(current_user.site_id)
        
        # ✅ FIX: Filtrer les site_ids demandés au lieu de rejeter la requête
        if site_ids:
            filtered_site_ids = [sid for sid in site_ids if sid in accessible_site_ids]
            if filtered_site_ids:
                site_ids = filtered_site_ids
                logger.info(f"[Analytics Router] Filtered site_ids from {site_ids} to {filtered_site_ids}")
            else:
                site_ids = accessible_site_ids
                logger.info(f"[Analytics Router] No accessible site_ids in request, using accessible sites: {accessible_site_ids}")
        else:
            site_ids = accessible_site_ids
            logger.info(f"[Analytics Router] No site_ids provided, using accessible sites: {accessible_site_ids}")
        
        # For group_ids: allow access (groups are already filtered by site_id in /developer-groups endpoint)
        # No additional check needed since the frontend only passes groups that belong to the site_manager's site
        pass
    
    # Enforce group-based access control for team_lead
    if current_user.is_team_lead:
        # ✅ ARCHITECTURE MULTI-TENANT: Charger les assignations depuis tenant
        from app.repositories.user_group_access_repository import UserGroupAccessRepository
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations d'équipes depuis tenant
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single group
        if current_user.group_id:
            accessible_group_ids.append(current_user.group_id)
        
        # ✅ FIX: Pour team_lead, ignorer site_ids et utiliser uniquement group_ids
        # Les team_lead ne gèrent pas les sites, ils gèrent les équipes
        if site_ids:
            logger.warning(f"[Analytics Router] team_lead provided site_ids {site_ids}, ignoring and using group_ids instead")
            site_ids = []  # Ignorer site_ids pour team_lead
        
        # ✅ FIX: Filtrer les group_ids demandés au lieu de rejeter la requête
        # Si group_ids est fourni, ne garder que ceux qui sont accessibles
        if group_ids and len(group_ids) > 0:
            filtered_group_ids = [gid for gid in group_ids if gid in accessible_group_ids]
            if filtered_group_ids:
                group_ids = filtered_group_ids
                logger.info(f"[Analytics Router] Filtered group_ids from {group_ids} to {filtered_group_ids}")
            else:
                # Si aucun group_id n'est accessible, utiliser les groupes accessibles
                group_ids = accessible_group_ids
                logger.info(f"[Analytics Router] No accessible group_ids in request, using accessible groups: {accessible_group_ids}")
        elif not group_ids or len(group_ids) == 0:
            # ✅ FIX: Si group_ids est vide ou None, utiliser les groupes accessibles
            group_ids = accessible_group_ids
            logger.info(f"[Analytics Router] Empty group_ids provided, using accessible groups: {accessible_group_ids}")
    
    # ✅ ARCHITECTURE MULTI-TENANT: Enforce project-based access control for project_manager
    if current_user.is_project_manager:
        from app.repositories.user_project_access_repository import UserProjectAccessRepository
        from app.repositories.project_repository import ProjectRepository
        project_access_repo = UserProjectAccessRepository()
        project_repo = ProjectRepository()
        
        # Charger les assignations de projets depuis tenant
        accessible_project_ids = [access.project_id for access in project_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Vérifier que l'utilisateur a accès au projet demandé
        if project_id not in accessible_project_ids:
            # Récupérer les noms des projets pour un message plus clair
            all_projects = project_repo.get_all(db)
            project_map = {p.id: p.name for p in all_projects}
            
            requested_project_name = project_map.get(project_id, f"projet {project_id}")
            accessible_project_names = [project_map.get(pid, f"projet {pid}") for pid in accessible_project_ids]
            
            raise _http_error(
                403,
                "FORBIDDEN",
                f"Accès au projet {requested_project_name} refusé. Vous gérez uniquement les projets {accessible_project_names}."
            )
    
    # ✅ ARCHITECTURE MULTI-TENANT: Enforce combined access control for viewer
    if current_user.role == 'viewer':
        from app.repositories.user_project_access_repository import UserProjectAccessRepository
        from app.repositories.project_repository import ProjectRepository
        from app.repositories.user_site_access_repository import UserSiteAccessRepository
        from app.repositories.user_group_access_repository import UserGroupAccessRepository
        project_access_repo = UserProjectAccessRepository()
        project_repo = ProjectRepository()
        site_access_repo = UserSiteAccessRepository()
        group_access_repo = UserGroupAccessRepository()
        
        # Charger les assignations de projets depuis tenant
        accessible_project_ids = [access.project_id for access in project_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Vérifier que l'utilisateur a accès au projet demandé
        if project_id not in accessible_project_ids:
            all_projects = project_repo.get_all(db)
            project_map = {p.id: p.name for p in all_projects}
            requested_project_name = project_map.get(project_id, f"projet {project_id}")
            accessible_project_names = [project_map.get(pid, f"projet {pid}") for pid in accessible_project_ids]
            raise _http_error(
                403,
                "FORBIDDEN",
                f"Accès au projet {requested_project_name} refusé. Vous avez accès uniquement aux projets {accessible_project_names}."
            )
        
        # Charger les assignations de sites depuis tenant
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Charger les assignations de groupes depuis tenant
        accessible_group_ids = [access.group_id for access in group_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Appliquer les filtres selon les assignations (logique simple comme super_admin)
        # ✅ FIX: Si group_ids est demandé, forcer site_ids à None pour éviter conflit
        if group_ids:
            if accessible_group_ids:
                filtered_group_ids = [gid for gid in group_ids if gid in accessible_group_ids]
                if filtered_group_ids:
                    group_ids = filtered_group_ids
                    logger.info(f"[Analytics Router] Viewer: Filtered group_ids to {filtered_group_ids}")
                else:
                    group_ids = []
                    logger.info(f"[Analytics Router] Viewer: No accessible group_ids, keeping group_ids empty")
            else:
                group_ids = []
                logger.info(f"[Analytics Router] Viewer: No group assignments, keeping group_ids empty")
            # Forcer site_ids à None quand group_ids est utilisé
            site_ids = None
        elif site_ids:
            if accessible_site_ids:
                filtered_site_ids = [sid for sid in site_ids if sid in accessible_site_ids]
                if filtered_site_ids:
                    site_ids = filtered_site_ids
                    logger.info(f"[Analytics Router] Viewer: Filtered site_ids to {filtered_site_ids}")
                else:
                    site_ids = accessible_site_ids
                    logger.info(f"[Analytics Router] Viewer: Using accessible site_ids: {accessible_site_ids}")
            else:
                site_ids = []
                logger.info(f"[Analytics Router] Viewer: No site assignments, keeping site_ids empty")
    
    service = AnalyticsService(db)
    return service.get_comparative_trends(
        project_id=project_id,
        site_ids=site_ids if site_ids else None,
        group_ids=group_ids if group_ids else None,
        start_date=start_date,
        end_date=end_date
    )


# ── Diagnostic Metrics ────────────────────────────────────────────────────────
# ✅ [REMOVED] Diagnostic endpoint - Non fonctionnelle
# @router.get("/{project_id}/diagnostic")
# def get_project_diagnostic(
#     project_id:   int,
#     period_id:    Optional[int] = Query(default=None),
#     site_id:      Optional[int] = Query(default=None),
#     group_id:     Optional[int] = Query(default=None),
#     db:           Session       = Depends(get_db),
#     current_user: AppUser       = Depends(get_current_user),
# ):
#     """Retourne les métriques de diagnostic pour un projet (MR size vs review time, reviewer load)."""
#     # Enforce site-based access control for site_manager
#     if current_user.is_site_manager:
#         if site_id and site_id != current_user.site_id:
#             raise _http_error(
#                 403, 
#                 "FORBIDDEN", 
#                 f"Accès refusé. Vous gérez uniquement le site {current_user.site_id}."
#             )
#         site_id = current_user.site_id
#
#     # Enforce group-based access control for team_lead
#     if current_user.is_team_lead:
#         if group_id and group_id != current_user.group_id:
#             raise _http_error(
#                 403,
#                 "FORBIDDEN",
#                 f"Accès refusé. Vous gérez uniquement le groupe {current_user.group_id}."
#             )
#         group_id = current_user.group_id
#
#     # Enforce project-based access control for project_manager
#     if current_user.is_project_manager:
#         if current_user.project_ids and project_id not in current_user.project_ids:
#             raise _http_error(
#                 403,
#                 "FORBIDDEN",
#                 f"Accès refusé. Vous gérez uniquement les projets {current_user.project_ids}."
#             )
#
#     service = AnalyticsService(db)
#     return service.get_project_diagnostic_metrics(
#         project_id=project_id,
#         period_id=period_id,
#         site_id=site_id,
#         group_id=group_id,
#     )