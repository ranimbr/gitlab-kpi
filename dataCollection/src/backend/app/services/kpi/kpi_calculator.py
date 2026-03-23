"""
services/kpi/kpi_calculator.py


"""
from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commit import Commit
from app.models.developer import Developer
from app.models.merge_request import MergeRequest


class KpiCalculator:

    def __init__(self, db: Session):
        self.db = db

    # =========================================================================
    # POINTS D'ENTRÉE PUBLICS
    # =========================================================================

    def calculate_for_site(
        self,
        project_id: int,
        site_id:    int,
        start_date: datetime,
        end_date:   datetime,
    ) -> dict:
        """KPIs agrégés pour tous les développeurs validés d'un site."""
        return self.calculate_project_kpis(
            project_id, start_date, end_date, site_id=site_id
        )

    def calculate_global(
        self,
        project_id: int,
        start_date: datetime,
        end_date:   datetime,
    ) -> dict:
        """KPIs globaux du projet (tous sites confondus)."""
        return self.calculate_project_kpis(
            project_id, start_date, end_date, site_id=None
        )

    def calculate_for_developer(
        self,
        project_id:   int,
        developer_id: int,
        start_date:   datetime,
        end_date:     datetime,
    ) -> dict:
        """
        KPIs individuels d'un développeur.
        ✅ NOUVEAU — filtre sur developer_id pour des valeurs réellement
        individuelles (pas les agrégats du site entier).
        nb_developers = 1 (le dev lui-même).
        """
        return self.calculate_project_kpis(
            project_id,
            start_date,
            end_date,
            site_id      = None,   # pas de filtre site (le dev peut changer de site)
            developer_id = developer_id,
        )

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
        """
        Calcule les 6 KPIs pour un périmètre donné.

        Périmètres supportés :
            site_id=X,  developer_id=None → agrégat site
            site_id=None, developer_id=None → agrégat projet global
            site_id=None, developer_id=X   → snapshot individuel
        """
        # KPI #6 : NB commits du projet — TOUS les commits, pas seulement validés
        # (on mesure l'activité brute du projet pour identifier les composants actifs)
        nb_commits_project = self._count_all_project_commits(
            project_id, start_date, end_date
        )

        # Compteurs filtrés sur devs validés (pour les ratios KPI #1, #5)
        nb_devs         = self._count_developers(project_id, site_id, developer_id)
        nb_commits_devs = self._count_commits_by_devs(
            project_id, start_date, end_date, site_id, developer_id
        )
        nb_mrs          = self._count_mrs(
            project_id, start_date, end_date, site_id, developer_id
        )
        nb_mrs_approved = self._count_approved_mrs(
            project_id, start_date, end_date, site_id, developer_id
        )
        nb_mrs_merged   = self._count_merged_mrs(
            project_id, start_date, end_date, site_id, developer_id
        )
        sum_review_time = self._sum_review_time(
            project_id, start_date, end_date, site_id, developer_id
        )

        # Dénominateur — protection division par zéro
        denom = max(nb_devs, 1)

        # ✅ FIX : calcul explicite séparé pour chaque KPI
        # AVANT : walrus operator créait nb_mrs_devs = nb_mrs/denom jamais réutilisée
        #         et commit_rate_per_site utilisait par erreur nb_mrs au lieu de nb_commits_devs

        # KPI #1 : MR Rate = NB MRs non-draft / NB développeurs
        mr_rate_per_site = round(nb_mrs / denom, 4)

        # KPI #3 : Approved MR Rate = NB approuvées / NB créées
        approved_mr_rate = round(nb_mrs_approved / nb_mrs, 4) if nb_mrs > 0 else 0.0

        # KPI #4 : Merged MR Rate = NB mergées / NB approuvées
        merged_mr_rate = round(nb_mrs_merged / nb_mrs_approved, 4) if nb_mrs_approved > 0 else 0.0

        # KPI #5 : Commit Rate = NB commits devs validés / NB développeurs
        # ✅ FIX : nb_commits_devs (pas nb_mrs) comme numérateur
        commit_rate_per_site = round(nb_commits_devs / denom, 4)

        # KPI #7 : Temps moyen de relecture
        avg_review_time_hours = round(sum_review_time / nb_mrs_approved, 2) if nb_mrs_approved > 0 else 0.0

        return {
            # ── KPIs calculés ─────────────────────────────────────────────────
            # KPI #1 : MR Rate par site = NB MRs non-draft / NB développeurs
            "mr_rate_per_site":       mr_rate_per_site,
            # KPI #3 : Approved MR Rate = NB approuvées / NB créées
            "approved_mr_rate":       approved_mr_rate,
            # KPI #4 : Merged MR Rate = NB mergées / NB approuvées
            "merged_mr_rate":         merged_mr_rate,
            # KPI #5 : Commit Rate = NB commits devs validés / NB développeurs
            "commit_rate_per_site":   commit_rate_per_site,
            # KPI #6 : NB commits du projet (brut, tous contributeurs)
            "nb_commits_per_project": nb_commits_project,
            # KPI #7 : Temps moyen de relecture
            "avg_review_time_hours":  avg_review_time_hours,
            # ── Compteurs bruts (stockés pour re-calcul et audit) ─────────────
            "nb_developers":      nb_devs,
            "total_commits":      nb_commits_devs,    # commits des devs validés
            "total_mrs_created":  nb_mrs,
            "total_mrs_approved": nb_mrs_approved,
            "total_mrs_merged":   nb_mrs_merged,
            "review_time_hours":  round(sum_review_time, 2),  # somme brute KPI #7
            # ── Clés de contexte (filtrées dans upsert) ───────────────────────
            "site_id":       site_id,
            "developer_id":  developer_id,
            "project_id":    project_id,
            "period_start":  start_date.isoformat(),
            "period_end":    end_date.isoformat(),
        }

    # =========================================================================
    # HELPERS INTERNES
    # =========================================================================

    def _validated_dev_ids(
        self,
        project_id:   int,
        site_id:      Optional[int],
        developer_id: Optional[int],
    ):
        """
        Sous-requête retournant les IDs des développeurs valides dans le périmètre.
        Utilisée en EXISTS/IN pour éviter les LEFT JOINs qui polluent les comptages.
        """
        q = (
            self.db.query(Developer.id)
            .filter(
                Developer.project_id    == project_id,
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        )
        if site_id is not None:
            q = q.filter(Developer.site_id == site_id)
        if developer_id is not None:
            q = q.filter(Developer.id == developer_id)
        return q.subquery()

    def _count_developers(
        self,
        project_id:   int,
        site_id:      Optional[int],
        developer_id: Optional[int],
    ) -> int:
        """
        Compte les développeurs validés et non-bots dans le périmètre.
        Pour un snapshot individuel (developer_id != None) → retourne 1.
        """
        if developer_id is not None:
            # Vérification que le dev est bien valide dans ce projet
            exists = (
                self.db.query(Developer.id)
                .filter(
                    Developer.id         == developer_id,
                    Developer.project_id == project_id,
                    Developer.is_validated.is_(True),
                    Developer.is_bot.is_(False),
                    Developer.is_active.is_(True),
                )
                .first()
            )
            return 1 if exists else 0

        q = (
            self.db.query(func.count(Developer.id))
            .filter(
                Developer.project_id    == project_id,
                Developer.is_validated.is_(True),
                Developer.is_bot.is_(False),
                Developer.is_active.is_(True),
            )
        )
        if site_id is not None:
            q = q.filter(Developer.site_id == site_id)
        return q.scalar() or 0

    def _count_all_project_commits(
        self,
        project_id: int,
        start_date: datetime,
        end_date:   datetime,
    ) -> int:
        """
        KPI #6 : TOUS les commits du projet sur la période, sans filtre dev.
        Mesure l'activité brute du composant logiciel.
        """
        return (
            self.db.query(func.count(Commit.id))
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
            )
            .scalar() or 0
        )

    def _count_commits_by_devs(
        self,
        project_id:   int,
        start_date:   datetime,
        end_date:     datetime,
        site_id:      Optional[int],
        developer_id: Optional[int],
    ) -> int:
        """
        KPI #5 : commits des développeurs validés (INNER JOIN → pas de bots).
        ✅ FIX : INNER JOIN (pas isouter) — exclut commits sans dev ou dev non valide.
        """
        valid_ids = self._validated_dev_ids(project_id, site_id, developer_id)
        return (
            self.db.query(func.count(Commit.id))
            .filter(
                Commit.project_id    == project_id,
                Commit.authored_date >= start_date,
                Commit.authored_date <  end_date,
                Commit.developer_id.in_(valid_ids),  # INNER — exclut NULL et non-valides
            )
            .scalar() or 0
        )

    def _count_mrs(
        self,
        project_id:   int,
        start_date:   datetime,
        end_date:     datetime,
        site_id:      Optional[int],
        developer_id: Optional[int],
    ) -> int:
        """KPI #1, #3 : MRs non-draft créées par des devs validés."""
        valid_ids = self._validated_dev_ids(project_id, site_id, developer_id)
        return (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.developer_id.in_(valid_ids),
            )
            .scalar() or 0
        )

    def _count_approved_mrs(
        self,
        project_id:   int,
        start_date:   datetime,
        end_date:     datetime,
        site_id:      Optional[int],
        developer_id: Optional[int],
    ) -> int:
        """KPI #3 numérateur : MRs approuvées."""
        valid_ids = self._validated_dev_ids(project_id, site_id, developer_id)
        return (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.approved.is_(True),
                MergeRequest.developer_id.in_(valid_ids),
            )
            .scalar() or 0
        )

    def _count_merged_mrs(
        self,
        project_id:   int,
        start_date:   datetime,
        end_date:     datetime,
        site_id:      Optional[int],
        developer_id: Optional[int],
    ) -> int:
        """KPI #4 numérateur : MRs mergées."""
        valid_ids = self._validated_dev_ids(project_id, site_id, developer_id)
        return (
            self.db.query(func.count(MergeRequest.id))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.merged_at.isnot(None),
                MergeRequest.developer_id.in_(valid_ids),
            )
            .scalar() or 0
        )

    def _sum_review_time(
        self,
        project_id:   int,
        start_date:   datetime,
        end_date:     datetime,
        site_id:      Optional[int],
        developer_id: Optional[int],
    ) -> float:
        """
        KPI #7 : SOMME (pas moyenne) des review_time_hours.
        La moyenne est calculée dans calculate_project_kpis() pour pouvoir
        stocker la somme brute dans le snapshot (utile pour ré-agréger).
        """
        valid_ids = self._validated_dev_ids(project_id, site_id, developer_id)
        result = (
            self.db.query(func.sum(MergeRequest.review_time_hours))
            .filter(
                MergeRequest.project_id        == project_id,
                MergeRequest.created_at_gitlab >= start_date,
                MergeRequest.created_at_gitlab <  end_date,
                MergeRequest.is_draft.is_(False),
                MergeRequest.review_time_hours.isnot(None),
                MergeRequest.developer_id.in_(valid_ids),
            )
            .scalar()
        )
        return float(result or 0.0)