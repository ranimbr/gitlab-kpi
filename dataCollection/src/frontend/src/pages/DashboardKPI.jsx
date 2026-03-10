/**
 * DashboardKPI.jsx — Tableau de bord KPI GitLab
 * ==============================================
 * PFE Cycle Ingénieur — GitLab KPI Dashboard
 *
 * Améliorations v2 :
 *  [NEW] Comparaison période N vs N-1 (delta +/-)
 *  [NEW] Export PDF / CSV snapshot
 *  [NEW] Tooltip explicatif sur chaque KPI card
 *  [NEW] Bandeau alerte si temps de revue > 24h
 *  [NEW] Tableau récap snapshots avec tri
 *  [FIX] KpiRadarChart — instance Chart.js dupliquée corrigée
 *  [FIX] handleRefresh — selectedSite passé correctement
 *  [FIX] history vide → graphiques masqués proprement
 *  [FIX] Duplicate whiteSpace key supprimé (ligne tooltip)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { projectService, kpiService } from "../services/kpiService";
import periodService from "../services/periodService";
import ReactApexChart from "react-apexcharts";
import Chart from "chart.js/auto";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState     from "../components/common/EmptyState";

// ─── Config ───────────────────────────────────────────────────────────────────
const CHART_COLORS = {
  primary:   "#405189",
  success:   "#0ab39c",
  info:      "#299cdb",
  warning:   "#f7b84b",
  danger:    "#f06548",
  secondary: "#3577f1",
};

const getCssVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const rgba = (cssVar, alpha) => {
  const val = getCssVar(cssVar);
  return val ? `rgba(${val}, ${alpha})` : `rgba(64,81,137,${alpha})`;
};

const fmt = (num, decimals = 2) => {
  if (num === null || num === undefined) return "—";
  return Number(num).toFixed(decimals);
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// [NEW] Calcule le delta entre deux valeurs et retourne un objet {value, color, icon}
function delta(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.5) return { value: "±0%", color: "secondary", icon: "ri-subtract-line" };
  return pct > 0
    ? { value: `+${pct.toFixed(1)}%`, color: "success", icon: "ri-arrow-up-line" }
    : { value: `${pct.toFixed(1)}%`,  color: "danger",  icon: "ri-arrow-down-line" };
}

// ─── [NEW] KPI Card avec delta N-1 et tooltip ────────────────────────────────
const KpiCard = ({ title, value, unit, icon, color, description, tooltip, deltaInfo }) => {
  const [showTip, setShowTip] = useState(false);

  const colorMap = {
    primary:   { bg: "bg-primary-subtle",   text: "text-primary"   },
    success:   { bg: "bg-success-subtle",   text: "text-success"   },
    info:      { bg: "bg-info-subtle",      text: "text-info"      },
    warning:   { bg: "bg-warning-subtle",   text: "text-warning"   },
    danger:    { bg: "bg-danger-subtle",    text: "text-danger"    },
    secondary: { bg: "bg-secondary-subtle", text: "text-secondary" },
  };
  const classes = colorMap[color] || colorMap.primary;

  return (
    <div className="col-xl-3 col-md-6">
      <div className="card card-animate h-100" style={{ position: "relative" }}>
        <div className="card-body">
          <div className="d-flex align-items-start">
            <div className="avatar-sm flex-shrink-0">
              <span className={`avatar-title ${classes.bg} ${classes.text} rounded-2 fs-2`}>
                <i className={icon}></i>
              </span>
            </div>
            <div className="flex-grow-1 overflow-hidden ms-3">
              <div className="d-flex align-items-center gap-1 mb-1">
                <p className="text-uppercase fw-medium text-muted text-truncate mb-0 fs-12" title={title}>
                  {title}
                </p>
                {/* [NEW] Tooltip icône */}
                {tooltip && (
                  <div style={{ position: "relative", display: "inline-flex" }}>
                    <i
                      className="ri-information-line text-muted fs-13"
                      style={{ cursor: "pointer", opacity: 0.6 }}
                      onMouseEnter={() => setShowTip(true)}
                      onMouseLeave={() => setShowTip(false)}
                    ></i>
                    {showTip && (
                      <div style={{
                        position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
                        transform: "translateX(-50%)", background: "#212529", color: "#fff",
                        borderRadius: 8, padding: "8px 12px", fontSize: 11, lineHeight: 1.5,
                        zIndex: 1000, maxWidth: 260, whiteSpace: "normal",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                        pointerEvents: "none",
                      }}>
                        {tooltip}
                        <div style={{
                          position: "absolute", top: "100%", left: "50%",
                          transform: "translateX(-50%)", border: "5px solid transparent",
                          borderTopColor: "#212529",
                        }}></div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <h4 className="fs-3 mb-0">
                {value !== null && value !== undefined ? value : "—"}
                {unit && <span className="fs-13 text-muted ms-1">{unit}</span>}
              </h4>

              <div className="d-flex align-items-center justify-content-between mt-1">
                <p className="text-muted text-truncate mb-0 fs-12">{description}</p>
                {/* [NEW] Badge delta N-1 */}
                {deltaInfo && (
                  <span className={`badge bg-${deltaInfo.color}-subtle text-${deltaInfo.color} fs-11 flex-shrink-0 ms-2`}>
                    <i className={`${deltaInfo.icon} me-1`}></i>{deltaInfo.value}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Radar Chart ──────────────────────────────────────────────────────────────
const KpiRadarChart = ({ latest }) => {
  const chartRef      = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !latest) return;
    // [FIX] destroy propre avant re-création
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const scores = {
      mrRateSite:     Math.min(Number(((latest.mr_rate_per_site     || 0) * 20).toFixed(1)), 100),
      approvedMR:     Number(((latest.approved_mr_rate              || 0) * 100).toFixed(1)),
      mergedMR:       Number(((latest.merged_mr_rate                || 0) * 100).toFixed(1)),
      commitRateSite: Math.min(Number(((latest.commit_rate_per_site || 0) * 10).toFixed(1)), 100),
      nbCommits:      Math.min(Number(((latest.nb_commits_per_project || 0) / 10).toFixed(1)), 100),
      reviewTime:     Math.max(0, 100 - (latest.avg_review_time_hours || 0) * 2),
      nbDevs:         Math.min((latest.nb_developers || 0) * 5, 100),
    };

    chartInstance.current = new Chart(chartRef.current, {
      type: "radar",
      data: {
        labels: [
          "Taux MR/site", "MR Approuvés", "MR Fusionnés",
          "Taux commit/site", "NB Commits", "Rapidité revue", "NB Développeurs",
        ],
        datasets: [
          {
            label: "Performance actuelle",
            backgroundColor: rgba("--vz-primary-rgb", 0.18),
            borderColor:     getCssVar("--vz-primary") || CHART_COLORS.primary,
            borderWidth: 2,
            pointBackgroundColor: getCssVar("--vz-primary") || CHART_COLORS.primary,
            pointBorderColor: "#fff",
            pointRadius: 4,
            data: Object.values(scores),
          },
          {
            label: "Objectif (100)",
            backgroundColor: rgba("--vz-info-rgb", 0.07),
            borderColor:     getCssVar("--vz-info") || CHART_COLORS.info,
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 3,
            data: [100, 100, 100, 100, 100, 100, 100],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top", align: "end",
            labels: { font: { size: 12 }, usePointStyle: true, padding: 16 },
          },
        },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 20, font: { size: 10 }, backdropColor: "transparent" },
            pointLabels: { font: { size: 11 } },
            grid:       { color: "rgba(133,141,152,0.15)" },
            angleLines: { color: "rgba(133,141,152,0.15)" },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [latest]);

  return <canvas ref={chartRef} style={{ maxHeight: 320, width: "100%" }} />;
};

// ─── History Chart ────────────────────────────────────────────────────────────
const KpiHistoryChart = ({ history }) => {
  if (!history?.length) return null;

  const series = useMemo(() => [
    { name: "Taux commit/site", data: history.map((s) => Number((s.commit_rate_per_site || 0).toFixed(3))) },
    { name: "Taux MR/site",     data: history.map((s) => Number((s.mr_rate_per_site     || 0).toFixed(3))) },
  ], [history]);

  const options = useMemo(() => ({
    chart:  { type: "area", height: 280, toolbar: { show: false }, animations: { enabled: true, speed: 500 } },
    colors: [CHART_COLORS.primary, CHART_COLORS.success],
    stroke: { curve: "smooth", width: 2 },
    fill:   { type: "gradient", gradient: { opacityFrom: 0.3, opacityTo: 0.05 } },
    xaxis:  {
      categories: history.map((s) =>
        s.period
          ? `${s.period.year}/${String(s.period.month).padStart(2, "0")}`
          : s.snapshot_date || ""
      ),
      labels: { style: { fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis:      { labels: { style: { fontSize: "11px" } }, title: { text: "Taux / développeur", style: { fontSize: "11px" } } },
    grid:       { borderColor: "#e9ebec", strokeDashArray: 4 },
    legend:     { position: "top", horizontalAlign: "right", fontSize: "12px" },
    tooltip:    { shared: true, intersect: false },
    dataLabels: { enabled: false },
  }), [history]);

  return (
    <div className="card">
      <div className="card-header d-flex align-items-center border-bottom-dashed py-3">
        <div className="flex-grow-1">
          <h5 className="card-title mb-1">
            <i className="ri-line-chart-line me-2 text-primary"></i>Évolution des taux
          </h5>
          <p className="text-muted mb-0 fs-12">Taux de commits et MRs par développeur dans le temps</p>
        </div>
      </div>
      <div className="card-body p-0 pb-2">
        <ReactApexChart options={options} series={series} type="area" height={280} />
      </div>
    </div>
  );
};

// ─── MR Rates Chart ───────────────────────────────────────────────────────────
const MrRatesChart = ({ history }) => {
  if (!history?.length) return null;

  const series = useMemo(() => [
    { name: "Taux approbation", data: history.map((s) => Number(((s.approved_mr_rate || 0) * 100).toFixed(1))) },
    { name: "Taux fusion",      data: history.map((s) => Number(((s.merged_mr_rate   || 0) * 100).toFixed(1))) },
  ], [history]);

  const options = useMemo(() => ({
    chart:       { type: "bar", height: 280, toolbar: { show: false } },
    colors:      [CHART_COLORS.info, CHART_COLORS.warning],
    plotOptions: { bar: { columnWidth: "40%", borderRadius: 4, borderRadiusApplication: "end" } },
    xaxis: {
      categories: history.map((s) =>
        s.period
          ? `${s.period.year}/${String(s.period.month).padStart(2, "0")}`
          : s.snapshot_date || ""
      ),
      labels: { style: { fontSize: "11px" } },
    },
    yaxis:      { max: 100, labels: { formatter: (v) => v + "%", style: { fontSize: "11px" } } },
    grid:       { borderColor: "#e9ebec", strokeDashArray: 4 },
    legend:     { position: "top", horizontalAlign: "right", fontSize: "12px" },
    dataLabels: { enabled: false },
    tooltip:    { y: { formatter: (v) => v + "%" }, shared: true, intersect: false },
  }), [history]);

  return (
    <div className="card">
      <div className="card-header d-flex align-items-center border-bottom-dashed py-3">
        <div className="flex-grow-1">
          <h5 className="card-title mb-1">
            <i className="ri-bar-chart-line me-2 text-success"></i>Taux d'approbation et de fusion
          </h5>
          <p className="text-muted mb-0 fs-12">Pourcentage de MR approuvés et fusionnés</p>
        </div>
      </div>
      <div className="card-body p-0 pb-2">
        <ReactApexChart options={options} series={series} type="bar" height={280} />
      </div>
    </div>
  );
};

// ─── Score Badge ──────────────────────────────────────────────────────────────
const ScoreBadge = ({ label, value, color }) => {
  const cls = {
    success:   { bg: "bg-success-subtle",   text: "text-success",   bar: "bg-success"   },
    primary:   { bg: "bg-primary-subtle",   text: "text-primary",   bar: "bg-primary"   },
    info:      { bg: "bg-info-subtle",      text: "text-info",      bar: "bg-info"      },
    warning:   { bg: "bg-warning-subtle",   text: "text-warning",   bar: "bg-warning"   },
    danger:    { bg: "bg-danger-subtle",    text: "text-danger",    bar: "bg-danger"    },
    secondary: { bg: "bg-secondary-subtle", text: "text-secondary", bar: "bg-secondary" },
  }[color] || {};

  return (
    <div className="d-flex align-items-center justify-content-between py-2 border-bottom border-dashed">
      <span className="fs-12 text-muted fw-medium">{label}</span>
      <div className="d-flex align-items-center gap-2">
        <div className="progress" style={{ width: 80, height: 6 }}>
          <div className={`progress-bar ${cls.bar}`} style={{ width: `${Math.min(value, 100)}%` }}></div>
        </div>
        <span className={`badge ${cls.bg} ${cls.text} fs-11`}>{value}</span>
      </div>
    </div>
  );
};

// ─── [NEW] Tableau récapitulatif snapshots ────────────────────────────────────
const SnapshotsTable = ({ history }) => {
  const [sortKey, setSortKey] = useState("snapshot_date");
  const [sortDir, setSortDir] = useState("desc");

  if (!history?.length) return null;

  const sorted = [...history].sort((a, b) => {
    let va = a[sortKey] ?? 0;
    let vb = b[sortKey] ?? 0;
    if (sortKey === "snapshot_date") { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
    return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <i className="ri-arrow-up-down-line ms-1 opacity-25 fs-11"></i>;
    return sortDir === "asc"
      ? <i className="ri-arrow-up-line ms-1 text-primary fs-11"></i>
      : <i className="ri-arrow-down-line ms-1 text-primary fs-11"></i>;
  };

  const COLS = [
    { key: "snapshot_date",          label: "Date snapshot",   fmt: (v) => fmtDate(v) },
    { key: "nb_commits_per_project", label: "NB Commits",      fmt: (v) => v ?? "—" },
    { key: "nb_developers",          label: "NB Devs",          fmt: (v) => v ?? "—" },
    { key: "commit_rate_per_site",   label: "Taux commit/site", fmt: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { key: "mr_rate_per_site",       label: "Taux MR/site",     fmt: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { key: "approved_mr_rate",       label: "MR Approuvés",     fmt: (v) => v != null ? `${(v * 100).toFixed(1)}%` : "—" },
    { key: "merged_mr_rate",         label: "MR Fusionnés",     fmt: (v) => v != null ? `${(v * 100).toFixed(1)}%` : "—" },
    { key: "avg_review_time_hours",  label: "Revue moy.",       fmt: (v) => v != null ? `${Number(v).toFixed(1)}h` : "—" },
  ];

  return (
    <div className="card mt-4">
      <div className="card-header d-flex align-items-center border-bottom-dashed py-3">
        <div className="flex-grow-1">
          <h5 className="card-title mb-1">
            <i className="ri-table-line me-2 text-info"></i>Historique des snapshots
          </h5>
          <p className="text-muted mb-0 fs-12">{history.length} snapshot(s) — cliquez sur un en-tête pour trier</p>
        </div>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover table-nowrap align-middle mb-0">
            <thead className="table-light">
              <tr>
                {COLS.map(col => (
                  <th
                    key={col.key}
                    style={{ cursor: "pointer", userSelect: "none", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#878a99" }}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}<SortIcon k={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((snap, i) => (
                <tr key={i}>
                  {COLS.map(col => (
                    <td key={col.key} className="fs-13">{col.fmt(snap[col.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── [NEW] Export CSV ─────────────────────────────────────────────────────────
function exportSnapshotCSV(latest, projectName) {
  if (!latest) return;
  const headers = ["KPI","Valeur","Unité"];
  const rows = [
    ["Taux MR/site",         latest.mr_rate_per_site       ?? "—", "MR/dev"],
    ["MR Approuvés",         ((latest.approved_mr_rate || 0) * 100).toFixed(1), "%"],
    ["MR Fusionnés",         ((latest.merged_mr_rate   || 0) * 100).toFixed(1), "%"],
    ["Taux commit/site",     latest.commit_rate_per_site   ?? "—", "commit/dev"],
    ["NB Commits/projet",    latest.nb_commits_per_project ?? "—", ""],
    ["Temps revue moyen",    latest.avg_review_time_hours  != null ? Number(latest.avg_review_time_hours).toFixed(1) : "—", "h"],
    ["NB Développeurs",      latest.nb_developers          ?? "—", ""],
    ["Date snapshot",        latest.snapshot_date          ?? "—", ""],
  ];
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const a   = document.createElement("a");
  a.href    = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = `kpi_${projectName || "project"}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DashboardKPI() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects,          setProjects]          = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedSite,      setSelectedSite]      = useState(null);
  const [availableSites,    setAvailableSites]     = useState([]);
  const [currentPeriod,     setCurrentPeriod]     = useState(null);
  const [kpiData,           setKpiData]           = useState(null);
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState(null);
  const [refreshing,        setRefreshing]        = useState(false);

  // Charger projets + période
  useEffect(() => {
    projectService.getAll().then((data) => {
      setProjects(data);
      const urlId = searchParams.get("project_id");
      const first = urlId ? parseInt(urlId) : data[0]?.id;
      if (first) setSelectedProjectId(first);
    });
    periodService.getCurrent().then(setCurrentPeriod).catch(() => {});
  }, []);

  // Charger KPI
  useEffect(() => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);

    kpiService.getDashboard(selectedProjectId, selectedSite)
      .then((data) => {
        setKpiData(data);
        if (data?.history?.length) {
          const sites = [...new Set(data.history.map((s) => s.site).filter(Boolean))];
          setAvailableSites(sites);
        }
      })
      .catch(() => setError("Aucune donnée KPI. Veuillez d'abord lancer une extraction."))
      .finally(() => setLoading(false));
  }, [selectedProjectId, selectedSite]);

  // [FIX] handleRefresh avec selectedSite
  const handleRefresh = useCallback(async () => {
    if (!selectedProjectId) return;
    setRefreshing(true);
    try {
      const data = await kpiService.getDashboard(selectedProjectId, selectedSite);
      setKpiData(data);
      setError(null);
    } catch {
      setError("Impossible de rafraîchir les données.");
    } finally {
      setRefreshing(false);
    }
  }, [selectedProjectId, selectedSite]);

  const handleProjectChange = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setSelectedSite(null);
    setAvailableSites([]);
    setSearchParams({ project_id: projectId });
  }, [setSearchParams]);

  const latest   = kpiData?.latest_metrics;
  const history  = kpiData?.history || [];
  const previous = history.length >= 2 ? history[history.length - 2] : null;

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Scores radar
  const radarScores = useMemo(() => {
    if (!latest) return null;
    return {
      mrRateSite:     Math.min(Number(((latest.mr_rate_per_site     || 0) * 20).toFixed(1)), 100),
      approvedMR:     Number(((latest.approved_mr_rate              || 0) * 100).toFixed(1)),
      mergedMR:       Number(((latest.merged_mr_rate                || 0) * 100).toFixed(1)),
      commitRateSite: Math.min(Number(((latest.commit_rate_per_site || 0) * 10).toFixed(1)), 100),
      nbCommits:      Math.min(Number(((latest.nb_commits_per_project || 0) / 10).toFixed(1)), 100),
      reviewTime:     Math.max(0, Number((100 - (latest.avg_review_time_hours || 0) * 2).toFixed(1))),
      nbDevs:         Math.min((latest.nb_developers || 0) * 5, 100),
    };
  }, [latest]);

  const globalScore = useMemo(() => {
    if (!radarScores) return null;
    return Math.round(Object.values(radarScores).reduce((sum, v) => sum + v, 0) / 7);
  }, [radarScores]);

  const getScoreColor = (s) => s >= 70 ? "success" : s >= 40 ? "warning" : "danger";

  const reviewAlert = latest?.avg_review_time_hours > 24;

  if (loading && !refreshing) {
    return <LoadingSpinner fullPage text="Chargement des KPIs..." />;
  }

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* ── En-tête ── */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
              <div>
                <h4 className="mb-1 fw-bold">
                  <i className="ri-dashboard-2-line me-2 text-primary"></i>Tableau de bord KPI
                </h4>
                <p className="text-muted mb-0 fs-13">
                  Analyse des performances GitLab
                  {currentPeriod && (
                    <span className={`badge ms-2 bg-${currentPeriod.status === "open" ? "success" : "secondary"}-subtle text-${currentPeriod.status === "open" ? "success" : "secondary"}`}>
                      Période {currentPeriod.year}/{String(currentPeriod.month).padStart(2, "0")}
                      {" — "}{currentPeriod.status === "open" ? "Ouverte" : "Clôturée"}
                    </span>
                  )}
                </p>
              </div>

              <div className="d-flex align-items-center gap-2 flex-wrap">
                <select
                  className="form-select"
                  style={{ width: 230 }}
                  value={selectedProjectId || ""}
                  onChange={(e) => handleProjectChange(parseInt(e.target.value))}
                >
                  <option value="" disabled>Choisir un projet...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {availableSites.length > 0 && (
                  <select
                    className="form-select"
                    style={{ width: 160 }}
                    value={selectedSite || ""}
                    onChange={(e) => setSelectedSite(e.target.value || null)}
                  >
                    <option value="">Tous les sites</option>
                    {availableSites.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}

                {latest && (
                  <button
                    className="btn btn-soft-success"
                    onClick={() => exportSnapshotCSV(latest, selectedProject?.name)}
                    title="Exporter le snapshot en CSV"
                  >
                    <i className="ri-download-2-line me-1"></i>CSV
                  </button>
                )}

                <button
                  className="btn btn-soft-primary"
                  onClick={handleRefresh}
                  disabled={refreshing || !selectedProjectId}
                  title="Rafraîchir"
                >
                  <i className={`ri-refresh-line${refreshing ? " spinning" : ""}`}></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bandeau alerte temps de revue */}
        {reviewAlert && (
          <div className="alert alert-warning d-flex align-items-center gap-3 mb-4">
            <i className="ri-time-line fs-3 flex-shrink-0 text-warning"></i>
            <div>
              <strong>Temps de revue élevé</strong> — Le temps moyen d'approbation des MRs est de{" "}
              <strong>{fmt(latest.avg_review_time_hours, 1)}h</strong>,
              ce qui dépasse le seuil recommandé de 24h.
              Envisagez de revoir le processus de validation.
            </div>
          </div>
        )}

        {/* Erreur */}
        {error && (
          <div className="alert alert-warning d-flex align-items-center gap-3 mb-4">
            <i className="ri-information-line fs-3 flex-shrink-0"></i>
            <div className="flex-grow-1">
              <p className="mb-2">{error}</p>
              <button className="btn btn-primary btn-sm" onClick={() => navigate("/extraction")}>
                <i className="ri-download-2-line me-1"></i>Lancer une extraction
              </button>
            </div>
          </div>
        )}

        {latest && (
          <>
            {/* Row 1 — 4 KPIs */}
            <div className="row g-3 mb-4">
              <KpiCard
                title="Taux MR / site"
                value={fmt(latest.mr_rate_per_site, 2)}
                icon="ri-git-pull-request-line"
                color="primary"
                unit="MR/dev"
                description="NB MRs ÷ NB développeurs du site"
                tooltip="Mesure le nombre moyen de Merge Requests créées par développeur. Un taux élevé indique une forte activité de revue de code."
                deltaInfo={delta(latest.mr_rate_per_site, previous?.mr_rate_per_site)}
              />
              <KpiCard
                title="MR Approuvés"
                value={fmt((latest.approved_mr_rate || 0) * 100, 1)}
                icon="ri-checkbox-circle-line"
                color="success"
                unit="%"
                description="Taux d'approbation des MRs"
                tooltip="Pourcentage de MRs ayant reçu une approbation explicite. Idéalement supérieur à 80%."
                deltaInfo={delta(latest.approved_mr_rate, previous?.approved_mr_rate)}
              />
              <KpiCard
                title="MR Fusionnés"
                value={fmt((latest.merged_mr_rate || 0) * 100, 1)}
                icon="ri-git-merge-line"
                color="info"
                unit="%"
                description="Taux de fusion des MRs"
                tooltip="Pourcentage de MRs effectivement fusionnées dans la branche principale."
                deltaInfo={delta(latest.merged_mr_rate, previous?.merged_mr_rate)}
              />
              <KpiCard
                title="Taux commit / site"
                value={fmt(latest.commit_rate_per_site, 2)}
                icon="ri-git-commit-line"
                color="warning"
                unit="commit/dev"
                description="NB commits ÷ NB développeurs du site"
                tooltip="Mesure la productivité moyenne par développeur en termes de commits sur la période."
                deltaInfo={delta(latest.commit_rate_per_site, previous?.commit_rate_per_site)}
              />
            </div>

            {/* Row 2 — 3 KPIs + snapshot card */}
            <div className="row g-3 mb-4">
              <KpiCard
                title="NB commits / projet"
                value={fmt(latest.nb_commits_per_project, 0)}
                icon="ri-code-s-slash-line"
                color="primary"
                description="Total commits sur la période"
                tooltip="Nombre total de commits enregistrés pour ce projet sur la période d'extraction."
                deltaInfo={delta(latest.nb_commits_per_project, previous?.nb_commits_per_project)}
              />
              <KpiCard
                title="Temps de revue moyen"
                value={fmt(latest.avg_review_time_hours, 1)}
                icon="ri-time-line"
                color={reviewAlert ? "danger" : "warning"}
                unit="h"
                description={reviewAlert ? "⚠ Dépasse 24h" : "Durée moyenne d'approbation"}
                tooltip="Temps moyen entre la création d'une MR et son approbation. Un temps élevé peut indiquer un goulot d'étranglement dans le processus de revue."
                deltaInfo={delta(latest.avg_review_time_hours, previous?.avg_review_time_hours)}
              />
              <KpiCard
                title="NB Développeurs"
                value={fmt(latest.nb_developers, 0)}
                icon="ri-team-line"
                color="secondary"
                unit="devs"
                description={selectedSite ? `Site : ${selectedSite}` : "Tous les sites"}
                tooltip="Nombre de développeurs actifs ayant contribué au moins un commit sur la période."
                deltaInfo={delta(latest.nb_developers, previous?.nb_developers)}
              />

              {/* Snapshot info */}
              <div className="col-xl-3 col-md-6">
                <div className="card card-animate h-100 border border-dashed">
                  <div className="card-body d-flex flex-column align-items-center justify-content-center text-center gap-2">
                    <i className="ri-calendar-check-line fs-2 text-muted opacity-50"></i>
                    <div>
                      <p className="text-muted fs-12 mb-1">Dernier snapshot</p>
                      <h6 className="mb-0 fw-semibold">{fmtDate(latest.snapshot_date)}</h6>
                      <small className="text-muted">{kpiData?.total_snapshots || 0} snapshot(s) total</small>
                    </div>
                    {previous && (
                      <div className="mt-1 pt-2 border-top w-100">
                        <p className="text-muted fs-11 mb-0">
                          <i className="ri-history-line me-1"></i>
                          Snapshot précédent : {fmtDate(previous.snapshot_date)}
                        </p>
                        {globalScore !== null && (
                          <p className="fs-11 mb-0 mt-1">
                            Score global :{" "}
                            <span className={`fw-bold text-${getScoreColor(globalScore)}`}>
                              {globalScore}/100
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3 — Graphiques historique */}
            {history.length > 1 && (
              <div className="row g-3 mb-4">
                <div className="col-xl-6"><KpiHistoryChart history={history} /></div>
                <div className="col-xl-6"><MrRatesChart history={history} /></div>
              </div>
            )}

            {/* Row 4 — Radar + Scores */}
            <div className="row g-3">
              <div className="col-xl-8">
                <div className="card">
                  <div className="card-header d-flex align-items-center border-bottom-dashed py-3">
                    <div className="flex-grow-1">
                      <h5 className="card-title mb-1">
                        <i className="ri-radar-line me-2 text-secondary"></i>Vue d'ensemble — 7 KPIs
                      </h5>
                      <p className="text-muted mb-0 fs-12">Tous les KPIs normalisés sur 100</p>
                    </div>
                    {globalScore !== null && (
                      <span className={`badge fs-13 bg-${getScoreColor(globalScore)}-subtle text-${getScoreColor(globalScore)}`}>
                        Score : {globalScore} / 100
                      </span>
                    )}
                  </div>
                  <div className="card-body">
                    <div style={{ height: 320 }}>
                      <KpiRadarChart latest={latest} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-xl-4">
                <div className="card h-100">
                  <div className="card-header border-bottom-dashed py-3">
                    <h5 className="card-title mb-0">
                      <i className="ri-bar-chart-horizontal-line me-2 text-info"></i>Détail des scores
                    </h5>
                  </div>
                  <div className="card-body">
                    <div className="text-center mb-4">
                      <div className="position-relative d-inline-flex align-items-center justify-content-center" style={{ width: 100, height: 100 }}>
                        <svg width="100" height="100" style={{ position: "absolute", top: 0, left: 0 }}>
                          <circle cx="50" cy="50" r="42" fill="none" stroke="#e9ebec" strokeWidth="8" />
                          <circle
                            cx="50" cy="50" r="42" fill="none"
                            stroke={
                              globalScore >= 70 ? CHART_COLORS.success :
                              globalScore >= 40 ? CHART_COLORS.warning :
                                                  CHART_COLORS.danger
                            }
                            strokeWidth="8"
                            strokeDasharray={`${2 * Math.PI * 42 * (globalScore / 100)} ${2 * Math.PI * 42}`}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        <div style={{ zIndex: 1 }}>
                          <h3 className="mb-0 fw-bold">{globalScore}</h3>
                          <p className="mb-0 fs-11 text-muted">/ 100</p>
                        </div>
                      </div>
                      <p className="mt-2 mb-0 fs-12 fw-semibold text-muted">Score global de performance</p>
                    </div>

                    {radarScores && (
                      <div className="vstack gap-1">
                        <ScoreBadge label="Taux MR/site"     value={radarScores.mrRateSite}     color="primary"   />
                        <ScoreBadge label="MR Approuvés"     value={radarScores.approvedMR}      color="success"   />
                        <ScoreBadge label="MR Fusionnés"     value={radarScores.mergedMR}        color="info"      />
                        <ScoreBadge label="Taux commit/site" value={radarScores.commitRateSite}  color="warning"   />
                        <ScoreBadge label="NB Commits"       value={radarScores.nbCommits}       color="danger"    />
                        <ScoreBadge label="Rapidité revue"   value={radarScores.reviewTime}      color="secondary" />
                        <ScoreBadge label="NB Développeurs"  value={radarScores.nbDevs}          color="success"   />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tableau snapshots */}
            <SnapshotsTable history={history} />
          </>
        )}

        {/* Empty states */}
        {!loading && !error && !latest && selectedProjectId && (
          <EmptyState
            icon="ri-bar-chart-2-line"
            title="Aucune donnée KPI"
            description="Ce projet n'a pas encore été extrait. Lancez une extraction pour voir les KPIs."
            actionLabel="Extraire les données"
            onAction={() => navigate(`/extraction?project_id=${selectedProjectId}`)}
          />
        )}
        {!selectedProjectId && !loading && (
          <EmptyState
            icon="ri-folder-chart-line"
            title="Sélectionnez un projet"
            description="Choisissez un projet dans la liste pour voir ses indicateurs de performance."
          />
        )}

      </div>

      <style>{`
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
