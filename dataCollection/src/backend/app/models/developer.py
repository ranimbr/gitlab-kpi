from sqlalchemy import Column, Integer, String, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property  # ← ajouter

from app.models.base import Base


class Developer(Base):
    __tablename__ = "developer"

    id             = Column(Integer, primary_key=True, index=True)
    gitlab_user_id = Column(Integer, nullable=False)
    username       = Column(String(255), nullable=False)
    name           = Column(String(255), nullable=True)
    email          = Column(String(255), nullable=True)

    project_id = Column(Integer, ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id   = Column(Integer, ForeignKey("developer_group.id", ondelete="SET NULL"), nullable=True)

    # Relations
    project        = relationship("Project",        back_populates="developers")
    group          = relationship("DeveloperGroup", back_populates="developers")
    commits        = relationship("Commit",         back_populates="developer")
    merge_requests = relationship("MergeRequest",   back_populates="developer")
    commit_merge_requests = relationship(
        "CommitMergeRequest",
        back_populates="developer",
        foreign_keys="CommitMergeRequest.developer_id",
        cascade="all, delete-orphan",
    )

    @hybrid_property
    def site(self):
        """Site dérivé du groupe — lecture seule."""
        return self.group.site if self.group else None