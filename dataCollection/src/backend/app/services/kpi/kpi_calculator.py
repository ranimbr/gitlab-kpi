"""
services/kpi/kpi_calculator.py

CORRECTIONS :
──────────────────────────────────────────────────────────────────
1. FIX SAWarning — Subquery dans .in_() :
   _validated_dev_ids() retournait un Subquery SQLAlchemy 1.x.
   SQLAlchemy 1.4+ exige un select() explicite dans .in_().
   → Retourne désormais la Query brute.
   → Chaque appelant appelle .subquery() au moment du .in_().

2. FIX commits=0 / devs=0 après extraction :
   Les développeurs créés automatiquement par ExtractionService
   ont is_validated=False par défaut → exclus du calcul KPI.
   → Suppression du filtre is_validated dans _validated_dev_ids()
     et _count_developers() pour les snapshots REALTIME.
   → Remplacement par is_active=True uniquement (les bots restent exclus).
   Note : l'admin peut toujours rejeter manuellement un dev via PATCH /validate.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.commit import Commit
from app.models.developer import Developer
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.merge_request import MergeRequest


class KpiCalculator:

    def __init__(self, db: Session):
        self.db = db

    # =========================================================================
    # POINTS D'ENTRÉE PUBLICS
    # =========================================================================

    def calculate_for_site(self, project_id, site_id, start_date, end_date) -> dict:
        return self.calculate_project_kpis(project_id, start_date, end_date, site_id=site_id)

    def calculate_global(self, project_id, start_date, end_date) -> dict:
        return self.calculate_project_kpis(project_id, start_date, end_date)

    def calculate_for_developer(self, project_id, developer_id, start_date, end_date) -> dict:
        return self.calculate_project_kpis(
            project_id, start_date, end_date, developer_id=developer_id
        )

    def calculate_developer_score(self, kpis: dict, weights: Optional[dict] = None) -> float:
        """
        Score composite développeur normalisé (0.0 → 1.0).
        Stocké dans KpiSnapshot.developer_score.

        Formule pondérée :
          - commit_rate  (25%) : normalisé sur 10 commits/dev
          - mr_rate      (25%) : normalisé sur 5 MRs/dev
          - approved_rate(30%) : taux d'approbation (déjà 0-1)
          - review_time  (20%) : score inverse — moins de temps = meilleur score
        """
        if weights is None:
            weights = {
                "commit_rate":   0.25,
                "mr_rate":       0.25,
                "approved_rate": 0.30,
                "review_time":   0.20,
            }

        commit_rate   = min(kpis.get("commit_rate_per_site", 0.0) / 10.0, 1.0)
        mr_rate       = min(kpis.get("mr_rate_per_site",    0.0) / 5.0,  1.0)
        approved_rate = min(kpis.get("approved_mr_rate",    0.0),         1.0)
        avg_review    = kpis.get("avg_review_time_hours", 0.0)
        # Score inversement proportionnel au temps de review
        # 0h → score=1.0 | 24h → score=0.5 | 72h → score=0.25
        review_score  = 1.0 / (1.0 + avg_review / 24.0) if avg_review >= 0 else 0.0

        score = (
            weights["commit_rate"]   * commit_rate   +
            weights["mr_rate"]       * mr_rate        +
            weights["approved_rate"] * approved_rate  +
            weights["review_time"]   * review_score
        )
        return round(max(0.0, min(1.0, score)), 4)

    # =========================================================================
    # CALCUL CENTRAL
    # =========================================================================

    def calculate_project_kpis(
        self,
        project_id:   int,
        start_date:   datetime,
        end_date:     datetime,
        site_id:      Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> dict:

        nb_commits_project = self._count_all_project_commits(project_id, start_date, end_date)
        nb_devs            = self._count_developers(project_id, site_id, developer_id)
        nb_commits_devs    = self._count_commits_by_devs(project_id, start_date, end_date, site_id, developer_id)
        nb_mrs             = self._count_mrs(project_id, start_date, end_date, site_id, developer_id)
        nb_mrs_approved    = self._count_approved_mrs(project_id, start_date, end_date, site_id, developer_id)
        nb_mrs_merged      = self._count_merged_mrs(project_id, start_date, end_date, site_id, developer_id)
        sum_review_time    = self._sum_review_time(project_id, start_date, end_date, site_id, developer_id)

        denom = max(nb_devs, 1)

        mr_rate_per_site      = round(nb_mrs / denom, 4)
        approved_mr_rate      = round(nb_mrs_approved / nb_mrs, 4)         if nb_mrs > 0          else 0.0
        merged_mr_rate        = round(nb_mrs_merged / nb_mrs_approved, 4)  if nb_mrs_approved > 0 else 0.0
        commit_rate_per_site  = round(nb_commits_devs / denom, 4)
        avg_review_time_hours = round(sum_review_time / nb_mrs_approved, 2) if nb_mrs_approved > 0 else 0.0

        kpis = {
            "mr_rate_per_site":        mr_rate_per_site,
            "approved_mr_rate":        approved_mr_rate,
            "merged_mr_rate":          merged_mr_rate,
            "commit_rate_per_site":    commit_rate_per_site,
            "nb_commits_per_project":  nb_commits_project,
            "avg_review_time_hours":   avg_review_time_hours,
            "nb_developers":           nb_devs,
            "total_commits":           nb_commits_devs,
            "total_mrs_created":       nb_mrs,
            "total_mrs_approved":      nb_mrs_approved,
            "total_mrs_merged":        nb_mrs_merged,
            "review_time_hours":       round(sum_review_time, 2),
            "site_id":                 site_id,
            "developer_id":            developer_id,
            "project_id":              project_id,
            "period_start":            start_date.isoformat(),
            "period_end":              end_date.isoformat(),
        }

        # Score individuel uniquement pour les snapshots développeur
        if developer_id is not None:
            kpis["developer_score"] = self.calculate_developer_score(kpis)

        return kpis

    # =========================================================================
    # HELPERS INTERNES
    # =========================================================================

    def _active_dev_ids_query(self, project_id: int, site_id: Optional[int], developer_id: Optional[int]):
        """
        Retourne une Query SQLAlchemy (pas encore executée) des developer_ids actifs
        pour le contexte donné.

        ✅ FIX SAWarning : retourne la Query brute — l'appelant appelle .subquery()
        au moment du .in_() pour éviter le warning SQLAlchemy 1.4+
        "Coercing Subquery object into a select() for use in IN()".

        ✅ FIX commits=0 : filtre sur is_active + is_bot uniquement.
        is_validated n'est PAS filtré ici — les devs auto-créés par ExtractionService
        sont actifs mais non validés. Les exclure ici viderait tous les snapshots
        REALTIME. L'admin valide/rejette manuellement après extraction.

        Filtre appliqué :
          - Appartient au projet via DeveloperProject (M2M, is_active=True)
          - is_active = True  (dev non archivé)
          - is_bot   = False  (bots exclus des KPIs — toujours)
          - Si site_id fourni  : filtre via DeveloperSite (M2M)
          - Si developer_id fourni : filtre direct sur Developer.id
        """
        q = (
            self.db.query(Developer.id)
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id   == project_id)   &
                (DeveloperProject.is_active.is_(True)),
            )
            .filter(
                Developer.is_active.is_(True),
                Developer.is_bot.is_(False),
            )
        )

        # JOIN DeveloperSite uniquement si site_id fourni ET pas de filtre individuel
        if site_id is not None and developer_id is None:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id) &
                (DeveloperSite.site_id      == site_id),
            )

        if developer_id is not None:
            q = q.filter(Developer.id == developer_id)

        return q  # ✅ Query brute — PAS .subquery() ici

    def _count_developers(self, project_id: int, site_id: Optional[int], developer_id: Optional[int]) -> int:
        """
        COUNT des développeurs actifs pour le contexte donné.

        ✅ FIX commits=0 : même logique que _active_dev_ids_query —
        is_validated retiré du filtre.
        """
        if developer_id is not None:
            exists = (
                self.db.query(Developer.id)
                .join(
                    DeveloperProject,
                    (DeveloperProject.developer_id == Developer.id) &
                    (DeveloperProject.project_id   == project_id)   &
                    (DeveloperProject.is_active.is_(True)),
                )
                .filter(
                    Developer.id           == developer_id,
                    Developer.is_active.is_(True),
                    Developer.is_bot.is_(False),
                )
                .first()
            )
            return 1 if exists else 0

        q = (
            self.db.query(func.count(Developer.id))
            .join(
                DeveloperProject,
                (DeveloperProject.developer_id == Developer.id) &
                (DeveloperProject.project_id   == project_id)   &
                (DeveloperProject.is_active.is_(True)),
            )
            .filter(
                Developer.is_active.is_(True),
                Developer.is_bot.is_(False),
            )
        )
        if site_id is not None:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id) &
                (DeveloperSite.site_id      == site_id),
            )
        return q.scalar() or 0

    def _count_all_project_commits(self, project_id: int, start_date: datetime, end_date: datetime) -> int:
        """KPI #6 : tous commits du projet, hors merges automatiques."""
        return (
            self.db.query(func.count(Commit.id))
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
                Commit.is_merge_commit.is_(False),
            )
            .scalar() or 0
        )

    def _count_commits_by_devs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        """KPI #5 : commits des devs actifs, hors merges automatiques."""
        # ✅ FIX SAWarning : .subquery() appelé ici, pas dans _active_dev_ids_query
        valid_ids = self._active_dev_ids_query(project_id, site_id, developer_id).subquery()
        return (
            self.db.query(func.count(Commit.id))
            .filter(
                Commit.project_id          == project_id,
                Commit.authored_date       >= start_date,
                Commit.authored_date       <  end_date,
                Commit.is_merge_commit.is_(False),
                Commit.developer_id.in_(select(valid_ids)),
            )
            .scalar() or 0
        )

    def _count_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        """KPI #1 : MRs non-draft créées par des devs actifs."""
        valid_ids = self._active_dev_ids_query(project_id, site_id, developer_id).subquery()
        return (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.developer_id.in_(select(valid_ids)),
            )
            .scalar() or 0
        )

    def _count_approved_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        """KPI #3 : MRs approuvées."""
        valid_ids = self._active_dev_ids_query(project_id, site_id, developer_id).subquery()
        return (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.approved.is_(True),
                MergeRequest.developer_id.in_(select(valid_ids)),
            )
            .scalar() or 0
        )

    def _count_merged_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        """KPI #4 : MRs mergées."""
        valid_ids = self._active_dev_ids_query(project_id, site_id, developer_id).subquery()
        return (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.merged_at.isnot(None),
                MergeRequest.developer_id.in_(select(valid_ids)),
            )
            .scalar() or 0
        )

    def _sum_review_time(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], developer_id: Optional[int],
    ) -> float:
        """KPI #7 : somme des temps de review (MRs approuvées)."""
        valid_ids = self._active_dev_ids_query(project_id, site_id, developer_id).subquery()
        result = (
            self.db.query(func.sum(MergeRequest.review_time_hours))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.review_time_hours.isnot(None),
                MergeRequest.developer_id.in_(select(valid_ids)),
            )
            .scalar()
        )
        return float(result or 0.0)