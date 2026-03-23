"""
models/developer.py

Développeur GitLab extrait ou créé manuellement.

Workflow de validation :
    1. Extraction GitLab  → Developer(is_validated=False, source="gitlab_extraction")
    2. Admin détecte bot  → Developer(is_bot=True)         [exclu des KPIs]
    3. Admin valide       → Developer(is_validated=True, site_id=X, group_id=Y)
    4. KpiCalculator      → filtre is_validated=True AND is_bot=False

CORRECTION :
    Ajout d'une UniqueConstraint partielle (NULLS NOT DISTINCT alternative)
    pour éviter les doublons de gitlab_user_id par projet.
    
    Problème original : Index("idx_developer_gitlab_project", unique=False)
    → aucune contrainte d'unicité → possibilité d'insérer le même dev GitLab
      deux fois dans le même projet.
    
    FIX : UniqueConstraint("gitlab_user_id", "project_id") avec gestion
    du cas NULL via DDL (même pattern que KpiSnapshot).
    
    Note : gitlab_user_id peut être NULL pour les devs externes/manuels.
    La contrainte s'applique uniquement quand gitlab_user_id IS NOT NULL.
"""

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Index, DDL, event
from sqlalchemy.orm import relationship

from app.models.base import Base


class Developer(Base):

    __tablename__ = "developer"

    id             = Column(Integer, primary_key=True)
    gitlab_user_id = Column(Integer, nullable=True)    # NULL = dev externe sans compte GitLab
    username       = Column(String(255), nullable=False)
    name           = Column(String(255), nullable=True)
    email          = Column(String(255), nullable=True)
    company        = Column(String(255), nullable=True)
    is_active      = Column(Boolean, default=True, nullable=False)

    is_validated = Column(
        Boolean,
        default=False,
        nullable=False,
        comment="False = extrait auto GitLab non encore validé par admin",
    )
    is_bot = Column(
        Boolean,
        default=False,
        nullable=False,
        comment="True = bot détecté automatiquement, exclu de tous les KPIs",
    )
    source = Column(
        String(50),
        default="gitlab_extraction",
        nullable=False,
        comment="Origine : 'gitlab_extraction' | 'manual'",
    )

    # FKs
    project_id = Column(
        Integer,
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    group_id = Column(
        Integer,
        ForeignKey("developer_group.id", ondelete="SET NULL"),
        nullable=True,
    )
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by = Column(
        Integer,
        ForeignKey("app_user.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    project         = relationship("Project",        back_populates="developers")
    group           = relationship("DeveloperGroup", back_populates="developers")
    site            = relationship("Site",           back_populates="developers")
    created_by_user = relationship(
        "AppUser",
        back_populates="developers_created",
        foreign_keys=[created_by],
    )
    commits        = relationship("Commit",       back_populates="developer")
    merge_requests = relationship("MergeRequest", back_populates="developer")
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

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        # ✅ Index simple sur les colonnes fréquemment filtrées
        Index("idx_developer_project",   "project_id"),
        Index("idx_developer_group",     "group_id"),
        Index("idx_developer_site",      "site_id"),
        Index("idx_developer_active",    "is_active"),
        Index("idx_developer_validated", "is_validated"),
        Index("idx_developer_bot",       "is_bot"),
        # Index composite pour les lookups KPI : devs validés et non-bots d'un site
        Index("idx_developer_kpi_filter", "site_id", "is_validated", "is_bot", "is_active"),
        # ⚠️  Index unique partiel pour gitlab_user_id créé via DDL event (voir ci-dessous)
        # Raison : gitlab_user_id peut être NULL (devs externes), et
        # NULL != NULL dans PostgreSQL UNIQUE → utilisation d'un index WHERE
    )


# ── Index unique partiel : un gitlab_user_id ne peut être qu'une fois par projet ──
# WHERE gitlab_user_id IS NOT NULL → exclut les devs externes (NULL accepté en doublon)
_unique_developer_gitlab = DDL("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_gitlab_project_unique
    ON developer (gitlab_user_id, project_id)
    WHERE gitlab_user_id IS NOT NULL
""")

event.listen(
    Developer.__table__,
    "after_create",
    _unique_developer_gitlab,
)