/**services/extractionLotService.js — inchangé."""*/
import api from "./api";
const extractionLotService = {
  getAll: async (projectId = null, periodId = null) => {
    const params = {};
    if (projectId != null) params.project_id = projectId;
    if (periodId  != null) params.period_id  = periodId;
    return (await api.get("/extraction-lots", { params })).data;
  },
  getById: async (lotId) => (await api.get(`/extraction-lots/${lotId}`)).data,
  delete:  async (lotId) => (await api.delete(`/extraction-lots/${lotId}`)).data,
  deleteBulk: async (lotIds) => (await api.post("/extraction-lots/bulk-delete", { lot_ids: lotIds })).data,
  getGlobalDump: async (periodId) => (await api.get(`/extraction-lots/period/${periodId}/global-dump`)).data,
};
export default extractionLotService;