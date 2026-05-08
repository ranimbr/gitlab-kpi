"""
repositories/kpi_definition_repository.py

"""

from sqlalchemy.orm import Session
from typing import Optional, List

from app.models.kpi_definition import KpiDefinition, AggregationLevelEnum
from app.repositories.base import BaseRepository


class KpiDefinitionRepository(BaseRepository[KpiDefinition]):

    def __init__(self):
        super().__init__(KpiDefinition)

    # ─────────────────────────────────────────────────────────────────────────
    # READ
    # ─────────────────────────────────────────────────────────────────────────

    def get_by_code(
        self,
        db:   Session,
        code: str,
    ) -> Optional[KpiDefinition]:
        """Retourne un KPI par son code unique ex: 'AVG_REVIEW_TIME'."""
        return (
            db.query(KpiDefinition)
            .filter(KpiDefinition.code == code)
            .one_or_none()
        )

    def get_active(self, db: Session) -> List[KpiDefinition]:
        """Tous les KPIs actifs — pour peupler les dropdowns frontend."""
        return (
            db.query(KpiDefinition)
            .filter(KpiDefinition.is_active.is_(True))
            .order_by(KpiDefinition.code)
            .all()
        )

    def get_by_aggregation_level(
        self,
        db:    Session,
        level: AggregationLevelEnum,
    ) -> List[KpiDefinition]:
        return (
            db.query(KpiDefinition)
            .filter(
                KpiDefinition.aggregation_level == level,
                KpiDefinition.is_active.is_(True),
            )
            .order_by(KpiDefinition.code)
            .all()
        )

    def get_many_by_codes(
        self,
        db:    Session,
        codes: List[str],
    ) -> List[KpiDefinition]:
        """Récupère plusieurs KPIs par leurs codes en une seule requête."""
        if not codes:
            return []
        return (
            db.query(KpiDefinition)
            .filter(KpiDefinition.code.in_(codes))
            .all()
        )

    def code_exists(self, db: Session, code: str) -> bool:
        return (
            db.query(KpiDefinition.id)
            .filter(KpiDefinition.code == code)
            .first() is not None
        )

    # ─────────────────────────────────────────────────────────────────────────
    # WRITE
    # ─────────────────────────────────────────────────────────────────────────

    def get_or_create(
        self,
        db:   Session,
        code: str,
        data: dict,
    ) -> KpiDefinition:
        """
        Utilisé par init_db.py pour le seed des 6 KPIs actifs.
        Si le code existe déjà → retourne l'existant sans modification.
        Si absent → crée et flush.
        """
        existing = self.get_by_code(db, code)
        if existing:
            return existing
        kpi = KpiDefinition(**data)
        db.add(kpi)
        db.flush()
        return kpi