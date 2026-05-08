/**
 * ComparativeAnalyticsPage.jsx — Dashboard de Pilotage Stratégique
 *
 * Page de Business Intelligence permettant de :
 *  - Comparer les tendances entre Sites (ex: France vs Tunisie)
 *  - Comparer les tendances entre Équipes (Teams)
 *  - Visualiser l'évolution historique des KPIs de vélocité et qualité
 *
 * Route : /analytics/comparison?project_id=X
 */
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import ReactApexChart from "react-apexcharts";
import analyticsService from "../services/analyticsService";
import projectService from "../services/projectService";
import developerService from "../services/developerService";
import { toUserError } from "../services/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";
import { exportDashboardPDF } from "../utils/pdfExportService";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, d = 1) => (n == null || isNaN(+n)) ? "—" : (+n).toFixed(d);

const CHART_COLORS = ["#4f46e5", "#0ab39c", "#299cdb", "#f7b84b", "#f06548", "#3577f1", "#6559cc", "#ffbe0b"];
const CHART_FONT = "'Inter', system-ui, -apple-system, sans-serif";

// ✅ SKELETON COMPONENTS FOR PREMIUM UX
const SkeletonCard = ({ height = 200, width = "100%" }) => (
  <div className="card border-0 shadow-sm mb-4 skeleton-pulse" style={{ borderRadius: 16, height, width, background: '#fff', overflow: 'hidden' }}>
    <div style={{ height: '20%', background: '#f8fafc', margin: '20px', borderRadius: 8 }}></div>
    <div style={{ height: '40%', background: '#f1f5f9', margin: '20px', borderRadius: 8 }}></div>
  </div>
);

const METRICS_OPTIONS = [
  { id: "velocity",      label: "Vélocité (Commits/Dev)", icon: "ri-flashlight-line",   color: "#4f46e5" },
  { id: "mr_rate",       label: "Livraison (MRs/Dev)",   icon: "ri-git-merge-line",    color: "#0ab39c" },
  { id: "quality_score", label: "Taux d'Approbation (%)", icon: "ri-shield-check-line", color: "#299cdb" },
  { id: "review_time",   label: "Temps de Revue (h)",     icon: "ri-timer-flash-line",  color: "#f7b84b" },
];

export default function ComparativeAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = parseInt(searchParams.get("project_id")) || 1;

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);
  const [showDetailedAudit, setShowDetailedAudit] = useState(false);
  const [pageError, setPageError] = useState("");

  // States de sélection
  const [activeMetricId, setActiveMetricId] = useState("velocity");
  const [entityType, setEntityType] = useState('site'); // 'site' or 'group'
  const [selectedEntityIds, setSelectedEntityIds] = useState([]);

  // 1. Charger la liste des projets une seule fois
  useEffect(() => {
    const fetchProjectsList = async () => {
      try {
        const data = await projectService.getAll();
        setProjects(data);
        // Si aucun projet dans l'URL, on prend le premier
        if (!searchParams.get("project_id") && data.length > 0) {
          setSearchParams({ project_id: data[0].id || data[0].project_id });
        }
      } catch (err) {
        console.error("Erreur chargement liste projets:", err);
        setPageError(toUserError(err, "Impossible de charger la liste des projets."));
      }
    };
    fetchProjectsList();
  }, [searchParams, setSearchParams]);

  // 2. Initialisation réactive au changement de projectId
  useEffect(() => {
    const loadProjectData = async () => {
      if (!projectId) return;
      try {
        setLoading(true);
        setPageError("");
        const [sitesData, groupsData] = await Promise.all([
          analyticsService.getAvailableSites(projectId).catch(() => []),
          developerService.getGroups().catch(() => [])
        ]);

        setSites(sitesData);
        setGroups(groupsData);

        // AUTO-SELECT SENIOR : On sélectionne tout par défaut pour ne pas laisser l'écran vide
        if (sitesData.length > 0) {
          setSelectedEntityIds(sitesData.map(s => s.id || s.site_id));
        }
      } catch (err) {
        console.error("Erreur loadProjectData:", err);
        setPageError(toUserError(err, "Impossible de charger les donnees du projet."));
      } finally {
        setLoading(false);
      }
    };
    loadProjectData();
  }, [projectId]);

  const handleProjectChange = (e) => {
    const newId = e.target.value;
    setSearchParams({ project_id: newId });
    setSelectedEntityIds([]); // Reset technique, sera repopulé par l'effet loadProjectData
  };

  // Données de tendance
  const [trends, setTrends] = useState([]);
  // DORA Metrics
  const [doraData, setDoraData] = useState([]);
  const [doraLoading, setDoraLoading] = useState(false);

  // 2. Chargement des données de tendance
  useEffect(() => {
    if (selectedEntityIds.length === 0) {
      setTrends([]);
      return;
    }

    const fetchTrends = async () => {
      try {
        setPageError("");
        const data = await analyticsService.getComparativeTrends(projectId, {
          siteIds: entityType === "site" ? selectedEntityIds : [],
          groupIds: entityType === "group" ? selectedEntityIds : [],
        });
        setTrends(data);
      } catch (err) {
        console.error("Erreur fetchTrends:", err);
        setPageError(toUserError(err, "Impossible de charger les tendances comparatives."));
      }
    };
    fetchTrends();
  }, [projectId, entityType, selectedEntityIds]);

  // 3. Chargement DORA Metrics
  useEffect(() => {
    if (!projectId) return;
    const fetchDora = async () => {
      setDoraLoading(true);
      try {
        const data = await analyticsService.getDoraMetrics(projectId);
        setDoraData(Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn("DORA metrics non disponibles:", err);
        setDoraData([]);
        setPageError(toUserError(err, "Impossible de charger les metriques DORA."));
      } finally {
        setDoraLoading(false);
      }
    };
    fetchDora();
  }, [projectId]);

  //  AJOUT SENIOR : Génération d'Insights Automatisés
  const insights = useMemo(() => {
    if (!trends.length) return [];
    const lastPeriod = trends[trends.length - 1]?.period_label;
    const currentData = trends.filter(t => t.period_label === lastPeriod);
    
    const results = [];
    
    // 1. Détection du Top Site
    const bestVelocity = [...currentData].sort((a,b) => b.metrics.velocity - a.metrics.velocity)[0];
    if (bestVelocity) {
      results.push({
        type: 'success',
        title: 'Performance Champion',
        text: `${bestVelocity.entity_name} mène la vélocité avec ${fmt(bestVelocity.metrics.velocity)} commits/dev.`,
        icon: 'ri-medal-line'
      });
    }

    // 2. Alerte Review Time
    const slowReviews = currentData.filter(t => t.metrics.review_time > 48);
    if (slowReviews.length > 0) {
      results.push({
        type: 'danger',
        title: 'Goulot d\'Étranglement',
        text: `${slowReviews.length} entité(s) dépassent 48h de revue. Risque de blocage.`,
        icon: 'ri-alarm-warning-line'
      });
    }

    // 3. Tendance Qualité
    const avgQuality = currentData.reduce((acc, c) => acc + (c.metrics.quality_score || 0), 0) / currentData.length;
    if (avgQuality > 0.85) {
      results.push({
        type: 'info',
        title: 'Excellence Qualité',
        text: `Le taux d'approbation global est excellent (${fmt(avgQuality * 100, 0)}%).`,
        icon: 'ri-shield-check-line'
      });
    }

    return results;
  }, [trends]);

  //  AJOUT SENIOR : Calcul du Project Health Score (0-100)
  const healthScore = useMemo(() => {
    if (!trends.length) return 0;
    const latest = trends[trends.length - 1];
    if (!latest) return 0;
    
    // Normalisation simplifiée pour la démo
    const vScore = Math.min(100, (latest.metrics.velocity / 6) * 100);
    const qScore = (latest.metrics.quality_score || 0) * 100;
    const rScore = Math.max(0, 100 - (latest.metrics.review_time / 72) * 100);
    
    return Math.round((vScore * 0.4) + (qScore * 0.4) + (rScore * 0.2));
  }, [trends]);

  // 3. Transformation des données pour ApexCharts
  const chartData = useMemo(() => {
    if (!trends.length) return { series: [], categories: [] };

    // Extraire les périodes uniques (ordonnées chronologiquement par rapport à l'ordre reçu)
    const periods = [...new Set(trends.map(t => t.period_label))];
    
    // Grouper par entité
    const entityGroups = {};
    trends.forEach(t => {
      if (!entityGroups[t.entity_name]) entityGroups[t.entity_name] = {};
      entityGroups[t.entity_name][t.period_label] = t.metrics[activeMetricId];
    });

    const series = Object.keys(entityGroups).map(name => ({
      name,
      data: periods.map(p => entityGroups[name][p] || 0)
    }));

    return { series, categories: periods };
  }, [trends, activeMetricId]);

  //  AJOUT SENIOR : Logique de pivot pour la Matrice Stratégique
  const strategicPivotData = useMemo(() => {
    if (!trends.length) return { rows: [], columns: [] };
    
    const columns = [...new Set(trends.map(t => t.period_label))];
    const entityNames = [...new Set(trends.map(t => t.entity_name))];
    
    const rows = entityNames.map(name => {
      const rowData = { entity_name: name, cells: {} };
      columns.forEach(col => {
        const trend = trends.find(t => t.entity_name === name && t.period_label === col);
        rowData.cells[col] = trend ? trend.metrics : null;
      });
      return rowData;
    });

    return { rows, columns };
  }, [trends]);

  //  AJOUT SENIOR : Helper pour le formatage conditionnel (Heatmap)
  const getMetricHealth = (metricId, value) => {
    if (value == null) return { color: "#9ca3af", bg: "#f3f4f6", border: "#e5e7eb", label: "N/A" };
    
    const thresholds = {
      velocity:      { low: 3.0,  high: 5.0,  reverse: false },
      mr_rate:       { low: 1.0,  high: 2.0,  reverse: false },
      quality_score: { low: 70,   high: 90,   reverse: false }, // En %
      review_time:   { low: 24.0, high: 48.0, reverse: true  },
    };

    // Ajuster quality_score si c'est un ratio 0-1
    let checkVal = value;
    if (metricId === 'quality_score' && value <= 1.0) checkVal = value * 100;

    const t = thresholds[metricId] || { low: 0, high: 0, reverse: false };
    
    let status = "medium";
    if (t.reverse) {
      if (checkVal <= t.low) status = "good";
      else if (checkVal > t.high) status = "bad";
    } else {
      if (checkVal >= t.high) status = "good";
      else if (checkVal < t.low) status = "bad";
    }

    const map = {
      good:   { color: "#065f46", bg: "#d1fae5", border: "#10b981", icon: "ri-checkbox-circle-fill" },
      medium: { color: "#92400e", bg: "#fef3c7", border: "#f59e0b", icon: "ri-error-warning-fill" },
      bad:    { color: "#991b1b", bg: "#fee2e2", border: "#ef4444", icon: "ri-close-circle-fill" }
    };

    return map[status];
  };

  const getDeltaText = (val, prevVal, metricId) => {
    if (prevVal == null || val == null) return { text: "→ stable", color: "text-muted" };
    const diff = val - prevVal;
    if (Math.abs(diff) < 0.01) return { text: "→ stable", color: "text-muted" };
    
    const isPositive = metricId === 'review_time' ? diff < 0 : diff > 0;
    const percent = ((diff / (prevVal || 1)) * 100).toFixed(0);
    return { 
      text: `${diff > 0 ? '↑' : '↓'} ${Math.abs(percent)}%`, 
      color: isPositive ? "text-success" : "text-danger" 
    };
  };

  //  EXPORT : Génération CSV, JSON & PDF Rapport Entreprise
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleExportPDF = async () => {
    setPdfLoading(true);
    setShowExportMenu(false);
    try {
      const projectName = projects.find(p => (p.id || p.project_id) === projectId)?.name || 'Dashboard';
      const periods = [...new Set(trends.map(t => t.period_label))];
      const period = periods.length
        ? `${periods[0]} - ${periods[periods.length - 1]}`
        : 'Toutes periodes';
      await exportDashboardPDF({
        projectName,
        period,
        healthScore,
        insights,
        trends,
        doraData,
        chartElementId: 'kpi-evolution-chart',
      });
    } catch (err) {
      console.error('[PDF Export] Erreur:', err);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!trends.length) return;
    const projectName = projects.find(p => (p.id || p.project_id) === projectId)?.name || 'dashboard';
    const safeProject = projectName.replace(/[^a-zA-Z0-9]/g, '_');
    const date = new Date().toISOString().slice(0, 10);

    const header = ['Entité', 'Période', 'Commits Totaux', 'MRs Totaux', 'Vélocité (C/Dev)', 'Qualité (%)', 'Review Time (h)'];
    const rows = trends.map(t => [
      `"${t.entity_name}"`,
      `"${t.period_label}"`,
      t.metrics.total_commits ?? '',
      t.metrics.total_mrs ?? '',
      (t.metrics.velocity ?? '').toString().replace('.', ','),
      ((t.metrics.quality_score != null ? (t.metrics.quality_score <= 1 ? t.metrics.quality_score * 100 : t.metrics.quality_score) : '')).toString().replace('.', ','),
      (t.metrics.review_time ?? '').toString().replace('.', ',')
    ]);

    const csvContent = [header.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const BOM = '\uFEFF'; // UTF-8 BOM pour Excel
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `KPI_${safeProject}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportJSON = () => {
    if (!trends.length) return;
    const projectName = projects.find(p => (p.id || p.project_id) === projectId)?.name || 'dashboard';
    const safeProject = projectName.replace(/[^a-zA-Z0-9]/g, '_');
    const date = new Date().toISOString().slice(0, 10);
    const payload = { project: projectName, exported_at: new Date().toISOString(), data: trends };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `KPI_${safeProject}_${date}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const chartOptions = {
    chart: {
      type: 'area',
      height: 400,
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: CHART_FONT,
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 3 },
    colors: CHART_COLORS,
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.15,
        opacityTo: 0.05,
        stops: [0, 90, 100]
      }
    },
    xaxis: {
      categories: chartData.categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: (val) => val.toFixed(activeMetricId === 'quality_score' ? 0 : 1) + (activeMetricId === 'quality_score' ? '%' : '')
      }
    },
    tooltip: {
      shared: true,
      intersect: false,
      y: {
        formatter: (val) => val.toFixed(2)
      }
    },
    grid: {
      borderColor: '#f1f1f1',
      padding: { top: 10, bottom: 10 }
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      floating: true,
      offsetY: -25,
      offsetX: -5
    },
    annotations: {
      yaxis: [{
        y: activeMetricId === 'velocity' ? 4 : (activeMetricId === 'quality_score' ? 85 : 24),
        borderColor: '#9ca3af',
        label: {
          borderColor: '#9ca3af',
          style: { color: '#fff', background: '#9ca3af' },
          text: 'Objectif Entreprise'
        }
      }]
    }
  };

  const activeMetric = METRICS_OPTIONS.find(m => m.id === activeMetricId);

  if (loading && projects.length === 0) {
    return <LoadingSpinner fullPage text="Initialisation de l'analyse strategique..." />;
  }

  return (
    <div className="page-content">
      <div className="container-fluid" style={{background: "#f3f3f9", minHeight: "100vh", paddingTop: "24px", paddingBottom: "24px"}}>
      {/*  AJOUT SENIOR : Header Dynamique avec Health Score */}
      <div className="row mb-4 align-items-center">
        <div className="col-lg-7">
          <div className="d-flex align-items-center gap-4">
            <div className="bg-white p-3 rounded-4 shadow-sm border d-flex align-items-center justify-content-center" style={{width: 80, height: 80}}>
               <div style={{ position: 'relative', width: 60, height: 60 }}>
                  <svg width="60" height="60" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#eee" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={healthScore > 70 ? "#0ab39c" : "#f7b84b"} strokeWidth="3" strokeDasharray={`${healthScore}, 100`} />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontWeight: 800, fontSize: 14 }}>{healthScore}%</div>
               </div>
            </div>
            <div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <h3 className="fw-bold mb-0" style={{color: "#1e293b"}}>Dashboard de Pilotage Stratégique</h3>
                <span className="badge bg-primary-subtle text-primary border px-2 py-1 fs-10" style={{borderRadius: 6}}>PREMIUM ANALYTICS</span>
              </div>
              <p className="text-muted mb-0 fs-14 fw-medium">
                <i className="ri-map-pin-2-line me-1"></i> Visualisation multi-sites pour {projects.find(p => p.id === projectId)?.name || "Projet Actif"}
              </p>
            </div>
          </div>
        </div>
        <div className="col-lg-5 mt-3 mt-lg-0 text-lg-end">
           <div className="d-inline-flex align-items-center gap-3 bg-white p-2 rounded-4 shadow-sm border px-3">
              <div className="text-start me-2 border-end pe-3">
                <div className="text-muted fs-11 fw-bold text-uppercase">Extraction</div>
                <div className="fw-bold text-dark fs-12">LIVE SYNC</div>
              </div>
              <select 
                className="form-select form-select-sm border-0 fw-bold text-primary fs-14" 
                style={{ minWidth: 220, boxShadow: 'none', cursor: 'pointer', background: 'transparent' }}
                value={projectId}
                onChange={handleProjectChange}
              >
                {projects.map(p => (
                  <option key={p.id || p.project_id} value={p.id || p.project_id}>{p.name}</option>
                ))}
              </select>
              <div className="position-relative">
                <button
                  className="btn btn-primary btn-sm rounded-3 px-3 fw-bold d-flex align-items-center gap-2 shadow-sm"
                  onClick={() => setShowExportMenu(v => !v)}
                  disabled={!trends.length}
                >
                  <i className="ri-download-2-line"></i> Export
                  <i className={`ri-arrow-${showExportMenu ? 'up' : 'down'}-s-line`}></i>
                </button>
                {showExportMenu && (
                  <div
                    className="position-absolute end-0 mt-1 bg-white border shadow-lg rounded-3 py-1 z-3"
                    style={{ minWidth: 160, zIndex: 9999 }}
                  >
                    <button
                      className="btn btn-sm btn-white w-100 text-start px-3 py-2 d-flex align-items-center gap-2 text-dark fw-semibold fs-13"
                      onClick={handleExportCSV}
                    >
                      <i className="ri-file-excel-2-line text-success"></i> Export CSV
                    </button>
                    <button
                      className="btn btn-sm btn-white w-100 text-start px-3 py-2 d-flex align-items-center gap-2 text-dark fw-semibold fs-13"
                      onClick={handleExportJSON}
                    >
                      <i className="ri-braces-line text-primary"></i> Export JSON
                    </button>
                    <hr className="my-1" />
                    <button
                      className="btn btn-sm btn-white w-100 text-start px-3 py-2 d-flex align-items-center gap-2 text-dark fw-semibold fs-13"
                      onClick={handleExportPDF}
                      disabled={pdfLoading}
                    >
                      {pdfLoading
                        ? <><i className="ri-loader-4-line text-danger"></i> Génération...</>
                        : <><i className="ri-file-pdf-2-line text-danger"></i> Export PDF Rapport</>
                      }
                    </button>
                  </div>
                )}
              </div>
           </div>
        </div>
      </div>

      {pageError && (
        <div className="alert alert-warning mb-4 border-0 shadow-sm d-flex align-items-center gap-3" style={{borderRadius: 12, background: "#fffbeb"}}>
          <i className="ri-error-warning-fill text-warning fs-4"></i>
          <div className="fw-medium text-warning">{pageError}</div>
        </div>
      )}

      {/*  AJOUT SENIOR : Intelligence Artificielle - Automated Insights */}
      {loading ? (
        <div className="row mb-4">
          <div className="col-md-4"><SkeletonCard height={80} /></div>
          <div className="col-md-4"><SkeletonCard height={80} /></div>
          <div className="col-md-4"><SkeletonCard height={80} /></div>
        </div>
      ) : insights.length > 0 && (
        <div className="row mb-4">
          {insights.map((insight, idx) => (
            <div key={idx} className="col-md-4">
              <div className={`card border-0 shadow-sm h-100 bg-${insight.type}-subtle`} style={{ borderRadius: 16 }}>
                <div className="card-body d-flex align-items-start gap-3 p-3">
                  <div className={`bg-${insight.type} text-white p-2 rounded-3 d-flex align-items-center justify-content-center`} style={{ width: 40, height: 40 }}>
                    <i className={`${insight.icon} fs-5`}></i>
                  </div>
                  <div>
                    <h6 className={`fw-bold mb-1 text-${insight.type}`}>{insight.title}</h6>
                    <p className="mb-0 fs-12 fw-medium text-dark-emphasis">{insight.text}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/*  AJOUT SENIOR : Bandeau de Performance Analytique */}
      {loading ? (
        <SkeletonCard height={120} />
      ) : strategicPivotData.rows.length > 0 && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card border-0 shadow-sm overflow-hidden" style={{borderRadius: 20, background: 'linear-gradient(135deg, #fff 0%, #f8fafc 100%)'}}>
              <div className="card-body p-0">
                <div className="row g-0">
                  {(() => {
                    const cols = strategicPivotData.columns;
                    const lastCol = cols[cols.length - 1];
                    const prevCol = cols.length > 1 ? cols[cols.length - 2] : null;
                    
                    const currentRows = strategicPivotData.rows.map(r => ({ 
                      name: r.entity_name, 
                      val: r.cells[lastCol] ? r.cells[lastCol][activeMetricId] : null,
                      prevVal: prevCol && r.cells[prevCol] ? r.cells[prevCol][activeMetricId] : null
                    }));
                    
                    const validRows = currentRows.filter(v => v.val != null);
                    if (validRows.length === 0) return <div className="p-4 text-center w-100 text-muted">Collecte de données en cours...</div>;
                    
                    // Calculs
                    const sorted = [...validRows].sort((a,b) => b.val - a.val);
                    const best = sorted[0];
                    const atRisk = validRows.filter(v => getMetricHealth(activeMetricId, v.val).color === "#991b1b");
                    const avgNow = validRows.reduce((acc, curr) => acc + curr.val, 0) / validRows.length;
                    const validPrevRows = currentRows.filter(v => v.prevVal != null);
                    const avgPrev = validPrevRows.length > 0 ? validPrevRows.reduce((acc, curr) => acc + curr.prevVal, 0) / validPrevRows.length : null;
                    
                    const deltaBest = getDeltaText(best.val, best.prevVal, activeMetricId);
                    const deltaAvg = getDeltaText(avgNow, avgPrev, activeMetricId);

                    return (
                      <>
                        <div className="col-md-4 border-end">
                          <div className="p-4 d-flex align-items-center gap-3">
                            <div className="p-3 bg-primary-subtle rounded-3 text-primary fs-4 d-flex align-items-center justify-content-center" style={{width: 54, height: 54}}>
                              <i className="ri-medal-2-line"></i>
                            </div>
                            <div>
                              <div className="text-muted text-uppercase fs-11 fw-bold letter-spacing-1">Top Performer</div>
                              <h4 className="mb-0 fw-800 text-primary">{best.name}</h4>
                              <small className={`fw-bold ${deltaBest.color}`}>{deltaBest.text} vs mois préc.</small>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-4 border-end">
                          <div className="p-4 d-flex align-items-center gap-3">
                            <div className="p-3 bg-warning-subtle rounded-3 text-warning fs-4 d-flex align-items-center justify-content-center" style={{width: 54, height: 54}}>
                              <i className="ri-pulse-line"></i>
                            </div>
                            <div>
                              <div className="text-muted text-uppercase fs-11 fw-bold letter-spacing-1">Moyenne Globale</div>
                              <h4 className="mb-0 fw-800 text-dark">{fmt(avgNow)}</h4>
                              <small className={`fw-bold ${deltaAvg.color}`}>{deltaAvg.text === "→ stable" ? "→ Stable" : `${deltaAvg.text} tendance`}</small>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-4">
                          <div className="p-4 d-flex align-items-center gap-3">
                            <div className="p-3 bg-danger-subtle rounded-3 text-danger fs-4 d-flex align-items-center justify-content-center" style={{width: 54, height: 54}}>
                              <i className="ri-alarm-warning-line"></i>
                            </div>
                            <div>
                              <div className="text-muted text-uppercase fs-11 fw-bold letter-spacing-1">Sites en Alerte</div>
                              <h4 className="mb-0 fw-800 text-danger">{atRisk.length}</h4>
                              <small className="text-muted fw-medium">{atRisk.length > 0 ? atRisk.map(s => s.name).join(', ') : 'Aucun site critique'}</small>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="row g-4">
        
        {/* Sidebar Filters */}
        <div className="col-lg-3">
          <div className="card border-0 shadow-sm mb-4" style={{borderRadius: 14}}>
            <div className="card-header bg-white border-bottom-0 pt-4 px-4">
              <h6 className="card-title mb-0 fw-bold text-uppercase" style={{fontSize: 10, letterSpacing: ".1em", color: "#9ca3af"}}>Métriques</h6>
            </div>
            <div className="card-body px-3 pb-4">
              <div className="d-flex flex-column gap-1">
                {METRICS_OPTIONS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setActiveMetricId(m.id)}
                    className={`btn d-flex align-items-center gap-3 p-2 text-start border-0 transition-all ${activeMetricId === m.id ? 'bg-primary text-white shadow-lg' : 'bg-transparent text-dark hover-bg-light'}`}
                    style={{borderRadius: 10, transition: "all 0.2s"}}
                  >
                    <div style={{width: 32, height: 32, borderRadius: 8, background: activeMetricId === m.id ? "rgba(255,255,255,0.2)" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: '1.1rem'}}>
                      <i className={m.icon} style={{color: activeMetricId === m.id ? "#fff" : m.color}}></i>
                    </div>
                    <span className="fw-semibold fs-13">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm" style={{borderRadius: 14}}>
            <div className="card-header bg-white border-bottom-0 pt-3 px-4 pb-0">
              <ul className="nav nav-tabs-custom rounded card-header-tabs border-bottom-0" role="tablist">
                <li className="nav-item">
                  <a className={`nav-link border-0 fs-12 text-uppercase fw-bold letter-spacing-1 ${entityType === 'site' ? 'active text-primary' : 'text-muted opacity-50'}`} 
                     onClick={(e) => { 
                       e.preventDefault(); 
                       setEntityType('site'); 
                       if (sites.length > 0) setSelectedEntityIds(sites.map(s => s.id || s.site_id));
                     }} 
                     style={{ cursor: 'pointer' }}>
                    Sites
                  </a>
                </li>
                <li className="nav-item">
                  <a className={`nav-link border-0 fs-12 text-uppercase fw-bold letter-spacing-1 ${entityType === 'group' ? 'active text-primary' : 'text-muted opacity-50'}`} 
                     onClick={(e) => { 
                       e.preventDefault(); 
                       setEntityType('group'); 
                       if (groups.length > 0) setSelectedEntityIds(groups.map(g => g.id || g.group_id));
                     }} 
                     style={{ cursor: 'pointer' }}>
                    Équipes
                  </a>
                </li>
              </ul>
            </div>
            <div className="card-body px-4 pb-4 pt-3 mt-1">
              <div className="d-flex flex-column gap-2 mt-2">
                {(entityType === 'site' ? sites : groups).length > 0 ? (
                  (entityType === 'site' ? sites : groups).map((ent, idx) => {
                    const entId = ent.id || ent.site_id;
                    const isSelected = selectedEntityIds.includes(entId);
                    return (
                      <div 
                        key={entId} 
                        className="d-flex align-items-center justify-content-between py-2 border-bottom border-light cursor-pointer"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedEntityIds(selectedEntityIds.filter(id => id !== entId));
                          } else {
                            setSelectedEntityIds([...selectedEntityIds, entId]);
                          }
                        }}
                      >
                        <div className="d-flex align-items-center gap-2">
                          <div style={{width: 8, height: 8, borderRadius: "50%", background: isSelected ? CHART_COLORS[idx % CHART_COLORS.length] : "#ced4da"}}></div>
                          <span className="fs-13 fw-semibold text-dark">{ent.name || ent.site_name}</span>
                        </div>
                        <div className="form-check form-switch mb-0">
                          <input className="form-check-input" type="checkbox" checked={isSelected} style={{cursor: 'pointer'}} readOnly />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-4 border rounded-3 bg-light-subtle">
                    <i className={entityType === 'site' ? "ri-building-line fs-1 text-muted opacity-25" : "ri-team-line fs-1 text-muted opacity-25"}></i>
                    <p className="fs-12 text-muted mt-2 px-2">Aucune donnée trouvée.</p>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-top">
                <p className="text-muted" style={{fontSize: 11, lineHeight: 1.5}}>
                  <i className="ri-information-line me-1"></i>
                  Sélectionnez plusieurs sites pour comparer leurs performances relatives au fil des mois.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Content Area */}
        <div className="col-lg-9">
          
          {/*  AJOUT SENIOR : Matrice Stratégique (Vue Manager) */}
          {loading ? (
            <SkeletonCard height={400} />
          ) : (
            <div className="card border-0 shadow-sm mb-4" style={{borderRadius: 16, overflow: "hidden"}}>
            <div className="card-header bg-white border-0 p-4 d-flex align-items-center justify-content-between">
              <div>
                <div className="d-flex align-items-center gap-2 mb-1">
                   <div className="bg-primary-subtle p-1 rounded">
                      <i className={`${activeMetric.icon} text-primary fs-5`}></i>
                   </div>
                   <h5 className="mb-0 fw-bold">Performance Matrix — {activeMetric.label}</h5>
                </div>
                <p className="text-muted mb-0 fs-12">Comparaison matricielle · Formatage conditionnel par seuils métier</p>
              </div>
              <div className="d-flex align-items-center gap-3">
                 <span className="badge bg-success-subtle text-success border-0 py-2 px-3 d-flex align-items-center gap-1" style={{borderRadius: 8}}>
                    <span style={{width:6, height:6, background:'#22c55e', borderRadius:'50%'}}></span> LIVE
                 </span>
                 <span className="badge bg-light text-dark border py-2 px-3 fw-bold" style={{borderRadius: 8}}>
                    📅 {strategicPivotData.columns.length} Périodes
                 </span>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-borderless align-middle mb-0">
                  <thead className="bg-light">
                    <tr>
                      <th className="ps-4 py-3" style={{width: 220, fontSize: 11, textTransform: "uppercase", color: "#9ca3af", letterSpacing: '.05em'}}>Site / Équipe</th>
                      {strategicPivotData.columns.map(col => (
                        <th key={col} className="text-center py-3" style={{fontSize: 11, textTransform: "uppercase", color: "#9ca3af", letterSpacing: '.05em'}}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {strategicPivotData.rows.length > 0 ? (
                      strategicPivotData.rows.map((row, idx) => {
                        const cols = strategicPivotData.columns;
                        const lastCol = cols[cols.length - 1];
                        const devCount = row.cells[lastCol]?.nb_developers || 0;

                        return (
                          <tr key={idx} className="border-bottom border-light">
                            <td className="ps-4">
                              <div className="d-flex flex-column">
                                <span className="fw-bold text-dark fs-14">{row.entity_name}</span>
                                <span className="text-muted fs-10 text-uppercase ls-1">Site / Équipe</span>
                              </div>
                            </td>
                            {cols.map((col, colIdx) => {
                              const metrics = row.cells[col];
                              const val = metrics ? metrics[activeMetricId] : null;
                              const currentDevCount = metrics?.nb_developers || 0;
                              
                              // Calcul du delta vs période précédente
                              const prevCol = colIdx > 0 ? cols[colIdx - 1] : null;
                              const prevVal = prevCol && row.cells[prevCol] ? row.cells[prevCol][activeMetricId] : null;
                              
                              const health = getMetricHealth(activeMetricId, val);
                              const delta = getDeltaText(val, prevVal, activeMetricId);

                              return (
                                <td key={col} className="text-center py-3">
                                  <div 
                                    className="d-inline-flex flex-column align-items-center justify-content-center px-3 py-2"
                                    style={{
                                      background: health.bg,
                                      color: health.color,
                                      borderRadius: 12,
                                      minWidth: 95,
                                      border: `1.5px solid ${health.border}`,
                                      transition: "all 0.2s"
                                    }}
                                  >
                                    <span className="fw-800 fs-16" style={{lineHeight: 1}}>
                                      {val != null ? (activeMetricId === 'quality_score' ? ( (val <= 1 ? val * 100 : val).toFixed(0) + '%' ) : val.toFixed(1)) : "—"}
                                    </span>
                                    <div className="d-flex align-items-center gap-2 mt-1">
                                      <small className={`fw-bold ${delta.color}`} style={{fontSize: 9, opacity: 0.9}}>
                                        {val != null ? delta.text : "N/A"}
                                      </small>
                                      {currentDevCount > 0 && (
                                        <span className="badge bg-white bg-opacity-50 text-dark border-0 px-1 py-0 fs-9 fw-bold" style={{fontSize: '8px'}}>
                                          👤{currentDevCount}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={strategicPivotData.columns.length + 1} className="text-center py-5 text-muted">
                          Sélectionnez au moins un site dans le panneau latéral.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card-footer bg-white border-0 py-3 px-4 d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-4">
                <div className="d-flex align-items-center gap-2">
                   <div style={{width: 12, height: 12, borderRadius: 3, background: "#d1fae5", border: "1.5px solid #10b981"}}></div>
                   <small className="text-muted fs-11 fw-bold">Objectif Atteint</small>
                </div>
                <div className="d-flex align-items-center gap-2">
                   <div style={{width: 12, height: 12, borderRadius: 3, background: "#fef3c7", border: "1.5px solid #f59e0b"}}></div>
                   <small className="text-muted fs-11 fw-bold">À Surveiller</small>
                </div>
                <div className="d-flex align-items-center gap-2">
                   <div style={{width: 12, height: 12, borderRadius: 3, background: "#fee2e2", border: "1.5px solid #ef4444"}}></div>
                   <small className="text-muted fs-11 fw-bold">Action Requise</small>
                </div>
              </div>
              <small className="text-muted fs-11 fw-medium fst-italic">
                 💡 Les deltas (↑↓) sont comparés à la période précédente du même site.
              </small>
            </div>
            </div>
          )}
          
          {/* Main Chart Card */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white border-0 p-4 d-flex align-items-center justify-content-between">
              <div>
                <h5 className="mb-0 fw-bold">{activeMetric.label}</h5>
                <p className="text-muted mb-0 fs-12">Évolution historique par entité sélectionnée</p>
              </div>
              <div className="btn-group">
                <button className="btn btn-sm btn-light active">Mensuel</button>
                <button className="btn btn-sm btn-light">Trimestriel</button>
              </div>
            </div>
            <div className="card-body p-4 pt-0">
              {trends.length > 0 ? (
                <div id="kpi-evolution-chart">
                  <ReactApexChart
                    options={chartOptions}
                    series={chartData.series}
                    type="area"
                    height={380}
                  />
                </div>
              ) : (
                <EmptyState
                  variant="kpi"
                  title="Donnees historiques manquantes"
                  description="Aucun snapshot archive trouve pour les entites selectionnees."
                  actionLabel="Lancer une extraction"
                  onAction={() => window.location.assign("/extraction")}
                />
              )}
            </div>
          </div>

          <div className="card border-0 shadow-sm overflow-hidden mb-4" style={{ borderRadius: 16 }}>
            <div 
              className="card-header bg-white border-0 p-4 d-flex align-items-center justify-content-between cursor-pointer" 
              onClick={() => setShowDetailedAudit(!showDetailedAudit)}
              style={{ cursor: 'pointer' }}
            >
              <div className="d-flex align-items-center gap-3">
                <div className="p-2 bg-primary-subtle rounded-3" style={{ width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ri-table-alt-line text-primary fs-5"></i>
                </div>
                <div>
                  <h6 className="mb-0 fw-bold">Détails d'Audit et Données Granulaires</h6>
                  <p className="text-muted mb-0 fs-11 fw-medium uppercase letter-spacing-1">
                    {showDetailedAudit ? "Masquer les détails pour épurer la vue" : "Cliquer pour afficher les chiffres détaillés par période"}
                  </p>
                </div>
              </div>
              <button className={`btn btn-sm ${showDetailedAudit ? 'btn-light' : 'btn-primary-subtle'} rounded-pill px-3 fw-bold border-0`}>
                <i className={`${showDetailedAudit ? 'ri-eye-off-line' : 'ri-eye-line'} me-1`}></i>
                {showDetailedAudit ? "Masquer" : "Voir Détails"}
              </button>
            </div>
            
            {showDetailedAudit && (
              <div className="card-body p-0 border-top animate__animated animate__fadeIn">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{fontFamily: "var(--sb-sans)"}}>
                  <thead>
                    <tr className="bg-light-subtle">
                      <th className="ps-4 py-3" style={{fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#6b7280", fontWeight: 700}}>Site / Équipe</th>
                      <th className="py-3" style={{fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#6b7280", fontWeight: 700}}>Période</th>
                      <th className="text-center py-3" style={{fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#6b7280", fontWeight: 700}}>Commits</th>
                      <th className="text-center py-3" style={{fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#6b7280", fontWeight: 700}}>MRs</th>
                      <th className="text-center py-3" style={{fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#6b7280", fontWeight: 700}}>Vélocité</th>
                      <th className="text-center py-3" style={{fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#6b7280", fontWeight: 700}}>Qualité</th>
                      <th className="text-center pe-4 py-3" style={{fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#6b7280", fontWeight: 700}}>Review</th>
                    </tr>
                  </thead>
                  <tbody className="border-top-0">
                    {trends.slice().reverse().map((t, idx) => (
                      <tr key={idx} style={{transition: "all 0.1s"}}>
                        <td className="ps-4">
                          <span className="fw-bold fs-13 text-dark">{t.entity_name}</span>
                        </td>
                        <td>
                          <span className="text-muted fs-12 fw-medium">{t.period_label}</span>
                        </td>
                        <td className="text-center fw-800 fs-13" style={{fontFamily: "'JetBrains Mono', monospace"}}>{t.metrics.total_commits}</td>
                        <td className="text-center fw-800 fs-13" style={{fontFamily: "'JetBrains Mono', monospace"}}>{t.metrics.total_mrs}</td>
                        <td className="text-center">
                          <span className="badge border-0 bg-primary-subtle text-primary px-2 py-1 fs-12 fw-800" style={{borderRadius: 6}}>
                            {fmt(t.metrics.velocity)}
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="d-flex align-items-center justify-content-center gap-3">
                             <div className="progress flex-grow-1" style={{height: 6, width: 70, background: "#f1f5f9", borderRadius: 10, overflow: "hidden"}}>
                               <div className="progress-bar bg-success" style={{width: `${Math.min(100, (t.metrics.quality_score || 0) * 100)}%`, borderRadius: 10}}></div>
                             </div>
                             <span className="fs-12 fw-800 text-success" style={{minWidth: 35}}>{fmt( (t.metrics.quality_score || 0) * 100, 0)}%</span>
                          </div>
                        </td>
                        <td className="text-center pe-4">
                          <span className="text-muted fs-12 fw-bold" style={{fontFamily: "'JetBrains Mono', monospace"}}>{fmt(t.metrics.review_time)}h</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

          <div className="row mt-4">
            <div className="col-12">
              <div className="card border-0 shadow-sm overflow-hidden" style={{borderRadius: 16}}>
                <div className="card-header bg-white border-0 p-4 d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-2 bg-indigo-subtle rounded-3" style={{width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "#EEF2FF"}}>
                      <i className="ri-rocket-2-line text-primary fs-4"></i>
                    </div>
                    <div>
                      <h6 className="mb-0 fw-bold fs-16">DORA Metrics</h6>
                      <p className="text-muted mb-0 fs-11 fw-medium uppercase letter-spacing-1">Standards Industriels DevOps (Google Research)</p>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                     <span className="badge bg-success-subtle text-success px-3 py-2 fs-10 fw-800" style={{borderRadius: 20, letterSpacing: '0.05em'}}>SYSTEM LIVE</span>
                  </div>
                </div>
                <div className="card-body p-4 pt-0">
                  {doraLoading ? (
                    <LoadingSpinner variant="dots" size="sm" text="Calcul des métriques DORA..." />
                  ) : doraData.length === 0 ? (
                    <EmptyState
                      variant="info"
                      size="sm"
                      title="Métriques DORA indisponibles"
                      description="Aucune donnée de déploiement détectée pour les entités sélectionnées."
                    />
                  ) : (
                    <>
                      <div className="row g-4 mb-4">
                        {doraData.map((site) => {
                          const dfColor = {Elite:"#10B981", High:"#3B82F6", Medium:"#F59E0B", Low:"#EF4444","N/A":"#94A3B8"};
                          const ltColor = {Elite:"#10B981", High:"#3B82F6", Medium:"#F59E0B", Low:"#EF4444","N/A":"#94A3B8"};
                          return (
                            <div key={site.site_id} className="col-md-4">
                              <div className="p-4 rounded-4 border border-light-subtle h-100 transition-all hover-shadow-sm" style={{background:"#FFFFFF"}}>
                                <div className="d-flex align-items-center justify-content-between mb-4 pb-2 border-bottom border-light">
                                  <h6 className="fw-bold mb-0 fs-15 text-dark">{site.site_name}</h6>
                                  <span className="text-muted fs-11 fw-bold">{site.period_label}</span>
                                </div>
                                
                                {/* Deployment Frequency */}
                                <div className="mb-4">
                                  <div className="d-flex align-items-center justify-content-between mb-2">
                                    <div className="d-flex align-items-center gap-2">
                                      <i className="ri-ship-line text-muted fs-14"></i>
                                      <span className="fs-12 fw-bold text-muted uppercase letter-spacing-1">Déploiements</span>
                                    </div>
                                    <span className="badge fw-800 px-2 py-1 fs-10" style={{background: dfColor[site.dora_df_level]+"15", color: dfColor[site.dora_df_level], borderRadius:6, border: `1px solid ${dfColor[site.dora_df_level]}33`}}>
                                      {site.dora_df_level}
                                    </span>
                                  </div>
                                  <div className="d-flex align-items-baseline gap-1">
                                    <span className="fs-2 fw-800" style={{color:"#0F172A", fontFamily: "'JetBrains Mono', monospace"}}>{site.deployment_count}</span>
                                    <span className="text-muted fs-12 fw-medium">merges/mois</span>
                                  </div>
                                </div>

                                {/* Lead Time */}
                                <div>
                                  <div className="d-flex align-items-center justify-content-between mb-2">
                                    <div className="d-flex align-items-center gap-2">
                                      <i className="ri-time-line text-muted fs-14"></i>
                                      <span className="fs-12 fw-bold text-muted uppercase letter-spacing-1">Lead Time</span>
                                    </div>
                                    <span className="badge fw-800 px-2 py-1 fs-10" style={{background: ltColor[site.dora_lt_level]+"15", color: ltColor[site.dora_lt_level], borderRadius:6, border: `1px solid ${ltColor[site.dora_lt_level]}33`}}>
                                      {site.dora_lt_level}
                                    </span>
                                  </div>
                                  <div className="d-flex align-items-baseline gap-1">
                                    <span className="fs-2 fw-800" style={{color:"#0F172A", fontFamily: "'JetBrains Mono', monospace"}}>
                                      {site.lead_time_hours > 0 ? site.lead_time_hours.toFixed(1) : "—"}
                                    </span>
                                    <span className="text-muted fs-12 fw-medium">{site.lead_time_hours > 0 ? "heures" : "N/A"}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Légende DORA — Subtle Footnote */}
                      <div className="mt-2 py-3 px-4 rounded-4 bg-light-subtle border border-light">
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <i className="ri-information-fill text-primary"></i>
                          <span className="fw-800 fs-11 text-dark uppercase letter-spacing-1">Niveaux de Performance DORA</span>
                        </div>
                        <div className="d-flex flex-wrap gap-4">
                          {[
                            {level:"Elite",  df:"> 1/jour",  lt:"< 1h",    color:"#10B981"},
                            {level:"High",   df:"1/semaine", lt:"< 24h",  color:"#3B82F6"},
                            {level:"Medium", df:"1/mois",    lt:"< 1 sem",color:"#F59E0B"},
                            {level:"Low",    df:"< 1/mois",  lt:"> 1 sem",color:"#EF4444"},
                          ].map(l => (
                            <div key={l.level} className="d-flex align-items-center gap-2">
                              <div style={{width: 6, height: 6, borderRadius: "50%", background: l.color}}></div>
                              <span className="fw-bold fs-11 text-dark">{l.level}</span>
                              <small className="text-muted fs-10" style={{opacity: 0.8}}>DF: {l.df} · LT: {l.lt}</small>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
