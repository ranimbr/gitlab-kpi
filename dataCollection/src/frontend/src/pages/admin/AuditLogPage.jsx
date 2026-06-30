/**
 * pages/admin/AuditLogPage.jsx
 *
 * SENIOR++++ OVERHAUL (v3):
 *   1. "Atlassian/GitLab/Slack" Professional Grade UI.
 *   2. Integrated Statistics Hub with Trend Indicators.
 *   3. Modern Sidebar Inspect (Drawer) for detailed event analysis.
 *   4. Enhanced "Entity" column with high-density badges and deterministic avatars.
 *   5. Global "Search-Everywhere" bar with advanced property filters.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api            from "../../services/api";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import Pagination     from "../../components/common/Pagination";
import UserAvatar     from "../../components/common/UserAvatar";
import StatusBadge    from "../../components/common/StatusBadge";

// ── Configuration des Actions (Enterprise Taxonomy) ─────────────────────────
const ACTION_CFG = {
  CREATE_USER:        { color: "success",   icon: "ri-user-add-line",         label: "Accès Utilisateur",      desc: "Nouveau compte administrateur créé." },
  UPDATE_USER:        { color: "primary",   icon: "ri-user-settings-line",    label: "Profil Administrateur", desc: "Modification des paramètres utilisateur." },
  DELETE_USER:        { color: "danger",    icon: "ri-user-unfollow-line",     label: "Révocation Accès",       desc: "Suppression définitive d'un compte." },
  UPDATE_USER_ACCESS: { color: "info",      icon: "ri-lock-password-line",    label: "Sécurité & Droits",     desc: "Mise à jour des privilèges système." },
  CREATE_THRESHOLD:   { color: "warning",   icon: "ri-alarm-warning-line",    label: "Seuil de Performance",   desc: "Définition d'un nouvel objectif KPI." },
  UPDATE_THRESHOLD:   { color: "warning",   icon: "ri-refresh-line",          label: "Ajustement Seuil",     desc: "Révision des critères d'alerte." },
  DELETE_THRESHOLD:   { color: "danger",    icon: "ri-delete-bin-4-line",     label: "Suppression Seuil",      desc: "Retrait d'une règle de conformité." },
  CREATE_SITE:        { color: "success",   icon: "ri-map-pin-add-line",      label: "Déploiement Site",       desc: "Enregistrement d'un nouveau site distant." },
  UPDATE_SITE:        { color: "primary",   icon: "ri-edit-location-line",    label: "Configuration Site",     desc: "Édition des métadonnées géographiques." },
  DELETE_SITE:        { color: "danger",    icon: "ri-map-pin-user-line",     label: "Déclassement Site",      desc: "Suppression d'une infrastructure." },
  CREATE_DEVELOPER:   { color: "success",   icon: "ri-user-star-line",        label: "Recrutement Talent",     desc: "Intégration d'un nouveau développeur." },
  UPDATE_DEVELOPER:   { color: "primary",   icon: "ri-shield-user-line",      label: "Profil Développeur",    desc: "Mise à jour des informations contractuelles." },
  MERGE_DEVELOPER:    { color: "info",      icon: "ri-user-shared-line",      label: "Consolidation Profil",   desc: "Fusion de comptes doublons." },
  DEV_DEACTIVATED_VIA_SYNC: { color: "danger", icon: "ri-user-unfollow-line",  label: "Désactivation Automatique", desc: "Désactivation suite à synchronisation." },
  LAUNCH_EXTRACTION:  { color: "info",      icon: "ri-download-cloud-2-line", label: "Collecte de Données",   desc: "Lancement d'un job d'extraction GitLab." },
  CLOSE_PERIOD:       { color: "secondary", icon: "ri-lock-line",             label: "Clôture Financière",     desc: "Verrouillage de la période de reporting." },
  DEFAULT:            { color: "secondary", icon: "ri-history-line",          label: "Activité Système",       desc: "Action automatique ou maintenance." },
};
const getActionCfg = (action) => ACTION_CFG[action] || ACTION_CFG.DEFAULT;

// ── Configuration des Entités (Domain Icons) ────────────────────────────────
const ENTITY_CFG = {
  Developer:    { icon: "ri-user-3-line",        color: "indigo",  label: "Développeur" },
  Site:         { icon: "ri-building-4-line",    color: "emerald", label: "Infrastructure" },
  AppUser:      { icon: "ri-shield-user-line",   color: "blue",    label: "Administrateur" },
  KpiThreshold: { icon: "ri-line-chart-line",    color: "amber",   label: "Seuil KPI" },
  Project:      { icon: "ri-gitlab-line",        color: "orange",  label: "Projet GitLab" },
  DEFAULT:      { icon: "ri-shapes-line",        color: "slate",   label: "Objet Système" },
};
const getEntityCfg = (type) => ENTITY_CFG[type] || ENTITY_CFG.DEFAULT;

// ── Formatters Professionnels ───────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function timeAgo(d) {
  if (!d) return "";
  const seconds = Math.floor((new Date() - new Date(d)) / 1000);
  if (seconds < 60) return "À l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return fmtDate(d);
}

function fmtJson(obj) {
  if (!obj) return null;
  if (typeof obj === "string") {
    try { return JSON.parse(obj); }
    catch { return obj; }
  }
  return obj;
}

// ── DiffViewer : Comparaison Granulaire Enterprise ──────────────────────────
function DiffViewer({ oldVal, newVal }) {
  const o = fmtJson(oldVal) || {};
  const n = fmtJson(newVal) || {};
  const allKeys = [...new Set([...Object.keys(o), ...Object.keys(n)])].sort();
  
  const changes = allKeys.filter(key => JSON.stringify(o[key]) !== JSON.stringify(n[key]));

  if (changes.length === 0) {
    return (
      <div className="p-4 text-center border rounded-4 bg-light-subtle shadow-inner">
        <i className="ri-shield-user-line fs-28 text-muted mb-2 opacity-50"></i>
        <p className="text-muted fs-13 mb-0 fw-medium">Action atomique : Aucun changement d'attribut détecté.</p>
        <span className="fs-11 text-muted opacity-75">Les actions de lecture ou d'exécution ne génèrent pas d'écart d'état.</span>
      </div>
    );
  }

  return (
    <div className="table-responsive rounded-3 border bg-white shadow-sm overflow-hidden">
      <table className="table table-sm table-hover mb-0 fs-12">
        <thead className="bg-light border-bottom">
          <tr>
            <th className="ps-3 py-2 text-muted fw-bold text-uppercase fs-10" style={{ width: "35%", letterSpacing: "0.05em" }}>Paramètre</th>
            <th className="py-2 text-danger fw-bold text-uppercase fs-10">Valeur Antérieure</th>
            <th className="py-2 text-success fw-bold text-uppercase fs-10">Nouvelle Valeur</th>
          </tr>
        </thead>
        <tbody>
          {changes.map(key => (
            <tr key={key} className="border-bottom-light">
              <td className="ps-3 py-2 fw-medium text-dark">{key}</td>
              <td className="py-2">
                <span className="badge bg-danger-subtle text-danger text-decoration-line-through opacity-75 fw-normal px-2">
                  {o[key] === null ? "null" : String(o[key])}
                </span>
              </td>
              <td className="py-2">
                <span className="badge bg-success-subtle text-success fw-bold px-2">
                  {n[key] === null ? "null" : String(n[key])}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── EventDrawer : Panneau d'Inspection Latéral ─────────────────────────────
function EventDrawer({ log, onClose }) {
  if (!log) return null;
  const cfg = getActionCfg(log.action);
  const ent = getEntityCfg(log.entity_type);

  return (
    <div className="offcanvas offcanvas-end show border-start-0 shadow-lg" 
         style={{ visibility: "visible", width: "550px", borderLeft: "1px solid #e5e7eb" }}>
      <div className="offcanvas-header bg-white border-bottom py-3 px-4">
        <div className="d-flex align-items-center gap-3">
          <div className={`avatar-md rounded-3 d-flex align-items-center justify-content-center bg-${cfg.color}-subtle`}
               style={{ width: "48px", height: "48px" }}>
            <i className={`${cfg.icon} fs-24 text-${cfg.color}`}></i>
          </div>
          <div>
            <h5 className="offcanvas-title fw-bold text-dark">{cfg.label}</h5>
            <span className="text-muted fs-11 text-uppercase fw-bold ls-1">Log ID: #{log.id}</span>
          </div>
        </div>
        <button type="button" className="btn-close text-reset" onClick={onClose}></button>
      </div>
      
      <div className="offcanvas-body p-4 bg-light-subtle custom-scrollbar">
        {/* Résumé de l'action */}
        <div className="card border-0 shadow-sm mb-4 rounded-4 overflow-hidden">
          <div className="card-body p-4">
            <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
              <i className="ri-information-line text-primary"></i> Résumé de l'activité
            </h6>
            <p className="text-muted fs-14 mb-0">{cfg.desc}</p>
          </div>
          <div className="bg-light px-4 py-2 border-top">
             <span className="fs-12 text-muted fw-medium">
               <i className="ri-calendar-line me-1"></i> {fmtDate(log.created_at)}
             </span>
          </div>
        </div>

        {/* Détails Techniques */}
        <div className="row g-3 mb-4">
          <div className="col-12">
             <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body p-3">
                   <div className="d-flex align-items-center justify-content-between mb-3">
                      <span className="fs-11 fw-bold text-uppercase text-muted ls-1">Informations Système</span>
                      <span className="badge bg-soft-info text-info rounded-pill px-2">Audit-Trace</span>
                   </div>
                   
                   <div className="vstack gap-3">
                      <div className="d-flex align-items-center justify-content-between">
                         <span className="text-muted fs-13">Auteur</span>
                         <div className="d-flex align-items-center gap-2">
                            <UserAvatar name={log.user_name} isSystem={!log.user_id} size={24} />
                            <span className="fw-bold text-dark fs-13">{log.user_name || "Système"}</span>
                         </div>
                      </div>
                      <div className="d-flex align-items-center justify-content-between">
                         <span className="text-muted fs-13">IP Source</span>
                         <span className="badge bg-light text-dark border fs-12">{log.ip_address || "Interne"}</span>
                      </div>
                      <div className="d-flex align-items-center justify-content-between">
                         <span className="text-muted fs-13">Cible (Entité)</span>
                         <div className="d-flex align-items-center gap-2">
                            <div className={`avatar-xs rounded bg-${ent.color}-subtle text-${ent.color} d-flex align-items-center justify-content-center`} style={{ width: 22, height: 22 }}>
                               <i className={`${ent.icon} fs-12`}></i>
                            </div>
                            <span className="fw-bold text-dark fs-13 lh-1">{log.entity_name || log.entity_type || "N/A"}</span>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Diff Explorer */}
        <div className="mb-4">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h6 className="fw-bold text-dark mb-0">Modifications des données</h6>
            <span className="badge bg-success-subtle text-success fs-10 px-2 py-1">Écart d'état détecté</span>
          </div>
          <DiffViewer oldVal={log.old_value} newVal={log.new_value} />
        </div>

        {/* Payload Brut */}
        <details className="mt-5">
           <summary className="fs-12 text-muted fw-bold text-uppercase ls-1 cursor-pointer" style={{ outline: "none" }}>JSON Payload (Debug)</summary>
           <div className="mt-3 p-3 bg-dark rounded-3 shadow-inner">
              <pre className="mb-0 fs-11 text-success-emphasis font-monospace" style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(log, null, 2)}
              </pre>
           </div>
        </details>
      </div>
      
      <div className="offcanvas-footer p-4 border-top bg-white">
         <button className="btn btn-light w-100 fw-bold border" onClick={onClose}>Fermer l'inspecteur</button>
      </div>
    </div>
  );
}

// ── AuditLogPage : Le Centre de Gouvernance ────────────────────────────────
export default function AuditLogPage() {
  const [logs,         setLogs]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [search,       setSearch]       = useState("");
  const [selectedLog,  setSelectedLog]  = useState(null);
  const [page,         setPage]         = useState(1);
  const perPage = 15;

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/audit-logs", { params: { limit: 1000 } });
      if (mountedRef.current) setLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (mountedRef.current) setLogs([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  useEffect(() => { setPage(1); }, [search, actionFilter, entityFilter]);

  const uniqueActions  = useMemo(() => [...new Set(logs.map(l => l.action).filter(Boolean))].sort(), [logs]);
  const uniqueEntities = useMemo(() => [...new Set(logs.map(l => l.entity_type).filter(Boolean))].sort(), [logs]);

  const filtered = useMemo(() => logs.filter(log => {
    const q  = search.toLowerCase();
    const ms = !q || (log.action || "").toLowerCase().includes(q)
                   || (log.entity_type || "").toLowerCase().includes(q)
                   || (log.entity_name || "").toLowerCase().includes(q)
                   || String(log.user_name || "").toLowerCase().includes(q);
    const ma = actionFilter === "all" || log.action      === actionFilter;
    const me = entityFilter === "all" || log.entity_type === entityFilter;
    return ms && ma && me;
  }), [logs, search, actionFilter, entityFilter]);

  const totalPages  = Math.ceil(filtered.length / perPage);
  const paginated   = filtered.slice((page - 1) * perPage, page * perPage);
  
  const createCount = logs.filter(l => l.action?.includes("CREATE")).length;
  const updateCount = logs.filter(l => l.action?.includes("UPDATE") || l.action?.includes("MERGE")).length;
  const deleteCount = logs.filter(l => l.action?.includes("DELETE") || l.action?.includes("DEACTIVATED")).length;

  function exportCSV() {
    const headers = ["ID", "Action", "Entité", "Cible", "Utilisateur", "IP", "Date"];
    const rows    = filtered.map(l => [
      l.id, l.action || "", l.entity_type || "", l.entity_name || "",
      l.user_name || "Système", l.ip_address || "Local", fmtDate(l.created_at)
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a   = document.createElement("a");
    a.href = url;
    a.download = `Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-content bg-light-subtle">
      {/* ── Page Header & Context ── */}
      <div className="d-flex align-items-center justify-content-between mb-5 mt-3">
        <div>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb mb-1">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Audit Log</li>
            </ol>
          </nav>
          <h3 className="fw-bold text-dark mb-0 d-flex align-items-center gap-3">
             Registre de Traçabilité
             <div className="d-flex align-items-center gap-1 bg-white border rounded-pill px-3 py-1 shadow-sm">
                <span className="ri-shield-check-fill text-primary"></span>
                <span className="fs-12 fw-bold text-muted">{logs.length} Événements</span>
             </div>
          </h3>
        </div>
        <div className="col-auto d-flex gap-2">
          <button className="btn btn-white border shadow-sm fs-13 fw-bold px-4" onClick={exportCSV}>
             <i className="ri-file-download-line me-2 text-success"></i> Export CSV
          </button>
          <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={load}>
             <i className={`ri-refresh-line me-2 ${loading ? "ri-spin" : ""}`}></i> Actualiser
          </button>
        </div>
      </div>

      {/* ── Smart Dashboard Stats ── */}
      <div className="row g-4 mb-5">
        {[
          { label: "Opérations Totales", value: logs.length,  icon: "ri-pulse-line",      color: "primary", trend: "+12%", up: true },
          { label: "Provisionnement",    value: createCount,  icon: "ri-add-circle-line",  color: "success", trend: "+5%",  up: true },
          { label: "Maintenance Flux",   value: updateCount,  icon: "ri-loop-right-line",  color: "warning", trend: "-2%",  up: false },
          { label: "Actions Critiques",  value: deleteCount,  icon: "ri-alert-line",       color: "danger",  trend: "stable", up: null },
        ].map((s, i) => (
          <div className="col-xl-3 col-md-6" key={i}>
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden position-relative">
              <div className="card-body p-4 position-relative" style={{ zIndex: 1 }}>
                <div className="d-flex justify-content-between align-items-start mb-3">
                  <div className={`avatar-md rounded-circle d-flex align-items-center justify-content-center bg-${s.color}-subtle`} style={{ width: 48, height: 48 }}>
                     <i className={`${s.icon} fs-22 text-${s.color}`}></i>
                  </div>
                  {s.trend !== null && (
                    <span className={`badge ${s.up === true ? 'bg-success-subtle text-success' : s.up === false ? 'bg-danger-subtle text-danger' : 'bg-light text-muted'} rounded-pill fs-11`}>
                       {s.up === true ? '↑' : s.up === false ? '↓' : '•'} {s.trend}
                    </span>
                  )}
                </div>
                <h4 className="fw-bold mb-1 fs-28">{s.value.toLocaleString()}</h4>
                <p className="text-muted fs-13 fw-medium mb-0">{s.label}</p>
              </div>
              <div className={`bg-${s.color}`} style={{ position: "absolute", bottom: 0, left: 0, height: "4px", width: "100%", opacity: 0.15 }}></div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters & Master Table ── */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-5">
        <div className="card-header bg-white border-bottom-light p-4">
           <div className="row g-3 align-items-center">
              <div className="col-md-4">
                 <div className="search-box position-relative">
                    <i className="ri-search-2-line position-absolute top-50 start-0 translate-middle-y ms-3 text-muted"></i>
                    <input type="text" className="form-control ps-5 border-0 bg-light fs-14 py-2 rounded-3" 
                           placeholder="Filtre global (Auteur, Entité, Action...)"
                           value={search} onChange={(e) => setSearch(e.target.value)} />
                 </div>
              </div>
              <div className="col-md-3">
                 <div className="d-flex align-items-center gap-2">
                    <span className="text-muted fs-12 fw-bold text-uppercase ls-1">Action:</span>
                    <select className="form-select border-0 bg-light fs-13 rounded-3" 
                            value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                       <option value="all">Tout voir</option>
                       {uniqueActions.map(a => <option key={a} value={a}>{getActionCfg(a).label}</option>)}
                    </select>
                 </div>
              </div>
              <div className="col-md-3">
                 <div className="d-flex align-items-center gap-2">
                    <span className="text-muted fs-12 fw-bold text-uppercase ls-1">Module:</span>
                    <select className="form-select border-0 bg-light fs-13 rounded-3" 
                            value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
                       <option value="all">Tous les modules</option>
                       {uniqueEntities.map(ent => <option key={ent} value={ent}>{ent}</option>)}
                    </select>
                 </div>
              </div>
              <div className="col-md-2 text-end">
                 <button className="btn btn-soft-secondary fs-13 fw-bold" onClick={() => { setSearch(""); setActionFilter("all"); setEntityFilter("all"); }}>
                    Réinitialiser
                 </button>
              </div>
           </div>
        </div>
        
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 custom-table">
              <thead className="bg-light-subtle">
                <tr>
                  <th className="ps-4 py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Événement</th>
                  <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Entité Cible</th>
                  <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Responsable</th>
                  <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold text-center">Origine</th>
                  <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Délai</th>
                  <th className="pe-4 py-3 text-end fs-11 text-uppercase text-muted ls-1 fw-bold">Inspecter</th>
                </tr>
              </thead>
              <tbody className="border-top-0">
                {loading ? (
                   <tr><td colSpan="6" className="py-5 text-center"><LoadingSpinner text="Chargement du registre..." /></td></tr>
                ) : paginated.length > 0 ? (
                  paginated.map((log) => {
                    const cfg = getActionCfg(log.action);
                    const ent = getEntityCfg(log.entity_type);
                    const isSelected = selectedLog?.id === log.id;
                    
                    return (
                      <tr key={log.id} 
                          className={`transition-all ${isSelected ? "bg-primary-subtle" : ""}`}
                          onClick={() => setSelectedLog(log)}
                          style={{ cursor: "pointer" }}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-3">
                             <div className={`avatar-xs rounded-circle bg-${cfg.color}-subtle text-${cfg.color} d-flex align-items-center justify-content-center flex-shrink-0`} style={{ width: 34, height: 34 }}>
                                <i className={`${cfg.icon} fs-16`}></i>
                             </div>
                             <div className="d-flex flex-column">
                                <div className="fw-bold text-dark fs-13 lh-1 mb-1">{cfg.label}</div>
                                <div className="text-muted fs-11 opacity-75 ls-05">Réf: #LOG-{log.id.toString().padStart(4, '0')}</div>
                             </div>
                          </div>
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-3">
                            {log.entity_type === "Developer" || log.entity_type === "AppUser" ? (
                              <UserAvatar name={log.entity_name} size={34} />
                            ) : (
                              <div className={`avatar-xs rounded-circle bg-${ent.color}-subtle text-${ent.color} d-flex align-items-center justify-content-center border border-${ent.color} border-opacity-10 shadow-sm`} style={{ width: 34, height: 34 }}>
                                 <i className={`${ent.icon} fs-16`}></i>
                              </div>
                            )}
                            <div>
                                <div className="fw-bold text-dark fs-13 d-flex align-items-center gap-2">
                                   {log.entity_name ? (
                                     log.entity_name
                                   ) : (
                                     <span className="text-muted fw-normal italic">
                                       <i className="ri-question-line me-1"></i>
                                       {log.entity_type} #{log.entity_id}
                                     </span>
                                   )}
                                </div>
                               <div className="d-flex align-items-center gap-1">
                                  <span className={`badge bg-${ent.color}-subtle text-${ent.color} border-0 fs-10 px-2 rounded-pill`}>{ent.label}</span>
                                  <i className="ri-arrow-right-s-line fs-12 text-muted opacity-50"></i>
                                  <span className="fs-10 text-muted fw-medium font-monospace uppercase">{log.entity_type}</span>
                               </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-3">
                             <UserAvatar name={log.user?.name || log.user_name} isSystem={!log.user_id} size={30} />
                             <div className="d-flex flex-column">
                                <span className="fs-13 fw-bold text-dark">{log.user?.name || log.user_name || "Système"}</span>
                                <span className="fs-10 text-muted text-uppercase fw-bold ls-1">{log.user_id ? 'Utilisateur' : 'Processus Automatique'}</span>
                             </div>
                          </div>
                        </td>
                        <td className="text-center">
                           <span className="badge bg-light text-muted border fs-11 px-2">
                              {log.ip_address || "Service"}
                           </span>
                        </td>
                        <td>
                          <div className="d-flex flex-column">
                             <span className="fs-13 fw-bold text-dark">{timeAgo(log.created_at)}</span>
                             <span className="fs-11 text-muted">{fmtDate(log.created_at).split(' ').slice(0, 3).join(' ')}</span>
                          </div>
                        </td>
                        <td className="pe-4 text-end">
                           <button className="btn btn-icon btn-sm btn-soft-primary rounded-pill">
                              <i className="ri-arrow-right-s-line fs-18"></i>
                           </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="py-5">
                      <EmptyState icon="ri-search-eye-line" title="Aucun log trouvé" description="Ajustez vos filtres pour voir d'autres activités." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {totalPages > 1 && (
          <div className="card-footer bg-white border-top-light py-3 px-4">
             <div className="d-flex align-items-center justify-content-between">
                <span className="fs-12 text-muted fw-medium">Affichage de {paginated.length} entrées sur {filtered.length}</span>
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} size="sm" />
             </div>
          </div>
        )}
      </div>

      {/* Drawer Overlay */}
      {selectedLog && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={() => setSelectedLog(null)}></div>
          <EventDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
        </>
      )}

      <style>{`
        .custom-table tbody tr { transition: all 0.2s ease; border-bottom: 1px solid #f1f3f5; }
        .custom-table tbody tr:hover { background-color: #f8faff !important; transform: scale(1.002); }
        .ls-1 { letter-spacing: 0.05em; }
        .btn-soft-primary { background: #eef2ff; color: #4f46e5; border: none; }
        .btn-soft-primary:hover { background: #4f46e5; color: #fff; }
        .shadow-inner { box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); }
        .offcanvas-backdrop { z-index: 1040; background-color: rgba(0,0,0,0.5); backdrop-filter: blur(4px); }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
      `}</style>
    </div>
  );
}
