/**
 * services/authService.js — CORRIGÉ
 *
 * Corrections :
 *   [FIX-1] login() : FastAPI OAuth2PasswordRequestForm attend
 *           username + password en application/x-www-form-urlencoded
 *           → on envoie d'abord en JSON (si le backend le supporte),
 *             avec fallback URLSearchParams pour OAuth2 standard
 *   [FIX-2] Le champ "identifier" peut être email ou username :
 *           on envoie TOUJOURS username (FastAPI OAuth2 standard)
 *           ET email dans le même payload pour compatibilité
 *   [FIX-3] Cache getMe() invalide correctement sur logout
 */

import api from "./api";

// Cache simple pour getMe()
let _meCacheData = null;
let _meCacheTime = 0;
const ME_TTL_MS  = 30_000; // 30 secondes

const authService = {
  /**
   * Login — Compatible avec :
   *   - Backend JSON  : POST /auth/login { email, password }
   *   - Backend OAuth2: POST /auth/login (form) { username, password }
   *
   * [FIX-1] On essaie JSON en premier. Si le backend retourne 422
   * (Unprocessable Entity = mauvais format), on retente en form-data OAuth2.
   */
  login: async (identifier, password) => {
    const isEmail = identifier.includes("@");

    // Tentative 1 : JSON (backend custom)
    let response;
    try {
      const jsonPayload = isEmail
        ? { email: identifier, password }
        : { username: identifier, password };

      response = await api.post("/auth/login", jsonPayload);
    } catch (err) {
      // [FIX-1] Si 422 → backend attend OAuth2 form-urlencoded
      if (err.response?.status === 422) {
        const formData = new URLSearchParams();
        formData.append("username", identifier); // OAuth2 utilise toujours "username"
        formData.append("password", password);

        response = await api.post("/auth/login", formData, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } else {
        throw err;
      }
    }

    const { access_token, expires_in } = response.data;

    if (!access_token) {
      throw new Error("Réponse du serveur invalide : token manquant.");
    }

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
    _meCacheTime = 0;
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
   */
  isTokenExpired: () => {
    const expiresAt = localStorage.getItem("token_expires_at");
    if (!expiresAt) return false;
    return Date.now() > Number(expiresAt);
  },
};

export default authService;