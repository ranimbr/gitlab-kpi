/**
 * services/developerService.js — inchangé fonctionnellement.
 */
import api from "./api";

const developerService = {

  // GET /developers?tab=...&project_id=...&site_id=...
  getByTab: async (tab = "validated", projectId = null, siteId = null) => {
    const params = { tab };
    if (projectId != null) params.project_id = projectId;
    if (siteId    != null) params.site_id    = siteId;
    return (await api.get("/developers", { params })).data;
  },

  getSummary: async (projectId = null) => {
    const params = {};
    if (projectId != null) params.project_id = projectId;
    return (await api.get("/developers/summary", { params })).data;
  },

  getAll: async (projectId = null, siteId = null, activeOnly = true) => {
    const params = { tab: activeOnly ? "validated" : "all" };
    if (projectId != null) params.project_id = projectId;
    if (siteId    != null) params.site_id    = siteId;
    return (await api.get("/developers", { params })).data;
  },

  getById: async (id)         => (await api.get(`/developers/${id}`)).data,
  create:  async (data)       => (await api.post("/developers", data)).data,
  update:  async (id, data)   => (await api.put(`/developers/${id}`, data)).data,
  validate:async (id, data)   => (await api.patch(`/developers/${id}/validate`, data)).data,
  delete:  async (id)         => { await api.delete(`/developers/${id}`); },

  // Groups
  getGroups:   async (projectId = null) => {
    const params = {};
    if (projectId != null) params.project_id = projectId;
    return (await api.get("/developer-groups", { params })).data;
  },
  createGroup: async (data)       => (await api.post("/developer-groups", data)).data,
  updateGroup: async (id, data)   => (await api.put(`/developer-groups/${id}`, data)).data,
  deleteGroup: async (id)         => { await api.delete(`/developer-groups/${id}`); },
};

export default developerService;