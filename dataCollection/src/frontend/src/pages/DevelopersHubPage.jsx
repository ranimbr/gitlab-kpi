/**
 * pages/DevelopersHubPage.jsx — Developer-Centric Hub
 * 
 * SENIOR REFACTOR (Industrial Harmony Edition)
 * Aligning perfectly with the Bootstrap/Velzon template used in ProjectsPage and DashboardKPI.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import siteService      from "../services/siteService";
import projectService   from "../services/projectService";
import extractionLotService from "../services/extractionLotService";
import periodService    from "../services/periodService";
import LoadingSpinner   from "../components/common/LoadingSpinner";
import EmptyState       from "../components/common/EmptyState";
import Pagination       from "../components/common/Pagination";
import { useAuth }      from "../context/AuthContext";
import developerService from "../services/developerService";
import DeveloperPerformanceReport from "../components/analytics/DeveloperPerformanceReport";
import DeveloperImportModal from "../components/admin/DeveloperImportModal";
import ReactApexChart from "react-apexcharts";
import api from "../services/api";

// ─── [SENIOR] Lifecycle Status Config (Binary & Deduced) ──────────────────────
const STATUS_CONFIG = {
  ACTIVE:     { label: 'ACTIF',    color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: 'ri-checkbox-circle-fill' },
  OFFBOARDED: { label: 'PARTI',    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: 'ri-logout-box-r-line'    },
};

function getRhStatus(dev) {
  return dev.is_active ? 'ACTIVE' : 'OFFBOARDED';
}

// ─── [SENIOR] Modal Statut supprimé au profit de l'automatisation CSV ────────

// ─── Helpers (Standardized with ProjectsPage) ─────────────────────────────────
function getInitials(name="") { return(name||"?").split(/[\s._-]/).map(w=>w[0]).join("").toUpperCase().slice(0,2); }
const COLORS = ["primary", "success", "info", "warning", "danger", "secondary"];

// ─── Component: Counter Stats (Dashboard Pattern) ─────────────────────────────
function StatsCard({ label, value, sub, icon, color }) {
  return (
    <div className="col-xl-3 col-sm-6">
      <div className="card card-animate border-0 shadow-sm">
        <div className="card-body">
          <div className="d-flex align-items-center">
            <div className="avatar-sm flex-shrink-0">
              <span className={`avatar-title bg-${color}-subtle text-${color} rounded-2 fs-2`}>
                <i className={icon}></i>
              </span>
            </div>
            <div className="flex-grow-1 overflow-hidden ms-3">
              <p className="text-uppercase fw-medium text-muted text-truncate mb-2 fs-12" style={{ letterSpacing: ".05em" }}>{label}</p>
              <h4 className="fs-4 mb-1 fw-bold">{value}</h4>
              <p className="text-muted text-truncate mb-0 fs-12">{sub}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Gradient palette for avatars ─────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#4361ee,#3a0ca3)",
  "linear-gradient(135deg,#10b981,#059669)",
  "linear-gradient(135deg,#06b6d4,#0e7490)",
  "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#ef4444,#dc2626)",
  "linear-gradient(135deg,#8b5cf6,#7c3aed)",
];

// ─── Persona Logic ──────────────────────────────────────────────────────────
const getPersona = (kpis) => {
  if (!kpis) return null;
  const { total_mrs_created: mr, approved_mr_rate: app, avg_review_time_hours: rev, developer_score: score } = kpis;
  
  if (score < 0.3) return { label: "À Soutenir", color: "danger", icon: "ri-error-warning-line" };
  if (app > 0.85 && rev < 24) return { label: "Quality Ace", color: "success", icon: "ri-shield-check-line" };
  if (mr > 15) return { label: "Code Machine", color: "primary", icon: "ri-rocket-line" };
  if (rev < 12) return { label: "Fast Reviewer", color: "info", icon: "ri-flashlight-line" };
  if (score > 0.75) return { label: "Elite Dev", color: "warning", icon: "ri-medal-line" };
  return { label: "Steady Coder", color: "secondary", icon: "ri-line-chart-line" };
};

const MiniRadar = ({ kpis }) => {
  if (!kpis) return null;
  const series = [{
    name: 'Profile',
    data: [
      Math.min((kpis.total_commits || 0) * 2, 100),
      Math.min((kpis.total_mrs_created || 0) * 5, 100),
      Math.round((kpis.approved_mr_rate || 0) * 100),
      Math.max(0, 100 - (kpis.avg_review_time_hours || 0) * 2)
    ]
  }];
  
  const options = {
    chart: { sparkline: { enabled: true }, toolbar: { show: false }, background: 'transparent' },
    colors: ['#4361ee'],
    stroke: { width: 1.5, colors: ['rgba(67, 97, 238, 0.4)'] },
    fill: { opacity: 0.05, colors: ['#4361ee'] },
    markers: { size: 0 },
    xaxis: { categories: ['Commit', 'MR', 'Quality', 'Review'], labels: { show: false } },
    yaxis: { show: false, min: 0, max: 100 },
    grid: { show: false }
  };
  
  return (
    <div style={{ width: 80, height: 80, position: 'absolute', right: 10, top: 40, opacity: 0.6 }}>
      <ReactApexChart options={options} series={series} type="radar" height={100} width={100} />
    </div>
  );
};

// ─── Component: Developer Card (Premium Grid Pattern) ─────────────────────────
function DeveloperCard({ dev, sites, latestKpis, alertCount, index, onShowReport, loading, projectFilter, selectedPeriodId, periods, onStatusChanged }) {
  const { isTeamLead } = useAuth();
  const [currentStatus, setCurrentStatus]     = useState(() => getRhStatus(dev));

  const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.ACTIVE;
  
  if (loading) {
    return (
      <div className="col-xl-4 col-sm-6">
        <div className="card h-100 shadow-sm border-0">
          <div className="card-body p-4">
             <div className="d-flex align-items-center gap-3 mb-4">
                <div className="skeleton rounded-circle" style={{ width: 48, height: 48 }} />
                <div className="flex-grow-1">
                   <div className="skeleton mb-2" style={{ width: '70%', height: 14 }} />
                   <div className="skeleton" style={{ width: '40%', height: 10 }} />
                </div>
             </div>
             <div className="skeleton mb-3" style={{ height: 12, borderRadius: 6 }} />
             <div className="row g-2">
                {[1,2,3].map(i => <div key={i} className="col-4"><div className="skeleton" style={{ height: 30, borderRadius: 8 }} /></div>)}
             </div>
          </div>
        </div>
      </div>
    );
  }

  const gradient = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];
  const siteName = sites.find(s => s.id === dev.primary_site_id)?.name;
  const devKpis = latestKpis?.[dev.id];
  const score = devKpis?.developer_score != null ? Math.round(devKpis.developer_score * 100) : null;
  const scoreColor = score == null ? '#94a3b8' : score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const persona = getPersona(devKpis);

  return (
    <div className="col-xl-4 col-sm-6">
      <div className="card hover-lift h-100" style={{ overflow: 'hidden' }}>
        {/* Top accent bar */}
        <div style={{ height: 4, background: gradient }} />
        <div className="card-body" style={{ padding: '18px 20px' }}>
          {/* Header: Avatar + Name */}
          <div className="d-flex align-items-center gap-3 mb-3">
            <div style={{
              width: 46, height: 46, borderRadius: '50%',
              background: gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 16, flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
              {getInitials(dev.name || dev.gitlab_username)}
            </div>
            <div className="flex-grow-1 min-w-0">
              <Link to={`/developers/${dev.id}?project_id=${projectFilter}${selectedPeriodId ? `&period_id=${selectedPeriodId}` : ''}`}
                style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', textDecoration: 'none', display: 'block' }}
                className="text-truncate">
                {dev.name || dev.gitlab_username}
              </Link>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>@{dev.gitlab_username || 'anonymous'}</div>
            </div>
            {score !== null && (
              <div className="d-flex align-items-center gap-2">
                {/* Trend Indicator */}
                {devKpis?.trend && (
                  <div title={devKpis.trend > 0 ? "Progression Positive" : "Déclin de performance"} style={{
                    color: devKpis.trend > 0 ? '#10b981' : '#ef4444',
                    fontSize: 18, animation: 'bounceTrend 2s infinite'
                  }}>
                    <i className={devKpis.trend > 0 ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line'} />
                  </div>
                )}
                <div style={{
                  background: score >= 70 ? 'rgba(16,185,129,0.1)' : score >= 40 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                  color: scoreColor, fontWeight: 800, fontSize: 14,
                  padding: '4px 10px', borderRadius: 8, flexShrink: 0,
                  zIndex: 2,
                }}>
                  {score}%
                </div>
              </div>
            )}
          </div>
          
          {/* Persona Tag */}
          {persona && (
            <div className={`mb-3 d-flex align-items-center gap-1`}>
               <span className={`badge bg-${persona.color}-subtle text-${persona.color} px-2 py-1 fs-10 fw-bold border border-${persona.color} opacity-75`}>
                  <i className={`${persona.icon} me-1`}></i>{persona.label.toUpperCase()}
               </span>
            </div>
          )}

          {/* Mini Radar Visual */}
          <MiniRadar kpis={devKpis} />

          {/* Score Progress Bar */}
          {score !== null && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Score Performance</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor }}>{score}/100</span>
              </div>
              <div style={{ height: 5, background: 'rgba(0,0,0,0.06)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${score}%`, background: scoreColor, borderRadius: 99, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          )}

          {/* Badges */}
          <div className="d-flex flex-wrap gap-1 mb-3">
            {dev.is_validated ? (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
                <i className="ri-checkbox-circle-line me-1" />VALIDÉ
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#94a3b8' }}>EN ATTENTE</span>
            )}
            {siteName && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(67,97,238,0.1)', color: '#4361ee' }}>
                <i className="ri-map-pin-line me-1" />{siteName}
              </span>
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 14, gap: 8 }}>
            {[
              { 
                label: 'Commits', 
                value: devKpis?.total_commits ?? 0, 
                color: '#4361ee',
                tooltip: 'Voir les commits de ce développeur',
                link: `/commits?project_id=${projectFilter}&developer_id=${dev.id}${selectedPeriodId ? `&period_id=${selectedPeriodId}` : ''}`
              },
              { 
                label: 'MRs', 
                value: devKpis?.total_mrs_created ?? 0, 
                color: '#06b6d4',
                tooltip: 'Voir les MRs de ce développeur',
                link: `/merge?project_id=${projectFilter}&developer_id=${dev.id}${selectedPeriodId ? `&period_id=${selectedPeriodId}` : ''}`
              },
              { 
                label: 'Taux MR', 
                value: devKpis?.approved_mr_rate != null ? `${(devKpis.approved_mr_rate * 100).toFixed(0)}%` : '0%', 
                color: '#10b981',
                tooltip: 'Taux de MRs approuvées',
                link: null
              },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }} title={s.tooltip}>
                {s.link ? (
                  <Link to={s.link} style={{ textDecoration: 'none' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: devKpis ? s.color : '#c8d1db', lineHeight: 1 }}>{s.value}</div>
                  </Link>
                ) : (
                  <div style={{ fontSize: 15, fontWeight: 800, color: devKpis ? s.color : '#c8d1db', lineHeight: 1 }}>{s.value}</div>
                )}
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* ✅ [SENIOR] No-data state removed: KPIs are now always aggregated globally if no project selected */}
        </div>

        {/* Footer CTA */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', padding: '10px 20px', background: '#fafbfc' }}>
          <Link to={`/developers/${dev.id}/performance?project_id=${projectFilter}${selectedPeriodId ? `&period_id=${selectedPeriodId}` : ''}`}
            style={{ fontSize: 12, fontWeight: 600, color: '#4361ee', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            Analyse détaillée <i className="ri-arrow-right-line" style={{ fontSize: 13 }} />
          </Link>
        </div>

        {/* [SENIOR] Lifecycle Information (Deduced from CSV/Sync) */}
        <div style={{ padding: '0 20px 15px 20px', background: '#fafbfc', display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.5px' }}>Statut RH</span>
            <span style={{
              fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:99,
              background: statusCfg.bg, color: statusCfg.color,
              display:'flex', alignItems:'center', gap:4,
            }}>
              <i className={statusCfg.icon} />
              {statusCfg.label}
            </span>
          </div>

          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', border: '1px solid #edf2f7' }}>
            <div className="d-flex justify-content-between mb-1">
              <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8' }}>ENTRÉE</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>
                {dev.onboarding_date ? new Date(dev.onboarding_date).toLocaleDateString('fr-FR') : 'Non renseignée'}
              </span>
            </div>
            {!dev.is_active && (
              <div className="d-flex justify-content-between">
                <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444' }}>SORTIE</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>
                  {dev.offboarding_date ? new Date(dev.offboarding_date).toLocaleDateString('fr-FR') : 'Automatique'}
                </span>
              </div>
            )}
          </div>

          {/* Bouton Timeline & Bilan */}
          <div className="d-flex gap-2 mt-1">
            <button
              onClick={() => onShowReport(dev.id)}
              className="btn btn-soft-primary btn-sm flex-grow-1 d-flex align-items-center justify-content-center gap-1"
              style={{ fontSize:10, fontWeight:700 }}
            >
              <i className="ri-file-chart-line" /> BILAN
            </button>
            <Link 
              to={`/developers/${dev.id}#timeline`}
              className="btn btn-soft-info btn-sm flex-grow-1 d-flex align-items-center justify-content-center gap-1"
              style={{ fontSize:10, fontWeight:700 }}
            >
              <i className="ri-history-line" /> TIMELINE
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Component: Leaderboard Premium ──────────────────────────────────────────
const RANK_STYLES = [
  { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', label: '🥇' },
  { bg: 'linear-gradient(135deg,#94a3b8,#64748b)', label: '🥈' },
  { bg: 'linear-gradient(135deg,#f97316,#ea580c)', label: '🥉' },
];

function Leaderboard({ entries = [], loading }) {
  if (loading) return (
    <div className="card" style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner-border" style={{ width: 28, height: 28, borderColor: 'rgba(67,97,238,0.15)', borderTopColor: '#4361ee' }} />
    </div>
  );
  if (!entries?.length) return null;

  return (
    <div className="card h-100" style={{ overflow: 'hidden' }}>
      <div className="card-header d-flex align-items-center" style={{ padding: '14px 20px' }}>
        <i className="ri-trophy-line me-2" style={{ color: '#f59e0b', fontSize: 18 }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Top Performers</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.1)', color: '#d97706' }}>
          Top {Math.min(entries.length, 10)}
        </span>
      </div>
      <div className="card-body" style={{ padding: '8px 0' }}>
        {entries.slice(0, 10).map((entry, i) => {
          const s = entry.developer_score != null ? Math.round(entry.developer_score * 100) : null;
          const rankStyle = i < 3 ? RANK_STYLES[i] : null;
          const scoreColor = s == null ? '#94a3b8' : s >= 70 ? '#10b981' : s >= 40 ? '#f59e0b' : '#ef4444';
          return (
            <div key={entry.developer_id || i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 20px',
              borderBottom: i < 9 ? '1px solid rgba(0,0,0,0.04)' : 'none',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Rank badge */}
              {rankStyle ? (
                <div style={{
                  width: 28, height: 28, borderRadius: 8, background: rankStyle.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>{rankStyle.label}</div>
              ) : (
                <div style={{
                  width: 28, height: 28, borderRadius: 8, background: '#f1f5f9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#94a3b8', flexShrink: 0,
                }}>#{i+1}</div>
              )}
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 12, flexShrink: 0,
              }}>{getInitials(entry.developer_name)}</div>
              {/* Name + Score bar */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/developers/${entry.developer_id}`}
                  style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry.developer_name}
                </Link>
                {s !== null && (
                  <div style={{ height: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 99, marginTop: 4 }}>
                    <div style={{ height: '100%', width: `${s}%`, background: scoreColor, borderRadius: 99 }} />
                  </div>
                )}
              </div>
              {/* Score */}
              <div style={{ fontSize: 14, fontWeight: 800, color: scoreColor, flexShrink: 0 }}>{s ?? '—'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DevelopersHubPage() {
  const { isTeamLead } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [developers,  setDevelopers]  = useState([]);
  const [sites,       setSites]       = useState([]);
  const [summary,     setSummary]     = useState({ total: 0, validated: 0, pending: 0, bots: 0 });
  const [latestKpis,  setLatestKpis]  = useState({});
  const [alertCounts, setAlertCounts] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);

  const [periods, setPeriods] = useState([]);

  // [SENIOR] Standardized Filter Names & Robust URL Hydration
  const [projectFilter, setProjectFilter] = useState(searchParams.get("project_id") || searchParams.get("project") || localStorage.getItem("last_project_id") || "");
  const [siteFilter,    setSiteFilter]    = useState(searchParams.get("site_id")    || searchParams.get("site")    || "all");
  const [groupFilter,   setGroupFilter]   = useState(searchParams.get("group_id")   || "all");
  const [selectedPeriodId, setSelectedPeriodId] = useState(searchParams.get("period_id") ? Number(searchParams.get("period_id")) : null);
  const [search,        setSearch]        = useState(searchParams.get("q") || "");
  const [validatedOnly, setValidatedOnly] = useState(searchParams.get("validated") === "true");
  const [showInactive,   setShowInactive]   = useState(searchParams.get("inactive") === "true");
  const [sortBy,        setSortBy]        = useState(searchParams.get("sort") || "score");
  const [groups,        setGroups]        = useState([]);
  const [page,          setPage]          = useState(Number(searchParams.get("page")) || 1);
  const perPage = 9;

  const [projects,    setProjects]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [selectedDevId,    setSelectedDevId]    = useState(null);
  const [showImportModal,  setShowImportModal]  = useState(false);

  // [SENIOR] Unified Data Loader
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [projData, sitesData, periodsData, groupsData] = await Promise.all([
        projectService.getAll(),
        siteService.getAll(),
        periodService.getAll(),
        developerService.getGroups()
      ]);

      const projList = Array.isArray(projData) ? projData : [];
      setProjects(projList);
      setSites(Array.isArray(sitesData) ? sitesData : []);
      const periodList = Array.isArray(periodsData) ? periodsData : [];
      setPeriods(periodList);
      if (!selectedPeriodId && periodList.length > 0) {
        setSelectedPeriodId(periodList[0].id);
      }
      
      setGroups(Array.isArray(groupsData) ? groupsData : []);

      // Logic: Prioritize URL > LocalStorage > First Project available
      let activeProjId = projectFilter;
      if (!activeProjId && projList.length > 0) {
        activeProjId = String(projList[0].id);
        setProjectFilter(activeProjId);
      }

      if (activeProjId) {
        const [devsData, summData] = await Promise.all([
          developerService.getByTab("all", activeProjId, false, selectedPeriodId),
          developerService.getSummary(activeProjId, null, false, selectedPeriodId)
        ]);
        setDevelopers(Array.isArray(devsData) ? devsData : []);
        setSummary(summData || { total: 0, validated: 0, pending: 0, bots: 0 });
      }
    } catch (err) {
      console.error("Critical Data Load Error:", err);
    } finally {
      setLoading(false);
    }
  }, [projectFilter, selectedPeriodId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Lots effect removed as requested by USER

  
  useEffect(() => {
    // [SENIOR] Now loading KPIs even in "all" mode to track developers globally
    if (!projectFilter) return; 
    setLoadingLeaderboard(true);

    developerService.getLeaderboard(projectFilter, { 
      limit: 50, 
      periodId: selectedPeriodId,
      siteId: siteFilter !== "all" ? siteFilter : null
    })
      .then(async lb => {
        setLeaderboard(lb?.entries || []);
        const kpiMap = {};
        
        // [SENIOR] Trend Calculation
        let prevKpiMap = {};
        if (selectedPeriodId && periods.length > 0) {
          const currentIndex = periods.findIndex(p => p.id === selectedPeriodId);
          if (currentIndex < periods.length - 1) {
            const prevPeriod = periods[currentIndex + 1]; // periods are likely reversed (newest first)
            try {
              const prevLb = await developerService.getLeaderboard(projectFilter, { 
                limit: 50, periodId: prevPeriod.id, siteId: siteFilter !== "all" ? siteFilter : null 
              });
              (prevLb?.entries || []).forEach(e => { prevKpiMap[e.developer_id] = e.developer_score; });
            } catch(e) {}
          }
        }

        (lb?.entries || []).forEach(entry => {
          const currentScore = entry.developer_score;
          const prevScore = prevKpiMap[entry.developer_id];
          let trend = 0;
          if (prevScore != null && currentScore != null) {
             trend = currentScore - prevScore;
          }

          kpiMap[entry.developer_id] = {
            developer_score:     currentScore,
            total_commits:       entry.commit_count,
            total_mrs_created:   entry.mr_count,
            approved_mr_rate:    entry.approved_rate,
            avg_review_time_hours: entry.avg_review_hours,
            trend:               trend !== 0 ? trend : null
          };
        });
        setLatestKpis(kpiMap);
      })
      .catch(() => { setLeaderboard([]); setLatestKpis({}); })
      .finally(() => setLoadingLeaderboard(false));

    developerService.getByTab("validated").then(devs => {
      const allDevs = Array.isArray(devs) ? devs : [];
      Promise.all(allDevs.slice(0, 30).map(d => 
        developerService.getDeveloperAlerts(d.id).then(alerts => ({ id: d.id, count: (alerts || []).length })).catch(() => ({ id: d.id, count: 0 }))
      )).then(results => {
        const map = {};
        results.forEach(r => { if (r.count > 0) map[r.id] = r.count; });
        setAlertCounts(map);
      });
    });
  }, [projectFilter, selectedPeriodId, siteFilter]);

  useEffect(() => { setPage(1); }, [search, siteFilter, sortBy, projectFilter]);

  // [SENIOR] Sync all filters to URL & LocalStorage
  useEffect(() => {
    const params = {};
    if (search) params.q = search;
    if (siteFilter !== "all")    params.site_id = siteFilter;
    if (groupFilter !== "all")   params.group_id = groupFilter;
    if (selectedPeriodId)        params.period_id = selectedPeriodId;
    if (validatedOnly)           params.validated = "true";
    if (showInactive)            params.inactive  = "true";
    if (sortBy !== "score")      params.sort = sortBy;
    if (page > 1)                params.page = page;

    if (projectFilter) {
      params.project_id = projectFilter;
      localStorage.setItem("last_project_id", projectFilter);
    }
    
    const currentParams = Object.fromEntries(searchParams.entries());
    if (JSON.stringify(currentParams) !== JSON.stringify(params)) {
      setSearchParams(params, { replace: true });
    }
  }, [search, siteFilter, groupFilter, selectedPeriodId, validatedOnly, sortBy, page, projectFilter]);

  const filtered = useMemo(() => {
    let result = developers.filter(dev => {
      if (dev.is_bot) return false;
      if (validatedOnly && !dev.is_validated) return false;
      // [SENIOR] Si une période est sélectionnée, on montre tout le monde (Cohorte), sinon on filtre les inactifs
      if (!selectedPeriodId && !showInactive && !dev.is_active) return false;
      const q = search.toLowerCase();
      if (q && !(dev.name || "").toLowerCase().includes(q) && !(dev.gitlab_username || "").toLowerCase().includes(q)) return false;
      if (siteFilter  !== "all" && String(dev.primary_site_id) !== String(siteFilter)) return false;
      if (groupFilter !== "all" && String(dev.group_id)        !== String(groupFilter)) return false;
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "score") {
        const sa = latestKpis[a.id]?.developer_score ?? -1;
        const sb = latestKpis[b.id]?.developer_score ?? -1;
        return sb - sa;
      }
      if (sortBy === "commits") {
        const ca = latestKpis[a.id]?.total_commits ?? -1;
        const cb = latestKpis[b.id]?.total_commits ?? -1;
        return cb - ca;
      }
      if (sortBy === "mrs") {
        const ma = latestKpis[a.id]?.total_mrs_created ?? -1;
        const mb = latestKpis[b.id]?.total_mrs_created ?? -1;
        return mb - ma;
      }
      if (sortBy === "recent") return (b.id || 0) - (a.id || 0);
      return (b.id || 0) - (a.id || 0);
    });
    return result;
  }, [developers, search, siteFilter, groupFilter, validatedOnly, sortBy, latestKpis]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  if (loading) return <div className="page-content py-5 text-center"><LoadingSpinner text="Chargement du hub talent..." /></div>;

  return (
    <div className="page-content">
      <div className="container-fluid">
        {/* Standard Page Title Box */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0 fw-bold"><i className="ri-team-line me-2 text-primary"></i>Développeurs GitLab</h4>
              <div className="page-title-right">
                <ol className="breadcrumb m-0 fs-12">
                  <li className="breadcrumb-item"><Link to="/">Dashboard</Link></li>
                  <li className="breadcrumb-item active">Développeurs</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Top Stats Cards */}
        <div className="row mb-4">
          <StatsCard label="Effectif Total"   value={summary.total}     sub="Développeurs identifiés" color="primary" icon="ri-group-line" />
          <StatsCard label="Profils Validés" value={summary.validated} sub={`${summary.pending} en attente`} color="success" icon="ri-shield-user-line" />
          <StatsCard label="Sites Actifs"    value={sites.length}      sub="Présence géographique"    color="info"    icon="ri-earth-line" />
          <StatsCard label="Taux Validation" value={summary.total ? `${Math.round((summary.validated/summary.total)*100)}%` : "0%"} sub="Couverture analytique" color="warning" icon="ri-pie-chart-line" />
        </div>

        {/* Global Toolbar Card */}
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-3">
            <div className="row g-2 align-items-center">
              <div className="col-md-3">
                <div className="search-box">
                  <input type="text" className="form-control" placeholder="Rechercher (nom, @)..." value={search} onChange={e => setSearch(e.target.value)} />
                  <i className="ri-search-line search-icon text-muted"></i>
                </div>
              </div>
              <div className="col-md-auto ms-auto d-flex gap-2">
                <select className="form-select form-select-sm" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ width: 160 }}>
                  <option value="all">Tous les projets</option>
                  {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>

                {/* Période Selector */}
                <select className="form-select form-select-sm" 
                  value={selectedPeriodId || ""} 
                  onChange={e => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)} 
                  style={{ width: 140 }}>
                  <option value="">Toutes périodes</option>
                  {periods.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.month}/{p.year}
                    </option>
                  ))}
                </select>



                <select className="form-select form-select-sm" value={siteFilter} onChange={e => setSiteFilter(e.target.value)} style={{ width: 140 }}>
                  <option value="all">Tous les sites</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                <select className="form-select form-select-sm" value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={{ width: 140 }}>
                  <option value="all">Toutes les équipes</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>

                <select className="form-select form-select-sm" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 160 }}>
                  <option value="score">KPI Score ↓</option>
                  <option value="commits">Commits ↓</option>
                  <option value="mrs">Merge Requests ↓</option>
                  <option value="name">Nom A→Z</option>
                  <option value="recent">Inscriptions récentes</option>
                </select>

                <div className="form-check form-switch ms-2 d-flex align-items-center gap-2">
                  <input className="form-check-input" type="checkbox" id="inactiveSwitch" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                  <label className="form-check-label fs-11 fw-bold text-muted mb-0" htmlFor="inactiveSwitch">VOIR INACTIFS</label>
                </div>

                <button className="btn btn-soft-danger btn-sm ms-auto" onClick={() => { setSearch(""); setSiteFilter("all"); setGroupFilter("all"); setProjectFilter(""); setSelectedPeriodId(null); setValidatedOnly(false); setShowInactive(false); }} title="Réinitialiser">
                  <i className="ri-refresh-line"></i>
                </button>
                
                {isTeamLead && isTeamLead() && (
                  <>
                    <Link to="/developers/compare" className="btn btn-soft-info btn-sm d-flex align-items-center gap-1" style={{ fontWeight: 600 }}>
                      <i className="ri-scales-3-line"></i> Comparer
                    </Link>
                    <button className="btn btn-primary btn-sm ms-1 d-flex align-items-center gap-1 shadow-sm" onClick={() => setShowImportModal(true)} style={{ fontWeight: 600 }}>
                      <i className="ri-upload-cloud-2-line"></i> Importer
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Phase 4: Alert Summary Banner */}
        {Object.keys(alertCounts).length > 0 && (
          <div className="d-flex align-items-center gap-3 rounded-3 p-3 mb-4" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
            <i className="ri-error-warning-line fs-4 text-warning flex-shrink-0"></i>
            <div className="flex-grow-1 fs-13">
              <strong>{Object.keys(alertCounts).length} développeur(s)</strong> avec des alertes actives — 
              <span className="text-muted"> {Object.values(alertCounts).reduce((a, b) => a + b, 0)} alerte(s) au total</span>
            </div>
            <button className="btn btn-sm btn-warning flex-shrink-0" onClick={() => setSortBy('score')}>
              <i className="ri-sort-desc me-1"></i>Trier par score
            </button>
          </div>
        )}

        <div className="row">
          <div className={leaderboard.length ? "col-xl-8" : "col-12"}>
            {filtered.length === 0 ? (
              <EmptyState icon="ri-user-search-line" title="Aucun résultat" description="Essayez de modifier vos critères de recherche." />
            ) : (
              <>
                <div className="row g-4 mb-4">
                  {loading ? (
                    Array(6).fill(0).map((_, i) => <DeveloperCard key={i} loading={true} />)
                  ) : (
                    paginated.map((dev, idx) => (
                      <DeveloperCard 
                        key={dev.id} 
                        dev={dev} 
                        sites={sites} 
                        latestKpis={latestKpis}
                        alertCount={alertCounts[dev.id] || 0}
                        index={idx} 
                        onShowReport={setSelectedDevId}
                        loading={false}
                        projectFilter={projectFilter}
                        selectedPeriodId={selectedPeriodId}
                        periods={periods}
                        onStatusChanged={(devId, ns) => {
                          setDevelopers(prev => prev.map(d => d.id === devId ? { ...d, is_active: ns === 'ACTIVE' } : d));
                        }}
                      />
                    ))
                  )}
                </div>
                {totalPages > 1 && (
                  <div className="d-flex justify-content-center py-4 border-top border-light">
                    <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />
                  </div>
                )}
              </>
            )}
          </div>

          {leaderboard.length > 0 && (
            <div className="col-xl-4">
              <Leaderboard entries={leaderboard} loading={loadingLeaderboard} />
              <div className="card mt-4 border-0 shadow-sm bg-primary bg-gradient text-white overflow-hidden" style={{ borderRadius: 12 }}>
                 <div className="card-body p-4">
                    <div className="d-flex align-items-center mb-3">
                       <i className="ri-lightbulb-line fs-1 display-5 text-white text-opacity-25 me-3"></i>
                       <h5 className="text-white mb-0">Note Analyste</h5>
                    </div>
                    <p className="text-white text-opacity-75 fs-13 mb-0">
                       Le score KPI est une moyenne pondérée calculée sur les commits, les MRs fusionnées et le temps de revue. 
                       Les profil "Validés" sont prioritaires pour l'extraction de fin de mois.
                    </p>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Overlay Rapport de Performance (Phase 3) */}
      {selectedDevId && (
        <DeveloperPerformanceReport 
          developerId={selectedDevId} 
          projectId={projectFilter} 
          onClose={() => setSelectedDevId(null)} 
        />
      )}

      {showImportModal && (
        <DeveloperImportModal 
          onClose={() => setShowImportModal(false)}
          onSuccess={() => loadData()}
        />
      )}

      <style>{`
        .search-box { position: relative; }
        .search-box .search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 14px; }
        .search-box .form-control { padding-left: 36px; padding-right: 12px; }
        .font-secondary { font-family: 'Poppins', sans-serif; }
      `}</style>
    </div>
  );
}
