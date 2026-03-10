import logging

from app.database.session import engine
from app.models.base import Base

logger = logging.getLogger(__name__)

from app.models.app_user             import AppUser           # noqa: F401
from app.models.gitlab_config        import GitLabConfig      # noqa: F401
from app.models.project              import Project           # noqa: F401
from app.models.sub_project          import SubProject        # noqa: F401
from app.models.developer_group      import DeveloperGroup    # noqa: F401
from app.models.developer            import Developer         # noqa: F401
from app.models.period               import Period            # noqa: F401
from app.models.extraction_lot       import ExtractionLot     # noqa: F401
from app.models.commit               import Commit            # noqa: F401
from app.models.merge_request        import MergeRequest      # noqa: F401
from app.models.commit_merge_request import CommitMergeRequest # noqa: F401
from app.models.kpi_snapshot         import KpiSnapshot       # noqa: F401
from app.models.kpi_threshold        import KpiThreshold      # noqa: F401  ✅ AJOUT
from app.models.dashboard            import Dashboard         # noqa: F401
from app.models.dashboard_access     import DashboardAccess   # noqa: F401

def init_db() -> None:
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables created / verified successfully")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}", exc_info=True)
        raise