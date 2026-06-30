"""
models/period.py — version corrigée
"""
from sqlalchemy import (
    Column, Integer, DateTime, UniqueConstraint,
    CheckConstraint, Enum, Index, ForeignKey, JSON
)
from typing import Optional
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class PeriodStatusEnum(str, enum.Enum):
    open   = "open"
    closed = "closed"


class Period(Base):
    """
    Représente un mois calendaire (année + mois).

    RG-01 : toute extraction sur une période closed → HTTP 409 Conflict.
    Le statut closed est irréversible une fois positionné.
    """

    __tablename__ = "period"

    id        = Column(Integer, primary_key=True)
    year      = Column(Integer, nullable=False)
    month     = Column(Integer, nullable=False)
    status    = Column(Enum(PeriodStatusEnum), default=PeriodStatusEnum.open, nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # ── [SENIOR GRADE] Audit & Gouvernance ───────────────────────────────────
    closed_by_id    = Column(Integer, ForeignKey("app_user.id"), nullable=True)
    closure_summary = Column(JSON, nullable=True, comment="Checklist de validation pré-clôture")
    # [ENTERPRISE] Effectif figé au moment de la clôture MONTHLY
    # Ce chiffre est IMMUTABLE une fois la période fermée.
    # Les KPIs historiques l'utilisent toujours, même si des devs sont désactivés après.
    headcount_snapshot = Column(
        Integer, 
        nullable=True,
        comment="Nombre de devs actifs figé au moment de la clôture (règle 15j appliquée)"
    )

    closed_by       = relationship("AppUser", foreign_keys=[closed_by_id])

    @property
    def start_date(self):
        """Retourne le premier jour du mois de la période avec heure 00:00:00."""
        from datetime import datetime
        return datetime(self.year, self.month, 1, 0, 0, 0)

    @property
    def end_date(self):
        """Retourne le dernier jour du mois de la période avec heure 23:59:59."""
        from datetime import datetime
        import calendar
        last_day = calendar.monthrange(self.year, self.month)[1]
        return datetime(self.year, self.month, last_day, 23, 59, 59)
    # ──────────────────────────────────────────────────────────────────────────

    extraction_lots = relationship("ExtractionLot", back_populates="period", cascade="all, delete-orphan")
    kpi_snapshots   = relationship("KpiSnapshot",   back_populates="period", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_period_year_month"),
        CheckConstraint("month >= 1 AND month <= 12", name="chk_period_month"),
        CheckConstraint("year  >= 2000",              name="chk_period_year"),
        Index("idx_period_status", "status"),
        Index("idx_period_year_month", "year", "month"),
    )