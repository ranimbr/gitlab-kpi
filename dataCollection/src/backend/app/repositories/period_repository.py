"""repositories/period_repository.py — inchangé fonctionnellement."""
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.period import Period, PeriodStatusEnum
from app.repositories.base import BaseRepository


class PeriodRepository(BaseRepository[Period]):

    def __init__(self):
        super().__init__(Period)

    def get_by_year_month(self, db: Session, year: int, month: int) -> Optional[Period]:
        return db.query(Period).filter(Period.year == year, Period.month == month).one_or_none()

    def get_current_period(self, db: Session) -> Optional[Period]:
        now = datetime.now(timezone.utc)
        return self.get_by_year_month(db, now.year, now.month)

    def get_open_periods(self, db: Session) -> List[Period]:
        return db.query(Period).filter(Period.status == PeriodStatusEnum.open).all()

    def is_open(self, db: Session, period_id: int) -> bool:
        period = self.get_by_id(db, period_id)
        return period is not None and period.status == PeriodStatusEnum.open

    def close_period(self, db: Session, period: Period) -> Period:
        period.status    = PeriodStatusEnum.closed
        period.closed_at = datetime.now(timezone.utc)
        db.flush()
        return period

    def get_or_create(self, db: Session, year: int, month: int) -> Period:
        period = self.get_by_year_month(db, year, month)
        if not period:
            period = Period(year=year, month=month, status=PeriodStatusEnum.open)
            db.add(period)
            db.flush()
        return period