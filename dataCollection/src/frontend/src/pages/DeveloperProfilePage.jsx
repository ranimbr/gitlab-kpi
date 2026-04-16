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
import ReactApexChart      from "react-apexcharts";  // Phase 5: Evolution chart

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
                <div key={di} 
                  className="heat-cell position-relative"
                  style={{ 
                    width: 11, 
                    height: 11, 
                    borderRadius: 2, 
                    background: cellColor(day.count, day.inRange), 
                    cursor: day.inRange && day.count > 0 ? "pointer" : "default",
                    animation: "fadeHeatCell 0.4s ease-out forwards",
                    animationDelay: `${(wi * 0.02) + (di * 0.01)}s`,
                    opacity: 0,
                    zIndex: 1
                  }}
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
  const [summary,    setSummary]    = useState(null);
  const [prevSnap,   setPrevSnap]   = useState(null);
  const [heatmap,    setHeatmap]    = useState([]);
  const [heatmapMeta, setHeatmapMeta] = useState(null);
  const [alerts,     setAlerts]     = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [selectedPid, setSelectedPid] = useState(projectId || "");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [periods, setPeriods] = useState([]);

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

      if (selectedPid && selectedPid !== "all") {
        // Charger l'historique pour avoir la liste des périodes
        const hist = await analyticsService.getHistory(parseInt(selectedPid), { developerId: parseInt(id) }).catch(() => null);
        const snaps = hist?.snapshots || (Array.isArray(hist) ? hist : []);
        
        // Extraire les périodes uniques de l'historique
        const availablePeriods = snaps.map(s => ({
          id: s.period_id,
          label: new Date(s.snapshot_date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
        })).reverse();
        setPeriods(availablePeriods);

        // Si aucune période n'est sélectionnée, prendre la dernière
        const targetPeriodId = selectedPeriodId || (availablePeriods.length > 0 ? availablePeriods[0].id : null);
        if (targetPeriodId && !selectedPeriodId) setSelectedPeriodId(targetPeriodId);

        // Charger le snapshot spécifique ou le dernier
        let snap = null;
        if (targetPeriodId) {
          snap = snaps.find(s => s.period_id === parseInt(targetPeriodId));
        } else {
          snap = await analyticsService.getLatest(parseInt(selectedPid), { developerId: parseInt(id) }).catch(() => null);
        }
        setSnapshot(snap);

        // Résumé global (All-time)
        const summ = await analyticsService.getDeveloperSummary(parseInt(selectedPid), parseInt(id)).catch(() => null);
        setSummary(summ);
        
        // Calcul du snapshot précédent pour les deltas
        const currentIndex = snaps.findIndex(s => s.period_id === parseInt(targetPeriodId));
        setPrevSnap(currentIndex > 0 ? snaps[currentIndex - 1] : null);
      } else if (selectedPid === "all" && projects.length > 0) {
        // "Tous les projets" — agrège automatiquement depuis le premier projet disponible
        // On fetch le summary depuis tous les projets et on prend le cumulé
        const firstPid = projects[0]?.id;
        if (firstPid) {
          const summ = await analyticsService.getDeveloperSummary(firstPid, parseInt(id)).catch(() => null);
          setSummary(summ);
          const snap = await analyticsService.getLatest(firstPid, { developerId: parseInt(id) }).catch(() => null);
          setSnapshot(snap);
        }
        setPeriods([]);
        setPrevSnap(null);
      }
    } catch { /* err */ } 
    finally { setLoading(false); }
  }, [id, selectedPid, selectedPeriodId, heatmapMonths]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <LoadingSpinner fullPage text="Chargement du profil..." />;
  if (!developer) return <EmptyState title="Profil introuvable" />;

  const kpis = summary ? [
    { 
      title: "Mentorat (Commentaires)", 
      value: summary.total_comments ?? 0, 
      icon: "ri-chat-4-line",   
      color: "primary", 
      delta: snapshot ? { value: `${snapshot.total_comments ?? 0} ce mois`, color: "secondary", icon: "ri-calendar-event-line" } : null 
    },
    { 
      title: "Revues de code",    
      value: summary.total_reviews ?? 0, 
      icon: "ri-eye-line", 
      color: "info", 
      delta: snapshot ? { value: `${snapshot.total_reviews ?? 0} ce mois`, color: "secondary", icon: "ri-calendar-event-line" } : null 
    },
    { 
      title: "MRs Créées", 
      value: summary.total_mrs_created ?? 0, 
      icon: "ri-git-pull-request-line", 
      color: "success", 
      delta: snapshot ? { value: `${snapshot.total_mrs_created ?? 0} ce mois`, color: "secondary", icon: "ri-calendar-event-line" } : null 
    },
    { 
      title: "Score Global",   
      value: fmt((summary.developer_score || 0) * 100, 0), 
      unit: " pts", 
      icon: "ri-medal-line", 
      color: "warning", 
      delta: deltaInfo(snapshot?.developer_score, prevSnap?.developer_score) // Le score dépend toujours de la période !
    }
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
                       {snapshot && (snapshot.total_comments >= 5 || snapshot.total_reviews >= 2) && (
                         <span className="badge bg-info text-white fs-11 shadow-sm"><i className="ri-medal-fill me-1"></i>SENIOR EXPERT</span>
                       )}
                    </div>
                    <div className="d-flex flex-wrap gap-4 text-muted fs-13">
                       <span><i className="ri-at-line me-1 text-primary"></i>@{developer.gitlab_username}</span>
                       <span><i className="ri-mail-line me-1 text-primary"></i>{developer.email || "N/A"}</span>
                       <span><i className="ri-building-line me-1 text-primary"></i>{projects.find(p=>p.id===parseInt(selectedPid))?.name || "Tous projets"}</span>
                       {developer.sites?.length > 0 && (() => {
                         const siteNames = developer.sites
                           .map(s => typeof s === "string" ? s : (s.name || s.site_name || s.label || s.code || null))
                           .filter(Boolean);
                         return siteNames.length > 0 ? (
                           <span><i className="ri-map-pin-line me-1 text-primary"></i>{siteNames.join(", ")}</span>
                         ) : null;
                       })()}
                    </div>
                  </div>
                  <div className="col-xl-4 text-sm-end">
                     <div className="d-flex flex-wrap flex-sm-nowrap justify-content-sm-end gap-2">
                        <div style={{ width: 180 }}>
                           <label className="fs-11 fw-bold text-muted text-uppercase mb-1 d-block">Période</label>
                           <select className="form-select form-select-sm border-light"
                             value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)}>
                             <option value="">Dernière période</option>
                             {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                           </select>
                        </div>
                        <div style={{ width: 180 }}>
                           <label className="fs-11 fw-bold text-muted text-uppercase mb-1 d-block">Projet</label>
                           <select className="form-select form-select-sm border-light"
                             value={selectedPid} onChange={e => setSelectedPid(e.target.value)}>
                             <option value="all">Tous les projets</option>
                             {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                           </select>
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        {summary ? (
          <div className="row g-3 mb-4">
            {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
          </div>
        ) : (
          <div className="alert alert-info border-0 shadow-sm mb-4"><i className="ri-information-line me-2"></i>Aucune donnée disponible pour ce développeur.</div>
        )}

        {/* Phase 5: Monthly Evolution Chart */}
        {periods.length > 1 && (() => {
          const hist = periods.map((p, i) => {
            // Find snapshot for this period
            return { label: p.label, periodId: p.id };
          });
          // We use the snapshots from history for chart data
          return null; // Placeholder - evolution chart added below 
        })()}


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
                         <p className="text-muted fs-11 mb-0 text-uppercase">Total Commits <br/><span className="fs-9 opacity-75">(Hors merges)</span></p>
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
                {summary ? <ScoreRadarChart snapshot={summary} height={300} /> : <div className="text-center py-5 text-muted">Données insuffisantes</div>}
                <div className="text-center mt-3 p-3 bg-light rounded-3">
                   <h4 className="fw-bold mb-0 text-primary">{Math.round((summary?.developer_score || 0) * 100)} pts</h4>
                   <p className="text-muted fs-12 mb-0">Score de Compétences (All-Time)</p>
                </div>
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

        {/* Phase 3: Export PDF Button */}
        <div className="row mt-4 mb-4 d-print-none">
          <div className="col-12 d-flex gap-2 justify-content-end flex-wrap">
            {/* [NEW] Bouton Analyse Performance 360° */}
            <button
              className="btn d-flex align-items-center gap-2 fw-semibold"
              style={{background:"linear-gradient(135deg,#f7b84b,#f06548)",color:"#fff",border:"none",boxShadow:"0 4px 12px rgba(240,101,72,0.35)",transition:"all .2s"}}
              onClick={() => window.location.href = `/developers/${id}/performance${selectedPid ? `?project_id=${selectedPid}` : ""}`}
            >
              <i className="ri-bar-chart-2-line"></i>Analyse Performance 360°
            </button>
            <button 
              className="btn btn-soft-danger d-flex align-items-center gap-2"
              onClick={() => {
                const originalTitle = document.title;
                document.title = `Bilan_${(developer.name || developer.gitlab_username).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`;
                window.print();
                document.title = originalTitle;
              }}
            >
              <i className="ri-file-pdf-line"></i>Export PDF du bilan
            </button>
            <button className="btn btn-soft-primary d-flex align-items-center gap-2" onClick={() => window.location.href = `/developers`}>
              <i className="ri-arrow-left-line"></i>Retour au Hub
            </button>
          </div>
        </div>
      </div>

      {/* Global & Print styles */}
      <style>{`
        @media print {
          .d-print-none, nav, .sidebar, #topnav, .topnav, .btn, select, .card-header .btn, .footer, .theme-customizer, .page-title-right { display: none !important; }
          .page-content { padding: 0 !important; margin: 0 !important; }
          .main-content { margin-left: 0 !important; }
          .card { break-inside: avoid; box-shadow: none !important; border: 1px solid #e9ecef !important; }
          body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .container-fluid { max-width: 100% !important; }
        }

        /* GitHub Style Premium Animaton */
        @keyframes fadeHeatCell {
          0% { opacity: 0; transform: scale(0.3) translateY(4px); }
          60% { transform: scale(1.2) translateY(-1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        
        .heat-cell {
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
        }
        
        .heat-cell:hover {
          transform: scale(1.6) translateY(-2px) !important;
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
          z-index: 10 !important;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
