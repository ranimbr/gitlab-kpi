// services/alertService.js — CORRIGÉ COMPLET
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
  getAll: async ({
    projectId    = null,
    dashboardId  = null,
    level        = null,
    isResolved   = null,
    siteId       = null,
    developerId  = null,
    limit        = 100,
    offset       = 0,
  } = {}) => {
    const params = {};
    if (projectId   != null) params.project_id   = projectId;
    if (dashboardId != null) params.dashboard_id = dashboardId;
    if (level       != null) params.level         = level;
    if (isResolved  != null) params.is_resolved   = isResolved;
    if (siteId      != null) params.site_id       = siteId;
    // ✅ AJOUT : filtre par développeur
    if (developerId != null) params.developer_id  = developerId;
    params.limit  = limit;
    params.offset = offset;
    return (await api.get("/alerts/", { params })).data;
  },

  // ✅ NOUVEAU : alertes d'un développeur spécifique
  // GET /alerts/developer/{developerId}
  getDeveloperAlerts: async (developerId) =>
    (await api.get(`/alerts/developer/${developerId}`)).data,

  // ✅ NOUVEAU : résumé alertes pour la page profil développeur
  // GET /alerts/developer/{developerId}/summary
  getDeveloperAlertSummary: async (developerId) =>
    (await api.get(`/alerts/developer/${developerId}/summary`)).data,

  // PATCH /alerts/{id}/acknowledge
  acknowledge: async (alertId, isResolved = false) =>
    (await api.patch(`/alerts/${alertId}/acknowledge`, { is_resolved: isResolved })).data,

  // PATCH /alerts/{id}/resolve
  resolve: async (alertId) =>
    (await api.patch(`/alerts/${alertId}/resolve`)).data,
};

export default alertService;