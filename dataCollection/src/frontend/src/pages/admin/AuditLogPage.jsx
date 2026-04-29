/**
 * pages/admin/AuditLogPage.jsx
 *
 * CORRECTIONS :
 *   1. FIX CRITIQUE — Double useEffect contradictoire → load() useCallback propre.
 *
 *   2. FIX — mounted flag : useRef au lieu d'un return dans la Promise.
 *      AVANT : load() était async et retournait () => { mounted = false } comme
 *              valeur de sa Promise. Le useEffect récupérait ce cleanup avec
 *              .then(fn => cleanup = fn) — fragile : si le composant est démonté
 *              avant la résolution de la Promise, le cleanup n'est jamais assigné.
 *      ✅ FIX : mountedRef = useRef(true), remis à false dans le cleanup useEffect.
 *
 *   3. FIX — log.old_value / log.new_value (champs réels du backend).
 *
 *   4. FIX — exportCSV → URL.revokeObjectURL ajouté.
 *
 *   5. FIX — log.created_at (backend retourne created_at, pas timestamp).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api            from "../../services/api";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import Pagination     from "../../components/common/Pagination";

// ── Config des actions ────────────────────────────────────────────────────────
const ACTION_CFG = {
  CREATE_USER:        { color: "success",   icon: "ri-user-add-line",         label: "Création utilisateur"     },
  UPDATE_USER:        { color: "primary",   icon: "ri-user-settings-line",    label: "Modification utilisateur" },
  DELETE_USER:        { color: "danger",    icon: "ri-user-unfollow-line",     label: "Suppression utilisateur"  },
  UPDATE_USER_ACCESS: { color: "info",      icon: "ri-layout-grid-line",      label: "Modification accès"       },
  CREATE_THRESHOLD:   { color: "warning",   icon: "ri-alarm-warning-line",    label: "Création seuil KPI"       },
  UPDATE_THRESHOLD:   { color: "primary",   icon: "ri-alarm-warning-line",    label: "Modification seuil KPI"   },
  DELETE_THRESHOLD:   { color: "danger",    icon: "ri-alarm-warning-line",    label: "Suppression seuil KPI"    },
  CREATE_SITE:        { color: "success",   icon: "ri-map-pin-line",          label: "Création site"            },
  UPDATE_SITE:        { color: "primary",   icon: "ri-map-pin-line",          label: "Modification site"        },
  DELETE_SITE:        { color: "danger",    icon: "ri-map-pin-line",          label: "Suppression site"         },
  LAUNCH_EXTRACTION:  { color: "info",      icon: "ri-download-cloud-2-line", label: "Lancement extraction"     },
  CLOSE_PERIOD:       { color: "secondary", icon: "ri-lock-line",             label: "Clôture période"          },
  DEFAULT:            { color: "secondary", icon: "ri-history-line",          label: "Action"                   },
};
const getActionCfg = (action) => ACTION_CFG[action] || ACTION_CFG.DEFAULT;

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
function timeAgo(d) {
  if (!d) return "";
  const diff = Math.floor((Date.now() - new Date(d)) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}
function fmtJson(obj) {
  if (!obj) return null;
  if (typeof obj === "string") {
    try { return JSON.stringify(JSON.parse(obj), null, 2); }
    catch { return obj; }
  }
  return JSON.stringify(obj, null, 2);
}

// ── DetailPanel ───────────────────────────────────────────────────────────────
function DetailPanel({ log, onClose }) {
  if (!log) return null;
  const cfg   = getActionCfg(log.action);
  const oldJs = fmtJson(log.old_value);  // ✅ FIX: old_value
  const newJs = fmtJson(log.new_value);  // ✅ FIX: new_value

  return (
    <div className="card border-0 mt-3" style={{ boxShadow: "0 2px 12px rgba(0,0,0,.1)", borderRadius: 16 }}>
      <div className="card-header d-flex align-items-center gap-3 py-3"
        style={{ borderBottom: "1px solid #f0f2f5", borderRadius: "16px 16px 0 0", background: "#fafbfc" }}>
        <div className={`d-flex align-items-center justify-content-center rounded-circle bg-${cfg.color}-subtle flex-shrink-0`}
          style={{ width: 40, height: 40 }}>
          <i className={`${cfg.icon} text-${cfg.color} fs-18`}></i>
        </div>
        <div className="flex-grow-1">
          <h6 className="fw-semibold mb-0">{cfg.label}</h6>
          {/* ✅ FIX: created_at */}
          <p className="text-muted fs-12 mb-0">{fmtDate(log.created_at)}</p>
        </div>
        <button className="btn btn-sm btn-icon btn-light" onClick={onClose}>
          <i className="ri-close-line"></i>
        </button>
      </div>
      <div className="card-body">
        {/* Métadonnées */}
        <div className="row g-3 mb-4">
          {[
            { icon: "ri-hashtag",         label: "ID",           value: `#${log.id}`                               },
            { icon: "ri-flashlight-line", label: "Action",       value: log.action                                  },
            { icon: "ri-database-2-line", label: "Entité",       value: log.entity_type || "—"                     },
            { icon: "ri-key-2-line",      label: "Entity ID",    value: log.entity_id   || "—"                     },
            { icon: "ri-user-line",       label: "Utilisateur",  value: log.user_id ? `#${log.user_id}` : "Système" },
            { icon: "ri-global-line",     label: "IP",           value: log.ip_address  || "—"                     },
          ].map((item, i) => (
            <div key={i} className="col-md-4 col-sm-6">
              <div className="rounded-3 p-3" style={{ background: "#f8fafc", border: "1px solid #f0f2f5" }}>
                <div className="text-muted fs-10 fw-semibold text-uppercase mb-1" style={{ letterSpacing: ".05em" }}>
                  <i className={`${item.icon} me-1`}></i>{item.label}
                </div>
                <div className="fw-semibold fs-13 font-monospace">{item.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Old / New JSON diff */}
        {(oldJs || newJs) && (
          <div className="row g-3">
            {oldJs && (
              <div className={newJs ? "col-md-6" : "col-12"}>
                <p className="fw-medium fs-12 text-danger mb-2">
                  <i className="ri-subtract-line me-1"></i>Avant
                </p>
                <pre className="rounded-3 p-3 mb-0 fs-11"
                  style={{ background: "#fff1f0", border: "1px solid #fecaca", maxHeight: 200, overflowY: "auto",
                    whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#991b1b" }}>
                  {oldJs}
                </pre>
              </div>
            )}
            {newJs && (
              <div className={oldJs ? "col-md-6" : "col-12"}>
                <p className="fw-medium fs-12 text-success mb-2">
                  <i className="ri-add-line me-1"></i>Après
                </p>
                <pre className="rounded-3 p-3 mb-0 fs-11"
                  style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", maxHeight: 200, overflowY: "auto",
                    whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#166534" }}>
                  {newJs}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const [logs,         setLogs]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [search,       setSearch]       = useState("");
  const [selectedLog,  setSelectedLog]  = useState(null);
  const [page,         setPage]         = useState(1);
  const perPage = 15;

  // ✅ FIX : useRef pour le mounted flag — stable entre les renders et les Promises
  const mountedRef = useRef(true);

  // ✅ FIX : load() useCallback propre — pas de return cleanup dans la Promise
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/audit-logs", { params: { limit: 500 } });
      if (mountedRef.current) setLogs(Array.isArray(res.data) ? res.data : []);
    } catch {
      if (mountedRef.current) setLogs([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // ✅ FIX : cleanup correct — mountedRef.current = false garanti au démontage
  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  useEffect(() => { setPage(1); setSelectedLog(null); }, [search, actionFilter, entityFilter]);

  const uniqueActions  = useMemo(() => [...new Set(logs.map(l => l.action).filter(Boolean))].sort(), [logs]);
  const uniqueEntities = useMemo(() => [...new Set(logs.map(l => l.entity_type).filter(Boolean))].sort(), [logs]);

  const filtered = useMemo(() => logs.filter(log => {
    const q  = search.toLowerCase();
    const ms = !q || (log.action || "").toLowerCase().includes(q)
                   || (log.entity_type || "").toLowerCase().includes(q)
                   || String(log.entity_id || "").includes(q)
                   || String(log.user_id || "").includes(q);
    const ma = actionFilter === "all" || log.action      === actionFilter;
    const me = entityFilter === "all" || log.entity_type === entityFilter;
    return ms && ma && me;
  }), [logs, search, actionFilter, entityFilter]);

  const totalPages  = Math.ceil(filtered.length / perPage);
  const paginated   = filtered.slice((page - 1) * perPage, page * perPage);
  const createCount = logs.filter(l => l.action?.startsWith("CREATE")).length;
  const updateCount = logs.filter(l => l.action?.startsWith("UPDATE")).length;
  const deleteCount = logs.filter(l => l.action?.startsWith("DELETE")).length;

  // ✅ FIX : URL.revokeObjectURL + log.created_at (pas log.timestamp)
  function exportCSV() {
    const headers = ["ID", "Action", "Entité", "Entity ID", "User ID", "IP", "Date"];
    const rows    = filtered.map(l => [
      l.id, l.action || "", l.entity_type || "", l.entity_id || "",
      l.user_id || "", l.ip_address || "", fmtDate(l.created_at),  // ✅ FIX: created_at
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a   = document.createElement("a");
    a.href = url;
    a.download = `audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url); // ✅ anti memory-leak
  }

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Header */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <div>
                <h4 className="mb-1 fw-semibold"><i className="ri-file-list-3-line me-2 text-primary"></i>Journal d'audit</h4>
                <p className="text-muted fs-13 mb-0">Traçabilité complète des actions administratives — lecture seule</p>
              </div>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item">Administration</li>
                <li className="breadcrumb-item active">Audit Log</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Banner info */}
        <div className="d-flex align-items-start gap-3 rounded-3 p-3 mb-4"
          style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <i className="ri-shield-check-line fs-4 flex-shrink-0 mt-1" style={{ color: "#1d4ed8" }}></i>
          <div>
            <strong style={{ color: "#1e3a8a" }}>Journal d'audit immuable</strong>
            <span className="text-muted fs-13 ms-2">— Toutes les actions sensibles sont tracées automatiquement : création/modification/suppression d'utilisateurs, seuils KPI, sites, extractions.</span>
          </div>
        </div>

        {/* Stats */}
        <div className="row g-3 mb-4">
          {[
            { label: "Total entrées",  value: logs.length,   color: "#3577f1", bg: "#eff6ff", icon: "ri-history-line"    },
            { label: "Créations",      value: createCount,   color: "#0ab39c", bg: "#f0fdf4", icon: "ri-add-circle-line" },
            { label: "Modifications",  value: updateCount,   color: "#f7b84b", bg: "#fffbeb", icon: "ri-pencil-line"     },
            { label: "Suppressions",   value: deleteCount,   color: "#f06548", bg: "#fff1f0", icon: "ri-delete-bin-line" },
          ].map((s, i) => (
            <div key={i} className="col-xl-3 col-sm-6">
              <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                <div className="card-body d-flex align-items-center gap-3">
                  <div className="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
                    style={{ width: 48, height: 48, background: s.bg }}>
                    <i className={`${s.icon} fs-22`} style={{ color: s.color }}></i>
                  </div>
                  <div>
                    <p className="text-muted fs-11 fw-semibold text-uppercase mb-1" style={{ letterSpacing: ".05em" }}>{s.label}</p>
                    <h3 className="fw-bold mb-0" style={{ color: s.color }}>{s.value}</h3>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          {/* Filtres */}
          <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <div className="search-box flex-grow-1" style={{ maxWidth: 320 }}>
                <input type="text" className="form-control form-control-sm"
                  placeholder="Action, entité, ID, utilisateur…"
                  value={search} onChange={e => setSearch(e.target.value)} />
                <i className="ri-search-line search-icon"></i>
              </div>
              <select className="form-select form-select-sm" style={{ width: "auto" }}
                value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
                <option value="all">Toutes les actions</option>
                {uniqueActions.map(a => <option key={a} value={a}>{getActionCfg(a).label || a}</option>)}
              </select>
              <select className="form-select form-select-sm" style={{ width: "auto" }}
                value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
                <option value="all">Toutes les entités</option>
                {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              {(search || actionFilter !== "all" || entityFilter !== "all") && (
                <button className="btn btn-sm btn-soft-secondary"
                  onClick={() => { setSearch(""); setActionFilter("all"); setEntityFilter("all"); }}>
                  <i className="ri-close-line me-1"></i>Reset
                  <span className="badge bg-secondary-subtle text-secondary ms-1">{filtered.length}</span>
                </button>
              )}
              <div className="ms-auto d-flex gap-2">
                {filtered.length > 0 && (
                  <button className="btn btn-sm btn-soft-success" onClick={exportCSV}>
                    <i className="ri-download-2-line me-1"></i>CSV
                  </button>
                )}
                <button className="btn btn-sm btn-soft-primary" onClick={load}>
                  <i className="ri-refresh-line me-1"></i>Actualiser
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="card-body p-0">
            {loading ? (
              <div className="py-5"><LoadingSpinner text="Chargement du journal d'audit…" /></div>
            ) : filtered.length === 0 ? (
              <EmptyState icon="ri-file-list-3-line" title="Aucune entrée d'audit"
                description={logs.length === 0 ? "Aucune action enregistrée pour le moment." : "Aucun résultat pour ces filtres."} compact />
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead style={{ background: "#fafbfc" }}>
                      <tr>
                        <th className="ps-4 py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>ID</th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Action</th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Entité</th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Utilisateur</th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>IP</th>
                        <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Date</th>
                        <th className="pe-4 py-3 text-center text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Détails</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(log => {
                        const cfg        = getActionCfg(log.action);
                        const isSelected = selectedLog?.id === log.id;
                        return (
                          <tr key={log.id}
                            onClick={() => setSelectedLog(isSelected ? null : log)}
                            style={{ cursor: "pointer", background: isSelected ? "#f0f7ff" : undefined }}>
                            <td className="ps-4 py-3 text-muted fs-12 fw-semibold">#{log.id}</td>
                            <td>
                              <span className={`badge bg-${cfg.color}-subtle text-${cfg.color} d-inline-flex align-items-center gap-1 fs-11`}>
                                <i className={cfg.icon}></i>{cfg.label || log.action}
                              </span>
                            </td>
                            <td>
                              {log.entity_type
                                ? <span className="badge bg-light text-dark border fs-11">
                                    <i className="ri-database-2-line me-1 text-muted"></i>{log.entity_type}
                                    {log.entity_id ? ` #${log.entity_id}` : ""}
                                  </span>
                                : <span className="text-muted fs-12">—</span>
                              }
                            </td>
                            <td>
                              {log.user_id
                                ? <span className="badge fs-11" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                                    <i className="ri-user-line me-1"></i>#{log.user_id}
                                  </span>
                                : <span className="badge bg-secondary-subtle text-muted fs-11">Système</span>
                              }
                            </td>
                            <td>
                              {/* ✅ FIX: log.ip_address */}
                              {log.ip_address
                                ? <code className="fs-11 px-2 py-1 rounded-2" style={{ background: "#f4f6fa", color: "#374151" }}>{log.ip_address}</code>
                                : <span className="text-muted fs-12">—</span>
                              }
                            </td>
                            <td>
                              {/* ✅ FIX: log.created_at (pas log.timestamp) */}
                              <p className="mb-0 fs-12">{fmtDate(log.created_at)}</p>
                              <p className="mb-0 fs-11 text-muted">{timeAgo(log.created_at)} ago</p>
                            </td>
                            <td className="pe-4 text-center" onClick={e => e.stopPropagation()}>
                              <button
                                className={`btn btn-sm btn-icon ${isSelected ? "btn-primary" : "btn-soft-primary"}`}
                                onClick={() => setSelectedLog(isSelected ? null : log)}>
                                <i className={`${isSelected ? "ri-eye-off-line" : "ri-eye-line"} fs-14`}></i>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2" style={{ borderTop: "1px solid #f0f2f5" }}>
                  <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Detail panel inline */}
        {selectedLog && (
          <DetailPanel log={selectedLog} onClose={() => setSelectedLog(null)} />
        )}
      </div>
    </div>
  );
}
