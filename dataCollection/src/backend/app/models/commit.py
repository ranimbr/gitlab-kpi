from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import relationship

from app.models.base import Base

class Commit(Base):
    __tablename__ = "git_commit"

    id               = Column(Integer, primary_key=True, index=True)
    gitlab_commit_id = Column(String(64), nullable=False, index=True)
    title            = Column(String(500), nullable=False)
    message          = Column(Text, nullable=True)
    authored_date    = Column(DateTime(timezone=True), nullable=False, index=True)
    committed_date   = Column(DateTime(timezone=True), nullable=False)
    additions        = Column(Integer, default=0)
    deletions        = Column(Integer, default=0)
    total_changes    = Column(Integer, default=0)

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
    project        = relationship("Project",       back_populates="commits")
    developer      = relationship("Developer",     back_populates="commits")
    extraction_lot = relationship("ExtractionLot", back_populates="commits")

    # ✅ AJOUT — relation M:N vers MergeRequest
    commit_mrs = relationship(
        "CommitMergeRequest",
        back_populates="commit",
        cascade="all, delete-orphan"
    )

Index("idx_commit_project_date",      Commit.project_id,    Commit.authored_date)
Index("idx_commit_sha_project",       Commit.gitlab_commit_id, Commit.project_id, unique=True)
Index("idx_commit_developer_project", Commit.developer_id,  Commit.project_id)
Index("idx_commit_lot",               Commit.extraction_lot_id)