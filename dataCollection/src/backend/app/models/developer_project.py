"""
models/developer_project.py


"""

from sqlalchemy import Column, Integer, ForeignKey, Boolean, DateTime, Index, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class DeveloperProject(Base):

    __tablename__ = "developer_project"

    # ── Clé primaire composite ────────────────────────────────────────────────
    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    #  AJOUT SENIOR : Scoping temporel des missions
    # Permet de gérer les changements d'équipes mois par mois sans pollution.
    period_id = Column(
        Integer,
        ForeignKey("period.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )

    # ── Attributs métier ─────────────────────────────────────────────────────
    # Date à laquelle le développeur a commencé à travailler sur ce projet
    joined_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    # False = dev a quitté le projet (historique conservé pour les KPIs passés)
    is_active = Column(Boolean, default=True, nullable=False)

    # ── Relations ────────────────────────────────────────────────────────────
    developer = relationship("Developer", back_populates="project_associations")
    project   = relationship("Project",   back_populates="developer_associations")
    period    = relationship("Period")

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # Retrouver tous les projets actifs d'un développeur pour une période
        Index("idx_dev_project_dev_period", "developer_id", "period_id", "is_active"),
        # Retrouver tous les développeurs d'un projet pour une période
        Index("idx_dev_project_proj_period", "project_id", "period_id", "is_active"),
    )