import { useState, useEffect, useCallback, useMemo } from "react";
import Chart from "react-apexcharts";
import analyticsService from "../services/analyticsService";
import LoadingSpinner from "../components/common/LoadingSpinner";

export default function SiteMatrixTab({ projects, activeProject, setActiveProject }) {
  const [loading, setLoading] = useState(true);
  const [multiPeriodData, setMultiPeriodData] = useState([]);
  const [compareData, setCompareData] = useState([]);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    // Si aucun projet n'est sélectionné, on prend le premier
    const pId = activeProject?.id || (projects.length > 0 ? projects[0].id : null);
    if (!pId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [tableData, compare] = await Promise.all([
        analyticsService.getMultiPeriod(pId, { months: 4 }).catch(() => []),
        analyticsService.compareSites(pId).catch(() => [])
      ]);
      setMultiPeriodData(Array.isArray(tableData) ? tableData : []);
      setCompareData(Array.isArray(compare) ? compare : []);
    } catch (e) {
      setError("Impossible de charger les analyses inter-sites.");
    } finally {
      setLoading(false);
    }
  }, [activeProject, projects]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Options pour le Chart Radar (Taux d'Approbation et Taux de Fusion)
  const radarChartOptions = useMemo(() => {
    const sites = compareData.map(s => s.site_name || "Inconnu");
    const approved = compareData.map(s => Math.round((s.approved_mr_rate || 0) * 100));
    const merged = compareData.map(s => Math.round((s.merged_mr_rate || 0) * 100));

    return {
      series: [
        { name: "Taux Approbation (%)", data: approved.length ? approved : [0] },
        { name: "Taux Fusion (%)", data: merged.length ? merged : [0] }
      ],
      options: {
        chart: { type: "radar", toolbar: { show: false }, background: "transparent" },
        labels: sites.length ? sites : ["Aucun"],
        stroke: { width: 2 },
        fill: { opacity: 0.2 },
        markers: { size: 4, hover: { size: 7 } },
        colors: ["#3b82f6", "#10b981"],
        yaxis: { max: 100, min: 0, tickAmount: 4 },
        legend: { position: "bottom", fontFamily: "Inter" }
      }
    };
  }, [compareData]);

  // Options pour le Chart Bar (Commits vs MRs par Site)
  const barChartOptions = useMemo(() => {
    const sites = compareData.map(s => s.site_name || "Inconnu");
    const commits = compareData.map(s => s.nb_commits_per_project || 0);

    return {
      series: [{ name: "Total Commits (Mois sélectionné)", data: commits.length ? commits : [0] }],
      options: {
        chart: { type: "bar", toolbar: { show: false }, background: "transparent" },
        plotOptions: {
          bar: { borderRadius: 4, horizontal: false, columnWidth: "45%" }
        },
        dataLabels: { enabled: false },
        xaxis: { categories: sites.length ? sites : ["Aucun"], axisBorder: { show: false }, axisTicks: { show: false } },
        colors: ["#6366f1"],
        grid: { strokeDashArray: 4, yaxis: { lines: { show: true } } },
        legend: { position: "top" }
      }
    };
  }, [compareData]);

  if (loading) {
    return (
      <div className="card border-0 shadow-sm rounded-4" style={{ minHeight: 400 }}>
        <div className="card-body d-flex align-items-center justify-content-center">
          <LoadingSpinner text="Analyse des performances inter-sites..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-warning d-flex align-items-center gap-3">
        <i className="ri-information-line fs-3 text-warning"></i>
        <span>{error}</span>
      </div>
    );
  }

  // Dernière période pour la matrice d'écart
  const latestPeriod = multiPeriodData[0];
  const previousPeriod = multiPeriodData[1];

  return (
    <div className="matrix-tab-container">
      {/* ── Filtre de Projet ── */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
        <div className="card-body d-flex flex-wrap align-items-center gap-3 py-3">
          <div className="d-flex align-items-center gap-2">
            <div className="avatar-xs bg-primary bg-opacity-10 text-primary rounded-3 d-flex align-items-center justify-content-center">
              <i className="ri-folder-2-line fs-14"></i>
            </div>
            <span className="fw-semibold text-muted text-uppercase fs-12" style={{ letterSpacing: "0.5px" }}>Projet Analysé</span>
          </div>
          <select 
            className="form-select border-light bg-light w-auto custom-shadow-sm"
            value={activeProject?.id || ""} 
            onChange={e => setActiveProject(projects.find(p => p.id === parseInt(e.target.value)) || null)}
          >
            <option value="">Vision Globale (Tous les projets)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="ms-auto fs-12 text-muted fw-semibold">
            {compareData.length} sites opérationnels analysés
          </span>
        </div>
      </div>

      <div className="row g-4 mb-4">
        {/* ── Radar: Qualité et Process ── */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm rounded-4 h-100 hover-lift-subtle">
            <div className="card-header bg-white border-bottom-0 pt-4 pb-0">
              <h5 className="card-title mb-0 fw-bold d-flex align-items-center gap-2 text-dark">
                <i className="ri-radar-line text-info"></i> Taux d'Adoption Qualité
              </h5>
              <p className="text-muted fs-12 mt-1 mb-0">Comparaison des taux d'approbation et fusion (Merge Requests)</p>
            </div>
            <div className="card-body d-flex justify-content-center p-0 pt-2 pb-3">
              <Chart options={radarChartOptions.options} series={radarChartOptions.series} type="radar" height="280" />
            </div>
          </div>
        </div>

        {/* ── Bar: Vélocité de Production ── */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm rounded-4 h-100 hover-lift-subtle">
            <div className="card-header bg-white border-bottom-0 pt-4 pb-0">
              <h5 className="card-title mb-0 fw-bold d-flex align-items-center gap-2 text-dark">
                <i className="ri-bar-chart-2-fill text-primary"></i> Vélocité de Production
              </h5>
              <p className="text-muted fs-12 mt-1 mb-0">Volume total de commits par site sur la période actuelle</p>
            </div>
            <div className="card-body pb-0">
              <Chart options={barChartOptions.options} series={barChartOptions.series} type="bar" height="260" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Matrice Croisée d'Évaluation ── */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4 hover-lift-subtle">
        <div className="card-header bg-white border-bottom py-3 d-flex align-items-center justify-content-between">
          <div>
            <h5 className="card-title mb-0 fw-bold d-flex align-items-center gap-2 text-dark">
              <i className="ri-layout-grid-fill text-success"></i> Matrice d'Évaluation Managériale
            </h5>
            <p className="text-muted fs-12 mt-1 mb-0">Comparaison détaillée inter-sites avec évolution MoM (Month-over-Month)</p>
          </div>
          <button className="btn btn-sm btn-soft-secondary" onClick={loadData}>
            <i className="ri-refresh-line me-1"></i>Actualiser
          </button>
        </div>
        <div className="card-body p-0">
          {compareData.length === 0 ? (
             <div className="p-5 text-center text-muted">
               <i className="ri-map-pin-time-line fs-1 opacity-50 mb-3 d-block"/>
               Aucune donnée KPI n'a été trouvée pour ce projet. Veuillez lancer une Extraction Monthly d'abord.
             </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover table-nowrap align-middle mb-0">
                <thead className="table-light text-muted fs-11 text-uppercase fw-semibold" style={{ letterSpacing: "0.5px" }}>
                  <tr>
                    <th className="ps-4">Site Opérationnel</th>
                    <th className="text-center">Effectif Actif</th>
                    <th className="text-center">Score Global</th>
                    <th className="text-center">Tps Revue (h)</th>
                    <th className="text-center">Commits</th>
                    {multiPeriodData.slice(0, 3).map((m, i) => (
                      <th key={m.period_id || i} className="text-center" style={{ minWidth: 100 }}>
                        MR Rate <br/><span className="text-dark fw-bold" style={{ fontSize: "9px" }}>{m.period_label || m.month}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareData.map((site) => {
                    const sLatest = latestPeriod?.snapshots?.find(s => s.site_id === site.site_id) || site;
                    const sPrev = previousPeriod?.snapshots?.find(s => s.site_id === site.site_id);
                    
                    const score = Math.round((site.approved_mr_rate || 0) * 80 + (site.nb_commits_per_project > 0 ? 20 : 0));
                    const prevScore = Math.round((sPrev?.approved_mr_rate || 0) * 80 + (sPrev?.nb_commits_per_project > 0 ? 20 : 0));
                    const scoreDelta = sPrev ? score - prevScore : 0;

                    return (
                      <tr key={site.site_id}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-3">
                            <div className="avatar-xs rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center fw-bold fs-12">
                              {site.site_name?.[0]?.toUpperCase() || "?"}
                            </div>
                            <span className="fw-bold text-dark">{site.site_name || "Inconnu"}</span>
                          </div>
                        </td>
                        <td className="text-center fs-13">
                          <span className="badge bg-light text-dark border px-2 py-1">
                            <i className="ri-group-line me-1 text-muted"></i>{site.nb_developers || 0}
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="d-flex align-items-center justify-content-center gap-2">
                            <div className="progress flex-grow-1 shadow-none" style={{ height: 6, borderRadius: 3, maxWidth: 60, backgroundColor: "#f3f4f6" }}>
                               <div className={`progress-bar ${score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-danger"}`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
                            </div>
                            <span className="fw-bold fs-12">{score}</span>
                            {scoreDelta !== 0 && (
                               <span style={{ fontSize: 10, color: scoreDelta > 0 ? "var(--bs-success)" : "var(--bs-danger)", fontWeight: 500 }}>
                                 {scoreDelta > 0 ? "▲" : "▼"}{Math.abs(scoreDelta)}
                               </span>
                            )}
                          </div>
                        </td>
                        <td className="text-center fw-medium text-dark fs-13">
                          {site.avg_review_time_hours != null ? site.avg_review_time_hours.toFixed(1) : "—"} h
                        </td>
                        <td className="text-center fw-bold text-info fs-13">
                          {site.nb_commits_per_project || 0}
                        </td>
                        {multiPeriodData.slice(0, 3).map((m, i) => {
                           const snap = m.snapshots?.find(s => s.site_id === site.site_id);
                           const rate = snap?.mr_rate_per_site;
                           return (
                             <td key={m.period_id || i} className="text-center fs-13 text-muted fw-medium">
                               {rate != null ? rate.toFixed(1) : "—"}
                             </td>
                           );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .hover-lift-subtle { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .hover-lift-subtle:hover { transform: translateY(-3px); box-shadow: 0 10px 25px rgba(0,0,0,0.06)!important; }
        .custom-shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
      `}</style>
    </div>
  );
}
