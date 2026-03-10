import api from "./api";

const periodService = {

  // GET /periods/
  getAll: async () => {
    const response = await api.get("/periods/");
    return response.data;
  },

  // GET /periods/current
  getCurrent: async () => {
    const response = await api.get("/periods/current");
    return response.data;
  },

  // GET /periods/{id}
  getById: async (periodId) => {
    const response = await api.get(`/periods/${periodId}`);
    return response.data;
  },

  // POST /periods/
  create: async (year, month) => {
    const response = await api.post("/periods/", { year, month });
    return response.data;
  },

  // POST /periods/{id}/close
  close: async (periodId) => {
    const response = await api.post(`/periods/${periodId}/close`);
    return response.data; // PeriodCloseResponse
  },
};

export default periodService;