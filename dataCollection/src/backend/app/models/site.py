"""
models/site.py

Entité représentant un site géographique / organisationnel.

CORRECTIONS MAJEURES (remarques encadrant) :
─────────────────────────────────────────────
1. AJOUT des relations Many-to-Many :
       project_associations    → ProjectSite    (site ↔ projets)
       developer_associations  → DeveloperSite  (site ↔ développeurs)

2. SUPPRESSION des relations directes :
       developers → remplacé par developer_associations (M2M)
       projects   → remplacé par project_associations  (M2M)

3. La relation gitlab_configs reste directe (1 site → N instances GitLab).
   La relation developer_groups reste directe (1 site → N groupes).
   La relation dashboards reste directe (1 site → N dashboards).
   La relation kpi_snapshots reste directe (1 site → N snapshots).

Exemples de sites : "Tunis", "Lyon", "Paris", "HGW-OPE", "Casablanca"
"""

from sqlalchemy import Column, Integer, String, Boolean, Index
from sqlalchemy.orm import relationship

from app.models.base import Base


class Site(Base):

    __tablename__ = "site"

    id        = Column(Integer, primary_key=True)
    name      = Column(String(100), unique=True, nullable=False)
    country   = Column(String(100), nullable=True)
    timezone  = Column(String(50),  nullable=True)   # ex: "Africa/Tunis", "Europe/Paris"
    is_active = Column(Boolean, default=True, nullable=False)

    # ── Relations ────────────────────────────────────────────────────────────

    # ✅ CORRECTION : relation directe → Many-to-Many via DeveloperSite
    developer_associations = relationship(
        "DeveloperSite",
        back_populates="site",
        cascade="all, delete-orphan",
    )

    # ✅ CORRECTION : relation directe → Many-to-Many via ProjectSite
    project_associations = relationship(
        "ProjectSite",
        back_populates="site",
        cascade="all, delete-orphan",
    )

    # Relations directes conservées (1-to-Many)
    gitlab_configs = relationship(
        "GitLabConfig",
        back_populates="site",
        # Pas de cascade : une config peut survivre si le site est désactivé
    )
    developer_groups = relationship(
        "DeveloperGroup",
        secondary="developer_group_site",
        back_populates="sites",
    )
    dashboards = relationship(
        "Dashboard",
        back_populates="site",
        cascade="all, delete-orphan",
    )
    kpi_snapshots = relationship(
        "KpiSnapshot",
        back_populates="site",
        cascade="all, delete-orphan",
    )
    kpi_thresholds = relationship(
        "KpiThreshold",
        back_populates="site",
    )

    # ── Index ────────────────────────────────────────────────────────────────
    # name est UNIQUE → index auto via unique=True
    __table_args__ = (
        Index("idx_site_country", "country"),
        Index("idx_site_active",  "is_active"),
    )