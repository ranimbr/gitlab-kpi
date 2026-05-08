"""
models/developer_status_history.py

"""

import enum
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey,
    Enum, Index, Text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class DeveloperStatusEnum(str, enum.Enum):
    """
    4 statuts métier validés :
    - ACTIVE     : Dev opérationnel → compté dans les KPIs
    - ON_LEAVE   : Congé maternité/maladie → EXCLU des KPIs (temporaire)
    - SUSPENDED  : Désactivé temporairement par manager → EXCLU des KPIs
    - OFFBOARDED : Départ définitif (démission, fin contrat) → EXCLU + archivé
    """
    ACTIVE     = "ACTIVE"
    ON_LEAVE   = "ON_LEAVE"
    SUSPENDED  = "SUSPENDED"
    OFFBOARDED = "OFFBOARDED"


class DeveloperStatusHistory(Base):
    """
    Log immuable de tous les changements de statut RH d'un développeur.

    Règle métier :
    - On ne SUPPRIME jamais un enregistrement ici (audit trail légal).
    - Le statut courant d'un dev = dernier enregistrement de cette table.
    - Les KPIs d'une période passée utilisent le headcount_snapshot figé,
      pas ce log (voir Period.headcount_snapshot).
    """

    __tablename__ = "developer_status_history"

    id              = Column(Integer, primary_key=True)

    developer_id    = Column(
        Integer,
        ForeignKey("developer.id", ondelete="CASCADE"),
        nullable=False,
        comment="Le développeur concerné"
    )
    period_id       = Column(
        Integer,
        ForeignKey("period.id", ondelete="SET NULL"),
        nullable=True,
        comment="Période dans laquelle le changement a eu lieu"
    )
    changed_by_id   = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
        comment="Manager/Admin ayant effectué le changement"
    )

    previous_status = Column(
        Enum(DeveloperStatusEnum),
        nullable=True,
        comment="Statut avant le changement (NULL si premier enregistrement)"
    )
    new_status      = Column(
        Enum(DeveloperStatusEnum),
        nullable=False,
        comment="Nouveau statut après le changement"
    )
    reason          = Column(
        Text,
        nullable=True,
        comment="Motif du changement (congé, démission, promotion, etc.)"
    )
    changed_at      = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Timestamp exact du changement"
    )

    # ── Relations ─────────────────────────────────────────────────────────────
    developer   = relationship("Developer",  back_populates="status_history")
    period      = relationship("Period")
    changed_by  = relationship("AppUser",    foreign_keys=[changed_by_id])

    # ── Index pour les requêtes fréquentes ────────────────────────────────────
    __table_args__ = (
        Index("idx_status_history_developer", "developer_id"),
        Index("idx_status_history_period",    "period_id"),
        Index("idx_status_history_changed_at","changed_at"),
        # Composite : historique d'un dev sur une période
        Index("idx_status_history_dev_period","developer_id", "period_id"),
    )
