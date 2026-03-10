# services/kpi/kpi_calculator.py
from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commit import Commit
from app.models.developer import Developer
from app.models.merge_request import MergeRequest


class KpiCalculator:
    """
    Calcule les 7 KPIs définis dans la spécification pour un projet,
    une plage de dates et optionnellement un site.

    KPI #1  mr_rate_per_site       = MRs non-draft / nb_développeurs réels
    KPI #2  approved_mr_rate       = MRs approuvées / MRs non-draft créées
    KPI #3  merged_mr_rate         = MRs mergées / MRs APPROUVÉES (spec encadrant)
    KPI #4  commit_rate_per_site   = commits / nb_développeurs réels
    KPI #5  nb_commits_per_project = total commits du projet sur la période
    KPI #6  avg_review_time_hours  = Σ(approved_at - created_at) / nb approuvées

    ✅ CORRECTION POINT 7 — Filtre gitlab_user_id > 0 appliqué partout
    Les IDs synthétiques négatifs (auteurs externes sans compte GitLab)
    sont exclus du comptage des développeurs pour ne pas fausser les KPIs.
    """

    def __init__(self, db: Session):
        self.db = db

    # ─── Public API ───────────────────────────────────────────────────────────

    def calculate_for_site(
        self,
        project_id: int,
        site:       str,
        start_date: datetime,
        end_date:   datetime,
    ) -> dict:
        return self.calculate_project_kpis(project_id, start_date, end_date, site)

    def calculate_global(
        self,
        project_id: int,
        start_date: datetime,
        end_date:   datetime,
    ) -> dict:
        return self.calculate_project_kpis(project_id, start_date, end_date, site=None)

    # ─── Core ─────────────────────────────────────────────────────────────────

    def calculate_project_kpis(
        self,
        project_id: int,
        start_date: datetime,
        end_date:   datetime,
        site:       str | None = None,
    ) -> dict:

        nb_devs         = self._count_developers(project_id, site)
        nb_commits      = self._count_commits(project_id, start_date, end_date, site)
        nb_mrs          = self._count_mrs(project_id, start_date, end_date, site)
        nb_mrs_approved = self._count_approved_mrs(project_id, start_date, end_date, site)
        nb_mrs_merged   = self._count_merged_mrs(project_id, start_date, end_date, site)

        # KPI #2 — Approved MR Rate = approuvées / créées
        approved_rate = (
            round(nb_mrs_approved / nb_mrs, 4) if nb_mrs > 0 else 0.0
        )

        # KPI #3 — Merged MR Rate = mergées / APPROUVÉES (spec encadrant)
        merged_rate = (
            round(nb_mrs_merged / nb_mrs_approved, 4) if nb_mrs_approved > 0 else 0.0
        )

        avg_review_time = self._average_review_time(project_id, start_date, end_date, site)
        denom = max(nb_devs, 1)

        return {
            # KPI #1
            "mr_rate_per_site":        round(nb_mrs / denom, 4),
            # KPI #2
            "approved_mr_rate":        approved_rate,
            # KPI #3
            "merged_mr_rate":          merged_rate,
            # KPI #4
            "commit_rate_per_site":    round(nb_commits / denom, 4),
            # KPI #5
            "nb_commits_per_project":  nb_commits,
            # KPI #6
            "avg_review_time_hours":   round(avg_review_time, 2),

            # Compteurs bruts
            "nb_developers":      nb_devs,
            "total_commits":      nb_commits,
            "total_mrs_created":  nb_mrs,
            "total_mrs_approved": nb_mrs_approved,
            "total_mrs_merged":   nb_mrs_merged,

            # Métadonnées pour KpiAggregator
            "site":         site,
            "project_id":   project_id,
            "period_start": start_date.isoformat(),
            "period_end":   end_date.isoformat(),
        }

    # ─── Private helpers ──────────────────────────────────────────────────────

    def _count_developers(self, project_id: int, site: str | None) -> int:
        """
        ✅ CORRECTION POINT 7 — gitlab_user_id > 0 exclut les développeurs
        synthétiques (IDs négatifs générés pour les auteurs externes sans
        compte GitLab). Sans ce filtre, les KPIs /site seraient faussés.
        """
        q = (
            self.db.query(func.count(Developer.id))
            .filter(
                Developer.project_id     == project_id,
                Developer.gitlab_user_id >  0,   # ✅ exclusion IDs synthétiques
            )
        )
        if site:
            # ✅ CORRECTION POINT 1 — site est sur DeveloperGroup, pas Developer
            # On joint DeveloperGroup pour filtrer par site
            from app.models.developer_group import DeveloperGroup
            q = (
                q.join(DeveloperGroup, Developer.group_id == DeveloperGroup.id, isouter=True)
                .filter(DeveloperGroup.site == site)
            )
        return q.scalar() or 0

    def _count_commits(
        self,
        project_id: int,
        start_date: datetime,
        end_date:   datetime,
        site:       str | None,
    ) -> int:
        q = (
            self.db.query(func.count(Commit.id))
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
            )
        )
        if site:
            from app.models.developer_group import DeveloperGroup
            q = (
                q.join(Developer, Commit.developer_id == Developer.id, isouter=True)
                .join(DeveloperGroup, Developer.group_id == DeveloperGroup.id, isouter=True)
                .filter(DeveloperGroup.site == site)
            )
        return q.scalar() or 0

    def _count_mrs(
        self,
        project_id: int,
        start_date: datetime,
        end_date:   datetime,
        site:       str | None,
    ) -> int:
        q = (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
            )
        )
        if site:
            from app.models.developer_group import DeveloperGroup
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id, isouter=True)
                .join(DeveloperGroup, Developer.group_id == DeveloperGroup.id, isouter=True)
                .filter(DeveloperGroup.site == site)
            )
        return q.scalar() or 0

    def _count_approved_mrs(
        self,
        project_id: int,
        start_date: datetime,
        end_date:   datetime,
        site:       str | None,
    ) -> int:
        q = (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.approved_at.isnot(None),
            )
        )
        if site:
            from app.models.developer_group import DeveloperGroup
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id, isouter=True)
                .join(DeveloperGroup, Developer.group_id == DeveloperGroup.id, isouter=True)
                .filter(DeveloperGroup.site == site)
            )
        return q.scalar() or 0

    def _count_merged_mrs(
        self,
        project_id: int,
        start_date: datetime,
        end_date:   datetime,
        site:       str | None,
    ) -> int:
        q = (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.merged_at.isnot(None),
            )
        )
        if site:
            from app.models.developer_group import DeveloperGroup
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id, isouter=True)
                .join(DeveloperGroup, Developer.group_id == DeveloperGroup.id, isouter=True)
                .filter(DeveloperGroup.site == site)
            )
        return q.scalar() or 0

    def _average_review_time(
        self,
        project_id: int,
        start_date: datetime,
        end_date:   datetime,
        site:       str | None,
    ) -> float:
        q = (
            self.db.query(
                func.avg(
                    func.extract(
                        "epoch",
                        MergeRequest.approved_at - MergeRequest.created_at_gitlab,
                    )
                )
            )
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.approved_at.isnot(None),
            )
        )
        if site:
            from app.models.developer_group import DeveloperGroup
            q = (
                q.join(Developer, MergeRequest.developer_id == Developer.id, isouter=True)
                .join(DeveloperGroup, Developer.group_id == DeveloperGroup.id, isouter=True)
                .filter(DeveloperGroup.site == site)
            )

        result = q.scalar()
        return round((result or 0) / 3600, 2)