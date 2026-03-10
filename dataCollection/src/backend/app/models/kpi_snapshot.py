# models/kpi_snapshot.py
from sqlalchemy import (
    Column, Integer, Float, Date, ForeignKey,
    String, Index, CheckConstraint
)
from sqlalchemy.orm import relationship

from app.models.base import Base

class KpiSnapshot(Base):
    """
    Snapshot mensuel des 7 KPIs calculés pour un projet, une période et un site.

    Les 7 KPIs selon la spec :
        1. mr_rate_per_site        = NB MRs non-draft / NB développeurs du site
        2. approved_mr_rate        = NB MRs approuvées / NB MRs créées non-draft
        3. merged_mr_rate          = NB MRs mergées / NB MRs approuvées
        4. commit_rate_per_site    = NB commits / NB développeurs du site
        5. nb_commits_per_project  = somme de tous les commits du projet sur la période
        6. avg_review_time_hours   = Σ(approved_at - created_at) / NB MRs approuvées
    """
    __tablename__ = "kpi_snapshot"

    id            = Column(Integer, primary_key=True, index=True)
    site          = Column(String(100), nullable=True)   # null = snapshot global projet
    snapshot_date = Column(Date, nullable=False, index=True)

    # ── Compteurs bruts ────────────────────────────────────────────────────
    total_commits      = Column(Integer, default=0, nullable=False)
    total_mrs_created  = Column(Integer, default=0, nullable=False)
    total_mrs_approved = Column(Integer, default=0, nullable=False)
    total_mrs_merged   = Column(Integer, default=0, nullable=False)
    nb_developers      = Column(Integer, default=0, nullable=False)

    # ── KPI #1 ────────────────────────────────────────────────────────────
    mr_rate_per_site     = Column(Float, default=0.0, nullable=False)

    # ── KPI #2 ────────────────────────────────────────────────────────────
    approved_mr_rate     = Column(Float, default=0.0, nullable=False)

    # ── KPI #3 ────────────────────────────────────────────────────────────
    merged_mr_rate       = Column(Float, default=0.0, nullable=False)

    # ── KPI #4 ────────────────────────────────────────────────────────────
    commit_rate_per_site = Column(Float, default=0.0, nullable=False)

    # ── KPI #5 ────────────────────────────────────────────────────────────
    nb_commits_per_project = Column(Integer, default=0, nullable=False)

    # ── KPI #6 ────────────────────────────────────────────────────────────
    avg_review_time_hours  = Column(Float, default=0.0, nullable=False)

    # ── Clés étrangères ────────────────────────────────────────────────────
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    period_id = Column(
        Integer,
        ForeignKey("period.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # ✅ CORRECTION POINT 3 — lot_id ajouté pour traçabilité
    # Permet de savoir quel lot d'extraction a généré ce snapshot
    lot_id = Column(
        Integer,
        ForeignKey("extraction_lot.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Relations
    project        = relationship("Project",       back_populates="kpi_snapshots")
    period         = relationship("Period",        back_populates="kpi_snapshots")
    extraction_lot = relationship("ExtractionLot", back_populates="kpi_snapshots")

    __table_args__ = (
        Index("idx_kpi_project_period_site", "project_id", "period_id", "site", unique=True),
        CheckConstraint("approved_mr_rate  >= 0 AND approved_mr_rate  <= 1", name="chk_approved_rate"),
        CheckConstraint("merged_mr_rate    >= 0 AND merged_mr_rate    <= 1", name="chk_merged_rate"),
        CheckConstraint("mr_rate_per_site  >= 0",                            name="chk_mr_rate"),
        CheckConstraint("commit_rate_per_site >= 0",                         name="chk_commit_rate"),
        CheckConstraint("avg_review_time_hours >= 0",                        name="chk_review_time"),
    )