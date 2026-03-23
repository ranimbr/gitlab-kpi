/**services/extractionLotService.js — inchangé."""*/
import api from "./api";
const extractionLotService = {
  getAll: async (projectId = null, periodId = null) => {
    const params = {};
    if (projectId != null) params.project_id = projectId;
    if (periodId  != null) params.period_id  = periodId;
    return (await api.get("/extraction-lots/", { params })).data;
  },
  getById: async (lotId) => (await api.get(`/extraction-lots/${lotId}`)).data,
};
export default extractionLotService;