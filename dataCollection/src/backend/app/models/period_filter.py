"""
models/period_filter.py — version corrigée


"""
from sqlalchemy import (
    Column, Integer, Boolean, DateTime,
    ForeignKey, Enum, Index, CheckConstraint,
)
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class PeriodFilterTypeEnum(str, enum.Enum):
    realTime    = "realTime"
    lastMonth   = "lastMonth"
    last3Months = "last3Months"
    last6Months = "last6Months"
    lastYear    = "lastYear"
    custom      = "custom"


class PeriodFilter(Base):
    """
    Filtre de période configurable par dashboard.

    Types dynamiques (is_dynamic=True) : date_from/date_to calculés à la volée.
    Type custom (is_dynamic=False)     : date_from/date_to saisis manuellement.

    ⚠️  Règle métier : si type='custom', date_from ET date_to sont obligatoires.
    Validé côté service (PeriodFilterService.validate_custom_dates()).
    """

    __tablename__ = "period_filter"

    id         = Column(Integer, primary_key=True)
    type       = Column(
        Enum(PeriodFilterTypeEnum),
        default=PeriodFilterTypeEnum.lastMonth,
        nullable=False,
    )
    date_from  = Column(DateTime(timezone=True), nullable=True)
    date_to    = Column(DateTime(timezone=True), nullable=True)
    is_dynamic = Column(Boolean, default=True, nullable=False)

    # DISABLED: Dashboard functionality removed
    # dashboard_id = Column(
    #     Integer,
    #     ForeignKey("dashboard.id", ondelete="CASCADE"),
    #     nullable=False,
    # )
    #
    # dashboard = relationship("Dashboard", back_populates="period_filters")

    __table_args__ = (
        Index("idx_period_filter_type",      "type"),
        # ✅ AJOUT : contrainte DB — custom sans dates est incohérent
        # Note : PostgreSQL supporte les expressions dans CHECK
        CheckConstraint(
            "(type != 'custom') OR (date_from IS NOT NULL AND date_to IS NOT NULL)",
            name="chk_custom_period_requires_dates",
        ),
        # ✅ AJOUT : date_from doit être avant date_to si les deux sont renseignés
        CheckConstraint(
            "(date_from IS NULL) OR (date_to IS NULL) OR (date_from < date_to)",
            name="chk_period_date_range_valid",
        ),
    )