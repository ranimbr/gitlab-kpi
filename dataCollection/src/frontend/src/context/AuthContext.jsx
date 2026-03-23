import { createContext, useContext, useState, useCallback } from "react";
import authService from "../services/authService";

const AuthContext = createContext(null);

// Décode le JWT stocké en localStorage
// Extrait : id (sub), email, role, name, dashboard_access
const decodeToken = () => {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    // Vérification expiration côté client
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("access_token");
      return null;
    }

    return {
      id:               payload.sub              ?? null,
      email:            payload.email            ?? "",
      role:             payload.role             ?? "user",
      name:             payload.name             ?? null,
      // [FIX] dashboard_access inclus dans le token si fourni par le backend
      dashboard_access: payload.dashboard_access ?? [],
    };
  } catch {
    localStorage.removeItem("access_token");
    return null;
  }
};

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => authService.isAuthenticated()
  );
  const [user, setUser]       = useState(() => decodeToken());
  const [loading, setLoading] = useState(false);

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
