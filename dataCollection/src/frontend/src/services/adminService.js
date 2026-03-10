import api from "./api";

// ─── User Management (Admin) ──────────────────────────────────────────────────

const adminService = {

  // GET /admin/users
  getUsers: async () => {
    const response = await api.get("/admin/users");
    return response.data;
  },

  // POST /admin/users
  createUser: async (data) => {
    // data: { email, password, role, login?, name?, dashboard_view_group? }
    const response = await api.post("/admin/users", data);
    return response.data;
  },

  // PUT /admin/users/{id}
  updateUser: async (userId, data) => {
    // data: { role?, is_active?, new_password?, dashboard_view_group? }
    const response = await api.put(`/admin/users/${userId}`, data);
    return response.data;
  },

  // DELETE /admin/users/{id}
  deleteUser: async (userId) => {
    await api.delete(`/admin/users/${userId}`);
  },

  // PUT /users/me/password
  changeMyPassword: async (currentPassword, newPassword, confirmPassword) => {
    const response = await api.put("/users/me/password", {
      current_password: currentPassword,
      new_password:     newPassword,
      confirm_password: confirmPassword,
    });
    return response.data;
  },
};

export default adminService;