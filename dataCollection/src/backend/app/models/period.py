from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint, CheckConstraint, Index
from sqlalchemy.orm import relationship
import enum
from sqlalchemy import Enum

from app.models.base import Base


class PeriodStatusEnum(str, enum.Enum):
    open   = "open"
    closed = "closed"


class Period(Base):
    """
    Représente un mois calendaire (année + mois).
    Le statut open/closed contrôle si des extractions sont possibles.
    - open   : extractions REALTIME autorisées
    - closed : période verrouillée, snapshot définitif généré
    
    Règle métier RG-01 : toute tentative d'extraction sur une période
    closed doit être rejetée avec HTTP 409 Conflict.
    """
    __tablename__ = "period"

    id        = Column(Integer, primary_key=True, index=True)
    year      = Column(Integer, nullable=False)
    month     = Column(Integer, nullable=False)
    status    = Column(Enum(PeriodStatusEnum), default=PeriodStatusEnum.open, nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # Relations
    extraction_lots = relationship("ExtractionLot", back_populates="period", cascade="all, delete-orphan")
    kpi_snapshots   = relationship("KpiSnapshot", back_populates="period", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_period_year_month"),
        CheckConstraint("month >= 1 AND month <= 12", name="chk_period_month_valid"),
        CheckConstraint("year >= 2000", name="chk_period_year_valid"),
    )