"""
models/site.py

Entité dédiée représentant un site géographique / organisationnel.

Remplace le champ site:String répété dans Developer, DeveloperGroup,
KpiSnapshot et Dashboard — garantit la cohérence des comparaisons
inter-sites et centralise la gestion des sites.

Exemples : "Tunis", "Lyon", "HGW-OPE", "Paris", "Casablanca"

CORRECTION :
    Ajout de la relation `gitlab_configs` manquante — nécessaire depuis
    l'ajout de site_id dans GitLabConfig.
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
    # ✅ AJOUT : instances GitLab hébergées sur ce site
    gitlab_configs = relationship(
        "GitLabConfig",
        back_populates="site",
        # pas de cascade delete-orphan : une config GitLab peut survivre
        # si on désactive un site (is_active=False)
    )
    developer_groups = relationship(
        "DeveloperGroup",
        back_populates="site",
        cascade="all, delete-orphan",
    )
    developers = relationship(
        "Developer",
        back_populates="site",
        cascade="all, delete-orphan",
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
    # Pas de cascade delete-orphan sur projects :
    # un projet peut continuer d'exister si le site est supprimé (site_id → NULL)
    projects = relationship(
        "Project",
        back_populates="site",
    )

    # ── Index ────────────────────────────────────────────────────────────────
    # name est UNIQUE → index auto via unique=True
    __table_args__ = (
        Index("idx_site_country",    "country"),
        Index("idx_site_active",     "is_active"),
    )