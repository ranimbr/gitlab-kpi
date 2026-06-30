"""KPI computation service for project, site, group and developer scopes."""
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select, or_, and_
from sqlalchemy.orm import Session

from app.models.commit import Commit
from app.models.developer import Developer
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.merge_request import MergeRequest
from app.models.comment import Comment
from app.models.developer_group import developer_group_link, DeveloperGroupLink
from app.models.period import Period
from app.models.extraction_lot import ExtractionLot
from app.utils.mission_utils import get_rg02_threshold, is_mr_certified_for_period  # RG-02 Source de Vérité Unique


class KpiCalculator:

    # Team-level normalization thresholds.
    COMMIT_NORMALIZATION = 10.0   # commits/mois → score_commit = 1.0
    MR_NORMALIZATION     = 5.0    # MRs/mois     → score_mr = 1.0
    REVIEW_REF_HOURS     = 24.0   # heures → score_review = 0.5 (point d'inflexion)

    def __init__(self, db: Session):
        self.db = db

    # =========================================================================
    # POINTS D'ENTRÉE PUBLICS
    # =========================================================================

    def calculate_for_site(self, project_id, site_id, start_date, end_date, eligible_ids=None) -> dict:
        return self.calculate_project_kpis(project_id, start_date, end_date, site_id=site_id, eligible_ids=eligible_ids)

    def calculate_for_group(self, project_id, group_id, start_date, end_date, eligible_ids=None) -> dict:
        return self.calculate_project_kpis(project_id, start_date, end_date, group_id=group_id, eligible_ids=eligible_ids)

    def calculate_global(self, project_id, start_date, end_date, eligible_ids=None) -> dict:
        return self.calculate_project_kpis(project_id, start_date, end_date, eligible_ids=eligible_ids)

    def calculate_for_developer(self, project_id, developer_id, start_date, end_date, eligible_ids=None) -> dict:
        return self.calculate_project_kpis(
            project_id, start_date, end_date, developer_id=developer_id, eligible_ids=eligible_ids
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

        Normalization thresholds are class constants and can be tuned per team.
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

        # ✅ [SENIOR] FIX : Inactive developer should have 0 score
        # A developer is active if they have commits OR MRs
        if kpis.get("commit_rate_per_site", 0.0) == 0 and kpis.get("mr_rate_per_site", 0.0) == 0:
            return 0.0

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
        eligible_ids: Optional[list] = None,
    ) -> dict:

        # 1. Volumes bruts
        # Keep project commit volume site-aware when a site filter is provided.
        nb_commits_project = self._count_all_project_commits(project_id, start_date, end_date, site_id=site_id)
        nb_devs            = self._count_developers(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
        nb_commits_devs    = self._count_commits_by_devs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
        nb_mrs             = self._count_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
        nb_mrs_approved    = self._count_approved_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
        nb_mrs_with_time   = self._count_approved_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids, with_time_only=True)
        nb_mrs_merged      = self._count_merged_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
        sum_review_time    = self._sum_review_time(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)

        # Collaboration KPIs
        nb_comments        = self._count_comments(project_id, start_date, end_date, developer_id)
        nb_reviews         = self._count_reviews_involved(project_id, start_date, end_date, developer_id)

        # Draft merge requests (work in progress)
        nb_mrs_draft       = self._count_draft_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)

        # Additional engineering KPIs
        bus_factor         = self._calculate_bus_factor(project_id, start_date, end_date)
        sprint_velocity    = self._calculate_sprint_velocity(project_id, start_date, end_date, developer_id)
        code_churn_rate    = self._calculate_code_churn(project_id, start_date, end_date, developer_id)

        denom = max(nb_devs, 1)

        mr_rate_per_site      = round(nb_mrs / denom, 4)
        approved_mr_rate      = min(1.0, round(nb_mrs_approved / nb_mrs, 4))         if nb_mrs > 0          else 0.0
        merged_mr_rate        = min(1.0, round(nb_mrs_merged / nb_mrs_approved, 4))  if nb_mrs_approved > 0 else 0.0
        commit_rate_per_site  = round(nb_commits_devs / denom, 4)
        avg_review_time_hours = round(sum_review_time / nb_mrs_with_time, 2) if nb_mrs_with_time > 0 else 0.0

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

    def _active_dev_ids_query(self, project_id: int, start_date: datetime, end_date: datetime, site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int], eligible_ids: Optional[list] = None):
        """
        [SENIOR] Retourne les IDs de développeurs ASSIGNÉS pour cette période.
        Optimisé : Utilise une sous-requête SQL au lieu d'une liste d'IDs Python.
        """
        if eligible_ids is not None:
            # ✅ [FIX 1] Si les IDs sont déjà matérialisés, on les utilise directement
            q = self.db.query(Developer.id).filter(
                Developer.id.in_(eligible_ids)
            )
        else:
            # ✅ [SENIOR] Mise en cache de la requête de base pour éviter de la reconstruire 7x
            cache_key = (project_id, start_date, end_date)
            if not hasattr(self, '_base_mission_query_cache'):
                self._base_mission_query_cache = {}
            
            if cache_key not in self._base_mission_query_cache:
                # Résolution de la période pour le scoping temporel strict
                period = self.db.query(Period).filter(
                    Period.year == start_date.year,
                    Period.month == start_date.month
                ).first()

                # ✅ [SENIOR] Calcul du mois suivant sans dépendance externe
                next_month = start_date.month + 1
                next_year = start_date.year
                if next_month > 12:
                    next_month = 1
                    next_year += 1
                end_date_month = datetime(next_year, next_month, 1)

            # ✅ [SENIOR++++] SQL Composition : on récupère une QUERY, pas une LISTE
                from app.utils.mission_utils import get_certified_developers_query
                period_id = period.id if period else None
                subq = get_certified_developers_query(
                    db=self.db, project_id=project_id, period_id=period_id,
                    start_date=start_date.date(), end_date=end_date_month.date()
                ).subquery()
                self._base_mission_query_cache[cache_key] = subq

            mission_subq = self._base_mission_query_cache[cache_key]
            # Utilisation de .c.id pour être explicite sur la colonne de la subquery
            # ✅ [FIX] Ajout de .distinct() pour éviter les doublons si un dev a plusieurs missions
            # ✅ [RG-02] threshold via get_rg02_threshold() — Source de Vérité Unique
            # Définie dans app/utils/mission_utils.py. Modifier le seuil LÀ-BAS uniquement.
            threshold_date = get_rg02_threshold(start_date.year, start_date.month)

            q = self.db.query(Developer.id).distinct().filter(
                Developer.id.in_(select(mission_subq.c.id)),
                # ✅ [INTELLIGENT] Respect strict des dates contractuelles RH + Règle des 15 jours
                or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date.date()),
                or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date)
            )

        # ✅ [STRICT TEMPORAL INTEGRITY] Respect strict des dates d'affectation (SCD Type 2)
        # S'applique même si eligible_ids est fourni.
        if site_id is not None:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Developer.id)
            ).filter(
                DeveloperSite.site_id == site_id,
                DeveloperSite.start_date < end_date.date(),
                or_(DeveloperSite.end_date >= start_date.date(), DeveloperSite.is_active.is_(True))
            )

        if group_id is not None and developer_id is None:
            # ✅ [SENIOR++++] SCD Type 2 Robust Intersection
            from app.models.developer_group import DeveloperGroupLink
            q = q.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == Developer.id) &
                (DeveloperGroupLink.group_id     == group_id) &
                (DeveloperGroupLink.start_date    <  end_date.date()) &
                ((DeveloperGroupLink.end_date    >= start_date.date()) | (DeveloperGroupLink.is_active.is_(True)))
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
        developer_id: Optional[int] = None,
        eligible_ids: Optional[list] = None
    ) -> int:
        """
        [SENIOR STRATEGY] Assigned Headcount (Full Squad).
        Compte tous les développeurs officiellement affectés au projet/site.
        Indispensable pour le pilotage de la capacité et du ROI.
        """
        # On utilise le helper d'ID qui gère déjà les filtres Project/Site/Group
        q = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
        return q.count()

    def _count_all_project_commits(self, project_id: int, start_date: datetime, end_date: datetime, site_id: Optional[int] = None) -> int:
        """
        Total de commits pour un projet sur une période (filtrable par site).
        ✅ [SENIOR] Version blindée : Seuls les commits des devs certifiés sont comptés.
        Rapprochement dynamique par site (Time-Aware).
        """
        # 1. Identifier les lots d'extraction pour la période
        period = self.db.query(Period).filter(Period.year == start_date.year, Period.month == start_date.month).first()
        lot_ids = []
        if period:
            lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
                ExtractionLot.period_id == period.id,
                ExtractionLot.project_id == project_id
            ).all()]

        # 2. Base de la requête de commits
        # ✅ [FIX] Utilisation de distinct(Commit.id) pour éviter de compter plusieurs fois le même commit
        # si le développeur a plusieurs missions enregistrées.
        q = self.db.query(func.count(func.distinct(Commit.id))).join(
            DeveloperProject,
            (DeveloperProject.developer_id == Commit.developer_id) &
            (DeveloperProject.project_id   == Commit.project_id)
        ).filter(
            Commit.project_id    == project_id,
            Commit.is_merge_commit.is_(False),
            func.lower(Commit.title).notlike("merge branch %"),
            func.lower(Commit.title).notlike("merge pull request %"),
            func.lower(Commit.title).notlike("merge %"),
        )

        # 3. Filtrage par période (Lot ou Dates)
        if lot_ids:
            q = q.filter(Commit.extraction_lot_id.in_(lot_ids))
        else:
            q = q.filter(Commit.authored_date >= start_date, Commit.authored_date < end_date)

        # 4. [CRITICAL SOLUTION] Rapprochement Cohérent par Site (Enterprise Standard)
        # On utilise exactement les mêmes IDs validés que pour le headcount.
        # Cela garantit qu'un commit ne peut pas appartenir à un site si le dev n'y est pas affecté.
        if site_id:
            valid_ids = self._active_dev_ids_query(project_id, start_date, end_date, site_id, None, None).subquery()
            q = q.filter(Commit.developer_id.in_(select(valid_ids.c.id)))
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Commit.developer_id) &
                (DeveloperSite.site_id == site_id) &
                (DeveloperSite.start_date <= func.date(Commit.authored_date)) &
                (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= func.date(Commit.authored_date)))
            )

        return q.scalar() or 0

    def _count_commits_by_devs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
        eligible_ids: Optional[list] = None,
    ) -> int:
        """
        ✅ [SENIOR] Filtrage par Lot ET par Mission Active.
        """
        valid_ids = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids).subquery()
        
        period = self.db.query(Period).filter(Period.year == start_date.year, Period.month == start_date.month).first()
        lot_ids = []
        if period:
            lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
                ExtractionLot.period_id == period.id,
                ExtractionLot.project_id == project_id
            ).all()]

        q = self.db.query(func.count(func.distinct(Commit.id))).join(
            DeveloperProject,
            (DeveloperProject.developer_id == Commit.developer_id) &
            (DeveloperProject.project_id   == Commit.project_id)
        ).filter(
            Commit.project_id          == project_id,
            Commit.is_merge_commit.is_(False),
            Commit.developer_id.in_(select(valid_ids.c.id)),
            func.lower(Commit.title).notlike("merge branch %"),
            func.lower(Commit.title).notlike("merge pull request %"),
            func.lower(Commit.title).notlike("merge %"),
        )

        q = q.filter(Commit.authored_date >= start_date, Commit.authored_date < end_date)
        if lot_ids:
            q = q.filter(Commit.extraction_lot_id.in_(lot_ids))

        if site_id:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == Commit.developer_id) &
                (DeveloperSite.site_id == site_id) &
                (DeveloperSite.start_date <= func.date(Commit.authored_date)) &
                (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= func.date(Commit.authored_date)))
            )

        # ✅ [GROUP SCD2] Rapprochement chirurgical par groupe — même précision que site_id
        if group_id:
            q = q.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == Commit.developer_id) &
                (DeveloperGroupLink.group_id == group_id) &
                (DeveloperGroupLink.start_date <= func.date(Commit.authored_date)) &
                (or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= func.date(Commit.authored_date)))
            )

        return q.scalar() or 0


    def _count_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
        eligible_ids: Optional[list] = None,
    ) -> int:
        """
        ✅ [RG-02 FIX POST-REQUÊTE] Version avec filtre RG-02 appliqué après récupération.
        Récupère toutes les colonnes nécessaires pour éviter AttributeError.
        """
        valid_ids = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids).subquery()
        
        period = self.db.query(Period).filter(Period.year == start_date.year, Period.month == start_date.month).first()
        lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
            ExtractionLot.period_id == period.id, ExtractionLot.project_id == project_id
        ).all()] if period else []

        # Récupérer tous les MR avec toutes les colonnes nécessaires
        q = self.db.query(MergeRequest).join(
            DeveloperProject,
            (DeveloperProject.developer_id == MergeRequest.developer_id) &
            (DeveloperProject.project_id   == MergeRequest.project_id)
        ).filter(
            MergeRequest.project_id == project_id,
            MergeRequest.is_draft.is_(False),
        )

        q = q.filter(MergeRequest.created_at_gitlab >= start_date, MergeRequest.created_at_gitlab < end_date)
        if lot_ids:
            q = q.filter(MergeRequest.extraction_lot_id.in_(lot_ids))

        q = q.filter(
            MergeRequest.developer_id.in_(select(valid_ids.c.id))
        )

        if site_id:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == MergeRequest.developer_id) &
                (DeveloperSite.site_id == site_id) &
                (DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        # ✅ [GROUP SCD2] Rapprochement chirurgical par groupe — même précision que site_id
        if group_id:
            q = q.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == MergeRequest.developer_id) &
                (DeveloperGroupLink.group_id == group_id) &
                (DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        # ✅ [RG-02 FIX POST-REQUÊTE] Filtrage des MR selon la règle des 15 jours
        all_mrs = q.all()
        
        certified_mr_ids = []
        for mr in all_mrs:
            if is_mr_certified_for_period(
                mr.created_at_gitlab.date(),
                mr.developer_id,
                self.db,
                period_id=period.id if period else None,
                start_date=start_date.date(),
                end_date=end_date.date()
            ):
                certified_mr_ids.append(mr.id)
        
        # Compter uniquement les MR certifiés
        return len(certified_mr_ids)

    def _count_draft_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
        eligible_ids: Optional[list] = None,
    ) -> int:
        """
        ✅ [RG-02 FIX POST-REQUÊTE] Version avec filtre RG-02 appliqué après récupération.
        Récupère toutes les colonnes nécessaires pour éviter AttributeError.
        """
        valid_ids = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids).subquery()
        
        period = self.db.query(Period).filter(Period.year == start_date.year, Period.month == start_date.month).first()
        lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
            ExtractionLot.period_id == period.id, ExtractionLot.project_id == project_id
        ).all()] if period else []

        # Récupérer tous les MR avec toutes les colonnes nécessaires
        q = self.db.query(MergeRequest).join(
            DeveloperProject,
            (DeveloperProject.developer_id == MergeRequest.developer_id) &
            (DeveloperProject.project_id   == MergeRequest.project_id)
        ).filter(
            MergeRequest.project_id == project_id,
            MergeRequest.is_draft.is_(True),
        )

        q = q.filter(MergeRequest.created_at_gitlab >= start_date, MergeRequest.created_at_gitlab < end_date)
        if lot_ids:
            q = q.filter(MergeRequest.extraction_lot_id.in_(lot_ids))

        q = q.filter(
            MergeRequest.developer_id.in_(select(valid_ids.c.id))
        )

        if site_id:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == MergeRequest.developer_id) &
                (DeveloperSite.site_id == site_id) &
                (DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        # ✅ [GROUP SCD2] Rapprochement chirurgical par groupe — même précision que site_id
        if group_id:
            q = q.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == MergeRequest.developer_id) &
                (DeveloperGroupLink.group_id == group_id) &
                (DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        # ✅ [RG-02 FIX POST-REQUÊTE] Filtrage des MR selon la règle des 15 jours
        all_mrs = q.all()
        
        certified_mr_ids = []
        for mr in all_mrs:
            if is_mr_certified_for_period(
                mr.created_at_gitlab.date(),
                mr.developer_id,
                self.db,
                period_id=period.id if period else None,
                start_date=start_date.date(),
                end_date=end_date.date()
            ):
                certified_mr_ids.append(mr.id)
        
        # Compter uniquement les MR certifiés
        return len(certified_mr_ids)


    def _count_approved_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
        eligible_ids: Optional[list] = None,
        with_time_only: bool = False
    ) -> int:
        """
        ✅ [RG-02 FIX POST-REQUÊTE] Version avec filtre RG-02 appliqué après récupération.
        Récupère toutes les colonnes nécessaires pour éviter AttributeError.
        """
        valid_ids = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids).subquery()
        
        period = self.db.query(Period).filter(Period.year == start_date.year, Period.month == start_date.month).first()
        lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
            ExtractionLot.period_id == period.id, ExtractionLot.project_id == project_id
        ).all()] if period else []

        # Récupérer tous les MR avec toutes les colonnes nécessaires
        q = self.db.query(MergeRequest).join(
            DeveloperProject,
            (DeveloperProject.developer_id == MergeRequest.developer_id) &
            (DeveloperProject.project_id   == MergeRequest.project_id)
        ).filter(
            MergeRequest.project_id == project_id,
            MergeRequest.is_draft.is_(False),
            MergeRequest.approved.is_(True),
        )

        if with_time_only:
            q = q.filter(MergeRequest.review_time_hours.isnot(None))

        q = q.filter(MergeRequest.created_at_gitlab >= start_date, MergeRequest.created_at_gitlab < end_date)
        if lot_ids:
            q = q.filter(MergeRequest.extraction_lot_id.in_(lot_ids))

        q = q.filter(
            MergeRequest.developer_id.in_(select(valid_ids.c.id))
        )

        if site_id:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == MergeRequest.developer_id) &
                (DeveloperSite.site_id == site_id) &
                (DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        if group_id:
            q = q.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == MergeRequest.developer_id) &
                (DeveloperGroupLink.group_id == group_id) &
                (DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        # ✅ [RG-02 FIX POST-REQUÊTE] Filtrage des MR selon la règle des 15 jours
        all_mrs = q.all()
        
        certified_mr_ids = []
        for mr in all_mrs:
            if is_mr_certified_for_period(
                mr.created_at_gitlab.date(),
                mr.developer_id,
                self.db,
                period_id=period.id if period else None,
                start_date=start_date.date(),
                end_date=end_date.date()
            ):
                certified_mr_ids.append(mr.id)
        
        # Compter uniquement les MR certifiés
        return len(certified_mr_ids)


    def _count_merged_mrs(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
        eligible_ids: Optional[list] = None,
    ) -> int:
        """
        ✅ [RG-02 FIX POST-REQUÊTE] Version avec filtre RG-02 appliqué après récupération.
        Récupère toutes les colonnes nécessaires pour éviter AttributeError.
        """
        valid_ids = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids).subquery()

        period = self.db.query(Period).filter(Period.year == start_date.year, Period.month == start_date.month).first()
        lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
            ExtractionLot.period_id == period.id, ExtractionLot.project_id == project_id
        ).all()] if period else []

        # Récupérer tous les MR avec toutes les colonnes nécessaires
        q = self.db.query(MergeRequest).join(
            DeveloperProject,
            (DeveloperProject.developer_id == MergeRequest.developer_id) &
            (DeveloperProject.project_id   == MergeRequest.project_id)
        ).filter(
            MergeRequest.project_id == project_id,
            MergeRequest.is_draft.is_(False),
            MergeRequest.merged_at.isnot(None),
        )

        q = q.filter(MergeRequest.created_at_gitlab >= start_date, MergeRequest.created_at_gitlab < end_date)
        if lot_ids:
            q = q.filter(MergeRequest.extraction_lot_id.in_(lot_ids))

        q = q.filter(
            MergeRequest.developer_id.in_(select(valid_ids.c.id))
        )

        if site_id:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == MergeRequest.developer_id) &
                (DeveloperSite.site_id == site_id) &
                (DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        if group_id:
            q = q.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == MergeRequest.developer_id) &
                (DeveloperGroupLink.group_id == group_id) &
                (DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        # ✅ [RG-02 FIX POST-REQUÊTE] Filtrage des MR selon la règle des 15 jours
        all_mrs = q.all()
        
        certified_mr_ids = []
        for mr in all_mrs:
            if is_mr_certified_for_period(
                mr.created_at_gitlab.date(),
                mr.developer_id,
                self.db,
                period_id=period.id if period else None,
                start_date=start_date.date(),
                end_date=end_date.date()
            ):
                certified_mr_ids.append(mr.id)
        
        # Compter uniquement les MR certifiés
        return len(certified_mr_ids)


    def _sum_review_time(
        self, project_id: int, start_date: datetime, end_date: datetime,
        site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
        eligible_ids: Optional[list] = None,
    ) -> float:
        """
        ✅ [RG-02 FIX POST-REQUÊTE] Version avec filtre RG-02 appliqué après récupération.
        Récupère toutes les colonnes nécessaires pour éviter AttributeError.
        """
        valid_ids = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids).subquery()
        
        period = self.db.query(Period).filter(Period.year == start_date.year, Period.month == start_date.month).first()
        lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
            ExtractionLot.period_id == period.id, ExtractionLot.project_id == project_id
        ).all()] if period else []

        # Récupérer tous les MR avec toutes les colonnes nécessaires
        q = self.db.query(MergeRequest).join(
            DeveloperProject,
            (DeveloperProject.developer_id == MergeRequest.developer_id) &
            (DeveloperProject.project_id   == MergeRequest.project_id)
        ).filter(
            MergeRequest.project_id        == project_id,
            MergeRequest.is_draft.is_(False),
            MergeRequest.review_time_hours.isnot(None),
            MergeRequest.created_at_gitlab >= start_date,
            MergeRequest.created_at_gitlab <  end_date,
            MergeRequest.developer_id.in_(select(valid_ids.c.id)),
        )

        if lot_ids:
            q = q.filter(MergeRequest.extraction_lot_id.in_(lot_ids))

        if site_id:
            q = q.join(
                DeveloperSite,
                (DeveloperSite.developer_id == MergeRequest.developer_id) &
                (DeveloperSite.site_id == site_id) &
                (DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        if group_id:
            q = q.join(
                DeveloperGroupLink,
                (DeveloperGroupLink.developer_id == MergeRequest.developer_id) &
                (DeveloperGroupLink.group_id == group_id) &
                (DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab)) &
                (or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)))
            )

        # ✅ [RG-02 FIX POST-REQUÊTE] Filtrage des MR selon la règle des 15 jours
        all_mrs = q.all()
        
        certified_review_time = 0.0
        for mr in all_mrs:
            if is_mr_certified_for_period(
                mr.created_at_gitlab.date(),
                mr.developer_id,
                self.db,
                period_id=period.id if period else None,
                start_date=start_date.date(),
                end_date=end_date.date()
            ):
                certified_review_time += mr.review_time_hours
        
        return certified_review_time

    # DISABLED: KPI #8 (avg_commits_per_mr) removed from system
    # def _sum_commits_in_mrs(
    #     self, project_id: int, start_date: datetime, end_date: datetime,
    #     site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int],
    #     eligible_ids: Optional[list] = None,
    # ) -> int:
    #     """
    #     ✅ [SENIOR++++] Somme des commits dans les MRs (KPI #8: avg_commits_per_mr).
    #     
    #     Formule: avg_commits_per_mr = sum(commits_count) / nb_mrs
    #     Apport: Identifie les MRs avec beaucoup de commits → potentiellement complexes ou divisées en sous-tâches
    #     
    #     ✅ [FIX SCD2] DISTINCT sur MergeRequest.id pour éviter le doublon quand
    #     un dev a plusieurs segments developer_site (suspension + réactivation).
    #     ✅ [RG-02 FIX POST-REQUÊTE] Filtrage des MR selon la règle des 15 jours après récupération.
    #     """
    #     valid_ids = self._active_dev_ids_query(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids).subquery()
    #     
    #     period = self.db.query(Period).filter(Period.year == start_date.year, Period.month == start_date.month).first()
    #     lot_ids = [r[0] for r in self.db.query(ExtractionLot.id).filter(
    #         ExtractionLot.period_id == period.id, ExtractionLot.project_id == project_id
    #     ).all()] if period else []
    #
    #     # ✅ [RG-02 FIX POST-REQUÊTE] Récupérer toutes les MRs avec toutes les colonnes nécessaires
    #     q = self.db.query(MergeRequest).join(
    #         DeveloperProject,
    #         (DeveloperProject.developer_id == MergeRequest.developer_id) &
    #         (DeveloperProject.project_id   == MergeRequest.project_id)
    #     ).filter(
    #         MergeRequest.project_id        == project_id,
    #         MergeRequest.is_draft.is_(False),
    #         MergeRequest.created_at_gitlab >= start_date,
    #         MergeRequest.created_at_gitlab <  end_date,
    #         MergeRequest.developer_id.in_(select(valid_ids.c.id)),
    #     )
    #
    #     if lot_ids:
    #         q = q.filter(MergeRequest.extraction_lot_id.in_(lot_ids))
    #
    #     if site_id:
    #         q = q.join(
    #             DeveloperSite,
    #             (DeveloperSite.developer_id == MergeRequest.developer_id) &
    #             (DeveloperSite.site_id == site_id) &
    #             (DeveloperSite.start_date <= func.date(MergeRequest.created_at_gitlab)) &
    #             (or_(DeveloperSite.end_date.is_(None), DeveloperSite.end_date >= func.date(MergeRequest.created_at_gitlab)))
    #         )
    #
    #     if group_id:
    #         q = q.join(
    #             DeveloperGroupLink,
    #             (DeveloperGroupLink.developer_id == MergeRequest.developer_id) &
    #             (DeveloperGroupLink.group_id == group_id) &
    #             (DeveloperGroupLink.start_date <= func.date(MergeRequest.created_at_gitlab)) &
    #             (or_(DeveloperGroupLink.end_date.is_(None), DeveloperGroupLink.end_date >= func.date(MergeRequest.created_at_gitlab)))
    #         )
    #
    #     # ✅ [RG-02 FIX POST-REQUÊTE] Filtrage des MR selon la règle des 15 jours
    #     all_mrs = q.all()
    #     
    #     # ✅ [FIX SCD2] Utiliser un set pour éviter les doublons de MR.id
    #     certified_mr_ids = set()
    #     certified_commits_sum = 0
    #     for mr in all_mrs:
    #         if mr.id in certified_mr_ids:
    #             continue  # Déjà compté (doublon SCD2)
    #         
    #         if is_mr_certified_for_period(
    #             mr.created_at_gitlab.date(),
    #             mr.developer_id,
    #             self.db,
    #             period_id=period.id if period else None,
    #             start_date=start_date.date(),
    #             end_date=end_date.date()
    #         ):
    #             certified_mr_ids.add(mr.id)
    #             certified_commits_sum += mr.commits_count or 0
    #     
    #     return certified_commits_sum

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