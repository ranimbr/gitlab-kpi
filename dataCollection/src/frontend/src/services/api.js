/**
 * services/api.js
 *
 * Instance Axios centrale. Règles :
 *   - Timeout 15s sur toutes les requêtes
 *   - Injection automatique du token JWT
 *   - Extraction du message d'erreur FastAPI/Pydantic
 *   - Déduplication : deux appels identiques simultanés → une seule requête
 *   - Redirection /login sur 401 (hors auth endpoints)
 */

import axios from "axios";

const BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// ── Déduplication des requêtes GET simultanées identiques ─────────────────────
// Ex : deux composants qui se montent en même temps et appellent /projects/
// → une seule requête réseau, les deux reçoivent le même résultat.
const _pending = new Map();

api.interceptors.request.use((config) => {
  // Injection du token
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Déduplication uniquement sur GET
  if (config.method?.toLowerCase() === "get") {
    const key = `${config.url}|${JSON.stringify(config.params ?? {})}`;
    if (_pending.has(key)) {
      config._dedupKey = key;
      config._dedupPromise = _pending.get(key);
    } else {
      const controller = new AbortController();
      config.signal = controller.signal;
      config._dedupKey = key;
      const promise = new Promise((resolve, reject) => {
        config._resolve = resolve;
        config._reject  = reject;
      });
      _pending.set(key, promise);
      config._dedupPromise = promise;
      config._controller   = controller;
    }
  }

  return config;
});

// ── Réponse : nettoyage dédup + extraction message d'erreur ───────────────────
api.interceptors.response.use(
  (response) => {
    const key = response.config._dedupKey;
    if (key && _pending.has(key)) {
      _pending.delete(key);
      response.config._resolve?.(response);
    }
    return response;
  },
  (error) => {
    const config = error.config ?? {};
    const key    = config._dedupKey;
    if (key && _pending.has(key)) {
      _pending.delete(key);
      config._reject?.(error);
    }

    const status     = error.response?.status;
    const url        = config.url ?? "";
    const isAuthRoute = url.includes("/auth/login") || url.includes("/auth/register");

    // Session expirée → redirection propre (sauf sur les routes auth)
    if (status === 401 && !isAuthRoute) {
      localStorage.removeItem("access_token");
      // Utiliser replace pour ne pas empiler dans l'historique
      window.location.replace("/login");
      return Promise.reject(error);
    }

    // Extraction du message d'erreur FastAPI { detail: string | ValidationError[] }
    const detail = error.response?.data?.detail;
    if (detail) {
      if (typeof detail === "string") {
        error.message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        error.message = detail
          .map((d) => {
            const field = d.loc?.slice(-1)?.[0] ?? "";
            return field ? `${field}: ${d.msg}` : d.msg;
          })
          .join(" · ");
      }
    } else if (error.code === "ECONNABORTED") {
      error.message = "La requête a expiré. Vérifiez votre connexion.";
    } else if (!error.response) {
      error.message = "Impossible de joindre le serveur.";
    }

    return Promise.reject(error);
  }
);

export default api;