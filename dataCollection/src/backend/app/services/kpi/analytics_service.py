"""
services/kpi/analytics_service.py

CORRECTIONS (modèles mis à jour) :
─────────────────────────────────────
1. get_dashboard_summary() : group_id et developer_id dans le dict.
2. AJOUT get_developer_kpi_summary() : vue KPI individuelle.
3. AJOUT get_leaderboard() : classement des développeurs d'un site.
"""
import logging
from datetime import date
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.developer import Developer
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.kpi_snapshot import KpiSnapshot
from app.repositories.developer_repository import DeveloperRepository
from app.repositories.kpi_snapshot_repository import KpiSnapshotRepository
from app.repositories.period_repository import PeriodRepository

logger = logging.getLogger(__name__)

_MOIS_FR = {
    1: "Janvier", 2: "Février",  3: "Mars",     4: "Avril",
    5: "Mai",     6: "Juin",     7: "Juillet",  8: "Août",
    9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre",
}


class AnalyticsService:

    def __init__(self, db: Session):
        self.db            = db
        self.snapshot_repo = KpiSnapshotRepository()
        self.dev_repo      = DeveloperRepository()
        self.period_repo   = PeriodRepository()

    def get_latest_kpis(self, project_id, site_id=None, group_id=None, developer_id=None):
        return self.snapshot_repo.get_latest(
            self.db, project_id, site_id=site_id, group_id=group_id, developer_id=developer_id
        )

    def get_kpi_history(
        self, project_id, site_id=None, group_id=None, developer_id=None,
        start_date=None, end_date=None,
    ) -> List[KpiSnapshot]:
        return self.snapshot_repo.get_project_history(
            db=self.db, project_id=project_id, site_id=site_id,
            group_id=group_id, developer_id=developer_id,
            start_date=start_date, end_date=end_date,
        )

    def get_dashboard_summary(
        self,
        project_id:   int,
        site_id:      Optional[int] = None,
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> Dict:
        latest  = self.get_latest_kpis(project_id, site_id, group_id, developer_id)
        history = self.get_kpi_history(project_id, site_id, group_id, developer_id)

        period_label: Optional[str] = None
        if latest and latest.snapshot_date:
            mois         = _MOIS_FR.get(latest.snapshot_date.month, "")
            period_label = f"{mois} {latest.snapshot_date.year}"

        return {
            "latest_metrics":  latest,
            "history":         history,
            "total_snapshots": len(history),
            "project_id":      project_id,
            "site_id":         site_id,
            "group_id":        group_id,
            "developer_id":    developer_id,
            "period_label":    period_label,
        }

    def get_developer_kpi_summary(
        self,
        developer_id: int,
        project_id:   int,
        period_id:    Optional[int] = None,
    ) -> Dict:
        """
        ✅ AJOUT : vue KPI individuelle pour la page profil développeur.
        """
        developer = self.dev_repo.get_by_id(self.db, developer_id)
        if not developer:
            return {}

        # Dernier snapshot individuel
        snapshot = self.snapshot_repo.get_latest(
            self.db, project_id, developer_id=developer_id
        )

        # Site primaire du développeur
        primary_site = (
            self.db.query(DeveloperSite)
            .filter(DeveloperSite.developer_id == developer_id, DeveloperSite.is_primary.is_(True))
            .first()
        )

        period_label = None
        if snapshot and snapshot.snapshot_date:
            mois         = _MOIS_FR.get(snapshot.snapshot_date.month, "")
            period_label = f"{mois} {snapshot.snapshot_date.year}"

        return {
            "developer_id":       developer_id,
            "developer_name":     developer.name,
            "gitlab_username":    developer.gitlab_username,
            "avatar_url":         developer.avatar_url,
            "primary_site_id":    primary_site.site_id if primary_site else None,
            "snapshot":           snapshot,
            "period_label":       period_label or "—",
            "developer_score":    snapshot.developer_score      if snapshot else None,
            "score_rank_in_site": snapshot.score_rank_in_site   if snapshot else None,
            "last_active_at":     developer.last_active_at,
            "is_active_this_month": snapshot is not None and snapshot.total_commits > 0,
        }

    def get_leaderboard(
        self,
        project_id: int,
        period_id:  int,
        site_id:    Optional[int] = None,
        limit:      int = 20,
    ) -> Dict:
        """
        ✅ AJOUT : leaderboard des développeurs d'un site.
        Retourné par GET /kpis/leaderboard.
        """
        snapshots = self.snapshot_repo.get_developers_ranking(
            db=self.db, project_id=project_id, period_id=period_id,
            kpi_field="developer_score", site_id=site_id, limit=limit,
        )

        period = self.period_repo.get_by_id(self.db, period_id)
        period_label = "—"
        if period:
            mois         = _MOIS_FR.get(period.month, "")
            period_label = f"{mois} {period.year}"

        entries = []
        for rank, snap in enumerate(snapshots, start=1):
            dev = self.dev_repo.get_by_id(self.db, snap.developer_id) if snap.developer_id else None
            # Compute approved_rate as a ratio (0-1) for the frontend
            approved_rate = None
            if snap.total_mrs_created and snap.total_mrs_created > 0:
                approved_rate = snap.total_mrs_approved / snap.total_mrs_created
            entries.append({
                "rank":                  rank,
                "developer_id":          snap.developer_id,
                "developer_name":        dev.name             if dev else "—",
                "gitlab_username":       dev.gitlab_username  if dev else None,
                "avatar_url":            dev.avatar_url       if dev else None,
                "commit_count":          snap.total_commits,
                "mr_count":              snap.total_mrs_created,
                "approved_mr_count":     snap.total_mrs_approved,
                "approved_rate":         approved_rate,
                "avg_review_time_hours": snap.avg_review_time_hours,
                "avg_review_hours":      snap.avg_review_time_hours,
                "developer_score":       snap.developer_score,
                "score_delta":           snap.delta_commit_rate,
                "rank_delta":            None,
            })

        return {
            "site_id":      site_id,
            "period_label": period_label,
            "total_devs":   len(entries),
            "entries":      entries,
        }