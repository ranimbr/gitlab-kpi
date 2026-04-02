// services/projectService.js — CORRIGÉ COMPLET
import api from "./api";

const projectService = {

  // ── CRUD Projets ────────────────────────────────────────────────────────────

  getAll: async () => (await api.get("/projects")).data,

  getAllAdmin: async () =>
    (await api.get("/projects", { params: { all_projects: true } })).data,

  getArchived: async () =>
    (await api.get("/projects", { params: { archived: true } })).data,

  // ✅ FIX : site_id maintenant supporté backend via ProjectSite M2M
  getBySite: async (siteId) =>
    (await api.get("/projects", { params: { site_id: siteId } })).data,

  getById: async (projectId) =>
    (await api.get(`/projects/${projectId}`)).data,

  /**
   * POST /projects
   * ✅ NOUVEAU : payload inclut site_ids (liste M2M)
   * data: { gitlab_project_id, gitlab_config_id, is_active?, site_ids?: number[] }
   */
  create: async (payload) =>
    (await api.post("/projects", payload)).data,

  /**
   * PUT /projects/{id}
   * ✅ NOUVEAU : site_ids optionnel (remplace la liste entière si fourni)
   */
  update: async (projectId, payload) =>
    (await api.put(`/projects/${projectId}`, payload)).data,

  toggleActive: async (projectId) =>
    (await api.patch(`/projects/${projectId}/toggle-active`)).data,

  delete: async (projectId) => {
    await api.delete(`/projects/${projectId}`);
  },

  // ── Sites M2M ───────────────────────────────────────────────────────────────

  // GET /projects/{id}/sites — liste des sites d'un projet
  getSites: async (projectId) =>
    (await api.get(`/projects/${projectId}/sites`)).data,

  // POST /projects/{id}/sites/{siteId} — associer un site
  assignSite: async (projectId, siteId) =>
    (await api.post(`/projects/${projectId}/sites/${siteId}`)).data,

  // DELETE /projects/{id}/sites/{siteId} — dissocier un site
  removeSite: async (projectId, siteId) => {
    await api.delete(`/projects/${projectId}/sites/${siteId}`);
  },

  // ── Commits & MRs ───────────────────────────────────────────────────────────

  getCommits: async (projectId, limit = 50, offset = 0) =>
    (await api.get(`/projects/${projectId}/commits`, {
      params: { limit, offset },
    })).data,

  getMergeRequests: async (projectId, excludeDraft = true, limit = 50, offset = 0) =>
    (await api.get(`/projects/${projectId}/merge-requests`, {
      params: { exclude_draft: excludeDraft, limit, offset },
    })).data,
};

export default projectService;