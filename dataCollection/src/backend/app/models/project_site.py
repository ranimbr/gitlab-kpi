"""
models/project_site.py


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