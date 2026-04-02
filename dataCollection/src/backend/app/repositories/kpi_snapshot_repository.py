"""
repositories/kpi_snapshot_repository.py

CORRECTIONS :

    1. AJOUT CRITIQUE — get_for_period() manquant.
       Appelé par KpiAggregator._upsert_with_deltas() pour récupérer le
       snapshot du mois précédent et calculer les deltas.
       Sans cette méthode : AttributeError à l'exécution → deltas jamais calculés.

    2. FIX — get_latest() : incohérence dans le filtrage NULL.
       AVANT : site_id=None → filtre IS NULL ✅
               group_id=None → PAS de filtre ❌ (retourne snapshots avec n'importe quel group_id)
               developer_id=None → PAS de filtre ❌ (idem)
       APRÈS : tous les champs NULLables appliquent IS NULL quand None est fourni.
       Logique : si l'appelant ne filtre pas sur group_id → il veut les snapshots
       sans group (IS NULL), pas tous les snapshots confondus.

    3. FIX — get_project_history() : même incohérence sur group_id et developer_id.
       Corrigé avec la même logique IS NULL.

    4. AJOUT — get_site_comparison() : requête d'analyse comparative entre sites
       pour une même période → "top performers" sur le dashboard.

    5. AJOUT — get_developers_ranking() : classement des développeurs par KPI
       sur une période → "top/bottom developers" pour la prise de décision.
"""
from datetime import date
from typing import Optional, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.kpi_snapshot import KpiSnapshot
from app.repositories.base import BaseRepository


class KpiSnapshotRepository(BaseRepository[KpiSnapshot]):

    def __init__(self):
        super().__init__(KpiSnapshot)

    # =========================================================================
    # LOOKUP PRINCIPAL (clé d'unicité)
    # =========================================================================

    def get_by_project_period_site(
        self,
        db:           Session,
        project_id:   int,
        period_id:    int,
        site_id:      Optional[int] = None,
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> Optional[KpiSnapshot]:
        """
        Lookup par clé unique (project, period, site, group, developer).
        None → filtre IS NULL (pas "tous les snapshots").
        Utilisé par upsert() pour éviter les doublons.
        """
        q = db.query(KpiSnapshot).filter(
            KpiSnapshot.project_id == project_id,
            KpiSnapshot.period_id  == period_id,
        )
        # ✅ None → IS NULL (comportement intentionnel pour chaque dimension)
        q = q.filter(
            KpiSnapshot.site_id.is_(None)
            if site_id is None
            else KpiSnapshot.site_id == site_id
        )
        q = q.filter(
            KpiSnapshot.group_id.is_(None)
            if group_id is None
            else KpiSnapshot.group_id == group_id
        )
        q = q.filter(
            KpiSnapshot.developer_id.is_(None)
            if developer_id is None
            else KpiSnapshot.developer_id == developer_id
        )
        return q.one_or_none()

    # =========================================================================
    # NOUVEAU — get_for_period() requis par KpiAggregator pour les deltas
    # =========================================================================

    def get_for_period(
        self,
        db:           Session,
        project_id:   int,
        period_id:    int,
        site_id:      Optional[int] = None,
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> Optional[KpiSnapshot]:
        """
        ✅ NOUVEAU — alias de get_by_project_period_site().
        Appelé par KpiAggregator._upsert_with_deltas() pour récupérer
        le snapshot du mois précédent et calculer les deltas (trend indicators).

        Sans cette méthode : AttributeError dans kpi_aggregator.py
        → tous les deltas restent NULL.
        """
        return self.get_by_project_period_site(
            db           = db,
            project_id   = project_id,
            period_id    = period_id,
            site_id      = site_id,
            group_id     = group_id,
            developer_id = developer_id,
        )

    # =========================================================================
    # LATEST
    # =========================================================================

    def get_latest(
        self,
        db:           Session,
        project_id:   int,
        site_id:      Optional[int] = None,
        group_id:     Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> Optional[KpiSnapshot]:
        """
        Dernier snapshot par date pour un périmètre donné.

        ✅ FIX : cohérence des filtres NULL sur tous les champs.
        AVANT : group_id=None et developer_id=None ne filtraient pas → snapshots mixtes.
        APRÈS : None → IS NULL sur tous les champs NULLables.
        """
        q = db.query(KpiSnapshot).filter(KpiSnapshot.project_id == project_id)

        # ✅ FIX : IS NULL cohérent sur les 3 dimensions
        q = q.filter(
            KpiSnapshot.site_id.is_(None)
            if site_id is None
            else KpiSnapshot.site_id == site_id
        )
        q = q.filter(
            KpiSnapshot.group_id.is_(None)
            if group_id is None
            else KpiSnapshot.group_id == group_id
        )
        q = q.filter(
            KpiSnapshot.developer_id.is_(None)
            if developer_id is None
            else KpiSnapshot.developer_id == developer_id
        )

        return q.order_by(KpiSnapshot.snapshot_date.desc()).first()

    # =========================================================================
    # HISTORY
    # =========================================================================

    def get_project_history(
        self,
        db:           Session,
        project_id:   int,
        site_id:      Optional[int]  = None,
        group_id:     Optional[int]  = None,
        developer_id: Optional[int]  = None,
        start_date:   Optional[date] = None,
        end_date:     Optional[date] = None,
    ) -> List[KpiSnapshot]:
        """
        Historique chronologique pour les graphiques d'évolution.

        ✅ FIX : même cohérence IS NULL que get_latest().
        Permet de tracer l'évolution mensuelle d'un KPI pour un dev/site donné.
        """
        q = db.query(KpiSnapshot).filter(KpiSnapshot.project_id == project_id)

        # ✅ FIX : IS NULL cohérent
        q = q.filter(
            KpiSnapshot.site_id.is_(None)
            if site_id is None
            else KpiSnapshot.site_id == site_id
        )
        q = q.filter(
            KpiSnapshot.group_id.is_(None)
            if group_id is None
            else KpiSnapshot.group_id == group_id
        )
        q = q.filter(
            KpiSnapshot.developer_id.is_(None)
            if developer_id is None
            else KpiSnapshot.developer_id == developer_id
        )

        if start_date:
            q = q.filter(KpiSnapshot.snapshot_date >= start_date)
        if end_date:
            q = q.filter(KpiSnapshot.snapshot_date <= end_date)

        return q.order_by(KpiSnapshot.snapshot_date.asc()).all()

    # =========================================================================
    # PAR DIMENSION
    # =========================================================================

    def get_by_site_id(
        self,
        db:        Session,
        site_id:   int,
        period_id: Optional[int] = None,
    ) -> List[KpiSnapshot]:
        q = db.query(KpiSnapshot).filter(KpiSnapshot.site_id == site_id)
        if period_id is not None:
            q = q.filter(KpiSnapshot.period_id == period_id)
        return q.order_by(KpiSnapshot.snapshot_date.desc()).all()

    def get_by_developer_id(
        self,
        db:           Session,
        developer_id: int,
        project_id:   Optional[int] = None,
    ) -> List[KpiSnapshot]:
        q = db.query(KpiSnapshot).filter(KpiSnapshot.developer_id == developer_id)
        if project_id is not None:
            q = q.filter(KpiSnapshot.project_id == project_id)
        return q.order_by(KpiSnapshot.snapshot_date.desc()).all()

    def get_by_group_id(
        self,
        db:        Session,
        group_id:  int,
        period_id: Optional[int] = None,
    ) -> List[KpiSnapshot]:
        q = db.query(KpiSnapshot).filter(KpiSnapshot.group_id == group_id)
        if period_id is not None:
            q = q.filter(KpiSnapshot.period_id == period_id)
        return q.order_by(KpiSnapshot.snapshot_date.desc()).all()

    def get_all_by_period(
        self,
        db:        Session,
        period_id: int,
    ) -> List[KpiSnapshot]:
        return (
            db.query(KpiSnapshot)
            .filter(KpiSnapshot.period_id == period_id)
            .order_by(KpiSnapshot.project_id, KpiSnapshot.site_id)
            .all()
        )

    # =========================================================================
    # ANALYTIQUE — vue comparative (top/bottom performers)
    # =========================================================================

    def get_site_comparison(
        self,
        db:         Session,
        project_id: int,
        period_id:  int,
        kpi_field:  str = "mr_rate_per_site",
    ) -> List[KpiSnapshot]:
        """
        ✅ NOUVEAU — Comparaison inter-sites pour un projet et une période.
        Retourne les snapshots de niveau site (developer_id IS NULL, group_id IS NULL)
        triés par la valeur du KPI demandé.

        Usage : dashboard "Top sites par approved_mr_rate ce mois-ci"
        kpi_field : "mr_rate_per_site" | "approved_mr_rate" | "merged_mr_rate" |
                    "commit_rate_per_site" | "avg_review_time_hours"
        """
        # Validation pour éviter l'injection SQL via kpi_field
        allowed_fields = {
            "mr_rate_per_site", "approved_mr_rate", "merged_mr_rate",
            "commit_rate_per_site", "nb_commits_per_project", "avg_review_time_hours",
        }
        if kpi_field not in allowed_fields:
            raise ValueError(f"kpi_field '{kpi_field}' non autorisé. Valeurs: {allowed_fields}")

        return (
            db.query(KpiSnapshot)
            .filter(
                KpiSnapshot.project_id    == project_id,
                KpiSnapshot.period_id     == period_id,
                KpiSnapshot.site_id.isnot(None),         # niveau site uniquement
                KpiSnapshot.developer_id.is_(None),      # pas les snapshots individuels
                KpiSnapshot.group_id.is_(None),
            )
            .order_by(getattr(KpiSnapshot, kpi_field).desc())
            .all()
        )

    def get_developers_ranking(
        self,
        db:           Session,
        project_id:   int,
        period_id:    int,
        kpi_field:    str           = "mr_rate_per_site",
        site_id:      Optional[int] = None,
        limit:        int           = 10,
        ascending:    bool          = False,
    ) -> List[KpiSnapshot]:
        """
        ✅ NOUVEAU — Classement des développeurs par KPI.
        Retourne les snapshots individuels (developer_id IS NOT NULL)
        triés par valeur KPI pour identifier les top/bottom performers.

        ascending=True  → bottom performers (review_time élevé, mr_rate bas...)
        ascending=False → top performers (mr_rate élevé, approved_rate élevé...)

        Usage :
            # Top 5 développeurs par MR Rate ce mois
            get_developers_ranking(db, project_id=1, period_id=3, kpi_field="mr_rate_per_site")

            # Bottom 5 par temps de revue (les plus lents)
            get_developers_ranking(db, project_id=1, period_id=3,
                                   kpi_field="avg_review_time_hours", ascending=False)
        """
        allowed_fields = {
            "mr_rate_per_site", "approved_mr_rate", "merged_mr_rate",
            "commit_rate_per_site", "nb_commits_per_project", "avg_review_time_hours",
            "developer_score", "score_rank_in_site",
        }
        if kpi_field not in allowed_fields:
            raise ValueError(f"kpi_field '{kpi_field}' non autorisé.")

        col = getattr(KpiSnapshot, kpi_field)
        order = col.asc() if ascending else col.desc()

        q = (
            db.query(KpiSnapshot)
            .filter(
                KpiSnapshot.project_id       == project_id,
                KpiSnapshot.period_id        == period_id,
                KpiSnapshot.developer_id.isnot(None),   # snapshots individuels uniquement
            )
        )
        if site_id is not None:
            q = q.filter(KpiSnapshot.site_id == site_id)

        return q.order_by(order).limit(limit).all()

    # =========================================================================
    # UPSERT
    # =========================================================================

    def upsert(self, db: Session, data: dict) -> KpiSnapshot:
        """
        Crée ou met à jour un snapshot.
        Clé d'unicité : (project_id, period_id, site_id, group_id, developer_id).
        Champs de clé exclus de la mise à jour (évite de changer la clé d'un existant).
        """
        existing = self.get_by_project_period_site(
            db,
            project_id   = data["project_id"],
            period_id    = data["period_id"],
            site_id      = data.get("site_id"),
            group_id     = data.get("group_id"),
            developer_id = data.get("developer_id"),
        )

        if existing:
            # Ne pas écraser les clés de lookup
            excluded = {"project_id", "period_id", "site_id", "group_id", "developer_id"}
            for key, value in data.items():
                if key not in excluded:
                    setattr(existing, key, value)
            db.flush()
            return existing

        snapshot = KpiSnapshot(**data)
        db.add(snapshot)
        db.flush()
        return snapshot