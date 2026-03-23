"""
models/merge_request.py — version corrigée (index redondants supprimés)
"""
from sqlalchemy import (
    Column, Integer, String, DateTime,
    ForeignKey, Boolean, Float, Index, Enum,
)
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class MRStateEnum(str, enum.Enum):
    opened = "opened"
    closed = "closed"
    merged = "merged"


class MergeRequest(Base):
    """
    Merge Request GitLab extraite via l'API.

    Seules les MRs non-draft (is_draft=False) sont comptabilisées
    dans les KPIs #1, #3 et #7.

    review_time_hours : calculé lors de l'extraction comme
    (approved_at - created_at_gitlab) en heures.
    Stocké dénormalisé pour éviter le recalcul en KpiCalculator.
    """

    __tablename__ = "merge_request"

    id           = Column(Integer, primary_key=True)
    gitlab_mr_id = Column(Integer, nullable=False)
    title        = Column(String(500), nullable=False)
    description  = Column(String,     nullable=True)
    state        = Column(Enum(MRStateEnum), nullable=False)
    is_draft     = Column(Boolean, default=False, nullable=False)

    created_at_gitlab = Column(DateTime(timezone=True), nullable=False)
    merged_at         = Column(DateTime(timezone=True), nullable=True)
    closed_at         = Column(DateTime(timezone=True), nullable=True)
    approved_at       = Column(DateTime(timezone=True), nullable=True)

    approved          = Column(Boolean, default=False, nullable=False)
    # Dénormalisé : (approved_at - created_at_gitlab) en heures
    review_time_hours = Column(Float, nullable=True)

    additions     = Column(Integer, default=0, nullable=True)
    deletions     = Column(Integer, default=0, nullable=True)
    total_changes = Column(Integer, default=0, nullable=True)

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
    project        = relationship("Project",       back_populates="merge_requests")
    developer      = relationship("Developer",     back_populates="merge_requests")
    extraction_lot = relationship("ExtractionLot", back_populates="merge_requests")
    commit_mrs     = relationship(
        "CommitMergeRequest",
        back_populates="merge_request",
        cascade="all, delete-orphan",
    )

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # Unicité : une MR GitLab ne peut apparaître qu'une fois par projet
        Index("idx_mr_gitlab_project",   "gitlab_mr_id", "project_id", unique=True),
        # KPI #1, #3, #7 : MRs non-draft d'un projet sur une période
        Index("idx_mr_project_created",  "project_id", "created_at_gitlab"),
        # Filtrage par état (opened/merged/closed)
        Index("idx_mr_state_project",    "state", "project_id"),
        # Filtrage draft/non-draft (critique pour les KPIs)
        Index("idx_mr_draft_project",    "is_draft", "project_id"),
        # Retrouver toutes les MRs d'un lot
        Index("idx_mr_lot",              "extraction_lot_id"),
        # KPI #7 : MRs approuvées avec temps de review
        Index("idx_mr_approved",         "approved", "project_id"),
    )