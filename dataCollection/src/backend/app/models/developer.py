"""
models/developer.py


"""

from datetime import datetime, date
from typing import Optional, List
from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey,
    Index, DDL, event, Date, DateTime,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class Developer(Base):

    __tablename__ = "developer"

    id              = Column(Integer, primary_key=True)
    
    from typing import ClassVar
    # [INTERNAL] Temporary state for context-aware property resolution
    _context_period_date: ClassVar[Optional[date]] = None



    gitlab_user_id  = Column(Integer,     nullable=True,  unique=False)
    gitlab_username = Column(String(255), nullable=True)
    name            = Column(String(255), nullable=False)
    email           = Column(String(255), nullable=True, unique=True)
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
    offboarding_date = Column(Date, nullable=True, comment="Date de départ ou désactivation")
    last_active_at  = Column(DateTime(timezone=True), nullable=True)

    created_by = Column(
        Integer,
        nullable=True,
        comment="ID de l'utilisateur créateur (référence croisée vers auth_db.app_user)",
    )

    # ── Relations ────────────────────────────────────────────────────────────
    # [SCD TYPE 2] Liens historisés vers les groupes (avec dates)
    group_links = relationship(
        "DeveloperGroupLink",
        back_populates="developer",
        cascade="all, delete-orphan",
        overlaps="developers,developer_links,group",
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
    assigned_merge_requests = relationship(
        "MergeRequest",
        back_populates="assignee",
        foreign_keys="MergeRequest.assignee_id",
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
    comments = relationship(
        "Comment",
        back_populates="developer",
        cascade="all, delete-orphan",
    )

    alerts = relationship(
        "Alert",
        back_populates="developer",
        foreign_keys="Alert.developer_id",
    )

    # ── [ENTERPRISE] Historique des statuts RH ──────────────────────────────
    status_history = relationship(
        "DeveloperStatusHistory",
        back_populates="developer",
        cascade="all, delete-orphan",
        order_by="DeveloperStatusHistory.changed_at.desc()",
        lazy="dynamic",
    )

    
    @property
    def groups(self):
        """
        [SCD TYPE 2] Retourne les groupes ACTIFS du développeur.
        Rétrocompatibilité : remplace l'ancienne relation M2M directe.
        """
        return [link.group for link in self.group_links if link.is_active and link.group]

    @property
    def group_ids(self) -> List[int]:
        """
        IDs des groupes — Architecture SCD Type 2.
        Fallback 'Last Known State' intelligent (Enterprise).
        """
        ref_date = getattr(self, "_context_period_date", None)
        
        # Convert ref_date to date if it's a datetime for proper comparison
        from datetime import datetime
        if ref_date and isinstance(ref_date, datetime):
            ref_date = ref_date.date()
        
        # 1. Recherche à une date précise (Historique exact)
        if ref_date:
            return [
                link.group_id for link in self.group_links 
                if link.start_date and link.start_date <= ref_date and (link.end_date is None or link.end_date >= ref_date)
            ]
            
        # 3. Fallback standard (Actuel) - Uniquement si PAS de date de contexte
        return [link.group_id for link in self.group_links if link.is_active]

    @property
    def projects(self):
        """[SCD TYPE 2] Retourne les projets actifs pour la période sélectionnée."""
        ref_date = getattr(self, "_context_period_date", None)
        if ref_date:
            # 1. Si on regarde AVANT l'arrivée, on ne renvoie rien
            if self.onboarding_date and ref_date < self.onboarding_date:
                return []
            
            # 2. Filtrage par date de mission
            return [
                assoc for assoc in self.project_associations
                if (assoc.start_date is None or assoc.start_date <= ref_date) and 
                   (assoc.end_date is None or assoc.end_date >= ref_date)
            ]
            
        # Fallback classique (Actuel) - Uniquement si PAS de date de contexte
        return [assoc for assoc in self.project_associations if assoc.is_active]

    @property
    def sites(self):
        """[SCD TYPE 2] Retourne les sites actifs pour la période sélectionnée."""
        ref_date = getattr(self, "_context_period_date", None)
        if ref_date:
            if self.onboarding_date and ref_date < self.onboarding_date:
                return []
            
            return [
                assoc for assoc in self.site_associations
                if (assoc.start_date is None or assoc.start_date <= ref_date) and 
                   (assoc.end_date is None or assoc.end_date >= ref_date)
            ]

        return [assoc for assoc in self.site_associations if assoc.is_active]

    @property
    def primary_site_id(self) -> Optional[int]:
        """
        Résout l'ID du site primaire (SCD Type 2).
        Fallback 'Last Known State' intelligent.
        """
        ref_date = getattr(self, "_context_period_date", None)
        
        # Convert ref_date to date if it's a datetime for proper comparison
        from datetime import datetime
        if ref_date and isinstance(ref_date, datetime):
            ref_date = ref_date.date()
        
        # 1. Recherche par date de contexte
        if ref_date:
            # 🛡️ [ENTERPRISE GUARD] : Si on regarde AVANT l'arrivée, le site n'existe pas encore
            if self.onboarding_date and ref_date < self.onboarding_date:
                return None
                
            for assoc in self.site_associations:
                if assoc.start_date and assoc.start_date <= ref_date and (assoc.end_date is None or assoc.end_date >= ref_date):
                    return assoc.site_id
            
            return None
        
        # 3. Recherche temps réel (Si aucune date de contexte)
        for assoc in self.site_associations:
            if assoc.is_active:
                return assoc.site_id
        return None



    @property
    def primary_site_name(self) -> Optional[str]:
        """
        Résout le nom du site primaire (SCD Type 2).
        Fallback 'Last Known State' intelligent.
        """
        ref_date = getattr(self, "_context_period_date", None)
        
        # Convert ref_date to date if it's a datetime for proper comparison
        from datetime import datetime
        if ref_date and isinstance(ref_date, datetime):
            ref_date = ref_date.date()
        
        if ref_date:
            # 🛡️ [ENTERPRISE GUARD]
            if self.onboarding_date and ref_date < self.onboarding_date:
                return None

            for assoc in self.site_associations:
                if assoc.start_date and assoc.start_date <= ref_date and (assoc.end_date is None or assoc.end_date >= ref_date):
                    if assoc.site:
                        return assoc.site.name
            
            # Fallback Enterprise : Dernier site connu après départ
            if self.offboarding_date and ref_date > self.offboarding_date:
                for assoc in self.site_associations:
                    if assoc.start_date and assoc.start_date <= self.offboarding_date and (assoc.end_date is None or assoc.end_date >= self.offboarding_date):
                        if assoc.site:
                            return assoc.site.name
            
            # Fallback Pragmatic pour l'Admin
            for assoc in self.site_associations:
                if assoc.is_active and assoc.site:
                    return assoc.site.name
            
            return None # Pas de site pour cette période

        for assoc in self.site_associations:
            if assoc.is_active and assoc.site:
                return assoc.site.name
        return None

    @property
    def site(self) -> Optional[str]:
        """
        Alias pour le frontend (CommitsPage, MergePage).
        """
        return self.primary_site_name

    @property
    def avatar_url(self) -> Optional[str]:
        """
        [SENIOR] Resolves a dynamic avatar URL based on the developer's name
        to avoid AttributeErrors and enrich the visual interface.
        """
        import urllib.parse
        safe_name = urllib.parse.quote_plus(self.name)
        return f"https://ui-avatars.com/api/?name={safe_name}&background=0D8ABC&color=fff&size=128"

    @property
    def rh_status(self) -> str:
        """
        [ENTERPRISE] Détermine le statut RH dynamique.
        Logique de cohérence temporelle (Sabbatical aware).
        """
        ref_date = getattr(self, "_context_period_date", None)
        target_date = ref_date if ref_date else date.today()
        
        # 1. Sortie / Offboarding (Départ définitif)
        if self.offboarding_date and self.offboarding_date < target_date:
            return "OUT"

        # 2. Futur / Onboarding (Non encore arrivé)
        if self.onboarding_date and self.onboarding_date > target_date:
            return "FUTURE"
            
        # 3. Désactivation manuelle (Compte désactivé / Suspendu)
        if not ref_date and not self.is_active:
            return "INACTIVE"

        # 4. Détection dynamique d'Inactivité (Sabbat / Sans affectation)
        # Un dev est actif s'il a une mission SITE + GROUPE à cette date
        if ref_date:
            has_site = any(
                s.start_date and s.start_date <= ref_date and (s.end_date is None or s.end_date >= ref_date)
                for s in self.site_associations
            )
            has_group = any(
                g.start_date and g.start_date <= ref_date and (g.end_date is None or g.end_date >= ref_date)
                for g in self.group_links
            )
            
            if not has_site or not has_group:
                return "INACTIVE"

        return "ACTIVE"

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
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
        # ✅ [ENTERPRISE] Index composite pour le filtrage massif (Dashboard)
        Index("idx_developer_enterprise_filter", "is_validated", "is_bot", "is_active", "onboarding_date"),
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

# ── [SCD TYPE 2] Context Management ───────────────────────────────────────

class DeveloperContext:
    """
    Gestionnaire de contexte pour la résolution temporelle des relations SCD Type 2.
    Injecte une date de référence (_context_period_date) dans les instances Developer
    chargées dans la session SQLAlchemy.
    """
    def __init__(self, db, ref_date: Optional[date]):
        self.db = db
        self.ref_date = ref_date
        self._previous_states = {}

    def __enter__(self):
        # On applique la date de contexte à tous les développeurs déjà chargés en session
        count = 0
        for obj in self.db.identity_map.values():
            if hasattr(obj, "_context_period_date"):
                self._previous_states[id(obj)] = getattr(obj, "_context_period_date", None)
                obj._context_period_date = self.ref_date
                count += 1
        
        if self.ref_date:
            import logging
            logging.getLogger("app.models.developer").debug(f"[DeveloperContext] Applied ref_date {self.ref_date} to {count} objects")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Restauration de l'état précédent (Nettoyage)
        for obj in self.db.identity_map.values():
            if id(obj) in self._previous_states:
                obj._context_period_date = self._previous_states[id(obj)]
            elif hasattr(obj, "_context_period_date"):
                obj._context_period_date = None