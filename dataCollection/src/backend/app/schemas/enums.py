"""
schemas/enums.py

"""

from enum import Enum


# ── Utilisateurs ──────────────────────────────────────────────────────────────

class UserRoleEnum(str, Enum):
    #  4 rôles granulaires (remplace admin/user)
    super_admin  = "super_admin"   # Accès total — gestion sites, devs, KPIs, extractions
    site_manager = "site_manager"  # Accès limité à son site (filtré par site_id)
    team_lead    = "team_lead"     # Accès limité à son groupe (filtré par group_id)
    developer    = "developer"     # Lecture seule de ses propres KPIs


# ── KPIs ──────────────────────────────────────────────────────────────────────

class AggregationLevelEnum(str, Enum):
    site      = "site"
    project   = "project"
    developer = "developer"
    group     = "group"


class KpiNameEnum(str, Enum):
    """Codes officiels des KPIs — miroir de KpiDefinition.code."""
    MR_RATE_SITE       = "MR_RATE_SITE"
    MR_RATE_TICKET     = "MR_RATE_TICKET"      # Réservé — tickets ignorés pour le moment
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
    """Source unique — importé dans dashboard.py ET period_filter.py."""
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


# ── Données GitLab ────────────────────────────────────────────────────────────

class MRStateEnum(str, Enum):
    opened = "opened"
    closed = "closed"
    merged = "merged"


class DeveloperSourceEnum(str, Enum):
    """Origine de la création du Developer."""
    gitlab_extraction = "gitlab_extraction"  # Créé automatiquement lors d'une extraction
    manual            = "manual"             # Créé manuellement par l'admin
    csv_import        = "csv_import"         # Créé via import CSV/Excel


# ── Import développeurs ───────────────────────────────────────────────────────

class ImportStatusEnum(str, Enum):
    """Statut d'un import en masse de développeurs."""
    pending    = "pending"
    processing = "processing"
    completed  = "completed"
    failed     = "failed"


# ── KPI — sens des seuils ─────────────────────────────────────────────────────
# Centralisé ici pour threshold_service.py et kpi_threshold.py (schemas)

HIGHER_IS_WORSE: frozenset[str] = frozenset({
    # Plus la valeur est haute, moins c'est bon
    "AVG_REVIEW_TIME",    # Temps de review élevé = problème de qualité
})

LOWER_IS_WORSE: frozenset[str] = frozenset({
    # Plus la valeur est basse, moins c'est bon
    "APPROVED_MR_RATE",   # Peu de MRs approuvées = problème de qualité
    "MERGED_MR_RATE",     # Peu de MRs mergées = livraisons bloquées
    "MR_RATE_SITE",       # Peu de MRs = peu d'activité
    "COMMIT_RATE_SITE",   # Peu de commits = peu d'activité
})

NEUTRAL_KPIS: frozenset[str] = frozenset({
    # Pas de sens fixe — dépend du contexte projet
    "NB_COMMITS_PROJECT",
    "MR_RATE_TICKET",
})

ALL_KPI_NAMES: frozenset[str] = HIGHER_IS_WORSE | LOWER_IS_WORSE | NEUTRAL_KPIS