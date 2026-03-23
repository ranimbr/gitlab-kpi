"""
schemas/kpi.py

CORRECTIONS :

    1. FIX — KpiSnapshotResponse manquait les 3 nouveaux deltas ajoutés
       dans le modèle KpiSnapshot lors de la correction des models :
           - delta_approved_mr_rate
           - delta_merged_mr_rate
           - delta_nb_commits
       AVANT : seulement delta_mr_rate, delta_commit_rate, delta_avg_review_time
       → les trend indicators de KPI #3, #4 et #6 étaient toujours None
         dans la réponse API même si calculés en DB.
       ✅ FIX : les 6 deltas sont maintenant inclus.

    2. FIX — kpi_definition_id SUPPRIMÉ de KpiSnapshotResponse
       (supprimé du modèle — design dénormalisé incompatible avec 1 seul KpiDef).

    3. FIX — DashboardSummaryResponse : developer_id et group_id ajoutés
       pour que le frontend puisse afficher le contexte de filtrage actif
       (ex: "Vous consultez les KPIs de Alice / Site Tunis").
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class KpiSnapshotResponse(BaseModel):
    """
    Réponse API pour un snapshot KPI.

    Design dénormalisé : 1 ligne = tous les KPIs du triplet
    (project, period, site/group/developer).
    """
    id:            int
    snapshot_date: date

    # ── Compteurs bruts ──────────────────────────────────────────────────────
    total_commits:      int
    total_mrs_created:  int
    total_mrs_approved: int
    total_mrs_merged:   int
    nb_developers:      int
    review_time_hours:  float

    # ── KPI #1 : MR Rate par site ─────────────────────────────────────────────
    # NB MRs non-draft / NB développeurs
    mr_rate_per_site: float

    # ── KPI #3 : Approved MR Rate ─────────────────────────────────────────────
    # NB MRs approuvées / NB MRs créées
    approved_mr_rate: float

    # ── KPI #4 : Merged MR Rate ───────────────────────────────────────────────
    # NB MRs mergées / NB MRs approuvées
    merged_mr_rate: float

    # ── KPI #5 : Commit Rate par site ─────────────────────────────────────────
    # NB commits devs validés / NB développeurs
    commit_rate_per_site: float

    # ── KPI #6 : NB commits par projet ───────────────────────────────────────
    # Tous les commits du projet sur la période
    nb_commits_per_project: int

    # ── KPI #7 : Temps moyen de relecture ─────────────────────────────────────
    # Σ(approved_at - created_at) / NB MRs approuvées
    avg_review_time_hours: float

    # ── Deltas vs snapshot précédent (trend indicators) ───────────────────────
    # Positif = hausse, négatif = baisse
    # NULL = pas de snapshot précédent (premier calcul du mois)
    # Interprétation dashboard : ↑ vert si hausse bonne, ↓ rouge si hausse mauvaise
    delta_mr_rate:          Optional[float]  # KPI #1 delta
    # ✅ FIX : 3 deltas manquants ajoutés
    delta_approved_mr_rate: Optional[float]  # KPI #3 delta ← NOUVEAU
    delta_merged_mr_rate:   Optional[float]  # KPI #4 delta ← NOUVEAU
    delta_commit_rate:      Optional[float]  # KPI #5 delta
    delta_nb_commits:       Optional[float]  # KPI #6 delta ← NOUVEAU
    delta_avg_review_time:  Optional[float]  # KPI #7 delta

    # ── Clés de contexte ─────────────────────────────────────────────────────
    project_id:   int
    period_id:    int
    lot_id:       Optional[int]
    site_id:      Optional[int]      # NULL = snapshot non filtré par site
    group_id:     Optional[int]      # NULL = agrégé tous groupes
    developer_id: Optional[int]      # NULL = snapshot agrégé (pas individuel)
    # ✅ SUPPRIMÉ : kpi_definition_id — incohérent avec design dénormalisé

    model_config = {"from_attributes": True}


class KpiHistoryResponse(BaseModel):
    """
    Liste de snapshots pour les graphiques timeline (Chart.js, Recharts).
    Retourné par GET /analytics/{project_id}/history.
    """
    project_id: int
    site_id:    Optional[int] = None
    snapshots:  List[KpiSnapshotResponse]
    total:      int = 0

    @classmethod
    def from_snapshots(
        cls,
        snapshots: List,
        project_id: int,
        site_id:    Optional[int] = None,
    ) -> "KpiHistoryResponse":
        """Factory — construit depuis une liste de snapshots ORM."""
        return cls(
            project_id = project_id,
            site_id    = site_id,
            snapshots  = snapshots,
            total      = len(snapshots),
        )


class DashboardSummaryResponse(BaseModel):
    """
    Résumé complet pour le Dashboard KPI frontend.
    Retourné par GET /kpis/dashboard et GET /analytics/{project_id}/dashboard.

    ✅ FIX : developer_id et group_id ajoutés pour afficher le contexte
    de filtrage actif dans le header du dashboard frontend.
    Ex : "KPIs de Alice (Site Tunis) — Mars 2025"
    """
    latest_metrics:  Optional[KpiSnapshotResponse]
    history:         List[KpiSnapshotResponse]
    total_snapshots: int

    # Métadonnées de contexte
    project_id:   int
    site_id:      Optional[int] = None
    group_id:     Optional[int] = None      # ✅ AJOUT
    developer_id: Optional[int] = None      # ✅ AJOUT
    period_label: Optional[str] = None      # ex: "Mars 2025"


class SnapshotGeneratedResponse(BaseModel):
    """
    Réponse après génération manuelle d'un snapshot via admin.
    POST /analytics/{project_id}/generate-snapshot.
    """
    message:       str
    snapshot_date: date
    period_id:     int
    project_id:    int
    site_id:       Optional[int]

    # Aperçu des valeurs calculées (pour confirmation immédiate dans l'UI)
    mr_rate_per_site:      Optional[float] = None
    avg_review_time_hours: Optional[float] = None


class SimpleMessageResponse(BaseModel):
    """Réponse générique pour les endpoints health / actions simples."""
    message: str
    success: bool = True