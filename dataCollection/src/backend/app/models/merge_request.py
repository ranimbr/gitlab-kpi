"""
models/merge_request.py

Merge Request GitLab extraite via l'API.

AMÉLIORATIONS APPORTÉES :
─────────────────────────
1. AJOUT de source_branch et target_branch :
   Informations de branche essentielles pour l'analyse GitLab.
   source_branch : branche feature (ex: "feature/AUTH-42")
   target_branch : branche cible   (ex: "main", "develop")
   Utile pour : détecter les MRs qui ciblent directement main
   (mauvaise pratique) et pour relier les commits à la MR via
   la source_branch (complément du CommitMergeRequest).

2. AJOUT de reviewer_id (FK nullable) :
   Développeur assigné comme relecteur de la MR.
   Utile pour : calculer la charge de review par développeur,
   identifier les relecteurs les plus sollicités, détecter
   les MRs sans relecteur assigné (risque qualité).
   → Relation review_by vers Developer.

3. AJOUT de author_name (fallback) :
   Même logique que Commit.author_name — nom brut de l'auteur
   GitLab quand developer_id est NULL (dev non encore matché).

4. AJOUT de CheckConstraints métier :
   - Si approved=True  → approved_at  ne peut pas être NULL
   - Si state=merged   → merged_at    ne peut pas être NULL
   - Si state=closed   → closed_at    ne peut pas être NULL
   - review_time_hours >= 0 si renseigné
   - total_changes = additions + deletions

5. AJOUT d'index supplémentaires :
   - Index sur reviewer_id (charge de review par développeur)
   - Index composite (developer_id, created_at_gitlab) pour
     le KPI individuel MR Rate par développeur
   - Index sur target_branch (filtrage MRs vers main)

CORRECTION conservée :
   Suppression des index=True redondants.
   Seules les MRs non-draft (is_draft=False) comptent pour
   les KPIs #1, #3 et #7.
"""

from sqlalchemy import (
    Column, Integer, String, DateTime, Text,
    ForeignKey, Boolean, Float, Index, Enum, CheckConstraint,
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

    id           = Column(Integer, primary_key=True)
    gitlab_mr_id = Column(Integer, nullable=False)
    title        = Column(String(500), nullable=False)
    description  = Column(Text,        nullable=True)
    state        = Column(Enum(MRStateEnum), nullable=False)
    is_draft     = Column(Boolean, default=False, nullable=False)

    # ── Branches ─────────────────────────────────────────────────────────────
    # ✅ AJOUT : branches source et cible de la MR
    # source_branch : branche feature créée par le développeur
    # target_branch : branche dans laquelle la MR sera mergée
    source_branch = Column(String(255), nullable=True)
    target_branch = Column(String(255), nullable=True)

    # ── Dates ────────────────────────────────────────────────────────────────
    created_at_gitlab = Column(DateTime(timezone=True), nullable=False)
    merged_at         = Column(DateTime(timezone=True), nullable=True)
    closed_at         = Column(DateTime(timezone=True), nullable=True)
    approved_at       = Column(DateTime(timezone=True), nullable=True)

    # ── Statut ───────────────────────────────────────────────────────────────
    approved = Column(Boolean, default=False, nullable=False)
    # Dénormalisé : (approved_at - created_at_gitlab) en heures
    # KPI #7 : utilisé directement par KpiCalculator sans recalcul
    review_time_hours = Column(Float, nullable=True)

    # ── Statistiques de code ─────────────────────────────────────────────────
    additions     = Column(Integer, default=0, nullable=True)
    deletions     = Column(Integer, default=0, nullable=True)
    total_changes = Column(Integer, default=0, nullable=True)

    # ── Auteur brut (fallback quand developer_id est NULL) ───────────────────
    # ✅ AJOUT : nom brut de l'auteur retourné par l'API GitLab
    # Utilisé par DeveloperMatchingService pour matcher/créer le Developer
    author_name = Column(String(255), nullable=True)

    # ── Clés étrangères ──────────────────────────────────────────────────────
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Auteur de la MR — NULL si pas encore matché à un Developer
    developer_id = Column(
        Integer,
        ForeignKey("developer.id", ondelete="SET NULL"),
        nullable=True,
    )
    # ✅ AJOUT : relecteur assigné à la MR
    # NULL = pas de relecteur assigné (cas fréquent en début de projet)
    reviewer_id = Column(
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
    # Auteur de la MR
    developer      = relationship(
        "Developer",
        back_populates="merge_requests",
        foreign_keys=[developer_id],
    )
    # ✅ AJOUT : relecteur de la MR
    reviewer       = relationship(
        "Developer",
        back_populates="reviewed_merge_requests",
        foreign_keys=[reviewer_id],
    )
    extraction_lot = relationship("ExtractionLot", back_populates="merge_requests")
    commit_mrs     = relationship(
        "CommitMergeRequest",
        back_populates="merge_request",
        cascade="all, delete-orphan",
    )

    # ── Index et contraintes ─────────────────────────────────────────────────
    __table_args__ = (
        # Unicité : une MR GitLab ne peut apparaître qu'une fois par projet
        Index("idx_mr_gitlab_project",      "gitlab_mr_id", "project_id", unique=True),

        # KPI #1, #3, #7 : MRs non-draft d'un projet sur une période
        Index("idx_mr_project_created",     "project_id", "created_at_gitlab"),

        # KPI individuel : MR Rate par développeur
        # ✅ AJOUT : index composite pour les snapshots individuels
        Index("idx_mr_developer_date",      "developer_id", "created_at_gitlab"),

        # Filtrage par état (opened/merged/closed)
        Index("idx_mr_state_project",       "state", "project_id"),

        # Filtrage draft/non-draft (critique pour tous les KPIs)
        Index("idx_mr_draft_project",       "is_draft", "project_id"),

        # Retrouver toutes les MRs d'un lot d'extraction
        Index("idx_mr_lot",                 "extraction_lot_id"),

        # KPI #7 : MRs approuvées (non-draft) avec temps de review
        Index("idx_mr_approved",            "approved", "project_id"),

        # ✅ AJOUT : charge de review par relecteur
        Index("idx_mr_reviewer",            "reviewer_id", "project_id"),

        # ✅ AJOUT : MRs ciblant la branche principale (détection commits directs sur main)
        Index("idx_mr_target_branch",       "project_id", "target_branch"),

        # ✅ AJOUT : MRs non matchées (developer_id NULL) → à traiter par l'admin
        Index("idx_mr_unmatched",           "project_id", "developer_id"),

        # ── Contraintes métier ────────────────────────────────────────────────
        # Si approved=True → approved_at obligatoire
        CheckConstraint(
            "(approved = FALSE) OR (approved_at IS NOT NULL)",
            name="chk_mr_approved_has_date",
        ),
        # Si state=merged → merged_at obligatoire
        CheckConstraint(
            "(state != 'merged') OR (merged_at IS NOT NULL)",
            name="chk_mr_merged_has_date",
        ),
        # Si state=closed → closed_at obligatoire
        CheckConstraint(
            "(state != 'closed') OR (closed_at IS NOT NULL)",
            name="chk_mr_closed_has_date",
        ),
        # review_time_hours >= 0 si renseigné
        CheckConstraint(
            "(review_time_hours IS NULL) OR (review_time_hours >= 0)",
            name="chk_mr_review_time_positive",
        ),
        # approved_at >= created_at_gitlab (on ne peut pas approuver avant de créer)
        CheckConstraint(
            "(approved_at IS NULL) OR (approved_at >= created_at_gitlab)",
            name="chk_mr_approved_after_created",
        ),
        # merged_at >= created_at_gitlab
        CheckConstraint(
            "(merged_at IS NULL) OR (merged_at >= created_at_gitlab)",
            name="chk_mr_merged_after_created",
        ),
        # Compteurs négatifs impossibles
        CheckConstraint("additions     IS NULL OR additions     >= 0", name="chk_mr_additions"),
        CheckConstraint("deletions     IS NULL OR deletions     >= 0", name="chk_mr_deletions"),
        CheckConstraint("total_changes IS NULL OR total_changes >= 0", name="chk_mr_total"),
    )