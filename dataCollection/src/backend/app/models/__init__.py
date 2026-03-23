"""
models/__init__.py

Point d'entrée unique pour tous les modèles SQLAlchemy.
Import ordonné selon les dépendances FK (les tables référencées avant les tables qui les référencent).

⚠️  CHANGEMENTS DE NOM À PROPAGER dans les services et routers :
    - ExtractionLot.type        → ExtractionLot.extraction_type
    - KpiThreshold.type         → KpiThreshold.threshold_type
    - KpiSnapshot : 3 nouveaux champs delta
        + delta_approved_mr_rate
        + delta_merged_mr_rate
        + delta_nb_commits
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
from app.models.developer_group import DeveloperGroup
from app.models.developer       import Developer

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
    "GitLabConfig",
    "Site",
    "Project",
    # Utilisateurs
    "AppUser",
    "AuditLog",
    # Organisation
    "DeveloperGroup",
    "Developer",
    # Périodes
    "Period",
    "PeriodFilter",
    "ExtractionLot",
    # Données GitLab
    "Commit",
    "MergeRequest",
    "CommitMergeRequest",
    # KPIs
    "KpiDefinition",
    "KpiSnapshot",
    "KpiThreshold",
    "Alert",
    # Dashboard
    "Dashboard",
]