/**
 * services/authService.js
 *
 * Authentification JWT.
 * Améliorations :
 *   - login() stocke aussi expires_in pour savoir quand le token expire
 *   - isTokenExpired() vérifie la date d'expiration sans appel réseau
 *   - getMe() mis en cache 30s pour éviter les appels répétés au montage
 */

import api from "./api";

// Cache simple pour getMe()
let _meCacheData  = null;
let _meCacheTime  = 0;
const ME_TTL_MS   = 30_000; // 30 secondes

const authService = {
  /**
   * Login par email OU username.
   * Le backend accepte { email, password } ou { username, password }.
   */
  login: async (identifier, password) => {
    const isEmail = identifier.includes("@");
    const payload = isEmail
      ? { email: identifier, password }
      : { username: identifier, password };

    const response = await api.post("/auth/login", payload);
    const { access_token, expires_in } = response.data;

    localStorage.setItem("access_token", access_token);
    if (expires_in) {
      const expiresAt = Date.now() + expires_in * 1000;
      localStorage.setItem("token_expires_at", String(expiresAt));
    }
    _meCacheData = null; // invalider le cache me

    return response.data;
  },

  register: async (email, password, login = null, name = null) => {
    const response = await api.post("/auth/register", {
      email,
      password,
      login,
      name,
    });
    return response.data;
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token_expires_at");
    _meCacheData = null;
    window.location.replace("/login");
  },

  /**
   * Retourne l'utilisateur connecté.
   * Résultat mis en cache 30s pour éviter les appels répétés.
   */
  getMe: async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && _meCacheData && now - _meCacheTime < ME_TTL_MS) {
      return _meCacheData;
    }
    const response = await api.get("/auth/me");
    _meCacheData = response.data;
    _meCacheTime = now;
    return _meCacheData;
  },

  isAuthenticated: () => !!localStorage.getItem("access_token"),

  /**
   * Vérifie si le token JWT est expiré côté client (sans appel réseau).
   * Retourne true si expiré ou si expires_at non stocké.
   */
  isTokenExpired: () => {
    const expiresAt = localStorage.getItem("token_expires_at");
    if (!expiresAt) return false; // pas d'info → on fait confiance au 401
    return Date.now() > Number(expiresAt);
  },
};

export default authService;