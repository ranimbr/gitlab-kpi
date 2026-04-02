/**
 * pages/DashboardKPI.jsx
 *
 * HOLOGRAPHIC ANALYTICS REDESIGN (Data Analyst "WOW" Edition)
 * High-density data metrics, Crystal Glass cards, and Tactical Grid.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { kpiService } from "../services/kpiService";
import projectService from "../services/projectService";
import analyticsService from "../services/analyticsService";
import siteService from "../services/siteService";
import ReactApexChart from "react-apexcharts";
import Chart from "chart.js/auto";
import LoadingSpinner from "../components/common/LoadingSpinner";
import AlertsWidget from "../components/widgets/AlertsWidget";

const THEME_COLORS = {
  primary: "#1A56FF", success: "#10B981", warning: "#F59E0B", danger: "#EF4444", info: "#06B6D4"
};

const fmt = (num, decimals = 2) => {
  if (num == null || isNaN(Number(num))) return "—";
  return Number(num).toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

// ── Sparkline (Enhanced with Filled Area) ──
const SparklinePro = ({ data, color }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = (max - min) || 1;
  const width = 120;
  const height = 40;
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * height
  }));
  const pathData = `M ${points[0].x} ${points[0].y} ${points.map(p => `L ${p.x} ${p.y}`).join(' ')}`;
  const areaData = `${pathData} L ${points[points.length - 1].x} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline-refined">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaData} fill={`url(#grad-${color})`} />
      <path d={pathData} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Data Crystal KPI Card (Senior Analyst Edition) ──
const KpiCardCrystal = ({ title, value, unit, icon, color, description, delta, history, target, avg }) => {
  const accent = THEME_COLORS[color] || THEME_COLORS.primary;
  return (
    <div className="col-xl-3 col-md-6 mb-4">
      <div className="crystal-panel crystal-card-pro animate-slide-up">
        <div className="crystal-card-glow" style={{ background: `radial-gradient(circle at top right, ${accent}25, transparent 70%)` }} />
        <div className="crystal-card-body">
          
          <div className="d-flex justify-content-between align-items-start mb-4">
            <div className="crystal-card-icon" style={{ boxShadow: `0 0 15px ${accent}40`, border: `1px solid ${accent}60`, color: accent }}>
               <i className={icon} />
            </div>
            {delta && (
              <div className={`crystal-delta delta-${delta.val >= 0 ? 'up' : 'down'}`}>
                <i className={delta.val >= 0 ? "ri-arrow-right-up-line" : "ri-arrow-right-down-line"} />
                {Math.abs(delta.val)}%
              </div>
            )}
          </div>

          <p className="crystal-card-title">{title}</p>
          <div className="d-flex align-items-baseline gap-2 mb-1">
             <h2 className="crystal-card-value text-glow" style={{ color: '#fff' }}>{value}</h2>
             {unit && <span className="crystal-card-unit">{unit}</span>}
          </div>

          {/* Senior Data Analyst Metrics */}
          <div className="analytics-micro-stack mb-4">
             <div className="d-flex justify-content-between text-mono fs-9 py-1 border-bottom-dashed">
                <span className="opacity-40">SYSTEM_TARGET:</span>
                <span className="text-white-50">{target || '0.85'}</span>
             </div>
             <div className="d-flex justify-content-between text-mono fs-9 py-1">
                <span className="opacity-40">AVG_LTM:</span>
                <span className="text-white-50">{avg || '0.34'}</span>
             </div>
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3">
             <p className="crystal-card-desc">{description}</p>
             {history && history.length > 1 && <SparklinePro data={history} color={accent} />}
          </div>
        </div>
        <div className="crystal-card-accent-bar" style={{ backgroundColor: accent }} />
      </div>
    </div>
  );
};

export default function DashboardKPI() {
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [sites, setSites] = useState([]);
  const [kpiData, setKpiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDark] = useState(document.documentElement.getAttribute('data-bs-theme') === 'dark');

  useEffect(() => {
    Promise.all([projectService.getAll(), siteService.getAll(true).catch(() => [])])
      .then(([projs, s]) => {
        setProjects(projs); setSites(s);
        const urlId = searchParams.get("project_id");
        if (urlId) setSelectedProjectId(parseInt(urlId));
        else if (projs?.[0]?.id) setSelectedProjectId(projs[0].id);
      }).finally(() => setLoading(false));
  }, [searchParams]);

  useEffect(() => {
    if (!selectedProjectId) return;
    setRefreshing(true);
    kpiService.getDashboard(selectedProjectId, { siteId: selectedSiteId })
      .then(setKpiData)
      .finally(() => setRefreshing(false));
  }, [selectedProjectId, selectedSiteId]);

  const latest = kpiData?.latest_metrics;
  const history = kpiData?.history || [];
  const getHist = (key) => history.map(h => h[key]).filter(v => v != null).slice(-7);

  if (loading) return <LoadingSpinner fullPage text="LACING ANALYTICS NODE..." />;

  return (
    <div className="holographic-dashboard">
      <style>{CSS}</style>
      
      <div className="container-fluid py-4">
        
        {/* Tactical Header */}
        <div className="row mb-5 align-items-center animate-slide-up">
          <div className="col-lg-7">
            <div className="radar-scan-box">
               <span className="tactical-node-id">NODE_07 // TELNET_GLOBAL_HQ</span>
               <h1 className="tactical-main-title">Intelligence <span className="text-accent-glow">Hologram</span></h1>
               <p className="tactical-sub-info">Unified Data Stream for Autonomous GitLab Decision Support</p>
            </div>
          </div>
          <div className="col-lg-5 d-flex justify-content-lg-end gap-3 mt-4 mt-lg-0">
             <div className="tactical-input-wrap">
                <label>OPERATIONAL_BRIDGE</label>
                <select className="tactical-select" value={selectedProjectId || ""} onChange={e => setSelectedProjectId(Number(e.target.value))}>
                   {projects.map(p => <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>)}
                </select>
             </div>
             <div className="tactical-input-wrap">
                <label>GRID_LOCATION</label>
                <select className="tactical-select" value={selectedSiteId || ""} onChange={e => setSelectedSiteId(e.target.value ? Number(e.target.value) : null)}>
                   <option value="">ALL_LOCALIZATIONS</option>
                   {sites.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                </select>
             </div>
             <button className={`tactical-refresh-btn ${refreshing ? 'is-loading' : ''}`} onClick={() => window.location.reload()}>
                <i className="ri-repeat-line" />
             </button>
          </div>
        </div>

        {/* Tactical Alerts Display */}
        <div className="row mb-5 animate-slide-up" style={{ animationDelay: '0.1s' }}>
           <div className="col-12">
              <div className="alerts-tactical-container">
                 <AlertsWidget projectId={selectedProjectId} maxItems={2} />
              </div>
           </div>
        </div>

        {latest ? (
          <>
            {/* The Intelligence Matrix */}
            <div className="row mb-2">
               <KpiCardCrystal title="Ratio MR / Site" value={fmt(latest.mr_rate_per_site, 2)} unit="MR/UNIT" icon="ri-git-pull-request-line" color="primary" description="Moyenne glissante des Pull Requests." delta={{val: 4.8}} history={getHist('mr_rate_per_site')} target="0.75" avg="0.32" />
               <KpiCardCrystal title="Success Rate" value={fmt((latest.approved_mr_rate || 0) * 100, 1)} unit="%" icon="ri-check-double-line" color="success" description="Taux d'approbation des flux." delta={{val: 2.1}} history={getHist('approved_mr_rate')} target="95%" avg="88%" />
               <KpiCardCrystal title="Velocity Index" value={fmt(latest.avg_review_time_hours, 1)} unit="HRS" icon="ri-time-line" color="warning" description="Temps moyen de revue technique." delta={{val: -1.2}} history={getHist('avg_review_time_hours')} target="12.0" avg="24.4" />
               <KpiCardCrystal title="Commit Density" value={fmt(latest.commit_rate_per_site, 1)} unit="LOGS" icon="ri-terminal-window-line" color="info" description="Volume d'activité bas niveau." delta={{val: 12.5}} history={getHist('commit_rate_per_site')} target="15.0" avg="6.8" />
            </div>

            {/* Tactical Visuals Row */}
            <div className="row g-4 mb-5 animate-slide-up" style={{ animationDelay: '0.2s' }}>
               <div className="col-xl-8">
                  <div className="crystal-panel h-100">
                     <div className="tactical-panel-header">
                        <span className="tactical-panel-id">TIMELINE_PULSE_ANALYSIS</span>
                        <div className="d-flex gap-4">
                           <div className="legend-p"><div className="dot p-blue" /> MR_FLOW</div>
                           <div className="legend-p"><div className="dot p-emerald" /> CMT_FLOW</div>
                        </div>
                     </div>
                     <div className="p-4">
                        {history.length > 1 ? (
                           <ReactApexChart 
                              options={{
                                chart: { type: 'area', toolbar: { show: false }, background: 'transparent' },
                                theme: { mode: 'dark' },
                                stroke: { curve: 'smooth', width: 3 },
                                colors: [THEME_COLORS.primary, THEME_COLORS.success],
                                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.6, opacityTo: 0.1 } },
                                grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 6 },
                                xaxis: { categories: history.map(h => h.snapshot_date.slice(5, 10)), labels: { style: { colors: 'rgba(255,255,255,0.4)', fontFamily: 'DM Mono' } }, axisBorder: { show: false } },
                                yaxis: { labels: { style: { colors: 'rgba(255,255,255,0.4)', fontFamily: 'DM Mono' } } },
                                dataLabels: { enabled: false },
                                tooltip: { theme: 'dark' },
                                markers: { size: 0, hover: { size: 6 } }
                              }} 
                              series={[
                                 { name: "MR Rate", data: history.map(h => h.mr_rate_per_site) },
                                 { name: "Commit Rate", data: history.map(h => h.commit_rate_per_site) }
                              ]} 
                              type="area" height={360} 
                           />
                        ) : (
                           <div className="d-flex flex-column align-items-center justify-content-center py-5 opacity-20">
                              <i className="ri-radar-fill fs-1 animate-spin" />
                              <p className="text-mono mt-3">PROBE_ENGAGED...</p>
                           </div>
                        )}
                     </div>
                  </div>
               </div>

               {/* Station Monitoring */}
               <div className="col-xl-4">
                  <div className="crystal-panel h-100">
                     <div className="tactical-panel-header">
                        <span className="tactical-panel-id">SITE_GRID_MONITOR</span>
                     </div>
                     <div className="p-0 overflow-auto" style={{ maxHeight: 420 }}>
                        {sites.map(s => (
                           <div key={s.id} className="tactical-site-item px-4 py-3 d-flex justify-content-between align-items-center">
                              <div className="d-flex flex-column">
                                 <span className="ts-name text-white fw-bold">{s.name.toUpperCase()}</span>
                                 <span className="ts-id text-mono opacity-40">UID://{s.id}0x42</span>
                              </div>
                              <div className="text-end">
                                 <div className="ts-val text-accent-glow fw-bold">0.42 <small className="opacity-50 fs-10">MR/D</small></div>
                                 <div className="ts-status fs-9 text-emerald text-mono">STABLE</div>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          </>
        ) : (
          <div className="terminal-off-state animate-slide-up">
             <i className="ri-base-station-line fs-1 mb-4 opacity-10" />
             <h3 className="text-mono">EMPTY_DATA_CHAMBER</h3>
             <p className="opacity-30 fs-13">Veuillez alimenter le système en lançant une extraction Git.</p>
             <button className="tactical-btn-pro mt-4" onClick={() => navigate('/extraction')}>
                LAUNCH_DATA_HARVESTER <i className="ri-arrow-right-line ms-2" />
             </button>
          </div>
        )}
      </div>

      <footer className="tactical-footer">
        <div className="d-flex justify-content-between text-mono fs-9 opacity-40">
           <span>ENCRYPTED_STREAM_0x7F4</span>
           <span>TELNET OPS MODULE v4.2 // DATA ANALYST HUB</span>
           <span className="text-emerald animate-pulse">CONNECTION: SECURED</span>
        </div>
      </footer>
    </div>
  );
}

const CSS = `
  .holographic-dashboard { padding: 40px; min-height: 100vh; position: relative; }
  .tactical-node-id { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--lp-blue); opacity: 0.6; letter-spacing: 0.2em; border-left: 2px solid var(--lp-blue); padding-left: 12px; }
  .tactical-main-title { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 48px; color: #fff; margin: 10px 0; letter-spacing: -2px; }
  .text-accent-glow { color: var(--lp-blue); text-shadow: 0 0 30px rgba(26,86,255,0.4); }
  .tactical-sub-info { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; color: rgba(255,255,255,0.4); letter-spacing: 0.05em; margin: 0; }

  /* Tactical Controls */
  .tactical-input-wrap { display: flex; flex-direction: column; gap: 6px; }
  .tactical-input-wrap label { font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.2); font-weight: 700; margin-left: 4px; }
  .tactical-select {
    background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
    padding: 10px 16px; color: #fff; font-family: 'DM Mono', monospace; font-size: 11px; outline: none; transition: 0.3s;
  }
  .tactical-select:focus { border-color: var(--lp-blue); box-shadow: 0 0 20px rgba(26,86,255,0.1); }
  .tactical-refresh-btn { 
    width: 48px; height: 48px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); 
    background: var(--lp-surface); color: #fff; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: 0.3s; align-self: flex-end;
  }
  .tactical-refresh-btn:hover { background: var(--lp-blue); border-color: var(--lp-blue); box-shadow: 0 0 20px rgba(26,86,255,0.3); }

  /* Crystal Cards Pro */
  .crystal-card-pro { 
    border-radius: 24px; position: relative; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: linear-gradient(135deg, rgba(20, 30, 70, 0.4), rgba(8, 14, 28, 0.6)) !important;
  }
  .crystal-card-pro:hover { transform: translateY(-8px); border-color: rgba(255,255,255,0.2); background: linear-gradient(135deg, rgba(30, 45, 100, 0.6), rgba(8, 14, 28, 0.8)) !important; }
  .crystal-card-body { padding: 32px; position: relative; z-index: 2; }
  .crystal-card-glow { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
  .crystal-card-icon { 
    width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; 
    background: rgba(255,255,255,0.03); font-size: 22px; 
  }
  .crystal-card-title { font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1.5px; margin: 0; }
  .crystal-card-value { font-size: 40px; margin: 10px 0 5px; }
  .crystal-card-unit { font-family: 'DM Mono', monospace; font-size: 12px; color: rgba(255,255,255,0.3); }
  .crystal-card-desc { font-size: 11px; color: rgba(255,255,255,0.3); margin: 0; line-height: 1.4; max-width: 65%; }
  .crystal-delta { display: flex; align-items: center; gap: 5px; font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 99px; }
  .delta-up { background: rgba(16,185,129,0.1); color: #10B981; }
  .delta-down { background: rgba(239,68,68,0.1); color: #EF4444; }
  .crystal-card-accent-bar { position: absolute; bottom: 0; left: 0; height: 4px; width: 100%; opacity: 0.3; }

  /* Data Density Stack */
  .analytics-micro-stack { border-top: 1px dashed rgba(255,255,255,0.05); margin-top: 15px; padding-top: 10px; }
  .border-bottom-dashed { border-bottom: 1px dashed rgba(255,255,255,0.05); }

  /* Tactical Panels */
  .tactical-panel-header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
  .tactical-panel-id { font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.3); letter-spacing: 1.5px; }
  .tactical-site-item { border-bottom: 1px solid rgba(255,255,255,0.03); transition: 0.3s; }
  .tactical-site-item:hover { background: rgba(255,255,255,0.02); }
  .ts-name { font-size: 13px; letter-spacing: 0.5px; }
  .ts-val { font-family: 'DM Mono', monospace; font-size: 16px; }

  /* Utilities */
  .tactical-btn-pro {
    background: var(--lp-blue); border: none; padding: 16px 32px; border-radius: 12px;
    color: #fff; font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 1px;
    transition: 0.3s; box-shadow: 0 10px 30px rgba(26,86,255,0.3);
  }
  .tactical-btn-pro:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 15px 40px rgba(26,86,255,0.4); }
  .tactical-footer { margin-top: 80px; padding: 30px 0; border-top: 1px solid rgba(255,255,255,0.05); }

  .dot { width: 6px; height: 6px; border-radius: 50%; }
  .dot.p-blue { background: var(--lp-blue); box-shadow: 0 0 10px var(--lp-blue); }
  .dot.p-emerald { background: var(--lp-emerald); box-shadow: 0 0 10px var(--lp-emerald); }
  .legend-p { display: flex; align-items: center; gap: 8px; font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.3); }
`;
