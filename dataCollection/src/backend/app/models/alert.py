"""
models/alert.py

Historique des alertes déclenchées lors du dépassement d'un seuil KPI.

Cycle de vie :
    1. Déclenchement auto  → is_resolved=False, acknowledged_by=None
    2. Prise en charge     → acknowledged_by=user_id, acknowledged_at=now()
    3. Résolution          → is_resolved=True

CORRECTION : suppression des index redondants.
    Avant : Column(..., index=True) + Index("nom", col) sur la MÊME colonne
            → PostgreSQL créait DEUX index identiques (gaspillage d'I/O).
    Après : index=True supprimé sur les colonnes qui ont un Index() nommé.
            Seuls les Index() nommés subsistent → un seul index par colonne.
"""

from sqlalchemy import (
    Column, Integer, Float, Boolean, DateTime,
    ForeignKey, Enum, Index,
)
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class AlertLevelEnum(str, enum.Enum):
    WARNING  = "WARNING"
    CRITICAL = "CRITICAL"


class Alert(Base):

    __tablename__ = "alert"

    id              = Column(Integer, primary_key=True)
    # ✅ index=True SUPPRIMÉ → Index nommé dans __table_args__
    level           = Column(Enum(AlertLevelEnum), nullable=False)
    kpi_value       = Column(Float, nullable=False)
    threshold_value = Column(Float, nullable=False)
    triggered_at    = Column(DateTime(timezone=True), nullable=False)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    is_resolved     = Column(Boolean, default=False, nullable=False)

    # FKs — index=True supprimé, remplacé par les Index nommés ci-dessous
    threshold_id = Column(
        Integer,
        ForeignKey("kpi_threshold.id", ondelete="CASCADE"),
        nullable=False,
    )
    kpi_snapshot_id = Column(
        Integer,
        ForeignKey("kpi_snapshot.id", ondelete="CASCADE"),
        nullable=False,
    )
    acknowledged_by = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    threshold    = relationship("KpiThreshold", back_populates="alerts")
    kpi_snapshot = relationship("KpiSnapshot",  back_populates="alerts")
    acknowledger = relationship(
        "AppUser",
        back_populates="acknowledged_alerts",
        foreign_keys=[acknowledged_by],
    )

    # ── Index nommés (un seul index par colonne) ─────────────────────────────
    __table_args__ = (
        Index("idx_alert_threshold",    "threshold_id"),
        Index("idx_alert_snapshot",     "kpi_snapshot_id"),
        Index("idx_alert_acknowledged_by", "acknowledged_by"),
        Index("idx_alert_level",        "level"),
        Index("idx_alert_resolved",     "is_resolved"),
        Index("idx_alert_triggered_at", "triggered_at"),
        # Index composite pour la requête la plus fréquente :
        # "toutes les alertes non résolues déclenchées après X"
        Index("idx_alert_unresolved_recent", "is_resolved", "triggered_at"),
    )