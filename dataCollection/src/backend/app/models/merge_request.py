from sqlalchemy import (
    Column, Integer, String, DateTime,
    ForeignKey, Boolean, Float, Index, Enum
)
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base

class MRStateEnum(str, enum.Enum):
    opened = "opened"
    closed = "closed"
    merged = "merged"

class MergeRequest(Base):
    __tablename__ = "merge_request"

    id           = Column(Integer, primary_key=True, index=True)
    gitlab_mr_id = Column(Integer, nullable=False, index=True)
    title        = Column(String(500), nullable=False)
    description  = Column(String, nullable=True)
    state        = Column(Enum(MRStateEnum), nullable=False)
    is_draft     = Column(Boolean, default=False, nullable=False)

    created_at_gitlab = Column(DateTime(timezone=True), nullable=False, index=True)
    merged_at         = Column(DateTime(timezone=True), nullable=True)
    closed_at         = Column(DateTime(timezone=True), nullable=True)
    approved_at       = Column(DateTime(timezone=True), nullable=True)

    approved        = Column(Boolean, default=False, nullable=False)
    time_to_approve = Column(Float, nullable=True)

    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    extraction_lot_id = Column(
        Integer,
        ForeignKey("extraction_lot.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Relations
    project        = relationship("Project",       back_populates="merge_requests")
    developer      = relationship("Developer",     back_populates="merge_requests")
    extraction_lot = relationship("ExtractionLot", back_populates="merge_requests")

    # ✅ AJOUT — relation M:N vers Commit
    commit_mrs = relationship(
        "CommitMergeRequest",
        back_populates="merge_request",
        cascade="all, delete-orphan"
    )

Index("idx_mr_project_created",  MergeRequest.project_id, MergeRequest.created_at_gitlab)
Index("idx_mr_gitlab_project",   MergeRequest.gitlab_mr_id, MergeRequest.project_id, unique=True)
Index("idx_mr_state_project",    MergeRequest.state,      MergeRequest.project_id)
Index("idx_mr_draft_project",    MergeRequest.is_draft,   MergeRequest.project_id)
Index("idx_mr_lot",              MergeRequest.extraction_lot_id)