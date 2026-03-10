import api from "./api";

const extractionLotService = {

  // GET /extraction-lots/?project_id=X&period_id=Y
  getAll: async (projectId = null, periodId = null) => {
    const params = {};
    if (projectId) params.project_id = projectId;
    if (periodId)  params.period_id  = periodId;
    const response = await api.get("/extraction-lots/", { params });
    return response.data;
  },

  // GET /extraction-lots/{id}
  getById: async (lotId) => {
    const response = await api.get(`/extraction-lots/${lotId}`);
    return response.data;
  },

};

export default extractionLotService;