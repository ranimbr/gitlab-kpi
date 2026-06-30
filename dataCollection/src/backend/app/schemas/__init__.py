"""
schemas/__init__.py

CORRECTIONS (remarques encadrant + modèles mis à jour) :
──────────────────────────────────────────────────────────
NOUVEAUX EXPORTS :
  + DeveloperSummary, DeveloperKpiSummary
  + DeveloperImportRequest, DeveloperImportResponse, DeveloperImportLogResponse
  + DeveloperSiteAssociation, DeveloperProjectAssociation
  + DeveloperLeaderboardEntry, DeveloperLeaderboardResponse
  + DeveloperKpiSnapshotResponse
  + DeveloperAlertSummary
  + CommitSummary, UnmatchedCommitResponse
  + MergeRequestSummary, UnmatchedMRResponse, ReviewerWorkloadResponse
  + ProjectSummary, ProjectSiteAssign
  + ImportStatusEnum, MRStateEnum, DeveloperSourceEnum

CHANGEMENTS PROPAGÉS :
  UserRoleEnum      : 4 rôles (super_admin, site_manager, team_lead, developer)
  DeveloperCreate   : + sites/projects (M2M), + gitlab_username, is_external, etc.
  DeveloperResponse : + sites/projects listes, + nouveaux champs
  DeveloperGroupCreate : - project_id, + description
  ProjectCreate     : - site_id → site_ids (liste)
  AlertResponse     : + developer_id
  KpiSnapshotResponse : + developer_score, score_rank_in_site, mr_rate_per_ticket
  KpiThresholdCreate  : + site_id
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
    MRStateEnum,
    DeveloperSourceEnum,
    ImportStatusEnum,
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
    ProjectSummary, ProjectSiteAssign,
)

# ── Developer ─────────────────────────────────────────────────────────────────
from app.schemas.developer import (
    # Groups
    DeveloperGroupCreate, DeveloperGroupUpdate, DeveloperGroupResponse,
    # Developer CRUD
    DeveloperCreate, DeveloperUpdate, DeveloperValidate, DeveloperResponse,
    # Associations M2M
    DeveloperSiteAssociation, DeveloperProjectAssociation,
    # Réponses enrichies
    DeveloperSummary, DeveloperKpiSummary,
    # Import CSV/Excel
    DeveloperImportRequest, DeveloperImportResponse,
    DeveloperImportLogResponse, DeveloperImportRowResult,
)

# ── Period ────────────────────────────────────────────────────────────────────
from app.schemas.period import (
    PeriodCreate, PeriodResponse, PeriodCloseResponse,
)

# ── PeriodFilter ──────────────────────────────────────────────────────────────
from app.schemas.period_filter import (
    PeriodFilterCreate, PeriodFilterUpdate, PeriodFilterResponse,
)

# ── Extraction ────────────────────────────────────────────────────────────────
from app.schemas.extraction_lot import (
    ExtractionLotCreate, ExtractionLotResponse, ExtractionRunResponse,
)

# ── Données GitLab ────────────────────────────────────────────────────────────
from app.schemas.commit import (
    CommitResponse, CommitSummary, UnmatchedCommitResponse,
)
from app.schemas.merge_request import (
    MergeRequestResponse, MergeRequestSummary,
    UnmatchedMRResponse, ReviewerWorkloadResponse,
)

# ── KPI Definition ────────────────────────────────────────────────────────────
from app.schemas.kpi_definition import (
    KpiDefinitionCreate, KpiDefinitionUpdate, KpiDefinitionResponse,
)

# ── KPI Snapshot & Analytics ──────────────────────────────────────────────────
from app.schemas.kpi import (
    KpiSnapshotResponse,
    DeveloperKpiSnapshotResponse,
    DeveloperLeaderboardEntry,
    DeveloperLeaderboardResponse,
    KpiHistoryResponse,
    # DashboardSummaryResponse,  # DISABLED: Dashboard functionality removed
    SnapshotGeneratedResponse,
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
    DeveloperAlertSummary,
)

# ── Dashboard ─────────────────────────────────────────────────────────────────
# DISABLED: Dashboard functionality removed
# from app.schemas.dashboard import (
#     DashboardCreate, DashboardUpdate, DashboardResponse,
# )

# ── Audit Log ─────────────────────────────────────────────────────────────────
from app.schemas.audit_log import (
    AuditLogResponse, AuditLogFilterParams,
)

# ── Profile & Menu Management ──────────────────────────────────────────────────
from app.schemas.profile import (
    ProfileCreate, ProfileUpdate, ProfileResponse, ProfileWithMenus,
)
from app.schemas.menu_item import (
    MenuItemCreate, MenuItemUpdate, MenuItemResponse,
    MenuItemTree, MenuItemWithAccess,
)
from app.schemas.profile_menu_item import (
    ProfileMenuItemAccess, ProfileMenuItemBatchUpdate,
)