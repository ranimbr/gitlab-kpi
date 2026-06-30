// context/AuthContext.jsx
import { createContext, useContext, useState, useCallback } from "react";
import authService from "../services/authService";

const AuthContext = createContext(null);

// ── Rôles valides (miroir du backend UserRoleEnum) ────────────────────────────
export const ROLES = {
  SUPER_ADMIN:     "super_admin",
  PROJECT_MANAGER: "project_manager",
  SITE_MANAGER:    "site_manager",
  TEAM_LEAD:       "team_lead",
  VIEWER:          "viewer",
  DEVELOPER:       "developer",
};

/**
 * Hiérarchie des rôles — un rôle "supérieur" a accès à tout ce qu'un rôle
 * inférieur peut faire.
 * super_admin > project_manager > site_manager > team_lead > viewer > developer
 */
const ROLE_HIERARCHY = {
  [ROLES.SUPER_ADMIN]:     6,
  [ROLES.PROJECT_MANAGER]: 5,
  [ROLES.SITE_MANAGER]:    4,
  [ROLES.TEAM_LEAD]:       3,
  [ROLES.VIEWER]:          2,
  [ROLES.DEVELOPER]:       1,
};

// ── Décodage JWT local ────────────────────────────────────────────────────────
const decodeToken = () => {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    // Expiration côté client
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("token_expires_at");
      return null;
    }

    return {
      id:               payload.sub              ?? null,
      email:            payload.email            ?? "",
      role:             payload.role             ?? ROLES.DEVELOPER,
      name:             payload.name             ?? null,
      site_id:          payload.site_id          ?? null,
      group_id:         payload.group_id         ?? null,
      project_ids:      payload.project_ids      ?? [],
      dashboard_access: payload.dashboard_access ?? [],
    };
  } catch {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token_expires_at");
    return null;
  }
};

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => authService.isAuthenticated()
  );
  const [user, setUser]       = useState(() => decodeToken());
  const [loading, setLoading] = useState(false);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (identifier, password) => {
    setLoading(true);
    try {
      await authService.login(identifier, password);

      const decoded = decodeToken();
      setIsAuthenticated(true);
      setUser(decoded);

      // Enrichi depuis /auth/me (site_id, group_id peuvent être absents du JWT)
      try {
        const me = await authService.getMe(true);
        setUser(prev => ({
          ...prev,
          name:             me.name             ?? prev?.name,
          site_id:          me.site_id          ?? prev?.site_id,
          group_id:         me.group_id         ?? prev?.group_id,
          project_ids:      me.project_ids      ?? prev?.project_ids ?? [],
          dashboard_access: me.dashboard_access ?? prev?.dashboard_access ?? [],
          login:            me.login            ?? null,
        }));
        
        //  Récupérer les assignations multi-tenant pour le filtrage automatique
        if (me.role === 'site_manager' || me.role === 'team_lead' || me.role === 'project_manager' || me.role === 'viewer') {
          try {
            const assignments = await authService.getUserAssignments();
            setUser(prev => ({
              ...prev,
              site_ids: assignments.site_ids || [],
              group_ids: assignments.group_ids || [],
              project_ids: assignments.project_ids || []
            }));
          } catch (e) {
            console.error("Erreur lors de la récupération des assignments:", e);
          }
        }
      } catch {
        // /auth/me optionnel — on garde les données du JWT
      }

      return { success: true };
    } catch (err) {
      const message =
        err.message ||
        err.response?.data?.detail ||
        "Email ou mot de passe incorrect.";
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  // ── Refresh user ───────────────────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const me = await authService.getMe(true);
      setUser(prev => ({ ...prev, ...me }));
      
      // ✅ Récupérer les assignations multi-tenant pour le filtrage automatique
      if (me.role === 'site_manager' || me.role === 'team_lead' || me.role === 'project_manager' || me.role === 'viewer') {
        try {
          const assignments = await authService.getUserAssignments();
          setUser(prev => ({
            ...prev,
            site_ids: assignments.site_ids || [],
            group_ids: assignments.group_ids || [],
            project_ids: assignments.project_ids || []
          }));
        } catch (e) {
          console.error("Erreur lors de la récupération des assignations:", e);
        }
      }
    } catch {
      // token expiré → api.js interceptor redirige vers /login
    }
  }, []);

  // ── Helpers de rôle ───────────────────────────────────────────────────────

  /**
   * Vérifie si l'utilisateur a EXACTEMENT le rôle donné.
   * Utiliser hasRoleOrAbove() pour la hiérarchie.
   */
  const hasRole = useCallback((role) => {
    return user?.role === role;
  }, [user]);

  /**
   * Vérifie si l'utilisateur a le rôle donné OU un rôle supérieur.
   * Ex : hasRoleOrAbove("team_lead") → true pour team_lead, site_manager, super_admin
   */
  const hasRoleOrAbove = useCallback((role) => {
    if (!user?.role) return false;
    const userLevel     = ROLE_HIERARCHY[user.role]  ?? 0;
    const requiredLevel = ROLE_HIERARCHY[role]        ?? 99;
    return userLevel >= requiredLevel;
  }, [user]);

  /** super_admin → accès total */
  const isAdmin = useCallback(() => {
    return user?.role === ROLES.SUPER_ADMIN;
  }, [user]);

  /** site_manager OU super_admin */
  const isSiteManager = useCallback(() => {
    return hasRoleOrAbove(ROLES.SITE_MANAGER);
  }, [hasRoleOrAbove]);

  /** team_lead OU site_manager OU super_admin */
  const isTeamLead = useCallback(() => {
    return hasRoleOrAbove(ROLES.TEAM_LEAD);
  }, [hasRoleOrAbove]);

  /** project_manager OU super_admin */
  const isProjectManager = useCallback(() => {
    return hasRoleOrAbove(ROLES.PROJECT_MANAGER);
  }, [hasRoleOrAbove]);

  /** viewer OU super_admin */
  const isViewer = useCallback(() => {
    return hasRoleOrAbove(ROLES.VIEWER);
  }, [hasRoleOrAbove]);

  /**
   * Vérifie si l'utilisateur peut gérer un site donné.
   * super_admin → tous les sites.
   * site_manager → uniquement son site.
   * viewer → uniquement ses sites assignés.
   */
  const canManageSite = useCallback((siteId) => {
    if (!user) return false;
    if (user.role === ROLES.SUPER_ADMIN) return true;
    if (user.role === ROLES.SITE_MANAGER) return user.site_id === siteId;
    if (user.role === ROLES.VIEWER) {
      const accessibleSiteIds = user.site_ids || [];
      return accessibleSiteIds.includes(siteId);
    }
    return false;
  }, [user]);

  /**
   * Vérifie si l'utilisateur peut gérer un groupe.
   * super_admin et site_manager → tous les groupes de leur périmètre.
   * team_lead → uniquement son groupe.
   * viewer → uniquement ses groupes assignés.
   */
  const canManageGroup = useCallback((groupId) => {
    if (!user) return false;
    if ([ROLES.SUPER_ADMIN, ROLES.SITE_MANAGER].includes(user.role)) return true;
    if (user.role === ROLES.TEAM_LEAD) return user.group_id === groupId;
    if (user.role === ROLES.VIEWER) {
      const accessibleGroupIds = user.group_ids || [];
      return accessibleGroupIds.includes(groupId);
    }
    return false;
  }, [user]);

  /**
   * Vérifie si l'utilisateur peut gérer un projet.
   * super_admin → tous les projets.
   * project_manager → uniquement ses projets assignés.
   * viewer → uniquement ses projets assignés.
   */
  const canManageProject = useCallback((projectId) => {
    if (!user) return false;
    if (user.role === ROLES.SUPER_ADMIN) return true;
    if (user.role === ROLES.PROJECT_MANAGER || user.role === ROLES.VIEWER) {
      return (user.project_ids ?? []).includes(projectId);
    }
    return false;
  }, [user]);

  /** Vérifie l'accès à un dashboard (public ou dans dashboard_access[]) */
  const canAccessDashboard = useCallback((dashboardId, isPublic = false) => {
    if (!user) return false;
    if (user.role === ROLES.SUPER_ADMIN) return true;
    if (isPublic) return true;
    return (user.dashboard_access ?? []).includes(dashboardId);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        loading,
        // Actions
        login,
        logout,
        refreshUser,
        // Helpers de rôle
        hasRole,
        hasRoleOrAbove,
        isAdmin,
        isSiteManager,
        isTeamLead,
        isProjectManager,
        isViewer,
        canManageSite,
        canManageGroup,
        canManageProject,
        canAccessDashboard,
        // Constantes utiles dans les composants
        ROLES,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
