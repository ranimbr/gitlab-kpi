import api from "./api";

// ─── Project Service ──────────────────────────────────────────────────────────
// NOTE: utiliser projectService.js (standalone) pour les pages admin.
// Ce service est conservé pour compatibilité avec DashboardKPI et CommitsPage.

export const projectService = {

  getAll: async () => {
    const response = await api.get("/projects/");
    return response.data;
  },

  getById: async (projectId) => {
    const response = await api.get(`/projects/${projectId}`);
    return response.data;
  },

  getCommits: async (projectId) => {
    const response = await api.get(`/projects/${projectId}/commits`);
    return response.data;
  },

  getMergeRequests: async (projectId, excludeDraft = true) => {
    const response = await api.get(`/projects/${projectId}/merge-requests`, {
      params: { exclude_draft: excludeDraft },
    });
    return response.data;
  },
};

// ─── Extraction Service ───────────────────────────────────────────────────────

export const extractionService = {

  // [FIX] Le backend attend { project_id, extraction_type, period_id? }
  // On accepte maintenant le payload complet tel que construit par ExtractionPage
  run: async (payload) => {
    const response = await api.post("/extraction/run", payload);
    return response.data; // ExtractionRunResponse
  },
};

// ─── KPI Service ──────────────────────────────────────────────────────────────

export const kpiService = {

  getDashboard: async (projectId, site = null) => {
    const params = { project_id: projectId };
    if (site) params.site = site;
    const response = await api.get("/kpis/dashboard", { params });
    return response.data;
    // Retourne : { latest_metrics, history, total_snapshots }
    // latest_metrics contient les 7 KPIs :
    //   mr_rate_per_site, approved_mr_rate, merged_mr_rate,
    //   commit_rate_per_site, nb_commits_per_project,
    //   avg_review_time_hours, nb_developers
  },

  getLatest: async (projectId, site = null) => {
    const params = site ? { site } : {};
    const response = await api.get(`/analytics/${projectId}/latest`, { params });
    return response.data;
  },

  getHistory: async (projectId, site = null, startDate = null, endDate = null) => {
    const params = {};
    if (site)      params.site       = site;
    if (startDate) params.start_date = startDate;
    if (endDate)   params.end_date   = endDate;
    const response = await api.get(`/analytics/${projectId}/history`, { params });
    return response.data.snapshots;
  },

  generateSnapshot: async (projectId, year, month, site = null) => {
    const params = { year, month };
    if (site) params.site = site;
    const response = await api.post(
      `/analytics/${projectId}/generate-snapshot`,
      null,
      { params }
    );
    return response.data;
  },
};