"""
models/developer_site.py


"""

from sqlalchemy import (
    Column, Integer, ForeignKey, Boolean, DateTime,
    Index, DDL, event, func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class DeveloperSite(Base):

    __tablename__ = "developer_site"

    # ── Clé primaire composite ────────────────────────────────────────────────
    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="CASCADE"),
        primary_key=True,
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

    # ── Relations ────────────────────────────────────────────────────────────
    developer = relationship("Developer", back_populates="site_associations")
    site      = relationship("Site",      back_populates="developer_associations")

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # Retrouver le site principal d'un développeur
        Index("idx_dev_site_developer_primary", "developer_id", "is_primary"),
        # Retrouver tous les développeurs d'un site
        Index("idx_dev_site_site",              "site_id"),
    )


# ── Index unique partiel : 1 seul site primaire par développeur ──────────────
# WHERE is_primary = TRUE → n'affecte pas les associations secondaires.
# Garantit : impossible d'assigner 2 sites primaires au même développeur.
_unique_primary_site = DDL("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_one_primary_site
    ON developer_site (developer_id)
    WHERE is_primary = TRUE
""")

event.listen(
    DeveloperSite.__table__,
    "after_create",
    _unique_primary_site,
)