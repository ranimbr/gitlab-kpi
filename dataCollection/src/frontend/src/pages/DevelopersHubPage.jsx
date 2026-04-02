/**
 * pages/DevelopersHubPage.jsx — Developer-Centric Hub
 * 
 * SENIOR REFACTOR (Industrial Harmony Edition)
 * Aligning perfectly with the Bootstrap/Velzon template used in ProjectsPage and DashboardKPI.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import developerService from "../services/developerService";
import siteService      from "../services/siteService";
import projectService   from "../services/projectService";
import LoadingSpinner   from "../components/common/LoadingSpinner";
import EmptyState       from "../components/common/EmptyState";
import Pagination       from "../components/common/Pagination";

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

// ─── Component: Developer Card (Grid Pattern) ─────────────────────────────────
function DeveloperCard({ dev, sites, latestKpis, index }) {
  const c = COLORS[index % COLORS.length];
  const siteName = sites.find(s => s.id === dev.primary_site_id)?.name;
  const devKpis = latestKpis?.[dev.id];
  const score = devKpis?.developer_score != null ? Math.round(devKpis.developer_score * 100) : null;

  return (
    <div className="col-xl-4 col-sm-6">
      <div className="card card-animate border-0 shadow-sm h-100">
        <div className="card-body">
          <div className="d-flex align-items-start mb-3">
            <div className="avatar-md flex-shrink-0">
              <span className={`avatar-title bg-${c}-subtle text-${c} rounded-circle fs-3 fw-bold shadow-sm`}>
                {getInitials(dev.name || dev.gitlab_username)}
              </span>
            </div>
            <div className="flex-grow-1 ms-3 min-w-0">
              <div className="d-flex align-items-center gap-2">
                <h5 className="mb-0 text-truncate fs-15 fw-bold">
                  <Link to={`/developers/${dev.id}`} className="text-dark">{dev.name || dev.gitlab_username}</Link>
                </h5>
                {score !== null && (
                  <span className={`badge ${score >= 70 ? 'bg-success-subtle text-success' : score >= 40 ? 'bg-warning-subtle text-warning' : 'bg-danger-subtle text-danger'} fs-10`}>
                    {score}%
                  </span>
                )}
              </div>
              <p className="text-muted mb-0 fs-12">@{dev.gitlab_username || "anonymous"}</p>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-1 mb-3">
            {dev.is_validated ? (
              <span className="badge bg-success-subtle text-success fs-10"><i className="ri-checkbox-circle-line me-1"></i>VALIDÉ</span>
            ) : (
              <span className="badge bg-light text-muted border fs-10">EN ATTENTE</span>
            )}
            {siteName && <span className="badge bg-primary-subtle text-primary fs-10"><i className="ri-map-pin-line me-1"></i>{siteName}</span>}
          </div>

          <div className="row g-0 pt-3 border-top border-light text-center">
            <div className="col-4 border-end border-light">
              <h6 className="mb-1 fs-13 fw-bold text-primary">{devKpis?.total_commits ?? 0}</h6>
              <p className="text-muted mb-0 fs-11 text-uppercase">Commits</p>
            </div>
            <div className="col-4 border-end border-light">
              <h6 className="mb-1 fs-13 fw-bold text-info">{devKpis?.total_mrs_created ?? 0}</h6>
              <p className="text-muted mb-0 fs-11 text-uppercase">MRs</p>
            </div>
            <div className="col-4">
              <h6 className="mb-1 fs-13 fw-bold text-success">{devKpis?.approved_mr_rate ? `${(devKpis.approved_mr_rate * 100).toFixed(0)}%` : "—"}</h6>
              <p className="text-muted mb-0 fs-11 text-uppercase">Approb.</p>
            </div>
          </div>
        </div>
        <div className="card-footer bg-light bg-opacity-50 border-0 p-0 overflow-hidden text-center">
          <Link to={`/developers/${dev.id}`} className="btn btn-link text-decoration-none text-muted py-2 w-100 fs-12 fw-medium">
            Analyse détaillée <i className="ri-arrow-right-line ms-1"></i>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Component: Leaderboard (Table Pattern) ───────────────────────────────────
function Leaderboard({ entries = [], loading }) {
  if (loading) return <div className="card border-0 py-5 text-center"><div className="spinner-border text-primary spinner-border-sm"></div></div>;
  if (!entries?.length) return null;

  return (
    <div className="card border-0 shadow-sm overflow-hidden h-100">
      <div className="card-header align-items-center d-flex border-bottom">
        <h4 className="card-title mb-0 flex-grow-1"><i className="ri-trophy-line me-2 text-warning"></i>Top Performers</h4>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle table-nowrap mb-0">
            <thead className="table-light">
              <tr className="fs-11 text-muted text-uppercase">
                <th className="ps-3" style={{width: 50}}>Rang</th>
                <th>Développeur</th>
                <th className="text-end pe-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 10).map((entry, i) => {
                const s = entry.developer_score != null ? Math.round(entry.developer_score * 100) : null;
                return (
                  <tr key={entry.developer_id || i}>
                    <td className="ps-3"><span className="fw-bold">{i < 3 ? ["🥇", "🥈", "🥉"][i] : `#${i + 1}`}</span></td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div className="avatar-xs flex-shrink-0">
                          <span className="avatar-title bg-light text-primary rounded-circle fs-10 fw-bold">{getInitials(entry.developer_name)}</span>
                        </div>
                        <Link to={`/developers/${entry.developer_id}`} className="text-dark fw-medium fs-13">{entry.developer_name}</Link>
                      </div>
                    </td>
                    <td className="text-end pe-3 font-secondary fw-bold text-primary">{s ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DevelopersHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [developers,  setDevelopers]  = useState([]);
  const [sites,       setSites]       = useState([]);
  const [summary,     setSummary]     = useState({ total: 0, validated: 0, pending: 0, bots: 0 });
  const [leaderboard, setLeaderboard] = useState([]);
  const [latestKpis,  setLatestKpis]  = useState({});

  const [search,       setSearch]       = useState(searchParams.get("q") || "");
  const [siteFilter,   setSiteFilter]   = useState(searchParams.get("site") || "all");
  const [sortBy,       setSortBy]       = useState("score");
  const [page,         setPage]         = useState(1);
  const perPage = 9;

  const [projects,    setProjects]    = useState([]);
  const [projectFilter, setProjectFilter] = useState(searchParams.get("project") || "");

  const [loading,         setLoading]         = useState(true);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [devsData, summaryData, sitesData, projsData] = await Promise.all([
        developerService.getByTab("all"),
        developerService.getSummary(),
        siteService.getAll(),
        projectService.getAll(),
      ]);

      setDevelopers(Array.isArray(devsData) ? devsData : []);
      setSummary(summaryData || { total: 0, validated: 0, pending: 0, bots: 0 });
      setSites(Array.isArray(sitesData) ? sitesData : []);
      setProjects(Array.isArray(projsData) ? projsData : []);
      
      if (!projectFilter && projsData?.length > 0) {
        setProjectFilter(String(projsData[0].id));
      }
    } catch { /* err */ } 
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  
  useEffect(() => {
    if (!projectFilter) return;
    setLoadingLeaderboard(true);
    developerService.getLeaderboard(projectFilter, { limit: 50 })
      .then(lb => {
        setLeaderboard(lb?.entries || []);
        const kpiMap = {};
        (lb?.entries || []).forEach(entry => {
          kpiMap[entry.developer_id] = {
            developer_score:     entry.developer_score,
            total_commits:       entry.commit_count,
            total_mrs_created:   entry.mr_count,
            approved_mr_rate:    entry.approved_rate,
            avg_review_time_hours: entry.avg_review_hours,
          };
        });
        setLatestKpis(kpiMap);
      })
      .catch(() => { setLeaderboard([]); setLatestKpis({}); })
      .finally(() => setLoadingLeaderboard(false));
  }, [projectFilter]);

  useEffect(() => { setPage(1); }, [search, siteFilter, sortBy, projectFilter]);

  useEffect(() => {
    const p = {};
    if (search) p.q = search;
    if (siteFilter !== "all") p.site = siteFilter;
    if (projectFilter) p.project = projectFilter;
    setSearchParams(p, { replace: true });
  }, [search, siteFilter, projectFilter, setSearchParams]);

  const filtered = useMemo(() => {
    let result = developers.filter(dev => {
      if (dev.is_bot) return false;
      const q = search.toLowerCase();
      if (q && !(dev.name || "").toLowerCase().includes(q) && !(dev.gitlab_username || "").toLowerCase().includes(q)) return false;
      if (siteFilter !== "all" && String(dev.primary_site_id) !== siteFilter) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "score") {
        const sa = latestKpis[a.id]?.developer_score ?? -1;
        const sb = latestKpis[b.id]?.developer_score ?? -1;
        return sb - sa;
      }
      return (b.id || 0) - (a.id || 0);
    });
    return result;
  }, [developers, search, siteFilter, sortBy, latestKpis]);

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
                <select className="form-select form-select-sm" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ width: 140 }}>
                  <option value="" disabled>Choix du projet</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className="form-select form-select-sm" value={siteFilter} onChange={e => setSiteFilter(e.target.value)} style={{ width: 140 }}>
                  <option value="all">Tous les sites</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="form-select form-select-sm" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 160 }}>
                  <option value="score">KPI Score ↓</option>
                  <option value="name">Nom A→Z</option>
                  <option value="recent">Recents</option>
                </select>
                <button className="btn btn-soft-danger btn-sm" onClick={() => { setSearch(""); setSiteFilter("all"); }} title="Réinitialiser">
                  <i className="ri-refresh-line"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className={leaderboard.length ? "col-xl-8" : "col-12"}>
            {filtered.length === 0 ? (
              <EmptyState icon="ri-user-search-line" title="Aucun résultat" description="Essayez de modifier vos critères de recherche." />
            ) : (
              <>
                <div className="row g-4 mb-4">
                  {paginated.map((dev, idx) => <DeveloperCard key={dev.id} dev={dev} sites={sites} latestKpis={latestKpis} index={idx} />)}
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
      <style>{`
        .search-box { position: relative; }
        .search-box .search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 14px; }
        .search-box .form-control { padding-left: 36px; padding-right: 12px; }
        .font-secondary { font-family: 'Poppins', sans-serif; }
      `}</style>
    </div>
  );
}
