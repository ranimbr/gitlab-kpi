/**
 * pages/admin/SitesPage.jsx
 * CORRECTION v2 :
 *   [FIX] handleDelete : gestion spécifique de l'erreur 409 Conflict
 *         (site a des projets/développeurs liés → message d'erreur explicite)
 *         Au lieu d'un alert() générique, le toast affiche le message API.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import siteService from "../../services/siteService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import ConfirmModal   from "../../components/common/ConfirmModal";
import StatusBadge    from "../../components/common/StatusBadge";
import Pagination     from "../../components/common/Pagination";

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`alert alert-${toast.type} d-flex align-items-center gap-2 position-fixed top-0 end-0 m-3 shadow`}
      style={{ zIndex:9999, minWidth:300, borderRadius:10 }}>
      <i className={toast.type==="success"?"ri-checkbox-circle-line fs-16":"ri-error-warning-line fs-16"}></i>
      <span>{toast.msg}</span>
    </div>
  );
}

const SITE_COLORS = ["primary","success","info","warning","danger","secondary"];
const siteColor = (name="") => {
  let h = 0;
  for (let i=0;i<name.length;i++) h = name.charCodeAt(i) + ((h<<5)-h);
  return SITE_COLORS[Math.abs(h) % SITE_COLORS.length];
};

function SiteModal({ site, onClose, onSave }) {
  const isEdit = !!site?.id;
  const [form, setForm] = useState({ name:site?.name||"", country:site?.country||"", timezone:site?.timezone||"", is_active:site?.is_active??true });
  const [loading, setLoading] = useState(false);
  const [guessing, setGuessing] = useState(false);
  const [error,   setError]   = useState("");
  const [tzList,  setTzList]  = useState([]);

  useEffect(() => {
    siteService.getTimezones().then(setTzList).catch(() => {});
  }, []);

  const handle = (e) => { const{name,value,type,checked}=e.target; setForm(f=>({...f,[name]:type==="checkbox"?checked:value})); };

  const handleGuess = async () => {
    if (!form.name.trim()) return setError("Entrez un nom de ville d'abord.");
    setGuessing(true);
    try {
      const res = await siteService.guessInfo(form.name);
      setForm(f => ({ ...f, country: res.country !== "À définir" ? res.country : f.country, timezone: res.timezone || f.timezone }));
    } catch(e) {}
    finally { setGuessing(false); }
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Le nom du site est requis.");
    setLoading(true);
    try {
      const payload = { name:form.name.trim(), country:form.country.trim()||null, timezone:form.timezone.trim()||null, is_active:form.is_active };
      if (isEdit) await siteService.update(site.id,payload);
      else        await siteService.create(payload);
      onSave();
    } catch(err) { setError(err.response?.data?.detail||"Erreur lors de l'enregistrement."); }
    finally { setLoading(false); }
  };
  const color = siteColor(form.name);
  return (
    <div className="modal fade show d-block" style={{backgroundColor:"rgba(30,34,45,0.6)",backdropFilter:"blur(3px)",zIndex:1055}} onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal-dialog modal-dialog-centered" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div className="modal-content border-0" style={{borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,0.18)"}}>
          <div className="px-4 pt-4 pb-3" style={{borderBottom:"1px solid #f1f3f7"}}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center text-white fs-18" style={{width:44,height:44,background:`var(--vz-${color},#405189)`}}><i className="ri-map-pin-2-line"></i></div>
              <div className="flex-grow-1"><h5 className="fw-semibold text-dark mb-0 fs-15">{isEdit?`Modifier — ${site.name}`:"Nouveau site"}</h5><p className="text-muted fs-12 mb-0">{isEdit?"Mettre à jour les informations du site":"Créer un nouveau site géographique"}</p></div>
              <button className="btn-close" onClick={onClose} disabled={loading} style={{opacity:0.5}}></button>
            </div>
          </div>
          <div className="px-4 py-4">
            {error&&<div className="alert alert-danger py-2 fs-13 mb-3"><i className="ri-error-warning-line me-1"></i>{error}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Nom du site (Ville) <span className="text-danger">*</span></label>
                <div className="input-group shadow-sm">
                  <span className="input-group-text bg-light border-end-0"><i className="ri-map-pin-line text-muted"></i></span>
                  <input type="text" name="name" className="form-control border-start-0 ps-0" placeholder="ex: Paris, Tunis, Lyon…" value={form.name} onChange={handle} autoFocus/>
                  <button className="btn btn-soft-info" type="button" onClick={handleGuess} disabled={guessing || !form.name}>
                    {guessing ? <span className="spinner-border spinner-border-sm"></span> : <><i className="ri-magic-line me-1"></i> Auto-remplir</>}
                  </button>
                </div>
              </div>
              <div className="col-md-6"><label className="form-label fw-medium fs-13">Pays</label><div className="input-group"><span className="input-group-text bg-light"><i className="ri-flag-line text-muted"></i></span><input type="text" name="country" className="form-control" placeholder="ex: France, Tunisie…" value={form.country} onChange={handle}/></div></div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Fuseau horaire</label>
                <div className="input-group">
                  <span className="input-group-text bg-light"><i className="ri-time-line text-muted"></i></span>
                  <input type="text" name="timezone" className="form-control" placeholder="ex: Europe/Paris" value={form.timezone} onChange={handle} list="timezone-list"/>
                  <datalist id="timezone-list">
                    {tzList.map(tz => <option key={tz} value={tz} />)}
                  </datalist>
                </div>
                <div className="form-text fs-11"><i className="ri-information-line me-1"></i>Format IANA (ex: Europe/Paris)</div>
              </div>
              <div className="col-12">
                <div className="rounded-3 p-3 d-flex align-items-center justify-content-between" style={{background:form.is_active?"#f0fdf4":"#f8f9fa",border:`1px solid ${form.is_active?"#d1fae5":"#e9ecef"}`}}>
                  <div><div className={`fw-medium fs-13 ${form.is_active?"text-success":"text-muted"}`}><i className={`${form.is_active?"ri-checkbox-circle-line":"ri-forbid-line"} me-1`}></i>{form.is_active?"Site actif":"Site inactif"}</div><div className="text-muted fs-12">{form.is_active?"Disponible dans les filtres et dropdowns":"Masqué dans les filtres"}</div></div>
                  <div className="form-check form-switch mb-0"><input type="checkbox" className="form-check-input" role="switch" name="is_active" checked={form.is_active} onChange={handle} style={{width:"2.5em",height:"1.4em",cursor:"pointer"}}/></div>
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 d-flex justify-content-end gap-2" style={{borderTop:"1px solid #f1f3f7",background:"#fafbfc",borderRadius:"0 0 16px 16px"}}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>{loading?<><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement…</>:<><i className="ri-save-line me-1"></i>{isEdit?"Mettre à jour":"Créer le site"}</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SitesPage() {
  const [sites,         setSites]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [modalSite,     setModalSite]     = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast,         setToast]         = useState(null);
  const [page,          setPage]          = useState(1);
  const perPage = 10;

  const showToast = useCallback((msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);},[]);

  const load = useCallback(async()=>{
    setLoading(true);
    try { const data=await siteService.getAll(false); setSites(Array.isArray(data)?data:[]); }
    catch { showToast("Erreur lors du chargement des sites.","danger"); }
    finally { setLoading(false); }
  },[showToast]);

  useEffect(()=>{load();},[load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await siteService.delete(deleteTarget.id);
      showToast(`Site "${deleteTarget.name}" supprimé.`);
      setDeleteTarget(null);
      load();
    } catch(err) {
      // ✅ FIX : gestion spécifique 409 Conflict (site a des projets/devs liés)
      const status  = err.response?.status;
      const detail  = err.response?.data?.detail;
      const message = status===409
        ? `Impossible de supprimer "${deleteTarget.name}" : des projets ou développeurs y sont encore liés.`
        : detail || "Erreur lors de la suppression.";
      showToast(message,"danger");
      setDeleteTarget(null);
    } finally { setDeleteLoading(false); }
  };

  const filtered = useMemo(()=>sites.filter(s=>{
    const q   = search.toLowerCase();
    const ms  = !q || s.name.toLowerCase().includes(q) || (s.country||"").toLowerCase().includes(q);
    const mst = statusFilter==="all"?true:statusFilter==="active"?s.is_active:!s.is_active;
    return ms&&mst;
  }),[sites,search,statusFilter]);

  useEffect(()=>{setPage(1);},[search,statusFilter]);

  const totalPages = Math.ceil(filtered.length/perPage);
  const paginated  = filtered.slice((page-1)*perPage,page*perPage);
  const activeSites   = sites.filter(s=>s.is_active).length;
  const inactiveSites = sites.filter(s=>!s.is_active).length;
  const countries     = new Set(sites.map(s=>s.country).filter(Boolean)).size;

  return (
    <div className="page-content"><div className="container-fluid">
      <Toast toast={toast}/>

      <div className="row"><div className="col-12">
        <div className="page-title-box d-sm-flex align-items-center justify-content-between">
          <h4 className="mb-sm-0"><i className="ri-map-pin-line me-2 text-primary"></i>Gestion des Sites</h4>
          <ol className="breadcrumb m-0"><li className="breadcrumb-item"><a href="/">Dashboard</a></li><li className="breadcrumb-item">Administration</li><li className="breadcrumb-item active">Sites</li></ol>
        </div>
      </div></div>

      <div className="alert alert-info d-flex align-items-start gap-3 mb-4">
        <i className="ri-information-line fs-4 flex-shrink-0 mt-1 text-info"></i>
        <div><strong>Entité Site</strong> — Les sites remplacent le champ <code>site:String</code> dans toute l'application. Chaque développeur, groupe, projet et snapshot KPI référence désormais un <code>site_id</code> (FK) vers cette table.</div>
      </div>

      <div className="row mb-4">
        {[{label:"Total Sites",value:sites.length,color:"primary",icon:"ri-map-pin-line",sub:`${countries} pays`},{label:"Sites Actifs",value:activeSites,color:"success",icon:"ri-checkbox-circle-line",sub:"Dans les dropdowns"},{label:"Sites Inactifs",value:inactiveSites,color:"secondary",icon:"ri-forbid-line",sub:"Masqués"},{label:"Pays",value:countries,color:"info",icon:"ri-flag-line",sub:"Pays représentés"}].map((s,i)=>(
          <div key={i} className="col-xl-3 col-sm-6"><div className="card card-animate"><div className="card-body"><div className="d-flex align-items-center">
            <div className="avatar-sm flex-shrink-0"><span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-2`}><i className={s.icon}></i></span></div>
            <div className="flex-grow-1 ms-3"><p className="text-uppercase fw-medium text-muted mb-1 fs-12">{s.label}</p><h4 className="mb-0">{s.value}</h4><p className="text-muted mb-0 fs-12">{s.sub}</p></div>
          </div></div></div></div>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><div className="row g-2 align-items-center">
          <div className="col-md-4"><div className="search-box"><input type="text" className="form-control" placeholder="Rechercher par nom, pays…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/><i className="ri-search-line search-icon"></i></div></div>
          <div className="col-md-2"><select className="form-select" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}}><option value="all">Tous les statuts</option><option value="active">Actifs</option><option value="inactive">Inactifs</option></select></div>
          <div className="col-md-auto ms-auto"><button className="btn btn-primary" onClick={()=>setModalSite({})}><i className="ri-add-line me-1"></i>Nouveau site</button></div>
        </div></div>
        <div className="card-body">
          {loading?<LoadingSpinner text="Chargement des sites…"/>:filtered.length===0?(
            <EmptyState icon="ri-map-pin-line" title="Aucun site trouvé" description={search?"Aucun résultat pour cette recherche.":"Créez votre premier site géographique."} actionLabel="Nouveau site" onAction={()=>setModalSite({})} compact/>
          ):(
            <>
              <div className="table-responsive"><table className="table table-hover align-middle table-nowrap mb-0">
                <thead className="table-light"><tr><th>Site</th><th>Pays</th><th>Fuseau horaire</th><th>Statut</th><th>Créé le</th><th className="text-center">Actions</th></tr></thead>
                <tbody>
                  {paginated.map(site=>{
                    const color = siteColor(site.name);
                    return (
                      <tr key={site.id}>
                        <td><div className="d-flex align-items-center gap-3"><div className="rounded-circle d-flex align-items-center justify-content-center text-white fs-14 fw-bold flex-shrink-0" style={{width:36,height:36,background:`var(--vz-${color},#405189)`}}>{site.name.slice(0,2).toUpperCase()}</div><div><p className="fw-semibold mb-0 fs-13">{site.name}</p><p className="text-muted mb-0 fs-11">ID #{site.id}</p></div></div></td>
                        <td>{site.country?<span className="badge bg-light text-dark"><i className="ri-flag-line me-1"></i>{site.country}</span>:<span className="text-muted fs-12">—</span>}</td>
                        <td>{site.timezone?<code className="fs-12 bg-light px-2 py-1 rounded">{site.timezone}</code>:<span className="text-muted fs-12">—</span>}</td>
                        <td><StatusBadge type="site" value={String(site.is_active)}/></td>
                        <td className="text-muted fs-12">{site.created_at?new Date(site.created_at).toLocaleDateString("fr-FR"):"—"}</td>
                        <td className="text-center"><div className="d-flex gap-1 justify-content-center">
                          <button className="btn btn-sm btn-icon btn-soft-primary" onClick={()=>setModalSite(site)} title="Modifier"><i className="ri-pencil-fill fs-14"></i></button>
                          <button className="btn btn-sm btn-icon btn-soft-danger" onClick={()=>setDeleteTarget(site)} title="Supprimer"><i className="ri-delete-bin-fill fs-14"></i></button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
              <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage}/>
            </>
          )}
        </div>
      </div>
    </div>

    {modalSite!==null&&<SiteModal site={modalSite.id?modalSite:null} onClose={()=>setModalSite(null)} onSave={()=>{setModalSite(null);showToast("Site enregistré avec succès.");load();}}/>}
    <ConfirmModal show={!!deleteTarget} title="Supprimer ce site ?" message={deleteTarget?`Supprimer "${deleteTarget.name}" ? Les développeurs, groupes et projets associés à ce site devront être réassignés manuellement.`:""} confirmLabel="Supprimer définitivement" confirmColor="danger" icon="ri-map-pin-2-line" iconColor="danger" loading={deleteLoading} onConfirm={handleDelete} onClose={()=>setDeleteTarget(null)}/>
    </div>
  );
}
