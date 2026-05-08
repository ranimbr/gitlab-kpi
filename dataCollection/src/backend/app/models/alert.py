"""
models/alert.py

Historique des alertes déclenchées lors du dépassement d'un seuil KPI.

CORRECTIONS MAJEURES (remarques encadrant) :
─────────────────────────────────────────────
1. AJOUT de developer_id (FK nullable) :
   Une alerte peut concerner un développeur spécifique.
   Exemples :
     - Développeur avec 0 commit depuis 2 semaines
     - Temps de review d'un développeur > seuil critique
     - Chute soudaine du score d'un développeur
   NULL = alerte au niveau site/projet (non individuelle).

2. Relation vers Developer ajoutée.

CORRECTIONS TECHNIQUES (conservées) :
──────────────────────────────────────
3. Suppression des index=True redondants.
4. Index composite pour les requêtes fréquentes.

Cycle de vie :
    1. Déclenchement auto  → is_resolved=False, acknowledged_by=None
    2. Prise en charge      → acknowledged_by=user_id, acknowledged_at=now()
    3. Résolution           → is_resolved=True
"""

from sqlalchemy import (
    Column, Integer, Float, Boolean, DateTime,
    ForeignKey, Enum, Index,
)
from sqlalchemy.orm import relationship
import enum
from typing import Optional

from app.models.base import Base


class AlertLevelEnum(str, enum.Enum):
    WARNING  = "WARNING"
    CRITICAL = "CRITICAL"


class Alert(Base):

    __tablename__ = "alert"

    id              = Column(Integer, primary_key=True)
    level           = Column(Enum(AlertLevelEnum), nullable=False)
    kpi_value       = Column(Float, nullable=False)
    threshold_value = Column(Float, nullable=False)
    triggered_at    = Column(DateTime(timezone=True), nullable=False)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    is_resolved     = Column(Boolean, default=False, nullable=False)

    # ── Clés étrangères ──────────────────────────────────────────────────────
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
    # ✅ AJOUT : alerte liée à un développeur individuel (nullable)
    # NULL = alerte globale (site/projet), non individuelle
    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="SET NULL"),
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
    # ✅ AJOUT : relation vers Developer
    developer = relationship(
        "Developer",
        back_populates="alerts",
        foreign_keys=[developer_id],
    )

    @property
    def acknowledged_by_name(self) -> Optional[str]:
        return self.acknowledger.name if self.acknowledger else None

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_alert_threshold",         "threshold_id"),
        Index("idx_alert_snapshot",          "kpi_snapshot_id"),
        Index("idx_alert_acknowledged_by",   "acknowledged_by"),
        Index("idx_alert_level",             "level"),
        Index("idx_alert_resolved",          "is_resolved"),
        Index("idx_alert_triggered_at",      "triggered_at"),
        # ✅ AJOUT : alertes d'un développeur spécifique
        Index("idx_alert_developer",         "developer_id"),
        # Alertes non résolues récentes (requête dashboard)
        Index("idx_alert_unresolved_recent", "is_resolved", "triggered_at"),
        # Alertes non résolues d'un développeur
        Index("idx_alert_dev_unresolved",    "developer_id", "is_resolved"),
    )