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
  const initialProjectId = parseInt(searchParams.get("project_id")) || 1;
  const [projectId, setProjectId] = useState(initialProjectId);

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);

  // States de sélection
  const [activeMetricId, setActiveMetricId] = useState("velocity");
  const [entityType, setEntityType] = useState("site"); // "site" | "group"
  const [selectedEntityIds, setSelectedEntityIds] = useState([]);

  // Données de tendance
  const [trends, setTrends] = useState([]);

  // 1. Initialisation : Chargement des ressources
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        // On charge d'abord la liste de tous les projets
        const allProjs = await projectService.getAll().catch(() => []);
        
        let validProjectId = projectId;
        let projData = null;

        try {
          projData = await projectService.getById(validProjectId);
        } catch (err) {
          // Si le projet (ex: ID 1) n'existe plus en base (suite à un reset), on prend le premier disponible
          if (allProjs && allProjs.length > 0) {
            validProjectId = allProjs[0].id;
            projData = await projectService.getById(validProjectId);
            setProjectId(validProjectId);
          }
        }

        const [sitesData, groupsData] = await Promise.all([
          analyticsService.getAvailableSites(validProjectId).catch(() => []),
          developerService.getGroups().catch(() => [])
        ]);

        setProject(projData);
        setSites(sitesData);
        setGroups(groupsData);
        setProjectsList(allProjs);

        // Si on a des sites, on sélectionne par défaut les deux premiers pour la comparaison
        if (sitesData.length > 0) {
          setSelectedEntityIds(sitesData.slice(0, 2).map(s => s.id || s.site_id));
        }
      } catch (err) {
        console.error("Erreur init ComparativeAnalyticsPage:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [projectId]);

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

  // 3. Transformation des données pour ApexCharts
  const chartData = useMemo(() => {
    if (!trends.length) return { series: [], categories: [] };

    // Extraire les périodes uniques (ordonnées)
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
      
      {/* Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex align-items-center justify-content-between">
            <div>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb mb-1" style={{fontSize: 12}}>
                  <li className="breadcrumb-item"><Link to="/">Dashboard</Link></li>
                  <li className="breadcrumb-item active">Pilotage Analyst</li>
                </ol>
              </nav>
              <h4 className="mb-0 fw-bold" style={{color: "#495057"}}>Analyse de Pilotage Stratégique</h4>
            </div>
            <div className="d-flex gap-2 align-items-center">
               <div className="input-group input-group-sm shadow-sm" style={{width: 250}}>
                 <span className="input-group-text bg-white border-end-0 text-primary">
                   <i className="ri-building-line"></i>
                 </span>
                 <select 
                   className="form-select border-start-0 fw-bold text-primary bg-primary-subtle" 
                   value={projectId}
                   onChange={(e) => {
                      const newId = parseInt(e.target.value);
                      setProjectId(newId);
                      setSearchParams({ project_id: newId });
                   }}
                 >
                   {projectsList.map(p => (
                     <option key={p.id} value={p.id}>{p.name}</option>
                   ))}
                 </select>
               </div>
               <button className="btn btn-white btn-sm shadow-sm border">
                 <i className="ri-download-2-line me-1"></i> Export PDF
               </button>
            </div>
          </div>
        </div>
      </div>

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
                     onClick={(e) => { e.preventDefault(); setEntityType('site'); setSelectedEntityIds([]); }} 
                     style={{ cursor: 'pointer' }}>
                    Sites
                  </a>
                </li>
                <li className="nav-item">
                  <a className={`nav-link ${entityType === 'group' ? 'active fw-semibold' : 'text-muted'}`} 
                     onClick={(e) => { e.preventDefault(); setEntityType('group'); setSelectedEntityIds([]); }} 
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

          {/* DORA Preview Card (Senior Strategy) */}
          <div className="row mt-4">
            <div className="col-12">
               <div className="alert alert-info border-0 shadow-sm d-flex align-items-center p-4" style={{borderRadius: 16, background: "linear-gradient(135deg, #e0e7ff 0%, #f1f5f9 100%)"}}>
                  <div className="me-4 d-none d-md-block">
                     <i className="ri-lightbulb-flash-line fs-2 text-primary"></i>
                  </div>
                  <div className="flex-grow-1">
                     <h6 className="fw-bold text-primary mb-1">PROJET DE CLASSE INTERNATIONALE : Intégration DORA Metrics</h6>
                     <p className="mb-0 fs-13 text-primary-emphasis opacity-75">
                        En tant que Senior Analyst, je préparerai les prochains snapshots pour inclure la <b>Fréquence de Déploiement</b> et le <b>Lead Time for Changes</b>. 
                        C’est le standard ultime pour évaluer la maturité DevOps de vos sites Tunis et France.
                     </p>
                  </div>
                  <button className="btn btn-primary shadow-sm btn-sm px-4">Projeté V4</button>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
