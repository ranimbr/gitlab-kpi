import { useEffect, useState, useCallback, useMemo } from "react";
import projectService from "../../services/projectService";
import gitlabConfigService from "../../services/gitlabConfigService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import ConfirmModal from "../../components/common/ConfirmModal";
import Pagination from "../../components/common/Pagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name = "") {
  return (name || "?").split(/[\s._-]/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

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

// [NEW] Export CSV
function exportCSV(projects, configs) {
  const headers = ["ID","Nom","Namespace","GitLab Project ID","Config GitLab","Commits","Contributeurs","Actif"];
  const rows = projects.map(p => {
    const cfg = configs.find(c => c.id === p.gitlab_config_id);
    return [
      p.id,
      `"${(p.name || "").replace(/"/g,'""')}"`,
      p.namespace || "",
      p.gitlab_project_id,
      cfg?.name || "",
      p.commit_count ?? 0,
      p.contributor_count ?? 0,
      p.is_active ? "Oui" : "Non",
    ];
  });
  const csv  = [headers, ...rows].map(r => r.join(",")).join("\n");
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = `projets_admin.csv`;
  a.click();
}

// ─── Modal Projet (style sobre cohérent) ─────────────────────────────────────
function ProjectModal({ configs, project, onClose, onSave }) {
  const [form, setForm] = useState({
    name:              project?.name              || "",
    gitlab_config_id:  project?.gitlab_config_id  || "",
    gitlab_project_id: project?.gitlab_project_id || "",
    is_active:         project?.is_active         ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim())       return setError("Le nom du projet est requis.");
    if (!form.gitlab_config_id)  return setError("La configuration GitLab est requise.");
    if (!form.gitlab_project_id) return setError("Le Project ID GitLab est requis.");
    setLoading(true);
    try {
      const payload = {
        name:              form.name,
        gitlab_config_id:  parseInt(form.gitlab_config_id),
        gitlab_project_id: parseInt(form.gitlab_project_id),
        is_active:         form.is_active,
      };
      if (project) await projectService.update(project.id, payload);
      else         await projectService.create(payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  const isEdit = !!project?.id;

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)", zIndex: 1055 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>

          {/* Header */}
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-3">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center text-white fs-16 flex-shrink-0"
                  style={{ width: 40, height: 40, background: "linear-gradient(135deg,#405189,#3577f1)" }}
                >
                  <i className={isEdit ? "ri-folder-settings-line" : "ri-folder-add-line"}></i>
                </div>
                <h5 className="fw-semibold text-dark mb-0 fs-15">
                  {isEdit ? "Modifier le projet" : "Nouveau projet"}
                </h5>
              </div>
              <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: 0.5 }}></button>
            </div>
          </div>

          {/* Body */}
          <div className="px-4 py-4">
            {error && (
              <div className="alert alert-danger py-2 fs-13 mb-3">
                <i className="ri-error-warning-line me-1"></i>{error}
              </div>
            )}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label fw-medium fs-13">
                  Nom du projet <span className="text-danger">*</span>
                </label>
                <input
                  type="text" name="name" className="form-control"
                  placeholder="ex: Backend API"
                  value={form.name} onChange={handle}
                />
              </div>

              <div className="col-12">
                <label className="form-label fw-medium fs-13">
                  Configuration GitLab <span className="text-danger">*</span>
                </label>
                <select name="gitlab_config_id" className="form-select" value={form.gitlab_config_id} onChange={handle}>
                  <option value="">-- Sélectionner une configuration --</option>
                  {configs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} — {c.domain}</option>
                  ))}
                </select>
              </div>

              <div className="col-12">
                <label className="form-label fw-medium fs-13">
                  Project ID GitLab <span className="text-danger">*</span>
                </label>
                <input
                  type="number" name="gitlab_project_id" className="form-control"
                  placeholder="ex: 42"
                  value={form.gitlab_project_id} onChange={handle}
                />
                <div className="form-text">
                  <i className="ri-information-line me-1"></i>
                  GitLab → Projet → Paramètres → Général
                </div>
              </div>

              <div className="col-12">
                <div
                  className="rounded-3 p-3 d-flex align-items-center justify-content-between"
                  style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}
                >
                  <div>
                    <div className="fw-medium fs-13">Projet actif</div>
                    <div className="text-muted fs-12">
                      Un projet inactif est exclu des extractions automatiques
                    </div>
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input
                      type="checkbox" className="form-check-input" role="switch"
                      name="is_active" id="is_active"
                      checked={form.is_active} onChange={handle}
                      style={{ width: "2.5em", height: "1.4em", cursor: "pointer" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 d-flex justify-content-end gap-2"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement...</>
                : <><i className="ri-save-line me-1"></i>Enregistrer</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── [NEW] Modal détail projet ────────────────────────────────────────────────
function ProjectDetailModal({ project, configs, onClose, onEdit, onToggle }) {
  if (!project) return null;
  const config = configs.find((c) => c.id === project.gitlab_config_id);

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)", zIndex: 1055 }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 500 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>

          {/* Header */}
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold fs-14 flex-shrink-0"
                style={{ width: 48, height: 48, background: "linear-gradient(135deg,#405189,#3577f1)" }}
              >
                {getInitials(project.name)}
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-0 fs-15" style={{ wordBreak: "break-word" }}>
                  {project.name}
                </h5>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <span className={`badge fs-11 ${project.is_active ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}>
                    {project.is_active ? "✓ Actif" : "⏸ Inactif"}
                  </span>
                  {project.namespace && (
                    <span className="text-muted fs-12">
                      <i className="ri-folder-line me-1"></i>{project.namespace}
                    </span>
                  )}
                </div>
              </div>
              <button className="btn-close flex-shrink-0" onClick={onClose} style={{ opacity: 0.5 }}></button>
            </div>
          </div>

          {/* Grille infos */}
          <div className="px-4 py-4">
            <div className="row g-3 mb-4">
              {[
                { icon: "ri-hashtag",            label: "ID interne",       value: `#${project.id}` },
                { icon: "ri-git-repository-line", label: "GitLab Project ID",value: project.gitlab_project_id },
                { icon: "ri-settings-4-line",     label: "Config GitLab",    value: config ? `${config.name} — ${config.domain}` : "—" },
                { icon: "ri-folder-line",         label: "Namespace",        value: project.namespace || project.path || "—" },
                { icon: "ri-git-commit-line",      label: "Commits",          value: (project.commit_count ?? 0).toLocaleString() },
                { icon: "ri-team-line",            label: "Contributeurs",    value: project.contributor_count ?? 0 },
              ].map((item, i) => (
                <div key={i} className="col-6">
                  <div className="rounded-3 p-3" style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}>
                    <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.8, marginBottom: 4 }}>
                      <i className={`${item.icon} me-1`}></i>{item.label}
                    </div>
                    <div className="fw-semibold text-dark fs-13">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Barre activité */}
            <div
              className="rounded-3 p-3 d-flex align-items-center justify-content-between"
              style={{
                background: project.is_active ? "#f0fdf4" : "#fef9f0",
                border: `1px solid ${project.is_active ? "#d1fae5" : "#fde68a"}`,
              }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className={`fs-18 ${project.is_active ? "ri-checkbox-circle-line text-success" : "ri-pause-circle-line text-warning"}`}></i>
                <div>
                  <div className="fw-semibold fs-13" style={{ color: project.is_active ? "#15803d" : "#b45309" }}>
                    {project.is_active ? "Projet actif" : "Projet inactif"}
                  </div>
                  <div className="fs-12 text-muted">
                    {project.is_active ? "Inclus dans les extractions automatiques" : "Exclu des extractions automatiques"}
                  </div>
                </div>
              </div>
              <button
                className={`btn btn-sm ${project.is_active ? "btn-soft-warning" : "btn-soft-success"}`}
                onClick={() => { onToggle(project); onClose(); }}
              >
                {project.is_active ? "Désactiver" : "Activer"}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 d-flex justify-content-between align-items-center"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              <i className="ri-folder-line me-1"></i>Projet #{project.id}
            </span>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-light px-3" onClick={onClose}>Fermer</button>
              <button className="btn btn-sm btn-primary px-3" onClick={() => onEdit(project)}>
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
export default function AdminProjectsPage() {
  const [projects,      setProjects]      = useState([]);
  const [configs,       setConfigs]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modalProject,  setModalProject]  = useState(null);
  const [detailProject, setDetailProject] = useState(null);  // [NEW]
  const [deleteProject, setDeleteProject] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast,         setToast]         = useState(null);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [configFilter,  setConfigFilter]  = useState("all");  // [NEW]
  const [sortKey,       setSortKey]       = useState(null);   // [NEW]
  const [sortDir,       setSortDir]       = useState("asc");  // [NEW]
  const [page,          setPage]          = useState(1);
  const perPage = 10;

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // [FIX] useCallback pour éviter re-création inutile
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projData, configData] = await Promise.all([
        projectService.getAllAdmin(),
        gitlabConfigService.getAll(),
      ]);
      setProjects(Array.isArray(projData) ? projData : (projData?.items ?? []));
      setConfigs(Array.isArray(configData) ? configData : (configData?.items ?? []));
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
    } catch {
      showToast("Erreur lors de la suppression.", "danger");
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
      showToast("Erreur lors du changement de statut.", "danger");
    }
  }, [load, showToast]);

  // ── Stats ──
  const totalProjects    = projects.length;
  const activeProjects   = projects.filter((p) => p.is_active).length;
  const inactiveProjects = projects.filter((p) => !p.is_active).length;
  const totalCommits     = projects.reduce((s, p) => s + (p.commit_count ?? 0), 0);

  // ── Filtres + tri ──
  const filtered = useMemo(() => {
    let result = projects.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (p.name || "").toLowerCase().includes(q) ||
        String(p.gitlab_project_id).includes(q) ||
        (p.namespace || "").toLowerCase().includes(q);
      const matchStatus =
        statusFilter === "all"      ? true :
        statusFilter === "active"   ? p.is_active :
        statusFilter === "inactive" ? !p.is_active : true;
      // [NEW] Filtre config GitLab
      const matchConfig = configFilter === "all" || String(p.gitlab_config_id) === configFilter;
      return matchSearch && matchStatus && matchConfig;
    });

    // [NEW] Tri colonnes
    if (sortKey) {
      result = [...result].sort((a, b) => {
        let va = a[sortKey] ?? "";
        let vb = b[sortKey] ?? "";
        if (typeof va === "number") return sortDir === "asc" ? va - vb : vb - va;
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }
    return result;
  }, [projects, search, statusFilter, configFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  // [NEW] Tri colonnes
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

  // Reset filtres
  const hasActiveFilters = search || statusFilter !== "all" || configFilter !== "all";

  return (
    <div className="page-content">
      <div className="container-fluid">

        <Toast toast={toast} />

        {/* Page Title */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-folder-line me-2 text-primary"></i>Gestion des Projets
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item active">Projets Admin</li>
              </ol>
            </div>
          </div>
        </div>

        {/* ── Stats Cards ── */}
        <div className="row mb-4">
          {[
            { label: "Total",    value: totalProjects,                 sub: "projets enregistrés",        color: "primary", icon: "ri-folder-line" },
            { label: "Actifs",   value: activeProjects,                sub: "inclus dans les extractions", color: "success", icon: "ri-checkbox-circle-line" },
            { label: "Inactifs", value: inactiveProjects,              sub: "exclus des extractions",      color: "warning", icon: "ri-pause-circle-line" },
            { label: "Commits",  value: totalCommits.toLocaleString(), sub: "tous projets confondus",      color: "info",    icon: "ri-git-commit-line" },
          ].map((s, i) => (
            <div key={i} className="col-xl-3 col-sm-6">
              <div className="card card-animate">
                <div className="card-body">
                  <div className="d-flex align-items-center">
                    <div className="avatar-sm flex-shrink-0">
                      <span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-2`}>
                        <i className={s.icon}></i>
                      </span>
                    </div>
                    <div className="flex-grow-1 ms-3">
                      <p className="text-uppercase fw-medium text-muted mb-1 fs-12">{s.label}</p>
                      <h4 className="mb-0">{s.value}</h4>
                      <p className="text-muted mb-0 fs-12">{s.sub}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Table Card ── */}
        <div className="card">
          <div className="card-header">
            <div className="row g-2 align-items-center">

              {/* Recherche */}
              <div className="col-md-4">
                <div className="search-box">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Rechercher par nom, ID, namespace..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                  <i className="ri-search-line search-icon"></i>
                </div>
              </div>

              {/* Filtre statut */}
              <div className="col-md-2">
                <select
                  className="form-select"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                >
                  <option value="all">Tous les statuts</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>
              </div>

              {/* [NEW] Filtre config GitLab */}
              {configs.length > 1 && (
                <div className="col-md-2">
                  <select
                    className="form-select"
                    value={configFilter}
                    onChange={(e) => { setConfigFilter(e.target.value); setPage(1); }}
                  >
                    <option value="all">Toutes les configs</option>
                    {configs.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* [NEW] Reset + compteur */}
              {hasActiveFilters && (
                <div className="col-md-auto">
                  <button
                    className="btn btn-soft-danger btn-sm"
                    onClick={() => { setSearch(""); setStatusFilter("all"); setConfigFilter("all"); setPage(1); }}
                  >
                    <i className="ri-close-line me-1"></i>Reset ({filtered.length})
                  </button>
                </div>
              )}

              <div className="col-md-auto ms-auto d-flex gap-2">
                {/* [NEW] Export CSV */}
                {projects.length > 0 && (
                  <button
                    className="btn btn-soft-success"
                    onClick={() => exportCSV(filtered, configs)}
                    title="Exporter en CSV"
                  >
                    <i className="ri-download-2-line me-1"></i>CSV
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => setModalProject({})}>
                  <i className="ri-add-line me-1"></i>Nouveau projet
                </button>
              </div>
            </div>
          </div>

          <div className="card-body">
            {loading ? (
              <LoadingSpinner text="Chargement des projets..." />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon="ri-folder-line"
                title="Aucun projet trouvé"
                description={search ? "Aucun résultat pour cette recherche." : "Créez votre premier projet."}
                actionLabel="Nouveau projet"
                onAction={() => setModalProject({})}
                compact
              />
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover align-middle table-nowrap mb-0">
                    <thead className="table-light">
                      <tr>
                        {/* [NEW] En-têtes triables */}
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("name")}>
                          Projet<SortIcon k="name" />
                        </th>
                        <th>GitLab Config</th>
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("gitlab_project_id")}>
                          Project ID<SortIcon k="gitlab_project_id" />
                        </th>
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("commit_count")}>
                          Commits<SortIcon k="commit_count" />
                        </th>
                        <th style={{ cursor: "pointer" }} onClick={() => handleSort("contributor_count")}>
                          Contributeurs<SortIcon k="contributor_count" />
                        </th>
                        <th>Statut</th>
                        <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((p) => {
                        const config = configs.find((c) => c.id === p.gitlab_config_id);
                        return (
                          <tr
                            key={p.id}
                            className={!p.is_active ? "opacity-75" : ""}
                            style={{ cursor: "pointer" }}
                            onClick={() => setDetailProject(p)}
                          >
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <div
                                  className={`avatar-xs rounded d-flex align-items-center justify-content-center fw-bold fs-12 flex-shrink-0
                                    ${p.is_active ? "bg-primary-subtle text-primary" : "bg-secondary-subtle text-secondary"}`}
                                  style={{ minWidth: 32, height: 32 }}
                                >
                                  {getInitials(p.name)}
                                </div>
                                <div>
                                  <p className={`fw-semibold mb-0 fs-13 ${!p.is_active ? "text-muted" : ""}`}>{p.name}</p>
                                  <p className="text-muted mb-0 fs-11">{p.namespace || p.path || "—"}</p>
                                </div>
                              </div>
                            </td>
                            <td>
                              {config ? (
                                <span className="badge bg-light text-dark">
                                  <i className="ri-settings-4-line me-1"></i>{config.name}
                                </span>
                              ) : (
                                <span className="text-muted fs-12">—</span>
                              )}
                            </td>
                            <td>
                              <code className="fs-12">{p.gitlab_project_id}</code>
                            </td>
                            <td>
                              <span className="badge bg-primary-subtle text-primary fs-12">
                                <i className="ri-git-commit-line me-1"></i>
                                {(p.commit_count ?? 0).toLocaleString()}
                              </span>
                            </td>
                            <td>
                              <span className="badge bg-info-subtle text-info fs-12">
                                <i className="ri-team-line me-1"></i>
                                {p.contributor_count ?? 0}
                              </span>
                            </td>
                            <td>
                              {p.is_active ? (
                                <span className="badge bg-success-subtle text-success">
                                  <i className="ri-checkbox-circle-line me-1"></i>Actif
                                </span>
                              ) : (
                                <span className="badge bg-warning-subtle text-warning">
                                  <i className="ri-pause-circle-line me-1"></i>Inactif
                                </span>
                              )}
                            </td>
                            {/* [FIX] stopPropagation sur boutons */}
                            <td className="text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="d-flex gap-1 justify-content-center">
                                <button
                                  className={`btn btn-sm btn-icon ${p.is_active ? "btn-soft-warning" : "btn-soft-success"}`}
                                  onClick={() => handleToggleActive(p)}
                                  title={p.is_active ? "Désactiver" : "Activer"}
                                >
                                  <i className={`ri-${p.is_active ? "pause" : "play"}-circle-line fs-14`}></i>
                                </button>
                                <button
                                  className="btn btn-sm btn-icon btn-soft-primary"
                                  onClick={() => setModalProject(p)}
                                  title="Modifier"
                                >
                                  <i className="ri-pencil-fill fs-14"></i>
                                </button>
                                <button
                                  className="btn btn-sm btn-icon btn-soft-danger"
                                  onClick={() => setDeleteProject(p)}
                                  title="Supprimer"
                                >
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

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={filtered.length}
                  perPage={perPage}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>
        </div>

      </div>

      {/* Modals */}
      {modalProject !== null && (
        <ProjectModal
          project={modalProject.id ? modalProject : null}
          configs={configs}
          onClose={() => setModalProject(null)}
          onSave={() => { setModalProject(null); showToast("Projet enregistré."); load(); }}
        />
      )}

      {/* [NEW] Modal détail */}
      {detailProject && !modalProject && (
        <ProjectDetailModal
          project={detailProject}
          configs={configs}
          onClose={() => setDetailProject(null)}
          onEdit={(p) => { setDetailProject(null); setModalProject(p); }}
          onToggle={handleToggleActive}
        />
      )}

      <ConfirmModal
        show={!!deleteProject}
        title="Supprimer ce projet ?"
        message={
          deleteProject
            ? `Supprimer "${deleteProject.name}" ? Tous les commits, MRs et extractions associés seront supprimés.`
            : ""
        }
        confirmLabel="Supprimer définitivement"
        confirmColor="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteProject(null)}
      />
    </div>
  );
}
