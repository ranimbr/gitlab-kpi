"""
models/developer_project.py

Table de jonction Many-to-Many : Developer ↔ Project.

RAISON D'EXISTENCE :
    Dans l'ancien modèle, Developer avait project_id (FK directe) → 1 dev = 1 projet.
    La remarque de l'encadrant : un développeur peut travailler sur PLUSIEURS projets.
    Cette table remplace cette FK directe par une relation M2M.

Attributs métier :
    joined_at → date à laquelle le développeur a rejoint le projet.
    is_active → False = dev a quitté le projet, mais l'historique est conservé
                (ne pas supprimer l'association, conserver les KPIs passés).

Usage KPI :
    KpiCalculator filtre DeveloperProject.is_active=True pour obtenir
    le nombre de développeurs actifs par projet pour le mois en cours.

Exemple :
    Ahmed (id=1) → API-Gateway (project_id=2, is_active=True)
    Ahmed (id=1) → Middleware  (project_id=5, is_active=True)
    Ahmed (id=1) → Legacy-App  (project_id=8, is_active=False) ← a quitté ce projet
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

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # Retrouver tous les projets actifs d'un développeur
        Index("idx_dev_project_developer", "developer_id", "is_active"),
        # Retrouver tous les développeurs actifs d'un projet
        Index("idx_dev_project_project",   "project_id",   "is_active"),
    )