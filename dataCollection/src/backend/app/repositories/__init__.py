"""
repositories/__init__.py

"""
from app.repositories.base                          import BaseRepository
from app.repositories.user_repository               import AppUserRepository
from app.repositories.site_repository               import SiteRepository
from app.repositories.gitlab_config_repository      import GitLabConfigRepository
from app.repositories.project_repository            import ProjectRepository
from app.repositories.developer_repository          import DeveloperRepository, DeveloperGroupRepository
# ✅ NOUVEAUX : tables de jonction M2M
from app.repositories.developer_project_repository  import DeveloperProjectRepository
from app.repositories.developer_site_repository     import DeveloperSiteRepository
from app.repositories.project_site_repository       import ProjectSiteRepository
# ✅ NOUVEAU : import en masse
from app.repositories.developer_import_log_repository import DeveloperImportLogRepository
from app.repositories.period_repository             import PeriodRepository
from app.repositories.period_filter_repository      import PeriodFilterRepository
from app.repositories.extraction_lot_repository     import ExtractionLotRepository
from app.repositories.commit_repository             import CommitRepository
from app.repositories.merge_request_repository      import MergeRequestRepository
from app.repositories.kpi_definition_repository     import KpiDefinitionRepository
from app.repositories.kpi_snapshot_repository       import KpiSnapshotRepository
from app.repositories.kpi_threshold_repository      import KpiThresholdRepository
from app.repositories.alert_repository              import AlertRepository
# DISABLED: Dashboard functionality removed
# from app.repositories.dashboard_repository          import DashboardRepository
from app.repositories.audit_log_repository          import AuditLogRepository
# Profile & Menu Management
from app.repositories.profile_repository           import ProfileRepository
from app.repositories.menu_item_repository         import MenuItemRepository