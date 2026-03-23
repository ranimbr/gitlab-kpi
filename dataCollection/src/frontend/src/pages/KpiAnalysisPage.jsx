/**
 * pages/KpiAnalysisPage.jsx
 *
 * Page d'analyse KPI interactive — filtres par projet / site / développeur.
 *
 * Objectif PFE : permettre à l'encadrant de sélectionner une combinaison
 * projet + entité (site OU développeur) et obtenir :
 *   1. Les 6 KPIs calculés pour cette sélection
 *   2. La comparaison avec toutes les autres entités du même projet
 *   3. Des recommandations automatiques basées sur des règles métier
 *
 * Endpoints utilisés :
 *   GET /kpis/dashboard?project_id=X&site_id=Y
 *   GET /kpis/dashboard?project_id=X&developer_id=Z
 *   GET /kpis/compare?project_id=X&period_id=P
 *   GET /kpis/top-developers?project_id=X&limit=10
 *   GET /kpis/sites?project_id=X
 *   GET /kpis/developers?project_id=X
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import projectService   from "../services/projectService";
import analyticsService from "../services/analyticsService";
import siteService  from "../services/siteService";
import periodService from "../services/periodService";
import {
  generateInsights,
  calculateScore,
  getScoreColor,
  getScoreLabel,
  buildComparisonTable,
  fmtKpi,
} from "../services/insightsEngine";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState     from "../components/common/EmptyState";

// ── Helpers d'affichage ───────────────────────────────────────────────────────
function fmt(val, field) { return fmtKpi(val, field); }

function DeltaBadge({ current, previous, field, higherIsBetter = true }) {
  if (current == null || previous == null || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.5) return <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>stable</span>;
  const good  = higherIsBetter ? pct > 0 : pct < 0;
  const color = good ? "var(--color-text-success)" : "var(--color-text-danger)";
  const sign  = pct > 0 ? "+" : "";
  return (
    <span style={{ fontSize: 11, color, fontWeight: 500 }}>
      {sign}{pct.toFixed(1)}% vs mois préc.
    </span>
  );
}

function KpiCard({ label, value, field, prevValue, higherIsBetter = true, vsAvg = null }) {
  const hasAlert = vsAvg != null && Math.abs(vsAvg) > 20;
  const alertColor = vsAvg > 0
    ? (higherIsBetter ? "var(--color-text-success)" : "var(--color-text-danger)")
    : (higherIsBetter ? "var(--color-text-danger)"  : "var(--color-text-success)");

  return (
    <div style={{
      background:   "var(--color-background-secondary)",
      borderRadius: "var(--border-radius-md)",
      padding:      "12px 14px",
    }}>
      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 2 }}>
        {value}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <DeltaBadge current={parseFloat(value)} previous={prevValue} field={field} higherIsBetter={higherIsBetter} />
        {vsAvg != null && (
          <span style={{ fontSize: 11, color: hasAlert ? alertColor : "var(--color-text-secondary)" }}>
            {vsAvg > 0 ? "+" : ""}{vsAvg.toFixed(1)}% vs moyenne
          </span>
        )}
      </div>
    </div>
  );
}

function ScoreCircle({ score }) {
  if (score == null) return null;
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const r = 28, cx = 36, cy = 36;
  const circ = 2 * Math.PI * r;
  const dash  = circ * (score / 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-background-secondary)" strokeWidth="7" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 36 36)" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fontWeight="500" fill={color}>{score}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="var(--color-text-secondary)">/ 100</text>
      </svg>
      <span style={{ fontSize: 11, fontWeight: 500, color }}>{label}</span>
    </div>
  );
}

function InsightCard({ insight }) {
  const cfg = {
    danger:  { bg: "var(--color-background-danger)",  text: "var(--color-text-danger)",   dot: "#E24B4A" },
    warning: { bg: "var(--color-background-warning)", text: "var(--color-text-warning)",  dot: "#EF9F27" },
    success: { bg: "var(--color-background-success)", text: "var(--color-text-success)",  dot: "#639922" },
    info:    { bg: "var(--color-background-info)",    text: "var(--color-text-info)",     dot: "#378ADD" },
  }[insight.type] || {};

  return (
    <div style={{
      background:   "var(--color-background-primary)",
      border:       "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding:      "12px 14px",
      display:      "flex",
      gap:          10,
      alignItems:   "flex-start",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "var(--border-radius-md)",
        background: cfg.bg, color: cfg.text,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, fontSize: 14,
      }}>
        {insight.type === "danger"  && <i className="ri-close-circle-line"   />}
        {insight.type === "warning" && <i className="ri-alert-line"          />}
        {insight.type === "success" && <i className="ri-checkbox-circle-line"/>}
        {insight.type === "info"    && <i className="ri-information-line"    />}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 3 }}>
          {insight.title}
        </p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
          {insight.description}
        </p>
        {insight.action && (
          <button
            style={{
              marginTop: 6, fontSize: 11, fontWeight: 500,
              color: "var(--color-text-info)", background: "none",
              border: "none", padding: 0, cursor: "pointer",
            }}
            onClick={() => window.alert("Fonctionnalité : " + insight.action)}
          >
            {insight.action} →
          </button>
        )}
      </div>
    </div>
  );
}

function BarRow({ label, value, maxValue, color, suffix = "", isSelected = false }) {
  const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
      borderBottom: "0.5px solid var(--color-border-tertiary)",
      background: isSelected ? "var(--color-background-info)" : "transparent",
      borderRadius: isSelected ? "var(--border-radius-md)" : 0,
      paddingLeft: isSelected ? 8 : 0, paddingRight: isSelected ? 8 : 0,
    }}>
      <span style={{
        fontSize: 12, color: isSelected ? "var(--color-text-info)" : "var(--color-text-primary)",
        width: 90, flexShrink: 0, fontWeight: isSelected ? 500 : 400,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }} title={label}>{label}</span>
      <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 4, height: 7 }}>
        <div style={{ width: `${pct}%`, height: 7, borderRadius: 4, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", width: 44, textAlign: "right", flexShrink: 0 }}>
        {typeof value === "number" && !isNaN(value) ? (suffix === "%" ? `${(value * 100).toFixed(1)}%` : value.toFixed(2)) : "—"}
      </span>
    </div>
  );
}

function ComparisonPanel({ rows, selectedLabel, kpiField, title, higherIsBetter = true }) {
  if (!rows?.length) return null;

  const validRows = rows.filter(r => !isNaN(Number(r[kpiField])));
  const maxVal    = Math.max(...validRows.map(r => Number(r[kpiField])));
  const color     = higherIsBetter ? "var(--color-text-success)" : "var(--color-text-danger)";
  const sorted    = higherIsBetter
    ? [...validRows].sort((a, b) => Number(b[kpiField]) - Number(a[kpiField]))
    : [...validRows].sort((a, b) => Number(a[kpiField]) - Number(b[kpiField]));

  return (
    <div style={{
      background:   "var(--color-background-primary)",
      border:       "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding:      "1rem 1.1rem",
    }}>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10, fontWeight: 500 }}>{title}</p>
      {sorted.map((row, i) => (
        <BarRow
          key={i}
          label={row.label}
          value={Number(row[kpiField])}
          maxValue={maxVal}
          color={color}
          isSelected={row.label === selectedLabel}
        />
      ))}
    </div>
  );
}

// ── Constantes ────────────────────────────────────────────────────────────────
const VIEW_MODES = [
  { key: "site",      label: "Par site",       icon: "ri-map-pin-line"  },
  { key: "developer", label: "Par développeur", icon: "ri-user-line"     },
];

const KPI_DEFS = [
  { field: "approved_mr_rate",     label: "Taux approbation",  higherIsBetter: true  },
  { field: "merged_mr_rate",       label: "Taux fusion",        higherIsBetter: true  },
  { field: "mr_rate_per_site",     label: "MR rate / site",    higherIsBetter: true  },
  { field: "commit_rate_per_site", label: "Commit rate / site",higherIsBetter: true  },
  { field: "avg_review_time_hours",label: "Temps revue moy.",  higherIsBetter: false },
  { field: "nb_commits_per_project",label: "NB commits",       higherIsBetter: true  },
];

// ── Page principale ───────────────────────────────────────────────────────────
export default function KpiAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Listes de sélection
  const [projects,     setProjects]     = useState([]);
  const [sites,        setSites]        = useState([]);
  const [developers,   setDevelopers]   = useState([]);
  const [periods,      setPeriods]      = useState([]);

  // Sélections actives
  const [projectId,   setProjectId]    = useState(searchParams.get("project_id") || "");
  const [viewMode,    setViewMode]     = useState("site");
  const [entityId,    setEntityId]     = useState("");
  const [periodId,    setPeriodId]     = useState("");

  // Données KPI
  const [currentSnap,  setCurrentSnap]  = useState(null);
  const [previousSnap, setPreviousSnap] = useState(null);
  const [allSnaps,     setAllSnaps]     = useState([]);
  const [topDevs,      setTopDevs]      = useState([]);

  // UI
  const [loading,      setLoading]      = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [error,        setError]        = useState(null);
  const [activeKpi,    setActiveKpi]    = useState("approved_mr_rate");

  // ── Chargement initial : projets + périodes ─────────────────────────────────
  useEffect(() => {
    let mounted = true;
    Promise.all([projectService.getAll(), periodService.getAll()])
      .then(([projs, pers]) => {
        if (!mounted) return;
        setProjects(Array.isArray(projs) ? projs : []);
        const sorted = (Array.isArray(pers) ? pers : []).sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        );
        setPeriods(sorted);
        if (sorted.length) setPeriodId(String(sorted[0].id));
        if (projs.length && !projectId) {
          setProjectId(String(projs[0].id));
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []); // eslint-disable-line

  // ── Chargement sites / développeurs quand le projet change ─────────────────
  // Stratégie double :
  //   1. /kpis/sites?project_id=X  → sites avec snapshots KPI (MONTHLY)
  //   2. Fallback /sites/           → tous les sites actifs (si extractions REALTIME sans snapshot MONTHLY)
  //   3. /kpis/developers?project_id=X → développeurs validés du projet
  useEffect(() => {
    if (!projectId) return;
    let mounted = true;
    setLoadingLists(true);
    setEntityId("");

    const toArr = (d) =>
      Array.isArray(d) ? d : (d?.items ?? d?.sites ?? d?.developers ?? []);

    const loadSites = async () => {
      // 1. /kpis/sites?project_id=X (sites avec snapshots KPI Monthly)
      try {
        const kpiSites = toArr(await siteService.getKpiSites(parseInt(projectId)));
        console.log("[KpiAnalysis] /kpis/sites →", kpiSites);
        if (kpiSites.length > 0) return kpiSites;
      } catch (e) {
        console.warn("[KpiAnalysis] /kpis/sites erreur:", e?.response?.status, e?.message);
      }
      // 2. Fallback /sites/ (tous les sites actifs — si pas encore de snapshot MONTHLY)
      try {
        const allSites = toArr(await siteService.getAll(true));
        console.log("[KpiAnalysis] /sites/ fallback →", allSites);
        return allSites;
      } catch (e) {
        console.warn("[KpiAnalysis] /sites/ erreur:", e?.message);
        return [];
      }
    };

    const loadDevs = async () => {
      try {
        return toArr(await siteService.getKpiDevelopers(parseInt(projectId)));
      } catch (_) {
        return [];
      }
    };

    Promise.all([loadSites(), loadDevs()])
      .then(([sitesArr, devsArr]) => {
        if (!mounted) return;
        setSites(sitesArr);
        setDevelopers(devsArr);
      })
      .finally(() => { if (mounted) setLoadingLists(false); });

    return () => { mounted = false; };
  }, [projectId]);

  // ── Chargement KPIs quand la sélection est complète ─────────────────────────
  //
  // Stratégie cascade pour maximiser les chances d'obtenir des données :
  //   1. Avec site_id ou developer_id (filtre précis)
  //   2. Sans filtre entité (données projet global)
  //   3. Depuis /analytics/{projectId}/dashboard (endpoint alternatif)
  //
  const loadKpis = useCallback(async () => {
    if (!projectId || !entityId) return;
    setLoading(true);
    setError(null);
    setCurrentSnap(null);
    setPreviousSnap(null);
    setAllSnaps([]);

    const entityParams = { siteId: null, developerId: null };
    if (viewMode === "site")      entityParams.siteId      = parseInt(entityId);
    if (viewMode === "developer") entityParams.developerId = parseInt(entityId);

    try {
      let dashData = null;
      let usedFallback = false;

      // Tentative 1 : avec filtre site/developer
      try {
        dashData = await analyticsService.getKpiDashboard(parseInt(projectId), entityParams);
        console.log("[KpiAnalysis] ✅ Données avec filtre entité:", dashData);
      } catch (e1) {
        console.warn("[KpiAnalysis] ⚠️ Filtre entité échoué (", e1?.response?.status, ") — essai sans filtre");

        // Tentative 2 : sans filtre entité (données projet globales)
        try {
          dashData = await analyticsService.getKpiDashboard(parseInt(projectId), {});
          usedFallback = true;
          console.log("[KpiAnalysis] ✅ Données projet global:", dashData);
        } catch (e2) {
          console.warn("[KpiAnalysis] ⚠️ Projet global échoué (", e2?.response?.status, ") — essai analytics endpoint");

          // Tentative 3 : endpoint /analytics/{projectId}/dashboard
          try {
            dashData = await analyticsService.getDashboard(parseInt(projectId), entityParams);
            console.log("[KpiAnalysis] ✅ Données via /analytics/:", dashData);
          } catch (e3) {
            console.error("[KpiAnalysis] ❌ Tous les endpoints ont échoué");
            throw new Error(
              e1?.response?.data?.detail ||
              e1?.response?.data?.message ||
              e1?.message ||
              "Aucun snapshot KPI disponible. Lancez une extraction Monthly."
            );
          }
        }
      }

      // Normalise la réponse — plusieurs structures possibles selon l'endpoint
      const latest = dashData?.latest_metrics || dashData?.latest || dashData?.data || dashData;
      const history = dashData?.history || dashData?.historical || [];

      // Si fallback utilisé, enrichir le snapshot avec le filtre site
      // pour que les comparaisons restent cohérentes
      if (usedFallback && latest && viewMode === "site") {
        latest._filtered_site_id = parseInt(entityId);
        latest._is_global = true;
      }

      setCurrentSnap(latest);
      if (history.length >= 2) setPreviousSnap(history[history.length - 2]);

      // Comparaison inter-entités (même projet, même période)
      const compareData = await analyticsService.compareSites(
        parseInt(projectId),
        periodId ? parseInt(periodId) : null
      ).catch(() => []);
      setAllSnaps(Array.isArray(compareData) ? compareData : []);

      // Top développeurs si mode site
      if (viewMode === "site") {
        const devs = await analyticsService.getTopDevelopers(parseInt(projectId), {
          siteId: parseInt(entityId),
          limit:  5,
        }).catch(() => []);
        setTopDevs(Array.isArray(devs) ? devs : []);
      }
    } catch (err) {
      setError(err.message || "Impossible de charger les données KPI.");
    } finally {
      setLoading(false);
    }
  }, [projectId, entityId, viewMode, periodId]);

  useEffect(() => { loadKpis(); }, [loadKpis]);

  // ── Mise à jour URL ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (projectId) setSearchParams({ project_id: projectId }, { replace: true });
  }, [projectId, setSearchParams]);

  // ── Données dérivées ────────────────────────────────────────────────────────
  const selectedEntity = useMemo(() => {
    if (!entityId) return null;
    const list = viewMode === "site" ? sites : developers;
    return list.find(e => String(e.id) === entityId);
  }, [entityId, viewMode, sites, developers]);

  const entityLabel = useMemo(() => {
    if (!selectedEntity) return "cette entité";
    return viewMode === "site"
      ? `le site ${selectedEntity.name}`
      : `le développeur @${selectedEntity.username || selectedEntity.name}`;
  }, [selectedEntity, viewMode]);

  const insights = useMemo(() =>
    generateInsights(currentSnap, allSnaps, previousSnap, entityLabel),
    [currentSnap, allSnaps, previousSnap, entityLabel]
  );

  const score = useMemo(() => calculateScore(currentSnap), [currentSnap]);

  const comparisonRows = useMemo(() => {
    if (!allSnaps.length) return [];
    return buildComparisonTable(allSnaps, s => s.site_name || s.site?.name || s.developer_username || `#${s.site_id || s.developer_id}`);
  }, [allSnaps]);

  const selectedLabel = useMemo(() => {
    if (!selectedEntity) return "";
    return viewMode === "site"
      ? (selectedEntity.name)
      : (selectedEntity.username || selectedEntity.name);
  }, [selectedEntity, viewMode]);

  const avgForCurrentSnap = useCallback((field) => {
    if (!allSnaps.length || !currentSnap) return null;
    const others = allSnaps.filter(s => s.id !== currentSnap.id);
    if (!others.length) return null;
    const vals = others.map(s => Number(s[field])).filter(v => !isNaN(v));
    if (!vals.length) return null;
    const avgVal = vals.reduce((a, b) => a + b, 0) / vals.length;
    const cur    = Number(currentSnap[field]);
    if (isNaN(cur) || avgVal === 0) return null;
    return ((cur - avgVal) / Math.abs(avgVal)) * 100;
  }, [allSnaps, currentSnap]);

  const selectedProject = projects.find(p => String(p.id) === projectId);
  const selectedPeriod  = periods.find(p  => String(p.id) === periodId);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Header */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <div>
                <h4 className="mb-1 fw-semibold">
                  <i className="ri-bar-chart-grouped-line me-2 text-primary"></i>
                  Analyse KPI
                </h4>
                <ol className="breadcrumb mb-0 fs-12">
                  <li className="breadcrumb-item"><Link to="/" className="text-muted">Dashboard</Link></li>
                  <li className="breadcrumb-item active">Analyse KPI</li>
                  {selectedProject && <li className="breadcrumb-item active">{selectedProject.name}</li>}
                </ol>
              </div>
              <button className="btn btn-sm btn-soft-primary" onClick={loadKpis} disabled={loading || !entityId}>
                <i className={`ri-refresh-line me-1 ${loading ? "rotating" : ""}`}></i>
                Actualiser
              </button>
            </div>
          </div>
        </div>

        {/* ── Barre de filtres ── */}
        <div className="card border-0 mb-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div className="card-body py-3">
            <div className="row g-3 align-items-end">

              {/* Projet */}
              <div className="col-md-3">
                <label className="form-label fw-medium fs-12 mb-1">
                  <i className="ri-folder-2-line me-1 text-muted"></i>Projet
                </label>
                <select className="form-select form-select-sm"
                  value={projectId}
                  onChange={e => { setProjectId(e.target.value); setEntityId(""); }}>
                  <option value="">— Choisir un projet —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Mode d'analyse */}
              <div className="col-md-3">
                <label className="form-label fw-medium fs-12 mb-1">Analyser par</label>
                <div className="d-flex gap-2">
                  {VIEW_MODES.map(m => (
                    <button
                      key={m.key}
                      className={`btn btn-sm flex-fill ${viewMode === m.key ? "btn-primary" : "btn-light"}`}
                      onClick={() => { setViewMode(m.key); setEntityId(""); }}>
                      <i className={`${m.icon} me-1`}></i>{m.label.split(" ")[1]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entité (site ou développeur) */}
              <div className="col-md-3">
                <label className="form-label fw-medium fs-12 mb-1">
                  {viewMode === "site" ? "Site" : "Développeur"}
                  {loadingLists && <span className="spinner-border spinner-border-sm ms-2" style={{ width: 10, height: 10 }}></span>}
                </label>
                <select className="form-select form-select-sm"
                  value={entityId}
                  onChange={e => setEntityId(e.target.value)}
                  disabled={!projectId || loadingLists}>
                  <option value="">
                    {loadingLists ? "Chargement…" : `— Choisir un ${viewMode === "site" ? "site" : "développeur"} —`}
                  </option>
                  {viewMode === "site"
                    ? sites.map(s => <option key={s.id} value={s.id}>{s.name}{s.country ? ` (${s.country})` : ""}</option>)
                    : developers.map(d => <option key={d.id} value={d.id}>@{d.username}{d.name ? ` — ${d.name}` : ""}</option>)
                  }
                </select>
              </div>

              {/* Période */}
              <div className="col-md-3">
                <label className="form-label fw-medium fs-12 mb-1">
                  <i className="ri-calendar-2-line me-1 text-muted"></i>Période
                </label>
                <select className="form-select form-select-sm"
                  value={periodId}
                  onChange={e => setPeriodId(e.target.value)}>
                  <option value="">— Toutes les périodes —</option>
                  {periods.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.year}/{String(p.month).padStart(2, "0")}{p.status === "open" ? " (ouverte)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── État : pas de sélection ── */}
        {!entityId && !loading && (
          <EmptyState
            icon={viewMode === "site" ? "ri-map-pin-line" : "ri-user-line"}
            title={`Sélectionnez un ${viewMode === "site" ? "site" : "développeur"}`}
            description="Choisissez un projet et une entité pour analyser les KPIs et obtenir des recommandations."
            compact
          />
        )}

        {/* ── Chargement ── */}
        {loading && <div className="py-5"><LoadingSpinner text="Calcul des KPIs en cours…" /></div>}

        {/* ── Erreur ── */}
        {error && !loading && (
          <div className="alert alert-warning d-flex align-items-center gap-3 mb-4">
            <i className="ri-information-line fs-3 flex-shrink-0 text-warning"></i>
            <div>
              <p className="fs-13 mb-2 text-muted">{error}</p>
              <Link to="/extraction" className="btn btn-sm btn-primary">
                <i className="ri-download-2-line me-1"></i>Lancer une extraction
              </Link>
            </div>
          </div>
        )}

        {/* ── Contenu principal ── */}
        {!loading && !error && currentSnap && entityId && (
          <>
            {/* Contexte de l'analyse */}
            <div className="d-flex align-items-center gap-3 mb-4 flex-wrap">
              <div className="d-flex align-items-center gap-2 px-3 py-2 rounded-3"
                style={{ background: "var(--color-background-info)", border: "0.5px solid var(--color-border-info)" }}>
                <i className={`${viewMode === "site" ? "ri-map-pin-line" : "ri-user-line"} text-info`}></i>
                <span className="fs-13 fw-medium" style={{ color: "var(--color-text-info)" }}>{entityLabel}</span>
              </div>
              {selectedProject && (
                <span className="badge fs-12" style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                  <i className="ri-folder-2-line me-1"></i>{selectedProject.name}
                </span>
              )}
              {selectedPeriod && (
                <span className="badge fs-12" style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                  <i className="ri-calendar-2-line me-1"></i>{selectedPeriod.year}/{String(selectedPeriod.month).padStart(2, "0")}
                </span>
              )}
            </div>

            <div className="row g-4">

              {/* Colonne gauche — KPIs + Score */}
              <div className="col-xl-8">

                {/* Score + KPI grid */}
                <div className="card border-0 mb-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                  <div className="card-header bg-white d-flex align-items-center" style={{ borderBottom: "1px solid #f0f2f5" }}>
                    <h6 className="mb-0 fw-semibold flex-grow-1">
                      <i className="ri-dashboard-2-line me-2 text-primary"></i>
                      Indicateurs clés de performance
                    </h6>
                    <ScoreCircle score={score} />
                  </div>
                  <div className="card-body">
                    <div className="row g-2">
                      {KPI_DEFS.map(kpi => (
                        <div key={kpi.field} className="col-md-4 col-sm-6">
                          <KpiCard
                            label={kpi.label}
                            value={fmt(currentSnap[kpi.field], kpi.field)}
                            field={kpi.field}
                            prevValue={previousSnap ? Number(previousSnap[kpi.field]) : null}
                            higherIsBetter={kpi.higherIsBetter}
                            vsAvg={avgForCurrentSnap(kpi.field)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Comparaison inter-entités */}
                {comparisonRows.length > 1 && (
                  <div className="card border-0 mb-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                    <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
                      <div className="d-flex align-items-center gap-3">
                        <h6 className="mb-0 fw-semibold flex-grow-1">
                          <i className="ri-bar-chart-horizontal-line me-2 text-info"></i>
                          Comparaison — tous les sites
                        </h6>
                        {/* KPI selector pills */}
                        <div className="d-flex gap-1 flex-wrap">
                          {KPI_DEFS.slice(0, 3).map(k => (
                            <button
                              key={k.field}
                              className={`btn btn-xs px-2 py-1 ${activeKpi === k.field ? "btn-info" : "btn-soft-secondary"}`}
                              style={{ fontSize: 10 }}
                              onClick={() => setActiveKpi(k.field)}>
                              {k.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="card-body">
                      <ComparisonPanel
                        rows={comparisonRows}
                        selectedLabel={selectedLabel}
                        kpiField={activeKpi}
                        title={KPI_DEFS.find(k => k.field === activeKpi)?.label || ""}
                        higherIsBetter={KPI_DEFS.find(k => k.field === activeKpi)?.higherIsBetter ?? true}
                      />
                    </div>
                  </div>
                )}

                {/* Top développeurs du site sélectionné */}
                {viewMode === "site" && topDevs.length > 0 && (
                  <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                    <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
                      <h6 className="mb-0 fw-semibold">
                        <i className="ri-medal-line me-2 text-warning"></i>
                        Top développeurs — {selectedEntity?.name}
                      </h6>
                    </div>
                    <div className="card-body p-0">
                      <table className="table table-hover align-middle mb-0">
                        <thead style={{ background: "#fafbfc" }}>
                          <tr>
                            <th className="ps-4 py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Développeur</th>
                            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase">MR rate</th>
                            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase">Approbation</th>
                            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase">Tps revue</th>
                            <th className="pe-4 py-3 text-muted fs-11 fw-semibold text-uppercase">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topDevs.map((dev, i) => {
                            const s = calculateScore(dev);
                            return (
                              <tr key={i}>
                                <td className="ps-4 py-3">
                                  <div className="d-flex align-items-center gap-2">
                                    <div className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white fs-11 flex-shrink-0"
                                      style={{ width: 28, height: 28, background: "var(--color-background-info)", color: "var(--color-text-info)" }}>
                                      {(dev.developer_username || dev.username || "?")[0].toUpperCase()}
                                    </div>
                                    <span className="fs-13">@{dev.developer_username || dev.username || `dev ${i + 1}`}</span>
                                  </div>
                                </td>
                                <td className="fs-13">{fmt(dev.mr_rate_per_site, "mr_rate_per_site")}</td>
                                <td className="fs-13">{fmt(dev.approved_mr_rate, "approved_mr_rate")}</td>
                                <td className="fs-13">{fmt(dev.avg_review_time_hours, "avg_review_time_hours")}</td>
                                <td className="pe-4">
                                  <span className="fw-semibold fs-13" style={{ color: getScoreColor(s) }}>
                                    {s ?? "—"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Colonne droite — Recommandations */}
              <div className="col-xl-4">
                <div className="card border-0 h-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                  <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
                    <h6 className="mb-0 fw-semibold">
                      <i className="ri-lightbulb-line me-2 text-warning"></i>
                      Recommandations
                      <span className="badge ms-2 fs-11" style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                        {insights.length}
                      </span>
                    </h6>
                    <p className="text-muted fs-12 mb-0 mt-1">Analyse automatique basée sur les règles métier</p>
                  </div>
                  <div className="card-body p-3 d-flex flex-column gap-2">
                    {insights.map((ins, i) => (
                      <InsightCard key={i} insight={ins} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .rotating { animation: spin .8s linear infinite; display: inline-block; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .btn-xs { padding: 2px 8px; font-size: 11px; border-radius: var(--border-radius-md); }
      `}</style>
    </div>
  );
}
