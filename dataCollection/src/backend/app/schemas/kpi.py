"""
schemas/kpi.py

"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


# ═══════════════════════════════════════════════════════════════════════════════
#  KPI SNAPSHOT — Réponse principale
# ═══════════════════════════════════════════════════════════════════════════════

class KpiSnapshotResponse(BaseModel):
    """
    Réponse API pour un snapshot KPI.
    1 ligne = tous les KPIs du triplet (project, period, site/group/developer).
    """
    id:            Optional[int]  = None
    snapshot_date: Optional[date] = None

    # ── Compteurs bruts ──────────────────────────────────────────────────────
    total_commits:      int = 0
    total_mrs_created:  int = 0
    total_mrs_approved: int = 0
    total_mrs_merged:   int = 0
    total_comments:     int = 0
    total_reviews:      int = 0
    total_mrs_draft:    int = 0
    nb_developers:      int = 0
    review_time_hours:  float = 0.0
    
    # ✅ METRIQUES ENTERPRISE (Pilotage Stratégique) 🚀
    bus_factor:         int   = 0
    sprint_velocity:    float = 0.0
    code_churn_rate:    float = 0.0

    # ── KPI #1 : MR Rate par site ─────────────────────────────────────────────
    # Formule : total_mrs_created / nb_developers
    mr_rate_per_site: float = 0.0

    # ── KPI #2 : MR Rate par ticket (réservé) ────────────────────────────────
    # Nullable — encadrant : "pour le moment on néglige les tickets"
    mr_rate_per_ticket: Optional[float] = None

    # ── KPI #3 : Approved MR Rate ─────────────────────────────────────────────
    # Formule : total_mrs_approved / total_mrs_created
    approved_mr_rate: float = 0.0

    # ── KPI #4 : Merged MR Rate ───────────────────────────────────────────────
    # Formule : total_mrs_merged / total_mrs_approved
    merged_mr_rate: float = 0.0

    # ── KPI #5 : Commit Rate par site ─────────────────────────────────────────
    # Formule : total_commits / nb_developers
    commit_rate_per_site: float = 0.0

    # ── KPI #6 : NB commits par projet ───────────────────────────────────────
    nb_commits_per_project: int = 0

    # ── KPI #7 : Temps moyen de relecture ─────────────────────────────────────
    # Formule : review_time_hours (somme) / total_mrs_approved
    avg_review_time_hours: float = 0.0

    # ── KPI #8 : Commits moyen par MR (Complexité) ─────────────────────────────
    # Formule : sum(commits_count) / total_mrs_created
    # Apport : Identifie les MRs complexes avec beaucoup de commits
    avg_commits_per_mr: float = 0.0

    # ── Deltas vs snapshot précédent (trend indicators) ───────────────────────
    # NULL = premier snapshot — pas de comparaison disponible
    delta_mr_rate:          Optional[float] = None
    delta_approved_mr_rate: Optional[float] = None
    delta_merged_mr_rate:   Optional[float] = None
    delta_commit_rate:      Optional[float] = None
    # ✅ FIX : Integer — cohérent avec nb_commits_per_project (Integer) et
    # le modèle KpiSnapshot.delta_nb_commits (Integer après correction)
    delta_nb_commits:       Optional[int]   = None
    delta_avg_review_time:  Optional[float] = None

    # ── Score développeur (uniquement pour snapshots individuels) ────────────
    # NULL pour les snapshots agrégés (site/groupe/projet)
    developer_score:    Optional[float] = None
    score_rank_in_site: Optional[int]   = None

    # ── Clés de contexte ─────────────────────────────────────────────────────
    project_id:   Optional[int] = None
    period_id:    Optional[int] = None
    lot_id:       Optional[int] = None
    site_id:      Optional[int] = None
    group_id:     Optional[int] = None
    developer_id: Optional[int] = None

    # ── Champs enrichis (pour le frontend) ──────────────────────────────────
    site_name:      Optional[str] = None
    developer_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════════════════════
#  VUE INDIVIDUELLE DÉVELOPPEUR
# ═══════════════════════════════════════════════════════════════════════════════

class DeveloperKpiSnapshotResponse(BaseModel):
    """
    Vue KPI individuelle complète pour la page profil développeur.
    Retournée par GET /kpis/developer/{developer_id}.

    Enrichie avec les infos du développeur pour éviter une requête
    supplémentaire côté frontend.
    """
    # ── Identité ─────────────────────────────────────────────────────────────
    developer_id:      int
    developer_name:    str
    gitlab_username:   Optional[str] = None
    avatar_url:        Optional[str] = None
    primary_site_name: Optional[str] = None
    group_name:        Optional[str] = None

    # ── Snapshot KPI individuel ───────────────────────────────────────────────
    snapshot:    Optional[KpiSnapshotResponse] = None
    period_label: str                           # ex: "Mars 2025"

    # ── Score et classement ───────────────────────────────────────────────────
    developer_score:    Optional[float] = None
    score_rank_in_site: Optional[int]   = None
    total_devs_in_site: Optional[int]   = None  # Pour "3ème / 12 développeurs"

    # ── Activité récente ──────────────────────────────────────────────────────
    last_commit_date:     Optional[datetime] = None
    last_mr_date:         Optional[datetime] = None
    is_active_this_month: bool               = False


# ═══════════════════════════════════════════════════════════════════════════════
#  LEADERBOARD DÉVELOPPEURS
# ═══════════════════════════════════════════════════════════════════════════════

class DeveloperLeaderboardEntry(BaseModel):
    """
    Entrée du leaderboard — une ligne par développeur classé.
    Retourné par GET /kpis/leaderboard.
    """
    rank:            int
    developer_id:    int
    developer_name:  str
    gitlab_username: Optional[str] = None
    avatar_url:      Optional[str] = None
    group_name:      Optional[str] = None

    # KPIs du mois
    commit_count:          int   = 0
    mr_count:              int   = 0
    approved_mr_count:     int   = 0
    approved_rate:         Optional[float] = None  # ratio 0-1 pour le frontend
    avg_review_time_hours: float = 0.0
    avg_review_hours:      Optional[float] = None  # alias pour le frontend

    # Score global
    developer_score: Optional[float] = None

    # Variation vs mois précédent
    score_delta: Optional[float] = None
    # ✅ FIX : commentaire corrigé
    # Valeur signée : négatif = amélioration du rang (1 est meilleur que 5)
    # Exemple : passer du rang 5 au rang 3 → rank_delta = -2 (amélioration)
    # Exemple : passer du rang 3 au rang 6 → rank_delta = +3 (régression)
    rank_delta: Optional[int] = None


class DeveloperLeaderboardResponse(BaseModel):
    """
    Leaderboard complet d'un site pour une période.
    Retourné par GET /kpis/leaderboard?site_id=X&period_id=Y.
    """
    site_id:      Optional[int] = None
    group_id:     Optional[int] = None
    site_name:    Optional[str] = None
    period_label: str           # ex: "Mars 2025"
    total_devs:   int

    entries: List[DeveloperLeaderboardEntry] = []


# ═══════════════════════════════════════════════════════════════════════════════
#  HISTORIQUE & DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════════

class KpiHistoryResponse(BaseModel):
    """
    Liste de snapshots pour les graphiques timeline (Chart.js, Recharts).
    Retourné par GET /analytics/{project_id}/history.
    """
    project_id:   int
    site_id:      Optional[int]            = None
    developer_id: Optional[int]            = None
    snapshots:    List[KpiSnapshotResponse]
    total:        int = 0

    @classmethod
    def from_snapshots(
        cls,
        snapshots:    List,
        project_id:   int,
        site_id:      Optional[int] = None,
        developer_id: Optional[int] = None,
    ) -> "KpiHistoryResponse":
        return cls(
            project_id   = project_id,
            site_id      = site_id,
            developer_id = developer_id,
            snapshots    = snapshots,
            total        = len(snapshots),
        )


class DashboardSummaryResponse(BaseModel):
    """
    Résumé complet pour le Dashboard KPI frontend.
    Retourné par GET /kpis/dashboard.
    """
    latest_metrics:  Optional[KpiSnapshotResponse]
    history:         List[KpiSnapshotResponse]
    total_snapshots: int

    # Contexte de filtrage actif
    project_id:   Optional[int] = None
    site_id:      Optional[int] = None
    group_id:     Optional[int] = None
    developer_id: Optional[int] = None
    period_label: Optional[str] = None     # ex: "Mars 2025"

    # Leaderboard du site (si site_id fourni)
    leaderboard: Optional[DeveloperLeaderboardResponse] = None


class SnapshotGeneratedResponse(BaseModel):
    """Réponse après génération manuelle d'un snapshot."""
    message:       str
    snapshot_date: date
    period_id:     int
    project_id:    int
    site_id:       Optional[int]
    developer_id:  Optional[int] = None

    mr_rate_per_site:      Optional[float] = None
    avg_review_time_hours: Optional[float] = None
    developer_score:       Optional[float] = None


class SimpleMessageResponse(BaseModel):
    """Réponse générique pour les endpoints health / actions simples."""
    message: str
    success: bool = True