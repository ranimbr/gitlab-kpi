from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint, DateTime, ForeignKeyConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base


class CommitMergeRequest(Base):
    """
    Table de jointure M:N entre Commit et MergeRequest.
    """

    __tablename__ = "commit_merge_request"

    commit_id = Column(
        Integer,
        primary_key=True,
        nullable=False,
    )
    authored_date = Column(
        DateTime(timezone=True),
        nullable=False,
    )
    mr_id = Column(
        Integer,
        ForeignKey("merge_request.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )

    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["commit_id", "authored_date"],
            ["git_commit.id", "git_commit.authored_date"],
            ondelete="CASCADE"
        ),
    )

    # Relations
    commit        = relationship("Commit",        back_populates="commit_mrs", foreign_keys=[commit_id])
    merge_request = relationship("MergeRequest",  back_populates="commit_mrs", foreign_keys=[mr_id])
    developer     = relationship(
        "Developer",
        back_populates="commit_merge_requests",
        foreign_keys=[developer_id],
    )
