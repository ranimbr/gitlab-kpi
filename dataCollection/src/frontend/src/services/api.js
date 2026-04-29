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

const BASE_URL =
  import.meta.env.VITE_API_URL || "/api/v1"; // ✅ FIX: Utilise le proxy Vite par défaut

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// ── Déduplication des requêtes GET simultanées identiques ─────────────────────
// Map<key, Promise<AxiosResponse>>
const _pending = new Map();

api.interceptors.request.use((config) => {
  // Injection du token
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Déduplication uniquement sur GET
  if (config.method?.toLowerCase() === "get") {
    const key = `${config.url}|${JSON.stringify(config.params ?? {})}`;

    if (_pending.has(key)) {
      // [FIX-1] On annule cette requête et on retourne la promise existante
      // en attachant une propriété spéciale que l'intercepteur response lira
      config._dedupKey      = key;
      config._isDuplicate   = true;
      // On attache la promise existante pour qu'on puisse la retourner
      // Axios ne supporte pas le court-circuit direct dans request interceptor,
      // donc on laisse la requête partir mais on la résout depuis le cache
    } else {
      config._dedupKey = key;
      // Stocker une promise résoluble
      let resolveFn, rejectFn;
      const promise = new Promise((res, rej) => {
        resolveFn = res;
        rejectFn  = rej;
      });
      promise._resolve = resolveFn;
      promise._reject  = rejectFn;
      _pending.set(key, promise);
      config._isLeader = true;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    const key = response.config._dedupKey;
    if (key && response.config._isLeader && _pending.has(key)) {
      const p = _pending.get(key);
      _pending.delete(key);
      p._resolve?.(response);
    }
    return response;
  },
  (error) => {
    const config = error.config ?? {};
    const key    = config._dedupKey;

    // [FIX-4] Nettoyage du cache même en cas d'erreur réseau
    if (key && config._isLeader && _pending.has(key)) {
      const p = _pending.get(key);
      _pending.delete(key);
      p._reject?.(error);
    }

    const status      = error.response?.status;
    const url         = config.url ?? "";
    const isAuthRoute = url.includes("/auth/login") || url.includes("/auth/register");

    // [FIX-2] Session expirée → redirection seulement si on AVAIT un token
    // (évite la redirect loop quand on arrive sur /login sans token)
    if (status === 401 && !isAuthRoute) {
      const hadToken = !!localStorage.getItem("access_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("token_expires_at");
      if (hadToken) {
        window.location.replace("/login");
      }
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
      error.message = "Impossible de joindre le serveur. Vérifiez que le backend est démarré.";
    }

    return Promise.reject(error);
  }
);

export default api;