import { useState, useEffect, useMemo, useCallback } from "react";
import projectService     from "../../services/projectService";
import developerService   from "../../services/developerService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import ConfirmModal   from "../../components/common/ConfirmModal";
import Pagination     from "../../components/common/Pagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name = "") {
  return (name || "?").split(/[\s._-]/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const SITE_COLORS = ["primary","success","info","warning","danger","secondary"];
const siteColor = (site = "") => {
  let h = 0;
  for (let i = 0; i < site.length; i++) h = site.charCodeAt(i) + ((h << 5) - h);
  return SITE_COLORS[Math.abs(h) % SITE_COLORS.length];
};

function exportDevCSV(developers, projectName) {
  const headers = ["ID","Username","Nom","Email","Site","Groupe ID"];
  const rows = developers.map(d => [
    d.id,
    d.username || "",
    `"${(d.name  || "").replace(/"/g,'""')}"`,
    d.email    || "",
    d.site     || "",
    d.group_id || "",
  ]);
  const csv  = [headers, ...rows].map(r => r.join(",")).join("\n");
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = `developpeurs_${projectName || "projet"}.csv`;
  a.click();
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className={`alert alert-${toast.type} d-flex align-items-center gap-2 position-fixed top-0 end-0 m-3 shadow`}
      style={{ zIndex: 9999, minWidth: 300, borderRadius: 10 }}
    >
      <i className={toast.type === "success" ? "ri-checkbox-circle-line fs-16" : "ri-error-warning-line fs-16"}></i>
      <span>{toast.msg}</span>
    </div>
  );
}

// ─── Modal Groupe ─────────────────────────────────────────────────────────────
function GroupModal({ projects, onClose, onSave }) {
  const [form,    setForm]    = useState({ name: "", site: "", project_id: projects[0]?.id || "" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async () => {
    setError("");
    if (!form.name.trim())  return setError("Le nom du groupe est requis.");
    if (!form.site.trim())  return setError("Le site est requis.");
    if (!form.project_id)   return setError("Le projet est requis.");
    setLoading(true);
    try {
      await developerService.createGroup({
        name:       form.name,
        site:       form.site,
        project_id: parseInt(form.project_id),
      });
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de la création.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)", zIndex: 1055 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 500 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center justify-content-between">
              <h5 className="fw-semibold text-dark mb-0 fs-15">
                <i className="ri-group-line me-2 text-primary"></i>Nouveau groupe de développeurs
              </h5>
              <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: 0.5 }}></button>
            </div>
          </div>
          <div className="px-4 py-4">
            {error && (
              <div className="alert alert-danger py-2 fs-13 mb-3">
                <i className="ri-error-warning-line me-1"></i>{error}
              </div>
            )}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Nom du groupe <span className="text-danger">*</span></label>
                <input type="text" name="name" className="form-control"
                  placeholder="ex: Équipe Backend Paris" value={form.name} onChange={handle} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Site <span className="text-danger">*</span></label>
                <input type="text" name="site" className="form-control"
                  placeholder="ex: Paris, Lyon, Tunis..." value={form.site} onChange={handle} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Projet <span className="text-danger">*</span></label>
                <select name="project_id" className="form-select" value={form.project_id} onChange={handle}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 d-flex justify-content-end gap-2"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Création...</>
                : <><i className="ri-add-line me-1"></i>Créer le groupe</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Developer Edit ─────────────────────────────────────────────────────
function DevEditModal({ developer, groups, onClose, onSave }) {
  const [form,    setForm]    = useState({
    group_id: developer.group_id ? String(developer.group_id) : "",
    name:     developer.name     || "",
    email:    developer.email    || "",
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // Site déduit automatiquement du groupe sélectionné
  const derivedSite = groups.find(g => String(g.id) === String(form.group_id))?.site || "—";

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      await developerService.update(developer.id, {
        group_id: form.group_id ? parseInt(form.group_id) : null,
        name:     form.name  || null,
        email:    form.email || null,
        // site supprimé — dérivé du groupe côté backend
      });
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  const aColor = siteColor(developer.site || "");

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)", zIndex: 1055 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14"
                style={{ width: 44, height: 44, background: "linear-gradient(135deg,#405189,#3577f1)" }}
              >
                {getInitials(developer.name || developer.username)}
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-0 fs-15">{developer.username}</h5>
                <div className="d-flex align-items-center gap-2 mt-1">
                  {developer.site && (
                    <span className={`badge bg-${aColor}-subtle text-${aColor} fs-11`}>
                      <i className="ri-map-pin-2-line me-1"></i>{developer.site}
                    </span>
                  )}
                  <span className="text-muted fs-12">ID #{developer.id}</span>
                </div>
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
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Nom complet</label>
                <input type="text" name="name" className="form-control"
                  placeholder="Nom complet" value={form.name} onChange={handle} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Email</label>
                <input type="email" name="email" className="form-control"
                  placeholder="email@example.com" value={form.email} onChange={handle} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Groupe</label>
                <select name="group_id" className="form-select" value={form.group_id} onChange={handle}>
                  <option value="">-- Aucun groupe --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.site})</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Site</label>
                <input
                  type="text"
                  className="form-control bg-light text-muted"
                  readOnly
                  value={derivedSite}
                  title="Le site est défini automatiquement par le groupe"
                />
                <div className="form-text fs-11 text-muted">
                  <i className="ri-info-line me-1"></i>Défini par le groupe
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 d-flex justify-content-end gap-2"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement...</>
                : <><i className="ri-save-line me-1"></i>Enregistrer</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Developer Detail Modal ───────────────────────────────────────────────────
function DevDetailModal({ developer, groups, onClose, onEdit }) {
  if (!developer) return null;
  const color = siteColor(developer.site || "");
  const group = groups.find((g) => g.id === developer.group_id);

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)", zIndex: 1055 }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14"
                style={{ width: 48, height: 48, background: "linear-gradient(135deg,#405189,#3577f1)" }}
              >
                {getInitials(developer.name || developer.username)}
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-0 fs-15">
                  {developer.name || developer.username}
                </h5>
                <code className="fs-12 text-muted">{developer.username}</code>
              </div>
              <button className="btn-close flex-shrink-0" onClick={onClose} style={{ opacity: 0.5 }}></button>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="row g-3">
              {[
                { icon: "ri-hashtag",         label: "ID",        value: `#${developer.id}` },
                { icon: "ri-user-line",        label: "Username",  value: developer.username || "—" },
                { icon: "ri-mail-line",        label: "Email",     value: developer.email    || "—" },
                { icon: "ri-map-pin-2-line",   label: "Site",      value: developer.site     || "—",
                  badge: developer.site ? { color, text: developer.site } : null },
                { icon: "ri-group-line",       label: "Groupe",    value: group?.name        || "—" },
                { icon: "ri-fingerprint-line", label: "GitLab ID", value: developer.gitlab_user_id || "—" },
              ].map((item, i) => (
                <div key={i} className="col-6">
                  <div className="rounded-3 p-3" style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}>
                    <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.8, marginBottom: 4 }}>
                      <i className={`${item.icon} me-1`}></i>{item.label}
                    </div>
                    {item.badge ? (
                      <span className={`badge bg-${item.badge.color}-subtle text-${item.badge.color} fs-12`}>
                        {item.badge.text}
                      </span>
                    ) : (
                      <div className="fw-semibold text-dark fs-13">{item.value}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 py-3 d-flex justify-content-between align-items-center"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              <i className="ri-user-line me-1"></i>Développeur #{developer.id}
            </span>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-light px-3" onClick={onClose}>Fermer</button>
              <button className="btn btn-sm btn-primary px-3" onClick={() => onEdit(developer)}>
                <i className="ri-pencil-line me-1"></i>Modifier
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DevelopersPage() {
  const [projects,       setProjects]       = useState([]);
  const [selectedProj,   setSelectedProj]   = useState("");
  const [developers,     setDevelopers]     = useState([]);
  const [groups,         setGroups]         = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [search,         setSearch]         = useState("");
  const [siteFilter,     setSiteFilter]     = useState("all");
  const [groupFilter,    setGroupFilter]    = useState("all");
  const [activeTab,      setActiveTab]      = useState("developers");
  const [editDev,        setEditDev]        = useState(null);
  const [detailDev,      setDetailDev]      = useState(null);
  const [deleteGroup,    setDeleteGroup]    = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [deleteLoading,  setDeleteLoading]  = useState(false);
  const [toast,          setToast]          = useState(null);
  const [page,           setPage]           = useState(1);
  const [sortKey,        setSortKey]        = useState(null);
  const [sortDir,        setSortDir]        = useState("asc");
  const perPage = 10;

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    projectService.getAll().then((data) => {
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      setProjects(list);
      if (list.length > 0) setSelectedProj(String(list[0].id));
    });
  }, []);

  const load = useCallback(() => {
    if (!selectedProj) return;
    setLoading(true);
    const projId = parseInt(selectedProj);
    Promise.all([
      developerService.getAll(projId),
      developerService.getGroups(projId),
    ])
      .then(([devs, grps]) => { setDevelopers(devs); setGroups(grps); })
      .catch(() => showToast("Erreur chargement des données.", "danger"))
      .finally(() => setLoading(false));
  }, [selectedProj, showToast]);

  useEffect(() => { load(); }, [load]);

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

  const handleDeleteGroup = async () => {
    if (!deleteGroup) return;
    setDeleteLoading(true);
    try {
      await developerService.deleteGroup(deleteGroup.id);
      setDeleteGroup(null);
      showToast("Groupe supprimé.");
      load();
    } catch (err) {
      setDeleteGroup(null);
      showToast(err.response?.data?.detail || "Erreur suppression.", "danger");
    } finally {
      setDeleteLoading(false);
    }
  };

  const sites = useMemo(() =>
    [...new Set(developers.map((d) => d.site).filter(Boolean))].sort(),
  [developers]);

  const filtered = useMemo(() => {
    let result = developers.filter((d) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (d.username || "").toLowerCase().includes(q) ||
        (d.name     || "").toLowerCase().includes(q) ||
        (d.email    || "").toLowerCase().includes(q);
      const matchSite  = siteFilter  === "all" || d.site     === siteFilter;
      const matchGroup = groupFilter === "all" || String(d.group_id) === groupFilter;
      return matchSearch && matchSite && matchGroup;
    });
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const va = (a[sortKey] || "").toString().toLowerCase();
        const vb = (b[sortKey] || "").toString().toLowerCase();
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return result;
  }, [developers, search, siteFilter, groupFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  const siteStats = useMemo(() =>
    sites.map((site) => ({
      site,
      count:     developers.filter((d) => d.site === site).length,
      withGroup: developers.filter((d) => d.site === site && d.group_id).length,
    })),
  [sites, developers]);

  const selectedProject = projects.find(p => String(p.id) === selectedProj);

  return (
    <div className="page-content">
      <div className="container-fluid">

        <Toast toast={toast} />

        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-team-line me-2 text-primary"></i>Développeurs & Sites
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item active">Développeurs</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="row g-3 mb-4 align-items-end">
          <div className="col-md-4">
            <label className="form-label fw-medium">Projet</label>
            <select
              className="form-select"
              value={selectedProj}
              onChange={(e) => { setSelectedProj(e.target.value); setPage(1); setSiteFilter("all"); setGroupFilter("all"); }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-auto d-flex gap-2">
            <button className="btn btn-primary" onClick={() => setShowGroupModal(true)} disabled={!selectedProj}>
              <i className="ri-group-line me-1"></i>Nouveau groupe
            </button>
            {developers.length > 0 && (
              <button className="btn btn-soft-success"
                onClick={() => exportDevCSV(filtered, selectedProject?.name)}
                title="Exporter la liste filtrée en CSV">
                <i className="ri-download-2-line me-1"></i>CSV
              </button>
            )}
          </div>
        </div>

        {siteStats.length > 0 && (
          <div className="row mb-4">
            {siteStats.map((s) => {
              const color = siteColor(s.site);
              const pct   = s.count > 0 ? Math.round((s.withGroup / s.count) * 100) : 0;
              return (
                <div key={s.site} className="col-xl-3 col-sm-6">
                  <div className="card card-animate" style={{ cursor: "pointer" }}
                    onClick={() => { setSiteFilter(sf => sf === s.site ? "all" : s.site); setPage(1); setActiveTab("developers"); }}>
                    <div className="card-body">
                      <div className="d-flex align-items-center">
                        <div className="avatar-sm flex-shrink-0">
                          <span className={`avatar-title bg-${color}-subtle text-${color} rounded-2 fs-2`}>
                            <i className="ri-map-pin-2-line"></i>
                          </span>
                        </div>
                        <div className="flex-grow-1 ms-3">
                          <p className="text-uppercase fw-medium text-muted mb-1 fs-12">Site</p>
                          <h4 className="mb-0">{s.site}</h4>
                          <p className="text-muted mb-0 fs-12">{s.count} dev(s)</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="d-flex justify-content-between mb-1" style={{ fontSize: 11, color: "#9ca3af" }}>
                          <span>Assignés à un groupe</span>
                          <span className={`fw-semibold text-${color}`}>{s.withGroup}/{s.count}</span>
                        </div>
                        <div style={{ height: 4, background: "#f1f5f9", borderRadius: 99 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: `var(--vz-${color})`, borderRadius: 99, transition: "width .5s" }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="col-xl-3 col-sm-6">
              <div className="card card-animate">
                <div className="card-body">
                  <div className="d-flex align-items-center">
                    <div className="avatar-sm flex-shrink-0">
                      <span className="avatar-title bg-primary-subtle text-primary rounded-2 fs-2">
                        <i className="ri-team-line"></i>
                      </span>
                    </div>
                    <div className="flex-grow-1 ms-3">
                      <p className="text-uppercase fw-medium text-muted mb-1 fs-12">Total</p>
                      <h4 className="mb-0">{developers.length}</h4>
                      <p className="text-muted mb-0 fs-12">{sites.length} site(s) · {groups.length} groupe(s)</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="d-flex justify-content-between mb-1" style={{ fontSize: 11, color: "#9ca3af" }}>
                      <span>Assignés à un groupe</span>
                      <span className="fw-semibold text-primary">
                        {developers.filter(d => d.group_id).length}/{developers.length}
                      </span>
                    </div>
                    <div style={{ height: 4, background: "#f1f5f9", borderRadius: 99 }}>
                      <div style={{
                        height: "100%",
                        width: `${developers.length ? Math.round(developers.filter(d => d.group_id).length / developers.length * 100) : 0}%`,
                        background: "var(--vz-primary)", borderRadius: 99, transition: "width .5s",
                      }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <ul className="nav nav-tabs-custom card-header-tabs border-bottom-0">
              <li className="nav-item">
                <button className={`nav-link ${activeTab === "developers" ? "active" : ""}`} onClick={() => setActiveTab("developers")}>
                  <i className="ri-user-line me-1"></i>Développeurs
                  <span className="badge bg-primary-subtle text-primary ms-2">{developers.length}</span>
                </button>
              </li>
              <li className="nav-item">
                <button className={`nav-link ${activeTab === "groups" ? "active" : ""}`} onClick={() => setActiveTab("groups")}>
                  <i className="ri-group-line me-1"></i>Groupes
                  <span className="badge bg-success-subtle text-success ms-2">{groups.length}</span>
                </button>
              </li>
            </ul>
          </div>

          <div className="card-body">
            {loading ? (
              <LoadingSpinner text="Chargement..." />
            ) : (
              <>
                {activeTab === "developers" && (
                  <>
                    <div className="row g-2 mb-3 align-items-center">
                      <div className="col-md-4">
                        <div className="search-box">
                          <input type="text" className="form-control"
                            placeholder="Rechercher par nom, username, email..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                          <i className="ri-search-line search-icon"></i>
                        </div>
                      </div>
                      <div className="col-md-2">
                        <select className="form-select" value={siteFilter}
                          onChange={(e) => { setSiteFilter(e.target.value); setPage(1); }}>
                          <option value="all">Tous les sites</option>
                          {sites.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="col-md-2">
                        <select className="form-select" value={groupFilter}
                          onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}>
                          <option value="all">Tous les groupes</option>
                          <option value="">Sans groupe</option>
                          {groups.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                        </select>
                      </div>
                      <div className="col-md-auto ms-auto">
                        <span className="text-muted fs-13">
                          <strong>{filtered.length}</strong> développeur{filtered.length > 1 ? "s" : ""}
                          {(siteFilter !== "all" || groupFilter !== "all" || search) && (
                            <button className="btn btn-xs btn-soft-danger ms-2"
                              style={{ fontSize: 10, padding: "2px 8px" }}
                              onClick={() => { setSearch(""); setSiteFilter("all"); setGroupFilter("all"); setPage(1); }}>
                              <i className="ri-close-line me-1"></i>Reset
                            </button>
                          )}
                        </span>
                      </div>
                    </div>

                    {filtered.length === 0 ? (
                      <EmptyState icon="ri-user-line" title="Aucun développeur"
                        description="Les développeurs sont créés automatiquement lors des extractions GitLab." compact />
                    ) : (
                      <>
                        <div className="table-responsive">
                          <table className="table table-hover align-middle table-nowrap mb-0">
                            <thead className="table-light">
                              <tr>
                                <th style={{ cursor: "pointer" }} onClick={() => handleSort("name")}>
                                  Développeur<SortIcon k="name" />
                                </th>
                                <th style={{ cursor: "pointer" }} onClick={() => handleSort("username")}>
                                  Username<SortIcon k="username" />
                                </th>
                                <th style={{ cursor: "pointer" }} onClick={() => handleSort("email")}>
                                  Email<SortIcon k="email" />
                                </th>
                                <th style={{ cursor: "pointer" }} onClick={() => handleSort("site")}>
                                  Site<SortIcon k="site" />
                                </th>
                                <th>Groupe</th>
                                <th className="text-center">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginated.map((dev) => {
                                const color = siteColor(dev.site || "");
                                const group = groups.find((g) => g.id === dev.group_id);
                                return (
                                  <tr key={dev.id} style={{ cursor: "pointer" }} onClick={() => setDetailDev(dev)}>
                                    <td>
                                      <div className="d-flex align-items-center gap-2">
                                        <div
                                          className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center bg-${color}-subtle text-${color} fw-bold fs-12 flex-shrink-0`}
                                          style={{ minWidth: 32, height: 32 }}
                                        >
                                          {getInitials(dev.name || dev.username)}
                                        </div>
                                        <div>
                                          <p className="fw-semibold mb-0 fs-13">{dev.name || dev.username}</p>
                                          <p className="text-muted mb-0 fs-11">ID #{dev.id}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td><code className="fs-12">{dev.username}</code></td>
                                    <td className="text-muted fs-13">{dev.email || "—"}</td>
                                    <td>
                                      {dev.site ? (
                                        <span className={`badge bg-${color}-subtle text-${color}`}>
                                          <i className="ri-map-pin-2-line me-1"></i>{dev.site}
                                        </span>
                                      ) : (
                                        <span className="text-muted fs-12">—</span>
                                      )}
                                    </td>
                                    <td className="text-muted fs-13">
                                      {group ? (
                                        <span className="badge bg-light text-dark">
                                          <i className="ri-group-line me-1"></i>{group.name}
                                        </span>
                                      ) : (
                                        <span className="text-muted fs-12">—</span>
                                      )}
                                    </td>
                                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                                      <button className="btn btn-sm btn-soft-primary btn-icon"
                                        onClick={() => setEditDev(dev)} title="Modifier">
                                        <i className="ri-pencil-fill fs-14"></i>
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <Pagination page={page} totalPages={totalPages} totalItems={filtered.length}
                          perPage={perPage} onPageChange={setPage} />
                      </>
                    )}
                  </>
                )}

                {activeTab === "groups" && (
                  <>
                    {groups.length === 0 ? (
                      <EmptyState icon="ri-group-line" title="Aucun groupe"
                        description="Créez des groupes pour organiser vos développeurs par site."
                        actionLabel="Nouveau groupe" onAction={() => setShowGroupModal(true)} compact />
                    ) : (
                      <div className="row g-3">
                        {groups.map((group) => {
                          const color    = siteColor(group.site || "");
                          const devs     = developers.filter((d) => d.group_id === group.id);
                          const devCount = devs.length;
                          return (
                            <div key={group.id} className="col-xl-4 col-md-6">
                              <div className="card border h-100 mb-0">
                                <div className="card-body">
                                  <div className="d-flex align-items-start justify-content-between mb-3">
                                    <div className="d-flex align-items-center gap-2">
                                      <div className={`avatar-sm rounded d-flex align-items-center justify-content-center bg-${color}-subtle text-${color}`}>
                                        <i className="ri-group-line fs-4"></i>
                                      </div>
                                      <div>
                                        <h6 className="fw-semibold mb-0">{group.name}</h6>
                                        <p className="text-muted mb-0 fs-12">
                                          <i className="ri-map-pin-2-line me-1"></i>{group.site}
                                        </p>
                                      </div>
                                    </div>
                                    <button className="btn btn-sm btn-soft-danger btn-icon"
                                      onClick={() => setDeleteGroup(group)} title="Supprimer">
                                      <i className="ri-delete-bin-fill fs-14"></i>
                                    </button>
                                  </div>
                                  {devCount > 0 && (
                                    <div className="d-flex align-items-center gap-1 mb-3 flex-wrap">
                                      {devs.slice(0, 5).map((d) => (
                                        <div key={d.id}
                                          className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center bg-${color}-subtle text-${color} fw-bold fs-11`}
                                          style={{ minWidth: 28, height: 28 }} title={d.name || d.username}>
                                          {getInitials(d.name || d.username)}
                                        </div>
                                      ))}
                                      {devCount > 5 && (
                                        <span className="badge bg-light text-muted fs-11">+{devCount - 5}</span>
                                      )}
                                    </div>
                                  )}
                                  <div className="d-flex align-items-center justify-content-between">
                                    <span className="text-muted fs-13">
                                      <i className="ri-user-line me-1"></i>{devCount} développeur{devCount > 1 ? "s" : ""}
                                    </span>
                                    <span className={`badge bg-${color}-subtle text-${color}`}>{group.site}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showGroupModal && (
        <GroupModal projects={projects}
          onClose={() => setShowGroupModal(false)}
          onSave={() => { setShowGroupModal(false); showToast("Groupe créé."); load(); }} />
      )}

      {detailDev && !editDev && (
        <DevDetailModal developer={detailDev} groups={groups}
          onClose={() => setDetailDev(null)}
          onEdit={(dev) => { setDetailDev(null); setEditDev(dev); }} />
      )}

      {editDev && (
        <DevEditModal developer={editDev} groups={groups}
          onClose={() => setEditDev(null)}
          onSave={() => { setEditDev(null); showToast("Développeur mis à jour."); load(); }} />
      )}

      <ConfirmModal
        show={!!deleteGroup}
        title="Supprimer ce groupe ?"
        message={deleteGroup ? `Supprimer le groupe "${deleteGroup.name}" (${deleteGroup.site}) ?` : ""}
        confirmLabel="Supprimer" confirmColor="danger" loading={deleteLoading}
        onConfirm={handleDeleteGroup}
        onClose={() => setDeleteGroup(null)} />
    </div>
  );
}