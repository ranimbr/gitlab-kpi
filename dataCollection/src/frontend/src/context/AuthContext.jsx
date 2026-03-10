import { createContext, useContext, useState, useCallback } from "react";
import authService from "../services/authService";

const AuthContext = createContext(null);

// ─────────────────────────────────────────────────────────────────────────────
// Helper : décode le JWT stocké en localStorage
// Extrait : id (sub), email, role, name
// ─────────────────────────────────────────────────────────────────────────────
const decodeToken = () => {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return null;

    const parts = token.split(".");
    // [FIX] Un JWT valide a exactement 3 parties (header.payload.signature)
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    // [FIX] Vérification de l'expiration du token côté client
    // Évite de conserver un état "authentifié" avec un token déjà expiré
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("access_token");
      return null;
    }

    return {
      id:    payload.sub   ?? null,
      email: payload.email ?? "",
      role:  payload.role  ?? "user",
      name:  payload.name  ?? null,
    };
  } catch {
    // Token corrompu → nettoyage
    localStorage.removeItem("access_token");
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => authService.isAuthenticated()
  );
  const [user, setUser]       = useState(() => decodeToken());
  const [loading, setLoading] = useState(false);

  // [NEW] useCallback — évite de recréer la fonction à chaque render
  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      await authService.login(email, password);
      const decoded = decodeToken();
      setIsAuthenticated(true);
      setUser(decoded);
      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        "Email ou mot de passe incorrect.";
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, []);

  // [NEW] useCallback — stable reference pour éviter les re-renders inutiles
  const logout = useCallback(() => {
    authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, user, login, logout, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  // [FIX] Erreur claire si le hook est utilisé hors du Provider
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
