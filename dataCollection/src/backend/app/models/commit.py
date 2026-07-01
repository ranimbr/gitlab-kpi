"""
models/commit.py

"""

from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean,
    ForeignKey, Index, Text, CheckConstraint,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class Commit(Base):

    __tablename__ = "git_commit"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    gitlab_commit_id = Column(String(64),  nullable=False)  # SHA-1 ou SHA-256 du commit
    title            = Column(String(500), nullable=False)
    message          = Column(Text,        nullable=True)

    # ── Dates ────────────────────────────────────────────────────────────────
    # authored_date  : date à laquelle l'auteur a créé le commit (git author date)
    # committed_date : date à laquelle le commit a été intégré au dépôt (git commit date)
    # Les deux diffèrent en cas de cherry-pick ou rebase.
    authored_date  = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    committed_date = Column(DateTime(timezone=True), nullable=False)

    # ── Statistiques de code ─────────────────────────────────────────────────
    additions     = Column(Integer, default=0, nullable=False)
    deletions     = Column(Integer, default=0, nullable=False)
    total_changes = Column(Integer, default=0, nullable=False)

    # ✅ AJOUT : distingue les vrais commits des commits de merge automatiques
    # True  = commit "Merge branch 'x' into 'main'" → exclu du KPI #5
    # False = commit de développement réel → inclus dans le KPI #5
    is_merge_commit = Column(Boolean, default=False, nullable=False)

    # ✅ AJOUT : branche source du commit
    # Utile pour filtrer les commits par branche (ex: feature/*, main)
    # et relier les commits aux MRs via source_branch
    branch_name = Column(String(255), nullable=True)

    # ── Auteur brut (fallback quand developer_id est NULL) ───────────────────
    # ✅ AJOUT : nom et email de l'auteur tels que retournés par l'API GitLab
    # Cas d'usage :
    #   1. Developer pas encore créé → developer_id=NULL mais author_name renseigné
    #   2. Bot non encore détecté → permet la détection a posteriori
    #   3. Contributeur externe sans compte GitLab dans l'instance
    # Le DeveloperMatchingService utilise ces champs pour matcher/créer les devs.
    author_name  = Column(String(255), nullable=True)
    author_email = Column(String(255), nullable=True)

    # ── Clés étrangères ──────────────────────────────────────────────────────
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    # NULL si le développeur n'a pas encore été matché/créé
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

    # ── Index et contraintes ─────────────────────────────────────────────────
    __table_args__ = (
        # Unicité : un SHA ne peut apparaître qu'une fois par projet
        Index("idx_commit_sha_project",       "gitlab_commit_id", "project_id", unique=True),

        # KPI #5, #6 : commits réels (non-merge) d'un projet sur une période
        # is_merge_commit inclus pour filtrer efficacement en une seule requête
        Index("idx_commit_project_date_merge","project_id", "authored_date", "is_merge_commit"),

        # Lookup commits d'un développeur dans un projet (KPI individuel)
        Index("idx_commit_developer_project", "developer_id", "project_id"),

        # ✅ AJOUT : alerte inactivité — dernière activité d'un développeur
        # Requête : "commits du dev X après la date Y"
        Index("idx_commit_developer_date",    "developer_id", "authored_date"),

        # Retrouver tous les commits d'un lot d'extraction
        Index("idx_commit_lot",               "extraction_lot_id"),

        # ✅ AJOUT : commits non matchés (developer_id NULL) à traiter par l'admin
        # Requête : "tous les commits sans développeur associé, triés par projet"
        Index("idx_commit_unmatched",         "project_id", "developer_id"),

        # Commits par branche (filtrage dashboard)
        Index("idx_commit_branch",            "project_id", "branch_name"),

        # ✅ [ENTERPRISE] Index composite haute performance pour les KPIs mensuels
        # Couvre project_id + date + dev_id en une seule passe d'index
        Index("idx_commit_analytics_perf",    "project_id", "authored_date", "developer_id", "is_merge_commit"),

        # ✅ AJOUT : contrainte métier — total_changes doit être cohérent
        # additions + deletions = total_changes (toujours vrai dans l'API GitLab)
        CheckConstraint(
            "total_changes = additions + deletions",
            name="chk_commit_total_changes",
        ),
        # authored_date ne peut pas être après committed_date
        CheckConstraint(
            "authored_date <= committed_date",
            name="chk_commit_date_order",
        ),
        # Compteurs négatifs impossibles
        CheckConstraint("additions     >= 0", name="chk_commit_additions"),
        CheckConstraint("deletions     >= 0", name="chk_commit_deletions"),
        CheckConstraint("total_changes >= 0", name="chk_commit_total"),
    )