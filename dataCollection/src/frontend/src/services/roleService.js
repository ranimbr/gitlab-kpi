/**
 * services/roleService.js
 * 
 * Service pour la gestion des rôles et permissions dynamiques.
 */

import api from "./api";

export const roleService = {
  // ── Roles ───────────────────────────────────────────────────────────────
  getAllRoles: async (includeInactive = false) => {
    const response = await api.get("/roles/", {
      params: { include_inactive: includeInactive }
    });
    return response.data;
  },

  getRoleById: async (roleId) => {
    const response = await api.get(`/roles/${roleId}`);
    return response.data;
  },

  createRole: async (roleData) => {
    const response = await api.post("/roles/", roleData);
    return response.data;
  },

  updateRole: async (roleId, roleData) => {
    const response = await api.put(`/roles/${roleId}`, roleData);
    return response.data;
  },

  deleteRole: async (roleId) => {
    await api.delete(`/roles/${roleId}`);
  },

  // ── Permissions ───────────────────────────────────────────────────────────
  getAllPermissions: async (category = null) => {
    const params = {};
    if (category) {
      params.category = category;
    }
    const response = await api.get("/roles/permissions/all", { params });
    return response.data;
  },

  getPermissionCategories: async () => {
    const response = await api.get("/roles/permissions/categories");
    return response.data;
  },
};

export default roleService;
