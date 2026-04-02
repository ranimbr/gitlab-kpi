"""
models/__init__.py

Point d'entrée unique pour tous les modèles SQLAlchemy.
Import ordonné selon les dépendances FK.

NOUVEAUX MODÈLES (remarques encadrant) :
─────────────────────────────────────────
  + ProjectSite          → M2M Project ↔ Site
  + DeveloperProject     → M2M Developer ↔ Project
  + DeveloperSite        → M2M Developer ↔ Site
  + DeveloperImportLog   → Traçabilité imports CSV/Excel

CHANGEMENTS PROPAGÉS :
  - AppUser.role         : admin/user → super_admin/site_manager/team_lead/developer
  - AppUser              : + site_id, + group_id, + developer_import_logs
  - Developer            : - project_id, - site_id → M2M via tables de jonction
                           + gitlab_username, + avatar_url, + is_external
                           + auto_created, + onboarding_date, + last_active_at
  - Project              : - site_id → M2M via ProjectSite
                           + last_commit_date
  - DeveloperGroup       : - project_id (groupe appartient au site, pas au projet)
  - KpiSnapshot          : + developer_score, + score_rank_in_site, + mr_rate_per_ticket
  - KpiThreshold         : + site_id (seuil configurable par site)
  - Alert                : + developer_id (alerte individuelle par développeur)

⚠️  MIGRATIONS REQUISES :
  1. CREATE TABLE project_site, developer_project, developer_site, developer_import_log
  2. ALTER TABLE developer   DROP COLUMN project_id, DROP COLUMN site_id
     ADD COLUMN gitlab_username, avatar_url, is_external, auto_created, onboarding_date, last_active_at
  3. ALTER TABLE project     DROP COLUMN site_id, ADD COLUMN last_commit_date
  4. ALTER TABLE developer_group DROP COLUMN project_id
  5. ALTER TABLE kpi_snapshot    ADD COLUMN developer_score, score_rank_in_site, mr_rate_per_ticket
  6. ALTER TABLE kpi_threshold   ADD COLUMN site_id
  7. ALTER TABLE alert           ADD COLUMN developer_id
  8. ALTER TABLE app_user        ADD COLUMN site_id, group_id
     ALTER TYPE userrole_enum RENAME/ADD VALUES
"""

from app.models.base import Base

# ── Configuration ──────────────────────────────────────────────────────────
from app.models.gitlab_config   import GitLabConfig
from app.models.site            import Site
from app.models.project         import Project

# ── Utilisateurs & Accès ───────────────────────────────────────────────────
from app.models.app_user        import AppUser
from app.models.audit_log       import AuditLog

# ── Organisation Développeurs ──────────────────────────────────────────────
from app.models.developer_group     import DeveloperGroup
from app.models.developer           import Developer
from app.models.developer_import_log import DeveloperImportLog

# ── Tables de jonction Many-to-Many ───────────────────────────────────────
from app.models.project_site        import ProjectSite
from app.models.developer_project   import DeveloperProject
from app.models.developer_site      import DeveloperSite

# ── Périodes & Extraction ──────────────────────────────────────────────────
from app.models.period          import Period
from app.models.period_filter   import PeriodFilter
from app.models.extraction_lot  import ExtractionLot

# ── Données GitLab ─────────────────────────────────────────────────────────
from app.models.commit               import Commit
from app.models.merge_request        import MergeRequest
from app.models.commit_merge_request import CommitMergeRequest

# ── KPIs ───────────────────────────────────────────────────────────────────
from app.models.kpi_definition  import KpiDefinition
from app.models.kpi_snapshot    import KpiSnapshot
from app.models.kpi_threshold   import KpiThreshold
from app.models.alert           import Alert

# ── Dashboard ──────────────────────────────────────────────────────────────
from app.models.dashboard       import Dashboard


__all__ = [
    "Base",
    # Configuration
    "GitLabConfig", "Site", "Project",
    # Utilisateurs
    "AppUser", "AuditLog",
    # Organisation
    "DeveloperGroup", "Developer", "DeveloperImportLog",
    # Many-to-Many
    "ProjectSite", "DeveloperProject", "DeveloperSite",
    # Périodes
    "Period", "PeriodFilter", "ExtractionLot",
    # Données GitLab
    "Commit", "MergeRequest", "CommitMergeRequest",
    # KPIs
    "KpiDefinition", "KpiSnapshot", "KpiThreshold", "Alert",
    # Dashboard
    "Dashboard",
]