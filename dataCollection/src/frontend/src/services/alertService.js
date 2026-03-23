/**
 * services/alertService.js — inchangé fonctionnellement.
 */
import api from "./api";

const alertService = {

  // GET /alerts/summary
  getSummary: async (projectId = null, dashboardId = null) => {
    const params = {};
    if (projectId   != null) params.project_id   = projectId;
    if (dashboardId != null) params.dashboard_id = dashboardId;
    return (await api.get("/alerts/summary", { params })).data;
  },

  // GET /alerts/
  getAll: async ({ projectId = null, dashboardId = null, level = null, isResolved = null } = {}) => {
    const params = {};
    if (projectId   != null) params.project_id   = projectId;
    if (dashboardId != null) params.dashboard_id = dashboardId;
    if (level       != null) params.level         = level;
    if (isResolved  != null) params.is_resolved   = isResolved;
    return (await api.get("/alerts/", { params })).data;
  },

  // PATCH /alerts/{id}/acknowledge
  acknowledge: async (alertId, isResolved = false) =>
    (await api.patch(`/alerts/${alertId}/acknowledge`, { is_resolved: isResolved })).data,

  // PATCH /alerts/{id}/resolve
  resolve: async (alertId) =>
    (await api.patch(`/alerts/${alertId}/resolve`)).data,
};

export default alertService;