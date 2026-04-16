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
from app.models.comment import Comment


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
        nb_devs            = self._count_developers(project_id, site_id, group_id, developer_id)
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
        # Bus Factor : nombre min de devs couvrant >= 50% du code. Valeur critique si = 1.
        bus_factor         = self._calculate_bus_factor(project_id, start_date, end_date)
        # Sprint Velocity : commits / jours actifs. Mesure l'intensité réelle de contribution.
        sprint_velocity    = self._calculate_sprint_velocity(project_id, start_date, end_date, developer_id)
        # Code Churn Rate : % de code réécrit/supprimé. > 40% = signe de retravail excessif.
        code_churn_rate    = self._calculate_code_churn(project_id, start_date, end_date, developer_id)

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
            "total_comments":          nb_comments,
            "total_reviews":           nb_reviews,
            "total_mrs_draft":         nb_mrs_draft,
            "cross_contribution_score": self._count_cross_contributions(project_id, start_date, end_date, developer_id),
            # ─── KPIs Enterprise ────────────────────────────────────────────────
            "bus_factor":              bus_factor,
            "sprint_velocity":         sprint_velocity,
            "code_churn_rate":         code_churn_rate,
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

        if group_id is not None and developer_id is None:
            q = q.filter(Developer.group_id == group_id)

        if developer_id is not None:
            q = q.filter(Developer.id == developer_id)

        return q  # ✅ Query brute — PAS .subquery() ici

    def _count_developers(self, project_id: int, site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int]) -> int:
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
        if group_id is not None:
            q = q.filter(Developer.group_id == group_id)
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
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        """KPI #5 : commits des devs actifs, hors merges automatiques."""
        # ✅ FIX SAWarning : .subquery() appelé ici, pas dans _active_dev_ids_query
        valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
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
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        """KPI #1 : MRs non-draft créées par des devs actifs."""
        valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
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

    def _count_draft_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    ) -> int:
        """
        Compte les MRs en brouillon (Draft) créées sur la période.
        Ces MRs représentent du travail en cours non encore soumis à relecture.
        Elles ne sont PAS comptées dans les KPIs de production (total_mrs_created)
        mais permettent de détecter les développeurs actifs sans production finalisée.
        """
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
        """KPI #3 : MRs approuvées."""
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
        """KPI #4 : MRs mergées."""
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
        """KPI #7 : somme des temps de review (MRs approuvées)."""
        valid_ids = self._active_dev_ids_query(project_id, site_id, group_id, developer_id).subquery()
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

    def _count_comments(self, project_id: int, start_date: datetime, end_date: datetime, developer_id: Optional[int]) -> int:
        """Compte les commentaires faits par le(s) dev(s) UNIQUEMENT sur ce projet.

        [FIX-PROJECT-FILTER] JOIN sur MergeRequest pour isoler les commentaires par projet.
        Sans ce filtre, les commentaires d'un dev sur d'autres projets étaient comptés
        dans les KPIs de CE projet — donnant des résultats incorrects sur les tableaux de bord.
        """
        q = (
            self.db.query(func.count(Comment.id))
            .join(MergeRequest, Comment.merge_request_id == MergeRequest.id)
            .filter(
                MergeRequest.project_id == project_id,  # [FIX] isolement par projet
                Comment.created_at >= start_date,
                Comment.created_at <  end_date,
            )
        )
        if developer_id:
            q = q.filter(Comment.developer_id == developer_id)
        return q.scalar() or 0

    def _count_reviews_involved(self, project_id: int, start_date: datetime, end_date: datetime, developer_id: Optional[int]) -> int:
        """
        Compte les MRs où le dev est impliqué en tant que Reviewer ou Assignee
        (et n'est PAS l'auteur).
        """
        if not developer_id:
            return 0 # Global reviews count needs more logic (count unique MRs with any non-author reviewer)
            
        # Enterprise Metric: Active Review Involvement
        # Counts MRs where dev is Reviewer, Assignee, OR actively participated via Comments
        mr_with_comments_by_dev = self.db.query(Comment.merge_request_id).filter(
            Comment.developer_id == developer_id
        ).subquery()

        q = self.db.query(func.count(MergeRequest.id)).filter(
            MergeRequest.project_id        == project_id,
            MergeRequest.created_at_gitlab >= start_date,
            MergeRequest.created_at_gitlab <  end_date,
            MergeRequest.developer_id.is_distinct_from(developer_id), # Pas l'auteur
            (
                (MergeRequest.reviewer_id == developer_id) | 
                (MergeRequest.assignee_id == developer_id) |
                MergeRequest.id.in_(select(mr_with_comments_by_dev))
            )
        )
        return q.scalar() or 0

    def _count_cross_contributions(self, project_id: int, start_date: datetime, end_date: datetime, developer_id: Optional[int]) -> int:
        """
        Calcule le score de cross-contribution (MRs relues en dehors de son équipe).
        Réservé aux KPIs individuels (developer_id is not None).
        """
        if not developer_id:
            return 0
            
        from sqlalchemy.orm import aliased
        
        dev_reviewer = aliased(Developer)
        dev_author = aliased(Developer)
        
        q = (
            self.db.query(func.count(MergeRequest.id))
            .join(dev_reviewer, MergeRequest.reviewer_id == dev_reviewer.id)
            .join(dev_author, MergeRequest.developer_id == dev_author.id)
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.reviewer_id       == developer_id,
                dev_reviewer.group_id.isnot(None),
                dev_author.group_id.isnot(None),
                dev_reviewer.group_id         != dev_author.group_id
            )
        )
        return q.scalar() or 0

    # =========================================================================
    # KPIs ENTERPRISE — Niveau International
    # =========================================================================

    def _calculate_bus_factor(self, project_id: int, start_date: datetime, end_date: datetime) -> int:
        """
        Bus Factor : nombre minimum de développeurs couvrant >= 50% des commits.

        Interprétation :
          - Bus Factor = 1 → CRITIQUE (toute la valeur repose sur 1 personne)
          - Bus Factor = 2 → Risque élevé
          - Bus Factor >= 3 → Zone saine pour une petite équipe
          - Bus Factor >= 5 → Équipe résiliente

        Algorithme : tri décroissant des commits par dev, accumulation jusqu'à 50%.
        Identique à la méthode utilisée par Google DORA et GitLab Engineering.
        """
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
        """
        Sprint Velocity : commits / jours actifs sur la période.

        Mesure l'intensité réelle de contribution quotidienne.
        Différent du commit_rate mensuel : ici on ne divise que par les jours
        où le développeur a réellement travaillé, donnant une mesure plus précise
        de sa productivité lors des journées actives.

        Exemple : 10 commits en 4 jours actifs → Velocity = 2.5 (sain)
        """
        # Jours distincts avec au moins un commit
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

        # Total commits sur la même période
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
        """
        Code Churn Rate : deletions / (additions + deletions) * 100

        Représente le pourcentage de code réécrit ou supprimé.
        Un taux élevé indique beaucoup de retravail ou de dette technique.

        Interprétation (standard industrie) :
          < 20%  : Excellent — code stable, bonne planification
          20-40% : Normal   — refactoring sain en développement agile
          > 40%  : Attention — retravail excessif, revue de processus nécessaire
          > 60%  : Critique  — instabilité du code, risque livraison
        """
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