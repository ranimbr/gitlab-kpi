/**
 * pages/DeveloperComparisonPage.jsx
 * 
 * Phase 6: Side-by-side developer comparison for managers.
 * Allows selecting 2 developers and comparing their KPIs with overlaid radar charts.
 */
import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import developerService from "../services/developerService";
import analyticsService from "../services/analyticsService";
import projectService  from "../services/projectService";
import LoadingSpinner  from "../components/common/LoadingSpinner";
import ReactApexChart  from "react-apexcharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => (n == null || isNaN(+n)) ? "—" : (+n).toFixed(d);
function getInitials(name = "") { return (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2); }

const GRADIENTS = [
  "linear-gradient(135deg,#4361ee,#3a0ca3)",
  "linear-gradient(135deg,#10b981,#059669)",
];

// ─── KPI Definition ───────────────────────────────────────────────────────────
const KPI_FIELDS = [
  { key: "total_commits",      label: "Commits",          icon: "ri-git-commit-line",         color: "primary", format: v => v ?? 0 },
  { key: "total_mrs_created",  label: "MRs Créées",       icon: "ri-git-pull-request-line",   color: "success", format: v => v ?? 0 },
  { key: "total_reviews",      label: "Revues de Code",   icon: "ri-eye-line",                color: "info",    format: v => v ?? 0 },
  { key: "total_comments",     label: "Commentaires",     icon: "ri-chat-4-line",             color: "warning", format: v => v ?? 0 },
  { key: "approved_mr_rate",   label: "Taux Approbation", icon: "ri-checkbox-circle-line",    color: "success", format: v => v != null ? `${(v * 100).toFixed(0)}%` : "—" },
  { key: "merged_mr_rate",     label: "Taux Fusion",      icon: "ri-git-merge-line",          color: "info",    format: v => v != null ? `${(v * 100).toFixed(0)}%` : "—" },
  { key: "developer_score",    label: "Score Global",     icon: "ri-medal-line",              color: "danger",  format: v => v != null ? `${(v * 100).toFixed(0)} pts` : "—" },
];

// ─── Component: Developer Selector ────────────────────────────────────────────
function DevSelector({ label, developers, selectedId, onChange, gradient }) {
  return (
    <div className="card border-0 shadow-sm" style={{ overflow: 'hidden' }}>
      <div style={{ height: 3, background: gradient }} />
      <div className="card-body p-3">
        <label className="fs-11 fw-bold text-muted text-uppercase mb-2 d-block">{label}</label>
        <select className="form-select" value={selectedId || ""} onChange={e => onChange(e.target.value)}>
          <option value="" disabled>Choisir un développeur…</option>
          {developers.map(d => (
            <option key={d.id} value={d.id}>{d.name || d.gitlab_username}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Component: Comparison Bar ────────────────────────────────────────────────
function ComparisonBar({ label, icon, valueA, valueB, isRate = false }) {
  const numA = isRate ? (valueA || 0) * 100 : (valueA || 0);
  const numB = isRate ? (valueB || 0) * 100 : (valueB || 0);
  const max = Math.max(numA, numB, 1);
  const pctA = (numA / max) * 100;
  const pctB = (numB / max) * 100;
  const winner = numA > numB ? 'A' : numB > numA ? 'B' : 'tie';

  return (
    <div className="py-3" style={{ borderBottom: '1px solid #f0f2f5' }}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <span className="fs-12 fw-semibold text-muted d-flex align-items-center gap-1">
          <i className={`${icon} fs-14`}></i>{label}
        </span>
      </div>
      <div className="d-flex align-items-center gap-3">
        {/* Developer A */}
        <div className="text-end" style={{ width: 60 }}>
          <span className="fw-bold fs-13" style={{ color: winner === 'A' ? '#4361ee' : '#64748b' }}>
            {isRate ? `${numA.toFixed(0)}%` : numA}
          </span>
        </div>
        <div className="flex-grow-1">
          <div className="d-flex gap-1" style={{ height: 8 }}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: `${pctA}%`, height: '100%', background: 'linear-gradient(90deg, rgba(67,97,238,0.3), #4361ee)', borderRadius: '4px 0 0 4px', transition: 'width 0.6s ease' }} />
            </div>
            <div style={{ width: 2, background: '#e2e8f0' }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: `${pctB}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, rgba(16,185,129,0.3))', borderRadius: '0 4px 4px 0', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        </div>
        {/* Developer B */}
        <div style={{ width: 60 }}>
          <span className="fw-bold fs-13" style={{ color: winner === 'B' ? '#10b981' : '#64748b' }}>
            {isRate ? `${numB.toFixed(0)}%` : numB}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeveloperComparisonPage() {
  const [searchParams] = useSearchParams();
  const [developers, setDevelopers] = useState([]);
  const [projects, setProjects]     = useState([]);
  const [selectedPid, setSelectedPid] = useState("");
  const [devAId, setDevAId] = useState(searchParams.get("a") || "");
  const [devBId, setDevBId] = useState(searchParams.get("b") || "");
  const [summaryA, setSummaryA] = useState(null);
  const [summaryB, setSummaryB] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      developerService.getByTab("validated", null, true),
      projectService.getAll(),
    ]).then(([devs, projs]) => {
      setDevelopers(Array.isArray(devs) ? devs : []);
      setProjects(Array.isArray(projs) ? projs : []);
      if (projs?.length) setSelectedPid(String(projs[0].id));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedPid || !devAId) { setSummaryA(null); return; }
    analyticsService.getDeveloperSummary(parseInt(selectedPid), parseInt(devAId))
      .then(setSummaryA).catch(() => setSummaryA(null));
  }, [devAId, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !devBId) { setSummaryB(null); return; }
    analyticsService.getDeveloperSummary(parseInt(selectedPid), parseInt(devBId))
      .then(setSummaryB).catch(() => setSummaryB(null));
  }, [devBId, selectedPid]);

  const devA = developers.find(d => String(d.id) === String(devAId));
  const devB = developers.find(d => String(d.id) === String(devBId));

  // Radar chart data
  const radarOptions = useMemo(() => ({
    chart: { type: 'radar', toolbar: { show: false }, animations: { enabled: true, easing: 'easeinout', speed: 800 }, dropShadow: { enabled: true, blur: 4, left: 1, top: 1, opacity: 0.1 } },
    labels: ['Commits', 'MRs', 'Revues', 'Commentaires', 'Qualité'],
    stroke: { width: 2, colors: ['#4361ee', '#10b981'] },
    fill: { opacity: 0.15, colors: ['#4361ee', '#10b981'] },
    markers: { size: 4, colors: ['#fff'], strokeColors: ['#4361ee', '#10b981'], strokeWidth: 2 },
    yaxis: { show: false, min: 0, max: 100 },
    xaxis: { labels: { style: { colors: ['#475569','#475569','#475569','#475569','#475569'], fontSize: '11px', fontFamily: 'Inter, sans-serif', fontWeight: 600 } } },
    dataLabels: { enabled: false },
    plotOptions: { radar: { polygons: { strokeColors: '#E2E8F0', connectorColors: '#E2E8F0' } } },
    legend: { position: 'bottom', fontSize: '12px', fontWeight: 600, markers: { radius: 3 } },
  }), []);

  const radarSeries = useMemo(() => {
    const normalize = (sum) => {
      if (!sum) return [0, 0, 0, 0, 0];
      return [
        Math.min((sum.total_commits || 0) * 2, 100),
        Math.min((sum.total_mrs_created || 0) * 20, 100),
        Math.min((sum.total_reviews || 0) * 33, 100),
        Math.min((sum.total_comments || 0) * 10, 100),
        (sum.approved_mr_rate || 0) * 100,
      ];
    };
    return [
      { name: devA?.name || "Développeur A", data: normalize(summaryA) },
      { name: devB?.name || "Développeur B", data: normalize(summaryB) },
    ];
  }, [summaryA, summaryB, devA, devB]);

  if (loading) return <LoadingSpinner fullPage text="Chargement..." />;

  return (
    <div className="page-content">
      <div className="container-fluid">
        {/* Header */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between mb-4">
              <h4 className="mb-sm-0 fw-bold"><i className="ri-scales-3-line me-2 text-primary"></i>Comparaison Développeurs</h4>
              <div className="page-title-right">
                <ol className="breadcrumb m-0 fs-12">
                  <li className="breadcrumb-item"><Link to="/developers">Hub</Link></li>
                  <li className="breadcrumb-item active">Comparaison</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Project Selector */}
        <div className="row mb-4">
          <div className="col-md-4">
            <label className="fs-11 fw-bold text-muted text-uppercase mb-1">Contexte Projet</label>
            <select className="form-select" value={selectedPid} onChange={e => setSelectedPid(e.target.value)}>
              <option value="" disabled>Choisir…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Developer Selectors */}
        <div className="row g-4 mb-4">
          <div className="col-md-6">
            <DevSelector label="Développeur A" developers={developers.filter(d => String(d.id) !== String(devBId))} selectedId={devAId} onChange={setDevAId} gradient={GRADIENTS[0]} />
          </div>
          <div className="col-md-6">
            <DevSelector label="Développeur B" developers={developers.filter(d => String(d.id) !== String(devAId))} selectedId={devBId} onChange={setDevBId} gradient={GRADIENTS[1]} />
          </div>
        </div>

        {summaryA && summaryB ? (
          <div className="row g-4">
            {/* Radar Chart */}
            <div className="col-xl-5">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header border-bottom">
                  <h6 className="card-title mb-0 fw-semibold"><i className="ri-radar-line me-2 text-info"></i>Profil de Compétences</h6>
                </div>
                <div className="card-body d-flex flex-column justify-content-center">
                  <ReactApexChart options={radarOptions} series={radarSeries} type="radar" height={340} />
                </div>
              </div>
            </div>

            {/* Comparison Bars */}
            <div className="col-xl-7">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header border-bottom d-flex align-items-center">
                  <h6 className="card-title mb-0 fw-semibold flex-grow-1"><i className="ri-bar-chart-horizontal-line me-2 text-primary"></i>Comparaison KPI</h6>
                  <div className="d-flex gap-3">
                    <span className="d-flex align-items-center gap-1 fs-11">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4361ee' }}></span>
                      {devA?.name || "Dev A"}
                    </span>
                    <span className="d-flex align-items-center gap-1 fs-11">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></span>
                      {devB?.name || "Dev B"}
                    </span>
                  </div>
                </div>
                <div className="card-body">
                  <ComparisonBar label="Commits" icon="ri-git-commit-line" valueA={summaryA?.total_commits} valueB={summaryB?.total_commits} />
                  <ComparisonBar label="MRs Créées" icon="ri-git-pull-request-line" valueA={summaryA?.total_mrs_created} valueB={summaryB?.total_mrs_created} />
                  <ComparisonBar label="Revues de Code" icon="ri-eye-line" valueA={summaryA?.total_reviews} valueB={summaryB?.total_reviews} />
                  <ComparisonBar label="Commentaires" icon="ri-chat-4-line" valueA={summaryA?.total_comments} valueB={summaryB?.total_comments} />
                  <ComparisonBar label="Taux Approbation" icon="ri-checkbox-circle-line" valueA={summaryA?.approved_mr_rate} valueB={summaryB?.approved_mr_rate} isRate />
                  <ComparisonBar label="Taux Fusion" icon="ri-git-merge-line" valueA={summaryA?.merged_mr_rate} valueB={summaryB?.merged_mr_rate} isRate />

                  {/* Score Summary */}
                  <div className="row g-3 mt-3">
                    <div className="col-6">
                      <div className="p-3 rounded-3 text-center" style={{ background: 'rgba(67,97,238,0.05)', border: '1px solid rgba(67,97,238,0.15)' }}>
                        <h3 className="fw-bold mb-1" style={{ color: '#4361ee' }}>{summaryA?.developer_score != null ? Math.round(summaryA.developer_score * 100) : "—"}</h3>
                        <p className="mb-0 fs-11 text-muted fw-semibold">Score {devA?.name || "A"}</p>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-3 rounded-3 text-center" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                        <h3 className="fw-bold mb-1" style={{ color: '#10b981' }}>{summaryB?.developer_score != null ? Math.round(summaryB.developer_score * 100) : "—"}</h3>
                        <p className="mb-0 fs-11 text-muted fw-semibold">Score {devB?.name || "B"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-5">
            <i className="ri-scales-3-line display-3 text-muted opacity-25 mb-3"></i>
            <h5 className="text-muted">Sélectionnez deux développeurs pour comparer leurs KPIs</h5>
            <p className="text-muted fs-13">Les KPIs seront affichés côte-à-côte avec un radar chart superposé.</p>
          </div>
        )}
      </div>
    </div>
  );
}
