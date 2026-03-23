/**services/periodService.js — inchangé.*/
import api from "./api";
const periodService = {
  getAll:     async ()              => (await api.get("/periods/")).data,
  getCurrent: async ()              => (await api.get("/periods/current")).data,
  getById:    async (id)            => (await api.get(`/periods/${id}`)).data,
  create:     async (year, month)   => (await api.post("/periods/", { year, month })).data,
  close:      async (id)            => (await api.post(`/periods/${id}/close`)).data,
};
export default periodService;