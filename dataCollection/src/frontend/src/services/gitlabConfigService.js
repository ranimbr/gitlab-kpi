import api from "./api";

const gitlabConfigService = {

  // GET /gitlab-configs/
  getAll: async () => {
    const response = await api.get("/gitlab-configs/");
    return response.data;
  },

  // GET /gitlab-configs/{id}
  getById: async (configId) => {
    const response = await api.get(`/gitlab-configs/${configId}`);
    return response.data;
  },

  // POST /gitlab-configs/
  create: async (data) => {
    // data: { name, domain, token, description? }
    const response = await api.post("/gitlab-configs/", data);
    return response.data;
  },

  // PUT /gitlab-configs/{id}
  update: async (configId, data) => {
    // data: { name?, token?, is_active?, description? }
    const response = await api.put(`/gitlab-configs/${configId}`, data);
    return response.data;
  },

  // DELETE /gitlab-configs/{id}
  delete: async (configId) => {
    await api.delete(`/gitlab-configs/${configId}`);
  },
};

export default gitlabConfigService;