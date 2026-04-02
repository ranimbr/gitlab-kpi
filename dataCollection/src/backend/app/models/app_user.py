"""
models/app_user.py

Utilisateur de l'application dashboard.
Ne pas confondre avec Developer (contributeur GitLab).

CORRECTIONS MAJEURES (remarques encadrant) :
─────────────────────────────────────────────
1. REFONTE des rôles utilisateur :
       Ancien : admin | user   (trop basique pour une grande entreprise)
       Nouveau :
           super_admin  → accès total (gestion sites, devs, KPIs, extractions)
           site_manager → accès limité à son site (filtré par site_id)
           team_lead    → accès limité à son groupe (filtré par group_id)
           developer    → lecture seule de ses propres KPIs

2. AJOUT de site_id et group_id (FKs nullable) :
       site_manager → site_id renseigné pour filtrer son périmètre
       team_lead    → group_id renseigné pour filtrer son équipe

3. AJOUT de la relation developer_import_logs → traçabilité des imports CSV/Excel.

4. AJOUT du login (nom d'utilisateur unique) conservé de l'ancienne version.

⚠️  POSTGRESQL ONLY :
    dashboard_access = ARRAY(Integer) — type natif PostgreSQL.
    Alternatives cross-DB : table UserDashboardAccess ou JSON column.

⚠️  MIGRATION REQUISE :
    ALTER TYPE userrole_enum RENAME VALUE 'admin' TO 'super_admin';
    ALTER TYPE userrole_enum RENAME VALUE 'user'  TO 'developer';
    -- Ou : DROP TYPE et recréation avec les 4 nouvelles valeurs
    -- Ajouter colonnes : site_id, group_id
"""

from sqlalchemy import Column, Integer, String, Boolean, Enum, ForeignKey, Index
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class UserRoleEnum(str, enum.Enum):
    # ✅ CORRECTION : 4 rôles granulaires (remplace admin/user)
    super_admin  = "super_admin"   # Accès total
    site_manager = "site_manager"  # Accès limité à son site
    team_lead    = "team_lead"     # Accès limité à son groupe d'équipe
    developer    = "developer"     # Lecture seule de ses propres KPIs


class AppUser(Base):

    __tablename__ = "app_user"

    id              = Column(Integer, primary_key=True)
    email           = Column(String(255), unique=True, nullable=False)
    login           = Column(String(100), unique=True, nullable=True)
    name            = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(
        Enum(UserRoleEnum),
        default=UserRoleEnum.developer,
        nullable=False,
    )
    is_active = Column(Boolean, default=True, nullable=False)

    # ⚠️  PostgreSQL uniquement — liste des Dashboard.id accessibles
    dashboard_access = Column(ARRAY(Integer), nullable=True, default=list)

    # ✅ AJOUT : FK vers Site (pour les site_managers)
    # NULL pour super_admin et team_lead
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ✅ AJOUT : FK vers DeveloperGroup (pour les team_leads)
    # NULL pour super_admin et site_manager
    group_id = Column(
        Integer,
        ForeignKey("developer_group.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    extraction_lots = relationship(
        "ExtractionLot",
        back_populates="triggered_by_user",
        foreign_keys="ExtractionLot.triggered_by",
    )
    kpi_thresholds = relationship(
        "KpiThreshold",
        back_populates="creator",
        foreign_keys="KpiThreshold.created_by",
    )
    developer_groups_managed = relationship(
        "DeveloperGroup",
        back_populates="manager",
        foreign_keys="DeveloperGroup.manager_id",
    )
    developers_created = relationship(
        "Developer",
        back_populates="created_by_user",
        foreign_keys="Developer.created_by",
    )
    dashboards_created = relationship(
        "Dashboard",
        back_populates="creator",
        foreign_keys="Dashboard.created_by",
    )
    acknowledged_alerts = relationship(
        "Alert",
        back_populates="acknowledger",
        foreign_keys="Alert.acknowledged_by",
    )
    audit_logs = relationship(
        "AuditLog",
        back_populates="user",
        foreign_keys="AuditLog.user_id",
    )
    # ✅ AJOUT : imports CSV/Excel de développeurs effectués par cet utilisateur
    developer_import_logs = relationship(
        "DeveloperImportLog",
        back_populates="imported_by_user",
        foreign_keys="DeveloperImportLog.imported_by",
    )

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_appuser_role",     "role"),
        Index("idx_appuser_active",   "is_active"),
        Index("idx_appuser_site",     "site_id"),
        Index("idx_appuser_group",    "group_id"),
    )

    # ── Helper métier ────────────────────────────────────────────────────────
    @property
    def is_super_admin(self) -> bool:
        return self.role == UserRoleEnum.super_admin

    @property
    def is_site_manager(self) -> bool:
        return self.role == UserRoleEnum.site_manager

    @property
    def is_team_lead(self) -> bool:
        return self.role == UserRoleEnum.team_lead

    def can_access_dashboard(self, dashboard_id: int, is_public: bool = False) -> bool:
        """
        Vérifie si l'utilisateur a accès à un dashboard donné.

        super_admin  → accès à tout
        is_public    → accessible à tous les rôles
        sinon        → vérifie dashboard_access (liste d'IDs)
        """
        if self.role == UserRoleEnum.super_admin:
            return True
        if is_public:
            return True
        if self.dashboard_access and dashboard_id in self.dashboard_access:
            return True
        return False

    def can_manage_site(self, site_id: int) -> bool:
        """
        Vérifie si l'utilisateur peut gérer un site donné.
        super_admin → tous les sites.
        site_manager → son site uniquement.
        """
        if self.role == UserRoleEnum.super_admin:
            return True
        if self.role == UserRoleEnum.site_manager and self.site_id == site_id:
            return True
        return False

    def can_manage_group(self, group_id: int) -> bool:
        """
        Vérifie si l'utilisateur peut gérer un groupe donné.
        super_admin et site_manager → tous les groupes de leur périmètre.
        team_lead → son groupe uniquement.
        """
        if self.role in (UserRoleEnum.super_admin, UserRoleEnum.site_manager):
            return True
        if self.role == UserRoleEnum.team_lead and self.group_id == group_id:
            return True
        return False