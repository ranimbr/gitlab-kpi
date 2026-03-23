"""
models/app_user.py

Utilisateur de l'application dashboard (admin ou user).
Ne pas confondre avec Developer (contributeur GitLab).

⚠️  POSTGRESQL ONLY :
    `dashboard_access = ARRAY(Integer)` est un type natif PostgreSQL.
    SQLite et MySQL ne supportent pas ce type — si tu changes de SGBD,
    remplace par une table de jointure dédiée (UserDashboardAccess).

Rôles :
    admin → peut créer/modifier Developer, Site, KpiThreshold, lancer extractions
    user  → lecture seule sur les dashboards auxquels il a accès

dashboard_access : liste des Dashboard.id accessibles par cet utilisateur.
    Remplace dashboard_view_group (String) + table DashboardAccess (supprimée).
    Contrôle d'accès : if dashboard.id in current_user.dashboard_access or dashboard.is_public
"""

from sqlalchemy import Column, Integer, String, Boolean, Enum
from sqlalchemy.dialects.postgresql import ARRAY  # ⚠️ PostgreSQL uniquement
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class UserRoleEnum(str, enum.Enum):
    admin = "admin"
    user  = "user"


class AppUser(Base):

    __tablename__ = "app_user"

    id              = Column(Integer, primary_key=True)
    email           = Column(String(255), unique=True, nullable=False)
    login           = Column(String(100), unique=True, nullable=True)
    name            = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(Enum(UserRoleEnum), default=UserRoleEnum.user, nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)

    # ⚠️  PostgreSQL uniquement — Liste des Dashboard.id accessibles
    # Alternatives cross-DB : table UserDashboardAccess ou JSON column
    dashboard_access = Column(ARRAY(Integer), nullable=True, default=list)

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

    # ── Index ────────────────────────────────────────────────────────────────
    # email et login ont unique=True → PostgreSQL crée automatiquement
    # un index unique → pas besoin d'Index() supplémentaire
    # is_active : filtrage fréquent sur les utilisateurs actifs
    __table_args__ = (
        # Pas d'index explicite nécessaire ici — email/login sont UNIQUE (indexés auto)
        # Ajout optionnel pour les recherches par rôle :
        # Index("idx_appuser_role", "role"),
    )

    # ── Helper métier ────────────────────────────────────────────────────────
    def can_access_dashboard(self, dashboard_id: int, is_public: bool = False) -> bool:
        """
        Vérifie si l'utilisateur a accès à un dashboard donné.
        Un admin a accès à tout. Un user n'accède qu'aux dashboards
        publics ou présents dans sa liste dashboard_access.
        """
        if self.role == UserRoleEnum.admin:
            return True
        if is_public:
            return True
        if self.dashboard_access and dashboard_id in self.dashboard_access:
            return True
        return False