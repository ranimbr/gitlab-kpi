import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import Chart from "react-apexcharts";
import siteService      from "../services/siteService";
import developerService from "../services/developerService";
import projectService   from "../services/projectService";
import LoadingSpinner   from "../components/common/LoadingSpinner";
import SiteMatrixTab    from "./SiteMatrixTab";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getInitials = (name = "") =>
  (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2);

const AVATAR_COLORS = ["primary", "secondary", "success", "info", "warning", "danger"];
const avatarColorClass = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];

const STATUS_CONFIG = {
  active:   { label: "Actif",       badge: "bg-success-subtle text-success" },
  pending:  { label: "En attente",  badge: "bg-warning-subtle text-warning" },
  inactive: { label: "Inactif",     badge: "bg-danger-subtle text-danger"   },
};

// ─── Modals ──────────────────────────────────────────────────────────────────

function DevFormModal({ show, onClose, onSave, sites, groups, projects, activeProject, editDev }) {
  const [form, setForm] = useState({ 
    name: "", email: "", gitlab_username: "", 
    site_id: "", group_id: "", project_ids: [],
    source: "manual" 
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    if (editDev) {
      setForm({
        name: editDev.name || "", email: editDev.email || "", 
        gitlab_username: editDev.gitlab_username || "",
        site_id: editDev.primary_site_id || "", 
        group_id: editDev.group_id || "", 
        project_ids: [], // Note: Pas retourné par l'API actuelle pour la liste
        source: "manual",
      });
    } else {
      setForm({ 
        name: "", email: "", gitlab_username: "", 
        site_id: "", group_id: "", 
        project_ids: activeProject ? [activeProject.id] : [],
        source: "manual" 
      });
    }
    setError("");
  }, [editDev, show, activeProject]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleProject = (pid) => {
    setForm(f => ({
      ...f,
      project_ids: f.project_ids.includes(pid) 
        ? f.project_ids.filter(id => id !== pid)
        : [...f.project_ids, pid]
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Le nom est obligatoire."); return; }
    if (!form.site_id) { setError("Le site est obligatoire."); return; }
    
    setSaving(true); setError("");
    try {
      const payload = {
        name:            form.name.trim(),
        email:           form.email.trim()           || null,
        gitlab_username: form.gitlab_username.trim() || null,
        group_id:        form.group_id               || null,
        source:          "manual",
        is_validated:    true,
        is_active:       true,
        sites: [{ site_id: parseInt(form.site_id), is_primary: true }],
        projects: form.project_ids.map(pid => ({ project_id: parseInt(pid), is_active: true }))
      };
      await onSave(payload, editDev?.id);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || "Erreur lors de la sauvegarde.");
    } finally { setSaving(false); }
  };

  if (!show) return null;

  return (
    <div className="modal fade show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 9999 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg rounded-4">
          <div className="modal-header border-bottom-0 pb-0">
            <h5 className="modal-title fw-bold">
              <i className="ri-user-add-line text-primary me-2" />
              {editDev ? "Modifier le développeur" : "Ajouter un développeur"}
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body pt-3">
            {error && <div className="alert alert-danger fs-13 py-2"><i className="ri-error-warning-line me-2"/>{error}</div>}
            
            <div className="mb-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Nom complet *</label>
              <input className="form-control form-control-sm border-light bg-light" placeholder="ex: Ahmed Ben Ali" value={form.name} onChange={e => set("name", e.target.value)} />
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Email</label>
                <input className="form-control form-control-sm border-light bg-light" type="email" placeholder="ahmed@company.com" value={form.email} onChange={e => set("email", e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Username GitLab</label>
                <input className="form-control form-control-sm border-light bg-light" placeholder="ahmed.benali" value={form.gitlab_username} onChange={e => set("gitlab_username", e.target.value)} />
              </div>
            </div>

            <div className="row g-2 mb-2">
              <div className="col-6">
                <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Site *</label>
                <select className="form-select form-select-sm border-light bg-light shadow-none" value={form.site_id} onChange={e => set("site_id", e.target.value)}>
                  <option value="">Sélectionner</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Groupe</label>
                <select className="form-select form-select-sm border-light bg-light shadow-none" value={form.group_id} onChange={e => set("group_id", e.target.value)}>
                  <option value="">Aucun groupe</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase d-block mb-2">Projets Affectés</label>
              <div className="d-flex flex-wrap gap-2 p-2 rounded bg-light border border-light">
                {projects.length === 0 && <span className="text-muted fs-11">Aucun projet disponible</span>}
                {projects.map(p => {
                  const isActive = form.project_ids.includes(p.id);
                  return (
                    <button 
                      key={p.id}
                      type="button"
                      onClick={() => toggleProject(p.id)}
                      className={`btn btn-sm rounded-pill px-3 py-1 fs-11 transition-all ${
                        isActive ? "btn-primary shadow-sm" : "btn-outline-secondary border-dashed"
                      }`}
                    >
                      <i className={`ri-${isActive ? "check-line" : "add-line"} me-1`} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <small className="text-muted fs-10 mt-1 d-block"><i className="ri-information-line me-1" />Sélectionnez les projets sur lesquels ce développeur pourra être extrait.</small>
            </div>
          </div>
          <div className="modal-footer border-top-0 pt-0">
            <button className="btn btn-light" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary shadow-sm" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2"/>Sauvegarde...</> : "Sauvegarder"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ show, onClose, onImported, sites, groups }) {
  const [file, setFile] = useState(null);
  const [defaultSiteId, setDefaultSiteId] = useState("");
  const [defaultGrpId, setDefaultGrpId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [options, setOptions] = useState({
    createMissingSites: false,
    createMissingProjects: false,
    createMissingGroups: true,
  });

  const handleImport = async () => {
    if (!file) { setError("Veuillez sélectionner un fichier."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await developerService.importFile(file, {
        defaultSiteId: defaultSiteId ? parseInt(defaultSiteId) : null,
        defaultGroupId: defaultGrpId ? parseInt(defaultGrpId) : null,
        dryRun: false,
        ...options,
      });
      setResult(res);
      if (res?.success_count > 0) onImported();
    } catch (e) {
      setError(e?.response?.data?.detail || "Erreur lors de l'import.");
    } finally { setLoading(false); }
  };

  const downloadTemplate = () => window.open(`${import.meta.env.VITE_API_URL || "/api/v1"}/developers/import/template`, "_blank");

  if (!show) return null;

  return (
    <div className="modal fade show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 9999 }}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content border-0 shadow-lg rounded-4">
          <div className="modal-header border-bottom-0 pb-0">
            <h5 className="modal-title fw-bold">
              <i className="ri-upload-cloud-line text-info me-2" />
              Import CSV — Équipe
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body pt-3">
            <div className="border border-dashed border-2 rounded-4 p-4 text-center mb-4 bg-light pointer-cursor" onClick={() => document.getElementById("csv-file-input").click()}>
               <input id="csv-file-input" type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
               <i className={`ri-file-excel-line fs-1 mb-2 d-block ${file ? "text-success" : "text-muted opacity-50"}`} />
               {file ? <span className="fw-bold text-success">{file.name}</span> : <span className="text-muted fs-13">Cliquez pour sélectionner un fichier CSV/Excel</span>}
            </div>

            <button className="btn btn-sm btn-soft-secondary mb-3" onClick={downloadTemplate}><i className="ri-download-line me-2" />Télécharger Template</button>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Site par défaut</label>
                <select className="form-select form-select-sm border-light bg-light" value={defaultSiteId} onChange={e => setDefaultSiteId(e.target.value)}>
                  <option value="">Aucun</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Groupe par défaut</label>
                <select className="form-select form-select-sm border-light bg-light" value={defaultGrpId} onChange={e => setDefaultGrpId(e.target.value)}>
                  <option value="">Aucun</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            
            <div className="mb-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase d-block mb-2">Options automatiques</label>
              <div className="d-flex flex-column gap-2">
                <div className="form-check form-switch form-switch-md">
                  <input className="form-check-input" type="checkbox" id="import-create-groups" checked={options.createMissingGroups} onChange={e => setOptions({...options, createMissingGroups: e.target.checked})} />
                  <label className="form-check-label fs-13" htmlFor="import-create-groups">Créer les équipes/groupes inconnus</label>
                </div>
                <div className="form-check form-switch form-switch-md">
                  <input className="form-check-input" type="checkbox" id="import-create-sites" checked={options.createMissingSites} onChange={e => setOptions({...options, createMissingSites: e.target.checked})} />
                  <label className="form-check-label fs-13" htmlFor="import-create-sites">Créer les sites inconnus</label>
                </div>
                <div className="form-check form-switch form-switch-md">
                  <input className="form-check-input" type="checkbox" id="import-create-projs" checked={options.createMissingProjects} onChange={e => setOptions({...options, createMissingProjects: e.target.checked})} />
                  <label className="form-check-label fs-13" htmlFor="import-create-projs">Créer les projets inconnus</label>
                </div>
              </div>
            </div>

            {error && <div className="alert alert-danger fs-13 py-2"><i className="ri-error-warning-line me-2"/>{error}</div>}

            {result && (
              <div className="alert alert-success mt-2 py-2 fs-13">
                <i className="ri-checkbox-circle-line me-2"></i>
                Import terminé: {result.success_count} réussis, {result.duplicate_count} doublons/ignorés, {result.error_count} erreurs.
              </div>
            )}
          </div>
          <div className="modal-footer border-top-0 pt-0">
            <button className="btn btn-light" onClick={onClose}>Fermer</button>
            <button className="btn btn-info shadow-sm text-white" onClick={handleImport} disabled={loading || !file}>
              {loading ? <><span className="spinner-border spinner-border-sm me-2"/>Import...</> : "Lancer Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupModal({ show, onClose, onSave }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) return setError("Le nom est obligatoire.");
    setSaving(true); setError("");
    try {
      await onSave({ name: name.trim(), description: description.trim() || null });
      onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || "Erreur lors de la sauvegarde.");
    } finally { setSaving(false); }
  };

  if (!show) return null;
  return (
    <div className="modal fade show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 9999 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg rounded-4">
          <div className="modal-header border-bottom-0 pb-0">
            <h5 className="modal-title fw-bold"><i className="ri-group-line text-primary me-2"/>Nouveau groupe</h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body pt-3">
            {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}
            <div className="mb-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Nom du groupe *</label>
              <input className="form-control form-control-sm border-light bg-light" placeholder="ex: Integrations" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="mb-2">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Description</label>
              <textarea className="form-control form-control-sm border-light bg-light" rows="2" placeholder="Équipe en charge des API..." value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer border-top-0 pt-0">
            <button className="btn btn-light" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Sauvegarde..." : "Enregistrer"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE PRINCIPALE ───────────────────────────────────────────────────────
export default function TeamManagementPage() {
  const navigate = useNavigate();

  const [sites,      setSites]      = useState([]);
  const [groups,     setGroups]     = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [teamData,   setTeamData]   = useState(null);
  const [activeSite, setActiveSite] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [viewMode, setViewMode] = useState("members"); // "members" | "matrix"

  const [loading,     setLoading]     = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);

  const [search,     setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupFilter,  setGroupFilter]  = useState("all");

  const [showAddModal,    setShowAddModal]    = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGroupModal,  setShowGroupModal]  = useState(false);
  const [editDev,         setEditDev]         = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [sitesData, groupsData, projsData] = await Promise.all([
        siteService.getAll(false), developerService.getGroups(), projectService.getAll(),
      ]);
      setSites(Array.isArray(sitesData) ? sitesData : []);
      setGroups(Array.isArray(groupsData) ? groupsData : []);
      setProjects(Array.isArray(projsData) ? projsData : []);
      // activeSite reste à null par défaut ("Tous les sites")
    } catch { /* ignored */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const siteIdParam = activeSite ? activeSite.id : "all";
      const data = await siteService.getSiteTeam(siteIdParam, activeProject?.id || null);
      setTeamData(data);
    } catch { setTeamData(null); }
    finally { setTeamLoading(false); }
  }, [activeSite, activeProject]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const handleSaveDev = async (payload, devId) => {
    if (devId) {
      await developerService.update(devId, payload);
      showToast("Développeur mis à jour avec succès.");
    } else {
      await developerService.create(payload);
      showToast("Développeur ajouté à l'équipe.");
    }
    await loadTeam();
  };

  const handleSaveGroup = async (payload) => {
    await developerService.createGroup(payload);
    showToast("Groupe créé avec succès.");
    const groupsData = await developerService.getGroups();
    setGroups(Array.isArray(groupsData) ? groupsData : []);
  };

  const groupsForSite = useMemo(() => {
    if (!teamData?.groups) return [];
    return teamData.groups.filter(g => g.group_id !== null);
  }, [teamData]);

  const filteredDevs = useMemo(() => {
    if (!teamData?.developers) return [];
    return teamData.developers.filter(dev => {
      const q = search.toLowerCase();
      if (q && !(dev.name || "").toLowerCase().includes(q) && !(dev.gitlab_username || "").toLowerCase().includes(q) && !(dev.email || "").toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && dev.status !== statusFilter) return false;
      if (groupFilter  !== "all" && String(dev.group_id) !== groupFilter) return false;
      return true;
    });
  }, [teamData, search, statusFilter, groupFilter]);

  const groupChartOptions = useMemo(() => {
    const labels = groupsForSite.map(g => g.group_name || "Sans groupe");
    const series = groupsForSite.map(g => g.count);
    return {
      series: series.length ? series : [1],
      options: {
        chart: { 
          type: "donut", 
          background: "transparent",
          events: {
            dataPointSelection: (event, chartContext, config) => {
              const g = groupsForSite[config.dataPointIndex];
              if (g) {
                const target = String(g.group_id);
                // Toggle : si déjà sélectionné, on reset à "all"
                setGroupFilter(prev => prev === target ? "all" : target);
              }
            }
          }
        },
        labels: labels.length ? labels : ["Vide"],
        colors: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
        legend: { position: "bottom", fontSize: "12px", fontFamily: "Inter" },
        dataLabels: { enabled: false },
        plotOptions: { pie: { donut: { size: "70%" } } },
        stroke: { show: false },
        tooltip: { y: { formatter: (val) => `${val} développeur(s)` } }
      }
    };
  }, [groupsForSite]);

  if (loading) return <div className="page-content" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingSpinner text="Chargement du hub manager..." /></div>;

  return (
    <div className="page-content">
      <div className="container-fluid">
        
        {toast && (
          <div className={`alert alert-${toast.type} position-fixed top-0 end-0 m-3 shadow-lg`} style={{ zIndex: 9999 }}>
            <i className={`ri-${toast.type === "success" ? "checkbox-circle" : "error-warning"}-line me-2`} />
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-3">
                <div className="avatar-sm flex-shrink-0">
                  <span className="avatar-title bg-primary bg-opacity-10 text-primary rounded-3 fs-3">
                    <i className="ri-team-line"></i>
                  </span>
                </div>
                <div>
                  <h4 className="mb-sm-0 text-uppercase fw-bold text-dark" style={{ letterSpacing: "0.5px" }}>Gestion de l'Équipe</h4>
                  <ol className="breadcrumb m-0 mt-1">
                    <li className="breadcrumb-item"><Link to="/">Dashboard</Link></li>
                    <li className="breadcrumb-item active">Teams</li>
                  </ol>
                </div>
              </div>
              <div className="d-flex gap-2 mt-3 mt-sm-0">
                 <button className="btn btn-soft-primary fw-medium" onClick={() => setShowGroupModal(true)}>
                   <i className="ri-group-line me-2" /> Nouveau Groupe
                 </button>
                 <button className="btn btn-soft-info fw-medium" onClick={() => setShowImportModal(true)}>
                   <i className="ri-upload-cloud-line me-2" /> Import CSV
                 </button>
                 <button className="btn btn-primary fw-medium px-4 shadow-sm" onClick={() => { setEditDev(null); setShowAddModal(true); }}>
                   <i className="ri-user-add-line me-2" /> Ajouter
                 </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Toggle View Mode ── */}
        <div className="row mt-4 mb-2">
          <div className="col-12 d-flex justify-content-center">
            <div className="bg-white p-1 rounded-pill d-inline-flex border shadow-sm" style={{ padding: "4px" }}>
              <button 
                className={`btn btn-sm rounded-pill px-4 fw-semibold ${viewMode === "members" ? "btn-primary shadow-sm" : "btn-light border-0 bg-transparent text-muted"}`}
                onClick={() => setViewMode("members")}>
                <i className="ri-group-line me-2"></i>Annuaire Membres
              </button>
              <button 
                className={`btn btn-sm rounded-pill px-4 fw-semibold ${viewMode === "matrix" ? "btn-primary shadow-sm" : "btn-light border-0 bg-transparent text-muted"}`}
                onClick={() => setViewMode("matrix")}>
                <i className="ri-map-pin-2-fill me-2"></i>Matrice Inter-Sites
              </button>
            </div>
          </div>
        </div>

        {viewMode === "matrix" ? (
          <SiteMatrixTab 
            projects={projects} 
            activeProject={activeProject} 
            setActiveProject={setActiveProject} 
          />
        ) : (
          <div className="row mt-3">
          
          {/* Sidebar */}
          <div className="col-xl-3 col-lg-4">
            <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
              <div className="card-header bg-light border-bottom-0 pb-1 pt-3">
                <h6 className="card-title text-uppercase fw-bold text-muted fs-11 ls-1 mb-0">Paramètres de Vue</h6>
              </div>
              <div className="card-body">
                <label className="form-label fs-12 text-muted fw-semibold">Projet KPI Focus</label>
                <select className="form-select border-0 bg-light rounded-3" 
                  value={activeProject?.id || ""} onChange={e => setActiveProject(projects.find(p => p.id === parseInt(e.target.value)) || null)}>
                  <option value="">Vision Globale (Tous les projets)</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
               <div className="card-header bg-light border-bottom-0 pb-1 pt-3 d-flex justify-content-between align-items-center">
                 <h6 className="card-title text-uppercase fw-bold text-muted fs-11 ls-1 mb-0">Sites Opérationnels</h6>
                 <span className="badge bg-primary-subtle text-primary rounded-pill">{sites.length}</span>
               </div>
               <div className="list-group list-group-flush border-0">
                  <button onClick={() => setActiveSite(null)}
                    className={`list-group-item list-group-item-action border-0 px-4 py-3 d-flex align-items-center gap-3 ${!activeSite ? 'bg-primary-subtle text-primary fw-bold' : 'text-secondary'}`}
                    style={{ transition: 'all 0.2s', borderLeft: !activeSite ? '3px solid #3b82f6' : '3px solid transparent' }}>
                     <i className={`ri-earth-line fs-16 ${!activeSite ? 'text-primary' : ''}`} />
                     <span className="flex-grow-1 text-truncate">Tous les sites</span>
                  </button>
                  
                  {sites.length > 0 && sites.map(site => {
                    const isActive = activeSite?.id === site.id;
                    return (
                      <button key={site.id} onClick={() => setActiveSite(site)}
                        className={`list-group-item list-group-item-action border-0 px-4 py-3 d-flex align-items-center gap-3 ${isActive ? 'bg-primary-subtle text-primary fw-bold' : 'text-secondary'}`}
                        style={{ transition: 'all 0.2s', borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent' }}>
                         <i className={`ri-map-pin-2-${isActive ? 'fill' : 'line'} fs-16`} />
                         <span className="flex-grow-1 text-truncate">{site.name}</span>
                      </button>
                    )
                  })}
               </div>
            </div>

            {teamData && teamData.total > 0 && (
              <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
                <div className="card-header bg-light border-bottom-0 pb-1 pt-3">
                  <h6 className="card-title text-uppercase fw-bold text-muted fs-11 ls-1 mb-0">Répartition par Groupe</h6>
                </div>
                <div className="card-body p-0 pt-1 pb-3 d-flex justify-content-center" style={{ cursor: "pointer" }}>
                   <Chart options={groupChartOptions.options} series={groupChartOptions.series} type="donut" width="260" />
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="col-xl-9 col-lg-8">
            {teamData && (
              <div className="row g-3 mb-4">
                {[
                  { label: "Total Équipe", value: teamData.total, color: "primary", icon: "ri-group-line" },
                  { label: "Développeurs Actifs", value: teamData.active, color: "success", icon: "ri-checkbox-circle-line" },
                  { label: "En Attente", value: teamData.pending, color: "warning", icon: "ri-time-line" },
                  { 
                    label: "Score Moyen", 
                    value: Math.round((teamData.developers.reduce((acc, curr) => acc + (curr.developer_score || 0), 0) / (teamData.developers.length || 1)) * 100) + "%", 
                    color: "info", 
                    icon: "ri-bar-chart-box-line" 
                  },
                ].map(stat => (
                  <div key={stat.label} className="col-sm-6 col-md-3">
                    <div className="card border-0 shadow-sm rounded-4 h-100 mb-0 pointer-cursor hover-lift">
                      <div className="card-body d-flex align-items-center gap-3 p-3">
                         <div className={`avatar-sm flex-shrink-0 bg-${stat.color}-subtle text-${stat.color} rounded-3 d-flex align-items-center justify-content-center fs-3`}>
                           <i className={stat.icon} />
                         </div>
                         <div>
                            <p className="text-uppercase fw-semibold text-muted mb-1 fs-10" style={{ letterSpacing: "0.5px" }}>{stat.label}</p>
                            <h4 className="mb-0 fw-bold text-dark">{stat.value}</h4>
                         </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
               <div className="card-header bg-white border-bottom py-3">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                     <div className="d-flex align-items-center gap-3">
                        <h5 className="card-title mb-0 fw-bold"><i className="ri-team-fill text-primary me-2"/>Membres de l'équipe</h5>
                     </div>
                     <div className="d-flex gap-2">
                        <div className="search-box">
                           <input type="text" className="form-control form-control-sm border-light bg-light" placeholder="Chercher un nom..." value={search} onChange={e => setSearch(e.target.value)} />
                           <i className="ri-search-line search-icon text-muted"></i>
                        </div>
                        <select className="form-select form-select-sm border-light bg-light" style={{ width: 140 }} value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
                           <option value="all">Toutes équipes</option>
                           {groups.map(g => (
                             <option key={g.id} value={g.id}>{g.name}</option>
                           ))}
                        </select>
                        <select className="form-select form-select-sm border-light bg-light" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                           <option value="all">Tous statuts</option>
                           <option value="active">Actifs</option>
                           <option value="pending">En attente</option>
                           <option value="inactive">Inactifs</option>
                        </select>
                     </div>
                  </div>
               </div>

               <div className="card-body p-0">
                  {teamLoading ? (
                    <div className="p-5 text-center"><LoadingSpinner text="Chargement..." /></div>
                  ) : filteredDevs.length === 0 ? (
                    <div className="p-5 text-center text-muted">
                       <i className="ri-user-search-line fs-1 opacity-50 mb-3 d-block"/>
                       Aucun développeur trouvé dans cette vue.
                       {teamData?.total === 0 && <button className="btn btn-primary mt-3 d-block mx-auto" onClick={() => { setEditDev(null); setShowAddModal(true); }}>Ajouter un développeur</button>}
                    </div>
                  ) : (
                    <div className="table-responsive">
                       <table className="table table-hover table-nowrap align-middle mb-0">
                          <thead className="table-light text-muted fs-11 text-uppercase fw-semibold" style={{ letterSpacing: "0.5px" }}>
                             <tr>
                               <th className="ps-4">Développeur</th>
                               <th>Groupe</th>
                               <th>Score KPI</th>
                               <th className="text-center">Commits</th>
                               <th>Statut</th>
                               <th className="text-end pe-4">Actions</th>
                             </tr>
                          </thead>
                          <tbody>
                             {filteredDevs.map(dev => {
                               const c = avatarColorClass(dev.id);
                               const st = STATUS_CONFIG[dev.status] || STATUS_CONFIG.pending;
                               const grp = teamData.groups.find(g => g.group_id === dev.group_id);
                               
                               return (
                                 <tr key={dev.id}>
                                    <td className="ps-4">
                                      <div className="d-flex align-items-center gap-3">
                                        <div className={`avatar-xs rounded-circle bg-${c}-subtle text-${c} d-flex align-items-center justify-content-center fw-bold fs-12`} style={{ width: 36, height: 36 }}>
                                          {getInitials(dev.name || dev.gitlab_username)}
                                        </div>
                                        <div>
                                          <div className="d-flex align-items-center gap-2">
                                            <Link to={`/developers/${dev.id}`} className="text-dark fw-bold text-decoration-none">
                                              {dev.name || "Inconnu"}
                                            </Link>
                                            {activeProject && (dev.projects || []).some(p => String(p.project_id) === String(activeProject.id) && p.is_active) && (
                                              <span className="badge bg-success-subtle text-success border border-success border-opacity-10 fs-10 py-0 px-1">
                                                <i className="ri-focus-3-line me-1"></i>🎯 Équipe
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-muted fs-11">@{dev.gitlab_username || "..."}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td>
                                      {grp ? <span className="badge bg-primary-subtle text-primary px-2 py-1 fs-11 rounded-3">{grp.group_name}</span> : <span className="text-muted fs-12">—</span>}
                                    </td>
                                    <td style={{ width: 180 }}>
                                      <div className="d-flex align-items-center gap-2">
                                         <div className="progress w-100 shadow-none border" style={{ height: 6, borderRadius: 3, backgroundColor: "#f3f4f6" }}>
                                             <div className={`progress-bar ${dev.developer_score >= 0.7 ? "bg-success" : dev.developer_score >= 0.4 ? "bg-warning" : "bg-danger"}`} style={{ width: `${Math.round((dev.developer_score || 0) * 100)}%` }} />
                                         </div>
                                         <span className="fw-bold fs-12" style={{ minWidth: 35 }}>{Math.round((dev.developer_score || 0) * 100)}%</span>
                                      </div>
                                    </td>
                                    <td className="text-center fw-bold text-info fs-14">
                                      {dev.total_commits || "—"}
                                    </td>
                                    <td>
                                      <span className={`badge ${st.badge} rounded-pill px-2 py-1 fs-10 text-uppercase`}>{st.label}</span>
                                    </td>
                                    <td className="text-end pe-4">
                                      <button className="btn btn-sm btn-soft-secondary rounded-3 px-2 py-1" onClick={() => { setEditDev(dev); setShowAddModal(true); }}>
                                         <i className="ri-pencil-line fs-14"/>
                                      </button>
                                    </td>
                                 </tr>
                               )
                             })}
                          </tbody>
                       </table>
                    </div>
                  )}
               </div>
            </div>
          </div>
        </div>
        )}
      </div>

      <DevFormModal 
        show={showAddModal} 
        onClose={() => { setShowAddModal(false); setEditDev(null); }} 
        onSave={handleSaveDev} 
        sites={sites} 
        groups={groups} 
        projects={projects}
        activeProject={activeProject}
        editDev={editDev} 
      />
      <ImportModal show={showImportModal} onClose={() => setShowImportModal(false)} onImported={loadTeam} sites={sites} groups={groups} />
      <GroupModal show={showGroupModal} onClose={() => setShowGroupModal(false)} onSave={handleSaveGroup} />

      <style>{`
        .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .hover-lift:hover { transform: translateY(-3px); box-shadow: 0 10px 25px rgba(0,0,0,0.05) !important; }
      `}</style>
    </div>
  );
}
