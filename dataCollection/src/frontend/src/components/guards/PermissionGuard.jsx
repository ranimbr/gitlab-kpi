/**
 * components/guards/PermissionGuard.jsx
 * 
 * Guard de permission basé sur les menus accessibles.
 * Vérifie si l'utilisateur a accès à un menu spécifique avant d'autoriser l'accès à la route.
 */
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import profileService from "../../services/profileService";
import { useState, useEffect } from "react";

export default function PermissionGuard({ menuRoute, children, fallback = null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [hasAccess, setHasAccess] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setHasAccess(false);
      setLoading(false);
      return;
    }

    // Super admin a accès à tout
    if (user.role === "super_admin") {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    // Vérifier l'accès au menu via le profil de l'utilisateur
    checkMenuAccess();
  }, [user, menuRoute]);

  const checkMenuAccess = async () => {
    if (!menuRoute) {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    try {
      const menuItems = await profileService.getActiveMenuItems();
      const accessible = menuItems.some(menu => menu.route === menuRoute);
      setHasAccess(accessible);
    } catch (err) {
      console.error("Erreur vérification accès menu:", err);
      // En cas d'erreur, on autorise l'accès (fail-safe)
      setHasAccess(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null; // Ou un spinner si nécessaire
  }

  if (!hasAccess) {
    if (fallback) {
      return fallback;
    }
    // Rediriger vers le dashboard si pas d'accès
    navigate("/dashboard");
    return null;
  }

  return <>{children}</>;
}
