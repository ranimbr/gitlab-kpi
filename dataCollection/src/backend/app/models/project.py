"""
models/project.py
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey,
    Enum, Index, CheckConstraint, DateTime,
)
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class VisibilityEnum(str, enum.Enum):
    private  = "private"
    internal = "internal"
    public   = "public"


class Project(Base):

    __tablename__ = "project"

    id                = Column(Integer, primary_key=True)
    gitlab_project_id = Column(Integer, unique=True, nullable=True)
    name              = Column(String(255), nullable=False)
    path              = Column(String(255), nullable=True)
    namespace         = Column(String(255), nullable=True)
    description       = Column(String,      nullable=True)
    visibility        = Column(Enum(VisibilityEnum), nullable=True)
    default_branch    = Column(String(100), nullable=True)
    archived          = Column(Boolean, default=False, nullable=False)
    is_active         = Column(Boolean, default=True,  nullable=False)
    last_commit_date  = Column(DateTime(timezone=True), nullable=True)

    gitlab_config_id = Column(
        Integer,
        ForeignKey("gitlab_config.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    gitlab_config = relationship("GitLabConfig", back_populates="projects")

    site_associations = relationship(
        "ProjectSite",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    developer_associations = relationship(
        "DeveloperProject",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    # ✅ SUPPRIMÉ : developer_groups (DeveloperGroup appartient au Site, pas au Project)

    commits = relationship(
        "Commit",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    merge_requests = relationship(
        "MergeRequest",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    kpi_snapshots = relationship(
        "KpiSnapshot",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    extraction_lots = relationship(
        "ExtractionLot",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    # DISABLED: Dashboard functionality removed
    # dashboards = relationship(
    #     "Dashboard",
    #     back_populates="project",
    #     cascade="all, delete-orphan",
    # )
    kpi_thresholds = relationship(
        "KpiThreshold",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    # ── Index et contraintes ─────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_project_config",         "gitlab_config_id"),
        Index("idx_project_name_namespace", "name", "namespace"),
        Index("idx_project_active",         "is_active"),
        Index("idx_project_last_commit",    "last_commit_date"),
        CheckConstraint(
            "NOT (archived = TRUE AND is_active = TRUE)",
            name="chk_project_archived_not_active",
        ),
    )