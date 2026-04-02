/**
 * pages/DeveloperProfilePage.jsx
 * 
 * SENIOR REFACTOR: Harmonized with Corporate/Velzon style.
 * Using standard card-animate, page-title-box, and brand colors.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import developerService from "../services/developerService";
import analyticsService    from "../services/analyticsService";
import projectService      from "../services/projectService";
import { exportService }   from "../services";
import LoadingSpinner      from "../components/common/LoadingSpinner";
import EmptyState          from "../components/common/EmptyState";
import ScoreRadarChart     from "../components/charts/ScoreRadarChart";

// ─── Helpers (Standardized) ──────────────────────────────────────────────────
const fmt     = (n, d = 2) => (n == null || isNaN(+n)) ? "—" : (+n).toFixed(d);
const fmtPct  = (n) => (n == null || isNaN(+n)) ? "—" : `${(+n * 100).toFixed(0)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const MOIS_FR = { 0:"Jan",1:"Fév",2:"Mar",3:"Avr",4:"Mai",5:"Jun",6:"Jul",7:"Aoû",8:"Sep",9:"Oct",10:"Nov",11:"Déc" };
const COLORS  = ["primary", "success", "info", "warning", "danger", "secondary"];

function getInitials(name = "") { return (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2); }

function deltaInfo(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return { value: "±0%", color: "secondary", icon: "ri-subtract-line" };
  return pct > 0
    ? { value: `+${pct.toFixed(1)}%`, color: "success", icon: "ri-arrow-up-line" }
    : { value: `${pct.toFixed(1)}%`,  color: "danger",  icon: "ri-arrow-down-line" };
}

// ─── Component: Activity Heatmap (GitHub Style) ──────────────────────────────
function ActivityHeatmap({ data, startDate, endDate, maxCount, loading, accentColor }) {
  const [tooltip, setTooltip] = useState(null);

  const grid = useMemo(() => {
    if (!startDate || !endDate) return [];
    const countMap = {};
    (data || []).forEach(d => { countMap[d.date] = d.count; });
    const start = new Date(startDate);
    const dayOfWeek = start.getDay(); 
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(start.getDate() + mondayOffset);
    const end = new Date(endDate);
    const weeks = [];
    let week = [];
    const cur = new Date(start);
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      const inRange = cur >= new Date(startDate) && cur <= new Date(endDate);
      week.push({ date: iso, count: inRange ? (countMap[iso] || 0) : null, inRange });
      if (week.length === 7) { weeks.push(week); week = []; }
      cur.setDate(cur.getDate() + 1);
    }
    if (week.length > 0) {
      while (week.length < 7) week.push({ date: null, count: null, inRange: false });
      weeks.push(week);
    }
    return weeks;
  }, [data, startDate, endDate]);

  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    grid.forEach((week, wi) => {
      const firstValidDay = week.find(d => d.inRange);
      if (!firstValidDay) return;
      const m = new Date(firstValidDay.date).getMonth();
      if (m !== lastMonth) { labels.push({ weekIdx: wi, label: MOIS_FR[m] }); lastMonth = m; }
    });
    return labels;
  }, [grid]);

  const cellColor = (count, inRange) => {
    if (!inRange || count == null || count === 0) return "#f3f6f9";
    const max = maxCount || 10;
    const pct = count / max;
    if (pct <= 0.25) return "#dcfce7";
    if (pct <= 0.50) return "#86efac";
    if (pct <= 0.75) return "#22c55e";
    return "#15803d";
  };

  if (loading) return <div className="py-4 text-center text-muted fs-11"><span className="spinner-border spinner-border-sm me-2"></span>Calcul de l'activité...</div>;

  return (
    <div className="position-relative overflow-auto pb-2" style={{ minWidth: 600 }}>
      <div className="d-flex mb-1 ms-4 ps-1" style={{ gap: 0 }}>
        {grid.map((_, wi) => {
          const lbl = monthLabels.find(l => l.weekIdx === wi);
          return <div key={wi} style={{ width: 14, fontSize: 9, color: "#adb5bd", flexShrink: 0 }}>{lbl?.label || ""}</div>;
        })}
      </div>
      <div className="d-flex gap-1 align-items-start">
        <div className="d-flex flex-column me-2" style={{ gap: 3 }}>
          {["Lun","","Mer","","Ven","","Dim"].map((d, i) => (
            <div key={i} style={{ height: 11, fontSize: 9, color: "#adb5bd", lineHeight: "11px", width: 22, textAlign: "right" }}>{d}</div>
          ))}
        </div>
        <div className="d-flex" style={{ gap: 3 }}>
          {grid.map((week, wi) => (
            <div key={wi} className="d-flex flex-column" style={{ gap: 3 }}>
              {week.map((day, di) => (
                <div key={di} style={{ width: 11, height: 11, borderRadius: 2, background: cellColor(day.count, day.inRange), cursor: day.inRange && day.count > 0 ? "pointer" : "default" }}
                  onMouseEnter={e => day.inRange && day.date && setTooltip({ x: e.clientX, y: e.clientY, date: day.date, count: day.count || 0 })}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {tooltip && (
        <div className="position-fixed bg-dark text-white p-2 rounded fs-10 shadow-lg" style={{ left: tooltip.x + 10, top: tooltip.y - 40, zIndex: 1000 }}>
          <strong>{tooltip.count} commits</strong> le {fmtDate(tooltip.date)}
        </div>
      )}
    </div>
  );
}

// ─── Component: Individual KPI Card (Dashboard Pattern) ───────────────────────
function KpiCard({ title, value, unit, icon, color, delta }) {
  return (
    <div className="col-xl-3 col-sm-6">
      <div className="card card-animate border-0 shadow-sm h-100">
        <div className="card-body">
          <div className="d-flex align-items-start">
            <div className="avatar-sm flex-shrink-0">
              <span className={`avatar-title bg-${color}-subtle text-${color} rounded-2 fs-2`}>
                <i className={icon}></i>
              </span>
            </div>
            <div className="flex-grow-1 ms-3">
              <p className="text-uppercase fw-medium text-muted mb-1 fs-11" style={{ letterSpacing: ".05em" }}>{title}</p>
              <h4 className="fs-22 mb-1 fw-bold">{value ?? "—"}<span className="fs-13 text-muted fw-normal ms-1">{unit}</span></h4>
              {delta && (
                <span className={`badge bg-${delta.color}-subtle text-${delta.color} fs-11`}>
                  <i className={`${delta.icon} me-1`}></i>{delta.value}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeveloperProfilePage() {
  const { id }                    = useParams();
  const [searchParams]            = useSearchParams();
  const projectId                 = searchParams.get("project_id");

  const [developer,  setDeveloper]  = useState(null);
  const [snapshot,   setSnapshot]   = useState(null);
  const [prevSnap,   setPrevSnap]   = useState(null);
  const [heatmap,    setHeatmap]    = useState([]);
  const [heatmapMeta, setHeatmapMeta] = useState(null);
  const [alerts,     setAlerts]     = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [selectedPid, setSelectedPid] = useState(projectId || "");

  const [loading,        setLoading]        = useState(true);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [exportingPdf,   setExportingPdf]   = useState(false);
  const [heatmapMonths,  setHeatmapMonths]  = useState(12);

  useEffect(() => {
    projectService.getAll().then(data => {
      setProjects(Array.isArray(data) ? data : []);
      if (!selectedPid && data?.length) setSelectedPid(String(data[0].id));
    });
  }, [selectedPid]);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [devData, alertData, heatData] = await Promise.all([
        developerService.getById(id),
        developerService.getDeveloperAlerts(id),
        developerService.getHeatmap(id, heatmapMonths)
      ]);
      setDeveloper(devData);
      setAlerts(Array.isArray(alertData) ? alertData : []);
      setHeatmap(heatData?.activity || []);
      setHeatmapMeta(heatData || null);

      if (selectedPid) {
        const snap = await analyticsService.getLatest(parseInt(selectedPid), { developerId: parseInt(id) });
        setSnapshot(snap);
        const hist = await analyticsService.getHistory(parseInt(selectedPid), { developerId: parseInt(id) });
        const snaps = hist?.snapshots || (Array.isArray(hist) ? hist : []);
        setPrevSnap(snaps.length >= 2 ? snaps[snaps.length - 2] : null);
      }
    } catch { /* err */ } 
    finally { setLoading(false); }
  }, [id, selectedPid, heatmapMonths]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <LoadingSpinner fullPage text="Chargement du profil..." />;
  if (!developer) return <EmptyState title="Profil introuvable" />;

  const kpis = snapshot ? [
    { title: "Commits",      value: snapshot.total_commits, icon: "ri-git-commit-line",   color: "primary", delta: deltaInfo(snapshot.total_commits, prevSnap?.total_commits) },
    { title: "MRs Créées",    value: snapshot.total_mrs_created, icon: "ri-git-pull-request-line", color: "info", delta: deltaInfo(snapshot.total_mrs_created, prevSnap?.total_mrs_created) },
    { title: "Approval Rate", value: fmtPct(snapshot.approved_mr_rate), icon: "ri-checkbox-circle-line", color: "success", delta: deltaInfo(snapshot.approved_mr_rate, prevSnap?.approved_mr_rate) },
    { title: "Review Time",   value: fmt(snapshot.avg_review_time_hours, 1), unit: "h", icon: "ri-time-line", color: "warning", delta: deltaInfo(snapshot.avg_review_time_hours, prevSnap?.avg_review_time_hours) }
  ] : [];

  return (
    <div className="page-content">
      <div className="container-fluid">
        {/* Header pattern */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between mb-4">
              <h4 className="mb-sm-0 fw-bold"><i className="ri-user-settings-line me-2 text-primary"></i>Profil Développeur</h4>
              <div className="page-title-right">
                <ol className="breadcrumb m-0 fs-12">
                  <li className="breadcrumb-item"><Link to="/admin/developers">Hub</Link></li>
                  <li className="breadcrumb-item active">{developer.name || developer.gitlab_username}</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Identity Section */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="card border-0 shadow-sm overflow-hidden">
              <div className="card-body p-4">
                <div className="row align-items-center g-4">
                  <div className="col-auto">
                    <div className="avatar-lg">
                       <span className="avatar-title bg-primary-subtle text-primary rounded-3 fs-1 fw-bold">
                          {getInitials(developer.name || developer.gitlab_username)}
                       </span>
                    </div>
                  </div>
                  <div className="col">
                    <div className="d-flex align-items-center gap-3 mb-2">
                       <h3 className="fw-bold mb-0 text-dark">{developer.name || developer.gitlab_username}</h3>
                       {developer.is_validated ? <span className="badge bg-success-subtle text-success fs-11">VALIDÉ</span> : <span className="badge bg-warning-subtle text-warning fs-11">EN ATTENTE</span>}
                    </div>
                    <div className="d-flex flex-wrap gap-4 text-muted fs-13">
                       <span><i className="ri-at-line me-1 text-primary"></i>@{developer.gitlab_username}</span>
                       <span><i className="ri-mail-line me-1 text-primary"></i>{developer.email || "N/A"}</span>
                       <span><i className="ri-building-line me-1 text-primary"></i>{projects.find(p=>p.id===parseInt(selectedPid))?.name || "Tous projets"}</span>
                    </div>
                  </div>
                  <div className="col-xl-3 text-sm-end">
                     <div className="d-flex flex-column align-items-sm-end gap-2">
                        <label className="fs-11 fw-bold text-muted text-uppercase mb-0">Changer de scope projet</label>
                        <select className="form-select form-select-sm border-light" style={{ width: 220 }}
                          value={selectedPid} onChange={e => setSelectedPid(e.target.value)}>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        {snapshot ? (
          <div className="row g-3 mb-4">
            {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
          </div>
        ) : (
          <div className="alert alert-info border-0 shadow-sm mb-4"><i className="ri-information-line me-2"></i>Aucune donnée KPI sur ce projet pour ce développeur.</div>
        )}

        <div className="row g-4">
          {/* Heatmap Section */}
          <div className="col-xl-8">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header border-bottom d-flex align-items-center">
                <h4 className="card-title mb-0 flex-grow-1"><i className="ri-calendar-todo-line me-2 text-success"></i>Activité Git (Derniers 12 mois)</h4>
                <div className="dropdown">
                   <button className="btn btn-soft-secondary btn-sm" onClick={() => loadData()}><i className="ri-refresh-line"></i></button>
                </div>
              </div>
              <div className="card-body">
                <ActivityHeatmap data={heatmap} startDate={heatmapMeta?.start_date} endDate={heatmapMeta?.end_date} loading={loadingHeatmap} />
                <div className="mt-4 pt-3 border-top border-light">
                   <div className="row text-center">
                      <div className="col-4 border-end border-light">
                         <h5 className="fw-bold mb-1">{heatmapMeta?.total_commits || 0}</h5>
                         <p className="text-muted fs-12 mb-0 uppercase">TOTAL COMMITS</p>
                      </div>
                      <div className="col-4 border-end border-light">
                         <h5 className="fw-bold mb-1">{heatmapMeta?.total_days_active || 0}</h5>
                         <p className="text-muted fs-12 mb-0 uppercase">JOURS ACTIFS</p>
                      </div>
                      <div className="col-4">
                         <h5 className="fw-bold mb-1">{fmt(heatmapMeta?.avg_per_day, 1)}</h5>
                         <p className="text-muted fs-12 mb-0 uppercase">MOY / JOUR</p>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>

          {/* Radar & Analysis */}
          <div className="col-xl-4">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header border-bottom">
                <h4 className="card-title mb-0"><i className="ri-radar-line me-2 text-info"></i>Analyse Multidimensionnelle</h4>
              </div>
              <div className="card-body d-flex flex-column justify-content-center pt-0">
                {snapshot ? <ScoreRadarChart snapshot={snapshot} height={300} /> : <div className="text-center py-5 text-muted">Données insuffisantes</div>}
                {snapshot?.developer_score != null && (
                   <div className="text-center mt-3 p-3 bg-light rounded-3">
                      <h4 className="fw-bold mb-0 text-primary">{Math.round(snapshot.developer_score * 100)} pts</h4>
                      <p className="text-muted fs-12 mb-0">Score de Performance Global</p>
                   </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="row mt-4">
            <div className="col-12">
              <div className="card border-0 shadow-sm">
                <div className="card-header border-bottom bg-danger bg-opacity-10 py-3">
                  <h4 className="card-title mb-0 text-danger"><i className="ri-error-warning-line me-2"></i>Alertes Actives ({alerts.length})</h4>
                </div>
                <div className="card-body">
                   <div className="table-responsive">
                      <table className="table table-nowrap align-middle mb-0">
                         <tbody>
                            {alerts.map((a, i) => (
                               <tr key={i}>
                                  <td style={{width: 40}}><i className={`ri-alert-fill fs-20 text-${a.level === 'CRITICAL' ? 'danger' : 'warning'}`}></i></td>
                                  <td>
                                     <h6 className="fs-13 mb-1">{a.rule_name}</h6>
                                     <p className="text-muted mb-0 fs-12">{a.description}</p>
                                  </td>
                                  <td><span className={`badge bg-${a.level === 'CRITICAL' ? 'danger' : 'warning'}-subtle text-${a.level === 'CRITICAL' ? 'danger' : 'warning'}`}>{a.level}</span></td>
                                  <td className="text-muted fs-12">{fmtDate(a.detected_at)}</td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
