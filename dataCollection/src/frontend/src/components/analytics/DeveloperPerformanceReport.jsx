import React, { useState, useEffect, useCallback, useMemo } from "react";
import Chart from "react-apexcharts";
import analyticsService from "../../services/analyticsService";
import LoadingSpinner from "../common/LoadingSpinner";

/**
 * DeveloperPerformanceReport.jsx
 * ✅ Phase 3 : Aide à la Décision Managériale.
 * 
 * Ce composant affiche l'analyse comparative d'un développeur par rapport
 * à la moyenne de son site, avec une synthèse textuelle (Insight Engine).
 */
export default function DeveloperPerformanceReport({ developerId, projectId, periodId = null, onClose }) {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const data = await analyticsService.getDeveloperInsights(developerId, projectId, periodId);
      if (data.error) {
        setError(data.error);
      } else {
        setInsights(data);
      }
    } catch (err) {
      console.error("Error fetching insights:", err);
      setError("Impossible de charger les analyses. Vérifiez les extractions monthly.");
    } finally {
      setLoading(false);
    }
  }, [developerId, projectId, periodId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Préparation des données pour le Radar Chart
  const radarOptions = useMemo(() => {
    if (!insights) return null;

    const { developer_snap, site_average } = insights;
    
    // Labels des branches du radar
    const labels = [
      "MR Rate (Vélocité)",
      "Approbation (Qualité)",
      "Fusion (Impact)",
      "Commits (Activité)",
      "Vitesse Revue (Inverse)"
    ];

    // On normalise les données pour le radar (échelle 0-100 ou 0-10)
    // Pour la vitesse de revue, on inverse (plus c'est bas, mieux c'est)
    const normalize = (val, max = 10) => Math.min(100, Math.max(0, (val / max) * 100));
    
    const devData = [
      normalize(developer_snap.mr_rate_per_site, 10),
      developer_snap.approved_mr_rate * 100,
      developer_snap.merged_mr_rate * 100,
      normalize(developer_snap.total_commits, 50),
      normalize(20 / (developer_snap.avg_review_time_hours || 1), 5) // Score inverse pour la rapidité
    ];

    const siteData = site_average ? [
      normalize(site_average.mr_rate_per_site, 10),
      site_average.approved_mr_rate * 100,
      site_average.merged_mr_rate * 100,
      normalize(site_average.total_commits, 50),
      normalize(20 / (site_average.avg_review_time_hours || 1), 5)
    ] : [0, 0, 0, 0, 0];

    return {
      series: [
        { name: "Développeur", data: devData.map(v => Math.round(v)) },
        { name: "Moyenne Site", data: siteData.map(v => Math.round(v)) }
      ],
      options: {
        chart: { 
          type: "radar", 
          toolbar: { show: false }, 
          dropShadow: { enabled: true, blur: 1, left: 1, top: 1, opacity: 0.1 } 
        },
        labels: labels,
        stroke: { width: 2 },
        fill: { opacity: 0.2 },
        markers: { size: 4 },
        colors: ["#6366f1", "#94a3b8"], // Indigo vs Slate
        yaxis: { show: false, min: 0, max: 100 },
        legend: { position: "bottom", fontFamily: "Inter", fontWeight: 500 }
      }
    };
  }, [insights]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="p-5 text-center"><LoadingSpinner text="Analyse du profil..." /></div>;
  
  if (error) return (
    <div className="alert alert-soft-warning d-flex align-items-center gap-3 m-4">
      <i className="ri-error-warning-line fs-3"></i>
      <div>
        <h6 className="alert-heading mb-1 fw-bold">Données insuffisantes</h6>
        <p className="mb-0 fs-13">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="performance-report-overlay @media-print-none">
      <div className="card border-0 shadow-lg rounded-4 overflow-hidden performance-report-modal">
        {/* Header (Masqué à l'impression si on veut mais ici on garde pour le titre PDF) */}
        <div className="card-header bg-dark p-4 d-flex align-items-center justify-content-between border-0">
          <div className="d-flex align-items-center gap-3">
             <div className="avatar-md bg-white bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center text-white">
                <i className="ri-file-chart-line fs-2"></i>
             </div>
             <div>
                <h4 className="text-white mb-0 fw-bold">Bilan de Performance Managérial</h4>
                <p className="text-white-50 mb-0 fs-13">Période : {insights.period_label || "Mois en cours"}</p>
             </div>
          </div>
          <div className="d-flex gap-2 no-print">
            <button className="btn btn-info d-flex align-items-center gap-2" onClick={handlePrint}>
              <i className="ri-printer-line"></i> Imprimer / PDF
            </button>
            <button className="btn btn-link text-white-50" onClick={onClose}>
              <i className="ri-close-line fs-2"></i>
            </button>
          </div>
        </div>

        <div className="card-body p-4 bg-light bg-opacity-50">
          <div className="row g-4">
            {/* Colonne Radar */}
            <div className="col-lg-6">
              <div className="card border-0 shadow-sm rounded-4 h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-4 text-muted text-uppercase fs-11" style={{ letterSpacing: "1px" }}>
                    Comparaison vs Moyenne Site
                  </h6>
                  <Chart options={radarOptions.options} series={radarOptions.series} type="radar" height={350} />
                </div>
              </div>
            </div>

            {/* Colonne Insights */}
            <div className="col-lg-6">
               {/* Synthèse IA */}
               <div className="card border-0 shadow-sm rounded-4 mb-4 bg-primary bg-opacity-10 border-start border-4 border-primary">
                 <div className="card-body p-4">
                   <h6 className="text-primary fw-bold mb-2 d-flex align-items-center gap-2">
                     <i className="ri-mickey-line"></i> Insight Engine (Avis Hub)
                   </h6>
                   <h3 className="fw-bold text-dark mb-0">{insights.insights?.summary}</h3>
                 </div>
               </div>

               {/* Forces */}
               <div className="mb-4">
                  <h6 className="fw-bold mb-3 text-success d-flex align-items-center gap-2 fs-13">
                    <i className="ri-checkbox-circle-fill"></i> Points Forts (Atouts)
                  </h6>
                  <ul className="list-group list-group-flush rounded-3 overflow-hidden shadow-sm">
                    {insights.insights?.strengths?.map((s, i) => (
                      <li key={i} className="list-group-item border-0 fs-13 py-3 d-flex align-items-start gap-2">
                        <i className="ri-arrow-right-s-line text-success pt-1"></i> {s}
                      </li>
                    ))}
                    {insights.insights?.strengths?.length === 0 && <li className="list-group-item text-muted fs-13 italic">Aucun point fort saillant ce mois-ci.</li>}
                  </ul>
               </div>

               {/* Axes d'amélioration */}
               <div>
                  <h6 className="fw-bold mb-3 text-warning d-flex align-items-center gap-2 fs-13">
                    <i className="ri-error-warning-fill"></i> Axes de Progression
                  </h6>
                  <ul className="list-group list-group-flush rounded-3 overflow-hidden shadow-sm">
                    {insights.insights?.weaknesses?.map((w, i) => (
                      <li key={i} className="list-group-item border-0 fs-13 py-3 d-flex align-items-start gap-2">
                        <i className="ri-arrow-right-s-line text-warning pt-1"></i> {w}
                      </li>
                    ))}
                    {insights.insights?.weaknesses?.length === 0 && <li className="list-group-item text-muted fs-13 italic">Aucun point critique détecté.</li>}
                  </ul>
               </div>
            </div>
          </div>
        </div>

        <div className="card-footer bg-white border-0 p-4 text-center text-muted fs-12">
           Ce rapport est généré automatiquement par GitLab KPI Dashboard pour l'aide à la décision managériale. 
           Toute modification manuelle invalide la certification des données.
        </div>
      </div>

      <style>{`
        .performance-report-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
          z-index: 1050; display: flex; align-items: center; justify-content: center;
          padding: 2rem;
        }
        .performance-report-modal { width: 100%; max-width: 1000px; max-height: 90vh; overflow-y: auto; }
        @media print {
          .no-print, .@media-print-none, .btn-info, .text-white-50 { display: none !important; }
          .performance-report-overlay { position: static; background: white; padding: 0; }
          .performance-report-modal { max-width: 100%; border: none; shadow: none; }
          .card { border: 1px solid #eee !important; box-shadow: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
