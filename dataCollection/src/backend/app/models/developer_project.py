"""
models/developer_project.py


"""

from sqlalchemy import Column, Integer, ForeignKey, Boolean, Date, DateTime, Index, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class DeveloperProject(Base):

    __tablename__ = "developer_project"

    id = Column(Integer, primary_key=True)

    # ── Relations ────────────────────────────────────────────────────────────
    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    #  MODIF ENTERPRISE : period_id devient optionnel pour les missions permanentes
    period_id = Column(
        Integer,
        ForeignKey("period.id", ondelete="CASCADE"),
        nullable=True,
    )

    # ── Attributs métier ─────────────────────────────────────────────────────
    # Date à laquelle le développeur a commencé à travailler sur ce projet
    joined_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    
    # [ENTERPRISE] Cycle de vie précis de la mission
    start_date = Column(Date, nullable=True, comment="Début de mission (si vide =joined_at)")
    end_date   = Column(Date, nullable=True, comment="Fin de mission (si vide = toujours actif)")

    # False = dev a quitté le projet (historique conservé pour les KPIs passés)
    is_active = Column(Boolean, default=True, nullable=False)

    # ── Relations ────────────────────────────────────────────────────────────
    developer = relationship("Developer", back_populates="project_associations")
    project   = relationship("Project",   back_populates="developer_associations")
    period    = relationship("Period")

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # Unicité : un dev ne peut pas avoir deux missions sur le même projet pour la même période
        # Si period_id est nul, c'est une mission globale.
        Index("idx_dev_project_unique", "developer_id", "project_id", "period_id", unique=True),
        
        # Retrouver tous les projets actifs d'un développeur pour une période
        Index("idx_dev_project_dev_period", "developer_id", "period_id", "is_active"),
        # Retrouver tous les développeurs d'un projet pour une période
        Index("idx_dev_project_proj_period", "project_id", "period_id", "is_active"),
        # Index pour la recherche par date (nouveau moteur intelligent)
        Index("idx_dev_project_dates", "start_date", "end_date"),
    )