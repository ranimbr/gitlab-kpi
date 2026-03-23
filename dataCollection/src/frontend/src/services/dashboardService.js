/**
 * services/dashboardService.js — inchangé fonctionnellement.
 * [FIX] Suppression grantAccess/revokeAccess (remplacé par adminService).
 * [FIX] Ajout site_id dans create().
 */
import api from "./api";

const dashboardService = {

  getMyDashboards: async () => (await api.get("/dashboards/")).data,
  getById:         async (id) => (await api.get(`/dashboards/${id}`)).data,

  // data: { name, project_id, site_id?, is_public?, description?, period_filter? }
  create: async (data) => (await api.post("/dashboards/", data)).data,
  update: async (id, data) => (await api.put(`/dashboards/${id}`, data)).data,
  delete: async (id) => { await api.delete(`/dashboards/${id}`); },

  // Period Filters
  getPeriodFilters:  async (id)             => (await api.get(`/dashboards/${id}/period-filters`)).data,
  createPeriodFilter:async (id, data)       => (await api.post(`/dashboards/${id}/period-filters`, data)).data,
  updatePeriodFilter:async (id, fId, data)  => (await api.put(`/dashboards/${id}/period-filters/${fId}`, data)).data,
  deletePeriodFilter:async (id, fId)        => { await api.delete(`/dashboards/${id}/period-filters/${fId}`); },
};

export default dashboardService;