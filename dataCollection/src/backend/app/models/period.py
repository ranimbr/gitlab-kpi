"""
models/period.py — version corrigée
"""
from sqlalchemy import (
    Column, Integer, DateTime, UniqueConstraint,
    CheckConstraint, Enum, Index, ForeignKey, JSON
)
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

    closed_by       = relationship("AppUser")
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