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
from sqlalchemy.orm import relationship, Session
import enum

from app.models.base import Base


class UserRoleEnum(str, enum.Enum):
    # ✅ CORRECTION : 6 rôles granulaires (remplace admin/user)
    super_admin     = "super_admin"    # Accès total
    site_manager    = "site_manager"   # Accès limité à son site
    project_manager = "project_manager" # Accès limité à ses projets assignés
    team_lead       = "team_lead"      # Accès limité à son groupe d'équipe
    viewer          = "viewer"         # Accès flexible (sites, équipes, projets combinés)
    developer       = "developer"      # Lecture seule de ses propres KPIs


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

    # ✅ AJOUT : FK vers Profile (pour la gestion des menus)
    # NULL signifie qu'aucun profil personnalisé n'est assigné
    # Dans ce cas, les droits sont déterminés par le rôle technique uniquement
    profile_id = Column(
        Integer,
        ForeignKey("profile.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ✅ AJOUT : FK vers Role (pour la gestion dynamique des rôles)
    # NULL signifie que l'utilisateur utilise l'ancien système enum
    # Pour la compatibilité ascendante, on garde les deux systèmes
    role_id = Column(
        Integer,
        ForeignKey("role.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relations ────────────────────────────────────────────────────────────
    extraction_lots = relationship(
        "ExtractionLot",
        back_populates="triggered_by_user",
        foreign_keys="[ExtractionLot.triggered_by]",
        primaryjoin="AppUser.id == ExtractionLot.triggered_by",
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
    # Relation developers_created supprimée - created_by n'a plus de foreign key
    # DISABLED: Dashboard functionality removed
    # dashboards_created = relationship(
    #     "Dashboard",
    #     back_populates="creator",
    #     foreign_keys="Dashboard.created_by",
    # )
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
    # ✅ AJOUT : Relation vers Profile (gestion des menus)
    profile = relationship(
        "Profile",
        back_populates="users",
        foreign_keys=[profile_id],
    )

    # ✅ AJOUT : Relation vers Role (gestion dynamique des rôles)
    role_obj = relationship(
        "Role",
        back_populates="users",
        foreign_keys=[role_id],
    )

    # ✅ AJOUT : Relations many-to-many pour multi-sites et multi-équipes
    site_accesses = relationship(
        "UserSiteAccess",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    group_accesses = relationship(
        "UserGroupAccess",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    # ── Index ────────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_appuser_role",     "role"),
        Index("idx_appuser_active",   "is_active"),
        Index("idx_appuser_site",     "site_id"),
        Index("idx_appuser_group",    "group_id"),
        Index("idx_appuser_profile",  "profile_id"),
        Index("idx_appuser_role_obj", "role_id"),
    )

    # ── Helper métier ────────────────────────────────────────────────────────
    @property
    def is_super_admin(self) -> bool:
        # Priorité au nouveau système dynamique
        if self.role_obj and self.role_obj.code == "super_admin":
            return True
        # Fallback vers l'ancien système enum pour compatibilité
        return self.role == UserRoleEnum.super_admin

    @property
    def is_site_manager(self) -> bool:
        # Priorité au nouveau système dynamique
        if self.role_obj and self.role_obj.code == "site_manager":
            return True
        # Fallback vers l'ancien système enum pour compatibilité
        return self.role == UserRoleEnum.site_manager

    @property
    def is_project_manager(self) -> bool:
        # Priorité au nouveau système dynamique
        if self.role_obj and self.role_obj.code == "project_manager":
            return True
        # Fallback vers l'ancien système enum pour compatibilité
        return self.role == UserRoleEnum.project_manager

    @property
    def is_team_lead(self) -> bool:
        # Priorité au nouveau système dynamique
        if self.role_obj and self.role_obj.code == "team_lead":
            return True
        # Fallback vers l'ancien système enum pour compatibilité
        return self.role == UserRoleEnum.team_lead
    
    def has_permission(self, db: Session, permission_code: str) -> bool:
        """
        Vérifie si l'utilisateur a une permission spécifique.
        
        Utilise le nouveau système dynamique si role_id est défini,
        sinon utilise l'ancien système enum pour compatibilité.
        
        Args:
            db: Session de base de données
            permission_code: Code de la permission à vérifier
            
        Returns:
            True si l'utilisateur a la permission, False sinon
        """
        # Super admin a toutes les permissions
        if self.is_super_admin:
            return True
        
        # Si l'utilisateur a un rôle dynamique, vérifier les permissions
        if self.role_id:
            from app.repositories.role_repository import RoleRepository
            role_repo = RoleRepository()
            return role_repo.has_permission(db, self.role_id, permission_code)
        
        # Fallback: mapping des permissions basé sur l'enum pour compatibilité
        # Ceci permet une transition progressive sans casser le système existant
        permission_mapping = {
            UserRoleEnum.site_manager: [
                'view_dashboard', 'view_projects', 'view_commits', 'view_merge_requests',
                'view_developers', 'view_developer_profile', 'view_developer_performance',
                'view_extraction_lots', 'view_analytics', 'view_kpi_analysis',
                'manage_own_site'
            ],
            UserRoleEnum.project_manager: [
                'view_dashboard', 'view_projects', 'view_commits', 'view_merge_requests',
                'view_developers', 'view_developer_profile', 'view_developer_performance',
                'view_extraction_lots', 'view_analytics', 'view_kpi_analysis',
                'manage_own_projects'
            ],
            UserRoleEnum.team_lead: [
                'view_dashboard', 'view_projects', 'view_commits', 'view_merge_requests',
                'view_developers', 'view_developer_profile', 'view_developer_performance',
                'view_extraction_lots', 'view_analytics', 'view_kpi_analysis',
                'manage_own_group'
            ],
            UserRoleEnum.developer: [
                'view_dashboard', 'view_projects', 'view_commits', 'view_merge_requests',
                'view_developer_profile', 'view_own_data'
            ],
        }
        
        allowed_permissions = permission_mapping.get(self.role, [])
        return permission_code in allowed_permissions

    def can_access_dashboard(self, dashboard_id: int, db: Session, is_public: bool = False) -> bool:
        """
        Vérifie si l'utilisateur a accès à un dashboard donné.
        
        Support multi-sites et multi-équipes via les relations many-to-many.

        super_admin  → accès à tout
        is_public    → accessible à tous les rôles
        site_manager → dashboards de ses sites accessibles (multi-sites supporté)
        team_lead    → dashboards des projets de ses équipes accessibles (multi-équipes supporté)
        project_manager → dashboards de ses projets assignés
        sinon        → vérifie dashboard_access (liste d'IDs explicite)
        
        Args:
            dashboard_id: ID du dashboard à vérifier
            db: Session de base de données (requise pour les requêtes multi-équipes)
            is_public: Si le dashboard est public (optionnel, sera déterminé depuis le dashboard si non fourni)
        """
        # Priorité au nouveau système dynamique
        if self.role_obj and self.role_obj.code == "super_admin":
            return True
        # Fallback vers l'ancien système enum
        if self.role == UserRoleEnum.super_admin:
            return True
        
        # DISABLED: Dashboard functionality removed
        # # Récupérer le dashboard depuis la base
        # from app.models.dashboard import Dashboard
        # dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
        # if not dashboard:
        #     return False
        # 
        # # Dashboards publics
        # if dashboard.is_public:
        #     return True
        # 
        # # Accès explicite (dashboard_access) - priorité sur les règles automatiques
        # if self.dashboard_access and dashboard_id in self.dashboard_access:
        #     return True
        
        # DISABLED: Dashboard functionality removed
        return False
        
        # site_manager: dashboards de ses sites accessibles (multi-sites)
        # DISABLED: Dashboard functionality removed
        # if (self.role_obj and self.role_obj.code == "site_manager") or self.role == UserRoleEnum.site_manager:
        #     # Vérifier les sites accessibles via site_accesses (nouveau système multi-sites)
        #     accessible_site_ids = self.accessible_site_ids
        #     # Fallback vers l'ancien système single site
        #     if self.site_id:
        #         accessible_site_ids.append(self.site_id)
        #     if dashboard.site_id in accessible_site_ids:
        #         return True
        # 
        # team_lead: dashboards des projets de ses équipes accessibles (multi-équipes)
        # if (self.role_obj and self.role_obj.code == "team_lead") or self.role == UserRoleEnum.team_lead:
        #     from app.models.developer_group import DeveloperGroupLink
        #     from app.models.developer_project import DeveloperProject
        #     
        #     # Récupérer tous les groupes accessibles
        #     accessible_group_ids = self.accessible_group_ids
        #     # Fallback vers l'ancien système single group
        #     if self.group_id:
        #         accessible_group_ids.append(self.group_id)
        #     
        #     if accessible_group_ids:
        #         # Récupérer tous les développeurs actifs de ces groupes
        #         dev_ids = [d.developer_id for d in db.query(DeveloperGroupLink)
        #                   .filter(DeveloperGroupLink.group_id.in_(accessible_group_ids),
        #                                  DeveloperGroupLink.is_active == True)
        #                   .all()]
                
                # Récupérer tous les projets de ces développeurs
                #                 if dev_ids:
                #                     project_ids = [p.project_id for p in db.query(DeveloperProject)
                #                                   .filter(DeveloperProject.developer_id.in_(dev_ids))
                #                                   .all()]
                    # DISABLED: Dashboard functionality removed
                    # if dashboard.project_id in project_ids:
                    #     return True
        
        # project_manager: dashboards de ses projets assignés
        # DISABLED: Dashboard functionality removed
        # if (self.role_obj and self.role_obj.code == "project_manager") or self.role == UserRoleEnum.project_manager:
        #     if self.project_ids and dashboard.project_id in self.project_ids:
        #         return True
        # 
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
        team_lead → ses groupes uniquement (support multi-équipes).
        """
        if self.role in (UserRoleEnum.super_admin, UserRoleEnum.site_manager):
            return True
        if self.role == UserRoleEnum.team_lead:
            # Vérifier si le groupe fait partie des groupes accessibles
            accessible_group_ids = [g.group_id for g in self.group_accesses]
            # Fallback vers l'ancien système pour compatibilité
            if self.group_id == group_id:
                return True
            return group_id in accessible_group_ids
        return False

    # ── Helpers pour multi-sites et multi-équipes ────────────────────────────────
    @property
    def accessible_sites(self):
        """Retourne tous les sites accessibles par cet utilisateur"""
        # Utiliser les IDs extraits si disponibles (pour multi-tenant après session close)
        if hasattr(self, '_site_access_ids'):
            return self._site_access_ids
        # Utiliser les propriétés temporaires si disponibles (pour multi-tenant)
        if hasattr(self, '_site_accesses'):
            return [access.site for access in self._site_accesses]
        return [access.site for access in self.site_accesses]

    @property
    def accessible_groups(self):
        """Retourne tous les groupes accessibles par cet utilisateur"""
        # Utiliser les IDs extraits si disponibles (pour multi-tenant après session close)
        if hasattr(self, '_group_access_ids'):
            return self._group_access_ids
        # Utiliser les propriétés temporaires si disponibles (pour multi-tenant)
        if hasattr(self, '_group_accesses'):
            return [access.group for access in self._group_accesses]
        return [access.group for access in self.group_accesses]

    @property
    def accessible_site_ids(self):
        """Retourne les IDs des sites accessibles"""
        # Utiliser les IDs extraits si disponibles (pour multi-tenant après session close)
        if hasattr(self, '_site_access_ids'):
            return self._site_access_ids
        # Utiliser les propriétés temporaires si disponibles (pour multi-tenant)
        if hasattr(self, '_site_accesses'):
            return [access.site_id for access in self._site_accesses]
        return [access.site_id for access in self.site_accesses]

    @property
    def accessible_group_ids(self):
        """Retourne les IDs des groupes accessibles"""
        # Utiliser les IDs extraits si disponibles (pour multi-tenant après session close)
        if hasattr(self, '_group_access_ids'):
            return self._group_access_ids
        # Utiliser les propriétés temporaires si disponibles (pour multi-tenant)
        if hasattr(self, '_group_accesses'):
            return [access.group_id for access in self._group_accesses]
        return [access.group_id for access in self.group_accesses]
    
    @property
    def accessible_projects(self):
        """Retourne tous les projets accessibles par cet utilisateur"""
        # Utiliser les IDs extraits si disponibles (pour multi-tenant après session close)
        if hasattr(self, '_project_access_ids'):
            return self._project_access_ids
        # Utiliser les propriétés temporaires si disponibles (pour multi-tenant)
        if hasattr(self, '_project_accesses'):
            return [access.project for access in self._project_accesses]
        return []
    
    @property
    def accessible_project_ids(self):
        """Retourne les IDs des projets accessibles"""
        # Utiliser les IDs extraits si disponibles (pour multi-tenant après session close)
        if hasattr(self, '_project_access_ids'):
            return self._project_access_ids
        # Utiliser les propriétés temporaires si disponibles (pour multi-tenant)
        if hasattr(self, '_project_accesses'):
            return [access.project_id for access in self._project_accesses]
        return []

    # ✅ AJOUT : Propriétés pour sérialisation Pydantic (compatibilité frontend)
    @property
    def site_ids(self):
        """Retourne les IDs des sites accessibles (alias pour accessible_site_ids)"""
        return self.accessible_site_ids

    @property
    def group_ids(self):
        """Retourne les IDs des groupes accessibles (alias pour accessible_group_ids)"""
        return self.accessible_group_ids
    
    @property
    def project_ids(self):
        """Retourne les IDs des projets accessibles (alias pour accessible_project_ids)"""
        return self.accessible_project_ids