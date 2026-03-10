from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from datetime import date

from app.models.kpi_snapshot import KpiSnapshot
from app.repositories.base import BaseRepository


class KpiSnapshotRepository(BaseRepository[KpiSnapshot]):

    def __init__(self):
        super().__init__(KpiSnapshot)

    # ─────────────────────────────────────────────────────────────────────────
    # Helper interne
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _filter_site(query, site: Optional[str]):
        """
        [FIX] En SQLAlchemy, `col == None` génère `col = NULL` (invalide en SQL).
        Il faut utiliser `col.is_(None)` pour générer `col IS NULL`.
        Sans cette correction, tous les snapshots globaux (site=None) sont
        introuvables et le Dashboard KPI reste vide.
        """
        if site is None:
            return query.filter(KpiSnapshot.site.is_(None))
        return query.filter(KpiSnapshot.site == site)

    # ─────────────────────────────────────────────────────────────────────────

    def get_by_project_period_site(
        self,
        db:         Session,
        project_id: int,
        period_id:  int,
        site:       Optional[str] = None,
    ) -> Optional[KpiSnapshot]:
        """
        Retourne le snapshot unique pour (project_id, period_id, site).
        site=None → snapshot global projet.
        """
        q = (
            db.query(KpiSnapshot)
            .filter(
                KpiSnapshot.project_id == project_id,
                KpiSnapshot.period_id  == period_id,
            )
        )
        # [FIX] is_(None) au lieu de == None
        q = self._filter_site(q, site)
        return q.one_or_none()

    # ─────────────────────────────────────────────────────────────────────────

    def get_latest(
        self,
        db:         Session,
        project_id: int,
        site:       Optional[str] = None,
    ) -> Optional[KpiSnapshot]:
        """
        Retourne le snapshot le plus récent pour (project_id, site).
        site=None → snapshot global (site IS NULL).
        """
        q = (
            db.query(KpiSnapshot)
            .filter(KpiSnapshot.project_id == project_id)
        )
        # [FIX] is_(None) au lieu de == None
        q = self._filter_site(q, site)
        return q.order_by(KpiSnapshot.snapshot_date.desc()).first()

    # ─────────────────────────────────────────────────────────────────────────

    def get_project_history(
        self,
        db:         Session,
        project_id: int,
        site:       Optional[str]  = None,
        start_date: Optional[date] = None,
        end_date:   Optional[date] = None,
    ) -> List[KpiSnapshot]:
        """
        Retourne l'historique des snapshots pour les graphiques timeline.
        Filtrage start_date/end_date effectué en SQL.
        site=None → snapshots globaux uniquement (site IS NULL).
        """
        q = (
            db.query(KpiSnapshot)
            .filter(KpiSnapshot.project_id == project_id)
        )
        # [FIX] is_(None) au lieu de == None
        q = self._filter_site(q, site)

        if start_date:
            q = q.filter(KpiSnapshot.snapshot_date >= start_date)
        if end_date:
            q = q.filter(KpiSnapshot.snapshot_date <= end_date)

        return q.order_by(KpiSnapshot.snapshot_date.asc()).all()

    # ─────────────────────────────────────────────────────────────────────────

    def upsert(
        self,
        db:   Session,
        data: dict,
    ) -> KpiSnapshot:
        """
        Crée ou met à jour un snapshot.
        Clé unique : (project_id, period_id, site).
        """
        existing = self.get_by_project_period_site(
            db,
            data["project_id"],
            data["period_id"],
            data.get("site"),   # [FIX] correctement routé via _filter_site
        )

        if existing:
            excluded = {"project_id", "period_id", "site"}
            for key, value in data.items():
                if key not in excluded:
                    setattr(existing, key, value)
            return existing

        snapshot = KpiSnapshot(**data)
        db.add(snapshot)
        return snapshot

    # ─────────────────────────────────────────────────────────────────────────

    def get_all_by_period(
        self,
        db:        Session,
        period_id: int,
    ) -> List[KpiSnapshot]:
        """Retourne tous les snapshots d'une période (tous sites confondus)."""
        return (
            db.query(KpiSnapshot)
            .filter(KpiSnapshot.period_id == period_id)
            .order_by(KpiSnapshot.project_id, KpiSnapshot.site)
            .all()
        )