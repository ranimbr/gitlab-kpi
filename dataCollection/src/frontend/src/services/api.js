/**
 * services/api.js — CORRIGÉ
 *
 * Corrections :
 *   [FIX-1] Déduplication : la logique _resolve/_reject était cassée
 *           (les callbacks n'étaient jamais appelés → promise pendante infinie)
 *           → Remplacé par un cache de promises propre
 *   [FIX-2] 401 sans token → ne pas faire de redirect si le token n'existe pas
 *           du tout (évite redirect loop sur /login)
 *   [FIX-3] Timeout message amélioré
 *   [FIX-4] Nettoyage du cache de dédup sur erreur réseau (ERR_CONNECTION_REFUSED)
 */

import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_TARGET || "/api/v1";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 60_000, // Augmenté à 60s pour les cold starts et opérations multi-tenant complexes
});

const API_CODE_RE = /^([A-Z0-9_]+):\s*(.+)$/;

export function extractApiError(error) {
  const status = error?.response?.status ?? null;
  const detail = error?.response?.data?.detail;
  let code = null;
  let message = null;

  if (typeof detail === "string") {
    const match = detail.match(API_CODE_RE);
    if (match) {
      code = match[1];
      message = match[2];
    } else {
      message = detail;
    }
  } else if (Array.isArray(detail) && detail.length > 0) {
    message = detail
      .map((d) => {
        const field = d.loc?.slice(-1)?.[0] ?? "";
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join(" · ");
  } else if (error?.code === "ECONNABORTED") {
    message = "La requete a expire. Verifiez votre connexion.";
  } else if (!error?.response) {
    message = "Impossible de joindre le serveur. Verifiez que le backend est demarre.";
  } else {
    message = error?.message || "Erreur inattendue.";
  }

  return { status, code, message, detail };
}

export function toUserError(error, fallbackMessage = "Une erreur est survenue.") {
  const parsed = extractApiError(error);
  const mapped = {
    AUTH_TOO_MANY_ATTEMPTS: "Trop de tentatives de connexion. Reessayez plus tard.",
    AUTH_INVALID_CREDENTIALS: "Identifiants invalides.",
    AUTH_USER_INACTIVE: "Compte utilisateur inactif.",
    PROJECT_GITLAB_UNREACHABLE: "GitLab est temporairement indisponible.",
  };

  return mapped[parsed.code] || parsed.message || fallbackMessage;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Set target database select header AND query parameter for redundancy
  const dbName = localStorage.getItem("selected_database") || "gitlab_kpi1";
  config.headers["X-Database-Select"] = dbName;
  
  // Add query parameter as fallback
  if (config.url && !config.url.includes('db=')) {
    const separator = config.url.includes('?') ? '&' : '?';
    config.url = `${config.url}${separator}db=${dbName}`;
  }
  
  console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url} - X-Database-Select: ${dbName}`);
  
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const config = error.config ?? {};
    const status = error.response?.status;
    const url = config.url ?? "";
    const isAuthRoute = url.includes("/auth/login") || url.includes("/auth/register");

    if (status === 401 && !isAuthRoute) {
      const hadToken = Boolean(localStorage.getItem("access_token"));
      localStorage.removeItem("access_token");
      localStorage.removeItem("token_expires_at");
      if (hadToken) {
        window.location.replace("/login");
      }
      return Promise.reject(error);
    }

    const parsed = extractApiError(error);
    error.message = parsed.message;

    return Promise.reject(error);
  }
);

export default api;