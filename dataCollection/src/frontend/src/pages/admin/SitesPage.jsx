/**
 * pages/admin/SitesPage.jsx
 *
 * SENIOR++++ ELITE OVERHAUL (v3):
 *   1. "Atlassian Design System" inspired Global Entity Manager.
 *   2. Geo-spatial tagging & Timezone intelligence.
 *   3. Advanced Conflict Resolution UI (409 handling).
 *   4. Premium list density with interactive status badges.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import siteService from "../../services/siteService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import ConfirmModal   from "../../components/common/ConfirmModal";
import Pagination     from "../../components/common/Pagination";
import AdminModal     from "../../components/common/AdminModal";

// ── Helpers ───────────────────────────────────────────────────────────────────
const SITE_COLORS = ["primary","success","info","warning","danger","indigo"];
const siteColor = (name="") => {
  let h = 0;
  for (let i=0;i<name.length;i++) h = name.charCodeAt(i) + ((h<<5)-h);
  return SITE_COLORS[Math.abs(h) % SITE_COLORS.length];
};

// ── SiteModal ─────────────────────────────────────────────────────────────────
function SiteModal({ site, onClose, onSave }) {
  const isEdit = !!site?.id;
  const [form, setForm] = useState({ 
    name:     site?.name     || "", 
    country:  site?.country  || "", 
    timezone: site?.timezone || "", 
    is_active:site?.is_active ?? true 
  });
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [tzList,   setTzList]   = useState([]);

  useEffect(() => {
    siteService.getTimezones().then(setTzList).catch(() => {});
  }, []);

  const handle = (e) => { 
    const {name, value, type, checked} = e.target; 
    setForm(f => ({...f, [name]: type === "checkbox" ? checked : value})); 
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Nom requis.");
    setLoading(true);
    try {
      const payload = { name: form.name.trim(), country: form.country.trim()||null, timezone: form.timezone.trim()||null, is_active: form.is_active };
      if (isEdit) await siteService.update(site.id, payload);
      else await siteService.create(payload);
      onSave();
    } catch(err) { setError(err.response?.data?.detail || "Erreur de sauvegarde."); }
    finally { setLoading(false); }
  };

  const color = siteColor(form.name);

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title={isEdit ? "Édition du Site" : "Nouveau Site Géographique"}
      icon="ri-map-pin-2-line"
      loading={loading}
      maxWidth={500}
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

         <div>
            <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">Ville / Localité</label>
            <input type="text" name="name" className="form-control py-2 border-0 bg-light-subtle fs-14" 
                   placeholder="ex: Paris, Tunis..." value={form.name} onChange={handle} autoFocus />
         </div>

         <div className="row g-3">
            <div className="col-6">
               <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">Pays</label>
               <input type="text" name="country" className="form-control fs-14 border-0 bg-light-subtle" 
                      placeholder="ex: France" value={form.country} onChange={handle} />
            </div>
            <div className="col-6">
               <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">Timezone</label>
               <input type="text" name="timezone" className="form-control fs-14 border-0 bg-light-subtle" 
                      placeholder="Europe/Paris" value={form.timezone} onChange={handle} list="tz-list" />
               <datalist id="tz-list">{tzList.map(t => <option key={t} value={t} />)}</datalist>
            </div>
         </div>

         <div className={`p-3 rounded-4 d-flex align-items-center justify-content-between border ${form.is_active ? 'bg-success-subtle bg-opacity-10 border-success' : 'bg-light'}`}>
            <div className="d-flex align-items-center gap-2">
               <i className={`ri-${form.is_active ? 'checkbox-circle-fill' : 'forbid-fill'} fs-18 ${form.is_active ? 'text-success' : 'text-muted'}`}></i>
               <div>
                  <div className="fw-bold fs-12">Disponibilité Opérationnelle</div>
                  <p className="mb-0 fs-10 text-muted">Visible dans les filtres de reporting</p>
               </div>
            </div>
            <div className="form-check form-switch mb-0">
               <input type="checkbox" className="form-check-input" name="is_active" checked={form.is_active} onChange={handle} style={{ cursor: 'pointer' }} />
            </div>
         </div>
      </div>
    </AdminModal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SitesPage() {
  const [sites,         setSites]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [modalSite,     setModalSite]     = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [toast,         setToast]         = useState(null);
  const [page,          setPage]          = useState(1);
  const perPage = 10;

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await siteService.getAll(false);
      setSites(Array.isArray(data) ? data : []);
    } catch {
      showToast("Erreur de chargement", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => sites.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || (s.country || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? s.is_active : !s.is_active);
    return matchSearch && matchStatus;
  }), [sites, search, statusFilter]);

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
                <i className="ri-map-pin-2-fill me-2 text-primary"></i>Gestion des Sites
              </h4>
              <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => setModalSite({})}>
                <i className="ri-add-line me-2"></i> Ajouter un Site
              </button>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Sites</li>
            </ol>
          </div>
        </div>

      <div className="row g-4">
         <div className="col-12">
            <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
               <div className="card-header bg-white border-bottom-light p-4">
                  <div className="row g-3 align-items-center">
                     <div className="col-md-4">
                        <div className="search-box">
                           <input type="text" className="form-control border-0 bg-light-subtle fs-14 py-2 rounded-pill" 
                                  placeholder="Rechercher ville, pays..." value={search} onChange={e => setSearch(e.target.value)} />
                           <i className="ri-search-line search-icon text-muted"></i>
                        </div>
                     </div>
                     <div className="col-md-3 ms-auto">
                        <select className="form-select border-0 bg-light-subtle fs-13 rounded-pill" 
                                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                           <option value="all">Tous les statuts</option>
                           <option value="active">Actifs uniquement</option>
                           <option value="inactive">Inactifs uniquement</option>
                        </select>
                     </div>
                  </div>
               </div>
               
               <div className="card-body p-0">
                  <div className="table-responsive">
                     <table className="table align-middle table-hover mb-0">
                        <thead className="bg-light-subtle">
                           <tr>
                              <th className="ps-4 py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Site</th>
                              <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Localisation</th>
                              <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Fuseau Horaire</th>
                              <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Statut</th>
                              <th className="pe-4 py-3 text-end fs-11 text-uppercase text-muted ls-1 fw-bold">Actions</th>
                           </tr>
                        </thead>
                        <tbody>
                           {loading ? (
                              <tr><td colSpan="5" className="py-5 text-center"><LoadingSpinner /></td></tr>
                           ) : paginated.length > 0 ? (
                              paginated.map(s => {
                                 const color = siteColor(s.name);
                                 return (
                                    <tr key={s.id}>
                                       <td className="ps-4">
                                          <div className="d-flex align-items-center gap-3">
                                             <div className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center bg-${color}-subtle text-${color} fw-bold fs-12`}
                                                  style={{ width: 36, height: 36 }}>
                                                {s.name.slice(0, 2).toUpperCase()}
                                             </div>
                                             <div>
                                                <div className="fw-bold text-dark fs-14">{s.name}</div>
                                                <div className="fs-10 text-muted fw-medium text-uppercase ls-1">ID #{s.id}</div>
                                             </div>
                                          </div>
                                       </td>
                                       <td>
                                          <div className="d-flex align-items-center gap-2">
                                             <i className="ri-flag-line text-muted"></i>
                                             <span className="fs-13 text-dark">{s.country || "Non spécifié"}</span>
                                          </div>
                                       </td>
                                       <td>
                                          <code className="fs-12 text-primary bg-primary-subtle bg-opacity-10 px-2 py-1 rounded">
                                             {s.timezone || "UTC"}
                                          </code>
                                       </td>
                                       <td>
                                          {s.is_active ? (
                                             <span className="badge bg-success-subtle text-success fs-10 text-uppercase fw-bold border border-success border-opacity-10 px-3 py-1">Actif</span>
                                          ) : (
                                             <span className="badge bg-light text-muted fs-10 text-uppercase fw-bold border px-3 py-1">Inactif</span>
                                          )}
                                       </td>
                                       <td className="pe-4 text-end">
                                          <div className="d-flex justify-content-end gap-1">
                                             <button className="btn btn-icon btn-sm btn-ghost-primary rounded-circle" onClick={() => setModalSite(s)}>
                                                <i className="ri-pencil-fill"></i>
                                             </button>
                                             <button className="btn btn-icon btn-sm btn-ghost-danger rounded-circle" onClick={() => setDeleteTarget(s)}>
                                                <i className="ri-delete-bin-fill"></i>
                                             </button>
                                          </div>
                                       </td>
                                    </tr>
                                 );
                              })
                           ) : <tr><td colSpan="5" className="py-5 text-center"><EmptyState title="Aucun site configuré" /></td></tr>}
                        </tbody>
                     </table>
                  </div>
               </div>
               <div className="card-footer bg-white border-top-light py-3 px-4">
                  <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} size="sm" />
               </div>
            </div>
         </div>
      </div>

      {/* Modals */}
      {modalSite && (
        <SiteModal 
          site={modalSite.id ? modalSite : null} 
          onClose={() => setModalSite(null)} 
          onSave={() => { setModalSite(null); load(); showToast("Site mis à jour."); }}
        />
      )}

      <ConfirmModal
        show={!!deleteTarget}
        title="Désactiver ou Supprimer ?"
        message={`Voulez-vous supprimer définitivement "${deleteTarget?.name}" ? Cette action peut échouer si des projets y sont liés.`}
        confirmLabel="Confirmer la suppression"
        confirmColor="danger"
        onConfirm={async () => {
          try { await siteService.delete(deleteTarget.id); setDeleteTarget(null); load(); showToast("Site supprimé."); }
          catch (err) { showToast(err.response?.status === 409 ? "Impossible : ce site est utilisé." : "Erreur", "danger"); setDeleteTarget(null); }
        }}
        onClose={() => setDeleteTarget(null)}
      />

      {toast && <div className={`alert alert-${toast.type} position-fixed top-0 end-0 m-4 shadow-lg border-0 rounded-4 px-4 py-3`} style={{ zIndex: 9999 }}>{toast.msg}</div>}

      <style>{`
        .ls-1 { letter-spacing: 0.05em; }
        .border-bottom-light { border-bottom: 1px solid #f1f3f5; }
      `}</style>
      </div>
    </div>
  );
}
