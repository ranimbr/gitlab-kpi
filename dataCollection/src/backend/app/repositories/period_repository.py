from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from app.models.period import Period, PeriodStatusEnum
from app.repositories.base import BaseRepository


class PeriodRepository(BaseRepository[Period]):

    def __init__(self):
        super().__init__(Period)

    def get_by_year_month(
        self, db: Session, year: int, month: int
    ) -> Optional[Period]:
        return (
            db.query(Period)
            .filter(Period.year == year, Period.month == month)
            .one_or_none()
        )

    def get_current_period(self, db: Session) -> Optional[Period]:
        now = datetime.utcnow()
        return self.get_by_year_month(db, now.year, now.month)

    def get_open_periods(self, db: Session) -> List[Period]:
        return (
            db.query(Period)
            .filter(Period.status == PeriodStatusEnum.open)
            .all()
        )

    def is_open(self, db: Session, period_id: int) -> bool:
        """
        Vérifie si une période est ouverte.
        Utilisé par ExtractionService (RG-01).
        """
        period = self.get_by_id(db, period_id)
        if not period:
            return False
        return period.status == PeriodStatusEnum.open

    def close_period(self, db: Session, period: Period) -> Period:
        """
        Clôture une période — aucune extraction ne sera
        plus possible après cette opération (RG-01).
        """
        period.status    = PeriodStatusEnum.closed
        period.closed_at = datetime.utcnow()
        return period

    def get_or_create(
        self, db: Session, year: int, month: int
    ) -> Period:
        """
        Retourne la période existante ou en crée une nouvelle ouverte.
        Utilisé par ExtractionService avant chaque extraction.
        """
        period = self.get_by_year_month(db, year, month)
        if not period:
            period = Period(year=year, month=month, status=PeriodStatusEnum.open)
            db.add(period)
            db.flush()
        return period