/**
 * pages/admin/GitLabConfigPage.jsx
 * CORRECTION v2 :
 *   [FIX] loadConfigs → useCallback + import useCallback
 *   [FIX] showToast   → useCallback
 *   → Évite la recréation de ces fonctions à chaque render
 *     (important car loadConfigs est passée en dep de handleDelete/handleSave)
 */
import { useCallback, useEffect, useState } from "react";
import gitlabConfigService from "../../services/gitlabConfigService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import ConfirmModal   from "../../components/common/ConfirmModal";
import StatusBadge    from "../../components/common/StatusBadge";

function ConfigModal({ mode, config, onClose, onSave }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState({ name:config?.name||"", domain:config?.domain||"", token:"", description:config?.description||"", is_active:config?.is_active??true });
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [showToken, setShowToken] = useState(false);
  const handle = (e) => { const{name,value,type,checked}=e.target; setForm(f=>({...f,[name]:type==="checkbox"?checked:value})); };
  const submit = async () => {
    setError("");
    if (!form.name.trim())   return setError("Le nom est requis.");
    if (!form.domain.trim()) return setError("Le domaine est requis.");
    if (!isEdit&&!form.token.trim()) return setError("Le token est requis à la création.");
    setLoading(true);
    try {
      if (isEdit) {
        const payload = { name:form.name, description:form.description, is_active:form.is_active };
        if (form.token.trim()) payload.token = form.token;
        await gitlabConfigService.update(config.id, payload);
      } else { await gitlabConfigService.create({ name:form.name, domain:form.domain, token:form.token, description:form.description }); }
      onSave();
    } catch(err) { setError(err.response?.data?.detail||"Une erreur est survenue."); }
    finally { setLoading(false); }
  };
  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{background:"rgba(0,0,0,0.5)",zIndex:1055}} onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content border-0 shadow">
          <div className="modal-header bg-light p-3">
            <h5 className="modal-title"><i className={`${isEdit?"ri-edit-line":"ri-add-line"} me-2 text-primary`}></i>{isEdit?"Modifier la config GitLab":"Nouvelle config GitLab"}</h5>
            <button className="btn-close" onClick={onClose} disabled={loading}></button>
          </div>
          <div className="modal-body p-4">
            {error&&<div className="alert alert-danger py-2 fs-13"><i className="ri-error-warning-line me-1"></i>{error}</div>}
            <div className="row g-3">
              <div className="col-md-6"><label className="form-label fw-medium">Nom <span className="text-danger">*</span></label><input type="text" name="name" className="form-control" placeholder="ex: GitLab Telnet Principal" value={form.name} onChange={handle}/></div>
              <div className="col-md-6"><label className="form-label fw-medium">Domaine <span className="text-danger">*</span>{isEdit&&<span className="text-muted fs-12 ms-2">(non modifiable)</span>}</label><div className="input-group"><span className="input-group-text">https://</span><input type="text" name="domain" className="form-control" placeholder="gitlab.example.com" value={form.domain} onChange={handle} disabled={isEdit}/></div></div>
              <div className="col-12"><label className="form-label fw-medium">Token d'accès GitLab{!isEdit&&<span className="text-danger"> *</span>}{isEdit&&<span className="text-muted fs-12 ms-2">(laisser vide pour conserver l'actuel)</span>}</label><div className="input-group"><span className="input-group-text"><i className="ri-key-line"></i></span><input type={showToken?"text":"password"} name="token" className="form-control" placeholder="glpat-xxxxxxxxxxxxxxxxxxxx" value={form.token} onChange={handle}/><button type="button" className="btn btn-outline-secondary" onClick={()=>setShowToken(!showToken)}><i className={`ri-${showToken?"eye-off":"eye"}-line`}></i></button></div><p className="text-muted fs-12 mt-1 mb-0"><i className="ri-shield-check-line me-1 text-success"></i>Le token est chiffré en AES-256 avant stockage.</p></div>
              <div className="col-12"><label className="form-label fw-medium">Description</label><textarea name="description" className="form-control" rows={2} placeholder="Description optionnelle..." value={form.description} onChange={handle}/></div>
              {isEdit&&<div className="col-12"><div className="form-check form-switch"><input type="checkbox" className="form-check-input" id="isActiveSwitch" name="is_active" checked={form.is_active} onChange={handle}/><label className="form-check-label" htmlFor="isActiveSwitch">{form.is_active?<span className="text-success fw-medium">Configuration active</span>:<span className="text-danger fw-medium">Configuration inactive</span>}</label></div></div>}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-light" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-primary" onClick={submit} disabled={loading}>{loading?<><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement...</>:<><i className="ri-save-line me-1"></i>Enregistrer</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TestModal({ config, onClose }) {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!config) return;
    setLoading(true);
    gitlabConfigService.test(config.id).then(setResult).catch(err=>setResult({status:"error",detail:err.response?.data?.detail||"Erreur réseau"})).finally(()=>setLoading(false));
  }, [config]);
  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{background:"rgba(0,0,0,0.5)",zIndex:1055}} onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow">
          <div className="modal-header bg-light p-3"><h5 className="modal-title"><i className="ri-wifi-line me-2 text-info"></i>Test de connectivité — {config?.name}</h5><button className="btn-close" onClick={onClose}></button></div>
          <div className="modal-body p-4 text-center">
            {loading?(<><span className="spinner-border text-info mb-3 d-block mx-auto"></span><p className="text-muted">Test en cours...</p></>)
            :result?.status==="ok"?(<><i className="ri-checkbox-circle-line text-success fs-1 d-block mb-3"></i><h5 className="text-success">Connexion réussie</h5><p className="text-muted fs-13 mb-0">Connecté en tant que <strong>{result.gitlab_user}</strong></p><p className="text-muted fs-12">{result.gitlab_url}</p></>)
            :(<><i className="ri-close-circle-line text-danger fs-1 d-block mb-3"></i><h5 className="text-danger">Connexion échouée</h5><p className="text-muted fs-13">{result?.detail||"Impossible de joindre GitLab."}</p></>)}
          </div>
          <div className="modal-footer"><button className="btn btn-light" onClick={onClose}>Fermer</button></div>
        </div>
      </div>
    </div>
  );
}

export default function GitLabConfigPage() {
  const [configs,       setConfigs]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modal,         setModal]         = useState(null);
  const [selected,      setSelected]      = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [testTarget,    setTestTarget]    = useState(null);
  const [toast,         setToast]         = useState(null);

  // ✅ FIX : showToast → useCallback (stable reference, passée en dep de handleDelete/handleSave)
  const showToast = useCallback((msg,type="success")=>{
    setToast({msg,type});
    setTimeout(()=>setToast(null),3500);
  },[]);

  // ✅ FIX : loadConfigs → useCallback (évite recréation à chaque render)
  const loadConfigs = useCallback(()=>{
    setLoading(true);
    gitlabConfigService.getAll()
      .then(setConfigs)
      .catch(()=>showToast("Erreur chargement des configurations.","danger"))
      .finally(()=>setLoading(false));
  },[showToast]);

  useEffect(()=>{ loadConfigs(); },[loadConfigs]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try { await gitlabConfigService.delete(deleteTarget.id); setDeleteTarget(null); showToast("Configuration supprimée."); loadConfigs(); }
    catch(err) { setDeleteTarget(null); showToast(err.response?.data?.detail||"Erreur lors de la suppression.","danger"); }
    finally { setDeleteLoading(false); }
  };

  const handleSave = () => {
    setModal(null); setSelected(null);
    showToast(modal==="edit"?"Configuration mise à jour.":"Configuration créée.");
    loadConfigs();
  };

  const activeCount   = configs.filter(c=>c.is_active).length;
  const inactiveCount = configs.filter(c=>!c.is_active).length;

  return (
    <div className="page-content"><div className="container-fluid">
      {toast&&<div className={`alert alert-${toast.type} position-fixed top-0 end-0 m-3 shadow`} style={{zIndex:9999,minWidth:300}}><i className={`${toast.type==="success"?"ri-checkbox-circle-line":"ri-error-warning-line"} me-2`}></i>{toast.msg}</div>}

      <div className="row mb-1"><div className="col-12">
        <div className="page-title-box d-sm-flex align-items-center justify-content-between">
          <h4 className="mb-sm-0"><i className="ri-settings-4-line me-2 text-primary"></i>Configurations GitLab</h4>
          <ol className="breadcrumb m-0"><li className="breadcrumb-item"><a href="/">Dashboard</a></li><li className="breadcrumb-item active">GitLab Configs</li></ol>
        </div>
      </div></div>

      <div className="row mb-4">
        {[{label:"Total Configs",value:configs.length,color:"primary",icon:"ri-settings-4-line"},{label:"Actives",value:activeCount,color:"success",icon:"ri-checkbox-circle-line"},{label:"Inactives",value:inactiveCount,color:"secondary",icon:"ri-forbid-line"},{label:"Multi-tenant",value:"Activé",color:"info",icon:"ri-building-2-line"}].map((s,i)=>(
          <div key={i} className="col-xl-3 col-sm-6"><div className="card card-animate"><div className="card-body"><div className="d-flex align-items-center">
            <div className="avatar-sm flex-shrink-0"><span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-2`}><i className={s.icon}></i></span></div>
            <div className="flex-grow-1 ms-3"><p className="text-uppercase fw-medium text-muted mb-1 fs-12">{s.label}</p><h4 className={`mb-0 text-${s.color}`}>{s.value}</h4></div>
          </div></div></div></div>
        ))}
      </div>

      <div className="card">
        <div className="card-header d-flex align-items-center border-0">
          <h5 className="card-title mb-0 flex-grow-1"><i className="ri-list-check me-2 text-primary"></i>Configurations ({configs.length})</h5>
          <button className="btn btn-primary btn-sm" onClick={()=>{setSelected(null);setModal("create");}}><i className="ri-add-line align-bottom me-1"></i>Nouvelle config</button>
        </div>
        <div className="card-body">
          {loading?<LoadingSpinner text="Chargement des configurations..."/>:configs.length===0?(
            <EmptyState icon="ri-settings-4-line" title="Aucune configuration GitLab" description="Ajoutez votre première instance GitLab pour commencer les extractions." actionLabel="Ajouter une config" onAction={()=>{setSelected(null);setModal("create");}}/>
          ):(
            <div className="table-responsive"><table className="table table-hover align-middle table-nowrap mb-0">
              <thead className="table-light"><tr><th>Nom</th><th>Domaine</th><th>Description</th><th>Statut</th><th>Projets</th><th>Créée le</th><th>Actions</th></tr></thead>
              <tbody>
                {configs.map(config=>(
                  <tr key={config.id}>
                    <td><div className="d-flex align-items-center gap-2"><div className="avatar-xs rounded d-flex align-items-center justify-content-center" style={{background:"#e8ecf8",minWidth:32}}><i className="ri-git-repository-line text-primary"></i></div><span className="fw-semibold">{config.name}</span></div></td>
                    <td><code className="fs-12 bg-light px-2 py-1 rounded">{config.domain}</code></td>
                    <td className="text-muted fs-13" style={{maxWidth:200}}><span className="text-truncate d-block" style={{maxWidth:180}}>{config.description||"—"}</span></td>
                    <td><StatusBadge type="gitlab" value={config.is_active?"active":"inactive"}/></td>
                    <td><span className="badge bg-primary-subtle text-primary">{config.projects_count||0} projets</span></td>
                    <td className="text-muted fs-12">{config.created_at?new Date(config.created_at).toLocaleDateString("fr-FR"):"—"}</td>
                    <td><div className="d-flex gap-1">
                      <button className="btn btn-sm btn-soft-info btn-icon" onClick={()=>setTestTarget(config)} title="Tester"><i className="ri-wifi-line fs-14"></i></button>
                      <button className="btn btn-sm btn-soft-primary btn-icon" onClick={()=>{setSelected(config);setModal("edit");}} title="Modifier"><i className="ri-pencil-fill fs-14"></i></button>
                      <button className="btn btn-sm btn-soft-danger btn-icon" onClick={()=>setDeleteTarget(config)} title="Supprimer"><i className="ri-delete-bin-fill fs-14"></i></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>

    {(modal==="create"||modal==="edit")&&<ConfigModal mode={modal} config={selected} onClose={()=>{setModal(null);setSelected(null);}} onSave={handleSave}/>}
    {testTarget&&<TestModal config={testTarget} onClose={()=>setTestTarget(null)}/>}
    <ConfirmModal show={!!deleteTarget} title="Supprimer cette configuration ?" message={deleteTarget?`Vous allez supprimer la config "${deleteTarget.name}" (${deleteTarget.domain}). Cette action supprimera aussi tous les projets associés.`:""} confirmLabel="Supprimer" confirmColor="danger" loading={deleteLoading} onConfirm={handleDelete} onClose={()=>setDeleteTarget(null)}/>
    </div>
  );
}
