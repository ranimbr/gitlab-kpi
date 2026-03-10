import api from "./api";

const projectService = {

  // Utilisé par toutes les pages normales — projets actifs seulement
  getAll: async () => {
    const response = await api.get("/projects/");
    return response.data;
  },

  // Utilisé par AdminProjectsPage — tous les projets (actifs + inactifs)
  getAllAdmin: async () => {
    const response = await api.get("/projects/", {
      params: { all_projects: true },
    });
    return response.data;
  },

  getById: async (projectId) => {
    const response = await api.get(`/projects/${projectId}`);
    return response.data;
  },

  create: async (payload) => {
    const response = await api.post("/projects/", payload);
    return response.data;
  },

  update: async (projectId, payload) => {
    const response = await api.put(`/projects/${projectId}`, payload);
    return response.data;
  },

  toggleActive: async (projectId) => {
    const response = await api.patch(`/projects/${projectId}/toggle-active`);
    return response.data;
  },

  delete: async (projectId) => {
    await api.delete(`/projects/${projectId}`);
  },

  getCommits: async (projectId, limit = 50, offset = 0) => {
    const response = await api.get(`/projects/${projectId}/commits`, {
      params: { limit, offset },
    });
    return response.data;
  },

  getMergeRequests: async (projectId, excludeDraft = true, limit = 50, offset = 0) => {
    const response = await api.get(`/projects/${projectId}/merge-requests`, {
      params: { exclude_draft: excludeDraft, limit, offset },
    });
    return response.data;
  },
};

export default projectService;