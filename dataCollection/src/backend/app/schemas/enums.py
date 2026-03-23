"""
schemas/enums.py

Source unique de vérité (Single Source of Truth) pour tous les enums
partagés entre plusieurs schemas.

POURQUOI ce fichier existe :
    Sans lui, PeriodFilterTypeEnum était dupliqué dans dashboard.py ET
    period_filter.py → deux classes différentes avec le même contenu →
    risque de désynchronisation si on ajoute une valeur dans l'une
    mais pas dans l'autre.

    UserRoleEnum était importé depuis app.models.app_user → couplage
    schema↔model interdit : le layer schemas ne doit pas dépendre du
    layer models (dépendance circulaire potentielle + fragilité).

RÈGLE :
    Tous les schemas importent leurs enums depuis CE fichier.
    Les modèles définissent leurs propres enums indépendants
    (même valeurs, classes séparées → loose coupling).
"""

from enum import Enum


# ── Utilisateurs ─────────────────────────────────────────────────────────────

class UserRoleEnum(str, Enum):
    admin = "admin"
    user  = "user"


# ── KPIs ─────────────────────────────────────────────────────────────────────

class AggregationLevelEnum(str, Enum):
    site      = "site"
    project   = "project"
    developer = "developer"
    group     = "group"


class KpiNameEnum(str, Enum):
    """Codes officiels des KPIs — miroir de KpiDefinition.code."""
    MR_RATE_SITE       = "MR_RATE_SITE"
    MR_RATE_TICKET     = "MR_RATE_TICKET"      # ignoré pour le moment
    APPROVED_MR_RATE   = "APPROVED_MR_RATE"
    MERGED_MR_RATE     = "MERGED_MR_RATE"
    COMMIT_RATE_SITE   = "COMMIT_RATE_SITE"
    NB_COMMITS_PROJECT = "NB_COMMITS_PROJECT"
    AVG_REVIEW_TIME    = "AVG_REVIEW_TIME"


class ThresholdTypeEnum(str, Enum):
    REALTIME = "REALTIME"
    MONTHLY  = "MONTHLY"


class AlertLevelEnum(str, Enum):
    WARNING  = "WARNING"
    CRITICAL = "CRITICAL"


# ── Période ───────────────────────────────────────────────────────────────────

class PeriodFilterTypeEnum(str, Enum):
    """
    ✅ SOURCE UNIQUE — importé dans dashboard.py ET period_filter.py.
    Plus de duplication possible.
    """
    realTime    = "realTime"
    lastMonth   = "lastMonth"
    last3Months = "last3Months"
    last6Months = "last6Months"
    lastYear    = "lastYear"
    custom      = "custom"


# ── Extraction ────────────────────────────────────────────────────────────────

class ExtractionTypeEnum(str, Enum):
    REALTIME = "REALTIME"
    MONTHLY  = "MONTHLY"


# ── KPI — sens des seuils ─────────────────────────────────────────────────────
# Centralisé ici pour être utilisé par kpi_threshold.py ET threshold_service.py

HIGHER_IS_WORSE: frozenset[str] = frozenset({
    "AVG_REVIEW_TIME",
})

LOWER_IS_WORSE: frozenset[str] = frozenset({
    "APPROVED_MR_RATE",
    "MERGED_MR_RATE",
    "MR_RATE_SITE",
    "COMMIT_RATE_SITE",
})

NEUTRAL_KPIS: frozenset[str] = frozenset({
    "NB_COMMITS_PROJECT",
})

ALL_KPI_NAMES: frozenset[str] = HIGHER_IS_WORSE | LOWER_IS_WORSE | NEUTRAL_KPIS
