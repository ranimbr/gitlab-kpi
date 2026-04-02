// services/siteService.js — CORRIGÉ COMPLET
import api from "./api";

const siteService = {

  // ── CRUD Sites ──────────────────────────────────────────────────────────────

  getAll: async (activeOnly = true) =>
    (await api.get("/sites", {
      params: activeOnly ? {} : { active_only: false },
    })).data,

  getById: async (siteId) =>
    (await api.get(`/sites/${siteId}`)).data,

  create: async (data) =>
    (await api.post("/sites/", data)).data,

  update: async (siteId, data) =>
    (await api.put(`/sites/${siteId}`, data)).data,

  delete: async (siteId) => {
    await api.delete(`/sites/${siteId}`);
  },

  // ── KPI : sites avec snapshots disponibles ──────────────────────────────────
  // GET /kpis/sites?project_id=X
  getKpiSites: async (projectId) =>
    (await api.get("/kpis/sites", {
      params: { project_id: projectId },
    })).data,

  // ── KPI : développeurs validés d'un projet/site ─────────────────────────────
  // GET /kpis/developers?project_id=X&site_id=Y
  getKpiDevelopers: async (projectId, siteId = null) => {
    const params = { project_id: projectId };
    if (siteId != null) params.site_id = siteId;
    return (await api.get("/kpis/developers", { params })).data;
  },
};

export default siteService;