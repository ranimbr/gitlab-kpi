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
   e t _count_developers() pour les snapshots REALTIME.
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
from app.models.comment import Comment
from app.models.developer_group import developer_group_link


class KpiCalculator:

    # [SENIOR] Seuils de normalisation configurables au niveau de la classe.
    # Ajustez ces valeurs selon le rythme réel de votre équipe.
    # Exemple équipe active : COMMIT_NORMALIZATION = 20, MR_NORMALIZATION = 8
    COMMIT_NORMALIZATION = 10.0   # commits/mois → score_commit = 1.0
    MR_NORMALIZATION     = 5.0    # MRs/mois     → score_mr = 1.0
    REVIEW_REF_HOURS     = 24.0   # heures → score_review = 0.5 (point d'inflexion)

    def __init__(self, db: Session):
        self.db = db

    # =========================================================================
    # POINTS D'ENTRÉE PUBLICS
    # =========================================================================

    def calculate_for_site(self, project_id, site_id, start_date, end_date) -> dict:
        return self.calculate_project_kpis(project_id, start_date, end_date, site_id=site_id)

    def calculate_for_group(self, project_id, group_id, start_date, end_date) -> dict:
        return self.calculate_project_kpis(project_id, start_date, end_date, group_id=group_id)

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
          - commit_rate  (25%) : normalisé sur COMMIT_NORMALIZATION commits/mois
          - mr_rate      (25%) : normalisé sur MR_NORMALIZATION MRs/mois
          - approved_rate(30%) : taux d'approbation (déjà entre 0 et 1)
          - review_time  (20%) : score inverse sigmoïde — moins de temps = meilleur score
                                  score = 1 / (1 + h / REVIEW_REF_HOURS)
                                  → 0h=1.0 | 24h=0.5 | 72h=0.25

        [SENIOR] Les seuils de normalisation sont des constantes de classe.
        Pour adapter aux normes de votre équipe, ajustez COMMIT_NORMALIZATION
        et MR_NORMALIZATION sans toucher à la formule.
        """
        if weights is None:
            weights = {
                "commit_rate":   0.25,
                "mr_rate":       0.25,
                "approved_rate": 0.30,
                "review_time":   0.20,
            }

        commit_rate   = min(kpis.get("commit_rate_per_site", 0.0) / self.COMMIT_NORMALIZATION, 1.0)
        mr_rate       = min(kpis.get("mr_rate_per_site",    0.0) / self.MR_NORMALIZATION,     1.0)
        approved_rate = min(kpis.get("approved_mr_rate",    0.0),                             1.0)
        avg_review    = max(kpis.get("avg_review_time_hours", 0.0), 0.0)

        # Sigmoïde inverse : résistante aux valeurs aberrantes (ex: 720h)
        review_score = 1.0 / (1.0 + avg_review / self.REVIEW_REF_HOURS)

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
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> dict:

        nb_commits_project = self._count_all_project_commits(project_id, start_date, end_date)
        nb_devs            = self._count_developers(project_id, start_date, end_date, site_id, group_id, developer_id)
        nb_commits_devs    = self._count_commits_by_devs(project_id, start_date, end_date, site_id, group_id, developer_id)
        nb_mrs             = self._count_mrs(project_id, start_date, end_date, site_id, group_id, developer_id)
        nb_mrs_approved    = self._count_approved_mrs(project_id, start_date, end_date, site_id, group_id, developer_id)
        nb_mrs_merged      = self._count_merged_mrs(project_id, start_date, end_date, site_id, group_id, developer_id)
        sum_review_time    = self._sum_review_time(project_id, start_date, end_date, site_id, group_id, developer_id)

        # ✅ KPIs SENIOR (Collaboration)
        nb_comments        = self._count_comments(project_id, start_date, end_date, developer_id)
        nb_reviews         = self._count_reviews_involved(project_id, start_date, end_date, developer_id)

        # ✅ ACTIVITÉ LATENTE : brouillons en cours (Draft MRs)
        nb_mrs_draft       = self._count_draft_mrs(project_id, start_date, end_date, site_id, group_id, developer_id)

        # ✅ KPIs ENTERPRISE (Niveau International)
        bus_factor         = self._calculate_bus_factor(project_id, start_date, end_date)
        sprint_velocity    = self._calculate_sprint_velocity(project_id, start_date, end_date, developer_id)
        code_churn_rate    = self._calculate_code_churn(project_id, start_date, end_date, developer_id)

        # ✅ DORA METRICS (Standard Google Research)
        deployment_count   = self._count_deployments(project_id, start_date, end_date, site_id, group_id, developer_id)
        lead_time_hours    = self._avg_lead_time(project_id, start_date, end_date, site_id, group_id, developer_id)

        denom = max(nb_devs, 1)

        mr_rate_per_site      = round(nb_mrs / denom, 4)
        approved_mr_rate      = min(1.0, round(nb_mrs_approved / nb_mrs, 4))         if nb_mrs > 0          else 0.0
        merged_mr_rate        = min(1.0, round(nb_mrs_merged / nb_mrs_approved, 4))  if nb_mrs_approved > 0 else 0.0
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
            "total_comments":          nb_comments,
            "total_reviews":           nb_reviews,
            "total_mrs_draft":         nb_mrs_draft,
            "cross_contribution_score": self._count_cross_contributions(project_id, start_date, end_date, developer_id),
            # ─── KPIs Enterprise ────────────────────────────────────────────────
            "bus_factor":              bus_factor,
            "sprint_velocity":         sprint_velocity,
            "code_churn_rate":         code_churn_rate,
            # ─── DORA Metrics ────────────────────────────────────────────────────
            "deployment_count":        deployment_count,
            "lead_time_hours":         lead_time_hours,
            "site_id":                 site_id,
            "group_id":                group_id,
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

    def _active_dev_ids_query(self, project_id: int, site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int]):
        """
        [SENIOR OPTIMIZATION] Retourne la Query SQLAlchemy pour les IDs de développeurs valides.
        L'appelant peut utiliser .subquery() pour injecter le résultat dans un .in_().
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

        if site_id is not None and developer_id is None:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id) &
                (DeveloperSite.site_id      == site_id),
            )

        if group_id is not None and developer_id is None:
            q = q.join(
                developer_group_link,
                (developer_group_link.c.developer_id == Developer.id) &
                (developer_group_link.c.group_id     == group_id)
            )

        if developer_id is not None:
            q = q.filter(Developer.id == developer_id)

        return q

    def _count_developers(
        self, 
        project_id: int, 
        start_date: datetime,
        end_date: datetime,
        site_id: Optional[int] = None, 
        group_id: Optional[int] = None, 
        developer_id: Optional[int] = None
    ) -> int:
        """
        [SENIOR STRATEGY] Assigned Headcount (Full Squad).
        Compte tous les développeurs officiellement affectés au projet/site.
        Indispensable pour le pilotage de la capacité et du ROI.
        """
        # On utilise le helper d'ID qui gère déjà les filtres Project/Site/Group
        q = self._active_dev_ids_query(project_id, site_id, group_id, developer_id)
        return q.count()

    def _count_all_project_commits(self, project_id: int, start_date: datetime, end_date: datetime) -> int:
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
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
        return (
            self.db.query(func.count(Commit.id))
            .filter(
                Commit.project_id          == project_id,
                Commit.authored_date       >= start_date,
                Commit.authored_date       <  end_date,
                Commit.is_merge_commit.is_(False),
                Commit.developer_id.in_(valid_ids), # ✅ FIX: direct subquery
            )
            .scalar() or 0
        )

    def _count_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
        return (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.developer_id.in_(valid_ids), # ✅ FIX: direct subquery
            )
            .scalar() or 0
        )

    def _count_draft_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
        return (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(True),
                MergeRequest.developer_id.in_(select(valid_ids)),
            )
            .scalar() or 0
        )

    def _count_approved_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
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
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
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
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> float:
        valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
        result = (
            self.db.query(func.sum(MergeRequest.review_time_hours))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.review_time_hours.isnot(None),
                MergeRequest.developer_id.in_(valid_ids), # ✅ FIX: direct subquery
            )
            .scalar()
        )
        return float(result or 0.0)

    def _count_comments(self, project_id: int, start_date: datetime, end_date: datetime, developer_id: Optional[int]) -> int:
        q = (
            self.db.query(func.count(Comment.id))
            .join(MergeRequest, Comment.merge_request_id == MergeRequest.id)
            .filter(
                MergeRequest.project_id == project_id,
                Comment.created_at >= start_date,
                Comment.created_at <  end_date,
            )
        )
        if developer_id:
            q = q.filter(Comment.developer_id == developer_id)
        return q.scalar() or 0

    def _count_reviews_involved(self, project_id: int, start_date: datetime, end_date: datetime, developer_id: Optional[int]) -> int:
        if not developer_id:
            return 0
        mr_with_comments_by_dev = self.db.query(Comment.merge_request_id).filter(
            Comment.developer_id == developer_id
        ).subquery()

        q = self.db.query(func.count(MergeRequest.id)).filter(
            MergeRequest.project_id        == project_id,
            MergeRequest.created_at_gitlab >= start_date,
            MergeRequest.created_at_gitlab <  end_date,
            MergeRequest.developer_id.is_distinct_from(developer_id),
            (
                (MergeRequest.reviewer_id == developer_id) | 
                (MergeRequest.assignee_id == developer_id) |
                MergeRequest.id.in_(mr_with_comments_by_dev) # ✅ FIX: direct subquery
            )
        )
        return q.scalar() or 0

    def _count_cross_contributions(self, project_id: int, start_date: datetime, end_date: datetime, developer_id: Optional[int]) -> int:
        if not developer_id:
            return 0
        from sqlalchemy.orm import aliased
        dev_reviewer = aliased(Developer)
        dev_author = aliased(Developer)
        from app.models.developer_group import developer_group_link as dgl
        from sqlalchemy import exists, and_
        dgl_rev = dgl.alias("dgl_rev")
        dgl_aut = dgl.alias("dgl_aut")
        reviewer_has_group = exists().where(dgl_rev.c.developer_id == dev_reviewer.id)
        author_has_group   = exists().where(dgl_aut.c.developer_id == dev_author.id)
        same_group = exists().where(
            and_(
                dgl_rev.c.developer_id == dev_reviewer.id,
                dgl_aut.c.developer_id == dev_author.id,
                dgl_rev.c.group_id     == dgl_aut.c.group_id,
            )
        )
        q = (
            self.db.query(func.count(MergeRequest.id))
            .join(dev_reviewer, MergeRequest.reviewer_id == dev_reviewer.id)
            .join(dev_author, MergeRequest.developer_id == dev_author.id)
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.reviewer_id       == developer_id,
                reviewer_has_group,
                author_has_group,
                ~same_group,
            )
        )
        return q.scalar() or 0

    def _calculate_bus_factor(self, project_id: int, start_date: datetime, end_date: datetime) -> int:
        rows = (
            self.db.query(Commit.developer_id, func.count(Commit.id).label("cnt"))
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
                Commit.is_merge_commit.is_(False),
                Commit.developer_id.isnot(None),
            )
            .group_by(Commit.developer_id)
            .order_by(func.count(Commit.id).desc())
            .all()
        )
        total = sum(r.cnt for r in rows)
        if total == 0:
            return 0
        threshold  = total * 0.5
        cumulative = 0
        bus_factor = 0
        for row in rows:
            cumulative += row.cnt
            bus_factor += 1
            if cumulative >= threshold:
                break
        return bus_factor

    def _calculate_sprint_velocity(self, project_id: int, start_date: datetime, end_date: datetime,
                                     developer_id: Optional[int] = None) -> float:
        q_days = (
            self.db.query(func.count(func.distinct(func.date(Commit.authored_date))))
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
                Commit.is_merge_commit.is_(False),
            )
        )
        if developer_id:
            q_days = q_days.filter(Commit.developer_id == developer_id)
        active_days = q_days.scalar() or 0
        if active_days == 0:
            return 0.0

        q_commits = (
            self.db.query(func.count(Commit.id))
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
                Commit.is_merge_commit.is_(False),
            )
        )
        if developer_id:
            q_commits = q_commits.filter(Commit.developer_id == developer_id)
        total_commits = q_commits.scalar() or 0
        return round(total_commits / active_days, 2)

    def _calculate_code_churn(self, project_id: int, start_date: datetime, end_date: datetime,
                                developer_id: Optional[int] = None) -> float:
        q = (
            self.db.query(
                func.sum(Commit.additions).label("total_add"),
                func.sum(Commit.deletions).label("total_del"),
            )
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
                Commit.is_merge_commit.is_(False),
            )
        )
        if developer_id:
            q = q.filter(Commit.developer_id == developer_id)
        result    = q.first()
        total_add = float(result.total_add or 0)
        total_del = float(result.total_del or 0)
        total     = total_add + total_del
        if total == 0:
            return 0.0
        return round((total_del / total) * 100, 1)

    # =========================================================================
    # DORA METRICS — Standard Google / DORA Research Program
    # =========================================================================

    def _count_deployments(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        """
        DORA Metric 1 — Deployment Frequency.

        Définition : nombre de MRs non-draft mergées sur la branche de production
        du projet (default_branch = "main", "master", "develop", "prod").
        """
        from app.models.project import Project

        project_branch = self.db.query(Project.default_branch).filter(Project.id == project_id).scalar()
        target_branches = [project_branch] if project_branch else ["main", "master", "develop", "prod"]

        q = self.db.query(func.count(MergeRequest.id)).filter(
            MergeRequest.project_id        == project_id,
            MergeRequest.merged_at         >= start_date,
            MergeRequest.merged_at         <  end_date,
            MergeRequest.is_draft.is_(False),
            MergeRequest.merged_at.isnot(None),
            MergeRequest.target_branch.in_(target_branches),
        )

        # Attribution filtrée si demandée (Site, Groupe ou Dev)
        if site_id or group_id or developer_id:
            valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
            q = q.filter(MergeRequest.developer_id.in_(valid_ids)) # ✅ FIX: direct subquery
        
        return q.scalar() or 0

    def _avg_lead_time(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> float:
        """
        DORA Metric 2 — Lead Time for Changes.
        """
        from app.models.project import Project

        project_branch = self.db.query(Project.default_branch).filter(Project.id == project_id).scalar()
        target_branches = [project_branch] if project_branch else ["main", "master", "develop", "prod"]

        q = self.db.query(func.avg(MergeRequest.cycle_time_hours)).filter(
            MergeRequest.project_id        == project_id,
            MergeRequest.merged_at         >= start_date,
            MergeRequest.merged_at         <  end_date,
            MergeRequest.is_draft.is_(False),
            MergeRequest.merged_at.isnot(None),
            MergeRequest.target_branch.in_(target_branches),
            MergeRequest.cycle_time_hours.isnot(None),
        )

        # Attribution filtrée si demandée
        if site_id or group_id or developer_id:
            valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
            q = q.filter(MergeRequest.developer_id.in_(valid_ids)) # ✅ FIX: direct subquery

        result = q.scalar()
        return round(float(result or 0.0), 1)