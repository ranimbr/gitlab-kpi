/**
 * services/siteService.js
 *
 * Gestion des sites + nouveaux endpoints KPI /kpis/sites et /kpis/developers
 * ajoutés au backend dans kpis.py.
 */

import api from "./api";

const siteService = {
  // ── CRUD Sites ──────────────────────────────────────────────────────────────

  getAll: async (activeOnly = true) => {
    const params = activeOnly ? {} : { active_only: false };
    return (await api.get("/sites/", { params })).data;
  },

  getById: async (siteId) =>
    (await api.get(`/sites/${siteId}`)).data,

  create: async (data) =>
    (await api.post("/sites/", data)).data,

  update: async (siteId, data) =>
    (await api.put(`/sites/${siteId}`, data)).data,

  delete: async (siteId) => {
    await api.delete(`/sites/${siteId}`);
  },

  // ── KPI : sites disponibles pour un projet ──────────────────────────────────
  // GET /kpis/sites?project_id=X
  // Retourne uniquement les sites qui ont au moins 1 snapshot KPI.
  // Utilisé pour peupler le dropdown "Filtrer par site" du dashboard.
  getKpiSites: async (projectId) =>
    (await api.get("/kpis/sites", { params: { project_id: projectId } })).data,

  // ── KPI : développeurs disponibles pour un projet ───────────────────────────
  // GET /kpis/developers?project_id=X&site_id=Y
  // Retourne les développeurs validés. Utilisé pour "Filtrer par développeur".
  getKpiDevelopers: async (projectId, siteId = null) => {
    const params = { project_id: projectId };
    if (siteId != null) params.site_id = siteId;
    return (await api.get("/kpis/developers", { params })).data;
  },
};

export default siteService;