"""
database/init_db.py

Initialisation de la base de données PostgreSQL.
Crée toutes les tables et les index DDL (via event.listen).

⚠️  En production : utiliser Alembic pour les migrations.
    init_db() ne doit être utilisé qu'en développement initial
    ou pour les tests (create_all est idempotent si les tables existent déjà).
"""

import logging
from app.database.session import engine
from app.models.base import Base

# ── Configuration ──────────────────────────────────────────────────────────
from app.models.gitlab_config        import GitLabConfig       # noqa: F401
from app.models.site                 import Site               # noqa: F401
from app.models.project              import Project            # noqa: F401

# ── Utilisateurs & Accès ───────────────────────────────────────────────────
from app.models.app_user             import AppUser            # noqa: F401
from app.models.audit_log            import AuditLog           # noqa: F401

# ── Organisation Développeurs ──────────────────────────────────────────────
from app.models.developer_group      import DeveloperGroup     # noqa: F401
from app.models.developer            import Developer          # noqa: F401
from app.models.developer_import_log import DeveloperImportLog # noqa: F401

# ── Tables de jonction Many-to-Many ───────────────────────────────────────
from app.models.project_site         import ProjectSite        # noqa: F401
from app.models.developer_project    import DeveloperProject   # noqa: F401
from app.models.developer_site       import DeveloperSite      # noqa: F401

# ── Périodes & Extraction ──────────────────────────────────────────────────
from app.models.period               import Period             # noqa: F401
from app.models.period_filter        import PeriodFilter       # noqa: F401
from app.models.extraction_lot       import ExtractionLot      # noqa: F401

# ── Données GitLab ─────────────────────────────────────────────────────────
from app.models.commit               import Commit             # noqa: F401
from app.models.merge_request        import MergeRequest       # noqa: F401
from app.models.commit_merge_request import CommitMergeRequest # noqa: F401

# ── KPIs ───────────────────────────────────────────────────────────────────
from app.models.kpi_definition       import KpiDefinition      # noqa: F401
from app.models.kpi_snapshot         import KpiSnapshot        # noqa: F401
from app.models.kpi_threshold        import KpiThreshold       # noqa: F401
from app.models.alert                import Alert              # noqa: F401

# ── Dashboard ──────────────────────────────────────────────────────────────
from app.models.dashboard            import Dashboard          # noqa: F401

logger = logging.getLogger(__name__)


def init_db() -> None:
    """
    Crée toutes les tables PostgreSQL.
    Les index DDL (DDL event.listen) sont déclenchés automatiquement
    lors du create_all par SQLAlchemy.

    Tables créées / vérifiées dans l'ordre FK :
        site → gitlab_config → project
        app_user → developer_group → developer → developer_import_log
        project_site, developer_project, developer_site
        period → extraction_lot
        git_commit → merge_request → commit_merge_request
        kpi_definition → kpi_snapshot → kpi_threshold → alert
        dashboard → period_filter
        audit_log
    """
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Toutes les tables créées / vérifiées avec succès.")
        logger.info("✅ Index DDL (COALESCE, index partiels) appliqués.")
    except Exception as e:
        logger.error(f"❌ Échec de l'initialisation de la base : {e}", exc_info=True)
        raise