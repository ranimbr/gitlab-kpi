/**
 * services/adminService.js — inchangé fonctionnellement.
 * [FIX] dashboard_view_group → dashboard_access: number[]
 * [NEW] grantDashboardAccess / revokeDashboardAccess
 */
import api from "./api";

const adminService = {

  // GET /admin/users
  getUsers: async () => (await api.get("/admin/users")).data,

  // POST /admin/users
  // data: { email, password, role, login?, name?, dashboard_access?: number[] }
  createUser: async (data) => (await api.post("/admin/users", data)).data,

  // PUT /admin/users/{id}
  // data: { role?, is_active?, new_password?, dashboard_access?: number[] }
  updateUser: async (userId, data) => (await api.put(`/admin/users/${userId}`, data)).data,

  // DELETE /admin/users/{id}
  deleteUser: async (userId) => { await api.delete(`/admin/users/${userId}`); },

  // PUT /users/me/password
  changeMyPassword: async (currentPassword, newPassword, confirmPassword) =>
    (await api.put("/users/me/password", {
      current_password: currentPassword,
      new_password:     newPassword,
      confirm_password: confirmPassword,
    })).data,

  // POST /admin/users/{userId}/dashboard-access/{dashboardId}
  grantDashboardAccess: async (userId, dashboardId) =>
    (await api.post(`/admin/users/${userId}/dashboard-access/${dashboardId}`)).data,

  // DELETE /admin/users/{userId}/dashboard-access/{dashboardId}
  revokeDashboardAccess: async (userId, dashboardId) =>
    (await api.delete(`/admin/users/${userId}/dashboard-access/${dashboardId}`)).data,
};

export default adminService;