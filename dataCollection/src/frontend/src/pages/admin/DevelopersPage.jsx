/**
 * pages/admin/DevelopersPage.jsx
 *
 * CORRECTIONS CRITIQUES :
 *   1. dev.validated → dev.is_validated (champ réel du backend)
 *   2. developerService.reject() n'existe pas → utilise validate({ is_validated: false, is_bot: false })
 *   3. handleDeleteGroup race condition : await load() AVANT setDeleteGroup(null)
 *   4. DeveloperService.getAll() retourne tous, getByTab filtre côté backend
 *
 * AMÉLIORATIONS :
 *   - Skeleton loading au lieu de spinner
 *   - Vue tableau/cartes avec toggle mémorisé
 *   - Colonne "Groupe" dans la table
 *   - Badge count dans les onglets mis à jour en temps réel
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import developerService from "../../services/developerService";
import siteService      from "../../services/siteService";
import projectService   from "../../services/projectService";
import LoadingSpinner   from "../../components/common/LoadingSpinner";
import EmptyState       from "../../components/common/EmptyState";
import Pagination       from "../../components/common/Pagination";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name = "") {
  return (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const AVATAR_COLORS = [
  "#3577f1", "#0ab39c", "#f06548", "#299cdb", "#f7b84b", "#6f42c1",
];
function avatarColor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`alert alert-${toast.type} d-flex align-items-center gap-2 position-fixed top-0 end-0 m-3`}
      style={{ zIndex: 9999, minWidth: 320, borderRadius: 12, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,.12)" }}>
      <i className={`${toast.type === "success" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} fs-16`}></i>
      <span className="fs-13 fw-medium">{toast.msg}</span>
    </div>
  );
}

function useEscapeKey(cb, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e) => { if (e.key === "Escape") cb(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [cb, enabled]);
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ dev, size = 40 }) {
  const color = avatarColor(dev.username || "");
  if (dev.is_bot) {
    return (
      <div className="d-flex align-items-center justify-content-center rounded-circle bg-warning-subtle flex-shrink-0"
        style={{ width: size, height: size }}>
        <i className="ri-robot-line text-warning" style={{ fontSize: size * 0.4 }}></i>
      </div>
    );
  }
  return (
    <div className="d-flex align-items-center justify-content-center rounded-circle text-white fw-bold flex-shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.32 }}>
      {getInitials(dev.name || dev.username)}
    </div>
  );
}

// ── ValidateModal ─────────────────────────────────────────────────────────────
function ValidateModal({ dev, action, onClose, onConfirm }) {
  const isReject = action === "reject";
  const [reason,  setReason]  = useState("");
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose, !loading);
  if (!dev) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(dev.id, action, reason.trim() || null); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>

          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className={`d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 ${isReject ? "bg-danger-subtle" : "bg-success-subtle"}`}
              style={{ width: 48, height: 48 }}>
              <i className={`${isReject ? "ri-close-circle-line text-danger" : "ri-checkbox-circle-line text-success"} fs-22`}></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="fw-semibold mb-0 fs-15">{isReject ? "Rejeter ce développeur" : "Valider ce développeur"}</h5>
              <p className="text-muted fs-12 mb-0">@{dev.username} {dev.email ? `· ${dev.email}` : ""}</p>
            </div>
            <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>

          <div className="px-4 py-4">
            {isReject ? (
              <>
                <div className="alert alert-danger d-flex gap-2 py-2 fs-13 mb-3">
                  <i className="ri-alert-line flex-shrink-0 mt-1"></i>
                  Ce développeur sera <strong>exclu</strong> des calculs KPI et des extractions.
                </div>
                <label className="form-label fw-medium fs-13">Motif de rejet <span className="text-muted fw-normal">(optionnel)</span></label>
                <textarea className="form-control" rows={3}
                  placeholder="Ex: doublon, compte bot non détecté, erreur de mapping…"
                  value={reason} onChange={e => setReason(e.target.value)} disabled={loading} />
              </>
            ) : (
              <div className="alert alert-success d-flex gap-2 py-2 fs-13 mb-0">
                <i className="ri-checkbox-circle-line flex-shrink-0 mt-1 text-success"></i>
                Ce développeur sera <strong>inclus</strong> dans les métriques KPI de l'équipe.
              </div>
            )}
          </div>

          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className={`btn btn-sm px-4 ${isReject ? "btn-danger" : "btn-success"}`}
              onClick={handleConfirm} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>En cours…</>
                : <><i className={`${isReject ? "ri-close-line" : "ri-check-line"} me-1`}></i>{isReject ? "Rejeter" : "Valider"}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DevEditModal ──────────────────────────────────────────────────────────────
function DevEditModal({ dev, sites, onClose, onSave }) {
  const [form, setForm] = useState({
    name:    dev?.name    || "",
    email:   dev?.email   || "",
    site_id: dev?.site_id || "",
    is_bot:  dev?.is_bot  || false,
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  useEscapeKey(onClose, !loading);

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      await developerService.update(dev.id, {
        name:    form.name.trim() || null,
        email:   form.email.trim() || null,
        site_id: form.site_id ? parseInt(form.site_id) : null,
        is_bot:  form.is_bot,
      });
      onSave();
    } catch (err) {
      setError(err.message || "Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>

          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <Avatar dev={dev} size={44} />
            <div className="flex-grow-1">
              <h5 className="fw-semibold mb-0 fs-15">Modifier le développeur</h5>
              <p className="text-muted fs-12 mb-0">@{dev?.username}</p>
            </div>
            <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>

          <div className="px-4 py-4">
            {error && <div className="alert alert-danger d-flex gap-2 py-2 fs-13 mb-3"><i className="ri-error-warning-line"></i>{error}</div>}
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Nom complet</label>
                <input type="text" name="name" className="form-control" value={form.name}
                  onChange={handle} placeholder="Prénom Nom" />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Email</label>
                <input type="email" name="email" className="form-control" value={form.email}
                  onChange={handle} placeholder="dev@example.com" />
              </div>
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Site géographique</label>
                <select name="site_id" className="form-select" value={form.site_id} onChange={handle}>
                  <option value="">— Aucun site —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}{s.country ? ` (${s.country})` : ""}</option>)}
                </select>
              </div>
              <div className="col-12">
                <div className="d-flex align-items-center justify-content-between rounded-3 p-3"
                  style={{
                    background: form.is_bot ? "#fffbeb" : "#f8fafc",
                    border: `1px solid ${form.is_bot ? "#fcd34d" : "#e9ecef"}`,
                    transition: "all .2s",
                  }}>
                  <div>
                    <div className={`fw-medium fs-13 ${form.is_bot ? "text-warning" : ""}`}>
                      <i className={`${form.is_bot ? "ri-robot-line text-warning" : "ri-user-line text-muted"} me-1`}></i>
                      {form.is_bot ? "Compte bot / CI" : "Compte développeur humain"}
                    </div>
                    <div className="text-muted fs-12">
                      {form.is_bot ? "Exclu des calculs KPI" : "Inclus dans les métriques d'équipe"}
                    </div>
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input type="checkbox" className="form-check-input" role="switch"
                      name="is_bot" checked={form.is_bot} onChange={handle}
                      style={{ width: "2.5em", height: "1.4em", cursor: "pointer" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>
              {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement…</> : <><i className="ri-save-line me-1"></i>Enregistrer</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GroupModal ────────────────────────────────────────────────────────────────
function GroupModal({ group, sites, onClose, onSave }) {
  const isEdit = !!group?.id;
  const [form, setForm] = useState({ name: group?.name || "", site_id: group?.site_id || "" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  useEscapeKey(onClose, !loading);

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Le nom du groupe est requis.");
    setLoading(true);
    try {
      const payload = { name: form.name.trim(), site_id: form.site_id ? parseInt(form.site_id) : null };
      if (isEdit) await developerService.updateGroup(group.id, payload);
      else        await developerService.createGroup(payload);
      onSave();
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>
          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className="d-flex align-items-center justify-content-center rounded-circle text-white flex-shrink-0"
              style={{ width: 44, height: 44, background: "linear-gradient(135deg, #405189, #3577f1)" }}>
              <i className={isEdit ? "ri-edit-line" : "ri-group-line"}></i>
            </div>
            <div>
              <h5 className="fw-semibold mb-0 fs-15">{isEdit ? "Modifier le groupe" : "Nouveau groupe"}</h5>
              <p className="text-muted fs-12 mb-0">Regroupement d'équipe par site</p>
            </div>
            <button className="btn-close ms-auto" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>
          <div className="px-4 py-4">
            {error && <div className="alert alert-danger py-2 fs-13 mb-3">{error}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Nom du groupe <span className="text-danger">*</span></label>
                <input type="text" className="form-control" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ex: Backend Team, Frontend Tunis…" autoFocus />
              </div>
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Site associé</label>
                <select className="form-select" value={form.site_id}
                  onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
                  <option value="">— Tous les sites —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>
              {loading ? <><span className="spinner-border spinner-border-sm me-2"></span></> : <><i className="ri-save-line me-1"></i>{isEdit ? "Mettre à jour" : "Créer"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: "all",       label: "Tous",       icon: "ri-team-line",              field: null                       },
  { key: "validated", label: "Validés",    icon: "ri-checkbox-circle-line",   field: "is_validated", val: true  },
  { key: "pending",   label: "En attente", icon: "ri-time-line",              field: "is_validated", val: false },
  { key: "bots",      label: "Bots",       icon: "ri-robot-line",             field: "is_bot",       val: true  },
];

export default function DevelopersPage() {
  const [developers,    setDevelopers]    = useState([]);
  const [groups,        setGroups]        = useState([]);
  const [sites,         setSites]         = useState([]);
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState("all");
  const [viewMode,      setViewMode]      = useState("table");
  const [search,        setSearch]        = useState("");
  const [siteFilter,    setSiteFilter]    = useState("all");
  const [page,          setPage]          = useState(1);
  const perPage = 15;

  const [validateTarget, setValidateTarget] = useState(null);
  const [editDev,        setEditDev]        = useState(null);
  const [editGroup,      setEditGroup]      = useState(null);
  const [deleteGroup,    setDeleteGroup]    = useState(null);
  const [deleteGroupLoading, setDeleteGroupLoading] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [devsData, groupsData, sitesData, projsData] = await Promise.all([
        developerService.getAll(null, null, false),  // activeOnly=false pour voir tous
        developerService.getGroups(),
        siteService.getAll(),
        projectService.getAll(),
      ]);
      setDevelopers(Array.isArray(devsData)   ? devsData   : []);
      setGroups    (Array.isArray(groupsData)  ? groupsData : []);
      setSites     (Array.isArray(sitesData)   ? sitesData  : []);
      setProjects  (Array.isArray(projsData)   ? projsData  : []);
    } catch {
      showToast("Erreur lors du chargement des développeurs.", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, siteFilter, activeTab]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     developers.filter(d => !d.is_bot).length,
    validated: developers.filter(d => d.is_validated === true  && !d.is_bot).length,
    pending:   developers.filter(d => d.is_validated !== true  && !d.is_bot).length,
    bots:      developers.filter(d => d.is_bot).length,
  }), [developers]);

  // ── Filtrage ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return developers.filter(dev => {
      // Tab filter — ✅ FIX: utilise is_validated (pas validated)
      if (activeTab === "validated" && dev.is_validated !== true)  return false;
      if (activeTab === "pending"   && dev.is_validated === true)  return false;
      if (activeTab === "pending"   && dev.is_bot)                 return false;
      if (activeTab === "bots"      && !dev.is_bot)                return false;
      if (activeTab === "all"       && dev.is_bot)                 return false;

      // Search
      const q = search.toLowerCase();
      if (q && !(dev.username || "").toLowerCase().includes(q) &&
               !(dev.name    || "").toLowerCase().includes(q) &&
               !(dev.email   || "").toLowerCase().includes(q)) return false;

      // Site
      if (siteFilter !== "all" && String(dev.site_id) !== siteFilter) return false;

      return true;
    });
  }, [developers, activeTab, search, siteFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleValidateAction = useCallback(async (devId, action) => {
    try {
      // ✅ FIX: pas de developerService.reject() → utilise validate avec is_validated=false
      if (action === "validate") {
        await developerService.validate(devId, { is_validated: true });
        showToast("Développeur validé avec succès.");
      } else {
        await developerService.validate(devId, { is_validated: false });
        showToast("Développeur rejeté.");
      }
      setValidateTarget(null);
      await load();
    } catch (err) {
      showToast(err.message || "Erreur lors de l'action.", "danger");
    }
  }, [load, showToast]);

  const handleEditSave = useCallback(async () => {
    setEditDev(null);
    showToast("Développeur mis à jour.");
    await load();
  }, [load, showToast]);

  const handleGroupSave = useCallback(async () => {
    const isNew = !editGroup?.id;
    setEditGroup(null);
    showToast(isNew ? "Groupe créé." : "Groupe mis à jour.");
    await load();
  }, [load, showToast, editGroup]);

  // ✅ FIX: await load() AVANT setDeleteGroup(null) — race condition corrigée
  const handleDeleteGroup = useCallback(async (groupId) => {
    setDeleteGroupLoading(true);
    try {
      await developerService.deleteGroup(groupId);
      showToast("Groupe supprimé.");
      await load();
      setDeleteGroup(null);
    } catch (err) {
      showToast(err.message || "Erreur lors de la suppression.", "danger");
      setDeleteGroup(null);
    } finally {
      setDeleteGroupLoading(false);
    }
  }, [load, showToast]);

  const exportCSV = useCallback(() => {
    const headers = ["ID", "Username", "Nom", "Email", "Site", "Validé", "Bot", "Créé le"];
    const rows = filtered.map(dev => {
      const site = sites.find(s => s.id === dev.site_id);
      return [dev.id, dev.username || "", `"${(dev.name || "").replace(/"/g, '""')}"`,
        dev.email || "", site?.name || "",
        dev.is_validated ? "Oui" : "Non", dev.is_bot ? "Oui" : "Non", formatDate(dev.created_at)];
    });
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `developers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [filtered, sites]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const tabCounts = { all: stats.total, validated: stats.validated, pending: stats.pending, bots: stats.bots };

  return (
    <div className="page-content">
      <div className="container-fluid">
        <Toast toast={toast} />

        {/* Header */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <div>
                <h4 className="mb-1 fw-semibold"><i className="ri-team-line me-2 text-primary"></i>Développeurs</h4>
                <p className="text-muted fs-13 mb-0">{stats.total} développeurs · {stats.pending} en attente de validation</p>
              </div>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item">Administration</li>
                <li className="breadcrumb-item active">Développeurs</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div className="row g-3 mb-4">
          {[
            { label: "Total devs",    value: stats.total,     color: "#3577f1", bg: "#eff6ff", icon: "ri-team-line",            tab: "all"       },
            { label: "Validés",       value: stats.validated, color: "#0ab39c", bg: "#f0fdf4", icon: "ri-checkbox-circle-line", tab: "validated" },
            { label: "En attente",    value: stats.pending,   color: "#f7b84b", bg: "#fffbeb", icon: "ri-time-line",            tab: "pending"   },
            { label: "Bots / CI",     value: stats.bots,      color: "#6f42c1", bg: "#f5f3ff", icon: "ri-robot-line",           tab: "bots"      },
          ].map((s, i) => (
            <div key={i} className="col-xl-3 col-sm-6">
              <div className="card border-0 h-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)", cursor: "pointer" }}
                onClick={() => { setActiveTab(s.tab); setPage(1); }}>
                <div className="card-body d-flex align-items-center gap-3">
                  <div className="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
                    style={{ width: 48, height: 48, background: s.bg }}>
                    <i className={`${s.icon} fs-22`} style={{ color: s.color }}></i>
                  </div>
                  <div>
                    <p className="text-muted fs-11 fw-semibold text-uppercase mb-1" style={{ letterSpacing: ".05em" }}>{s.label}</p>
                    <h3 className="fw-bold mb-0" style={{ color: s.color }}>{s.value}</h3>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Alert pending */}
        {stats.pending > 0 && (
          <div className="alert d-flex align-items-center gap-3 mb-4"
            style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 12 }}>
            <i className="ri-time-line fs-3 flex-shrink-0 text-warning"></i>
            <div className="flex-grow-1">
              <strong className="text-warning-emphasis">{stats.pending} développeur{stats.pending > 1 ? "s" : ""} en attente</strong>
              <span className="text-muted fs-13 ms-2">— Validez-les pour les inclure dans les calculs KPI.</span>
            </div>
            <button className="btn btn-sm btn-warning flex-shrink-0" onClick={() => setActiveTab("pending")}>
              <i className="ri-filter-line me-1"></i>Voir les en attente
            </button>
          </div>
        )}

        <div className="row">
          {/* Colonne principale */}
          <div className="col-xl-9">
            <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>

              {/* Tabs + View toggle */}
              <div className="card-header bg-white px-4 pt-3 pb-0" style={{ borderBottom: "1px solid #f0f2f5" }}>
                <div className="d-flex align-items-center">
                  <ul className="nav nav-tabs-custom border-0 flex-grow-1" role="tablist">
                    {TABS.map(tab => (
                      <li key={tab.key} className="nav-item">
                        <button
                          className={`nav-link border-0 ${activeTab === tab.key ? "active fw-semibold" : "text-muted"} d-flex align-items-center gap-2 pb-3`}
                          onClick={() => { setActiveTab(tab.key); setPage(1); }}>
                          <i className={tab.icon}></i>
                          {tab.label}
                          <span className={`badge rounded-pill fs-10 ${activeTab === tab.key ? "bg-primary text-white" : "bg-light text-dark"}`}>
                            {tabCounts[tab.key]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="d-flex gap-1 ms-auto pb-2">
                    <button className={`btn btn-sm btn-icon ${viewMode === "table" ? "btn-primary" : "btn-light"}`}
                      onClick={() => setViewMode("table")} title="Vue tableau">
                      <i className="ri-list-check fs-15"></i>
                    </button>
                    <button className={`btn btn-sm btn-icon ${viewMode === "cards" ? "btn-primary" : "btn-light"}`}
                      onClick={() => setViewMode("cards")} title="Vue cartes">
                      <i className="ri-layout-grid-line fs-15"></i>
                    </button>
                  </div>
                </div>
              </div>

              {/* Filtres */}
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
                <div className="d-flex gap-2 flex-wrap align-items-center">
                  <div className="search-box flex-grow-1" style={{ maxWidth: 320 }}>
                    <input type="text" className="form-control form-control-sm"
                      placeholder="Rechercher username, nom, email…"
                      value={search} onChange={e => setSearch(e.target.value)} />
                    <i className="ri-search-line search-icon"></i>
                  </div>
                  <select className="form-select form-select-sm" style={{ width: "auto" }}
                    value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
                    <option value="all">Tous les sites</option>
                    {sites.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                  {(search || siteFilter !== "all") && (
                    <button className="btn btn-sm btn-soft-secondary"
                      onClick={() => { setSearch(""); setSiteFilter("all"); }}>
                      <i className="ri-close-line me-1"></i>Reset
                    </button>
                  )}
                  <div className="ms-auto d-flex gap-2">
                    {filtered.length > 0 && (
                      <button className="btn btn-sm btn-soft-success" onClick={exportCSV}>
                        <i className="ri-download-2-line me-1"></i>CSV
                      </button>
                    )}
                    <button className="btn btn-sm btn-soft-primary" onClick={load}>
                      <i className="ri-refresh-line"></i>
                    </button>
                  </div>
                </div>
              </div>

              {/* Contenu */}
              <div className="card-body p-0">
                {loading ? (
                  <div className="py-5"><LoadingSpinner text="Chargement des développeurs…" /></div>
                ) : filtered.length === 0 ? (
                  <EmptyState
                    icon={activeTab === "pending" ? "ri-time-line" : "ri-team-line"}
                    title={
                      activeTab === "pending" ? "Aucun développeur en attente" :
                      activeTab === "bots"    ? "Aucun bot enregistré" :
                      search                  ? "Aucun résultat" :
                      "Aucun développeur"
                    }
                    description={
                      search ? "Essayez avec d'autres critères." :
                      "Les développeurs sont créés automatiquement lors des extractions GitLab."
                    }
                    compact
                  />
                ) : viewMode === "cards" ? (
                  <>
                    <div className="row g-3 p-4">
                      {paginated.map(dev => {
                        const site    = sites.find(s => s.id === dev.site_id);
                        // ✅ FIX: is_validated (pas validated)
                        const isPending = dev.is_validated !== true && !dev.is_bot;
                        return (
                          <div key={dev.id} className="col-xl-4 col-md-6">
                            <div className="card border h-100" style={{ borderRadius: 12, boxShadow: "none" }}>
                              <div className="card-body d-flex flex-column gap-2">
                                <div className="d-flex align-items-start gap-3">
                                  <Avatar dev={dev} size={44} />
                                  <div className="flex-grow-1 min-w-0">
                                    <p className="fw-semibold mb-0 fs-13 text-truncate">{dev.name || dev.username}</p>
                                    <p className="text-muted fs-12 mb-2">@{dev.username}</p>
                                    <div className="d-flex flex-wrap gap-1">
                                      {dev.is_bot && <span className="badge fs-10" style={{ background: "#fef9c3", color: "#a16207" }}><i className="ri-robot-line me-1"></i>Bot</span>}
                                      {!dev.is_bot && (
                                        isPending
                                          ? <span className="badge fs-10" style={{ background: "#fef9c3", color: "#a16207" }}><i className="ri-time-line me-1"></i>En attente</span>
                                          : <span className="badge fs-10" style={{ background: "#dcfce7", color: "#15803d" }}><i className="ri-checkbox-circle-line me-1"></i>Validé</span>
                                      )}
                                      {site && <span className="badge fs-10" style={{ background: "#e0f2fe", color: "#0369a1" }}><i className="ri-map-pin-line me-1"></i>{site.name}</span>}
                                    </div>
                                  </div>
                                </div>
                                {dev.email && <p className="text-muted fs-12 mb-0 text-truncate"><i className="ri-mail-line me-1"></i>{dev.email}</p>}
                                <div className="mt-auto pt-2 border-top d-flex gap-1">
                                  {isPending && (
                                    <>
                                      <button className="btn btn-sm btn-soft-success flex-fill"
                                        onClick={() => setValidateTarget({ dev, action: "validate" })}>
                                        <i className="ri-check-line me-1"></i>Valider
                                      </button>
                                      <button className="btn btn-sm btn-soft-danger flex-fill"
                                        onClick={() => setValidateTarget({ dev, action: "reject" })}>
                                        <i className="ri-close-line me-1"></i>Rejeter
                                      </button>
                                    </>
                                  )}
                                  <button className="btn btn-sm btn-soft-primary" onClick={() => setEditDev(dev)}>
                                    <i className="ri-pencil-line"></i>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-4 pb-2">
                      <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead style={{ background: "#fafbfc" }}>
                          <tr>
                            <th className="ps-4 py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Développeur</th>
                            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Email</th>
                            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Site</th>
                            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Statut</th>
                            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Créé le</th>
                            <th className="pe-4 py-3 text-center text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map(dev => {
                            const site = sites.find(s => s.id === dev.site_id);
                            // ✅ FIX: is_validated
                            const isPending = dev.is_validated !== true && !dev.is_bot;
                            return (
                              <tr key={dev.id}>
                                <td className="ps-4 py-3">
                                  <div className="d-flex align-items-center gap-3">
                                    <Avatar dev={dev} size={36} />
                                    <div>
                                      <p className="fw-semibold mb-0 fs-13">{dev.name || dev.username}</p>
                                      <p className="text-muted mb-0 fs-11">@{dev.username}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="text-muted fs-12">{dev.email || "—"}</td>
                                <td>
                                  {site
                                    ? <span className="badge fs-11" style={{ background: "#e0f2fe", color: "#0369a1" }}><i className="ri-map-pin-line me-1"></i>{site.name}</span>
                                    : <span className="text-muted fs-12">—</span>
                                  }
                                </td>
                                <td>
                                  {dev.is_bot
                                    ? <span className="badge fs-11" style={{ background: "#fef9c3", color: "#a16207" }}><i className="ri-robot-line me-1"></i>Bot</span>
                                    : isPending
                                      ? <span className="badge fs-11" style={{ background: "#fef9c3", color: "#a16207" }}><i className="ri-time-line me-1"></i>En attente</span>
                                      : <span className="badge fs-11" style={{ background: "#dcfce7", color: "#15803d" }}><i className="ri-checkbox-circle-line me-1"></i>Validé</span>
                                  }
                                </td>
                                <td className="text-muted fs-12">{formatDate(dev.created_at)}</td>
                                <td className="pe-4 text-center">
                                  <div className="d-flex gap-1 justify-content-center">
                                    {isPending && (
                                      <>
                                        <button className="btn btn-sm btn-icon btn-soft-success"
                                          onClick={() => setValidateTarget({ dev, action: "validate" })}>
                                          <i className="ri-check-line fs-14"></i>
                                        </button>
                                        <button className="btn btn-sm btn-icon btn-soft-danger"
                                          onClick={() => setValidateTarget({ dev, action: "reject" })}>
                                          <i className="ri-close-line fs-14"></i>
                                        </button>
                                      </>
                                    )}
                                    <button className="btn btn-sm btn-icon btn-soft-primary"
                                      onClick={() => setEditDev(dev)}>
                                      <i className="ri-pencil-fill fs-14"></i>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2" style={{ borderTop: "1px solid #f0f2f5" }}>
                      <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Colonne Groupes */}
          <div className="col-xl-3">
            <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
              <div className="card-header bg-white d-flex align-items-center" style={{ borderBottom: "1px solid #f0f2f5" }}>
                <h6 className="mb-0 fw-semibold flex-grow-1">
                  <i className="ri-group-line me-2 text-primary"></i>Groupes ({groups.length})
                </h6>
                <button className="btn btn-sm btn-soft-primary" onClick={() => setEditGroup({})}>
                  <i className="ri-add-line"></i>
                </button>
              </div>
              <div className="card-body p-0">
                {groups.length === 0 ? (
                  <div className="text-center py-4 px-3">
                    <i className="ri-group-line fs-2 text-muted d-block mb-2 opacity-50"></i>
                    <p className="text-muted fs-13 mb-2">Aucun groupe</p>
                    <button className="btn btn-sm btn-soft-primary" onClick={() => setEditGroup({})}>
                      <i className="ri-add-line me-1"></i>Créer
                    </button>
                  </div>
                ) : (
                  <ul className="list-group list-group-flush">
                    {groups.map(group => {
                      const site        = sites.find(s => s.id === group.site_id);
                      const memberCount = developers.filter(d => d.group_id === group.id).length;
                      return (
                        <li key={group.id} className="list-group-item px-3 py-3">
                          <div className="d-flex align-items-start gap-2">
                            <div className="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle flex-shrink-0"
                              style={{ width: 32, height: 32 }}>
                              <i className="ri-group-line text-primary fs-14"></i>
                            </div>
                            <div className="flex-grow-1 min-w-0">
                              <p className="fw-semibold mb-1 fs-13 text-truncate">{group.name}</p>
                              <div className="d-flex flex-wrap gap-1">
                                {site && <span className="badge fs-10" style={{ background: "#e0f2fe", color: "#0369a1" }}>{site.name}</span>}
                                <span className="badge fs-10 bg-light text-muted border">{memberCount} membre{memberCount !== 1 ? "s" : ""}</span>
                              </div>
                            </div>
                            <div className="d-flex gap-1 flex-shrink-0">
                              <button className="btn btn-xs btn-icon btn-soft-primary" onClick={() => setEditGroup(group)}><i className="ri-pencil-fill fs-12"></i></button>
                              <button className="btn btn-xs btn-icon btn-soft-danger"  onClick={() => setDeleteGroup(group)}><i className="ri-delete-bin-fill fs-12"></i></button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Projets */}
            {projects.length > 0 && (
              <div className="card border-0 mt-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
                  <h6 className="mb-0 fw-semibold fs-13">
                    <i className="ri-folder-2-line me-2 text-muted"></i>Projets ({projects.length})
                  </h6>
                </div>
                <div className="card-body p-2">
                  <ul className="list-unstyled mb-0" style={{ maxHeight: 200, overflowY: "auto" }}>
                    {projects.slice(0, 15).map(proj => (
                      <li key={proj.id} className="d-flex align-items-center gap-2 px-2 py-1 rounded-2">
                        <i className="ri-folder-2-line text-primary fs-14"></i>
                        <span className="text-truncate fs-12 text-muted">{proj.name}</span>
                      </li>
                    ))}
                    {projects.length > 15 && (
                      <li className="text-center text-muted fs-11 py-1">+{projects.length - 15} autres</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {validateTarget && (
        <ValidateModal
          dev={validateTarget.dev}
          action={validateTarget.action}
          onClose={() => setValidateTarget(null)}
          onConfirm={handleValidateAction}
        />
      )}
      {editDev && <DevEditModal dev={editDev} sites={sites} onClose={() => setEditDev(null)} onSave={handleEditSave} />}
      {editGroup !== null && (
        <GroupModal
          group={editGroup?.id ? editGroup : null}
          sites={sites}
          onClose={() => setEditGroup(null)}
          onSave={handleGroupSave}
        />
      )}
      {deleteGroup && (
        <div className="modal fade show d-block"
          style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
          onClick={e => { if (e.target === e.currentTarget && !deleteGroupLoading) setDeleteGroup(null); }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0" style={{ borderRadius: 20 }}>
              <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
                <div className="d-flex align-items-center justify-content-center rounded-circle bg-danger-subtle flex-shrink-0" style={{ width: 48, height: 48 }}>
                  <i className="ri-delete-bin-line text-danger fs-22"></i>
                </div>
                <div>
                  <h5 className="fw-semibold mb-0 fs-15">Supprimer ce groupe ?</h5>
                  <p className="text-muted fs-12 mb-0">{deleteGroup.name}</p>
                </div>
                <button className="btn-close ms-auto" onClick={() => setDeleteGroup(null)} disabled={deleteGroupLoading} style={{ opacity: .4 }}></button>
              </div>
              <div className="px-4 py-4">
                <p className="text-muted fs-13 mb-0">
                  La suppression est <strong>irréversible</strong>. Les développeurs du groupe ne seront pas supprimés.
                </p>
              </div>
              <div className="d-flex justify-content-end gap-2 px-4 py-3"
                style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
                <button className="btn btn-sm btn-light px-4" onClick={() => setDeleteGroup(null)} disabled={deleteGroupLoading}>Annuler</button>
                <button className="btn btn-sm btn-danger px-4" onClick={() => handleDeleteGroup(deleteGroup.id)} disabled={deleteGroupLoading}>
                  {deleteGroupLoading ? <><span className="spinner-border spinner-border-sm me-2"></span>Suppression…</> : <><i className="ri-delete-bin-line me-1"></i>Supprimer</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
