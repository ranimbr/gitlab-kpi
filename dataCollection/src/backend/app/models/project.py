"""
models/project.py

Projet GitLab extrait via l'API.

CORRECTIONS :
    1. index=True supprimé sur id, gitlab_project_id, gitlab_config_id, site_id
       → ces colonnes avaient DÉJÀ des Index() définis en dehors de la classe
       → PostgreSQL créait 2 index identiques par colonne (gaspillage I/O)

    2. Index() définis EN DEHORS de la classe (pattern "module-level Index")
       → supprimés et déplacés dans __table_args__ (pattern correct SQLAlchemy)
       Raison : les Index module-level ne sont PAS inclus dans Base.metadata
       de façon fiable avec Alembic autogenerate → migrations manquantes possibles.

    3. id = primary_key=True → index auto (PK est toujours indexée)
       → index=True supprimé sur id (redondant avec PK)

    4. gitlab_project_id = unique=True → index unique auto
       → index=True supprimé (unique implique déjà un index)

    5. AJOUT : Index composite (name, namespace) pour la recherche de projets
       par nom + namespace (requête fréquente dans le dashboard)

    6. AJOUT : CheckConstraint — un projet archivé ne peut pas être actif
       Règle métier : archived=True → is_active doit être False.
"""

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Enum, Index, CheckConstraint
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class VisibilityEnum(str, enum.Enum):
    private  = "private"
    internal = "internal"
    public   = "public"


class Project(Base):

    __tablename__ = "project"

    # ✅ FIX : primary_key=True suffit — pas besoin d'index=True (PK auto-indexée)
    id                = Column(Integer, primary_key=True)
    # ✅ FIX : unique=True suffit — unique implique un index, index=True est redondant
    gitlab_project_id = Column(Integer, unique=True, nullable=False)
    name              = Column(String(255), nullable=False)
    path              = Column(String(255), nullable=False)
    namespace         = Column(String(255), nullable=True)
    description       = Column(String,     nullable=True)
    visibility        = Column(Enum(VisibilityEnum), nullable=True)
    default_branch    = Column(String(100), nullable=True)
    archived          = Column(Boolean, default=False, nullable=False)
    is_active         = Column(Boolean, default=True,  nullable=False)

    # ✅ FIX : index=True supprimé sur les FKs — remplacé par Index() dans __table_args__
    gitlab_config_id = Column(
        Integer,
        ForeignKey("gitlab_config.id", ondelete="SET NULL"),
        nullable=True,
    )
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    gitlab_config    = relationship("GitLabConfig",   back_populates="projects")
    site             = relationship("Site",           back_populates="projects")
    developer_groups = relationship("DeveloperGroup", back_populates="project",
                                    cascade="all, delete-orphan")
    developers       = relationship("Developer",      back_populates="project",
                                    cascade="all, delete-orphan")
    commits          = relationship("Commit",         back_populates="project",
                                    cascade="all, delete-orphan")
    merge_requests   = relationship("MergeRequest",   back_populates="project",
                                    cascade="all, delete-orphan")
    kpi_snapshots    = relationship("KpiSnapshot",    back_populates="project",
                                    cascade="all, delete-orphan")
    extraction_lots  = relationship("ExtractionLot",  back_populates="project",
                                    cascade="all, delete-orphan")
    dashboards       = relationship("Dashboard",      back_populates="project",
                                    cascade="all, delete-orphan")
    kpi_thresholds   = relationship("KpiThreshold",   back_populates="project",
                                    cascade="all, delete-orphan")

    # ── Index et contraintes — TOUS dans __table_args__ ──────────────────────
    __table_args__ = (
        # ✅ FIX : déplacés depuis le niveau module → maintenant visibles par Alembic
        Index("idx_project_config",         "gitlab_config_id"),
        Index("idx_project_site",           "site_id"),
        # Recherche de projets par nom + namespace (ex: "rechercher 'api' dans groupe 'backend'")
        Index("idx_project_name_namespace", "name", "namespace"),
        # Filtrage dashboard : projets actifs non-archivés
        Index("idx_project_active",         "is_active"),
        # ✅ AJOUT : contrainte métier — un projet archivé ne peut pas rester actif
        # Empêche l'état incohérent archived=True + is_active=True
        CheckConstraint(
            "NOT (archived = TRUE AND is_active = TRUE)",
            name="chk_project_archived_not_active",
        ),
    )
