/**
 * pages/admin/DashboardsAdminPage.jsx
 * CORRECTION v2 :
 *   [FIX] AccessModal — handleRevoke appelait onGrant() au lieu de onRevoke()
 *         → prop onRevoke était morte (jamais appelée)
 *         ✅ FIX : handleRevoke appelle maintenant onRevoke() pour la cohérence sémantique
 */
import { useState, useEffect, useCallback } from "react";
import projectService   from "../../services/projectService";
import siteService      from "../../services/siteService";
import dashboardService from "../../services/dashboardService";
import adminService     from "../../services/adminService";
import AdminModal      from "../../components/common/AdminModal";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import ConfirmModal   from "../../components/common/ConfirmModal";

function CreateDashboardModal({ projects, sites, onClose, onSave }) {
  const [form, setForm] = useState({ name:"", project_id:projects[0]?.id||"", site_id:"", is_public:false });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const handle = (e) => { const{name,value,type,checked}=e.target; setForm(f=>({...f,[name]:type==="checkbox"?checked:value})); };
  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Le nom est requis.");
    if (!form.project_id)  return setError("Le projet est requis.");
    setLoading(true);
    try {
      await dashboardService.create({ name:form.name, project_id:parseInt(form.project_id), site_id:form.site_id?parseInt(form.site_id):null, is_public:form.is_public });
      onSave();
    } catch(err) { setError(err.response?.data?.detail||"Erreur création dashboard."); }
    finally { setLoading(false); }
  };
  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Nouveau dashboard"
      subtitle="Organisez vos KPIs par projet et gérez la visibilité"
      icon="ri-layout-grid-line"
      loading={loading}
      maxWidth={520}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4 fw-medium" onClick={onClose} disabled={loading}>Annuler</button>
          <button className="btn btn-sm btn-primary px-4 fw-bold shadow-sm" onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Création...</> : <><i className="ri-add-line me-1"></i>Créer le dashboard</>}
          </button>
        </>
      }
    >
      {error && (
        <div className="alert alert-danger py-2 fs-13 mb-3 border-0 shadow-sm">
          <i className="ri-error-warning-line me-1"></i>{error}
        </div>
      )}
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label fw-semibold fs-13 mb-1">Nom du dashboard <span className="text-danger">*</span></label>
          <input type="text" name="name" className="form-control" placeholder="ex: Dashboard Q1 2026" value={form.name} onChange={handle} />
        </div>
        <div className="col-md-6">
          <label className="form-label fw-semibold fs-13 mb-1">Projet <span className="text-danger">*</span></label>
          <select name="project_id" className="form-select" value={form.project_id} onChange={handle}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label fw-semibold fs-13 mb-1">Site <span className="text-muted fs-11 ms-1">(optionnel)</span></label>
          <select name="site_id" className="form-select" value={form.site_id} onChange={handle}>
            <option value="">-- Tous les sites --</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}{s.country ? ` (${s.country})` : ""}</option>)}
          </select>
        </div>
        <div className="col-12 mt-3">
          <div 
            className="rounded-3 p-3 border d-flex align-items-center justify-content-between"
            style={{ 
              background: form.is_public ? "rgba(16,185,129,0.04)" : "#f8fafc",
              borderColor: form.is_public ? "#10b981" : "#e2e8f0"
            }}
          >
            <div className="flex-grow-1">
              <div className={`fw-bold fs-13 ${form.is_public ? "text-success" : "text-muted"}`}>
                <i className={`${form.is_public ? "ri-globe-line" : "ri-lock-line"} me-1`}></i>
                {form.is_public ? "Dashboard public" : "Dashboard privé"}
              </div>
              <div className="text-muted fs-11 mt-1">
                {form.is_public ? "Accessible à tous les utilisateurs connectés" : "Accès restreint via liste blanche"}
              </div>
            </div>
            <div className="form-check form-switch mb-0">
              <input 
                type="checkbox" 
                className="form-check-input" 
                name="is_public" 
                id="is_public_switch" 
                checked={form.is_public} 
                onChange={handle} 
                style={{ width: "2.6em", height: "1.4em", cursor: "pointer" }}
              />
            </div>
          </div>
        </div>
      </div>
    </AdminModal>
  );
}

// ✅ FIX : handleRevoke appelle onRevoke() (refresh) — l'ancienne version appelait onGrant()
//          ce qui fonctionnait mais était sémantiquement incorrect (prop onRevoke était morte)
function AccessModal({ dashboard, users, onClose, onGrant, onRevoke }) {
  const [userId,  setUserId]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const usersWithAccess = users.filter(u=>(u.dashboard_access||[]).includes(dashboard.id));
  const usersWithout    = users.filter(u=>u.role!=="admin"&&!(u.dashboard_access||[]).includes(dashboard.id));

  const handleGrant = async () => {
    if (!userId) return setError("Sélectionnez un utilisateur.");
    setLoading(true); setError("");
    try {
      await adminService.grantDashboardAccess(parseInt(userId), dashboard.id);
      onGrant();
      setUserId("");
    } catch(err) { setError(err.response?.data?.detail||"Erreur lors de l'attribution."); }
    finally { setLoading(false); }
  };

  const handleRevoke = async (uid) => {
    try {
      await adminService.revokeDashboardAccess(uid, dashboard.id);
      onRevoke(); // ✅ FIX : appelle onRevoke() au lieu de onGrant() — sémantiquement correct
    } catch(err) { setError(err.response?.data?.detail||"Erreur révocation."); }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Gérer les accès"
      subtitle={dashboard.name}
      icon="ri-user-add-line"
      iconBg="bg-success-subtle"
      iconColor="text-success"
      maxWidth={640}
      footer={<button className="btn btn-sm btn-light px-4 fw-medium" onClick={onClose}>Fermer</button>}
    >
      {error && (
        <div className="alert alert-danger py-2 fs-13 mb-3 border-0 shadow-sm">
          <i className="ri-error-warning-line me-1"></i>{error}
        </div>
      )}

      {dashboard.is_public && (
        <div className="alert alert-soft-success d-flex align-items-center gap-2 py-2 fs-13 mb-4 border-0">
          <i className="ri-globe-line fs-16"></i>
          <span>Ce dashboard est <strong>public</strong> — accessible à tous les utilisateurs connectés.</span>
        </div>
      )}

      <div className="mb-4">
        <label className="form-label fw-semibold fs-13 mb-2">Accorder l'accès à un utilisateur</label>
        <div className="input-group shadow-sm">
          <select className="form-select border-end-0" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">-- Choisir un utilisateur --</option>
            {usersWithout.map(u => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
          </select>
          <button className="btn btn-success px-3" onClick={handleGrant} disabled={loading || !userId}>
            {loading ? <span className="spinner-border spinner-border-sm"></span> : <><i className="ri-add-line me-1"></i>Accorder</>}
          </button>
        </div>
      </div>

      <div>
        <p className="fw-bold fs-12 text-uppercase text-muted mb-3" style={{ letterSpacing: '0.05em' }}>
          Utilisateurs autorisés ({usersWithAccess.length})
        </p>
        {usersWithAccess.length === 0 ? (
          <div className="text-center py-4 bg-light rounded-3 border-dashed">
            <p className="text-muted fs-13 mb-0">Aucun accès spécifique configuré.</p>
          </div>
        ) : (
          <div className="d-flex flex-wrap gap-2">
            {usersWithAccess.map(u => (
              <div 
                key={u.id} 
                className="d-flex align-items-center gap-2 px-2 py-1 rounded-pill border bg-white shadow-sm transition-all hover-shadow"
                style={{ border: '1px solid #e2e8f0' }}
              >
                <div className="avatar-xxs rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center" style={{ width: 22, height: 22 }}>
                  <i className="ri-user-line fs-11"></i>
                </div>
                <span className="fs-12 fw-medium">{u.email}</span>
                <button 
                  className="btn btn-link p-0 text-danger" 
                  style={{ lineHeight: 1 }} 
                  onClick={() => handleRevoke(u.id)} 
                  title="Révoquer l'accès"
                >
                  <i className="ri-close-circle-fill fs-15"></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminModal>
  );
}

export default function DashboardsAdminPage() {
  const [dashboards,    setDashboards]    = useState([]);
  const [projects,      setProjects]      = useState([]);
  const [sites,         setSites]         = useState([]);
  const [users,         setUsers]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showCreate,    setShowCreate]    = useState(false);
  const [accessTarget,  setAccessTarget]  = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast,         setToast]         = useState(null);

  const showToast = useCallback((msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);},[]);

  const loadAll = useCallback(()=>{
    setLoading(true);
    Promise.all([dashboardService.getMyDashboards(),projectService.getAll(),siteService.getAll(),adminService.getUsers()])
      .then(([dashs,projs,sts,usrs])=>{ setDashboards(dashs); setProjects(projs); setSites(sts); setUsers(usrs); })
      .catch(()=>showToast("Erreur chargement.","danger"))
      .finally(()=>setLoading(false));
  },[showToast]);

  useEffect(()=>{loadAll();},[loadAll]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try { await dashboardService.delete(deleteTarget.id); setDeleteTarget(null); showToast("Dashboard supprimé."); loadAll(); }
    catch(err) { setDeleteTarget(null); showToast(err.response?.data?.detail||"Erreur suppression.","danger"); }
    finally { setDeleteLoading(false); }
  };

  return (
    <div className="page-content">
      <div className="container-fluid">
        {toast && <div className={`alert alert-${toast.type} position-fixed top-0 end-0 m-3 shadow`} style={{ zIndex: 9999, minWidth: 300 }}><i className={`${toast.type === "success" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} me-2`}></i>{toast.msg}</div>}

        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-layout-grid-line me-2 text-primary"></i>Gestion des Dashboards
              </h4>
              <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => setShowCreate(true)}>
                <i className="ri-add-line me-1"></i> Nouveau Dashboard
              </button>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Dashboards</li>
            </ol>
          </div>
        </div>

      {loading ? <LoadingSpinner fullPage text="Chargement des dashboards..."/> : dashboards.length===0 ? (
        <EmptyState icon="ri-layout-grid-line" title="Aucun dashboard" description="Créez votre premier dashboard pour organiser les KPIs par projet." actionLabel="Créer un dashboard" onAction={()=>setShowCreate(true)}/>
      ) : (
        <div className="row g-3">
          {dashboards.map(dash=>{
            const project   = projects.find(p=>p.id===dash.project_id);
            const site      = sites.find(s=>s.id===dash.site_id);
            const accessCount = users.filter(u=>(u.dashboard_access||[]).includes(dash.id)).length;
            return (
              <div key={dash.id} className="col-xl-4 col-md-6">
                <div className="card h-100"><div className="card-body">
                  <div className="d-flex align-items-start justify-content-between mb-3">
                    <div className="d-flex align-items-center gap-3">
                      <div className="avatar-sm rounded bg-primary-subtle d-flex align-items-center justify-content-center"><i className="ri-layout-grid-line text-primary fs-4"></i></div>
                      <div>
                        <h6 className="fw-semibold mb-0">{dash.name}</h6>
                        <p className="text-muted mb-0 fs-12"><i className="ri-folder-2-line me-1"></i>{project?.name||`Projet #${dash.project_id}`}</p>
                      </div>
                    </div>
                    <div className="dropdown">
                      <button className="btn btn-sm btn-ghost-secondary" data-bs-toggle="dropdown"><i className="ri-more-2-fill"></i></button>
                      <ul className="dropdown-menu dropdown-menu-end">
                        <li><button className="dropdown-item" onClick={()=>setAccessTarget(dash)}><i className="ri-user-add-line me-2"></i>Gérer les accès</button></li>
                        <li><hr className="dropdown-divider"/></li>
                        <li><button className="dropdown-item text-danger" onClick={()=>setDeleteTarget(dash)}><i className="ri-delete-bin-line me-2"></i>Supprimer</button></li>
                      </ul>
                    </div>
                  </div>
                  <div className="vstack gap-2">
                    {site&&<div className="d-flex align-items-center gap-2"><i className="ri-map-pin-line text-muted fs-14"></i><span className="badge bg-info-subtle text-info">{site.name}</span></div>}
                    <div className="d-flex align-items-center gap-2"><i className={`${dash.is_public?"ri-globe-line text-success":"ri-lock-line text-muted"} fs-14`}></i><span className="fs-12 text-muted">{dash.is_public?"Public":`Privé · ${accessCount} accès`}</span></div>
                    <div className="d-flex align-items-center gap-2"><i className="ri-calendar-line text-muted fs-14"></i><span className="fs-12 text-muted">Créé le {dash.created_at?new Date(dash.created_at).toLocaleDateString("fr-FR"):"—"}</span></div>
                  </div>
                  <div className="mt-3 pt-3 border-top d-flex gap-2">
                    <button className="btn btn-sm btn-soft-success flex-grow-1" onClick={()=>setAccessTarget(dash)}><i className="ri-user-add-line me-1"></i>Accès</button>
                    <button className="btn btn-sm btn-soft-danger" onClick={()=>setDeleteTarget(dash)}><i className="ri-delete-bin-line"></i></button>
                  </div>
                </div></div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {showCreate&&<CreateDashboardModal projects={projects} sites={sites} onClose={()=>setShowCreate(false)} onSave={()=>{setShowCreate(false);showToast("Dashboard créé.");loadAll();}}/>}

    {accessTarget&&(
      <AccessModal dashboard={accessTarget} users={users}
        onClose={()=>setAccessTarget(null)}
        onGrant={()=>{loadAll();}}
        onRevoke={()=>{loadAll();}} /* ✅ FIX: onRevoke maintenant utilisé dans handleRevoke */
      />
    )}

    <ConfirmModal show={!!deleteTarget} title="Supprimer ce dashboard ?" message={deleteTarget?`Vous allez supprimer "${deleteTarget.name}".`:""} confirmLabel="Supprimer" confirmColor="danger" loading={deleteLoading} onConfirm={handleDelete} onClose={()=>setDeleteTarget(null)}/>
    </div>
  );
}
