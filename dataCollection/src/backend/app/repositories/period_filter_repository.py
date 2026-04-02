"""repositories/period_filter_repository.py """
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.period_filter import PeriodFilter, PeriodFilterTypeEnum
from app.repositories.base import BaseRepository


class PeriodFilterRepository(BaseRepository[PeriodFilter]):

    def __init__(self):
        super().__init__(PeriodFilter)

    def get_by_dashboard(self, db: Session, dashboard_id: int) -> List[PeriodFilter]:
        return (
            db.query(PeriodFilter)
            .filter(PeriodFilter.dashboard_id == dashboard_id)
            .order_by(PeriodFilter.created_at.desc())
            .all()
        )

    def get_active_filter(self, db: Session, dashboard_id: int) -> Optional[PeriodFilter]:
        """Retourne le filtre le plus récent d'un dashboard."""
        return (
            db.query(PeriodFilter)
            .filter(PeriodFilter.dashboard_id == dashboard_id)
            .order_by(PeriodFilter.created_at.desc())
            .first()
        )

    def get_by_type(
        self, db: Session, dashboard_id: int, filter_type: PeriodFilterTypeEnum
    ) -> Optional[PeriodFilter]:
        return (
            db.query(PeriodFilter)
            .filter(
                PeriodFilter.dashboard_id == dashboard_id,
                PeriodFilter.type         == filter_type,
            )
            .one_or_none()
        )

    def create(self, db: Session, data: dict) -> PeriodFilter:
        pf = PeriodFilter(**data)
        db.add(pf)
        db.flush()
        return pf