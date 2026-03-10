from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Enum, Index
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base

class VisibilityEnum(str, enum.Enum):
    private  = "private"
    internal = "internal"
    public   = "public"

class Project(Base):
    __tablename__ = "project"

    id                = Column(Integer, primary_key=True, index=True)
    gitlab_project_id = Column(Integer, unique=True, nullable=False, index=True)
    name              = Column(String(255), nullable=False)
    path              = Column(String(255), nullable=False)
    namespace         = Column(String(255), nullable=True)
    description       = Column(String, nullable=True)
    visibility        = Column(Enum(VisibilityEnum), nullable=True)
    default_branch    = Column(String(100), nullable=True)
    archived          = Column(Boolean, default=False, nullable=False)
    is_active         = Column(Boolean, default=True, nullable=False)

    gitlab_config_id = Column(
        Integer,
        ForeignKey("gitlab_config.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Relations
    gitlab_config    = relationship("GitLabConfig",   back_populates="projects")
    sub_projects     = relationship("SubProject",     back_populates="project",
                                    cascade="all, delete-orphan")
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
    # ✅ AJOUT
    kpi_thresholds   = relationship("KpiThreshold",   back_populates="project",
                                    cascade="all, delete-orphan")

Index("idx_project_name_namespace", Project.name, Project.namespace)
Index("idx_project_config",         Project.gitlab_config_id)