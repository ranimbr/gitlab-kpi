import api from "./api";

const dashboardService = {

  // GET /dashboards/ → retourne les dashboards accessibles à l'utilisateur courant
  getMyDashboards: async () => {
    const response = await api.get("/dashboards/");
    return response.data;
  },

  // GET /dashboards/{id}
  getById: async (dashboardId) => {
    const response = await api.get(`/dashboards/${dashboardId}`);
    return response.data;
  },

  // POST /dashboards/
  create: async (data) => {
    // data: { name, project_id, view_group? }
    const response = await api.post("/dashboards/", data);
    return response.data;
  },

  // DELETE /dashboards/{id}
  delete: async (dashboardId) => {
    await api.delete(`/dashboards/${dashboardId}`);
  },

  // ─── Gestion des accès ────────────────────────────────────────────────────

  // POST /dashboards/{id}/access → accorder accès à un user
  grantAccess: async (dashboardId, userId) => {
    const response = await api.post(`/dashboards/${dashboardId}/access`, {
      user_id:      userId,
      dashboard_id: dashboardId,
    });
    return response.data;
  },

  // DELETE /dashboards/{id}/access/{userId} → révoquer accès
  revokeAccess: async (dashboardId, userId) => {
    await api.delete(`/dashboards/${dashboardId}/access/${userId}`);
  },
};

export default dashboardService;