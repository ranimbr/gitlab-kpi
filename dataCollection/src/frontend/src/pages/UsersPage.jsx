/**
 * UsersPage.jsx — Gestion des utilisateurs (Super Admin uniquement)
 *
 * CORRECTIONS MAJEURES (nouveaux rôles) :
 *   - ROLE_COLORS / ROLE_ICONS : 4 rôles (super_admin, site_manager, team_lead, developer)
 *   - UserModal : dropdown rôles mis à jour + champs site_id / group_id selon rôle
 *   - Filtres de liste : rôles mis à jour
 *   - isAdmin check : role === "super_admin"
 *   - Stats cards : admins → super_admins
 *   - Export CSV : role affiché correctement
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api          from "../services/api";
import adminService from "../services/adminService";
import profileService from "../services/profileService";
import siteService from "../services/siteService";
import projectService from "../services/projectService";
import developerService from "../services/developerService";
import { ROLES }   from "../context/AuthContext";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function getInitials(email = "") {
  const parts = email.split("@")[0].split(/[._-]/);
  return (parts.length >= 2 ? (parts[0][0] + parts[1][0]) : email.slice(0, 2)).toUpperCase();
}

// ✅ FIX : 5 rôles (ajout viewer)
const ROLE_COLORS = {
  [ROLES.SUPER_ADMIN]:  "danger",
  [ROLES.SITE_MANAGER]: "warning",
  [ROLES.TEAM_LEAD]:    "info",
  [ROLES.PROJECT_MANAGER]: "primary",
  [ROLES.VIEWER]:       "secondary",
};
const ROLE_ICONS = {
  [ROLES.SUPER_ADMIN]:  "ri-shield-star-line",
  [ROLES.SITE_MANAGER]: "ri-map-pin-user-line",
  [ROLES.TEAM_LEAD]:    "ri-team-line",
  [ROLES.PROJECT_MANAGER]: "ri-folder-3-line",
  [ROLES.VIEWER]:       "ri-eye-line",
};
const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]:  "Super Admin",
  [ROLES.SITE_MANAGER]: "Site Manager",
  [ROLES.TEAM_LEAD]:    "Team Lead",
  [ROLES.PROJECT_MANAGER]: "Project Manager",
  [ROLES.VIEWER]:       "Viewer",
};

function exportCSV(users) {
  const headers = ["ID", "Email", "Rôle", "Site ID", "Groupe ID", "Statut", "Créé le"];
  const rows = users.map(u => [
    u.id, u.email,
    ROLE_LABELS[u.role] || u.role,
    u.site_id  || "",
    u.group_id || "",
    u.is_active ? "Actif" : "Inactif",
    formatDate(u.created_at),
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a"); a.href = url; a.download = "users.csv"; a.click();
  URL.revokeObjectURL(url);
}

function useEscapeKey(callback, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e) => { if (e.key === "Escape") callback(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [callback, enabled]);
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`alert alert-${toast.type} d-flex align-items-center gap-2 position-fixed top-0 end-0 m-3 shadow`}
      style={{ zIndex: 9999, minWidth: 300, borderRadius: 10 }}>
      <i className={toast.type === "success" ? "ri-checkbox-circle-line fs-16" : "ri-error-warning-line fs-16"}></i>
      <span>{toast.msg}</span>
    </div>
  );
}

// ── UserDetailModal ───────────────────────────────────────────────────────────
function UserDetailModal({ user, onClose, onEdit, onDelete, sites, groups }) {
  useEscapeKey(onClose);
  if (!user) return null;
  const color = ROLE_COLORS[user.role] || "secondary";
  
  // ✅ FIX : Afficher tous les sites assignés
  const userSites = (user.site_ids || []).map(sid => sites?.find(s => s.id === sid)?.name).filter(Boolean);
  const siteDisplay = userSites.length > 0 
    ? userSites.join(", ") 
    : (sites?.find(s => s.id === user.site_id)?.name || "—");
  
  // ✅ FIX : Afficher tous les groupes assignés
  const userGroups = (user.group_ids || []).map(gid => groups?.find(g => g.id === gid)?.name).filter(Boolean);
  const groupDisplay = userGroups.length > 0
    ? userGroups.join(", ")
    : (groups?.find(g => g.id === user.group_id)?.name || "—");
  
  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)", zIndex: 1055 }}
      onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14"
                style={{ width: 48, height: 48, background: "linear-gradient(135deg,#405189,#3577f1)" }}>
                {getInitials(user.email)}
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-0 fs-15 text-truncate">{user.email}</h5>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <span className={`badge bg-${color}-subtle text-${color} fs-11`}>
                    <i className={`${ROLE_ICONS[user.role] || "ri-user-line"} me-1`}></i>
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                  <span className={`badge fs-11 ${user.is_active ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>
                    {user.is_active ? "✓ Actif" : "✗ Inactif"}
                  </span>
                </div>
              </div>
              <button className="btn-close flex-shrink-0" onClick={onClose} style={{ opacity: 0.5 }}></button>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="row g-3">
              {[
                { icon: "ri-hashtag",         label: "ID",         value: `#${user.id}` },
                { icon: "ri-mail-line",        label: "Email",      value: user.email },
                { icon: "ri-shield-user-line", label: "Rôle",       value: ROLE_LABELS[user.role] || user.role },
                { icon: "ri-calendar-line",    label: "Créé le",    value: formatDate(user.created_at) },
                { icon: "ri-map-pin-line",     label: "Sites",      value: siteDisplay },
                { icon: "ri-group-line",       label: "Groupes",    value: groupDisplay },
                { icon: "ri-toggle-line",      label: "Statut",     value: user.is_active ? "Actif" : "Inactif", valueColor: user.is_active ? "#15803d" : "#dc2626" },
              ].map((item, i) => (
                <div key={i} className="col-6">
                  <div className="rounded-3 p-3" style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}>
                    <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.8, marginBottom: 4 }}>
                      <i className={`${item.icon} me-1`}></i>{item.label}
                    </div>
                    <div className="fw-semibold fs-13 text-truncate" style={{ color: item.valueColor || "#1e2a3b" }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 py-3 d-flex justify-content-between align-items-center"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <button className="btn btn-sm btn-soft-danger px-3" onClick={() => { onClose(); onDelete(user); }}>
              <i className="ri-delete-bin-line me-1"></i>Supprimer
            </button>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-light px-3" onClick={onClose}>Fermer</button>
              <button className="btn btn-sm btn-primary px-3" onClick={() => onEdit(user)}>
                <i className="ri-pencil-line me-1"></i>Modifier
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────
function DeleteModal({ user, onConfirm, onClose, loading }) {
  useEscapeKey(() => { if (!loading) onClose(); }, !!user);
  if (!user) return null;
  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center justify-content-between">
              <h5 className="fw-semibold text-dark mb-0 fs-15">Supprimer cet utilisateur ?</h5>
              <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: 0.5 }}></button>
            </div>
          </div>
          <div className="px-4 py-4 text-center">
            <div className="avatar-md mx-auto mb-3">
              <div className="avatar-title bg-danger-subtle text-danger rounded-circle fs-3">
                <i className="ri-delete-bin-line"></i>
              </div>
            </div>
            <p className="text-muted mb-0 fs-14">
              Supprimer définitivement <strong>{user.email}</strong> ? Cette action est irréversible.
            </p>
          </div>
          <div className="px-4 py-3 d-flex justify-content-end gap-2"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-danger px-4" onClick={() => onConfirm(user.id)} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Suppression…</>
                : <><i className="ri-delete-bin-line me-1"></i>Oui, supprimer</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── UserModal ─────────────────────────────────────────────────────────────────
function UserModal({ mode, user, onClose, onSave }) {
  const isEdit = mode === "edit";
  const [profiles, setProfiles] = useState([]);
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(false);
  
  const [form, setForm] = useState({
    email:       user?.email    || "",
    password:    "",
    role:        user?.role     || ROLES.DEVELOPER,
    profile_id:  user?.profile_id || "",
    is_active:   user?.is_active ?? true,
    new_password:"",
    // ✅ AJOUT : support multi-sites et multi-équipes
    site_id:     user?.site_id  || "",
    site_ids:    user?.site_ids || [],
    group_id:    user?.group_id || "",
    group_ids:   user?.group_ids || [],
    project_ids: user?.project_ids || [],
    login:       user?.login    || "",
    name:        user?.name     || "",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // Charger les profils dynamiquement
  useEffect(() => {
    const loadProfiles = async () => {
      setLoadingProfiles(true);
      try {
        const data = await profileService.getAllProfiles();
        setProfiles(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erreur chargement profils:", err);
        setProfiles([]);
      } finally {
        setLoadingProfiles(false);
      }
    };
    loadProfiles();
  }, []);

  // Charger sites, groupes et projets dynamiquement
  useEffect(() => {
    const loadEntities = async () => {
      setLoadingEntities(true);
      try {
        const [sitesData, groupsData, projectsData] = await Promise.all([
          siteService.getAll(),
          developerService.getGroups(),
          projectService.getAll(),
        ]);
        console.log("Sites:", sitesData);
        console.log("Groups:", groupsData);
        console.log("Projects:", projectsData);
        console.log("Projects array length:", projectsData?.length);
        setSites(Array.isArray(sitesData) ? sitesData : []);
        setGroups(Array.isArray(groupsData) ? groupsData : []);
        setProjects(Array.isArray(projectsData) ? projectsData : []);
        console.log("Projects state set:", Array.isArray(projectsData) ? projectsData : []);
      } catch (err) {
        console.error("Erreur chargement entités:", err);
        setSites([]);
        setGroups([]);
        setProjects([]);
      } finally {
        setLoadingEntities(false);
      }
    };
    loadEntities();
  }, []);

  // Mapping intelligent: nom de profil → rôle technique
  const getRoleFromProfile = (profileName) => {
    const mapping = {
      "Super Admin": ROLES.SUPER_ADMIN,
      "Site Manager": ROLES.SITE_MANAGER,
      "Team Lead": ROLES.TEAM_LEAD,
      "Developer": ROLES.DEVELOPER,
      "Project Manager": ROLES.PROJECT_MANAGER,
      "Viewer": ROLES.VIEWER,
    };
    return mapping[profileName] || ROLES.DEVELOPER;
  };

  // Mapping inverse: rôle technique → nom de profil par défaut
  const getProfileNameFromRole = (role) => {
    const mapping = {
      [ROLES.SUPER_ADMIN]: "Super Admin",
      [ROLES.SITE_MANAGER]: "Site Manager",
      [ROLES.TEAM_LEAD]: "Team Lead",
      [ROLES.DEVELOPER]: "Developer",
      [ROLES.PROJECT_MANAGER]: "Project Manager",
      [ROLES.VIEWER]: "Viewer",
    };
    return mapping[role] || "Developer";
  };

  // Quand le profil change, mettre à jour le rôle technique
  const handleProfileChange = (profileId) => {
    const selectedProfile = profiles.find(p => p.id === parseInt(profileId));
    if (selectedProfile) {
      const technicalRole = getRoleFromProfile(selectedProfile.name);
      setForm(f => ({ ...f, profile_id: parseInt(profileId), role: technicalRole }));
    }
  };

  // Quand le rôle technique change, trouver le profil correspondant
  const handleRoleChange = (role) => {
    const profileName = getProfileNameFromRole(role);
    const matchingProfile = profiles.find(p => p.name === profileName);
    setForm(f => ({ 
      ...f, 
      role,
      profile_id: matchingProfile ? matchingProfile.id : "",
      // Clear project_ids when changing to project_manager to force user to select projects
      project_ids: role === ROLES.PROJECT_MANAGER ? [] : f.project_ids
    }));
  };

  useEscapeKey(() => { if (!loading) onClose(); });

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async () => {
    setError("");
    if (!isEdit && !form.email) return setError("L'email est obligatoire.");
    if (!isEdit && form.password.length < 8) return setError("Mot de passe : minimum 8 caractères.");
    if (!form.profile_id) return setError("Le profil est obligatoire.");

    // Validation selon le rôle (support multi-sites et multi-équipes)
    if (form.role === ROLES.SITE_MANAGER && !form.site_ids && !form.site_id)
      return setError("Au moins un site est obligatoire pour le rôle site_manager.");
    if (form.role === ROLES.TEAM_LEAD && !form.group_ids && !form.group_id)
      return setError("Au moins un groupe est obligatoire pour le rôle team_lead.");
    if (form.role === ROLES.PROJECT_MANAGER && (!form.project_ids || form.project_ids.length === 0))
      return setError("Au moins un projet est obligatoire pour le rôle project_manager.");
    // Viewer: flexible - peut avoir sites, équipes, projets, ou aucun (lecture seule globale)
    // Pas de validation spécifique requise

    setLoading(true);
    try {
      if (isEdit) {
        const payload = {
          role:      form.role,
          profile_id: form.profile_id ? parseInt(form.profile_id) : null,
          is_active: form.is_active,
          // ✅ AJOUT : support multi-sites et multi-équipes
          site_id:   form.site_id  ? parseInt(form.site_id)  : null,
          site_ids:  form.site_ids && form.site_ids.length > 0 ? form.site_ids.map(id => parseInt(id)) : null,
          group_id: form.group_id ? parseInt(form.group_id) : null,
          group_ids: form.group_ids && form.group_ids.length > 0 ? form.group_ids.map(id => parseInt(id)) : null,
          project_ids: form.project_ids && form.project_ids.length > 0 ? form.project_ids.map(id => parseInt(id)) : null,
        };
        console.log("UPDATE payload:", JSON.stringify(payload, null, 2));
        if (form.new_password) payload.new_password = form.new_password;
        await api.put(`/admin/users/${user.id}`, payload);
      } else {
        const payload = {
          email:    form.email,
          password: form.password,
          role:     form.role,
          profile_id: form.profile_id ? parseInt(form.profile_id) : null,
          login:    form.login  || undefined,
          name:     form.name   || undefined,
          // ✅ AJOUT : support multi-sites et multi-équipes
          site_id:  form.site_id  ? parseInt(form.site_id)  : undefined,
          site_ids: form.site_ids && form.site_ids.length > 0 ? form.site_ids.map(id => parseInt(id)) : [],
          group_id: form.group_id ? parseInt(form.group_id) : undefined,
          group_ids: form.group_ids && form.group_ids.length > 0 ? form.group_ids.map(id => parseInt(id)) : [],
          project_ids: form.project_ids && form.project_ids.length > 0 ? form.project_ids.map(id => parseInt(id)) : [],
        };
        console.log("CREATE payload:", JSON.stringify(payload, null, 2));
        await api.post("/admin/users", payload);
      }
      onSave();
    } catch (err) {
      // Handle both FastAPI HTTPException and Pydantic validation errors
      let errorMessage = "Une erreur est survenue.";
      if (err.response?.data) {
        if (err.response.data.detail) {
          errorMessage = err.response.data.detail;
        } else if (Array.isArray(err.response.data)) {
          // Pydantic validation errors come as an array
          errorMessage = err.response.data.map(e => e.msg).join(", ");
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14"
                style={{ width: 44, height: 44, background: "linear-gradient(135deg,#405189,#3577f1)" }}>
                {isEdit ? getInitials(user.email) : (form.email ? getInitials(form.email) : "?")}
              </div>
              <div className="flex-grow-1">
                <h5 className="fw-semibold text-dark mb-0 fs-15">
                  {isEdit ? "Modifier l'utilisateur" : "Créer un utilisateur"}
                </h5>
                <p className="text-muted fs-12 mb-0">{isEdit ? user.email : "Nouveau compte"}</p>
              </div>
              <button className="btn-close flex-shrink-0" onClick={onClose} disabled={loading} style={{ opacity: 0.5 }}></button>
            </div>
          </div>

          <div className="px-4 py-4">
            {error && (
              <div className="alert alert-danger py-2 fs-13 mb-4">
                <i className="ri-error-warning-line me-1"></i>{error}
              </div>
            )}
            
            {/* Section: Informations de base */}
            <div className="mb-4">
              <h6 className="fw-semibold text-dark fs-13 mb-3 d-flex align-items-center gap-2">
                <i className="ri-user-line text-primary"></i>
                Informations de base
              </h6>
              <div className="row g-3">
                {/* Email — création uniquement */}
                {!isEdit && (
                  <div className="col-12">
                    <label className="form-label fw-medium fs-13">Email <span className="text-danger">*</span></label>
                    <div className="input-group">
                      <span className="input-group-text"><i className="ri-mail-line"></i></span>
                      <input type="email" name="email" className="form-control" placeholder="user@telnet.tn" value={form.email} onChange={handle} />
                    </div>
                  </div>
                )}

                {/* Login + Nom — création uniquement */}
                {!isEdit && (
                  <>
                    <div className="col-md-6">
                      <label className="form-label fw-medium fs-13">Login <span className="text-muted fs-11">(optionnel)</span></label>
                      <input type="text" name="login" className="form-control" placeholder="ex: jdupont" value={form.login} onChange={handle} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-medium fs-13">Nom complet <span className="text-muted fs-11">(optionnel)</span></label>
                      <input type="text" name="name" className="form-control" placeholder="Jean Dupont" value={form.name} onChange={handle} />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Section: Authentification */}
            <div className="mb-4">
              <h6 className="fw-semibold text-dark fs-13 mb-3 d-flex align-items-center gap-2">
                <i className="ri-lock-line text-primary"></i>
                Authentification
              </h6>
              <div className="row g-3">
                {/* Mot de passe */}
                {!isEdit && (
                  <div className="col-12">
                    <label className="form-label fw-medium fs-13">Mot de passe <span className="text-danger">*</span></label>
                    <div className="input-group">
                      <span className="input-group-text"><i className="ri-lock-line"></i></span>
                      <input type={showPwd ? "text" : "password"} name="password" className="form-control"
                        placeholder="Min. 8 caractères, 1 majuscule, 1 chiffre" value={form.password} onChange={handle} />
                      <button className="btn btn-outline-secondary" type="button" onClick={() => setShowPwd(v => !v)} tabIndex="-1">
                        <i className={showPwd ? "ri-eye-off-line" : "ri-eye-line"}></i>
                      </button>
                    </div>
                  </div>
                )}

                {/* Reset password — édition uniquement */}
                {isEdit && (
                  <div className="col-12">
                    <label className="form-label fw-medium fs-13">
                      Réinitialiser le mot de passe <span className="text-muted fs-11">(laisser vide pour ne pas changer)</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text"><i className="ri-lock-password-line"></i></span>
                      <input type={showPwd ? "text" : "password"} name="new_password" className="form-control"
                        placeholder="Nouveau mot de passe (optionnel)" value={form.new_password} onChange={handle} />
                      <button className="btn btn-outline-secondary" type="button" onClick={() => setShowPwd(v => !v)} tabIndex="-1">
                        <i className={showPwd ? "ri-eye-off-line" : "ri-eye-line"}></i>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Profil & Rôle */}
            <div className="mb-4">
              <h6 className="fw-semibold text-dark fs-13 mb-3 d-flex align-items-center gap-2">
                <i className="ri-shield-user-line text-primary"></i>
                Profil & Rôle
              </h6>
              <div className="row g-3">
                {/* Profil (dynamique depuis ProfileManagementPage) */}
                <div className="col-md-6">
                  <label className="form-label fw-medium fs-13">Profil <span className="text-danger">*</span></label>
                  {loadingProfiles ? (
                    <select className="form-select" disabled>
                      <option>Chargement des profils...</option>
                    </select>
                  ) : (
                    <select 
                      name="profile_id" 
                      className="form-select" 
                      value={form.profile_id || ""} 
                      onChange={(e) => handleProfileChange(e.target.value)}
                    >
                      <option value="">-- Sélectionner un profil --</option>
                      {profiles.map(profile => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name} 
                          {profile.description && ` — ${profile.description}`}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="form-text fs-11">
                    <i className="ri-information-line me-1"></i>
                    Les profils sont gérés dans <strong>Admin → Profils & Menus</strong>
                  </div>
                </div>

                {/* Rôle technique (auto-sélectionné selon le profil) */}
                <div className="col-md-6">
                  <label className="form-label fw-medium fs-13">Rôle technique</label>
                  <select name="role" className="form-select bg-light" value={form.role} onChange={(e) => handleRoleChange(e.target.value)} disabled>
                    <option value={ROLES.SUPER_ADMIN}>Super Admin — accès total</option>
                    <option value={ROLES.SITE_MANAGER}>Site Manager — son site uniquement</option>
                    <option value={ROLES.PROJECT_MANAGER}>Project Manager — ses projets</option>
                    <option value={ROLES.TEAM_LEAD}>Team Lead — son groupe uniquement</option>
                    <option value={ROLES.VIEWER}>Viewer — flexible (sites/équipes/projets)</option>
                    <option value={ROLES.DEVELOPER}>Développeur — lecture seule</option>
                  </select>
                  <div className="form-text fs-11 text-muted">
                    Auto-sélectionné selon le profil choisi
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Assignations */}
            <div className="mb-4">
              <h6 className="fw-semibold text-dark fs-13 mb-3 d-flex align-items-center gap-2">
                <i className="ri-building-line text-primary"></i>
                Assignations
              </h6>
              <div className="row g-3">
                {/* Site ID — requis pour site_manager (support multi-sites) */}
                <div className="col-md-6">
                  <label className="form-label fw-medium fs-13">
                    Sites
                    {form.role === ROLES.SITE_MANAGER && <span className="text-danger"> *</span>}
                  </label>
                  {loadingEntities ? (
                    <select className="form-select" disabled>
                      <option>Chargement...</option>
                    </select>
                  ) : (
                    <select 
                      name="site_ids" 
                      className="form-select" 
                      value={form.site_ids || []} 
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, opt => parseInt(opt.value));
                        setForm(f => ({ 
                          ...f, 
                          site_ids: selected,
                          // Si on sélectionne des sites, mettre à jour site_id avec le premier (compatibilité)
                          site_id: selected.length > 0 ? selected[0] : ""
                        }));
                      }}
                      multiple
                      size={4}
                    >
                      {sites.map(site => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="form-text fs-11">
                    Maintenir Ctrl/Cmd pour sélection multiple. Site assigné (voir Admin → Sites)
                  </div>
                </div>

                {/* Group ID — requis pour team_lead (support multi-équipes) */}
                <div className="col-md-6">
                  <label className="form-label fw-medium fs-13">
                    Équipes
                    {form.role === ROLES.TEAM_LEAD && <span className="text-danger"> *</span>}
                  </label>
                  {loadingEntities ? (
                    <select className="form-select" disabled>
                      <option>Chargement...</option>
                    </select>
                  ) : (
                    <select 
                      name="group_ids" 
                      className="form-select" 
                      value={form.group_ids || []} 
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, opt => parseInt(opt.value));
                        setForm(f => ({ 
                          ...f, 
                          group_ids: selected,
                          // Si on sélectionne des groupes, mettre à jour group_id avec le premier (compatibilité)
                          group_id: selected.length > 0 ? selected[0] : ""
                        }));
                      }}
                      multiple
                      size={4}
                    >
                      {groups.map(group => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="form-text fs-11">
                    Maintenir Ctrl/Cmd pour sélection multiple. Groupe assigné (voir Admin → Développeurs → Groupes)
                  </div>
                </div>

                {/* Project IDs — pour project_manager */}
                <div className="col-12">
                  <label className="form-label fw-medium fs-13">
                    Projets
                    {form.role === ROLES.PROJECT_MANAGER && <span className="text-danger"> *</span>}
                  </label>
                  {loadingEntities ? (
                    <select className="form-select" disabled>
                      <option>Chargement...</option>
                    </select>
                  ) : (
                    <select 
                      name="project_ids" 
                      className="form-select" 
                      value={form.project_ids || []} 
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, opt => parseInt(opt.value));
                        setForm(f => ({ ...f, project_ids: selected }));
                      }}
                      multiple
                      size={4}
                    >
                      {projects.map(project => {
                        console.log("Rendering project:", project);
                        return (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        );
                      })}
                    </select>
                  )}
                  <div className="form-text fs-11">
                    Maintenir Ctrl/Cmd pour sélection multiple. (voir Admin → Projets)
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Statut (édition uniquement) */}
            {isEdit && (
              <div className="mb-4">
                <h6 className="fw-semibold text-dark fs-13 mb-3 d-flex align-items-center gap-2">
                  <i className="ri-toggle-line text-primary"></i>
                  Statut
                </h6>
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="rounded-3 p-3 d-flex align-items-center justify-content-between"
                      style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}>
                      <span className={`fs-13 fw-medium ${form.is_active ? "text-success" : "text-danger"}`}>
                        {form.is_active ? "Actif" : "Inactif"}
                      </span>
                      <div className="form-check form-switch mb-0">
                        <input className="form-check-input" type="checkbox" role="switch" name="is_active"
                          checked={form.is_active} onChange={handle} style={{ width: "2.5em", height: "1.4em", cursor: "pointer" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 d-flex justify-content-end gap-2"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement…</>
                : <><i className={`${isEdit ? "ri-save-line" : "ri-user-add-line"} me-1`}></i>{isEdit ? "Sauvegarder" : "Créer"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const navigate = useNavigate();
  const [users,        setUsers]        = useState([]);
  const [sites,        setSites]        = useState([]);
  const [groups,       setGroups]       = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [roleFilter,   setRoleFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey,      setSortKey]      = useState(null);
  const [sortDir,      setSortDir]      = useState("asc");
  const [modal,        setModal]        = useState(null);
  const [selected,     setSelected]     = useState(null);
  const [detailUser,   setDetailUser]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading,setDeleteLoading]= useState(false);
  const [toast,        setToast]        = useState(null);
  const [page,         setPage]         = useState(1);
  const perPage = 8;

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadUsers = useCallback(() => {
    setLoading(true);
    // Add timestamp to bypass caching
    api.get(`/admin/users?_t=${Date.now()}`)
      .then(res => { setUsers(Array.isArray(res.data) ? res.data : (res.data?.items ?? [])); })
      .catch(() => showToast("Impossible de charger les utilisateurs.", "danger"))
      .finally(() => setLoading(false));
  }, [showToast]);

  // Charger sites, groupes et projets pour le tableau
  useEffect(() => {
    const loadEntities = async () => {
      try {
        const [sitesData, groupsData, projectsData] = await Promise.all([
          siteService.getAll(),
          developerService.getGroups(),
          projectService.getAll(),
        ]);
        setSites(Array.isArray(sitesData) ? sitesData : []);
        setGroups(Array.isArray(groupsData) ? groupsData : []);
        setProjects(Array.isArray(projectsData) ? projectsData : []);
      } catch (err) {
        console.error("Erreur chargement entités:", err);
      }
    };
    loadEntities();
  }, [loadUsers]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };
  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <i className="ri-arrow-up-down-line ms-1 opacity-25 fs-11"></i>;
    return sortDir === "asc"
      ? <i className="ri-arrow-up-line ms-1 text-primary fs-11"></i>
      : <i className="ri-arrow-down-line ms-1 text-primary fs-11"></i>;
  };

  const filtered = useMemo(() => {
    let result = users.filter(u => {
      const q  = search.toLowerCase();
      const ms = !q || u.email.toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q);
      const mr = roleFilter === "all" || u.role === roleFilter;
      const mst = statusFilter === "all" ? true : statusFilter === "active" ? u.is_active : !u.is_active;
      return ms && mr && mst;
    });
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const va = (a[sortKey] ?? "").toString().toLowerCase();
        const vb = (b[sortKey] ?? "").toString().toLowerCase();
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return result;
  }, [users, search, roleFilter, statusFilter, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  const handleDelete = async (id) => {
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/users/${id}`);
      setDeleteTarget(null);
      showToast("Utilisateur supprimé.");
      // Force refresh to ensure UI updates
      await loadUsers();
    } catch (err) {
      setDeleteTarget(null);
      showToast(err.response?.data?.detail || "Suppression échouée.", "danger");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSave = () => {
    setModal(null);
    setSelected(null);
    showToast(modal === "edit" ? "Utilisateur mis à jour." : "Utilisateur créé.");
    loadUsers();
  };

  // Statistiques
  const totalUsers    = users.length;
  const superAdmins   = users.filter(u => u.role === ROLES.SUPER_ADMIN).length;
  const siteManagers  = users.filter(u => u.role === ROLES.SITE_MANAGER).length;
  const teamLeads     = users.filter(u => u.role === ROLES.TEAM_LEAD).length;
  const activeUsers   = users.filter(u => u.is_active).length;
  const hasFilters    = search || roleFilter !== "all" || statusFilter !== "all";

  return (
    <div className="page-content">
      <div className="container-fluid">
        <Toast toast={toast} />

        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-team-line me-2 text-primary"></i>Gestion des Utilisateurs
              </h4>
              <ol className="breadcrumb m-0 mb-4">
                <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
                <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Utilisateurs</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Stats cards — ✅ 4 rôles */}
        <div className="row">
          {[
            { label: "Total",       value: totalUsers,   color: "primary",   icon: "ri-team-line",         fn: () => { setRoleFilter("all"); setStatusFilter("all"); } },
            { label: "Super Admin", value: superAdmins,  color: "danger",    icon: "ri-shield-star-line",  fn: () => { setRoleFilter(ROLES.SUPER_ADMIN); } },
            { label: "Site Manager",value: siteManagers, color: "warning",   icon: "ri-map-pin-user-line", fn: () => { setRoleFilter(ROLES.SITE_MANAGER); } },
            { label: "Team Lead",   value: teamLeads,    color: "info",      icon: "ri-team-line",         fn: () => { setRoleFilter(ROLES.TEAM_LEAD); } },
            { label: "Actifs",      value: activeUsers,  color: "success",   icon: "ri-user-follow-line",  fn: () => { setRoleFilter("all"); setStatusFilter("active"); } },
          ].map((s, i) => (
            <div key={i} className="col-xl col-sm-6">
              <div className="card card-animate" style={{ cursor: "pointer" }}
                onClick={() => { s.fn(); setPage(1); }}>
                <div className="card-body">
                  <div className="d-flex align-items-center">
                    <div className="avatar-sm flex-shrink-0">
                      <span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-2`}>
                        <i className={s.icon}></i>
                      </span>
                    </div>
                    <div className="flex-grow-1 ms-3">
                      <p className="text-uppercase fw-medium text-muted mb-1 fs-11">{s.label}</p>
                      <h4 className={`mb-0 text-${s.color}`}>{s.value}</h4>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="card">
          <div className="card-header border-0">
            <div className="row g-2 align-items-center">
              <div className="col-sm-4">
                <div className="search-box">
                  <input type="text" className="form-control" placeholder="Rechercher par email ou nom..."
                    value={search} onChange={e => setSearch(e.target.value)} />
                  <i className="ri-search-line search-icon"></i>
                </div>
              </div>
              <div className="col-sm-2">
                {/* ✅ FIX : 4 rôles dans le dropdown */}
                <select className="form-select" value={roleFilter}
                  onChange={e => { setRoleFilter(e.target.value); setPage(1); }}>
                  <option value="all">Tous les rôles</option>
                  <option value={ROLES.SUPER_ADMIN}>Super Admin</option>
                  <option value={ROLES.SITE_MANAGER}>Site Manager</option>
                  <option value={ROLES.TEAM_LEAD}>Team Lead</option>
                  <option value={ROLES.DEVELOPER}>Développeur</option>
                </select>
              </div>
              <div className="col-sm-2">
                <select className="form-select" value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="all">Tous statuts</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>
              </div>
              {hasFilters && (
                <div className="col-sm-auto">
                  <button className="btn btn-soft-danger btn-sm"
                    onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); setPage(1); }}>
                    <i className="ri-close-line me-1"></i>Reset ({filtered.length})
                  </button>
                </div>
              )}
              <div className="col-sm-auto ms-auto d-flex gap-2">
                {users.length > 0 && (
                  <button className="btn btn-soft-success" onClick={() => exportCSV(filtered)}>
                    <i className="ri-download-2-line me-1"></i>CSV
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => { setSelected(null); setModal("create"); }}>
                  <i className="ri-user-add-line me-1"></i>Créer
                </button>
              </div>
            </div>
          </div>

          <div className="card-body">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary"></div>
                <p className="text-muted mt-2">Chargement des utilisateurs…</p>
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table align-middle table-hover table-nowrap mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("email")}>
                          Utilisateur<SortIcon k="email" />
                        </th>
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("role")}>
                          Rôle<SortIcon k="role" />
                        </th>
                        <th>Site</th>
                        <th>Groupe</th>
                        <th>Projets</th>
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("is_active")}>
                          Statut<SortIcon k="is_active" />
                        </th>
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("created_at")}>
                          Créé le<SortIcon k="created_at" />
                        </th>
                        <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="text-center py-5 text-muted">
                            <i className="ri-user-search-line fs-2 d-block mb-2 opacity-50"></i>
                            Aucun utilisateur trouvé.
                          </td>
                        </tr>
                      ) : paginated.map(user => {
                        const color = ROLE_COLORS[user.role] || "secondary";
                        // ✅ FIX : Afficher tous les sites assignés (multi-sites)
                        const userSites = (user.site_ids || []).map(sid => sites.find(s => s.id === sid)?.name).filter(Boolean);
                        const siteName = userSites.length > 0 ? userSites[0] : (sites.find(s => s.id === user.site_id)?.name || "—");
                        // ✅ FIX : Afficher tous les groupes assignés (multi-équipes)
                        const userGroups = (user.group_ids || []).map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean);
                        const groupName = userGroups.length > 0 ? userGroups[0] : (groups.find(g => g.id === user.group_id)?.name || "—");
                        const userProjects = (user.project_ids || []).map(pid => projects.find(p => p.id === pid)?.name).filter(Boolean);
                        return (
                          <tr key={user.id} style={{ cursor: "pointer" }} onClick={() => setDetailUser(user)}>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <div className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center bg-${color}-subtle text-${color} fw-bold fs-12 flex-shrink-0`}
                                  style={{ minWidth: 32, height: 32 }}>
                                  {getInitials(user.email)}
                                </div>
                                <div>
                                  <p className="fw-medium mb-0 fs-13">{user.name || user.login || user.email}</p>
                                  <p className="text-muted fs-11 mb-0">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`badge bg-${color}-subtle text-${color}`}>
                                <i className={`${ROLE_ICONS[user.role] || "ri-user-line"} me-1`}></i>
                                {ROLE_LABELS[user.role] || user.role}
                              </span>
                            </td>
                            <td className="fs-12 text-muted">
                              {userSites.length > 0 ? (
                                <div className="d-flex flex-wrap gap-1">
                                  {userSites.slice(0, 2).map((site, idx) => (
                                    <span key={idx} className="badge bg-light text-dark fs-11"><i className="ri-map-pin-line me-1"></i>{site}</span>
                                  ))}
                                  {userSites.length > 2 && <span className="badge bg-light text-dark fs-11">+{userSites.length - 2}</span>}
                                </div>
                              ) : siteName !== "—" ? <span><i className="ri-map-pin-line me-1"></i>{siteName}</span> : "—"}
                            </td>
                            <td className="fs-12 text-muted">
                              {userGroups.length > 0 ? (
                                <div className="d-flex flex-wrap gap-1">
                                  {userGroups.slice(0, 2).map((group, idx) => (
                                    <span key={idx} className="badge bg-light text-dark fs-11"><i className="ri-group-line me-1"></i>{group}</span>
                                  ))}
                                  {userGroups.length > 2 && <span className="badge bg-light text-dark fs-11">+{userGroups.length - 2}</span>}
                                </div>
                              ) : groupName !== "—" ? <span><i className="ri-group-line me-1"></i>{groupName}</span> : "—"}
                            </td>
                            <td className="fs-12 text-muted">
                              {userProjects.length > 0 ? (
                                <div className="d-flex flex-wrap gap-1">
                                  {userProjects.slice(0, 2).map((proj, idx) => (
                                    <span key={idx} className="badge bg-light text-dark fs-11">{proj}</span>
                                  ))}
                                  {userProjects.length > 2 && <span className="badge bg-light text-dark fs-11">+{userProjects.length - 2}</span>}
                                </div>
                              ) : "—"}
                            </td>
                            <td>
                              {user.is_active
                                ? <span className="badge bg-success-subtle text-success"><i className="ri-checkbox-circle-line me-1"></i>Actif</span>
                                : <span className="badge bg-danger-subtle text-danger"><i className="ri-close-circle-line me-1"></i>Inactif</span>}
                            </td>
                            <td className="text-muted fs-13">{formatDate(user.created_at)}</td>
                            <td className="text-center" onClick={e => e.stopPropagation()}>
                              <div className="d-flex gap-1 justify-content-center">
                                <button className="btn btn-sm btn-soft-primary btn-icon"
                                  onClick={() => { setSelected(user); setModal("edit"); }}>
                                  <i className="ri-pencil-fill fs-14"></i>
                                </button>
                                <button className="btn btn-sm btn-soft-danger btn-icon"
                                  onClick={() => setDeleteTarget(user)}>
                                  <i className="ri-delete-bin-fill fs-14"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="d-flex align-items-center justify-content-between mt-3">
                  <p className="text-muted mb-0 fs-13">
                    <strong>{Math.min((page - 1) * perPage + 1, filtered.length)}</strong>–
                    <strong>{Math.min(page * perPage, filtered.length)}</strong> sur{" "}
                    <strong>{filtered.length}</strong>
                  </p>
                  <ul className="pagination pagination-separated mb-0">
                    <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                      <button className="page-link" onClick={() => setPage(p => p - 1)}>Préc.</button>
                    </li>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => Math.abs(p - page) <= 2)
                      .map(p => (
                        <li key={p} className={`page-item ${p === page ? "active" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                        </li>
                      ))}
                    <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
                      <button className="page-link" onClick={() => setPage(p => p + 1)}>Suiv.</button>
                    </li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {(modal === "create" || modal === "edit") && (
        <UserModal mode={modal} user={selected}
          onClose={() => { setModal(null); setSelected(null); }}
          onSave={handleSave} />
      )}
      {detailUser && !modal && (
        <UserDetailModal user={detailUser}
          sites={sites}
          groups={groups}
          onClose={() => setDetailUser(null)}
          onEdit={u => { setDetailUser(null); setSelected(u); setModal("edit"); }}
          onDelete={u => { setDetailUser(null); setDeleteTarget(u); }} />
      )}
      <DeleteModal user={deleteTarget} onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)} loading={deleteLoading} />
    </div>
  );
}






