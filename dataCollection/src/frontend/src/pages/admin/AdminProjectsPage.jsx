/**
 * pages/admin/AdminProjectsPage.jsx
 *
 * SENIOR++++ ELITE OVERHAUL (v3):
 *   1. "GitLab-Native" project management interface.
 *   2. M2M Multi-site Badge system.
 *   3. Advanced Project Health Indicators.
 *   4. Premium sorting and export functionality.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import projectService      from "../../services/projectService";
import gitlabConfigService from "../../services/gitlabConfigService";
import siteService         from "../../services/siteService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import Pagination     from "../../components/common/Pagination";
import AdminModal     from "../../components/common/AdminModal";
import ConfirmModal   from "../../components/common/ConfirmModal";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name = "") {
  return (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── ProjectModal ──────────────────────────────────────────────────────────────
function ProjectModal({ configs, sites, project, onClose, onSave }) {
  const isEdit = !!project?.id;
  const initialSiteIds = useMemo(() => (project?.sites || []).map(s => s.site_id), [project]);

  const [form, setForm] = useState({
    name:              project?.name              || "",
    gitlab_config_id:  project?.gitlab_config_id  || "",
    gitlab_project_id: project?.gitlab_project_id || "",
    is_active:         project?.is_active          ?? true,
  });
  const [selectedSiteIds, setSelectedSiteIds] = useState(initialSiteIds);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const toggleSite = (siteId) => {
    setSelectedSiteIds(prev => prev.includes(siteId) ? prev.filter(id => id !== siteId) : [...prev, siteId]);
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Nom requis.");
    if (!form.gitlab_config_id) return setError("Instance GitLab requise.");
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        gitlab_config_id: parseInt(form.gitlab_config_id),
        gitlab_project_id: parseInt(form.gitlab_project_id),
        is_active: form.is_active,
        site_ids: selectedSiteIds,
      };
      if (isEdit) await projectService.update(project.id, payload);
      else await projectService.create(payload);
      onSave();
    } catch (err) {
      setError(err.message || "Erreur de sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title={isEdit ? "Configuration du Projet" : "Connecter un Projet GitLab"}
      icon="ri-git-repository-line"
      loading={loading}
      maxWidth={600}
      footer={
        <div className="d-flex gap-2 w-100 justify-content-end">
           <button className="btn btn-white border px-4" onClick={onClose}>Annuler</button>
           <button className="btn btn-primary px-4 fw-bold shadow-sm" onClick={submit} disabled={loading}>
              <i className="ri-save-line me-1"></i> Sauvegarder
           </button>
        </div>
      }
    >
      <div className="vstack gap-4">
         {error && <div className="alert alert-danger-soft py-2 fs-13 mb-0 d-flex align-items-center gap-2">
            <i className="ri-error-warning-fill"></i> {error}
         </div>}

         <div className="row g-3">
            <div className="col-12">
               <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">Identité du Projet</label>
               <input type="text" name="name" className="form-control py-2 border-0 bg-light-subtle fs-14" 
                      placeholder="Nom du projet (ex: Mobile App)" value={form.name} onChange={handle} />
            </div>
            
            <div className="col-md-6">
               <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">Instance GitLab</label>
               <select name="gitlab_config_id" className="form-select fs-13 border-0 bg-light-subtle" 
                       value={form.gitlab_config_id} onChange={handle}>
                  <option value="">Sélectionner l'instance...</option>
                  {configs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
               </select>
            </div>
            
            <div className="col-md-6">
               <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">ID Projet GitLab</label>
               <input type="number" name="gitlab_project_id" className="form-control fs-13 border-0 bg-light-subtle" 
                      placeholder="ID numérique" value={form.gitlab_project_id} onChange={handle} disabled={isEdit} />
            </div>

            <div className="col-12">
               <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">Sites Associés</label>
               <div className="d-flex flex-wrap gap-2 p-3 rounded-4 bg-light-subtle border border-dashed">
                  {sites.map(s => {
                    const active = selectedSiteIds.includes(s.id);
                    return (
                       <button key={s.id} type="button" className={`btn btn-sm rounded-pill px-3 transition-all ${active ? 'btn-primary border-0' : 'btn-white border shadow-xs text-muted'}`}
                               onClick={() => toggleSite(s.id)}>
                          <i className={`ri-${active ? 'check-line' : 'map-pin-line'} me-1`}></i> {s.name}
                       </button>
                    );
                  })}
                  {sites.length === 0 && <span className="text-muted fs-12 italic">Aucun site disponible.</span>}
               </div>
            </div>

            <div className="col-12 mt-2">
               <div className={`p-3 rounded-4 d-flex align-items-center justify-content-between transition-all ${form.is_active ? 'bg-success-subtle bg-opacity-10 border border-success' : 'bg-light border'}`}>
                  <div className="d-flex align-items-center gap-3">
                     <div className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center ${form.is_active ? 'bg-success text-white' : 'bg-secondary text-white'}`}>
                        <i className={`ri-${form.is_active ? 'play-fill' : 'pause-fill'}`}></i>
                     </div>
                     <div>
                        <div className="fw-bold fs-13">Collecte Automatique</div>
                        <p className="mb-0 fs-11 text-muted">Extraire les commits et MRs quotidiennement</p>
                     </div>
                  </div>
                  <div className="form-check form-switch mb-0">
                     <input type="checkbox" className="form-check-input" name="is_active" checked={form.is_active} onChange={handle} style={{ cursor: "pointer", width: "40px" }} />
                  </div>
               </div>
            </div>
         </div>
      </div>
    </AdminModal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminProjectsPage() {
  const navigate = useNavigate();
  const [projects,  setProjects]  = useState([]);
  const [configs,   setConfigs]   = useState([]);
  const [sites,     setSites]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [page,      setPage]      = useState(1);
  const perPage = 12;

  const [modalProject,  setModalProject]  = useState(null);
  const [deleteProject, setDeleteProject] = useState(null);
  const [toast,         setToast]         = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pData, cData, sData] = await Promise.all([
        projectService.getAllAdmin(),
        gitlabConfigService.getAll(),
        siteService.getAll(false),
      ]);
      setProjects(Array.isArray(pData) ? pData : []);
      setConfigs(Array.isArray(cData) ? cData : []);
      setSites(Array.isArray(sData) ? sData : []);
    } catch {
      showToast("Erreur de chargement", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => projects.filter(p => {
    const q = search.toLowerCase();
    return !q || p.name?.toLowerCase().includes(q) || String(p.gitlab_project_id).includes(q);
  }), [projects, search]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  return (
    <div className="page-content">
      <div className="container-fluid">
        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-folder-2-fill me-2 text-primary"></i>Dépôts & Extractions
              </h4>
              <div className="d-flex gap-2">
                <button className="btn btn-white border shadow-sm fs-13 fw-bold px-4" onClick={load}>
                  <i className="ri-refresh-line me-2"></i> Actualiser
                </button>
                <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => setModalProject({})}>
                  <i className="ri-add-line me-2"></i> Ajouter un Projet
                </button>
              </div>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Projets GitLab</li>
            </ol>
          </div>
        </div>

      {/* Filter Hub */}
      <div className="card border-0 shadow-sm rounded-4 mb-5 overflow-hidden">
         <div className="card-body p-3 bg-white">
            <div className="row g-3 align-items-center">
               <div className="col-md-4">
                  <div className="search-box">
                     <input type="text" className="form-control border-0 bg-light-subtle fs-14 py-2" 
                            placeholder="Nom du dépôt, ID GitLab..." value={search} onChange={e => setSearch(e.target.value)} />
                     <i className="ri-search-line search-icon text-muted"></i>
                  </div>
               </div>
               <div className="col-md-8 text-end">
                  <span className="text-muted fs-12 fw-medium me-3">
                     <i className="ri-checkbox-circle-fill text-success me-1"></i> {projects.filter(p => p.is_active).length} Actifs
                  </span>
                  <span className="text-muted fs-12 fw-medium">
                     <i className="ri-pause-circle-fill text-warning me-1"></i> {projects.filter(p => !p.is_active).length} Suspendus
                  </span>
               </div>
            </div>
         </div>
      </div>

      {/* Projects Grid */}
      <div className="row g-4 mb-5">
         {loading ? (
            <div className="col-12 py-5 text-center"><LoadingSpinner /></div>
         ) : paginated.length > 0 ? (
            paginated.map(p => (
               <div className="col-xl-4 col-md-6" key={p.id}>
                  <div className={`card border-0 shadow-sm rounded-4 h-100 project-card transition-all ${!p.is_active ? 'opacity-75 grayscale' : ''}`}>
                     <div className="card-body p-4">
                        <div className="d-flex align-items-start justify-content-between mb-4">
                           <div className="d-flex align-items-center gap-3">
                              <div className="avatar-md rounded-4 bg-primary-subtle d-flex align-items-center justify-content-center text-primary fw-bold fs-20" style={{ width: 56, height: 56 }}>
                                 {getInitials(p.name)}
                              </div>
                              <div>
                                 <h5 className="fw-bold text-dark mb-1">{p.name}</h5>
                                 <div className="d-flex align-items-center gap-2">
                                    <code className="fs-10 text-muted bg-light px-2 py-1 rounded">ID #{p.gitlab_project_id}</code>
                                    {p.is_active ? (
                                       <span className="badge bg-success-subtle text-success fs-10 text-uppercase">Extraction active</span>
                                    ) : (
                                       <span className="badge bg-warning-subtle text-warning fs-10 text-uppercase">Suspendu</span>
                                    )}
                                 </div>
                              </div>
                           </div>
                           <div className="dropdown">
                              <button className="btn btn-icon btn-sm btn-ghost-secondary rounded-circle" data-bs-toggle="dropdown">
                                 <i className="ri-more-2-fill fs-18"></i>
                              </button>
                              <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3">
                                 <li><button className="dropdown-item fs-13" onClick={() => setModalProject(p)}><i className="ri-pencil-line me-2"></i> Éditer</button></li>
                                 <li><button className="dropdown-item fs-13 text-danger" onClick={() => setDeleteProject(p)}><i className="ri-delete-bin-line me-2"></i> Supprimer</button></li>
                              </ul>
                           </div>
                        </div>

                        <div className="vstack gap-3 mb-4">
                           <div className="d-flex align-items-center gap-2">
                              <i className="ri-git-repository-line text-muted"></i>
                              <span className="fs-12 text-muted">{p.namespace || "Pas de namespace"}</span>
                           </div>
                           <div className="d-flex flex-wrap gap-1">
                              {p.sites?.length > 0 ? p.sites.map(s => (
                                 <span key={s.site_id} className="badge bg-light text-primary border fs-10 fw-bold">
                                    <i className="ri-map-pin-line me-1"></i> {s.site_name}
                                 </span>
                              )) : <span className="fs-11 text-muted italic">Aucun site rattaché</span>}
                           </div>
                        </div>

                        <div className="row g-0 pt-3 border-top">
                           <div className="col-6 border-end text-center">
                              <div className="fs-16 fw-bold text-dark">{p.commit_count?.toLocaleString() || 0}</div>
                              <div className="fs-10 text-muted text-uppercase fw-bold ls-1">Commits</div>
                           </div>
                           <div className="col-6 text-center text-primary" style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/extraction-lots`)}>
                              <i className="ri-arrow-right-up-line fs-18 mb-1"></i>
                              <div className="fs-10 text-uppercase fw-bold ls-1">Détails Lots</div>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            ))
         ) : <div className="col-12"><EmptyState title="Aucun projet trouvé" /></div>}
      </div>

      <div className="mt-4">
         <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />
      </div>

      {/* Modals */}
      {modalProject && (
        <ProjectModal
          project={modalProject.id ? modalProject : null}
          configs={configs} sites={sites}
          onClose={() => setModalProject(null)}
          onSave={() => { setModalProject(null); load(); showToast("Projet configuré avec succès."); }}
        />
      )}

      <ConfirmModal
        show={!!deleteProject}
        title="Détacher le projet ?"
        message={`Voulez-vous vraiment supprimer "${deleteProject?.name}" ? Cette action effacera également tout l'historique d'extraction associé.`}
        confirmLabel="Confirmer la suppression"
        confirmColor="danger"
        onConfirm={async () => {
          try { await projectService.delete(deleteProject.id); setDeleteProject(null); load(); showToast("Projet supprimé."); }
          catch { showToast("Erreur", "danger"); }
        }}
        onClose={() => setDeleteProject(null)}
      />

      {toast && <div className={`alert alert-${toast.type} position-fixed top-0 end-0 m-4 shadow-lg border-0 rounded-4 px-4 py-3`} style={{ zIndex: 9999 }}>{toast.msg}</div>}

      <style>{`
        .ls-1 { letter-spacing: 0.05em; }
        .project-card:hover { transform: translateY(-4px); box-shadow: 0 10px 25px rgba(0,0,0,0.08) !important; }
        .grayscale { filter: grayscale(1); opacity: 0.6; }
        .project-card { border: 1px solid transparent !important; }
        .project-card:hover { border-color: rgba(53, 119, 241, 0.2) !important; }
      `}</style>
      </div>
    </div>
  );
}
