/**
 * services/analyticsService.js
 *
 * Service canonique pour tous les appels KPI/analytics.
 *
 * CORRECTIONS :
 *
 *   1. AJOUT — getMultiPeriod() : endpoint GET /kpis/multi-period
 *      Reproduit le tableau comparatif multi-mois du PDF encadrant :
 *          Site    | Déc 2025 | Jan 2026 | Fév 2026
 *          France  | rate=5.8 | rate=6.0 | rate=4.4
 *          Tunisie | rate=5.1 | rate=2.8 | rate=3.6
 *
 *   2. AJOUT — getTrend() : endpoint GET /kpis/trend
 *      Données optimisées Chart.js/Recharts pour les graphiques linéaires
 *      France vs Tunisie sur 12 mois.
 *      Format retourné : { labels: [...], datasets: [{site_name, data}] }
 *
 *   3. FIX — compareSites() : ajout du paramètre kpi_field.
 *
 *   4. FIX — getTopDevelopers() : nouveau endpoint backend.
 */

import api from "./api";

// ── Helper : construit les params en excluant les nulls ───────────────────────
const buildParams = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null)
  );

const analyticsService = {

  /**
   * GET /analytics/{projectId}/latest
   * Dernier snapshot KPI pour un projet/site/groupe/développeur.
   */
  getLatest: async (projectId, { siteId, groupId, developerId } = {}) => {
    const params = buildParams({
      site_id:      siteId,
      group_id:     groupId,
      developer_id: developerId,
    });
    const { data } = await api.get(`/analytics/${projectId}/latest`, { params });
    return data;
  },

  /**
   * GET /analytics/{projectId}/history
   * Historique des snapshots (pour graphiques timeline).
   */
  getHistory: async (
    projectId,
    { siteId, groupId, developerId, startDate, endDate } = {}
  ) => {
    const params = buildParams({
      site_id:      siteId,
      group_id:     groupId,
      developer_id: developerId,
      start_date:   startDate,
      end_date:     endDate,
    });
    const { data } = await api.get(`/analytics/${projectId}/history`, { params });
    return data;
  },

  /**
   * GET /analytics/{projectId}/dashboard
   * Résumé complet : latest + history.
   */
  getDashboard: async (projectId, { siteId, groupId, developerId } = {}) => {
    const params = buildParams({
      site_id:      siteId,
      group_id:     groupId,
      developer_id: developerId,
    });
    const { data } = await api.get(`/analytics/${projectId}/dashboard`, { params });
    return data;
  },

  /**
   * GET /kpis/dashboard
   * Endpoint principal du dashboard frontend.
   */
  getKpiDashboard: async (projectId, { siteId, groupId, developerId } = {}) => {
    const params = buildParams({
      project_id:   projectId,
      site_id:      siteId,
      group_id:     groupId,
      developer_id: developerId,
    });
    const { data } = await api.get("/kpis/dashboard", { params });
    return data;
  },

  /**
   * GET /kpis/multi-period
   * ✅ NOUVEAU — tableau comparatif N mois par site.
   *
   * Reproduit le tableau du PDF encadrant :
   *   Site    | Déc 2025 | Jan 2026 | Fév 2026
   *   France  | 5.8      | 6.0      | 4.4
   *   Tunisie | 5.1      | 2.8      | 3.6
   *
   * Réponse backend :
   * [
   *   {
   *     period_id: 1, year: 2025, month: 12,
   *     period_label: "Décembre 2025",
   *     snapshots: [
   *       { site_id: 1, site_name: "France", mr_rate_per_site: 5.8,
   *         nb_developers: 17, total_mrs_created: 99,
   *         approved_mr_rate: 0.78, avg_review_time_hours: 12.4,
   *         delta_mr_rate: +0.2, ... },
   *       { site_id: 2, site_name: "Tunisie", ... }
   *     ]
   *   },
   *   { period_label: "Janvier 2026", snapshots: [...] },
   *   { period_label: "Février 2026", snapshots: [...] },
   * ]
   *
   * @param {number}  projectId
   * @param {number}  [months=3]   - Nombre de mois à comparer (1-12)
   * @param {number}  [siteId]     - Filtrer sur un site spécifique
   */
  getMultiPeriod: async (projectId, { months = 3, siteId = null } = {}) => {
    const params = buildParams({
      project_id: projectId,
      months,
      site_id: siteId,
    });
    const { data } = await api.get("/kpis/multi-period", { params });
    return data;
  },

  /**
   * GET /kpis/trend
   * ✅ NOUVEAU — historique pour graphiques linéaires par site.
   *
   * Réponse backend (format prêt pour Chart.js / Recharts) :
   * {
   *   project_id: 1,
   *   kpi_field: "mr_rate_per_site",
   *   labels: ["Mar 2025", "Avr 2025", ..., "Fév 2026"],
   *   datasets: [
   *     { site_id: 1, site_name: "France",  data: [5.8, 4.4, 6.1, ...] },
   *     { site_id: 2, site_name: "Tunisie", data: [5.1, 3.6, 4.2, ...] },
   *   ]
   * }
   *
   * @param {number}  projectId
   * @param {string}  [kpiField="mr_rate_per_site"]
   *   Valeurs : "mr_rate_per_site" | "approved_mr_rate" | "merged_mr_rate" |
   *             "commit_rate_per_site" | "nb_commits_per_project" | "avg_review_time_hours"
   * @param {number}  [months=12]   - Nombre de mois d'historique (1-24)
   * @param {number}  [siteId]      - Un seul site (null = tous)
   */
  getTrend: async (
    projectId,
    {
      kpiField = "mr_rate_per_site",
      months   = 12,
      siteId   = null,
    } = {}
  ) => {
    const params = buildParams({
      project_id: projectId,
      kpi_field:  kpiField,
      months,
      site_id:    siteId,
    });
    const { data } = await api.get("/kpis/trend", { params });
    return data;
  },

  /**
   * GET /kpis/compare
   * Comparaison inter-sites sur la même période.
   *
   * @param {number}  projectId
   * @param {number}  [periodId]  - Défaut = dernière période disponible
   * @param {string}  [kpiField]  - KPI pour le tri des résultats
   */
  compareSites: async (projectId, periodId = null, kpiField = null) => {
    const params = buildParams({
      project_id: projectId,
      period_id:  periodId,
      kpi_field:  kpiField,
    });
    const { data } = await api.get("/kpis/compare", { params });
    return data;
  },

  /**
   * GET /kpis/top-developers
   * Classement des développeurs par KPI.
   *
   * @param {number}  projectId
   * @param {Object}  options
   * @param {number}  [options.periodId]   - Défaut = dernière période
   * @param {number}  [options.siteId]     - Filtrer par site
   * @param {string}  [options.kpiField]   - KPI pour le classement
   * @param {number}  [options.limit]      - Nombre de résultats (défaut 10)
   * @param {boolean} [options.ascending]  - false = top, true = bottom performers
   */
  getTopDevelopers: async (
    projectId,
    {
      periodId  = null,
      siteId    = null,
      kpiField  = "mr_rate_per_site",
      limit     = 10,
      ascending = false,
    } = {}
  ) => {
    const params = buildParams({
      project_id: projectId,
      period_id:  periodId,
      site_id:    siteId,
      kpi_field:  kpiField,
      limit,
      ascending,
    });
    const { data } = await api.get("/kpis/top-developers", { params });
    return data;
  },

  /**
   * GET /kpis/sites
   * Sites disponibles pour un projet (dropdown de filtre).
   */
  getAvailableSites: async (projectId) => {
    const { data } = await api.get("/kpis/sites", {
      params: { project_id: projectId },
    });
    return data;
  },

  /**
   * GET /kpis/developers
   * Développeurs disponibles pour un projet (dropdown de filtre).
   */
  getAvailableDevelopers: async (projectId, siteId = null) => {
    const params = buildParams({ project_id: projectId, site_id: siteId });
    const { data } = await api.get("/kpis/developers", { params });
    return data;
  },

  /**
   * POST /analytics/{projectId}/generate-snapshot  (admin uniquement)
   */
  generateSnapshot: async (projectId, { year, month, siteId } = {}) => {
    const params = buildParams({ year, month, site_id: siteId });
    const { data } = await api.post(
      `/analytics/${projectId}/generate-snapshot`,
      null,
      { params }
    );
    return data;
  },
};

export default analyticsService;
