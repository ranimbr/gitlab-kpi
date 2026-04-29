/**services/gitlabConfigService.js — FIX: suppression slashes finaux (évite 307 redirect)*/
import api from "./api";
const gitlabConfigService = {
  getAll:  async ()           => (await api.get("/gitlab-configs")).data,
  getById: async (id)         => (await api.get(`/gitlab-configs/${id}`)).data,
  create:  async (data)       => (await api.post("/gitlab-configs", data)).data,
  update:  async (id, data)   => (await api.put(`/gitlab-configs/${id}`, data)).data,
  delete:  async (id)         => { await api.delete(`/gitlab-configs/${id}`); },
  test:    async (id)         => (await api.post(`/gitlab-configs/${id}/test`)).data,
};
export default gitlabConfigService;