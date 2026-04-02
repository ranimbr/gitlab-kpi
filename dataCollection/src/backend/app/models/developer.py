"""
models/developer.py

CORRECTIONS APPLIQUÉES :
──────────────────────────────────────────────────────────────────
1. AJOUT Index sur gitlab_username → lookup O(log n) au lieu de full scan.
   get_by_gitlab_username() est appelé à chaque ligne lors des imports CSV
   et à chaque commit/MR extrait depuis GitLab. Sans index = full scan table.

2. AJOUT Index sur email → même raison (get_by_email() dans import et création).

3. AJOUT Index sur gitlab_user_id → utilisé par get_by_gitlab_user_id()
   dans le mapper GitLab à chaque extraction.

4. Aucune autre modification — modèle était déjà correct.
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey,
    Index, DDL, event, Date, DateTime,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class Developer(Base):

    __tablename__ = "developer"

    id              = Column(Integer, primary_key=True)

    gitlab_user_id  = Column(Integer,     nullable=True,  unique=False)
    gitlab_username = Column(String(255), nullable=True)
    name            = Column(String(255), nullable=False)
    email           = Column(String(255), nullable=True)
    company         = Column(String(255), nullable=True)
    avatar_url      = Column(String(512), nullable=True)

    is_active    = Column(Boolean, default=True,  nullable=False)
    is_validated = Column(
        Boolean, default=False, nullable=False,
        comment="False = extrait auto GitLab non encore validé par admin",
    )
    is_bot = Column(
        Boolean, default=False, nullable=False,
        comment="True = bot détecté automatiquement, exclu de tous les KPIs",
    )
    is_external  = Column(Boolean, default=False, nullable=False)
    auto_created = Column(Boolean, default=False, nullable=False)

    source = Column(
        String(50), default="gitlab_extraction", nullable=False,
        comment="Origine : 'gitlab_extraction' | 'manual' | 'csv_import'",
    )

    onboarding_date = Column(Date, nullable=True)
    last_active_at  = Column(DateTime(timezone=True), nullable=True)

    group_id = Column(
        Integer,
        ForeignKey("developer_group.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    group           = relationship("DeveloperGroup", back_populates="developers")
    created_by_user = relationship(
        "AppUser",
        back_populates="developers_created",
        foreign_keys=[created_by],
    )

    project_associations = relationship(
        "DeveloperProject",
        back_populates="developer",
        cascade="all, delete-orphan",
    )
    site_associations = relationship(
        "DeveloperSite",
        back_populates="developer",
        cascade="all, delete-orphan",
    )

    commits        = relationship("Commit", back_populates="developer")
    merge_requests = relationship(
        "MergeRequest",
        back_populates="developer",
        foreign_keys="MergeRequest.developer_id",
    )
    reviewed_merge_requests = relationship(
        "MergeRequest",
        back_populates="reviewer",
        foreign_keys="MergeRequest.reviewer_id",
    )
    commit_merge_requests = relationship(
        "CommitMergeRequest",
        back_populates="developer",
        foreign_keys="CommitMergeRequest.developer_id",
        cascade="all, delete-orphan",
    )

    kpi_snapshots = relationship(
        "KpiSnapshot",
        back_populates="developer",
        cascade="all, delete-orphan",
    )
    extraction_lots = relationship(
        "ExtractionLot",
        back_populates="developer",
        cascade="all, delete-orphan",
    )

    alerts = relationship(
        "Alert",
        back_populates="developer",
        foreign_keys="Alert.developer_id",
    )

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_developer_group",          "group_id"),
        Index("idx_developer_active",         "is_active"),
        Index("idx_developer_validated",      "is_validated"),
        Index("idx_developer_bot",            "is_bot"),
        Index("idx_developer_external",       "is_external"),
        Index("idx_developer_source",         "source"),
        # ✅ AJOUT : index composite pour le filtre KPI principal
        Index("idx_developer_kpi_filter",     "is_validated", "is_bot", "is_active"),
        # ✅ AJOUT : index pour les lookups par identifiants GitLab
        # Critique pour get_by_gitlab_username() (import CSV, mapper GitLab)
        Index("idx_developer_gitlab_username","gitlab_username"),
        # Critique pour get_by_gitlab_user_id() (extraction GitLab)
        Index("idx_developer_gitlab_user_id", "gitlab_user_id"),
        # Critique pour get_by_email() (import CSV, création manuelle)
        Index("idx_developer_email",          "email"),
    )


# ── Index UNIQUE partiel : 1 seul gitlab_user_id non-null par developer ──────
# WHERE gitlab_user_id IS NOT NULL → les lignes sans gitlab_user_id
# (devs créés manuellement sans liaison GitLab) ne sont pas contraintes.
_unique_developer_gitlab = DDL("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_gitlab_user_unique
    ON developer (gitlab_user_id)
    WHERE gitlab_user_id IS NOT NULL
""")

event.listen(
    Developer.__table__,
    "after_create",
    _unique_developer_gitlab,
)