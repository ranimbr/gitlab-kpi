"""
models/commit.py

Commit Git extrait via l'API GitLab.

CORRECTION : suppression des index=True redondants sur les colonnes
qui ont déjà un Index() nommé dans __table_args__.
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class Commit(Base):

    __tablename__ = "git_commit"

    id               = Column(Integer, primary_key=True)
    gitlab_commit_id = Column(String(64),  nullable=False)         # SHA du commit GitLab
    title            = Column(String(500), nullable=False)
    message          = Column(Text,        nullable=True)
    authored_date    = Column(DateTime(timezone=True), nullable=False)
    committed_date   = Column(DateTime(timezone=True), nullable=False)
    additions        = Column(Integer, default=0, nullable=False)
    deletions        = Column(Integer, default=0, nullable=False)
    total_changes    = Column(Integer, default=0, nullable=False)

    # FKs — index=True supprimé, remplacé par les Index nommés ci-dessous
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="SET NULL"),
        nullable=True,
    )
    extraction_lot_id = Column(
        Integer,
        ForeignKey("extraction_lot.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    project        = relationship("Project",       back_populates="commits")
    developer      = relationship("Developer",     back_populates="commits")
    extraction_lot = relationship("ExtractionLot", back_populates="commits")
    commit_mrs     = relationship(
        "CommitMergeRequest",
        back_populates="commit",
        cascade="all, delete-orphan",
    )

    # ── Index nommés ─────────────────────────────────────────────────────────
    __table_args__ = (
        # Unicité : un SHA ne peut apparaître qu'une fois par projet
        Index("idx_commit_sha_project",       "gitlab_commit_id", "project_id", unique=True),
        # Filtrage par période (KPI #5, #6) : project + date
        Index("idx_commit_project_date",      "project_id", "authored_date"),
        # Lookup commits d'un développeur dans un projet
        Index("idx_commit_developer_project", "developer_id", "project_id"),
        # Retrouver tous les commits d'un lot d'extraction
        Index("idx_commit_lot",               "extraction_lot_id"),
    )