from sqlalchemy.orm import Session
from typing import Optional, List

from app.models.kpi_threshold import KpiThreshold
from app.repositories.base import BaseRepository


class KpiThresholdRepository(BaseRepository[KpiThreshold]):

    def __init__(self):
        super().__init__(KpiThreshold)

    # ─────────────────────────────────────────────────────────────────────────

    def get_by_project(
        self,
        db:         Session,
        project_id: int,
    ) -> List[KpiThreshold]:
        """Retourne tous les seuils configurés pour un projet."""
        return (
            db.query(KpiThreshold)
            .filter(KpiThreshold.project_id == project_id)
            .order_by(KpiThreshold.kpi_name)
            .all()
        )

    def get_by_project_and_kpi(
        self,
        db:         Session,
        project_id: int,
        kpi_name:   str,
    ) -> Optional[KpiThreshold]:
        """Retourne le seuil d'un KPI spécifique pour un projet."""
        return (
            db.query(KpiThreshold)
            .filter(
                KpiThreshold.project_id == project_id,
                KpiThreshold.kpi_name   == kpi_name,
            )
            .one_or_none()
        )

    def get_by_id(
        self,
        db:           Session,
        threshold_id: int,
    ) -> Optional[KpiThreshold]:
        """Retourne un seuil par son ID."""
        return (
            db.query(KpiThreshold)
            .filter(KpiThreshold.id == threshold_id)
            .one_or_none()
        )

    def exists(
        self,
        db:         Session,
        project_id: int,
        kpi_name:   str,
    ) -> bool:
        """Vérifie si un seuil existe déjà pour ce KPI/projet."""
        return (
            self.get_by_project_and_kpi(db, project_id, kpi_name)
            is not None
        )

    def upsert(
        self,
        db:         Session,
        project_id: int,
        kpi_name:   str,
        data:       dict,
    ) -> KpiThreshold:
        """
        Crée ou met à jour un seuil.
        Clé unique : (project_id, kpi_name).
        Attention : le commit() est à la charge de l'appelant.
        """
        existing = self.get_by_project_and_kpi(db, project_id, kpi_name)

        if existing:
            for key, value in data.items():
                if key not in {"project_id", "kpi_name"}:
                    setattr(existing, key, value)
            return existing

        threshold = KpiThreshold(**data)
        db.add(threshold)
        return threshold
