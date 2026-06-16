"""
models/developer_site.py

[SCD TYPE 2 - v2]
Gestion historique des affectations de site :
- is_active  : False = affectation clôturée
- start_date : Date de début de l'affectation
- end_date   : Date de fin (NULL = en cours)

Permet de tracer QUAND un dev a changé de site (Paris → Lyon).
"""

from sqlalchemy import (
    Column, Integer, ForeignKey, Boolean, DateTime, Date,
    Index, DDL, event, func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class DeveloperSite(Base):

    __tablename__ = "developer_site"

    # ── Clé primaire ──────────────────────────────────────────────────────────
    id = Column(Integer, primary_key=True, autoincrement=True)

    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="CASCADE"),
        nullable=False,
    )
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ── Attributs métier ─────────────────────────────────────────────────────
    # True = site principal → utilisé pour les agrégations KPI
    # Contrainte : 1 seul is_primary=True par developer_id (voir DDL ci-dessous)
    is_primary  = Column(Boolean, default=False, nullable=False)
    assigned_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ── [SCD TYPE 2] Historisation des transferts de site ────────────────────
    is_active  = Column(Boolean, default=True, nullable=False,
                        comment="False = affectation clôturée (transfert ou départ)")
    start_date = Column(Date, nullable=True,
                        comment="Date de début d'affectation au site")
    end_date   = Column(Date, nullable=True,
                        comment="Date de fin (NULL = affectation en cours)")

    # ── Relations ────────────────────────────────────────────────────────────
    developer = relationship("Developer", back_populates="site_associations")
    site      = relationship("Site",      back_populates="developer_associations")

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # Retrouver le site principal d'un développeur
        Index("idx_dev_site_developer_primary", "developer_id", "is_primary"),
        # Retrouver tous les développeurs d'un site
        Index("idx_dev_site_site",              "site_id"),
        # [SCD Type 2] Filtrage rapide des affectations actives
        Index("idx_dev_site_active",            "developer_id", "is_active"),
        Index("idx_dev_site_dates",             "developer_id", "start_date", "end_date"),
    )


