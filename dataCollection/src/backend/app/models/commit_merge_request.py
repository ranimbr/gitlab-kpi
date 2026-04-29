from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base


class CommitMergeRequest(Base):
    """
    Table de jointure M:N entre Commit et MergeRequest.

    Un commit peut appartenir à plusieurs MRs dans deux cas réels :
    - Cherry-pick : un commit copié d'une branche à une autre
    - Branches partagées : plusieurs MRs pointent vers la même branche source

    developer_id : auteur du commit dans le contexte de la MR.
    Utilisé par KpiCalculator pour compter les commits par développeur.
    """

    __tablename__ = "commit_merge_request"

    commit_id = Column(
        Integer,
        ForeignKey("git_commit.id", ondelete="CASCADE"),
        primary_key=True,
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

    # Relations
    commit        = relationship("Commit",        back_populates="commit_mrs")
    merge_request = relationship("MergeRequest",  back_populates="commit_mrs")
    developer     = relationship(
        "Developer",
        back_populates="commit_merge_requests",
        foreign_keys=[developer_id],
    )
