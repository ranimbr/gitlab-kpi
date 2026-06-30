"""
models/site.py


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

    # DISABLED: Dashboard functionality removed
    # dashboards = relationship(
    #     "Dashboard",
    #     back_populates="site",
    #     cascade="all, delete-orphan",
    # )
    
    # ✅ AJOUT : Relation many-to-many avec AppUser via UserSiteAccess
    user_accesses = relationship(
        "UserSiteAccess",
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