/**
 * services/periodFilterService.js — inchangé.
 * Types : realTime | lastMonth | last3Months | last6Months | lastYear | custom
 */
import api from "./api";
export const PERIOD_FILTER_TYPES = [
  { value: "realTime",    label: "Temps réel" },
  { value: "lastMonth",   label: "Mois dernier" },
  { value: "last3Months", label: "3 derniers mois" },
  { value: "last6Months", label: "6 derniers mois" },
  { value: "lastYear",    label: "Année dernière" },
  { value: "custom",      label: "Personnalisé" },
];
const periodFilterService = {
  getByDashboard: async (dashboardId) => (await api.get(`/dashboards/${dashboardId}/period-filters`)).data,
  create:  async (dashboardId, data)        => (await api.post(`/dashboards/${dashboardId}/period-filters`, data)).data,
  update:  async (dashboardId, filterId, data) => (await api.put(`/dashboards/${dashboardId}/period-filters/${filterId}`, data)).data,
  delete:  async (dashboardId, filterId)    => { await api.delete(`/dashboards/${dashboardId}/period-filters/${filterId}`); },
};
export default periodFilterService;