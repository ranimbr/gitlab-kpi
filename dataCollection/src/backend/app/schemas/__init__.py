"""
schemas/__init__.py — CORRIGÉ

CORRECTIONS :
    1. Import de PeriodFilterCreate/Response depuis period_filter.py uniquement
       (suppression du double alias DashboardPeriodFilterCreate/Response)
    2. sub_project.py SUPPRIMÉ (SubProject retiré du projet)
    3. Ajout des exports depuis enums.py
    4. Import ExtractionTypeEnum depuis enums (plus depuis extraction_lot)
"""

# ── Enums partagés (source unique) ───────────────────────────────────────────
from app.schemas.enums import (
    UserRoleEnum,
    AggregationLevelEnum,
    KpiNameEnum,
    ThresholdTypeEnum,
    AlertLevelEnum,
    PeriodFilterTypeEnum,
    ExtractionTypeEnum,
    HIGHER_IS_WORSE,
    LOWER_IS_WORSE,
    NEUTRAL_KPIS,
    ALL_KPI_NAMES,
)

# ── Auth ──────────────────────────────────────────────────────────────────────
from app.schemas.auth import (
    RegisterRequest, LoginRequest,
    TokenResponse, UserResponse,
)

# ── User ──────────────────────────────────────────────────────────────────────
from app.schemas.user import (
    CreateUserRequest, UpdateUserRequest,
    ChangePasswordRequest, UserManagementResponse,
)

# ── Site ──────────────────────────────────────────────────────────────────────
from app.schemas.site import (
    SiteCreate, SiteUpdate, SiteResponse,
)

# ── GitLab Config ─────────────────────────────────────────────────────────────
from app.schemas.gitlab_config import (
    GitLabConfigCreate, GitLabConfigUpdate, GitLabConfigResponse,
)

# ── Project ───────────────────────────────────────────────────────────────────
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
)

# ── Developer ─────────────────────────────────────────────────────────────────
from app.schemas.developer import (
    DeveloperGroupCreate, DeveloperGroupUpdate, DeveloperGroupResponse,
    DeveloperCreate, DeveloperUpdate, DeveloperValidate, DeveloperResponse,
)

# ── Period ────────────────────────────────────────────────────────────────────
from app.schemas.period import (
    PeriodCreate, PeriodResponse, PeriodCloseResponse,
)

# ── PeriodFilter (source unique) ──────────────────────────────────────────────
from app.schemas.period_filter import (
    PeriodFilterCreate, PeriodFilterUpdate, PeriodFilterResponse,
)
# ✅ Plus de DashboardPeriodFilterCreate/DashboardPeriodFilterResponse
# dashboard.py importe depuis period_filter.py directement

# ── Extraction ────────────────────────────────────────────────────────────────
from app.schemas.extraction_lot import (
    ExtractionLotCreate, ExtractionLotResponse, ExtractionRunResponse,
)

# ── Données GitLab ────────────────────────────────────────────────────────────
from app.schemas.commit import CommitResponse
from app.schemas.merge_request import MergeRequestResponse

# ── KPI Definition ────────────────────────────────────────────────────────────
from app.schemas.kpi_definition import (
    KpiDefinitionCreate, KpiDefinitionUpdate, KpiDefinitionResponse,
)

# ── KPI Snapshot & Analytics ──────────────────────────────────────────────────
from app.schemas.kpi import (
    KpiSnapshotResponse, KpiHistoryResponse,
    DashboardSummaryResponse, SnapshotGeneratedResponse,
    SimpleMessageResponse,
)

# ── KPI Threshold ─────────────────────────────────────────────────────────────
from app.schemas.kpi_threshold import (
    KpiThresholdCreate, KpiThresholdUpdate, KpiThresholdResponse,
    KpiAlertLevel,
)

# ── Alert ─────────────────────────────────────────────────────────────────────
from app.schemas.alert import (
    AlertResponse, AlertAcknowledgeRequest,
    AlertFilterParams, AlertSummaryResponse,
)

# ── Dashboard ─────────────────────────────────────────────────────────────────
from app.schemas.dashboard import (
    DashboardCreate, DashboardUpdate, DashboardResponse,
)

# ── Audit Log ─────────────────────────────────────────────────────────────────
from app.schemas.audit_log import (
    AuditLogResponse, AuditLogFilterParams,
)

# ── Supprimés ─────────────────────────────────────────────────────────────────
# sub_project.py ✗ supprimé — SubProject retiré du projet
# DashboardPeriodFilterCreate ✗ supprimé — utiliser PeriodFilterCreate
# DashboardPeriodFilterResponse ✗ supprimé — utiliser PeriodFilterResponse
