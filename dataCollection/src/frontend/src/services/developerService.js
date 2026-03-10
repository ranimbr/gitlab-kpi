import api from "./api";

const developerService = {

  // ─── Developers ─────────────────────────────────────────────────────────────

  // GET /developers?project_id=X&site=Y
  getAll: async (projectId = null, site = null) => {
    const params = {};
    if (projectId) params.project_id = projectId;
    if (site)      params.site       = site;
    const response = await api.get("/developers", { params });
    return response.data;
  },

  // GET /developers/{id}
  getById: async (developerId) => {
    const response = await api.get(`/developers/${developerId}`);
    return response.data;
  },

  // POST /developers
  create: async (data) => {
    // data: { username, project_id, site?, group_id?, name?, email?, gitlab_user_id? }
    const response = await api.post("/developers", data);
    return response.data;
  },

  // PUT /developers/{id}
  update: async (developerId, data) => {
    // data: { site?, group_id?, name?, email? }
    const response = await api.put(`/developers/${developerId}`, data);
    return response.data;
  },

  // DELETE /developers/{id}
  delete: async (developerId) => {
    await api.delete(`/developers/${developerId}`);
  },

  // ─── Developer Groups ────────────────────────────────────────────────────────

  // GET /developer-groups?project_id=X
  getGroups: async (projectId = null) => {
    const params = projectId ? { project_id: projectId } : {};
    const response = await api.get("/developer-groups", { params });
    return response.data;
  },

  // POST /developer-groups
  createGroup: async (data) => {
    // data: { name, site, project_id }
    const response = await api.post("/developer-groups", data);
    return response.data;
  },

  // PUT /developer-groups/{id}
  updateGroup: async (groupId, data) => {
    // data: { name, site, project_id }
    const response = await api.put(`/developer-groups/${groupId}`, data);
    return response.data;
  },

  // DELETE /developer-groups/{id}
  deleteGroup: async (groupId) => {
    await api.delete(`/developer-groups/${groupId}`);
  },
};

export default developerService;