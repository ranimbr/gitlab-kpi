/**
 * services/projectService.js
 *
 * Corrections :
 *   - getAll() et getAllAdmin() ne passent plus site_id (non supporté backend)
 *   - getBySite() filtre côté client avec note claire
 *   - getArchived() utilise le nouveau param archived=true (supporté backend)
 */

import api from "./api";

const projectService = {
  /** GET /projects/ — projets actifs non archivés */
  getAll: async () => (await api.get("/projects/")).data,

  /** GET /projects/?all_projects=true — admin : tous projets y compris inactifs */
  getAllAdmin: async () =>
    (await api.get("/projects/", { params: { all_projects: true } })).data,

  /** GET /projects/?archived=true — projets archivés (filtre SQL côté backend) */
  getArchived: async () =>
    (await api.get("/projects/", { params: { archived: true } })).data,

  /** GET /projects/{id} */
  getById: async (projectId) =>
    (await api.get(`/projects/${projectId}`)).data,

  /**
   * Filtrage par site côté client.
   * Le backend ne supporte pas encore site_id en query param sur /projects/.
   * Cette méthode charge tous les projets actifs puis filtre en mémoire.
   */
  getBySite: async (siteId) => {
    const projects = await projectService.getAll();
    return projects.filter((p) => p.site_id === siteId);
  },

  /** POST /projects/ */
  create: async (payload) =>
    (await api.post("/projects/", payload)).data,

  /** PUT /projects/{id} */
  update: async (projectId, payload) =>
    (await api.put(`/projects/${projectId}`, payload)).data,

  /** PATCH /projects/{id}/toggle-active */
  toggleActive: async (projectId) =>
    (await api.patch(`/projects/${projectId}/toggle-active`)).data,

  /** DELETE /projects/{id} */
  delete: async (projectId) => {
    await api.delete(`/projects/${projectId}`);
  },

  /** GET /projects/{id}/commits */
  getCommits: async (projectId, limit = 50, offset = 0) =>
    (await api.get(`/projects/${projectId}/commits`, {
      params: { limit, offset },
    })).data,

  /** GET /projects/{id}/merge-requests */
  getMergeRequests: async (
    projectId,
    excludeDraft = true,
    limit = 50,
    offset = 0
  ) =>
    (await api.get(`/projects/${projectId}/merge-requests`, {
      params: { exclude_draft: excludeDraft, limit, offset },
    })).data,
};

export default projectService;