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
import AdminModal from "../../components/common/AdminModal";
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
    <AdminModal
      show={true}
      onClose={onClose}
      title={isEdit ? "Modifier la configuration" : "Nouvelle config GitLab"}
      subtitle={isEdit ? "Mettre à jour les accès de l'instance" : "Connecter une nouvelle instance GitLab Telnet"}
      icon={isEdit ? "ri-settings-5-line" : "ri-add-line"}
      loading={loading}
      maxWidth={640}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4 fw-medium" onClick={onClose} disabled={loading}>Annuler</button>
          <button className="btn btn-sm btn-primary px-4 fw-bold shadow-sm" onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement...</> : <><i className="ri-save-line me-1"></i>Enregistrer</>}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-danger py-2 fs-13 mb-3"><i className="ri-error-warning-line me-1"></i>{error}</div>}
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label fw-medium fs-13">Nom <span className="text-danger">*</span></label>
          <input type="text" name="name" className="form-control" placeholder="ex: GitLab Telnet Principal" value={form.name} onChange={handle}/>
        </div>
        <div className="col-md-6">
          <label className="form-label fw-medium fs-13">Domaine <span className="text-danger">*</span>{isEdit && <span className="text-muted fs-11 ms-2">(non modifiable)</span>}</label>
          <div className="input-group">
            <span className="input-group-text bg-light border-end-0">https://</span>
            <input type="text" name="domain" className="form-control border-start-0 ps-0" placeholder="gitlab.example.com" value={form.domain} onChange={handle} disabled={isEdit}/>
          </div>
        </div>
        <div className="col-12">
          <label className="form-label fw-medium fs-13">Token d'accès GitLab {!isEdit && <span className="text-danger">*</span>}{isEdit && <span className="text-muted fs-11 ms-2">(laisser vide pour conserver l'actuel)</span>}</label>
          <div className="input-group shadow-sm">
            <span className="input-group-text bg-light border-end-0"><i className="ri-key-line text-muted"></i></span>
            <input type={showToken ? "text" : "password"} name="token" className="form-control border-start-0 ps-0" placeholder="glpat-xxxxxxxxxxxxxxxxxxxx" value={form.token} onChange={handle}/>
            <button type="button" className="btn btn-outline-light border text-muted px-3" onClick={() => setShowToken(!showToken)}>
              <i className={`ri-${showToken ? "eye-off" : "eye"}-line`}></i>
            </button>
          </div>
          <p className="text-muted fs-11 mt-2 mb-0"><i className="ri-shield-check-line me-1 text-success"></i>Le token est chiffré en AES-256 avant stockage.</p>
        </div>
        <div className="col-12">
          <label className="form-label fw-medium fs-13">Description</label>
          <textarea name="description" className="form-control" rows={3} placeholder="Description optionnelle (ex: Serveur de production...)" value={form.description} onChange={handle}/>
        </div>
        {isEdit && (
          <div className="col-12">
            <div className="rounded-3 p-3 d-flex align-items-center justify-content-between" style={{background:form.is_active?"#f0fdf4":"#f8f9fa", border:`1px solid ${form.is_active?"#d1fae5":"#e9ecef"}`}}>
              <div>
                <div className={`fw-medium fs-13 ${form.is_active?"text-success":"text-muted"}`}><i className={`${form.is_active?"ri-checkbox-circle-line":"ri-forbid-line"} me-1`}></i>{form.is_active?"Instance active":"Instance inactive"}</div>
                <div className="text-muted fs-11">{form.is_active?"Disponible pour les extractions":"Extractions désactivées"}</div>
              </div>
              <div className="form-check form-switch mb-0">
                <input type="checkbox" className="form-check-input" role="switch" name="is_active" checked={form.is_active} onChange={handle} style={{width:"2.5em", height:"1.4em", cursor:"pointer"}}/>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminModal>
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

  const isSuccess = result?.status === "ok";

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Test de connectivité"
      subtitle={`Vérification de l'accès à ${config?.domain}`}
      icon={loading ? "ri-loader-4-line" : (isSuccess ? "ri-wifi-line" : "ri-wifi-off-line")}
      iconBg={loading ? "bg-info-subtle" : (isSuccess ? "bg-success-subtle" : "bg-danger-subtle")}
      iconColor={loading ? "text-info" : (isSuccess ? "text-success" : "text-danger")}
      iconStyle={loading ? { animation: 'spinner-border 2s linear infinite' } : {}}
      maxWidth={400}
      footer={<button className="btn btn-sm btn-light px-4" onClick={onClose}>Fermer</button>}
    >
      <div className="text-center py-2">
        {loading ? (
          <div className="py-4">
            <div className="spinner-border text-info mb-3"></div>
            <p className="text-muted mb-0">Communication avec l'API GitLab...</p>
          </div>
        ) : isSuccess ? (
          <div className="py-3">
            <div className="avatar-lg mx-auto mb-3">
              <div className="avatar-title bg-success-subtle text-success rounded-circle display-4">
                <i className="ri-checkbox-circle-fill"></i>
              </div>
            </div>
            <h5 className="text-success fw-bold">Connexion réussie</h5>
            <p className="text-muted fs-13 mb-0">Connecté en tant que <strong>{result.gitlab_user}</strong></p>
            <p className="text-muted fs-11">{result.gitlab_url}</p>
          </div>
        ) : (
          <div className="py-3">
            <div className="avatar-lg mx-auto mb-3">
              <div className="avatar-title bg-danger-subtle text-danger rounded-circle display-4">
                <i className="ri-close-circle-fill"></i>
              </div>
            </div>
            <h5 className="text-danger fw-bold">Échec de connexion</h5>
            <p className="text-muted fs-13 mb-0">{result?.detail || "Impossible de joindre GitLab."}</p>
          </div>
        )}
      </div>
    </AdminModal>
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

  //  FIX : showToast → useCallback (stable reference, passée en dep de handleDelete/handleSave)
  const showToast = useCallback((msg,type="success")=>{
    setToast({msg,type});
    setTimeout(()=>setToast(null),3500);
  },[]);

  //  FIX : loadConfigs → useCallback (évite recréation à chaque render)
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
    <div className="page-content">
      <div className="container-fluid">
        {toast && <div className={`alert alert-${toast.type} position-fixed top-0 end-0 m-3 shadow`} style={{ zIndex: 9999, minWidth: 300 }}><i className={`${toast.type === "success" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} me-2`}></i>{toast.msg}</div>}

        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-settings-4-line me-2 text-primary"></i>Instances GitLab
              </h4>
              <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => { setSelected(null); setModal("create"); }}>
                <i className="ri-add-line me-1"></i> Nouvelle Instance
              </button>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Configurations</li>
            </ol>
          </div>
        </div>

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
          <h5 className="card-title mb-0 flex-grow-1"><i className="ri-list-check me-2 text-primary"></i>Liste des Instances ({configs.length})</h5>
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
