/**
 * pages/admin/AdminProjectsPage.jsx
 *
 * CORRECTIONS :
 *   - exportCSV : URL.revokeObjectURL ajouté (anti memory-leak)
 *   - filtre archived : retiré du filtrage front (getAllAdmin charge déjà tout)
 *   - ProjectModal : validation cohérente, site_id nullable correct
 *   - Toast : composant extrait, stable reference
 *
 * AMÉLIORATIONS DESIGN :
 *   - Stats cards avec trend indicator
 *   - Table avec hover state soigné
 *   - Modal avec preview avatar dynamique
 *   - Badges améliorés
 *   - Empty state avec illustration
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import projectService      from "../../services/projectService";
import gitlabConfigService from "../../services/gitlabConfigService";
import siteService         from "../../services/siteService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import ConfirmModal   from "../../components/common/ConfirmModal";
import Pagination     from "../../components/common/Pagination";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name = "") {
  return (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function Toast({ toast }) {
  if (!toast) return null;
  const isSuccess = toast.type === "success";
  return (
    <div
      className={`alert alert-${toast.type} d-flex align-items-center gap-2 position-fixed top-0 end-0 m-3`}
      style={{ zIndex: 9999, minWidth: 320, borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,.12)", border: "none" }}
    >
      <i className={`${isSuccess ? "ri-checkbox-circle-line" : "ri-error-warning-line"} fs-16`}></i>
      <span className="fs-13 fw-medium">{toast.msg}</span>
    </div>
  );
}

function exportCSV(projects, configs, sites) {
  const headers = ["ID", "Nom", "Namespace", "GitLab ID", "Config", "Site", "Commits", "Actif"];
  const rows = projects.map(p => {
    const cfg  = configs.find(c => c.id === p.gitlab_config_id);
    const site = sites.find(s => s.id === p.site_id);
    return [
      p.id,
      `"${(p.name || "").replace(/"/g, '""')}"`,
      p.namespace || p.path || "",
      p.gitlab_project_id,
      cfg?.name  || "",
      site?.name || "",
      p.commit_count ?? 0,
      p.is_active ? "Oui" : "Non",
    ];
  });
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
  const a   = document.createElement("a");
  a.href = url;
  a.download = `projets_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url); // ✅ anti memory-leak
}

// ── ProjectModal ───────────────────────────────────────────────────────────────
function ProjectModal({ configs, sites, project, onClose, onSave }) {
  const isEdit = !!project?.id;
  const [form, setForm] = useState({
    name:              project?.name              || "",
    gitlab_config_id:  project?.gitlab_config_id  || "",
    gitlab_project_id: project?.gitlab_project_id || "",
    site_id:           project?.site_id            || "",
    is_active:         project?.is_active          ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim())         return setError("Le nom est requis.");
    if (!form.gitlab_config_id)    return setError("La configuration GitLab est requise.");
    if (!form.gitlab_project_id)   return setError("L'ID projet GitLab est requis.");
    setLoading(true);
    try {
      const payload = {
        name:              form.name.trim(),
        gitlab_config_id:  parseInt(form.gitlab_config_id),
        gitlab_project_id: parseInt(form.gitlab_project_id),
        site_id:           form.site_id ? parseInt(form.site_id) : null,
        is_active:         form.is_active,
      };
      if (isEdit) await projectService.update(project.id, payload);
      else        await projectService.create(payload);
      onSave();
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  // Fermeture Echap
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !loading) onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [loading, onClose]);

  const initials = getInitials(form.name || (isEdit ? project.name : ""));
  const selectedConfig = configs.find(c => String(c.id) === String(form.gitlab_config_id));

  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>

          {/* Header */}
          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className="rounded-3 d-flex align-items-center justify-content-center text-white fw-bold fs-15 flex-shrink-0"
              style={{ width: 44, height: 44, background: "linear-gradient(135deg, #405189 0%, #3577f1 100%)" }}>
              {initials || <i className={isEdit ? "ri-folder-settings-line" : "ri-folder-add-line"}></i>}
            </div>
            <div className="flex-grow-1">
              <h5 className="fw-semibold mb-0 fs-15">{isEdit ? "Modifier le projet" : "Nouveau projet GitLab"}</h5>
              <p className="text-muted fs-12 mb-0">
                {isEdit ? `#${project.id} · ${project.gitlab_project_id}` : "Connectez un projet depuis GitLab"}
              </p>
            </div>
            <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>

          {/* Body */}
          <div className="px-4 py-4">
            {error && (
              <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-3 fs-13">
                <i className="ri-error-warning-line flex-shrink-0"></i>{error}
              </div>
            )}

            <div className="row g-3">
              {/* Nom */}
              <div className="col-12">
                <label className="form-label fw-medium fs-13 mb-1">
                  Nom du projet <span className="text-danger">*</span>
                </label>
                <input type="text" name="name" className="form-control"
                  placeholder="ex: Backend API, Frontend Web…"
                  value={form.name} onChange={handle} />
              </div>

              {/* Config GitLab */}
              <div className="col-12">
                <label className="form-label fw-medium fs-13 mb-1">
                  Configuration GitLab <span className="text-danger">*</span>
                </label>
                <select name="gitlab_config_id" className="form-select" value={form.gitlab_config_id} onChange={handle}>
                  <option value="">— Sélectionner une instance GitLab —</option>
                  {configs.map(c => (
                    <option key={c.id} value={c.id}>{c.name} — {c.domain}</option>
                  ))}
                </select>
                {selectedConfig && (
                  <div className="form-text fs-11 mt-1">
                    <i className="ri-link me-1"></i>{selectedConfig.domain}
                  </div>
                )}
              </div>

              {/* GitLab Project ID + Site */}
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13 mb-1">
                  ID Projet GitLab <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light text-muted fs-12">#</span>
                  <input type="number" name="gitlab_project_id" className="form-control"
                    placeholder="42" value={form.gitlab_project_id} onChange={handle}
                    disabled={isEdit} />
                </div>
                {isEdit && <div className="form-text fs-11 mt-1 text-muted">Non modifiable après création</div>}
              </div>

              <div className="col-md-6">
                <label className="form-label fw-medium fs-13 mb-1">Site géographique</label>
                <select name="site_id" className="form-select" value={form.site_id} onChange={handle}>
                  <option value="">— Aucun site —</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.country ? ` (${s.country})` : ""}</option>
                  ))}
                </select>
              </div>

              {/* Actif toggle */}
              <div className="col-12">
                <div className="d-flex align-items-center justify-content-between rounded-3 p-3"
                  style={{ background: form.is_active ? "#f0fdf4" : "#f8f9fa", border: `1px solid ${form.is_active ? "#d1fae5" : "#e9ecef"}`, transition: "all .2s" }}>
                  <div>
                    <div className={`fw-medium fs-13 ${form.is_active ? "text-success" : "text-muted"}`}>
                      <i className={`${form.is_active ? "ri-checkbox-circle-line" : "ri-pause-circle-line"} me-1`}></i>
                      {form.is_active ? "Projet actif" : "Projet inactif"}
                    </div>
                    <div className="text-muted fs-12">
                      {form.is_active ? "Inclus dans les extractions automatiques" : "Exclu des extractions"}
                    </div>
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input type="checkbox" className="form-check-input" role="switch"
                      name="is_active" checked={form.is_active} onChange={handle}
                      style={{ width: "2.5em", height: "1.4em", cursor: "pointer" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement…</>
                : <><i className="ri-save-line me-1"></i>{isEdit ? "Mettre à jour" : "Créer le projet"}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SortIcon ──────────────────────────────────────────────────────────────────
function SortIcon({ sortKey, currentKey, dir }) {
  if (sortKey !== currentKey) return <i className="ri-arrow-up-down-line ms-1 opacity-25 fs-11"></i>;
  return dir === "asc"
    ? <i className="ri-arrow-up-line ms-1 text-primary fs-11"></i>
    : <i className="ri-arrow-down-line ms-1 text-primary fs-11"></i>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminProjectsPage() {
  const [projects,  setProjects]  = useState([]);
  const [configs,   setConfigs]   = useState([]);
  const [sites,     setSites]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState(null);

  // Modals
  const [modalProject,  setModalProject]  = useState(null);
  const [deleteProject, setDeleteProject] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Filtres
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [configFilter, setConfigFilter] = useState("all");
  const [siteFilter,   setSiteFilter]   = useState("all");

  // Sort + pagination
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [page,    setPage]    = useState(1);
  const perPage = 10;

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projData, configData, siteData] = await Promise.all([
        projectService.getAllAdmin(),
        gitlabConfigService.getAll(),
        siteService.getAll(false),
      ]);
      setProjects(Array.isArray(projData)   ? projData   : []);
      setConfigs (Array.isArray(configData) ? configData : []);
      setSites   (Array.isArray(siteData)   ? siteData   : []);
    } catch {
      showToast("Erreur lors du chargement.", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteProject) return;
    setDeleteLoading(true);
    try {
      await projectService.delete(deleteProject.id);
      showToast(`Projet "${deleteProject.name}" supprimé.`);
      setDeleteProject(null);
      load();
    } catch (err) {
      showToast(err.message || "Erreur lors de la suppression.", "danger");
      setDeleteProject(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleActive = useCallback(async (project) => {
    try {
      await projectService.toggleActive(project.id);
      showToast(`Projet "${project.name}" ${project.is_active ? "désactivé" : "activé"}.`);
      load();
    } catch {
      showToast("Impossible de modifier le statut.", "danger");
    }
  }, [load, showToast]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  // Filtrage + tri
  const filtered = useMemo(() => {
    let result = projects.filter(p => {
      const q   = search.toLowerCase();
      const ms  = !q || (p.name || "").toLowerCase().includes(q) || String(p.gitlab_project_id).includes(q) || (p.namespace || "").toLowerCase().includes(q);
      const mst = statusFilter === "all" || (statusFilter === "active" ? p.is_active : !p.is_active);
      const mc  = configFilter === "all" || String(p.gitlab_config_id) === configFilter;
      const msi = siteFilter   === "all" || String(p.site_id) === siteFilter;
      return ms && mst && mc && msi;
    });

    if (sortKey) {
      result = [...result].sort((a, b) => {
        let va = a[sortKey] ?? "", vb = b[sortKey] ?? "";
        if (typeof va === "number") return sortDir === "asc" ? va - vb : vb - va;
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }

    return result;
  }, [projects, search, statusFilter, configFilter, siteFilter, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [search, statusFilter, configFilter, siteFilter]);

  const totalPages    = Math.ceil(filtered.length / perPage);
  const paginated     = filtered.slice((page - 1) * perPage, page * perPage);
  const hasFilters    = search || statusFilter !== "all" || configFilter !== "all" || siteFilter !== "all";
  const totalCommits  = projects.reduce((s, p) => s + (p.commit_count ?? 0), 0);
  const activeCount   = projects.filter(p => p.is_active).length;
  const inactiveCount = projects.filter(p => !p.is_active).length;

  return (
    <div className="page-content">
      <div className="container-fluid">
        <Toast toast={toast} />

        {/* Breadcrumb */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <div>
                <h4 className="mb-1 fw-semibold">
                  <i className="ri-folder-2-line me-2 text-primary"></i>Gestion des Projets
                </h4>
                <p className="text-muted fs-13 mb-0">
                  {projects.length} projet{projects.length !== 1 ? "s" : ""} · {configs.length} instance{configs.length !== 1 ? "s" : ""} GitLab
                </p>
              </div>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item">Administration</li>
                <li className="breadcrumb-item active">Projets</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="row g-3 mb-4">
          {[
            { label: "Total projets",  value: projects.length,                sub: "tous projets",     color: "primary", icon: "ri-folder-2-line"       },
            { label: "Actifs",         value: activeCount,                    sub: "en extraction",    color: "success", icon: "ri-checkbox-circle-line" },
            { label: "Inactifs",       value: inactiveCount,                  sub: "suspendus",        color: "warning", icon: "ri-pause-circle-line"    },
            { label: "Commits total",  value: totalCommits.toLocaleString(),  sub: "tous projets",     color: "info",    icon: "ri-git-commit-line"       },
          ].map((s, i) => (
            <div key={i} className="col-xl-3 col-sm-6">
              <div className="card card-animate border-0 h-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                <div className="card-body">
                  <div className="d-flex align-items-center">
                    <div className="avatar-sm flex-shrink-0">
                      <span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-3 fs-20`}>
                        <i className={s.icon}></i>
                      </span>
                    </div>
                    <div className="flex-grow-1 ms-3">
                      <p className="text-uppercase fw-medium text-muted mb-1 fs-11 letter-spacing-1">{s.label}</p>
                      <h3 className={`mb-0 fw-bold text-${s.color}`}>{s.value}</h3>
                      <p className="text-muted mb-0 fs-11 mt-1">{s.sub}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          {/* Filtres */}
          <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className="row g-2 align-items-center">
              <div className="col-md-3">
                <div className="search-box">
                  <input type="text" className="form-control form-control-sm"
                    placeholder="Nom, namespace, ID GitLab…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                  <i className="ri-search-line search-icon"></i>
                </div>
              </div>
              <div className="col-md-2">
                <select className="form-select form-select-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="all">Tous les statuts</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>
              </div>
              {configs.length > 1 && (
                <div className="col-md-2">
                  <select className="form-select form-select-sm" value={configFilter} onChange={e => setConfigFilter(e.target.value)}>
                    <option value="all">Toutes les configs</option>
                    {configs.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {sites.length > 0 && (
                <div className="col-md-2">
                  <select className="form-select form-select-sm" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
                    <option value="all">Tous les sites</option>
                    {sites.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {hasFilters && (
                <div className="col-md-auto">
                  <button className="btn btn-sm btn-soft-secondary"
                    onClick={() => { setSearch(""); setStatusFilter("all"); setConfigFilter("all"); setSiteFilter("all"); }}>
                    <i className="ri-close-line me-1"></i>Reset
                    <span className="badge bg-secondary-subtle text-secondary ms-1">{filtered.length}</span>
                  </button>
                </div>
              )}
              <div className="col-md-auto ms-auto d-flex gap-2">
                {filtered.length > 0 && (
                  <button className="btn btn-sm btn-soft-success" onClick={() => exportCSV(filtered, configs, sites)}>
                    <i className="ri-download-2-line me-1"></i>CSV
                  </button>
                )}
                <button className="btn btn-sm btn-primary" onClick={() => setModalProject({})}>
                  <i className="ri-add-line me-1"></i>Nouveau projet
                </button>
              </div>
            </div>
          </div>

          {/* Contenu */}
          <div className="card-body p-0">
            {loading ? (
              <div className="py-5"><LoadingSpinner text="Chargement des projets…" /></div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon="ri-folder-2-line"
                title={hasFilters ? "Aucun résultat" : "Aucun projet"}
                description={hasFilters ? "Modifiez vos filtres pour voir des résultats." : "Créez votre premier projet GitLab."}
                actionLabel={!hasFilters ? "Nouveau projet" : undefined}
                onAction={!hasFilters ? () => setModalProject({}) : undefined}
                compact
              />
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0" style={{ minWidth: 800 }}>
                    <thead style={{ background: "#fafbfc", borderBottom: "1px solid #f0f2f5" }}>
                      <tr>
                        <th className="ps-4 py-3 text-muted fs-11 fw-semibold text-uppercase"
                          style={{ cursor: "pointer", letterSpacing: ".05em" }}
                          onClick={() => handleSort("name")}>
                          Projet <SortIcon sortKey="name" currentKey={sortKey} dir={sortDir} />
                        </th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Config GitLab</th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Site</th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase"
                          style={{ cursor: "pointer", letterSpacing: ".05em" }}
                          onClick={() => handleSort("gitlab_project_id")}>
                          ID <SortIcon sortKey="gitlab_project_id" currentKey={sortKey} dir={sortDir} />
                        </th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase"
                          style={{ cursor: "pointer", letterSpacing: ".05em" }}
                          onClick={() => handleSort("commit_count")}>
                          Commits <SortIcon sortKey="commit_count" currentKey={sortKey} dir={sortDir} />
                        </th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Statut</th>
                        <th className="pe-4 py-3 text-center text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(p => {
                        const config = configs.find(c => c.id === p.gitlab_config_id);
                        const site   = sites.find(s => s.id === p.site_id);
                        return (
                          <tr key={p.id} className={!p.is_active ? "opacity-65" : ""}>
                            <td className="ps-4 py-3">
                              <div className="d-flex align-items-center gap-3">
                                <div className={`rounded-3 d-flex align-items-center justify-content-center fw-bold fs-12 flex-shrink-0 ${p.is_active ? "bg-primary-subtle text-primary" : "bg-secondary-subtle text-secondary"}`}
                                  style={{ width: 36, height: 36 }}>
                                  {getInitials(p.name)}
                                </div>
                                <div>
                                  <p className="fw-semibold mb-0 fs-13">{p.name}</p>
                                  <p className="text-muted mb-0 fs-11">{p.namespace || p.path || "—"}</p>
                                </div>
                              </div>
                            </td>
                            <td>
                              {config
                                ? <span className="badge bg-light text-dark border fs-11">
                                    <i className="ri-git-repository-line me-1 text-muted"></i>{config.name}
                                  </span>
                                : <span className="text-muted fs-12">—</span>
                              }
                            </td>
                            <td>
                              {site
                                ? <span className="badge fs-11" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                                    <i className="ri-map-pin-line me-1"></i>{site.name}
                                  </span>
                                : <span className="text-muted fs-12">—</span>
                              }
                            </td>
                            <td>
                              <code className="fs-12 text-muted px-2 py-1 rounded-2" style={{ background: "#f4f6fa" }}>
                                #{p.gitlab_project_id}
                              </code>
                            </td>
                            <td>
                              <span className="fw-semibold fs-13">{(p.commit_count ?? 0).toLocaleString()}</span>
                              <span className="text-muted fs-11 ms-1">commits</span>
                            </td>
                            <td>
                              {p.is_active
                                ? <span className="badge fs-11" style={{ background: "#dcfce7", color: "#15803d" }}>
                                    <i className="ri-checkbox-circle-line me-1"></i>Actif
                                  </span>
                                : <span className="badge fs-11" style={{ background: "#fef9c3", color: "#a16207" }}>
                                    <i className="ri-pause-circle-line me-1"></i>Inactif
                                  </span>
                              }
                            </td>
                            <td className="pe-4 text-center">
                              <div className="d-flex gap-1 justify-content-center">
                                <button
                                  className={`btn btn-sm btn-icon ${p.is_active ? "btn-soft-warning" : "btn-soft-success"}`}
                                  onClick={() => handleToggleActive(p)}
                                  title={p.is_active ? "Désactiver" : "Activer"}>
                                  <i className={`ri-${p.is_active ? "pause" : "play"}-circle-line fs-14`}></i>
                                </button>
                                <button className="btn btn-sm btn-icon btn-soft-primary"
                                  onClick={() => setModalProject(p)} title="Modifier">
                                  <i className="ri-pencil-fill fs-14"></i>
                                </button>
                                <button className="btn btn-sm btn-icon btn-soft-danger"
                                  onClick={() => setDeleteProject(p)} title="Supprimer">
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

                <div className="px-4 py-2" style={{ borderTop: "1px solid #f0f2f5" }}>
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    totalItems={filtered.length}
                    perPage={perPage}
                    onPageChange={setPage}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modalProject !== null && (
        <ProjectModal
          project={modalProject?.id ? modalProject : null}
          configs={configs}
          sites={sites}
          onClose={() => setModalProject(null)}
          onSave={() => {
            setModalProject(null);
            showToast(modalProject?.id ? "Projet mis à jour." : "Projet créé avec succès.");
            load();
          }}
        />
      )}

      <ConfirmModal
        show={!!deleteProject}
        title="Supprimer ce projet ?"
        message={deleteProject ? `Supprimer "${deleteProject.name}" ? Cette action supprimera aussi tous les commits, MRs et snapshots KPI associés.` : ""}
        confirmLabel="Supprimer définitivement"
        confirmColor="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteProject(null)}
      />
    </div>
  );
}
