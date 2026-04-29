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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, d = 1) => (n == null || isNaN(+n)) ? "—" : (+n).toFixed(d);

const CHART_COLORS = ["#405189", "#0ab39c", "#299cdb", "#f7b84b", "#f06548", "#3577f1", "#6559cc", "#ffbe0b"];
const CHART_FONT = "Poppins, 'Helvetica Neue', sans-serif";

const METRICS_OPTIONS = [
  { id: "velocity",      label: "Vélocité (Commits/Dev)", icon: "ri-speed-up-line",  color: "#405189" },
  { id: "mr_rate",       label: "Livraison (MRs/Dev)",   icon: "ri-git-merge-line", color: "#0ab39c" },
  { id: "quality_score", label: "Taux d'Approbation (%)", icon: "ri-shield-check-line", color: "#299cdb" },
  { id: "review_time",   label: "Temps de Revue (h)",     icon: "ri-time-line",         color: "#f7b84b" },
];

export default function ComparativeAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = parseInt(searchParams.get("project_id")) || 1;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);

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
      }
    };
    fetchProjectsList();
  }, []);

  // 2. Initialisation réactive au changement de projectId
  useEffect(() => {
    const loadProjectData = async () => {
      if (!projectId) return;
      try {
        setLoading(true);
        const [projData, sitesData, groupsData] = await Promise.all([
          projectService.getById(projectId).catch(() => null),
          analyticsService.getAvailableSites(projectId).catch(() => []),
          developerService.getGroups().catch(() => [])
        ]);

        setProject(projData);
        setSites(sitesData);
        setGroups(groupsData);

        // AUTO-SELECT SENIOR : On sélectionne tout par défaut pour ne pas laisser l'écran vide
        if (sitesData.length > 0) {
          setSelectedEntityIds(sitesData.map(s => s.id || s.site_id));
        }
      } catch (err) {
        console.error("Erreur loadProjectData:", err);
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
        const data = await analyticsService.getComparativeTrends(projectId, {
          siteIds: entityType === "site" ? selectedEntityIds : [],
          groupIds: entityType === "group" ? selectedEntityIds : [],
        });
        setTrends(data);
      } catch (err) {
        console.error("Erreur fetchTrends:", err);
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
      } finally {
        setDoraLoading(false);
      }
    };
    fetchDora();
  }, [projectId]);

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

  // ✅ AJOUT SENIOR : Logique de pivot pour la Matrice Stratégique
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

  // ✅ AJOUT SENIOR : Helper pour le formatage conditionnel (Heatmap)
  const getMetricHealth = (metricId, value) => {
    if (value == null) return { color: "#6c757d", bg: "#f8f9fa", label: "N/A" };
    
    const thresholds = {
      velocity:      { low: 3.0,  high: 5.0,  reverse: false },
      mr_rate:       { low: 1.0,  high: 2.0,  reverse: false },
      quality_score: { low: 0.70, high: 0.90, reverse: false },
      review_time:   { low: 24.0, high: 48.0, reverse: true  }, // Inversé : plus c'est haut, plus c'est "mauvais"
    };

    const t = thresholds[metricId] || { low: 0, high: 0, reverse: false };
    
    let status = "medium";
    if (t.reverse) {
      if (value <= t.low) status = "good";
      else if (value > t.high) status = "bad";
    } else {
      if (value >= t.high) status = "good";
      else if (value < t.low) status = "bad";
    }

    const map = {
      good:   { color: "#0ab39c", bg: "#daf4f0", icon: "ri-checkbox-circle-fill" },
      medium: { color: "#f7b84b", bg: "#fef4e4", icon: "ri-error-warning-fill" },
      bad:    { color: "#f06548", bg: "#fdeced", icon: "ri-close-circle-fill" }
    };

    return map[status];
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
    }
  };

  const activeMetric = METRICS_OPTIONS.find(m => m.id === activeMetricId);

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="mt-2 text-muted">Initialisation de l'analyse stratégique...</p>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container-fluid" style={{background: "#f3f3f9", minHeight: "100vh", paddingTop: "24px", paddingBottom: "24px"}}>
      
      {/* Header avec Sélecteur de Projet */}
      <div className="row mb-4 align-items-center">
        <div className="col-sm">
          <div>
            <h4 className="fw-bold mb-1" style={{color: "#495057"}}>Analyse Stratégique Comparative</h4>
            <p className="text-muted mb-0 fs-13">Pilotage de la performance multi-sites et multi-projets.</p>
          </div>
        </div>
        <div className="col-sm-auto mt-3 mt-sm-0">
          <div className="d-flex align-items-center gap-3 bg-white p-2 rounded-3 shadow-sm border">
            <div className="d-flex align-items-center gap-2 px-2 border-end">
              <i className="ri-folders-line text-primary fs-5"></i>
              <span className="text-muted fs-12 fw-medium">PROJET :</span>
            </div>
            <select 
              className="form-select form-select-sm border-0 fw-bold text-primary" 
              style={{ minWidth: 200, boxShadow: 'none', cursor: 'pointer' }}
              value={projectId}
              onChange={handleProjectChange}
            >
              <option value="" disabled>Choisir un projet...</option>
              {projects.map(p => (
                <option key={p.id || p.project_id} value={p.id || p.project_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ✅ AJOUT SENIOR : Bandeau d'Insights Stratégiques Expert */}
      {!loading && strategicPivotData.rows.length > 0 && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card border-0 shadow-sm overflow-hidden" style={{borderRadius: 16}}>
              <div className="card-body p-0 d-flex">
                <div className="bg-primary p-4 d-flex align-items-center justify-content-center" style={{width: 100}}>
                   <i className="ri-shield-flash-line text-white fs-1 shadow-sm"></i>
                </div>
                <div className="p-4 flex-grow-1" style={{background: "linear-gradient(to right, #ffffff, #fcfdfe)"}}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span className="badge bg-primary-subtle text-primary text-uppercase px-2" style={{fontSize: 10, letterSpacing: 1}}>Intelligence Engine v2.0</span>
                    <h6 className="fw-bold mb-0" style={{color: "#495057"}}>Analyse de Pilotage : {activeMetric.label}</h6>
                  </div>
                  
                  <div className="row align-items-center">
                    <div className="col-lg-9">
                      <div className="mb-0 text-muted fs-13" style={{lineHeight: 1.6}}>
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
                          if (validRows.length === 0) return "Collecte de données en cours pour la période finale.";
                          
                          // 1. Détection des leaders et des risques
                          const sorted = [...validRows].sort((a,b) => b.val - a.val);
                          const best = sorted[0];
                          const atRisk = validRows.filter(v => {
                            const health = getMetricHealth(activeMetricId, v.val);
                            return health.color === "#f06548"; // Rouge/Bad
                          });

                          // 2. Calcul de la tendance globale
                          const avgNow = validRows.reduce((acc, curr) => acc + curr.val, 0) / validRows.length;
                          const validPrevRows = currentRows.filter(v => v.prevVal != null);
                          const avgPrev = validPrevRows.length > 0 ? validPrevRows.reduce((acc, curr) => acc + curr.prevVal, 0) / validPrevRows.length : null;
                          
                          let trendText = "";
                          if (avgPrev !== null) {
                            const diff = ((avgNow - avgPrev) / avgPrev) * 100;
                            const isPositive = activeMetricId === 'review_time' ? diff < 0 : diff > 0;
                            trendText = `La tendance globale est en ${isPositive ? 'progression' : 'repli'} de **${Math.abs(diff).toFixed(1)}%**. `;
                          }

                          let insight = `**Top Performance :** Le site de **${best.name}** domine la métrique sur ${lastCol}. ${trendText}`;
                          
                          if (atRisk.length > 0) {
                            insight += `<br/><span class="text-danger">⚠️ **Alerte Critique :** ${atRisk.length} site(s) (${atRisk.map(s => s.name).join(', ')}) sous-performent significativement. Une revue opérationnelle est recommandée pour identifier d'éventuels bloqueurs.</span>`;
                          } else {
                            insight += `<br/><span class="text-success">✅ **Stabilité :** Tous les sites sélectionnés maintiennent un niveau de santé opérationnelle satisfaisant.</span>`;
                          }
                          
                          return <div dangerouslySetInnerHTML={{ __html: insight }} />;
                        })()}
                      </div>
                    </div>
                    <div className="col-lg-3 text-lg-end mt-3 mt-lg-0">
                       <button className="btn btn-outline-primary btn-sm rounded-pill px-3">
                          Détails des recommandations
                       </button>
                    </div>
                  </div>
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
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4">
              <h6 className="card-title mb-0 fw-bold text-uppercase" style={{fontSize: 11, letterSpacing: ".05em", color: "#878a99"}}>Sélecteur de Métriques</h6>
            </div>
            <div className="card-body px-4 pb-4">
              <div className="d-flex flex-column gap-2">
                {METRICS_OPTIONS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setActiveMetricId(m.id)}
                    className={`btn d-flex align-items-center gap-3 p-3 text-start border-0 transition-all ${activeMetricId === m.id ? 'bg-primary text-white shadow' : 'bg-light text-dark'}`}
                    style={{borderRadius: 12, transition: "all 0.2s"}}
                  >
                    <div style={{width: 32, height: 32, borderRadius: 8, background: activeMetricId === m.id ? "rgba(255,255,255,0.2)" : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0}}>
                      <i className={`${m.icon} ${activeMetricId === m.id ? 'text-white' : ''}`} style={{color: activeMetricId === m.id ? "#fff" : m.color}}></i>
                    </div>
                    <span className="fw-semibold fs-13">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white border-bottom-0 pt-3 px-4 pb-0">
              <ul className="nav nav-tabs-custom rounded card-header-tabs border-bottom-0" role="tablist">
                <li className="nav-item">
                  <a className={`nav-link ${entityType === 'site' ? 'active fw-semibold' : 'text-muted'}`} 
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
                  <a className={`nav-link ${entityType === 'group' ? 'active fw-semibold' : 'text-muted'}`} 
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
                  (entityType === 'site' ? sites : groups).map(ent => {
                    const entId = ent.id || ent.site_id;
                    const isSelected = selectedEntityIds.includes(entId);
                    return (
                      <div 
                        key={entId} 
                        className="d-flex align-items-center justify-content-between p-2 rounded-3 hover-bg-light cursor-pointer"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedEntityIds(selectedEntityIds.filter(id => id !== entId));
                          } else {
                            setSelectedEntityIds([...selectedEntityIds, entId]);
                          }
                        }}
                        style={{background: isSelected ? "#f8f9fc" : "transparent"}}
                      >
                        <div className="d-flex align-items-center gap-2">
                          <div style={{width: 8, height: 8, borderRadius: "50%", background: isSelected ? CHART_COLORS[selectedEntityIds.indexOf(entId) % CHART_COLORS.length] : "#ced4da"}}></div>
                          <span className="fs-13 fw-medium">{ent.name || ent.site_name}</span>
                        </div>
                        <div className="form-check form-switch mb-0">
                          <input className="form-check-input" type="checkbox" checked={isSelected} readOnly />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-4 border rounded-3 bg-light-subtle">
                    <i className={entityType === 'site' ? "ri-building-line fs-1 text-muted opacity-25" : "ri-team-line fs-1 text-muted opacity-25"}></i>
                    <p className="fs-12 text-muted mt-2 px-2">Aucune donnée trouvée pour ce filtre.</p>
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
          
          {/* ✅ AJOUT SENIOR : Matrice Stratégique (Vue Manager) */}
          <div className="card border-0 shadow-sm mb-4" style={{borderRadius: 16, overflow: "hidden"}}>
            <div className="card-header bg-white border-0 p-4 d-flex align-items-center justify-content-between">
              <div>
                <div className="d-flex align-items-center gap-2 mb-1">
                   <div className="bg-primary-subtle p-1 rounded">
                      <i className={`${activeMetric.icon} text-primary fs-5`}></i>
                   </div>
                   <h5 className="mb-0 fw-bold">Performance Matrix : {activeMetric.label}</h5>
                </div>
                <p className="text-muted mb-0 fs-12">Comparaison matricielle entre sites et périodes (Formatage Conditionnel)</p>
              </div>
              <div className="text-end">
                 <span className="badge bg-light text-dark border py-2 px-3" style={{borderRadius: 8}}>
                    <i className="ri-calendar-event-line me-1"></i> {strategicPivotData.columns.length} Périodes
                 </span>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-bordered align-middle mb-0" style={{borderColor: "#f1f1f1"}}>
                  <thead>
                    <tr className="bg-light">
                      <th className="ps-4 py-3" style={{width: 200, fontSize: 11, textTransform: "uppercase", color: "#878a99"}}>Site / Équipe</th>
                      {strategicPivotData.columns.map(col => (
                        <th key={col} className="text-center py-3" style={{fontSize: 11, textTransform: "uppercase", color: "#878a99"}}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {strategicPivotData.rows.length > 0 ? (
                      strategicPivotData.rows.map((row, idx) => {
                        const lastCol = strategicPivotData.columns[strategicPivotData.columns.length - 1];
                        const devCount = row.cells[lastCol]?.nb_developers || 0;

                        return (
                          <tr key={idx}>
                            <td className="ps-4 fw-bold text-dark fs-13" style={{background: "#fafbfd"}}>
                              <div className="d-flex flex-column">
                                <span>{row.entity_name}</span>
                                <span className="text-muted fw-normal" style={{fontSize: 10}}>
                                  <i className="ri-user-settings-line me-1"></i>
                                  {devCount} dév.
                                </span>
                              </div>
                            </td>
                            {strategicPivotData.columns.map(col => {
                              const metrics = row.cells[col];
                              const val = metrics ? metrics[activeMetricId] : null;
                              const health = getMetricHealth(activeMetricId, val);
                              return (
                                <td key={col} className="text-center p-0" style={{height: 60}}>
                                  <div 
                                    className="d-flex flex-column align-items-center justify-content-center h-100 w-100"
                                    style={{
                                      background: health.bg,
                                      color: health.color,
                                      borderLeft: `4px solid ${health.color}`,
                                      transition: "all 0.3s"
                                    }}
                                  >
                                    <div className="d-flex align-items-center gap-1">
                                       <i className={health.icon} style={{fontSize: 14}}></i>
                                       <span className="fw-bold fs-15">
                                         {val != null ? (activeMetricId === 'quality_score' ? (val * 100).toFixed(0) + '%' : val.toFixed(1)) : "—"}
                                       </span>
                                    </div>
                                    <small style={{fontSize: 9, opacity: 0.8, textTransform: "uppercase", fontWeight: 700}}>
                                      {val != null ? health.label : "Pas de data"}
                                    </small>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={strategicPivotData.columns.length + 1} className="text-center py-5 text-muted italic">
                          Sélectionnez au moins un site dans le panneau latéral pour générer la matrice.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card-footer bg-white border-0 py-3 px-4">
              <div className="d-flex align-items-center gap-4">
                <div className="d-flex align-items-center gap-2">
                   <div style={{width: 12, height: 12, borderRadius: 3, background: "#0ab39c"}}></div>
                   <small className="text-muted fs-11">Objectif Atteint</small>
                </div>
                <div className="d-flex align-items-center gap-2">
                   <div style={{width: 12, height: 12, borderRadius: 3, background: "#f7b84b"}}></div>
                   <small className="text-muted fs-11">À Surveiller</small>
                </div>
                <div className="d-flex align-items-center gap-2">
                   <div style={{width: 12, height: 12, borderRadius: 3, background: "#f06548"}}></div>
                   <small className="text-muted fs-11">Action Requise</small>
                </div>
              </div>
            </div>
          </div>
          
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
                <ReactApexChart 
                  options={chartOptions} 
                  series={chartData.series} 
                  type="area" 
                  height={380} 
                />
              ) : (
                <div className="py-5 text-center">
                   <div className="avatar-lg bg-light-subtle rounded-circle mx-auto d-flex align-items-center justify-content-center" style={{width: 80, height: 80}}>
                     <i className="ri-database-2-line fs-1 text-muted" style={{opacity: 0.3}}></i>
                   </div>
                   <h6 className="mt-4 fw-bold">Données Historiques Manquantes</h6>
                   <p className="text-muted mx-auto" style={{maxWidth: 400}}>
                     Nous n'avons trouvé aucun snapshot archivé pour les sites sélectionnés dans ce projet.
                   </p>
                   <div className="mt-3 d-flex justify-content-center gap-2">
                     <Link to="/extraction" className="btn btn-primary btn-sm px-4">Lancer une extraction</Link>
                     <button onClick={() => window.location.reload()} className="btn btn-outline-secondary btn-sm"><i className="ri-refresh-line"></i></button>
                   </div>
                </div>
              )}
            </div>

          </div>

          {/* Table Comparison View */}
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white border-0 p-4 d-flex align-items-center gap-2">
              <div className="p-2 bg-light rounded-circle" style={{width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center"}}>
                <i className="ri-table-line text-primary"></i>
              </div>
              <h6 className="mb-0 fw-bold">Détails Comparatifs par Période</h6>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-4" style={{fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em"}}>Site / Équipe</th>
                      <th style={{fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em"}}>Période</th>
                      <th className="text-center" style={{fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em"}}>Commits Totaux</th>
                      <th className="text-center" style={{fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em"}}>MRs Créées</th>
                      <th className="text-center" style={{fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em"}}>Vélocité</th>
                      <th className="text-center" style={{fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em"}}>Qualité (%)</th>
                      <th className="text-center pe-4" style={{fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em"}}>Review (h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.slice().reverse().map((t, idx) => (
                      <tr key={idx}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-bold fs-13">{t.entity_name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="text-muted fs-13">{t.period_label}</span>
                        </td>
                        <td className="text-center fw-medium">{t.metrics.total_commits}</td>
                        <td className="text-center fw-medium">{t.metrics.total_mrs}</td>
                        <td className="text-center">
                          <span className="badge bg-primary-subtle text-primary">{fmt(t.metrics.velocity)}</span>
                        </td>
                        <td className="text-center">
                          <div className="d-flex align-items-center justify-content-center gap-2">
                             <div className="progress flex-grow-1" style={{height: 4, width: 60, minWidth: 60}}>
                               <div className="progress-bar bg-success" style={{width: `${Math.min(100, (t.metrics.quality_score || 0) * 100)}%`}}></div>
                             </div>
                             <span className="fs-12 fw-bold text-success">{fmt( (t.metrics.quality_score || 0) * 100, 0)}%</span>
                          </div>
                        </td>
                        <td className="text-center pe-4">
                          <span className="text-muted fs-13">{fmt(t.metrics.review_time)}h</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* DORA INSIGHTS — Live Data */}
          <div className="row mt-4">
            <div className="col-12">
              <div className="card border-0 shadow-sm" style={{borderRadius: 16, overflow:"hidden"}}>
                <div className="card-header border-0 p-4" style={{background:"linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)"}}>
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-3">
                      <div className="p-2 bg-white bg-opacity-10 rounded-circle">
                        <i className="ri-rocket-line text-white fs-5"></i>
                      </div>
                      <div>
                        <h6 className="text-white mb-0 fw-bold">DORA Metrics</h6>
                        <small className="text-white-50">Google Research Standard · Deployment Frequency &amp; Lead Time</small>
                      </div>
                    </div>
                    <span className="badge bg-warning text-dark fw-bold px-3 py-1" style={{borderRadius:20}}>LIVE</span>
                  </div>
                </div>
                <div className="card-body p-4">
                  {doraLoading ? (
                    <div className="text-center py-4">
                      <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                      <p className="text-muted mt-2 mb-0 fs-13">Calcul des métriques DORA…</p>
                    </div>
                  ) : doraData.length === 0 ? (
                    <div className="text-center py-4">
                      <i className="ri-information-line text-muted fs-2"></i>
                      <p className="text-muted mt-2 mb-0 fs-13">
                        MRs merged sur la branche principale non trouvées pour ce projet.<br/>
                        Lancez une extraction pour alimenter ces métriques.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="row g-3 mb-4">
                        {doraData.map((site) => {
                          const dfColor = {Elite:"#22c55e", High:"#3b82f6", Medium:"#f59e0b", Low:"#ef4444","N/A":"#9ca3af"};
                          const ltColor = {Elite:"#22c55e", High:"#3b82f6", Medium:"#f59e0b", Low:"#ef4444","N/A":"#9ca3af"};
                          return (
                            <div key={site.site_id} className="col-md-4">
                              <div className="p-4 rounded-3 border h-100" style={{background:"#f8fafc"}}>
                                <div className="d-flex align-items-center justify-content-between mb-3">
                                  <h6 className="fw-bold mb-0">{site.site_name}</h6>
                                  <small className="text-muted">{site.period_label}</small>
                                </div>
                                {/* Deployment Frequency */}
                                <div className="mb-3">
                                  <div className="d-flex align-items-center justify-content-between mb-1">
                                    <span className="fs-12 text-muted">🚀 Déploiements</span>
                                    <span className="badge fw-bold px-2 py-1" style={{background: dfColor[site.dora_df_level]+"22", color: dfColor[site.dora_df_level], borderRadius:8}}
                                    >{site.dora_df_level}</span>
                                  </div>
                                  <div className="d-flex align-items-baseline gap-2">
                                    <span className="fs-3 fw-bold" style={{color:"#1e3a5f"}}>{site.deployment_count}</span>
                                    <span className="text-muted fs-13">merges / mois</span>
                                  </div>
                                </div>
                                <hr className="my-2"/>
                                {/* Lead Time */}
                                <div>
                                  <div className="d-flex align-items-center justify-content-between mb-1">
                                    <span className="fs-12 text-muted">⏱ Lead Time</span>
                                    <span className="badge fw-bold px-2 py-1" style={{background: ltColor[site.dora_lt_level]+"22", color: ltColor[site.dora_lt_level], borderRadius:8}}
                                    >{site.dora_lt_level}</span>
                                  </div>
                                  <div className="d-flex align-items-baseline gap-2">
                                    <span className="fs-3 fw-bold" style={{color:"#1e3a5f"}}>
                                      {site.lead_time_hours > 0 ? site.lead_time_hours.toFixed(1) : "—"}
                                    </span>
                                    <span className="text-muted fs-13">{site.lead_time_hours > 0 ? "heures" : "pas de données"}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Légende DORA */}
                      <div className="p-3 rounded-3" style={{background:"#f0f4ff", border:"1px solid #c7d2fe"}}>
                        <p className="mb-1 fw-bold fs-12 text-primary">📊 Niveaux de Performance DORA (Standard Google)</p>
                        <div className="d-flex flex-wrap gap-3">
                          {[
                            {level:"Elite",  df:"> 1/jour",  lt:"< 1h",    color:"#22c55e"},
                            {level:"High",   df:"1/semaine", lt:"< 24h",  color:"#3b82f6"},
                            {level:"Medium", df:"1/mois",    lt:"< 1 sem",color:"#f59e0b"},
                            {level:"Low",    df:"< 1/mois",  lt:"> 1 sem",color:"#ef4444"},
                          ].map(l => (
                            <div key={l.level} className="d-flex align-items-center gap-2">
                              <span className="badge px-2 py-1 fw-bold" style={{background:l.color+"22",color:l.color,borderRadius:6}}>{l.level}</span>
                              <small className="text-muted">DF: {l.df} · LT: {l.lt}</small>
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
