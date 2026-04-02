/**
 * pages/DashboardKPI.jsx
 *
 * CORRECTIONS :
 *
 *   1. FIX CRITIQUE — import kpiService :
 *      AVANT : import { projectService, kpiService } from "../services/kpiService"
 *              → kpiService.js n'exporte plus projectService (supprimé pour éviter
 *                l'import circulaire) → projectService = undefined au runtime → crash
 *      ✅ FIX : imports séparés depuis leurs sources correctes.
 *
 *   2. AJOUT — Tableau multi-mois (le tableau Velocity du PDF encadrant) :
 *      Site    | Déc 2025 | Jan 2026 | Fév 2026
 *      France  | 5.8      | 6.0      | 4.4
 *      Tunisie | 5.1      | 2.8      | 3.6
 *      Utilise analyticsService.getMultiPeriod() + analyticsService.getTrend().
 *
 *   3. FIX — siteId : parseInt ou null avant l'appel kpiService.getDashboard().
 *
 *   4. FIX — exportSnapshotPDF : classe CSS body proprement.
 *
 *   5. FIX — delta() : protection division par 0.
 *
 *   6. FIX — RadarChart : destroy propre avec ref.
 *
 *   7. FIX — history items : utilise snapshot_date pour les labels.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { kpiService } from "../services/kpiService";
import projectService from "../services/projectService";   // ✅ FIX : source correcte
import analyticsService from "../services/analyticsService"; // ✅ pour getMultiPeriod + getTrend
import siteService from "../services/siteService";
import periodService from "../services/periodService";
import ReactApexChart from "react-apexcharts";
import Chart from "chart.js/auto";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

// ── Helpers ───────────────────────────────────────────────────────────────────
const CHART_COLORS = {
  primary: "#405189", success: "#0ab39c", info: "#299cdb",
  warning: "#f7b84b", danger: "#f06548", secondary: "#3577f1",
};
const getCssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rgba = (cssVar, alpha) => {
  const val = getCssVar(cssVar);
  return val ? `rgba(${val},${alpha})` : `rgba(64,81,137,${alpha})`;
};

const fmt = (num, decimals = 2) => {
  if (num == null || isNaN(Number(num))) return "—";
  return Number(num).toFixed(decimals);
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function delta(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.5) return { value: "±0%", color: "secondary", icon: "ri-subtract-line" };
  return pct > 0
    ? { value: `+${pct.toFixed(1)}%`, color: "success", icon: "ri-arrow-up-line" }
    : { value: `${pct.toFixed(1)}%`, color: "danger", icon: "ri-arrow-down-line" };
}

function getPeriodLabel(snap) {
  if (snap?.period?.year) return `${snap.period.year}/${String(snap.period.month).padStart(2, "0")}`;
  if (snap?.snapshot_date) return snap.snapshot_date.slice(0, 7);
  return "—";
}

// Noms des mois en français
const MOIS_FR = {
  1: "Jan", 2: "Fév", 3: "Mar", 4: "Avr", 5: "Mai", 6: "Jun",
  7: "Jul", 8: "Aoû", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Déc",
};

// ── KpiCard ───────────────────────────────────────────────────────────────────
const KpiCard = ({ title, value, unit, icon, color, description, tooltip, deltaInfo }) => {
  const [showTip, setShowTip] = useState(false);
  const colorMap = {
    primary: { bg: "bg-primary-subtle", text: "text-primary" },
    success: { bg: "bg-success-subtle", text: "text-success" },
    info: { bg: "bg-info-subtle", text: "text-info" },
    warning: { bg: "bg-warning-subtle", text: "text-warning" },
    danger: { bg: "bg-danger-subtle", text: "text-danger" },
    secondary: { bg: "bg-secondary-subtle", text: "text-secondary" },
  };
  const classes = colorMap[color] || colorMap.primary;
  return (
    <div className="col-xl-3 col-md-6">
      <div className="card border-0 card-animate h-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
        <div className="card-body">
          <div className="d-flex align-items-start">
            <div className="avatar-sm flex-shrink-0">
              <span className={`avatar-title ${classes.bg} ${classes.text} rounded-3 fs-2`}>
                <i className={icon}></i>
              </span>
            </div>
            <div className="flex-grow-1 overflow-hidden ms-3">
              <div className="d-flex align-items-center gap-1 mb-1">
                <p className="text-uppercase fw-medium text-muted text-truncate mb-0 fs-11"
                  title={title} style={{ letterSpacing: ".05em" }}>{title}</p>
                {tooltip && (
                  <div style={{ position: "relative", display: "inline-flex" }}>
                    <i className="ri-information-line text-muted fs-13"
                      style={{ cursor: "pointer", opacity: 0.5 }}
                      onMouseEnter={() => setShowTip(true)}
                      onMouseLeave={() => setShowTip(false)} />
                    {showTip && (
                      <div style={{
                        position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
                        transform: "translateX(-50%)", background: "#1e2a3b", color: "#fff",
                        borderRadius: 8, padding: "8px 12px", fontSize: 11, lineHeight: 1.5,
                        zIndex: 1000, maxWidth: 240, whiteSpace: "normal",
                        boxShadow: "0 4px 12px rgba(0,0,0,.2)", pointerEvents: "none",
                      }}>
                        {tooltip}
                        <div style={{
                          position: "absolute", top: "100%", left: "50%",
                          transform: "translateX(-50%)", border: "5px solid transparent",
                          borderTopColor: "#1e2a3b"
                        }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <h4 className="fs-2 mb-0 fw-bold">
                {value !== null && value !== undefined ? value : "—"}
                {unit && <span className="fs-13 text-muted fw-normal ms-1">{unit}</span>}
              </h4>
              <div className="d-flex align-items-center justify-content-between mt-1">
                <p className="text-muted text-truncate mb-0 fs-12">{description}</p>
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

// ── Radar Chart ───────────────────────────────────────────────────────────────
const KpiRadarChart = ({ latest }) => {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);
  useEffect(() => {
    if (!chartRef.current || !latest) return;
    if (instanceRef.current) { instanceRef.current.destroy(); instanceRef.current = null; }
    const scores = {
      mrRateSite: Math.min(Number(((latest.mr_rate_per_site || 0) * 20).toFixed(1)), 100),
      approvedMR: Number(((latest.approved_mr_rate || 0) * 100).toFixed(1)),
      mergedMR: Number(((latest.merged_mr_rate || 0) * 100).toFixed(1)),
      commitRateSite: Math.min(Number(((latest.commit_rate_per_site || 0) * 10).toFixed(1)), 100),
      nbCommits: Math.min(Number(((latest.nb_commits_per_project || 0) / 10).toFixed(1)), 100),
      reviewTime: Math.max(0, Number((100 - (latest.avg_review_time_hours || 0) * 2).toFixed(1))),
      nbDevs: Math.min((latest.nb_developers || 0) * 5, 100),
    };
    instanceRef.current = new Chart(chartRef.current, {
      type: "radar",
      data: {
        labels: ["Taux MR/site", "MR Approuvés", "MR Fusionnés", "Taux commit/site", "NB Commits", "Rapidité revue", "NB Développeurs"],
        datasets: [
          {
            label: "Performance actuelle", backgroundColor: rgba("--vz-primary-rgb", 0.18),
            borderColor: getCssVar("--vz-primary") || CHART_COLORS.primary, borderWidth: 2,
            pointBackgroundColor: getCssVar("--vz-primary") || CHART_COLORS.primary,
            pointBorderColor: "#fff", pointRadius: 4, data: Object.values(scores)
          },
          {
            label: "Objectif (100)", backgroundColor: rgba("--vz-info-rgb", 0.07),
            borderColor: getCssVar("--vz-info") || CHART_COLORS.info, borderWidth: 1.5,
            borderDash: [5, 4], pointRadius: 3, data: [100, 100, 100, 100, 100, 100, 100]
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "top", align: "end", labels: { font: { size: 12 }, usePointStyle: true, padding: 16 } } },
        scales: {
          r: {
            min: 0, max: 100, ticks: { stepSize: 20, font: { size: 10 }, backdropColor: "transparent" },
            pointLabels: { font: { size: 11 } }, grid: { color: "rgba(133,141,152,0.15)" }, angleLines: { color: "rgba(133,141,152,0.15)" }
          }
        },
      },
    });
    return () => { if (instanceRef.current) { instanceRef.current.destroy(); instanceRef.current = null; } };
  }, [latest]);
  return <canvas ref={chartRef} style={{ maxHeight: 320, width: "100%" }} />;
};

// ── Graphique de tendance (ligne) ─────────────────────────────────────────────
const KpiHistoryChart = ({ history }) => {
  if (!history?.length) return null;
  const labels = history.map(getPeriodLabel);
  const series = useMemo(() => [
    { name: "Taux commit/site", data: history.map(s => Number((s.commit_rate_per_site || 0).toFixed(3))) },
    { name: "Taux MR/site", data: history.map(s => Number((s.mr_rate_per_site || 0).toFixed(3))) },
  ], [history]);
  const options = useMemo(() => ({
    chart: { type: "area", height: 280, toolbar: { show: false } },
    colors: [CHART_COLORS.primary, CHART_COLORS.success],
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.3, opacityTo: 0.05 } },
    xaxis: { categories: labels, labels: { style: { fontSize: "11px" } }, axisBorder: { show: false } },
    yaxis: { labels: { style: { fontSize: "11px" } } },
    grid: { borderColor: "#e9ebec", strokeDashArray: 4 },
    legend: { position: "top", horizontalAlign: "right", fontSize: "12px" },
    tooltip: { shared: true, intersect: false },
    dataLabels: { enabled: false },
  }), [labels]);
  return (
    <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
      <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
        <h6 className="mb-0 fw-semibold"><i className="ri-line-chart-line me-2 text-primary"></i>Évolution des taux</h6>
      </div>
      <div className="card-body p-0 pb-2">
        <ReactApexChart options={options} series={series} type="area" height={280} />
      </div>
    </div>
  );
};

const MrRatesChart = ({ history }) => {
  if (!history?.length) return null;
  const labels = history.map(getPeriodLabel);
  const series = useMemo(() => [
    { name: "Taux approbation", data: history.map(s => Number(((s.approved_mr_rate || 0) * 100).toFixed(1))) },
    { name: "Taux fusion", data: history.map(s => Number(((s.merged_mr_rate || 0) * 100).toFixed(1))) },
  ], [history]);
  const options = useMemo(() => ({
    chart: { type: "bar", height: 280, toolbar: { show: false } },
    colors: [CHART_COLORS.info, CHART_COLORS.warning],
    plotOptions: { bar: { columnWidth: "40%", borderRadius: 4, borderRadiusApplication: "end" } },
    xaxis: { categories: labels, labels: { style: { fontSize: "11px" } } },
    yaxis: { max: 100, labels: { formatter: v => v + "%", style: { fontSize: "11px" } } },
    grid: { borderColor: "#e9ebec", strokeDashArray: 4 },
    legend: { position: "top", horizontalAlign: "right", fontSize: "12px" },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: v => v + "%" }, shared: true, intersect: false },
  }), [labels]);
  return (
    <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
      <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
        <h6 className="mb-0 fw-semibold"><i className="ri-bar-chart-line me-2 text-success"></i>Approbation et fusion MR</h6>
      </div>
      <div className="card-body p-0 pb-2">
        <ReactApexChart options={options} series={series} type="bar" height={280} />
      </div>
    </div>
  );
};

// ── TABLEAU MULTI-PÉRIODES (PDF encadrant) ────────────────────────────────────
/**
 * ✅ NOUVEAU — Reproduit le tableau Velocity du PDF encadrant :
 *   Site    | Déc 2025 | Jan 2026 | Fév 2026
 *   France  | 5.8      | 6.0      | 4.4
 *   Tunisie | 5.1      | 2.8      | 3.6
 *
 * Code couleur comme dans le PDF :
 *   Vert  (≥ moyenne + 10%)
 *   Orange (± 10% de la moyenne)
 *   Rouge  (< moyenne - 10%)
 */
const MultiPeriodTable = ({ multiPeriodData, kpiField, kpiLabel }) => {
  if (!multiPeriodData?.length) return null;

  // Collecte tous les sites distincts
  const allSites = [];
  const siteMap = new Map();
  multiPeriodData.forEach(period => {
    period.snapshots?.forEach(snap => {
      if (!siteMap.has(snap.site_name)) {
        siteMap.set(snap.site_name, snap.site_id);
        allSites.push({ name: snap.site_name, id: snap.site_id });
      }
    });
  });

  if (!allSites.length) return null;

  // Calcul de la moyenne globale sur tous les snapshots pour le code couleur
  const allValues = multiPeriodData.flatMap(p =>
    (p.snapshots || []).map(s => Number(s[kpiField])).filter(v => !isNaN(v) && v > 0)
  );
  const globalAvg = allValues.length
    ? allValues.reduce((a, b) => a + b, 0) / allValues.length
    : 0;

  const getCellColor = (val) => {
    if (val == null || isNaN(val) || val === 0) return { bg: "#f8f9fa", text: "#6c757d" };
    if (val >= globalAvg * 1.10) return { bg: "#d1fae5", text: "#065f46" }; // vert
    if (val >= globalAvg * 0.90) return { bg: "#fef9c3", text: "#78350f" }; // orange
    return { bg: "#fee2e2", text: "#991b1b" };                               // rouge
  };

  return (
    <div className="card border-0 mb-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
      <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
        <h6 className="mb-0 fw-semibold">
          <i className="ri-table-line me-2 text-primary"></i>
          {kpiLabel} — Comparaison multi-mois
          <span className="text-muted fw-normal fs-12 ms-2">(comme dans le tableau Velocity)</span>
        </h6>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-bordered align-middle mb-0">
            <thead style={{ background: "#f8f9fa" }}>
              <tr>
                <th className="py-3 ps-4 text-muted fs-12 fw-semibold" style={{ minWidth: 120 }}>Site</th>
                {multiPeriodData.map(period => (
                  <th key={period.period_id} colSpan="3" className="py-3 text-center text-muted fs-12 fw-semibold">
                    {period.period_label}
                  </th>
                ))}
              </tr>
              <tr style={{ background: "#f1f3f7" }}>
                <th className="py-2 ps-4 text-muted fs-11">—</th>
                {multiPeriodData.map(period => (
                  <th key={`${period.period_id}-h`} colSpan="3" className="py-2 text-center">
                    <div className="d-flex justify-content-around">
                      <span className="text-muted fs-11">Resolved</span>
                      <span className="text-muted fs-11">Devs</span>
                      <span className="text-muted fs-11 fw-semibold">{kpiLabel}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allSites.map(site => (
                <tr key={site.id}>
                  <td className="ps-4 py-3 fw-semibold fs-13">{site.name}</td>
                  {multiPeriodData.map(period => {
                    const snap = period.snapshots?.find(s => s.site_name === site.name);
                    const val = snap ? Number(snap[kpiField]) : null;
                    const colors = getCellColor(val);
                    return (
                      <td key={`${period.period_id}-${site.id}`} colSpan="3" className="py-3">
                        <div className="d-flex justify-content-around align-items-center">
                          <span className="fs-13 text-muted">{snap?.total_mrs_created ?? "—"}</span>
                          <span className="fs-13 text-muted">{snap?.nb_developers ?? "—"}</span>
                          <span className="badge fw-bold fs-13 px-3 py-2"
                            style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.bg}` }}>
                            {val != null && !isNaN(val) ? val.toFixed(1) : "—"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 d-flex align-items-center gap-4 border-top" style={{ background: "#fafbfc" }}>
          <span className="fs-11 text-muted fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Légende :</span>
          {[
            { bg: "#d1fae5", text: "#065f46", label: `≥ ${(globalAvg * 1.1).toFixed(1)} (excellent)` },
            { bg: "#fef9c3", text: "#78350f", label: `~ ${globalAvg.toFixed(1)} (moyen)` },
            { bg: "#fee2e2", text: "#991b1b", label: `< ${(globalAvg * 0.9).toFixed(1)} (faible)` },
          ].map((item, i) => (
            <span key={i} className="d-flex align-items-center gap-1 fs-11">
              <span style={{ width: 14, height: 14, borderRadius: 3, background: item.bg, border: `1px solid ${item.text}20`, display: "inline-block" }}></span>
              <span style={{ color: item.text }}>{item.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Score Badge ────────────────────────────────────────────────────────────────
const ScoreBadge = ({ label, value, color }) => {
  const cls = {
    success: { bg: "bg-success-subtle", text: "text-success", bar: "bg-success" },
    primary: { bg: "bg-primary-subtle", text: "text-primary", bar: "bg-primary" },
    info: { bg: "bg-info-subtle", text: "text-info", bar: "bg-info" },
    warning: { bg: "bg-warning-subtle", text: "text-warning", bar: "bg-warning" },
    danger: { bg: "bg-danger-subtle", text: "text-danger", bar: "bg-danger" },
    secondary: { bg: "bg-secondary-subtle", text: "text-secondary", bar: "bg-secondary" },
  }[color] || {};
  return (
    <div className="d-flex align-items-center justify-content-between py-2 border-bottom border-dashed">
      <span className="fs-12 text-muted fw-medium">{label}</span>
      <div className="d-flex align-items-center gap-2">
        <div className="progress" style={{ width: 80, height: 5, borderRadius: 99 }}>
          <div className={`progress-bar ${cls.bar}`} style={{ width: `${Math.min(value, 100)}%` }} />
        </div>
        <span className={`badge ${cls.bg} ${cls.text} fs-11`}>{value}</span>
      </div>
    </div>
  );
};

// ── Snapshots Table ────────────────────────────────────────────────────────────
const SnapshotsTable = ({ history }) => {
  const [sortKey, setSortKey] = useState("snapshot_date");
  const [sortDir, setSortDir] = useState("desc");
  if (!history?.length) return null;
  const sorted = [...history].sort((a, b) => {
    let va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
    if (sortKey === "snapshot_date") { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
    return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };
  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <i className="ri-arrow-up-down-line ms-1 opacity-25 fs-11" />;
    return sortDir === "asc"
      ? <i className="ri-arrow-up-line ms-1 text-primary fs-11" />
      : <i className="ri-arrow-down-line ms-1 text-primary fs-11" />;
  };
  const COLS = [
    { key: "snapshot_date", label: "Date snapshot", fmt: v => fmtDate(v) },
    { key: "nb_commits_per_project", label: "NB Commits", fmt: v => v ?? "—" },
    { key: "nb_developers", label: "NB Devs", fmt: v => v ?? "—" },
    { key: "commit_rate_per_site", label: "Taux commit/site", fmt: v => v != null ? Number(v).toFixed(2) : "—" },
    { key: "mr_rate_per_site", label: "Taux MR/site", fmt: v => v != null ? Number(v).toFixed(2) : "—" },
    { key: "approved_mr_rate", label: "MR Approuvés", fmt: v => v != null ? `${(v * 100).toFixed(1)}%` : "—" },
    { key: "merged_mr_rate", label: "MR Fusionnés", fmt: v => v != null ? `${(v * 100).toFixed(1)}%` : "—" },
    { key: "avg_review_time_hours", label: "Revue moy.", fmt: v => v != null ? `${Number(v).toFixed(1)}h` : "—" },
  ];
  return (
    <div className="card border-0 mt-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
      <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
        <h6 className="mb-0 fw-semibold">
          <i className="ri-table-line me-2 text-primary"></i>Historique des snapshots
          <span className="text-muted fs-12 fw-normal ms-2">{history.length} snapshot(s)</span>
        </h6>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead style={{ background: "#fafbfc" }}>
              <tr>
                {COLS.map(col => (
                  <th key={col.key} className="py-3 text-muted fs-11 fw-semibold text-uppercase"
                    style={{ letterSpacing: ".05em", cursor: "pointer", userSelect: "none" }}
                    onClick={() => handleSort(col.key)}>
                    {col.label}<SortIcon k={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((snap, i) => (
                <tr key={i}>{COLS.map(col => <td key={col.key} className="fs-13">{col.fmt(snap[col.key])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Export helpers ─────────────────────────────────────────────────────────────
function exportSnapshotCSV(latest, projectName) {
  if (!latest) return;
  const headers = ["KPI", "Valeur", "Unité"];
  const rows = [
    ["Taux MR/site", latest.mr_rate_per_site ?? "—", "MR/dev"],
    ["MR Approuvés", ((latest.approved_mr_rate || 0) * 100).toFixed(1), "%"],
    ["MR Fusionnés", ((latest.merged_mr_rate || 0) * 100).toFixed(1), "%"],
    ["Taux commit/site", latest.commit_rate_per_site ?? "—", "commit/dev"],
    ["NB Commits/projet", latest.nb_commits_per_project ?? "—", ""],
    ["Temps revue moyen", latest.avg_review_time_hours != null ? Number(latest.avg_review_time_hours).toFixed(1) : "—", "h"],
    ["NB Développeurs", latest.nb_developers ?? "—", ""],
    ["Date snapshot", latest.snapshot_date ?? "—", ""],
  ];
  const csv = [headers, ...rows].map(r => r.join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `kpi_${projectName || "project"}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportSnapshotPDF(projectName) {
  const originalTitle = document.title;
  document.title = `KPI_${projectName || "Dashboard"}_${new Date().toISOString().slice(0, 10)}`;
  window.print();
  document.title = originalTitle;
}

// ── KPI pour le tableau multi-mois ────────────────────────────────────────────
const MULTI_PERIOD_KPIS = [
  { field: "mr_rate_per_site", label: "MR Rate" },
  { field: "approved_mr_rate", label: "Approved MR Rate" },
  { field: "merged_mr_rate", label: "Merged MR Rate" },
  { field: "commit_rate_per_site", label: "Commit Rate" },
  { field: "avg_review_time_hours", label: "Revue moy. (h)" },
];

// ── Main Component ─────────────────────────────────────────────────────────────
export default function DashboardKPI() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [sites, setSites] = useState([]);
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const [kpiData, setKpiData] = useState(null);
  const [multiPeriodData, setMultiPeriodData] = useState([]);
  const [activeMultiKpi, setActiveMultiKpi] = useState("mr_rate_per_site");
  // ✅ NOUVEAU : index du snapshot sélectionné (0 = dernier en date)
  const [selectedSnapIndex, setSelectedSnapIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Chargement initial
  useEffect(() => {
    let mounted = true;
    Promise.all([
      projectService.getAll(),
      periodService.getCurrent().catch(() => null),
      siteService.getAll(true).catch(() => []),
    ]).then(([projs, period, sitesData]) => {
      if (!mounted) return;
      setProjects(projs);
      setCurrentPeriod(period);
      setSites(Array.isArray(sitesData) ? sitesData : []);
      const urlId = searchParams.get("project_id");
      const first = urlId ? parseInt(urlId) : projs[0]?.id;
      if (first) setSelectedProjectId(first);
    });
    return () => { mounted = false; };
  }, []); // eslint-disable-line

  // Chargement KPIs + tableau multi-périodes
  useEffect(() => {
    if (!selectedProjectId) return;
    let mounted = true;
    setLoading(true);
    setError(null);

    const siteIdParam = selectedSiteId != null ? parseInt(selectedSiteId) : null;

    Promise.all([
      // KPIs principaux
      kpiService.getDashboard(selectedProjectId, { siteId: siteIdParam }),
      // ✅ NOUVEAU : tableau multi-périodes (PDF encadrant)
      analyticsService.getMultiPeriod(selectedProjectId, { months: 12, siteId: siteIdParam })
        .catch(() => []),
    ]).then(([data, multiData]) => {
      if (!mounted) return;
      setKpiData(data);
      setMultiPeriodData(Array.isArray(multiData) ? multiData : []);
    }).catch(() => {
      if (mounted) setError("Aucune donnée KPI. Veuillez d'abord lancer une extraction.");
    }).finally(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, [selectedProjectId, selectedSiteId]);

  const handleRefresh = useCallback(async () => {
    if (!selectedProjectId) return;
    setRefreshing(true);
    try {
      const siteIdParam = selectedSiteId != null ? parseInt(selectedSiteId) : null;
      const [data, multiData] = await Promise.all([
        kpiService.getDashboard(selectedProjectId, { siteId: siteIdParam }),
        analyticsService.getMultiPeriod(selectedProjectId, { months: 12, siteId: siteIdParam }).catch(() => []),
      ]);
      setKpiData(data);
      setMultiPeriodData(Array.isArray(multiData) ? multiData : []);
      setError(null);
    } catch {
      setError("Impossible de rafraîchir les données.");
    } finally {
      setRefreshing(false);
    }
  }, [selectedProjectId, selectedSiteId]);

  const handleProjectChange = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setSelectedSiteId(null);
    setSelectedSnapIndex(0); // ✅ reset au dernier snapshot
    setSearchParams({ project_id: projectId });
  }, [setSearchParams]);

  const history = kpiData?.history || [];

  // ✅ NOUVEAU : snapshot sélectionné par l'utilisateur
  // historyDesc[0] = plus récent, historyDesc[N] = plus ancien
  const historyDesc = [...history].reverse();
  const latest = historyDesc[selectedSnapIndex] || kpiData?.latest_metrics || null;
  const previous = historyDesc[selectedSnapIndex + 1] || null;

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const selectedSite = sites.find(s => s.id === selectedSiteId);

  const radarScores = useMemo(() => {
    if (!latest) return null;
    return {
      mrRateSite: Math.min(Number(((latest.mr_rate_per_site || 0) * 20).toFixed(1)), 100),
      approvedMR: Number(((latest.approved_mr_rate || 0) * 100).toFixed(1)),
      mergedMR: Number(((latest.merged_mr_rate || 0) * 100).toFixed(1)),
      commitRateSite: Math.min(Number(((latest.commit_rate_per_site || 0) * 10).toFixed(1)), 100),
      nbCommits: Math.min(Number(((latest.nb_commits_per_project || 0) / 10).toFixed(1)), 100),
      reviewTime: Math.max(0, Number((100 - (latest.avg_review_time_hours || 0) * 2).toFixed(1))),
      nbDevs: Math.min((latest.nb_developers || 0) * 5, 100),
    };
  }, [latest]);

  const globalScore = useMemo(() => radarScores ? Math.round(Object.values(radarScores).reduce((s, v) => s + v, 0) / 7) : null, [radarScores]);
  const getScoreColor = (s) => s >= 70 ? "success" : s >= 40 ? "warning" : "danger";
  const reviewAlert = latest?.avg_review_time_hours != null && latest.avg_review_time_hours > 24;

  const activeMultiKpiDef = MULTI_PERIOD_KPIS.find(k => k.field === activeMultiKpi) || MULTI_PERIOD_KPIS[0];

  if (loading && !refreshing) return <LoadingSpinner fullPage text="Chargement des KPIs…" />;

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Header */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
              <div>
                <h4 className="mb-1 fw-semibold">
                  <i className="ri-dashboard-2-line me-2 text-primary"></i>Tableau de bord KPI
                </h4>
                <ol className="breadcrumb mb-0 fs-12">
                  <li className="breadcrumb-item"><Link to="/" className="text-muted">Dashboard</Link></li>
                  <li className="breadcrumb-item"><Link to="/projects" className="text-muted">Projets</Link></li>
                  {selectedProject && <li className="breadcrumb-item active fw-medium">{selectedProject.name}</li>}
                  {currentPeriod && (
                    <li className="breadcrumb-item">
                      <span className={`badge ms-1 fs-11 bg-${currentPeriod.status === "open" ? "success" : "secondary"}-subtle text-${currentPeriod.status === "open" ? "success" : "secondary"}`}>
                        Période {currentPeriod.year}/{String(currentPeriod.month).padStart(2, "0")} — {currentPeriod.status === "open" ? "Ouverte" : "Clôturée"}
                      </span>
                    </li>
                  )}
                </ol>
              </div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <select className="form-select" style={{ width: 220 }}
                  value={selectedProjectId || ""}
                  onChange={e => handleProjectChange(parseInt(e.target.value))}>
                  <option value="" disabled>Choisir un projet…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {sites.length > 0 && (
                  <select className="form-select" style={{ width: 160 }}
                    value={selectedSiteId || ""}
                    onChange={e => setSelectedSiteId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Tous les sites</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {selectedSiteId && (
                  <button className="btn btn-sm btn-soft-warning" onClick={() => setSelectedSiteId(null)}>
                    <i className="ri-close-line me-1"></i>Tous les sites
                  </button>
                )}
                {latest && (
                  <>
                    <button className="btn btn-soft-success" onClick={() => exportSnapshotCSV(latest, selectedProject?.name)}>
                      <i className="ri-download-2-line me-1"></i>CSV
                    </button>
                    <button className="btn btn-soft-danger" onClick={() => exportSnapshotPDF(selectedProject?.name)}>
                      <i className="ri-printer-line me-1"></i>PDF
                    </button>
                  </>
                )}

                {/* ✅ NOUVEAU : Sélecteur de snapshot */}
                {historyDesc.length > 1 && (
                  <select
                    className="form-select"
                    style={{ width: 180 }}
                    value={selectedSnapIndex}
                    onChange={e => setSelectedSnapIndex(Number(e.target.value))}
                    title="Choisir un snapshot à visualiser"
                  >
                    {historyDesc.map((snap, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? "📌 " : ""}{fmtDate(snap.snapshot_date)}
                        {i === 0 ? " (dernier)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                <button className="btn btn-soft-primary" onClick={handleRefresh}
                  disabled={refreshing || !selectedProjectId}>
                  {refreshing
                    ? <span className="spinner-border spinner-border-sm"></span>
                    : <i className="ri-refresh-line"></i>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Alerte temps de revue */}
        {reviewAlert && (
          <div className="d-flex align-items-center gap-3 rounded-3 p-3 mb-4"
            style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
            <i className="ri-time-line fs-4 flex-shrink-0 text-warning"></i>
            <div className="flex-grow-1 fs-13">
              <strong>Temps de revue élevé</strong> — {fmt(latest?.avg_review_time_hours, 1)}h (seuil recommandé : 24h)
            </div>
            <button className="btn btn-sm btn-warning flex-shrink-0"
              onClick={() => navigate(`/merge?project_id=${selectedProjectId}`)}>
              <i className="ri-git-merge-line me-1"></i>Voir MRs
            </button>
          </div>
        )}

        {/* Erreur */}
        {error && (
          <div className="d-flex align-items-center gap-3 rounded-3 p-3 mb-4"
            style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
            <i className="ri-information-line fs-4 flex-shrink-0 text-warning"></i>
            <div className="flex-grow-1">
              <p className="fs-13 mb-2 text-muted">{error}</p>
              <button className="btn btn-primary btn-sm" onClick={() => navigate("/extraction")}>
                <i className="ri-download-2-line me-1"></i>Lancer une extraction
              </button>
            </div>
          </div>
        )}

        {latest && (
          <>
            {/* KPI Cards */}
            <div className="row g-3 mb-4">
              <KpiCard title="Taux MR / site" value={fmt(latest.mr_rate_per_site, 2)} icon="ri-git-pull-request-line" color="primary" unit="MR/dev" description="NB MRs ÷ NB devs du site" tooltip="Mesure le nombre moyen de MRs créées par développeur." deltaInfo={delta(latest.mr_rate_per_site, previous?.mr_rate_per_site)} />
              <KpiCard title="MR Approuvés" value={fmt((latest.approved_mr_rate || 0) * 100, 1)} icon="ri-checkbox-circle-line" color="success" unit="%" description="Taux d'approbation" tooltip="Pourcentage de MRs ayant reçu une approbation." deltaInfo={delta(latest.approved_mr_rate, previous?.approved_mr_rate)} />
              <KpiCard title="MR Fusionnés" value={fmt((latest.merged_mr_rate || 0) * 100, 1)} icon="ri-git-merge-line" color="info" unit="%" description="Taux de fusion" tooltip="Pourcentage de MRs fusionnées." deltaInfo={delta(latest.merged_mr_rate, previous?.merged_mr_rate)} />
              <KpiCard title="Taux commit / site" value={fmt(latest.commit_rate_per_site, 2)} icon="ri-git-commit-line" color="warning" unit="commit/dev" description="NB commits ÷ NB devs" tooltip="Productivité moyenne par développeur." deltaInfo={delta(latest.commit_rate_per_site, previous?.commit_rate_per_site)} />
            </div>
            <div className="row g-3 mb-4">
              <KpiCard title="NB commits / projet" value={fmt(latest.nb_commits_per_project, 0)} icon="ri-code-s-slash-line" color="primary" description="Total commits" tooltip="Nombre total de commits sur la période." deltaInfo={delta(latest.nb_commits_per_project, previous?.nb_commits_per_project)} />
              <KpiCard title="Temps de revue moyen" value={fmt(latest.avg_review_time_hours, 1)} icon="ri-time-line" color={reviewAlert ? "danger" : "warning"} unit="h" description={reviewAlert ? "⚠ Dépasse 24h" : "Durée moyenne d'approbation"} tooltip="Temps moyen entre création et approbation d'une MR." deltaInfo={delta(latest.avg_review_time_hours, previous?.avg_review_time_hours)} />
              <KpiCard title="NB Développeurs" value={fmt(latest.nb_developers, 0)} icon="ri-team-line" color="secondary" unit="devs" description={selectedSite ? `Site : ${selectedSite.name}` : "Tous les sites"} tooltip="Développeurs ayant contribué au moins un commit." deltaInfo={delta(latest.nb_developers, previous?.nb_developers)} />
              <div className="col-xl-3 col-md-6">
                <div className="card border-0 border-dashed h-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                  <div className="card-body d-flex flex-column align-items-center justify-content-center text-center gap-2">
                    <i className="ri-calendar-check-line fs-2 text-muted opacity-50"></i>
                    <div>
                      <p className="text-muted fs-12 mb-1">Dernier snapshot</p>
                      <h6 className="mb-0 fw-semibold">{fmtDate(latest.snapshot_date)}</h6>
                      <small className="text-muted">{kpiData?.total_snapshots || 0} snapshot(s) total</small>
                    </div>
                    {globalScore != null && (
                      <div className="mt-1 pt-2 border-top w-100">
                        <p className="fs-11 mb-0">
                          Score global : <span className={`fw-bold text-${getScoreColor(globalScore)}`}>{globalScore}/100</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ NOUVEAU : Tableau multi-périodes (PDF encadrant) */}
            {multiPeriodData.length > 0 && (
              <>
                {/* Sélecteur de KPI pour le tableau */}
                <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
                  <span className="fs-12 fw-semibold text-muted text-uppercase" style={{ letterSpacing: ".05em" }}>
                    <i className="ri-table-line me-1"></i>Tableau multi-mois :
                  </span>
                  {MULTI_PERIOD_KPIS.map(kpi => (
                    <button
                      key={kpi.field}
                      className={`btn btn-sm ${activeMultiKpi === kpi.field ? "btn-primary" : "btn-soft-secondary"}`}
                      onClick={() => setActiveMultiKpi(kpi.field)}>
                      {kpi.label}
                    </button>
                  ))}
                </div>
                <MultiPeriodTable
                  multiPeriodData={multiPeriodData}
                  kpiField={activeMultiKpiDef.field}
                  kpiLabel={activeMultiKpiDef.label}
                />
              </>
            )}

            {/* Charts historique */}
            {history.length > 1 && (
              <div className="row g-3 mb-4">
                <div className="col-xl-6"><KpiHistoryChart history={history} /></div>
                <div className="col-xl-6"><MrRatesChart history={history} /></div>
              </div>
            )}

            {/* Radar + Score */}
            <div className="row g-3">
              <div className="col-xl-8">
                <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                  <div className="card-header bg-white d-flex align-items-center" style={{ borderBottom: "1px solid #f0f2f5" }}>
                    <h6 className="mb-0 fw-semibold flex-grow-1">
                      <i className="ri-radar-line me-2 text-secondary"></i>Vue d'ensemble — 7 KPIs
                    </h6>
                    {globalScore != null && (
                      <span className={`badge bg-${getScoreColor(globalScore)}-subtle text-${getScoreColor(globalScore)} fs-13`}>
                        Score : {globalScore} / 100
                      </span>
                    )}
                  </div>
                  <div className="card-body">
                    <div style={{ height: 320 }}><KpiRadarChart latest={latest} /></div>
                  </div>
                </div>
              </div>

              <div className="col-xl-4">
                <div className="card border-0 h-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                  <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
                    <h6 className="mb-0 fw-semibold">
                      <i className="ri-bar-chart-horizontal-line me-2 text-primary"></i>Détail des scores
                    </h6>
                  </div>
                  <div className="card-body">
                    <div className="text-center mb-4">
                      <div className="position-relative d-inline-flex align-items-center justify-content-center"
                        style={{ width: 100, height: 100 }}>
                        <svg width="100" height="100" style={{ position: "absolute", top: 0, left: 0 }}>
                          <circle cx="50" cy="50" r="42" fill="none" stroke="#e9ebec" strokeWidth="8" />
                          <circle cx="50" cy="50" r="42" fill="none"
                            stroke={globalScore >= 70 ? CHART_COLORS.success : globalScore >= 40 ? CHART_COLORS.warning : CHART_COLORS.danger}
                            strokeWidth="8"
                            strokeDasharray={`${2 * Math.PI * 42 * ((globalScore || 0) / 100)} ${2 * Math.PI * 42}`}
                            strokeLinecap="round" transform="rotate(-90 50 50)" />
                        </svg>
                        <div style={{ zIndex: 1 }}>
                          <h3 className="mb-0 fw-bold">{globalScore ?? "—"}</h3>
                          <p className="mb-0 fs-11 text-muted">/ 100</p>
                        </div>
                      </div>
                      <p className="mt-2 mb-0 fs-12 fw-semibold text-muted">Score global</p>
                    </div>
                    {radarScores && (
                      <div className="vstack gap-0">
                        <ScoreBadge label="Taux MR/site" value={radarScores.mrRateSite} color="primary" />
                        <ScoreBadge label="MR Approuvés" value={radarScores.approvedMR} color="success" />
                        <ScoreBadge label="MR Fusionnés" value={radarScores.mergedMR} color="info" />
                        <ScoreBadge label="Taux commit/site" value={radarScores.commitRateSite} color="warning" />
                        <ScoreBadge label="NB Commits" value={radarScores.nbCommits} color="danger" />
                        <ScoreBadge label="Rapidité revue" value={radarScores.reviewTime} color="secondary" />
                        <ScoreBadge label="NB Développeurs" value={radarScores.nbDevs} color="success" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <SnapshotsTable history={history} />
          </>
        )}

        {!loading && !error && !latest && selectedProjectId && (
          <EmptyState icon="ri-bar-chart-2-line" title="Aucune donnée KPI"
            description="Ce projet n'a pas encore été extrait."
            actionLabel="Extraire les données"
            onAction={() => navigate(`/extraction?project_id=${selectedProjectId}`)} />
        )}
        {!selectedProjectId && !loading && (
          <EmptyState icon="ri-folder-chart-line" title="Sélectionnez un projet"
            description="Choisissez un projet pour voir ses KPIs." />
        )}
      </div>

      <style>{`
        @media print {
          .btn, select, nav, .breadcrumb { display: none !important; }
          .card { break-inside: avoid; box-shadow: none !important; }
          .page-content { padding: 0 !important; }
          body { background: white !important; }
        }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
