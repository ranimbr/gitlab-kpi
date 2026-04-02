"""
models/commit.py

Commit Git extrait via l'API GitLab.

AMÉLIORATIONS APPORTÉES :
─────────────────────────
1. AJOUT de author_name et author_email :
   Champs de secours quand developer_id est NULL.
   Cas réel : lors d'une extraction, un commit peut appartenir
   à un utilisateur GitLab non encore référencé comme Developer.
   Le GitLabMapper stocke le nom/email brut pour permettre
   à l'admin de matcher manuellement le commit à un Developer.
   → Aussi utile pour les commits de bots non encore détectés.

2. AJOUT de branch_name :
   Nom de la branche source du commit.
   Utile pour : filtrer les commits par branche (ex: main uniquement),
   détecter les commits directs sur main (mauvaise pratique),
   et relier les commits aux MRs via la branche source.

3. AJOUT de is_merge_commit (Boolean) :
   Distingue les commits réels des commits de merge automatiques
   (ex: "Merge branch 'feature/x' into 'main'").
   Les commits de merge sont exclus du KPI #5 (Commit Rate)
   car ils ne représentent pas du travail de développement réel.

4. AJOUT de CheckConstraints :
   - total_changes = additions + deletions (cohérence des compteurs)
   - authored_date <= committed_date (ordre temporel logique)

5. AJOUT d'un index composite pour les alertes d'inactivité :
   Index(developer_id, authored_date) → permet de détecter rapidement
   les développeurs sans commit depuis N jours (alertes automatiques).

CORRECTION conservée :
   Suppression des index=True redondants sur les colonnes
   qui ont déjà un Index() nommé dans __table_args__.
"""

from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean,
    ForeignKey, Index, Text, CheckConstraint,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class Commit(Base):

    __tablename__ = "git_commit"

    id               = Column(Integer, primary_key=True)
    gitlab_commit_id = Column(String(64),  nullable=False)  # SHA-1 ou SHA-256 du commit
    title            = Column(String(500), nullable=False)
    message          = Column(Text,        nullable=True)

    # ── Dates ────────────────────────────────────────────────────────────────
    # authored_date  : date à laquelle l'auteur a créé le commit (git author date)
    # committed_date : date à laquelle le commit a été intégré au dépôt (git commit date)
    # Les deux diffèrent en cas de cherry-pick ou rebase.
    authored_date  = Column(DateTime(timezone=True), nullable=False)
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