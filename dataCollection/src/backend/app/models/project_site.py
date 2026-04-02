"""
models/project_site.py

Table de jonction Many-to-Many : Project ↔ Site.

RAISON D'EXISTENCE :
    Dans l'ancien modèle, Project avait site_id (FK directe) → 1 projet = 1 site.
    La remarque de l'encadrant : un projet peut appartenir à PLUSIEURS sites.

    Exemple concret : le projet "Middleware-Auth" est utilisé et maintenu
    par les équipes de Tunis ET de Paris → il appartient aux deux sites.

    Cette table remplace site_id dans Project par une relation M2M.

Attributs métier :
    assigned_at → date à laquelle le projet a été rattaché au site.

Usage KPI :
    Les KPIs par site filtrent les projets via ProjectSite.
    KPI #6 (NB commits par projet) s'applique sur tous les projets
    rattachés à un site donné.

Exemple :
    Middleware-Auth (project_id=3) → Tunis (site_id=1)
    Middleware-Auth (project_id=3) → Paris (site_id=2)
    API-Gateway     (project_id=7) → Tunis (site_id=1) seulement
"""

from sqlalchemy import Column, Integer, ForeignKey, DateTime, Index, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class ProjectSite(Base):

    __tablename__ = "project_site"

    # ── Clé primaire composite ────────────────────────────────────────────────
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
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
    assigned_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    project = relationship("Project", back_populates="site_associations")
    site    = relationship("Site",    back_populates="project_associations")

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # Retrouver tous les sites d'un projet
        Index("idx_project_site_project", "project_id"),
        # Retrouver tous les projets d'un site
        Index("idx_project_site_site",    "site_id"),
    )