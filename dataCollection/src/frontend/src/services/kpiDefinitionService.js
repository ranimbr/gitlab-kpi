/**services/kpiDefinitionService.js — inchangé.*/
import api from "./api";
const kpiDefinitionService = {
  getAll:   async ()       => (await api.get("/kpi-definitions/")).data,
  getById:  async (id)     => (await api.get(`/kpi-definitions/${id}`)).data,
  create:   async (data)   => (await api.post("/kpi-definitions/", data)).data,
  update:   async (id, data) => (await api.put(`/kpi-definitions/${id}`, data)).data,
};
export default kpiDefinitionService;