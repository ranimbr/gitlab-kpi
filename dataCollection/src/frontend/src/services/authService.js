import api from "./api";

const authService = {

  login: async (email, password) => {
    const response = await api.post("/auth/login", { email, password });
    const { access_token } = response.data;
    localStorage.setItem("access_token", access_token);
    return response.data;
  },

  register: async (email, password, login = null, name = null) => {
    const response = await api.post("/auth/register", { email, password, login, name });
    return response.data;
  },

  logout: () => {
    localStorage.removeItem("access_token");
    window.location.href = "/login";
  },

  isAuthenticated: () => !!localStorage.getItem("access_token"),
};

export default authService;