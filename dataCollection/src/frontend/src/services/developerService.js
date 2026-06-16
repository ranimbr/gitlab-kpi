/**
 * services/developerService.js — v5
 *
 * SEUL AJOUT par rapport à v4 :
 *   importFile() → create_missing_groups transmis au backend
 */

import api from "./api";

const developerService = {

  // ── Liste & Summary ────────────────────────────────────────────────────────

  getByTab: (tab = "all", projectId = null, activeOnly = false, periodId = null) => {
    const params = { tab };
    if (activeOnly) params.active_only = true;
    if (projectId && projectId !== "all") params.project_id = parseInt(projectId);
    if (periodId  && periodId  !== "all") params.period_id  = parseInt(periodId);
    return api.get("/developers", { params }).then(r => r.data);
  },

  getSummary: (projectId = null, siteId = null, activeOnly = false, periodId = null) => {
    const params = {};
    if (activeOnly) params.active_only = true;
    if (projectId && projectId !== "all") params.project_id = parseInt(projectId);
    if (siteId    && siteId    !== "all") params.site_id    = parseInt(siteId);
    if (periodId  && periodId  !== "all") params.period_id  = parseInt(periodId);
    return api.get("/developers/summary", { params }).then(r => r.data);
  },

  getAll: (activeOnly = true) =>
    api.get("/developers", { params: { tab: "validated", active_only: activeOnly } }).then(r => r.data),

  getById: (id, periodId = null) => {
    const params = {};
    if (periodId && periodId !== "all") params.period_id = parseInt(periodId);
    return api.get(`/developers/${id}`, { params }).then(r => r.data);
  },

  // ── CRUD ──────────────────────────────────────────────────────────────────

  create:   (data) => api.post("/developers",      data).then(r => r.data),
  update:   (id, data) => api.put(`/developers/${id}`, data).then(r => r.data),
  validate: (id, data) => api.patch(`/developers/${id}/validate`, data).then(r => r.data),
  validateAll: () => api.post(`/developers/validate-all`).then(r => r.data),
  validateSelected: (ids) => api.post(`/developers/validate-selected`, { ids }).then(r => r.data),
  delete:   (id) => api.delete(`/developers/${id}`).then(r => r.data),
  merge:    (canonicalId, duplicateId) => api.post(`/developers/${canonicalId}/merge/${duplicateId}`).then(r => r.data),

  // ── Groupes ───────────────────────────────────────────────────────────────

  getGroups: (siteId = null, activeOnly = false, periodId = null, groupId = null) => {
    const params = {};
    if (siteId) params.site_id = siteId;
    if (groupId) params.group_id = groupId;
    if (activeOnly) params.active_only = true;
    if (periodId && periodId !== "all") params.period_id = periodId;
    return api.get("/developer-groups", { params }).then(r => r.data);
  },
  createGroup: (data) => api.post("/developer-groups",      data).then(r => r.data),
  updateGroup: (id, data) => api.put(`/developer-groups/${id}`, data).then(r => r.data),
  deleteGroup: (id) => api.delete(`/developer-groups/${id}`).then(r => r.data),

  // ── KPI & Analytics ───────────────────────────────────────────────────────
  
  getDeveloperKpis: (id, projectId) =>
    api.get(`/kpis/developer/${id}`, { params: { project_id: projectId } }).then(r => r.data),

  getHeatmap: (id, months = 12) =>
    api.get(`/analytics/developer/${id}/heatmap`, { params: { months } }).then(r => r.data),
    
  getTimeline: (id, periodId = null) => {
    const params = {};
    if (periodId && periodId !== "all") params.period_id = parseInt(periodId);
    return api.get(`/developers/${id}/timeline`, { params }).then(res => res.data).catch(err => {
      console.error("Timeline fetch error:", err);
      return [];
    });
  },

  getLeaderboard: (projectId, { siteId = null, periodId = null, lotId = null, limit = 20 } = {}) => {
    const params = { project_id: projectId };
    if (siteId)   params.site_id   = siteId;
    if (periodId) params.period_id = periodId;
    if (lotId)    params.lot_id    = lotId;
    if (limit)    params.limit     = limit;
    return api.get("/kpis/leaderboard", { params }).then(r => r.data);
  },

  getDeveloperAlerts: (id) =>
    api.get("/alerts", { params: { developer_id: id } }).then(r => r.data),

  // ── Import CSV/Excel ──────────────────────────────────────────────────────

  /**
   * POST /developers/import (multipart/form-data)
   *
   * @param {File}    file
   * @param {Object}  options
   * @param {number}  [options.defaultSiteId]
   * @param {number}  [options.defaultGroupId]
   * @param {boolean} [options.dryRun]
   * @param {boolean} [options.createMissingSites]
   * @param {boolean} [options.createMissingProjects]
   * @param {boolean} [options.createMissingGroups]    ✅ NOUVEAU v5
   */
  importFile: (file, options = {}) => {
    const form = new FormData();
    form.append("file", file);

    if (options.defaultSiteId)
      form.append("default_site_id",  String(options.defaultSiteId));
    if (options.defaultGroupId)
      form.append("default_group_id", String(options.defaultGroupId));

    if (options.defaultGitlabConfigId)
      form.append("default_gitlab_config_id", String(options.defaultGitlabConfigId));

    if (options.periodId)
      form.append("period_id", String(options.periodId));

    // Booléens → strings "true"/"false" (FormData ne sérialise pas les booléens)
    form.append("dry_run",                 options.dryRun                ? "true" : "false");
    form.append("create_missing_sites",    options.createMissingSites    ? "true" : "false");
    form.append("create_missing_projects", options.createMissingProjects ? "true" : "false");
    form.append("create_missing_groups",   options.createMissingGroups   ? "true" : "false");
    form.append("full_sync",               options.fullSync              ? "true" : "false");

    return api.post("/developers/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then(r => r.data);
  },

  /**
   * GET /developers/import-logs?limit=20&offset=0
   */
  getImportLogs: (limit = 20, offset = 0) =>
    api.get("/developers/import-logs", { params: { limit, offset } }).then(r => r.data),
};

export default developerService;