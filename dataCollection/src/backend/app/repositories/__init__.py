"""
repositories/__init__.py — CORRIGÉ

CORRECTIONS noms de fichiers :
    audit_log_repositories.py → audit_log_repository.py  (pluriel → singulier)
    kpi_defintion_repository.py → kpi_definition_repository.py  (typo corrigée)
"""
from app.repositories.base                    import BaseRepository
from app.repositories.user_repository         import AppUserRepository
from app.repositories.site_repository         import SiteRepository
from app.repositories.gitlab_config_repository import GitLabConfigRepository
from app.repositories.project_repository      import ProjectRepository
from app.repositories.developer_repository    import DeveloperRepository, DeveloperGroupRepository
from app.repositories.period_repository       import PeriodRepository
from app.repositories.period_filter_repository import PeriodFilterRepository
from app.repositories.extraction_lot_repository import ExtractionLotRepository
from app.repositories.commit_repository       import CommitRepository
from app.repositories.merge_request_repository import MergeRequestRepository
from app.repositories.kpi_definition_repository import KpiDefinitionRepository   # ✅ typo corrigée
from app.repositories.kpi_snapshot_repository  import KpiSnapshotRepository
from app.repositories.kpi_threshold_repository import KpiThresholdRepository
from app.repositories.alert_repository         import AlertRepository
from app.repositories.dashboard_repository     import DashboardRepository
from app.repositories.audit_log_repository     import AuditLogRepository         # ✅ singulier