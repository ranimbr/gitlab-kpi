/**services/periodService.js — FIX: suppression des slashes finaux (évite 307 redirect via proxy Vite)*/
import api from "./api";
const periodService = {
  getAll:      async ()             => (await api.get("/periods")).data,
  getCurrent:  async ()             => (await api.get("/periods/current")).data,
  getById:     async (id)           => (await api.get(`/periods/${id}`)).data,
  create:      async (year, month)  => (await api.post("/periods", { year, month })).data,
  validate:    async (id)           => (await api.get(`/periods/${id}/validate`)).data,
  close:       async (id)           => (await api.post(`/periods/${id}/close`)).data,
  delete:      async (id)           => (await api.delete(`/periods/${id}`)).data,
  deleteLots:  async (id)           => (await api.delete(`/periods/${id}/lots`)).data,
};
export default periodService;
