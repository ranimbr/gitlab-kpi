"""KPI router endpoints for dashboard analytics and rankings."""
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.database.session import get_db
from app.repositories.user_repository import AppUserRepository
from app.models.app_user import AppUser
from app.models.developer import Developer
from app.models.kpi_snapshot import KpiSnapshot
from app.models.period import Period
from app.models.site import Site
from app.models.project_site import ProjectSite
from app.models.merge_request import MergeRequest
from app.models.comment import Comment
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
user_repo    = AppUserRepository()


def _get_tenant_user_id(db: Session, current_user: AppUser) -> int:
    """Récupère l'ID du tenant_user correspondant à l'utilisateur courant."""
    tenant_user = user_repo.get_by_email(db, current_user.email)
    if not tenant_user:
        raise HTTPException(status_code=404, detail="USER_NOT_FOUND_IN_TENANT: Utilisateur non trouvé dans la base tenant")
    return tenant_user.id

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
    
    # Enforce site-based access control for site_manager
    if current_user.is_site_manager:
        if site_id is None:
            # Default to the site manager's assigned site
            site_id = current_user.site_id
        elif site_id != current_user.site_id:
            # Reject access to other sites
            raise _http_error(
                403, 
                "FORBIDDEN", 
                f"Accès au site {site_id} refusé. Vous gérez uniquement le site {current_user.site_id}."
            )
    
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
# ✅ [REMOVED] Analyse de Performance 360° - Non fonctionnelle
# Endpoint désactivé car la fonctionnalité n'est pas fonctionnelle

# @router.get("/developer/{developer_id}", response_model=DeveloperKpiSnapshotResponse)
# def get_developer_kpi_view(
#     developer_id: int,
#     project_id:   int           = Query(...),
#     lot_id:       Optional[int] = Query(default=None),
#     db:           Session       = Depends(get_db),
#     current_user: AppUser       = Depends(get_current_user),
# ):
#     """Vue KPI individuelle complète (page profil développeur)."""
#     service = AnalyticsService(db)
#     result  = service.get_developer_kpi_summary(
#         developer_id=developer_id, project_id=project_id, lot_id=lot_id
#     )
#     if not result:
#         raise _http_error(404, "KPI_NOT_FOUND", "Developpeur ou snapshot introuvable.")
#     return result


@router.get("/developer/{developer_id}/summary", summary="Résumé global d'un développeur (toutes périodes)")
def get_developer_global_summary(
    developer_id: int,
    project_id:   Any           = Query(None, description="ID du projet ou None pour global"),
    lot_id:       Optional[int] = Query(None, description="Filtrer par session d'extraction"),
    period_id:    Optional[int] = Query(None, description="Filtrer par période spécifique"),
    db:           Session = Depends(get_db)
):
    """
    Retourne les totaux ALL-TIME (depuis le début) d'un développeur sur le projet.
    ✅ [FIX] Support period_id pour données historiques
    ✅ [FIX] Si développeur inactif pendant la période, retourne 0 pour tous les KPIs
    """
    from app.models.developer import Developer
    from app.models.period import Period
    
    # Check if developer was active during the specified period
    was_active_during_period = True
    if period_id:
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            developer = db.query(Developer).filter(Developer.id == developer_id).first()
            if developer:
                # Use DeveloperContext to check RH status at mid-period
                from app.models.developer import DeveloperContext
                # Use mid-period date (15th of the month) for status check
                month_date = date(period.year, period.month, 15)
                
                # Save current context state
                original_context = getattr(developer, "_context_period_date", None)
                
                with DeveloperContext(db, month_date):
                    db.refresh(developer)
                    status = developer.rh_status
                
                # Restore original context state
                developer._context_period_date = original_context
                db.expire(developer)
                
                # If developer was INACTIVE during this period, return 0 for all KPIs
                if status == "INACTIVE":
                    return {
                        "developer_id": developer_id,
                        "project_id": None if project_id in ("all", "0", 0, "") else int(project_id) if project_id else None,
                        "total_commits": 0,
                        "total_mrs_created": 0,
                        "total_mrs_approved": 0,
                        "total_mrs_merged": 0,
                        "total_comments": 0,
                        "total_reviews": 0,
                        "approved_mr_rate": 0.0,
                        "merged_mr_rate": 0.0,
                        "developer_score": 0.0,
                        "score_rank_in_site": None,
                        "latest_snapshot": None
                    }
    
    from app.models.commit import Commit
    from app.models.merge_request import MergeRequest
    from app.models.comment import Comment
    
    if project_id in ("all", "0", 0, ""):
        p_id = None
    else:
        try:
            p_id = int(project_id)
        except (ValueError, TypeError):
            p_id = None

    total_commits_query = db.query(func.count(Commit.id)).filter(
        Commit.developer_id == developer_id,
        Commit.is_merge_commit == False
    )
    if p_id: total_commits_query = total_commits_query.filter(Commit.project_id == p_id)
    if lot_id:     total_commits_query = total_commits_query.filter(Commit.extraction_lot_id == lot_id)
    # ✅ [FIX] Filtrer par period_id si spécifié
    if period_id:
        from app.models.period import Period
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            total_commits_query = total_commits_query.filter(
                Commit.authored_date >= period.start_date,
                Commit.authored_date <= period.end_date
            )
    total_commits = total_commits_query.scalar() or 0

    total_mrs_created_query = db.query(func.count(MergeRequest.id)).filter(MergeRequest.developer_id == developer_id)
    if p_id: total_mrs_created_query = total_mrs_created_query.filter(MergeRequest.project_id == p_id)
    if lot_id:     total_mrs_created_query = total_mrs_created_query.filter(MergeRequest.extraction_lot_id == lot_id)
    # ✅ [FIX] Filtrer par period_id si spécifié
    if period_id:
        from app.models.period import Period
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            total_mrs_created_query = total_mrs_created_query.filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    total_mrs_created = total_mrs_created_query.scalar() or 0

    total_comments_query = db.query(func.count(Comment.id)).join(MergeRequest, Comment.merge_request_id == MergeRequest.id).filter(Comment.developer_id == developer_id)
    if p_id: total_comments_query = total_comments_query.filter(MergeRequest.project_id == p_id)
    if lot_id:     total_comments_query = total_comments_query.filter(MergeRequest.extraction_lot_id == lot_id)
    # ✅ [FIX] Filtrer par period_id si spécifié
    if period_id:
        from app.models.period import Period
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            total_comments_query = total_comments_query.filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    total_comments = total_comments_query.scalar() or 0

    mr_with_comments_by_dev_q = db.query(Comment.merge_request_id).filter(
        Comment.developer_id == developer_id
    )
    if lot_id:
        mr_with_comments_by_dev_q = mr_with_comments_by_dev_q.join(MergeRequest, Comment.merge_request_id == MergeRequest.id).filter(MergeRequest.extraction_lot_id == lot_id)
    # ✅ [FIX] Filtrer par period_id si spécifié
    if period_id:
        from app.models.period import Period
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            mr_with_comments_by_dev_q = mr_with_comments_by_dev_q.join(MergeRequest, Comment.merge_request_id == MergeRequest.id).filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    
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
    # ✅ [FIX] Filtrer par period_id si spécifié
    if period_id:
        from app.models.period import Period
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            total_reviews_query = total_reviews_query.filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    total_reviews = total_reviews_query.scalar() or 0

    total_mrs_approved_query = db.query(func.count(MergeRequest.id)).filter(MergeRequest.developer_id == developer_id, MergeRequest.approved.is_(True))
    if p_id: total_mrs_approved_query = total_mrs_approved_query.filter(MergeRequest.project_id == p_id)
    if lot_id:     total_mrs_approved_query = total_mrs_approved_query.filter(MergeRequest.extraction_lot_id == lot_id)
    # ✅ [FIX] Filtrer par period_id si spécifié
    if period_id:
        from app.models.period import Period
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            total_mrs_approved_query = total_mrs_approved_query.filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    total_mrs_approved = total_mrs_approved_query.scalar() or 0

    total_mrs_merged_query = db.query(func.count(MergeRequest.id)).filter(MergeRequest.developer_id == developer_id, MergeRequest.state == "merged")
    if p_id: total_mrs_merged_query = total_mrs_merged_query.filter(MergeRequest.project_id == p_id)
    if lot_id:     total_mrs_merged_query = total_mrs_merged_query.filter(MergeRequest.extraction_lot_id == lot_id)
    # ✅ [FIX] Filtrer par period_id si spécifié
    if period_id:
        from app.models.period import Period
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            total_mrs_merged_query = total_mrs_merged_query.filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    total_mrs_merged = total_mrs_merged_query.scalar() or 0

    if lot_id:
        from app.services.kpi.analytics_service import AnalyticsService
        latest_snap = AnalyticsService(db)._calculate_virtual_snapshot_for_lot(
            p_id, lot_id, developer_id=developer_id, site_id=None, group_id=None
        )
    else:
        latest_snap_query = db.query(KpiSnapshot).filter(KpiSnapshot.developer_id == developer_id)
        if p_id: latest_snap_query = latest_snap_query.filter(KpiSnapshot.project_id == p_id)
        if period_id: latest_snap_query = latest_snap_query.filter(KpiSnapshot.period_id == period_id)
        latest_snap = latest_snap_query.order_by(KpiSnapshot.snapshot_date.desc()).first()

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


# ── Get Reviewed MRs for Developer (New Endpoint) ────────────────────────────
@router.get("/developer/{developer_id}/reviewed-mrs", response_model=List[dict])
def get_developer_reviewed_mrs(
    developer_id: int,
    project_id:   Any           = Query(None, description="ID du projet ou None pour global"),
    lot_id:       Optional[int] = Query(None, description="Filtrer par session d'extraction"),
    period_id:    Optional[int] = Query(None, description="Filtrer par période spécifique"),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Retourne la liste des MRs revues par un développeur (reviewer, assignee, ou commentaires).
    Utilise la même logique que le calcul de total_reviews dans get_developer_global_summary.
    """
    from app.models.period import Period
    from app.models.comment import Comment
    
    if project_id in ("all", "0", 0, ""):
        p_id = None
    else:
        try:
            p_id = int(project_id)
        except (ValueError, TypeError):
            p_id = None

    # Get MRs where developer is reviewer or assignee
    reviewed_mrs_query = db.query(MergeRequest).filter(
        MergeRequest.developer_id.is_distinct_from(developer_id),
        (
            (MergeRequest.reviewer_id == developer_id) | 
            (MergeRequest.assignee_id == developer_id)
        )
    )
    if p_id: reviewed_mrs_query = reviewed_mrs_query.filter(MergeRequest.project_id == p_id)
    if lot_id: reviewed_mrs_query = reviewed_mrs_query.filter(MergeRequest.extraction_lot_id == lot_id)
    
    # ✅ [FIX] Filtrer par period_id si spécifié
    if period_id:
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            reviewed_mrs_query = reviewed_mrs_query.filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    
    # Get MRs where developer has comments
    mr_with_comments_by_dev_q = db.query(Comment.merge_request_id).filter(
        Comment.developer_id == developer_id
    )
    if lot_id:
        mr_with_comments_by_dev_q = mr_with_comments_by_dev_q.join(MergeRequest, Comment.merge_request_id == MergeRequest.id).filter(MergeRequest.extraction_lot_id == lot_id)
    if period_id:
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            mr_with_comments_by_dev_q = mr_with_comments_by_dev_q.join(MergeRequest, Comment.merge_request_id == MergeRequest.id).filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    
    mr_with_comments_by_dev = mr_with_comments_by_dev_q.subquery()
    
    # Combine both queries (MRs where dev is reviewer/assignee OR has comments)
    # Use UNION to avoid duplicates
    from sqlalchemy import union_all
    
    # Query 1: MRs where dev is reviewer or assignee
    reviewer_assignee_mrs = reviewed_mrs_query.all()
    
    # Query 2: MRs where dev has comments (excluding those already in query 1)
    commented_mrs_query = db.query(MergeRequest).filter(
        MergeRequest.id.in_(mr_with_comments_by_dev),
        MergeRequest.developer_id.is_distinct_from(developer_id)  # Exclude MRs where dev is author
    )
    if p_id: commented_mrs_query = commented_mrs_query.filter(MergeRequest.project_id == p_id)
    if lot_id: commented_mrs_query = commented_mrs_query.filter(MergeRequest.extraction_lot_id == lot_id)
    if period_id:
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            commented_mrs_query = commented_mrs_query.filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    
    # Exclude MRs already in reviewer/assignee list
    reviewer_assignee_ids = [mr.id for mr in reviewer_assignee_mrs]
    commented_mrs = commented_mrs_query.filter(~MergeRequest.id.in_(reviewer_assignee_ids)).all()
    
    # Combine and return unique MRs
    all_reviewed_mrs = reviewer_assignee_mrs + commented_mrs
    
    # Remove duplicates (same MR might appear in both queries)
    seen_ids = set()
    unique_mrs = []
    for mr in all_reviewed_mrs:
        if mr.id not in seen_ids:
            seen_ids.add(mr.id)
            unique_mrs.append({
                "id": mr.id,
                "gitlab_mr_id": mr.gitlab_mr_id,
                "title": mr.title,
                "author": mr.author_name,
                "state": mr.state.value if hasattr(mr.state, 'value') else mr.state,
                "created_at_gitlab": mr.created_at_gitlab.isoformat() if mr.created_at_gitlab else None,
                "updated_at_gitlab": mr.updated_at_gitlab.isoformat() if mr.updated_at_gitlab else None,
                "merged_at": mr.merged_at.isoformat() if mr.merged_at else None,
                "approved": mr.approved,
                "project": mr.project.name if mr.project else None,
                "user_notes_count": mr.user_notes_count or 0
            })
    
    return unique_mrs


@router.get("/developer/{developer_id}/comments")
def get_developer_comments(
    developer_id: int,
    project_id:   Any           = Query(None, description="ID du projet ou None pour global"),
    lot_id:       Optional[int] = Query(None, description="Filtrer par session d'extraction"),
    period_id:    Optional[int] = Query(None, description="Filtrer par période spécifique"),
    db:           Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Retourne la liste des commentaires faits par un développeur.
    """
    from app.models.period import Period
    
    if project_id in ("all", "0", 0, ""):
        p_id = None
    else:
        try:
            p_id = int(project_id)
        except (ValueError, TypeError):
            p_id = None
    
    # Query comments by developer
    comments_query = db.query(Comment).filter(Comment.developer_id == developer_id)
    
    # Join with MergeRequest to get MR details and apply filters
    comments_query = comments_query.join(MergeRequest, Comment.merge_request_id == MergeRequest.id)
    
    if p_id: comments_query = comments_query.filter(MergeRequest.project_id == p_id)
    if lot_id: comments_query = comments_query.filter(MergeRequest.extraction_lot_id == lot_id)
    
    if period_id:
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            comments_query = comments_query.filter(
                MergeRequest.created_at_gitlab >= period.start_date,
                MergeRequest.created_at_gitlab <= period.end_date
            )
    
    comments = comments_query.order_by(Comment.created_at.desc()).all()
    
    # Format response
    comments_list = []
    for comment in comments:
        comments_list.append({
            "id": comment.id,
            "body": comment.body,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
            "merge_request_id": comment.merge_request_id,
            "mr_title": comment.merge_request.title if comment.merge_request else None,
            "mr_gitlab_id": comment.merge_request.gitlab_mr_id if comment.merge_request else None,
            "mr_author": comment.merge_request.author_name if comment.merge_request else None,
            "mr_state": comment.merge_request.state.value if hasattr(comment.merge_request.state, 'value') else comment.merge_request.state if comment.merge_request else None,
            "project": comment.merge_request.project.name if comment.merge_request.project else None
        })
    
    return comments_list


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
    current_user: AppUser     = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    service = AnalyticsService(db)
    
    # Enforce site-based access control for site_manager
    if current_user.is_site_manager:
        if site_id is None:
            site_id = current_user.site_id
        elif site_id != current_user.site_id:
            raise _http_error(
                403, 
                "FORBIDDEN", 
                f"Accès au site {site_id} refusé. Vous gérez uniquement le site {current_user.site_id}."
            )
    
    if project_id == 0:
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
            site_snapshots = service.get_site_comparison_global(period.id, site_id=site_id)
            
            snapshots_data = []
            for snap in site_snapshots:
                snapshots_data.append({
                    "snapshot_id":            None, 
                    "site_id":               snap.site_id,
                    "site_name":             getattr(snap, "site_name", f"Site {snap.site_id}"),
                    "total_commits":         snap.total_commits,
                    "nb_commits_per_project": snap.total_commits,
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

    period_ids_query = (
        db.query(KpiSnapshot.period_id)
        .filter(KpiSnapshot.project_id == project_id)
        .filter(KpiSnapshot.developer_id.is_(None))
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
            
            nb_devs = dev_repo.count_active_for_period(
                db, project_id, period.id, site_id=snap.site_id
            )
            
            commit_rate = round(float(snap.total_commits or 0) / nb_devs, 2) if nb_devs > 0 else 0.0
            mr_rate     = round(float(snap.total_mrs_created or 0) / nb_devs, 2) if nb_devs > 0 else 0.0

            snapshots_data.append({
                "snapshot_id":                snap.id,
                "site_id":                    snap.site_id,
                "site_name":                  site_name or "Global",
                "mr_rate_per_site":           mr_rate,
                "approved_mr_rate":           snap.approved_mr_rate,
                "merged_mr_rate":             snap.merged_mr_rate,
                "commit_rate_per_site":       commit_rate,
                "nb_commits_per_project":     snap.nb_commits_per_project,
                "avg_review_time_hours":      snap.avg_review_time_hours,
                "nb_developers":              nb_devs,
                "total_mrs_created":          snap.total_mrs_created,
                "total_commits":              snap.total_commits,
                "delta_mr_rate":              snap.delta_mr_rate,
                "delta_approved_mr_rate":     snap.delta_approved_mr_rate,
                "delta_merged_mr_rate":       snap.delta_merged_mr_rate,
                "delta_commit_rate":          snap.delta_commit_rate,
                "delta_avg_review_time":      snap.delta_avg_review_time,
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
                f"kpi_field '{kpi_field}' invalide.",
            )

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
        db.query(
            Period.id,
            Period.year,
            Period.month,
            Period.status,
            Period.closed_at,
            Period.closed_by_id,
            Period.headcount_snapshot,
            Period.created_at,
            Period.updated_at
        )
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
    ps_repo = ProjectSiteRepository()
    explicit_ids   = ps_repo.get_site_ids_for_project(db, project_id)
    discovered_ids = ps_repo.get_discovered_site_ids(db, project_id)
    all_site_ids   = list(set(explicit_ids) | set(discovered_ids))

    # Filter sites for site_manager - only show their assigned sites
    if current_user.is_site_manager:
        # ✅ ARCHITECTURE MULTI-TENANT: Charger les assignations depuis tenant
        from app.repositories.user_site_access_repository import UserSiteAccessRepository
        site_access_repo = UserSiteAccessRepository()
        
        # Charger les assignations de sites depuis tenant
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Fallback vers l'ancien système single site
        if current_user.site_id:
            accessible_site_ids.append(current_user.site_id)
        
        # Filtrer pour ne garder que les sites accessibles
        all_site_ids = [sid for sid in all_site_ids if sid in accessible_site_ids]
    
    # ✅ FIX: Filter sites for viewer - only show their assigned sites
    if current_user.role == 'viewer':
        from app.repositories.user_site_access_repository import UserSiteAccessRepository
        site_access_repo = UserSiteAccessRepository()
        
        # Charger les assignations de sites depuis tenant
        accessible_site_ids = [access.site_id for access in site_access_repo.get_by_user_id(db, _get_tenant_user_id(db, current_user))]
        
        # Filtrer pour ne garder que les sites accessibles
        if accessible_site_ids:
            all_site_ids = [sid for sid in all_site_ids if sid in accessible_site_ids]
        else:
            # Si aucun site assigné, retourner une liste vide
            all_site_ids = []

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
    current_user: AppUser     = Depends(get_current_user),
):
    service = AnalyticsService(db)
    
    # Enforce site-based access control for site_manager
    if current_user.is_site_manager:
        # Site managers can only see their own site, not compare multiple sites
        # Redirect to single-site view
        if period_id is None:
            latest_snap = db.query(KpiSnapshot).filter(
                KpiSnapshot.site_id == current_user.site_id
            ).order_by(KpiSnapshot.snapshot_date.desc()).first()
            if not latest_snap:
                return []
            period_id = latest_snap.period_id
        
        # Return only their site's data
        if project_id == 0:
            return service.get_site_comparison_global(period_id, kpi_field, current_user.site_id)
        else:
            snapshots = snapshot_repo.get_site_comparison(
                db=db, project_id=project_id, period_id=period_id, kpi_field=kpi_field
            )
            # Filter to only show their site
            filtered = [s for s in snapshots if s.site_id == current_user.site_id]
            for snap in filtered:
                if snap.site_id:
                    site_obj = db.query(Site).filter(Site.id == snap.site_id).first()
                    snap.site_name = site_obj.name if site_obj else f"Site {snap.site_id}"
            return filtered

    if lot_id:
        return service.get_site_comparison_for_lot(project_id, lot_id, kpi_field)

    if project_id == 0:
        if period_id is None:
            latest_snap = db.query(KpiSnapshot).order_by(KpiSnapshot.snapshot_date.desc()).first()
            if not latest_snap:
                return []
            period_id = latest_snap.period_id
        return service.get_site_comparison_global(period_id, kpi_field)

    if period_id is None:
        snap = db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id
        ).order_by(KpiSnapshot.snapshot_date.desc()).first()
        if not snap:
            return []
        period_id = snap.period_id

    snapshots = snapshot_repo.get_site_comparison(
        db=db, project_id=project_id, period_id=period_id, kpi_field=kpi_field
    )
    if not snapshots:
        snapshots = db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.period_id    == period_id,
            KpiSnapshot.site_id.is_(None),
            KpiSnapshot.developer_id.is_(None),
        ).all()

    for snap in snapshots:
        if snap.site_id:
            site_obj = db.query(Site).filter(Site.id == snap.site_id).first()
            snap.site_name = site_obj.name if site_obj else f"Site {snap.site_id}"
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
    if lot_id:
        lb = service.get_leaderboard(project_id, 0, site_id=site_id, limit=limit, lot_id=lot_id)
        results = []
        for entry in lb["entries"]:
            results.append(KpiSnapshot(
                project_id=project_id, developer_id=entry["developer_id"],
                total_commits=entry["commit_count"], total_mrs_created=entry["mr_count"],
                developer_score=entry["developer_score"], site_id=site_id
            ))
        for snap in results:
            dev_obj = db.query(Developer).filter(Developer.id == snap.developer_id).first()
            snap.developer_name = dev_obj.name if dev_obj else f"Dev {snap.developer_id}"
        return results

    if period_id is None:
        snap = db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id   == project_id,
            KpiSnapshot.developer_id.isnot(None),
        ).order_by(KpiSnapshot.snapshot_date.desc()).first()
        if not snap: return []
        period_id = snap.period_id

    snapshots = snapshot_repo.get_developers_ranking(
        db=db, project_id=project_id, period_id=period_id,
        kpi_field=kpi_field, site_id=site_id, limit=limit, ascending=ascending,
    )
    for snap in snapshots:
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
    if period_id is not None:
        period = period_repo.get_by_id(db, period_id)
    else:
        latest = db.query(KpiSnapshot).filter(KpiSnapshot.project_id == project_id).order_by(KpiSnapshot.snapshot_date.desc()).first()
        if not latest: return []
        period = period_repo.get_by_id(db, latest.period_id)

    if not period: return []

    start_date = datetime(period.year, period.month, 1)
    end_date   = datetime(period.year + 1, 1, 1) if period.month == 12 else datetime(period.year, period.month + 1, 1)

    ps_repo = ProjectSiteRepository()
    all_site_ids = list(set(ps_repo.get_site_ids_for_project(db, project_id)) | set(ps_repo.get_discovered_site_ids(db, project_id)))
    calculator = KpiCalculator(db)

    def _df_level(c):
        if c >= 30: return "Elite"
        if c >= 4:  return "High"
        if c >= 1:  return "Medium"
        return "Low"

    def _lt_level(h):
        if h == 0: return "N/A"
        if h < 1:  return "Elite"
        if h < 24: return "High"
        if h < 168: return "Medium"
        return "Low"

    try:
        results = []
        total_dep = calculator._count_deployments(project_id, start_date, end_date, None, None, None)
        total_lead = calculator._avg_lead_time(project_id, start_date, end_date, None, None, None)
        
        sum_site_deps = 0
        for sid in all_site_ids:
            site_obj = db.query(Site).filter(Site.id == sid).first()
            if not site_obj: continue
            dep_count = calculator._count_deployments(project_id, start_date, end_date, sid, None, None)
            lead_time = calculator._avg_lead_time(project_id, start_date, end_date, sid, None, None)
            sum_site_deps += dep_count
            results.append({
                "site_id": sid, "site_name": site_obj.name, "deployment_count": dep_count,
                "lead_time_hours": lead_time, "dora_df_level": _df_level(dep_count),
                "dora_lt_level": _lt_level(lead_time),
                "period_label": f"{MOIS_FR_LONG.get(period.month, '')} {period.year}"
            })

        unassigned = total_dep - sum_site_deps
        if unassigned > 0:
            results.append({
                "site_id": -1, "site_name": "Autres", "deployment_count": unassigned,
                "lead_time_hours": total_lead, "dora_df_level": _df_level(unassigned),
                "dora_lt_level": _lt_level(total_lead), "is_unassigned": True,
                "period_label": f"{MOIS_FR_LONG.get(period.month, '')} {period.year}"
            })

        return sorted(results, key=lambda x: x["deployment_count"], reverse=True)
    except Exception as e:
        logger.error(f"[DORA ERROR] project_id={project_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"DORA Error: {str(e)}")


# ── RECALCUL DYNAMIQUE (SENIOR ADMIN) ──────────────────────────────────────────

@router.post("/recalculate", summary="Force le recalcul des KPIs pour une période donnée")
def recalculate_kpis(
    year:  int     = Query(..., description="Année (ex: 2026)"),
    month: int     = Query(..., description="Mois (1-12)"),
    db:    Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    [SENIOR] Force la réconciliation dynamique des données pour une période.
    Utile après une correction de site ou de projet dans le profil d'un développeur (Cas A).
    """
    if not current_user.is_superuser:
        raise _http_error(403, "FORBIDDEN", "Seul un administrateur peut forcer le recalcul.")

    period = period_repo.get_by_year_month(db, year, month)
    if not period:
        raise _http_error(404, "PERIOD_NOT_FOUND", f"Période {year}/{month:02d} non trouvée.")

    from app.services.kpi.kpi_aggregator import KpiAggregator
    aggregator = KpiAggregator(db)
    
    try:
        aggregator.recalculate_period(period.id)
        return {"status": "success", "message": f"Recalcul lancé pour {year}/{month:02d}"}
    except Exception as e:
        logger.error(f"[RECALCULATE ERROR] {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur lors du recalcul: {str(e)}")