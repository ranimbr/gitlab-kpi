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
import { ROLES }   from "../context/AuthContext";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function getInitials(email = "") {
  const parts = email.split("@")[0].split(/[._-]/);
  return (parts.length >= 2 ? (parts[0][0] + parts[1][0]) : email.slice(0, 2)).toUpperCase();
}

// ✅ FIX : 4 rôles
const ROLE_COLORS = {
  [ROLES.SUPER_ADMIN]:  "danger",
  [ROLES.SITE_MANAGER]: "warning",
  [ROLES.TEAM_LEAD]:    "info",
  [ROLES.DEVELOPER]:    "secondary",
};
const ROLE_ICONS = {
  [ROLES.SUPER_ADMIN]:  "ri-shield-star-line",
  [ROLES.SITE_MANAGER]: "ri-map-pin-user-line",
  [ROLES.TEAM_LEAD]:    "ri-team-line",
  [ROLES.DEVELOPER]:    "ri-code-s-slash-line",
};
const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]:  "Super Admin",
  [ROLES.SITE_MANAGER]: "Site Manager",
  [ROLES.TEAM_LEAD]:    "Team Lead",
  [ROLES.DEVELOPER]:    "Développeur",
};

function exportCSV(users) {
  const headers = ["ID", "Email", "Rôle", "Site ID", "Groupe ID", "Statut", "Dashboards", "Créé le"];
  const rows = users.map(u => [
    u.id, u.email,
    ROLE_LABELS[u.role] || u.role,
    u.site_id  || "",
    u.group_id || "",
    u.is_active ? "Actif" : "Inactif",
    (u.dashboard_access || []).length,
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
function UserDetailModal({ user, onClose, onEdit, onDelete }) {
  useEscapeKey(onClose);
  if (!user) return null;
  const color     = ROLE_COLORS[user.role] || "secondary";
  const dashCount = (user.dashboard_access || []).length;
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
                { icon: "ri-map-pin-line",     label: "Site ID",    value: user.site_id  ? `#${user.site_id}`  : "—" },
                { icon: "ri-group-line",       label: "Groupe ID",  value: user.group_id ? `#${user.group_id}` : "—" },
                { icon: "ri-toggle-line",      label: "Statut",     value: user.is_active ? "Actif" : "Inactif", valueColor: user.is_active ? "#15803d" : "#dc2626" },
                { icon: "ri-layout-grid-line", label: "Dashboards", value: `${dashCount} dashboard${dashCount !== 1 ? "s" : ""}`, valueColor: dashCount > 0 ? "#405189" : undefined },
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
  const [form, setForm] = useState({
    email:       user?.email    || "",
    password:    "",
    role:        user?.role     || ROLES.DEVELOPER,
    is_active:   user?.is_active ?? true,
    new_password:"",
    site_id:     user?.site_id  || "",
    group_id:    user?.group_id || "",
    login:       user?.login    || "",
    name:        user?.name     || "",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEscapeKey(() => { if (!loading) onClose(); });

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async () => {
    setError("");
    if (!isEdit && !form.email) return setError("L'email est obligatoire.");
    if (!isEdit && form.password.length < 8) return setError("Mot de passe : minimum 8 caractères.");

    // Validation selon le rôle
    if (form.role === ROLES.SITE_MANAGER && !form.site_id)
      return setError("Un site_id est obligatoire pour le rôle site_manager.");
    if (form.role === ROLES.TEAM_LEAD && !form.group_id)
      return setError("Un group_id est obligatoire pour le rôle team_lead.");

    setLoading(true);
    try {
      if (isEdit) {
        const payload = {
          role:      form.role,
          is_active: form.is_active,
          site_id:   form.site_id  ? parseInt(form.site_id)  : null,
          group_id:  form.group_id ? parseInt(form.group_id) : null,
        };
        if (form.new_password) payload.new_password = form.new_password;
        await api.put(`/admin/users/${user.id}`, payload);
      } else {
        await api.post("/admin/users", {
          email:    form.email,
          password: form.password,
          role:     form.role,
          login:    form.login  || undefined,
          name:     form.name   || undefined,
          site_id:  form.site_id  ? parseInt(form.site_id)  : undefined,
          group_id: form.group_id ? parseInt(form.group_id) : undefined,
        });
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || "Une erreur est survenue.");
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
              <div className="alert alert-danger py-2 fs-13 mb-3">
                <i className="ri-error-warning-line me-1"></i>{error}
              </div>
            )}
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

              {/* Rôle */}
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Rôle <span className="text-danger">*</span></label>
                <select name="role" className="form-select" value={form.role} onChange={handle}>
                  <option value={ROLES.SUPER_ADMIN}>Super Admin — accès total</option>
                  <option value={ROLES.SITE_MANAGER}>Site Manager — son site uniquement</option>
                  <option value={ROLES.TEAM_LEAD}>Team Lead — son groupe uniquement</option>
                  <option value={ROLES.DEVELOPER}>Développeur — lecture seule</option>
                </select>
              </div>

              {/* Statut — édition uniquement */}
              {isEdit && (
                <div className="col-md-6">
                  <label className="form-label fw-medium fs-13">Statut</label>
                  <div className="rounded-3 p-2 d-flex align-items-center justify-content-between"
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
              )}

              {/* Site ID — requis pour site_manager */}
              {(form.role === ROLES.SITE_MANAGER || form.role === ROLES.SUPER_ADMIN) && (
                <div className="col-md-6">
                  <label className="form-label fw-medium fs-13">
                    Site ID
                    {form.role === ROLES.SITE_MANAGER && <span className="text-danger"> *</span>}
                  </label>
                  <div className="input-group">
                    <span className="input-group-text"><i className="ri-map-pin-line"></i></span>
                    <input type="number" name="site_id" className="form-control" placeholder="ID du site"
                      value={form.site_id} onChange={handle} />
                  </div>
                  <div className="form-text fs-11">ID du site assigné (voir Admin → Sites)</div>
                </div>
              )}

              {/* Group ID — requis pour team_lead */}
              {(form.role === ROLES.TEAM_LEAD || form.role === ROLES.SUPER_ADMIN) && (
                <div className="col-md-6">
                  <label className="form-label fw-medium fs-13">
                    Groupe ID
                    {form.role === ROLES.TEAM_LEAD && <span className="text-danger"> *</span>}
                  </label>
                  <div className="input-group">
                    <span className="input-group-text"><i className="ri-group-line"></i></span>
                    <input type="number" name="group_id" className="form-control" placeholder="ID du groupe"
                      value={form.group_id} onChange={handle} />
                  </div>
                  <div className="form-text fs-11">ID du groupe assigné (voir Admin → Développeurs → Groupes)</div>
                </div>
              )}

              {/* Info dashboards */}
              <div className="col-12">
                <div className="alert alert-info py-2 fs-12 mb-0">
                  <i className="ri-information-line me-1"></i>
                  Les accès aux dashboards se gèrent dans <strong>Admin → Dashboards</strong> via le bouton "Accès".
                </div>
              </div>
            </div>
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
    api.get("/admin/users")
      .then(res => { setUsers(Array.isArray(res.data) ? res.data : (res.data?.items ?? [])); })
      .catch(() => showToast("Impossible de charger les utilisateurs.", "danger"))
      .finally(() => setLoading(false));
  }, [showToast]);

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
      loadUsers();
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
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-team-line me-2 text-primary"></i>Gestion des utilisateurs
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item active">Utilisateurs</li>
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
                <button className="btn btn-soft-info" onClick={() => navigate("/admin/dashboards")}>
                  <i className="ri-layout-grid-line me-1"></i>Dashboards
                </button>
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
                        <th>Site / Groupe</th>
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("is_active")}>
                          Statut<SortIcon k="is_active" />
                        </th>
                        <th>Dashboards</th>
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("created_at")}>
                          Créé le<SortIcon k="created_at" />
                        </th>
                        <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="text-center py-5 text-muted">
                            <i className="ri-user-search-line fs-2 d-block mb-2 opacity-50"></i>
                            Aucun utilisateur trouvé.
                          </td>
                        </tr>
                      ) : paginated.map(user => {
                        const color = ROLE_COLORS[user.role] || "secondary";
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
                              {user.site_id  && <span className="me-1"><i className="ri-map-pin-line me-1"></i>Site #{user.site_id}</span>}
                              {user.group_id && <span><i className="ri-group-line me-1"></i>Grp #{user.group_id}</span>}
                              {!user.site_id && !user.group_id && "—"}
                            </td>
                            <td>
                              {user.is_active
                                ? <span className="badge bg-success-subtle text-success"><i className="ri-checkbox-circle-line me-1"></i>Actif</span>
                                : <span className="badge bg-danger-subtle text-danger"><i className="ri-close-circle-line me-1"></i>Inactif</span>}
                            </td>
                            <td>
                              {(user.dashboard_access || []).length > 0
                                ? <span className="badge bg-primary-subtle text-primary"><i className="ri-layout-grid-line me-1"></i>{(user.dashboard_access || []).length}</span>
                                : <span className="text-muted fs-12">—</span>}
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
          onClose={() => setDetailUser(null)}
          onEdit={u => { setDetailUser(null); setSelected(u); setModal("edit"); }}
          onDelete={u => { setDetailUser(null); setDeleteTarget(u); }} />
      )}
      <DeleteModal user={deleteTarget} onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)} loading={deleteLoading} />
    </div>
  );
}
