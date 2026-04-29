/**
 * pages/admin/PeriodsPage.jsx
 * CORRECTION v2 :
 *   [FIX] loadPeriods → useCallback (+ import useCallback)
 *   [FIX] showToast   → useCallback
 */
import { useState, useEffect, useCallback } from "react";
import periodService  from "../../services/periodService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import ConfirmModal   from "../../components/common/ConfirmModal";
import StatusBadge    from "../../components/common/StatusBadge";
import Pagination     from "../../components/common/Pagination";

const MONTHS = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function CreatePeriodModal({ onClose, onSave }) {
  const currentDate = new Date();
  const [year,    setYear]    = useState(currentDate.getFullYear());
  const [month,   setMonth]   = useState(currentDate.getMonth()+1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const handleSubmit = async () => {
    setError(""); setLoading(true);
    try { await periodService.create(year,month); onSave(); }
    catch(err) { setError(err.response?.data?.detail||"Erreur lors de la création."); }
    finally { setLoading(false); }
  };
  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{background:"rgba(0,0,0,0.5)",zIndex:1055}} onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-primary p-3"><h5 className="modal-title text-white"><i className="ri-calendar-2-line me-2"></i>Nouvelle Période d'Analyse</h5><button className="btn-close btn-close-white" onClick={onClose} disabled={loading}></button></div>
          <div className="modal-body p-4">
            {error&&<div className="alert alert-danger py-2 fs-13"><i className="ri-error-warning-line me-1"></i>{error}</div>}
            <div className="row g-3">
              <div className="col-6"><label className="form-label fw-medium text-muted fs-12 uppercase">Année</label><input type="number" className="form-control form-control-lg bg-light border-light" value={year} min={2020} max={2030} onChange={(e)=>setYear(parseInt(e.target.value))}/></div>
              <div className="col-6"><label className="form-label fw-medium text-muted fs-12 uppercase">Mois</label><select className="form-select form-select-lg bg-light border-light" value={month} onChange={(e)=>setMonth(parseInt(e.target.value))}>{MONTHS.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}</select></div>
            </div>
            <div className="mt-4 p-3 bg-primary-subtle rounded-3 border border-primary-subtle">
              <div className="d-flex align-items-center"><i className="ri-information-fill fs-3 text-primary me-3"></i><p className="mb-0 fs-13 text-primary-emphasis">L'ouverture d'une période permet de commencer les extractions de données pour ce mois précis.</p></div>
            </div>
          </div>
          <div className="modal-footer bg-light p-3">
            <button className="btn btn-ghost-dark" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-primary px-4 shadow-sm" onClick={handleSubmit} disabled={loading}>{loading?<><span className="spinner-border spinner-border-sm me-2"></span>Initialisation...</>:<><i className="ri-add-line me-1"></i>Créer la période</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdvancedCloseModal({ period, onClose, onConfirm }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    periodService.validate(period.id)
      .then(setData)
      .catch(err => setError("Impossible de charger le bilan de validation."))
      .finally(() => setLoading(false));
  }, [period.id]);

  const handleConfirm = async () => {
    setConfirming(true);
    try { await onConfirm(); }
    catch(err) { setError(err.response?.data?.detail || "Erreur lors de la clôture."); setConfirming(false); }
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{background:"rgba(0,0,0,0.5)",zIndex:1056}} onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-danger p-3"><h5 className="modal-title text-white"><i className="ri-lock-2-line me-2"></i>Clôture de Période (Governance Check)</h5><button className="btn-close btn-close-white" onClick={onClose} disabled={confirming}></button></div>
          <div className="modal-body p-4">
            <p className="text-muted">Analyse de l'intégrité des données pour <strong>{period.year}/{String(period.month).padStart(2,"0")}</strong> avant verrouillage définitif.</p>
            
            {loading ? (
              <div className="text-center py-4"><div className="spinner-border text-primary"></div><p className="mt-3 text-muted">Vérification des extractions...</p></div>
            ) : error ? (
              <div className="alert alert-danger"><i className="ri-error-warning-line me-2"></i>{error}</div>
            ) : (
              <div className="vstack gap-3">
                <div className={`p-3 rounded-3 border ${data.can_close ? 'bg-success-subtle border-success-subtle' : 'bg-danger-subtle border-danger-subtle'}`}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className={`mb-1 ${data.can_close ? 'text-success' : 'text-danger'}`}>{data.can_close ? "Prêt pour la clôture" : "Clôture bloquée"}</h6>
                      <p className="mb-0 fs-12 text-muted">{data.running_jobs > 0 ? "Des extractions sont encore en cours d'exécution." : "Tous les jobs actifs sont terminés."}</p>
                    </div>
                    <i className={`${data.can_close ? 'ri-checkbox-circle-fill text-success' : 'ri-error-warning-fill text-danger'} fs-1`}></i>
                  </div>
                </div>

                <div className="row g-2">
                  <div className="col-4"><div className="p-2 border rounded-2 text-center bg-light"><span className="d-block fs-11 text-muted uppercase">Terminés</span><strong className="fs-16 text-success">{data.completed_jobs}</strong></div></div>
                  <div className="col-4"><div className="p-2 border rounded-2 text-center bg-light"><span className="d-block fs-11 text-muted uppercase">En cours</span><strong className={`fs-16 ${data.running_jobs > 0 ? 'text-warning' : 'text-muted'}`}>{data.running_jobs}</strong></div></div>
                  <div className="col-4"><div className="p-2 border rounded-2 text-center bg-light"><span className="d-block fs-11 text-muted uppercase">Échecs</span><strong className={`fs-16 ${data.failed_jobs > 0 ? 'text-danger' : 'text-muted'}`}>{data.failed_jobs}</strong></div></div>
                </div>

                {data.warnings.length > 0 && (
                  <div className="alert alert-warning py-2 mb-0 fs-13"><i className="ri-alert-line me-2"></i>{data.warnings[0]}</div>
                )}
                
                <div className="alert alert-secondary py-2 mb-0 fs-12 border-0 bg-light">
                  <i className="ri-information-line me-2"></i>Une fois clôturée, la période devient <strong>immuable</strong>. Les snapshots KPI seront générés pour le reporting stratégique.
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer bg-light p-3">
            <button className="btn btn-ghost-dark" onClick={onClose} disabled={confirming}>Annuler</button>
            <button className="btn btn-danger px-4 shadow-sm" onClick={handleConfirm} disabled={!data?.can_close || confirming}>{confirming?<><span className="spinner-border spinner-border-sm me-2"></span>Verrouillage...</>:<><i className="ri-lock-line me-1"></i>Confirmer la Clôture</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PeriodsPage() {
  const [periods,      setPeriods]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showCreate,   setShowCreate]   = useState(false);
  const [closeTarget,  setCloseTarget]  = useState(null);
  const [closeLoading, setCloseLoading] = useState(false);
  const [toast,        setToast]        = useState(null);
  const [page,         setPage]         = useState(1);
  const perPage = 10;

  // ✅ FIX : useCallback pour stabilité de référence
  const showToast = useCallback((msg,type="success")=>{
    setToast({msg,type});
    setTimeout(()=>setToast(null),3500);
  },[]);

  // ✅ FIX : useCallback — loadPeriods peut maintenant être passé en deps sans créer de boucle
  const loadPeriods = useCallback(()=>{
    setLoading(true);
    periodService.getAll()
      .then(setPeriods)
      .catch(()=>showToast("Erreur chargement des périodes.","danger"))
      .finally(()=>setLoading(false));
  },[showToast]);

  useEffect(()=>{ loadPeriods(); },[loadPeriods]);

  const handleClose = async () => {
    if (!closeTarget) return;
    setCloseLoading(true);
    try {
      await periodService.close(closeTarget.id);
      setCloseTarget(null);
      showToast(`Période ${closeTarget.year}/${String(closeTarget.month).padStart(2,"0")} clôturée.`);
      loadPeriods();
    } catch(err) { setCloseTarget(null); showToast(err.response?.data?.detail||"Erreur lors de la clôture.","danger"); }
    finally { setCloseLoading(false); }
  };

  const openCount   = periods.filter(p=>p.status==="open").length;
  const closedCount = periods.filter(p=>p.status==="closed").length;
  const totalPages  = Math.ceil(periods.length/perPage);
  const paginated   = periods.slice((page-1)*perPage,page*perPage);

  return (
    <div className="page-content"><div className="container-fluid">
      {toast&&<div className={`alert alert-${toast.type} position-fixed top-0 end-0 m-3 shadow`} style={{zIndex:9999,minWidth:300}}><i className={`${toast.type==="success"?"ri-checkbox-circle-line":"ri-error-warning-line"} me-2`}></i>{toast.msg}</div>}

      <div className="row mb-1"><div className="col-12">
        <div className="page-title-box d-sm-flex align-items-center justify-content-between">
          <h4 className="mb-sm-0"><i className="ri-calendar-2-line me-2 text-primary"></i>Gestion des Périodes</h4>
          <ol className="breadcrumb m-0"><li className="breadcrumb-item"><a href="/">Dashboard</a></li><li className="breadcrumb-item active">Périodes</li></ol>
        </div>
      </div></div>

      <div className="row mb-4">
        {[{label:"Total Périodes",value:periods.length,color:"primary",icon:"ri-calendar-2-line"},{label:"Périodes Ouvertes",value:openCount,color:"success",icon:"ri-lock-unlock-line"},{label:"Périodes Clôturées",value:closedCount,color:"secondary",icon:"ri-lock-line"},{label:"Règle RG-01",value:"Active",color:"warning",icon:"ri-shield-check-line"}].map((s,i)=>(
          <div key={i} className="col-xl-3 col-sm-6"><div className="card card-animate"><div className="card-body"><div className="d-flex align-items-center">
            <div className="avatar-sm flex-shrink-0"><span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-2`}><i className={s.icon}></i></span></div>
            <div className="flex-grow-1 ms-3"><p className="text-uppercase fw-medium text-muted mb-1 fs-12">{s.label}</p><h4 className={`mb-0 text-${s.color}`}>{s.value}</h4></div>
          </div></div></div></div>
        ))}
      </div>

      <div className="alert alert-warning d-flex align-items-start gap-3 mb-4">
        <i className="ri-shield-check-line fs-4 flex-shrink-0 mt-1"></i>
        <div><strong>Règle métier RG-01 :</strong> Les extractions sont bloquées si la période courante est clôturée. Clôturer une période déclenche le dump mensuel automatique (archivage des lots REALTIME → MONTHLY + génération des snapshots KPI).</div>
      </div>

      <div className="card">
        <div className="card-header d-flex align-items-center border-0">
          <h5 className="card-title mb-0 flex-grow-1"><i className="ri-list-check me-2 text-primary"></i>Périodes ({periods.length})</h5>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowCreate(true)}><i className="ri-add-line align-bottom me-1"></i>Nouvelle période</button>
        </div>
        <div className="card-body">
          {loading?<LoadingSpinner text="Chargement des périodes..."/>:periods.length===0?(
            <EmptyState icon="ri-calendar-2-line" title="Aucune période" description="Créez votre première période pour commencer les extractions." actionLabel="Créer une période" onAction={()=>setShowCreate(true)}/>
          ):(
            <>
              <div className="table-responsive"><table className="table table-hover align-middle table-nowrap mb-0">
                <thead className="table-light"><tr><th>ID</th><th>Période</th><th>Mois</th><th>Statut</th><th>Créée le</th><th>Clôturée le</th><th>Actions</th></tr></thead>
                <tbody>
                  {paginated.map(period=>(
                    <tr key={period.id}>
                      <td className="text-muted fs-12">#{period.id}</td>
                      <td>
                        <div className="d-flex align-items-center">
                          <div className="flex-shrink-0 avatar-xs me-2">
                            <div className="avatar-title bg-light text-primary rounded-circle fs-12">
                              {period.month}
                            </div>
                          </div>
                          <span className="fw-semibold fs-14">{period.year} / {String(period.month).padStart(2,"0")}</span>
                        </div>
                      </td>
                      <td className="text-muted">{MONTHS[period.month]}</td>
                      <td><StatusBadge type="period" value={period.status}/></td>
                      <td className="text-muted fs-12">
                        <i className="ri-time-line me-1"></i>
                        {period.created_at?new Date(period.created_at).toLocaleDateString("fr-FR"):"—"}
                      </td>
                      <td className="fs-12">
                        {period.closed_at ? (
                          <div className="d-flex flex-column">
                            <span><i className="ri-calendar-check-line me-1 text-success"></i>{new Date(period.closed_at).toLocaleDateString("fr-FR")}</span>
                            <span className="text-muted"><i className="ri-user-follow-line me-1"></i>{period.closed_by_name || "Système"}</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td>
                        {period.status==="open" ? (
                          <button className="btn btn-sm btn-soft-danger waves-effect waves-light" onClick={()=>setCloseTarget(period)} title="Clôturer cette période">
                            <i className="ri-lock-password-line me-1"></i>Clôturer
                          </button>
                        ) : (
                          <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1">
                            <i className="ri-shield-user-line me-1"></i>Archive Scellée
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <Pagination page={page} totalPages={totalPages} totalItems={periods.length} perPage={perPage} onPageChange={setPage}/>
            </>
          )}
        </div>
      </div>
    </div>

    {showCreate&&<CreatePeriodModal onClose={()=>setShowCreate(false)} onSave={()=>{setShowCreate(false);showToast("Période créée avec succès.");loadPeriods();}}/>}
    {closeTarget && (
      <AdvancedCloseModal 
        period={closeTarget} 
        onClose={() => setCloseTarget(null)} 
        onConfirm={handleClose} 
      />
    )}
    </div>
  );
}
