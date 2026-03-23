"""database/init_db.py — inchangé."""
import logging
from app.database.session import engine
from app.models.base import Base
from app.models.app_user             import AppUser            # noqa
from app.models.gitlab_config        import GitLabConfig       # noqa
from app.models.project              import Project            # noqa
from app.models.developer_group      import DeveloperGroup     # noqa
from app.models.developer            import Developer          # noqa
from app.models.period               import Period             # noqa
from app.models.extraction_lot       import ExtractionLot      # noqa
from app.models.commit               import Commit             # noqa
from app.models.merge_request        import MergeRequest       # noqa
from app.models.commit_merge_request import CommitMergeRequest # noqa
from app.models.kpi_snapshot         import KpiSnapshot        # noqa
from app.models.kpi_threshold        import KpiThreshold       # noqa
from app.models.dashboard            import Dashboard          # noqa
from app.models.site                 import Site               # noqa
from app.models.kpi_definition       import KpiDefinition      # noqa
from app.models.alert                import Alert              # noqa
from app.models.audit_log            import AuditLog           # noqa
from app.models.period_filter        import PeriodFilter       # noqa

logger = logging.getLogger(__name__)

def init_db() -> None:
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables created / verified successfully")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}", exc_info=True)
        raise