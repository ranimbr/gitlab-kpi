from pydantic import BaseModel
from typing import Optional, List
from datetime import date


# ─── Snapshot complet ─────────────────────────────────────────────────────────

class KpiSnapshotResponse(BaseModel):
    """
    Retourne les 7 KPIs calculés selon la spec encadrant.
    """
    id          : int
    project_id  : int
    period_id   : int
    site        : Optional[str]          # null = snapshot global projet
    snapshot_date : date

    # Compteurs bruts
    total_commits      : int
    total_mrs_created  : int             # non-draft uniquement
    total_mrs_approved : int
    total_mrs_merged   : int
    nb_developers      : int

    # KPI #1 — MR Rate / site
    mr_rate_per_site     : float

    # KPI #3 — Approved MR Rate
    approved_mr_rate     : float

    # KPI #4 — Merged MR Rate
    merged_mr_rate       : float

    # KPI #5 — Commit Rate / site
    commit_rate_per_site : float

    # KPI #6 — NB Commits / projet
    nb_commits_per_project : int

    # KPI #7 — Temps moyen de relecture (heures)
    avg_review_time_hours  : float

    class Config:
        from_attributes = True


# ─── Historique ───────────────────────────────────────────────────────────────

class KpiHistoryResponse(BaseModel):
    snapshots : List[KpiSnapshotResponse]


# ─── Dashboard summary ────────────────────────────────────────────────────────

class DashboardSummaryResponse(BaseModel):
    latest_metrics  : Optional[KpiSnapshotResponse]
    history         : List[KpiSnapshotResponse]
    total_snapshots : int


# ─── Réponse génération snapshot ─────────────────────────────────────────────

class SnapshotGeneratedResponse(BaseModel):
    message       : str
    snapshot_date : date
    period_id     : int
    project_id    : int
    site          : Optional[str]


# ─── Réponse générique ────────────────────────────────────────────────────────

class SimpleMessageResponse(BaseModel):
    message : str