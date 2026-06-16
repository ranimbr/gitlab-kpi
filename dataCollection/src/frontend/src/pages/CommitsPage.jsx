/**
 * CommitsPage.jsx — Liste des commits GitLab par projet
 * ======================================================
 * PFE Cycle Ingénieur — GitLab KPI Dashboard
 *
 * Corrections & Améliorations v2 :
 *  [FIX]  Import projectService corrigé (depuis ../services/projectService, pas kpiService)
 *  [FIX]  Filtre réécrit en useMemo — supprime le useEffect intermédiaire inutile
 *  [FIX]  loadCommits extrait en useCallback — référence stable entre les renders
 *  [FIX]  Fermeture modal au clavier (Escape) + aria-modal/role pour accessibilité
 *  [NEW]  Export CSV de la liste filtrée avec BOM UTF-8 + revokeObjectURL
 *  [NEW]  Sélecteur de tri (date desc, auteur A→Z, nb changes desc)
 *  [NEW]  Bouton Rafraîchir avec état spinning
 *  [NEW]  Bouton Reset filtres visible uniquement si filtre actif
 *  [NEW]  Empty state dédié quand filtre actif retourne 0 (≠ aucun commit)
 *  [NEW]  Badge total commits dans le titre de page
 *  [NEW]  useMemo sur toutes les dérivations stats (totalAdditions, uniqueAuthors…)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import projectService  from "../services/projectService";   // [FIX] import corrigé
import api             from "../services/api";
import Chart           from "chart.js/auto";
import LoadingSpinner  from "../components/common/LoadingSpinner";
import EmptyState      from "../components/common/EmptyState";
import Pagination      from "../components/common/Pagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function rgba(cssVar, alpha) {
  const val = getCssVar(cssVar);
  return val ? `rgba(${val}, ${alpha})` : `rgba(64,81,137,${alpha})`;
}
function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}
function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function getInitials(name = "") {
  return (name || "?").split(/[\s._-]/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}
function getBadgeColor(index) {
  return ["primary", "success", "info", "warning", "danger", "secondary"][index % 6];
}
function getCardBgColor(index) {
  return [
    "bg-warning-subtle", "bg-danger-subtle", "bg-success-subtle",
    "bg-info-subtle", "bg-primary-subtle", "bg-secondary-subtle",
  ][index % 6];
}
function getAuthor(commit) {
  return commit.developer?.name || commit.developer?.gitlab_username || commit.author_name || "Unknown";
}
function getSite(commit) {
  return commit.site || commit.developer?.site || null;
}
function getCommitTitle(commit) {
  const raw = commit.title || commit.message || "";
  return raw.split("\n")[0].trim();
}
function getCommitBody(commit) {
  const raw   = commit.title || commit.message || "";
  const lines = raw.split("\n").slice(1).join("\n").trim();
  return lines || null;
}
function truncate(text, maxLen = 80) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

// ─── [NEW] Export CSV commits filtrés ─────────────────────────────────────────
function exportCommitsCSV(commits, projectName) {
  if (!commits?.length) return;
  const headers = ["ID", "SHA (court)", "Titre", "Auteur", "Site", "Additions", "Deletions", "Total Changes", "Date"];
  const rows    = commits.map((c) => [
    c.id,
    (c.gitlab_commit_id || "").slice(0, 8),
    `"${getCommitTitle(c).replace(/"/g, '""')}"`,
    getAuthor(c),
    getSite(c) || "",
    c.additions     || 0,
    c.deletions     || 0,
    c.total_changes || 0,
    formatDate(c.authored_date),
  ]);
  const csv  = [headers, ...rows].map((r) => r.join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM UTF-8 pour Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `commits_${projectName || "project"}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url); // [FIX] libère la mémoire immédiatement
}

// ── Constantes de lisibilité ─────────────────────────────────────────────────
// Au-delà de ces seuils, le graphique devient illisible (trop de tranches).
// On affiche toujours le TOTAL réel dans le badge pour la transparence.
const TOP_PIE   = 7;   // Pie chart : top 7 contributeurs par commits
const TOP_POLAR = 6;   // Polar chart : top 6 contributeurs par additions

// ─── Pie Chart — Commits par développeur ─────────────────────────────────────
function ContributorsPieChart({ commits, onMeta }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !commits?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const authorMap = {};
    commits.forEach((c) => { const a = getAuthor(c); authorMap[a] = (authorMap[a] || 0) + 1; });
    const all    = Object.entries(authorMap).sort((a, b) => b[1] - a[1]);
    const sorted = all.slice(0, TOP_PIE);
    // Remonte les métadonnées au parent pour affichage dans le header
    onMeta?.({ shown: sorted.length, total: all.length });

    const COLORS = [
      getCssVar("--vz-primary")   || "#405189",
      getCssVar("--vz-success")   || "#0ab39c",
      getCssVar("--vz-info")      || "#299cdb",
      getCssVar("--vz-warning")   || "#f7b84b",
      getCssVar("--vz-danger")    || "#f06548",
      getCssVar("--vz-secondary") || "#3577f1",
      "#6f42c1",
    ];

    chartRef.current = new Chart(ref.current, {
      type: "pie",
      data: {
        labels: sorted.map(([n]) => n),
        datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: COLORS, hoverBorderColor: "#fff", borderWidth: 2 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { font: { family: "Poppins", size: 12 }, padding: 16, usePointStyle: true } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} commits (${((ctx.raw / commits.length) * 100).toFixed(1)}%)` } },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [commits, onMeta]);

  return <canvas ref={ref} style={{ maxHeight: 260 }} />;
}

// ─── Polar Chart — Volume d'additions par développeur ────────────────────────
function AdditionsPolarChart({ commits, onMeta }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !commits?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const authorMap = {};
    commits.forEach((c) => {
      const a = getAuthor(c);
      if (!authorMap[a]) authorMap[a] = { additions: 0 };
      authorMap[a].additions += c.additions || 0;
    });
    const all    = Object.entries(authorMap).sort((a, b) => b[1].additions - a[1].additions);
    const sorted = all.slice(0, TOP_POLAR);
    // Remonte les métadonnées au parent
    onMeta?.({ shown: sorted.length, total: all.length });

    chartRef.current = new Chart(ref.current, {
      type: "polarArea",
      data: {
        labels: sorted.map(([n]) => n),
        datasets: [{
          data: sorted.map(([, v]) => v.additions),
          backgroundColor: [
            rgba("--vz-danger-rgb", 0.75), rgba("--vz-info-rgb", 0.75),
            rgba("--vz-warning-rgb", 0.75), rgba("--vz-primary-rgb", 0.75),
            rgba("--vz-success-rgb", 0.75), rgba("--vz-secondary-rgb", 0.75),
          ],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { font: { family: "Poppins", size: 11 }, padding: 14, usePointStyle: true } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: +${ctx.raw.toLocaleString("fr-FR")} lignes` } },
        },
        scales: {
          r: {
            ticks: { font: { family: "Poppins", size: 10 }, backdropColor: "transparent" },
            grid:  { color: "rgba(133,141,152,0.15)" },
          },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [commits, onMeta]);

  return <canvas ref={ref} style={{ maxHeight: 260 }} />;
}


// ─── ChartSection — Conteneur des 2 graphiques avec sous-titres dynamiques ───
// Collecte les métadonnées (shown/total) remontées par chaque chart via onMeta
// et affiche un sous-titre transparent "Top N sur X développeurs".
function ChartSection({ commits, stats }) {
  const [pieMeta,   setPieMeta]   = useState(null);   // { shown, total }
  const [polarMeta, setPolarMeta] = useState(null);   // { shown, total }

  // Libellé dynamique : "Top 7 sur 11 développeurs" ou "Tous les 3 développeurs"
  const pieSubtitle = pieMeta
    ? pieMeta.shown < pieMeta.total
      ? `Top ${pieMeta.shown} sur ${pieMeta.total} développeurs`
      : `Tous les ${pieMeta.total} développeurs`
    : "Distribution par membre de l'équipe";

  const polarSubtitle = polarMeta
    ? polarMeta.shown < polarMeta.total
      ? `Top ${polarMeta.shown} sur ${polarMeta.total} développeurs`
      : `Tous les ${polarMeta.total} développeurs`
    : "Volume d'additions de code";

  return (
    <div className="row mb-4">
      {/* Pie — Commits par développeur */}
      <div className="col-xl-6 mb-4 mb-xl-0">
        <div className="commits-chart-card h-100">
          <div className="commits-chart-card-header d-flex align-items-center justify-content-between">
            <div className="flex-grow-1">
              <h4 className="mb-1" style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#1a1f36" }}>
                <i className="ri-pie-chart-line me-2 text-info"></i>Commits par développeur
              </h4>
              <p className="text-muted mb-0 fs-12">{pieSubtitle}</p>
            </div>
            <span className="badge bg-info-subtle text-info fs-12" style={{ padding: "4px 8px", borderRadius: "12px" }}>{stats.uniqueAuthors} devs</span>
          </div>
          <div className="card-body">
            <div style={{ height: 260 }}>
              <ContributorsPieChart commits={commits} onMeta={setPieMeta} />
            </div>
          </div>
        </div>
      </div>

      {/* Polar — Volume d'additions */}
      <div className="col-xl-6">
        <div className="commits-chart-card h-100">
          <div className="commits-chart-card-header d-flex align-items-center justify-content-between">
            <div className="flex-grow-1">
              <h4 className="mb-1" style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#1a1f36" }}>
                <i className="ri-donut-chart-line me-2 text-danger"></i>Volume de contribution
              </h4>
              <p className="text-muted mb-0 fs-12">{polarSubtitle}</p>
            </div>
            <span className="badge bg-danger-subtle text-danger fs-12" style={{ padding: "4px 8px", borderRadius: "12px" }}>
              +{stats.totalAdditions.toLocaleString("fr-FR")} lignes
            </span>
          </div>
          <div className="card-body">
            <div style={{ height: 260 }}>
              <AdditionsPolarChart commits={commits} onMeta={setPolarMeta} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, color, sub }) {
  // Déterminer la couleur d'ombre et d'accentuation en fonction de la couleur active
  const rgbColor = color === "#405189" ? "64, 81, 137" :
                   color === "#0ab39c" ? "10, 179, 156" :
                   color === "#f06548" ? "240, 101, 72" :
                   color === "#299cdb" ? "41, 156, 219" : "64, 81, 137";

  return (
    <div className="kpi-card-wrapper">
      <div className="kpi-card-premium"
        style={{
          cursor: "default",
          '--kpi-accent': color,
          '--kpi-accent-rgb': rgbColor,
        }}>
        {/* Subtle dynamic background gradient glowing effect */}
        <div className="kpi-card-glow-bg" style={{background: `radial-gradient(circle at top right, rgba(${rgbColor}, 0.08), transparent 70%)`}}></div>
        
        {/* Background blob */}
        <div className="kpi-card-blob" style={{opacity: 0.04}}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="180" height="110">
            <path fill={color} d="m189.5-25.8c0 0 20.1 46.2-26.7 71.4 0 0-60 15.4-62.3 65.3-2.2 49.8-50.6 59.3-57.8 61.5-7.2 2.3-60.8 0-60.8 0l-11.9-199.4z"/>
          </svg>
        </div>
        
        <div className="kpi-card-inner">
          <div className="kpi-icon-wrap" style={{background: `${color}12`, color: color, boxShadow: `0 4px 14px rgba(${rgbColor}, 0.15)`}}>
            <i className={icon}></i>
          </div>
          <div className="kpi-text">
            <p className="kpi-label">{label}</p>
            <h4 className="kpi-value" style={{color: "#1e293b"}}>{value}</h4>
            {sub && <p className="kpi-sub"><span className="kpi-sub-badge" style={{background: `${color}10`, color: color}}>{sub}</span></p>}
          </div>
        </div>
        
        {/* Beautiful indicator bar at the bottom */}
        <div className="kpi-active-bar" style={{background: `linear-gradient(90deg, ${color}, rgba(${rgbColor}, 0.4))`}}></div>
      </div>
    </div>
  );
}

// ─── Modal détail commit ──────────────────────────────────────────────────────
function CommitDetailModal({ commit, onClose }) {
  const [shaCopied, setShaCopied] = useState(false);

  // [NEW] Fermeture clavier Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!commit) return null;

  const author = getAuthor(commit);
  const site   = getSite(commit);
  const title  = getCommitTitle(commit);
  const body   = getCommitBody(commit);
  const addPct = commit.total_changes > 0
    ? Math.round(((commit.additions || 0) / commit.total_changes) * 100)
    : 0;

  const handleCopySha = () => {
    navigator.clipboard.writeText(commit.gitlab_commit_id || "");
    setShaCopied(true);
    setTimeout(() => setShaCopied(false), 2000);
  };

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Détail du commit"
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0"
          style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>

          {/* HEADER */}
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-start gap-3">
              <div
                className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14"
                style={{ width: 44, height: 44, background: "linear-gradient(135deg, #405189 0%, #3577f1 100%)" }}
              >
                {getInitials(author)}
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-1"
                  style={{ fontSize: 15, lineHeight: 1.45, wordBreak: "break-word" }}>
                  {title}
                </h5>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="text-muted fs-12 fw-medium">{author}</span>
                  {site && (
                    <span className="badge fs-10 fw-semibold"
                      style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", padding: "2px 8px" }}>
                      {site}
                    </span>
                  )}
                  <span className="text-muted fs-12">
                    <i className="ri-calendar-line me-1"></i>{formatDate(commit.authored_date)}
                  </span>
                  <span className="fs-11 fw-medium px-2"
                    style={{ background: "#f8f9fc", border: "1px solid #e9ecef", borderRadius: 20, color: "#6c757d" }}>
                    il y a {timeAgo(commit.authored_date)}
                  </span>
                </div>
              </div>
              <button className="btn-close flex-shrink-0" style={{ opacity: 0.5 }} onClick={onClose} aria-label="Fermer"></button>
            </div>
          </div>

          {/* BODY */}
          <div className="px-4 py-4">

            {/* SHA */}
            <div className="mb-4">
              <label className="d-block text-uppercase fw-semibold mb-2"
                style={{ fontSize: 10, letterSpacing: 1, color: "#9ca3af" }}>Commit SHA</label>
              <div className="d-flex align-items-center gap-3 px-3 py-2 rounded-3"
                style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}>
                <i className="ri-git-commit-line text-muted fs-15 flex-shrink-0"></i>
                <code className="flex-grow-1 fs-12"
                  style={{ color: "#374151", wordBreak: "break-all", fontFamily: "'SFMono-Regular', monospace" }}>
                  {commit.gitlab_commit_id || "—"}
                </code>
                <button onClick={handleCopySha} className="btn btn-sm flex-shrink-0"
                  style={{
                    fontSize: 11, padding: "3px 12px", borderRadius: 8, whiteSpace: "nowrap", transition: "all .2s",
                    background: shaCopied ? "#dcfce7" : "#fff",
                    border:     shaCopied ? "1px solid #86efac" : "1px solid #d1d5db",
                    color:      shaCopied ? "#16a34a" : "#374151",
                  }}>
                  {shaCopied
                    ? <><i className="ri-check-line me-1"></i>Copié !</>
                    : <><i className="ri-clipboard-line me-1"></i>Copier</>}
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="text-uppercase fw-semibold mb-3" style={{ fontSize: 10, letterSpacing: 1, color: "#9ca3af" }}>
              Statistiques
            </div>
            <div className="mb-4">
              <div className="row g-3 mb-3">
                {[
                  { label: "Additions", value: `+${commit.additions || 0}`,    bg: "#f0fdf4", border: "#d1fae5", color: "#16a34a", sub: "#15803d" },
                  { label: "Deletions", value: `-${commit.deletions || 0}`,    bg: "#fff7f7", border: "#fecaca", color: "#dc2626", sub: "#b91c1c" },
                  { label: "Total",     value: `${commit.total_changes || 0}`, bg: "#f0f9ff", border: "#bae6fd", color: "#0284c7", sub: "#0369a1" },
                ].map((s) => (
                  <div key={s.label} className="col-4">
                    <div className="rounded-3 p-3 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                      <div className="fw-bold mb-1" style={{ fontSize: 24, color: s.color, lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: s.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Barre +/- */}
              <div>
                <div className="d-flex justify-content-between mb-1" style={{ fontSize: 11 }}>
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>+{commit.additions || 0} additions ({addPct}%)</span>
                  <span style={{ color: "#dc2626", fontWeight: 600 }}>-{commit.deletions || 0} deletions ({100 - addPct}%)</span>
                </div>
                <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${addPct}%`, background: "linear-gradient(90deg, #16a34a, #4ade80)", borderRadius: 99 }}></div>
                </div>
              </div>
            </div>

            {/* Message complet */}
            {body && (
              <div className="mb-4">
                <div className="text-uppercase fw-semibold mb-2" style={{ fontSize: 10, letterSpacing: 1, color: "#9ca3af" }}>
                  Message complet
                </div>
                <pre style={{
                  whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 180, overflowY: "auto",
                  background: "#f8f9fc", border: "1px solid #e9ecef", borderRadius: 10,
                  padding: "12px 16px", fontSize: 12, lineHeight: 1.75, color: "#374151", fontFamily: "inherit", margin: 0,
                }}>
                  {body}
                </pre>
              </div>
            )}

            {/* Infos auteur + date */}
            <div className="rounded-3 p-3" style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}>
              <div className="text-uppercase fw-semibold mb-3" style={{ fontSize: 10, letterSpacing: 1, color: "#9ca3af" }}>
                Informations
              </div>
              <div className="row g-3">
                <div className="col-sm-6">
                  <div className="d-flex align-items-center gap-3">
                    <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-12"
                      style={{ width: 36, height: 36, background: "linear-gradient(135deg, #667eea, #764ba2)" }}>
                      {getInitials(author)}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.8 }}>Auteur</div>
                      <div className="fw-semibold text-dark fs-13">{author}</div>
                      {site && (
                        <span style={{ fontSize: 10, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 20, padding: "1px 8px", fontWeight: 600 }}>
                          {site}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="d-flex align-items-center gap-3">
                    <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fs-16"
                      style={{ width: 36, height: 36, background: "#e9ecef", color: "#6c757d" }}>
                      <i className="ri-calendar-check-line"></i>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.8 }}>Date</div>
                      <div className="fw-semibold text-dark fs-13">{formatDate(commit.authored_date)}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>il y a {timeAgo(commit.authored_date)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="px-4 py-3 d-flex align-items-center justify-content-between"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              <i className="ri-hashtag me-1"></i>Commit #{commit.id}
            </span>
            <button className="btn btn-sm" onClick={onClose}
              style={{ fontSize: 12, padding: "5px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 500 }}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Commit Card ──────────────────────────────────────────────────────────────
// [SENIOR UX] Data Lineage : chaque carte affiche clairement
//   • authored_date  = quand le dev a écrit le code (peut être en mars)
//   • Lot #X         = quelle session d'extraction a capturé ce commit (avril)
// Cela évite la confusion "j'ai lancé en avril mais je vois mars".
const LOT_COLORS = [
  { bg: "#dce9ff", text: "#1a56db" },
  { bg: "#d4f5f0", text: "#0a7a6a" },
  { bg: "#ede9fb", text: "#5b21b6" },
  { bg: "#fef3dc", text: "#92400e" },
  { bg: "#fde8e8", text: "#9b1c1c" },
  { bg: "#e8ecf8", text: "#405189" },
];
function getLotColor(lotId) {
  return LOT_COLORS[(lotId || 0) % LOT_COLORS.length];
}

function getCardAccentColor(index) {
  return [
    "#f7b84b", // warning / orange-yellow
    "#f06548", // danger / red-orange
    "#0ab39c", // success / teal
    "#299cdb", // info / light blue
    "#405189", // primary / indigo
    "#3577f1", // secondary / blue
  ][index % 6];
}

function getAvatarGradient(index) {
  return [
    { from: "#f7b84b", to: "#f8cb70" },
    { from: "#f06548", to: "#ff8c6b" },
    { from: "#0ab39c", to: "#06d6a0" },
    { from: "#299cdb", to: "#4db6e4" },
    { from: "#405189", to: "#3577f1" },
    { from: "#8b5cf6", to: "#a78bfa" },
  ][index % 6];
}

function CommitCard({ commit, index, onDetails, lots = [] }) {
  const author = getAuthor(commit);
  const site   = getSite(commit);
  const title  = getCommitTitle(commit);
  const body   = getCommitBody(commit);
  const addPct = commit.total_changes > 0
    ? Math.round(((commit.additions || 0) / commit.total_changes) * 100)
    : 0;

  // [SENIOR] Trouve le lot associé pour afficher la date de capture
  const lot = lots.find(l => l.id === commit.extraction_lot_id);
  const lotColor = getLotColor(commit.extraction_lot_id);

  return (
    <div className="col-xxl-3 col-sm-6 mb-4">
      <div className="commits-card">
        {/* Top colored accent bar matching the index coloring to look premium */}
        <div className="commits-card-accent" style={{ background: `linear-gradient(90deg, ${getCardAccentColor(index)}, #fff)` }}></div>
        
        <div className="commits-card-body">
          {/* Header row: time & badges */}
          <div className="commits-card-header-row mb-3">
            <span className="commits-card-time" title={`Écrit le ${formatDate(commit.authored_date)}`}>
              <i className="ri-time-line me-1"></i>il y a {timeAgo(commit.authored_date)}
            </span>
            
            <div className="d-flex gap-1 align-items-center flex-wrap">
              {commit.extraction_lot_id && (
                <span
                  className="commits-card-lot-badge"
                  title={`Capturé lors de la session d'extraction Lot #${commit.extraction_lot_id}${lot ? ` le ${formatDate(lot.created_at)}` : ""}`}
                  style={{
                    background: lotColor.bg,
                    color: lotColor.text,
                    border: `1px solid ${lotColor.text}33`
                  }}
                >
                  <i className="ri-stack-line me-1"></i>Lot #{commit.extraction_lot_id}
                </span>
              )}
              <span className={`commits-card-id-badge commits-card-id-badge-${getBadgeColor(index)}`}>
                <i className="ri-git-commit-line me-1"></i>#{commit.id}
              </span>
            </div>
          </div>

          {/* User info row */}
          <div className="commits-card-user-row mb-3">
            <div
              className="commits-card-avatar"
              style={{
                background: `linear-gradient(135deg, ${getAvatarGradient(index).from}, ${getAvatarGradient(index).to})`
              }}
            >
              {getInitials(author)}
            </div>
            <div className="commits-card-user-info min-w-0">
              <h5
                className="commits-card-title mb-1"
                title={title}
                onClick={() => onDetails(commit)}
              >
                {title}
              </h5>
              <div className="d-flex align-items-center gap-2 flex-wrap text-muted fs-12">
                <span className="commits-card-author-name"><i className="ri-user-line me-1"></i>{author}</span>
                {site && (
                  <span className="commits-card-site-badge">
                    {site}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Body message preview if present */}
          {body && (
            <div
              className="commits-card-body-preview mb-3"
              onClick={() => onDetails(commit)}
              title="Cliquer pour voir le message complet"
            >
              {truncate(body, 80)}
            </div>
          )}

          {/* Code changes summary */}
          <div className="commits-card-changes-box mt-auto">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="commits-card-diff-numbers">
                <span className="text-success fw-semibold"><i className="ri-add-line"></i>+{commit.additions || 0}</span>
                <span className="ms-2 text-danger fw-semibold"><i className="ri-subtract-line"></i>-{commit.deletions || 0}</span>
              </div>
              <span className="commits-card-diff-total">{commit.total_changes || 0} changes</span>
            </div>
            
            {/* Elegant high fidelity progress bar */}
            <div className="commits-card-progress-bar">
              <div className="commits-card-progress-add" style={{ width: `${addPct}%` }}></div>
              <div className="commits-card-progress-del" style={{ width: `${100 - addPct}%` }}></div>
            </div>
          </div>
        </div>

        {/* Footer row */}
        <div className="commits-card-footer">
          <div className="d-flex align-items-center justify-content-between w-100">
            <span className="commits-card-footer-date" title="Date d'écriture locale">
              <i className="ri-quill-pen-line me-1 text-primary"></i>
              {formatDate(commit.authored_date)}
            </span>
            <button
              className="commits-card-eye-btn"
              onClick={() => onDetails(commit)}
              title="Voir les détails"
            >
              <i className="ri-eye-line"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const INITIAL_FILTERS = {
  project: "all",
  period: "all",
  lot: "all",
  search: "",
  siteId: "all",
  groupId: "all",
  developerId: "all",
  sort: "date",
  excludeMerges: true
};

export default function CommitsPage() {
  const [searchParams] = useSearchParams();

  const [projects,           setProjects]         = useState([]);
  const [periods,            setPeriods]          = useState([]);
  const [lots,               setLots]              = useState([]);
  const [commits,            setCommits]           = useState([]);
  const [loading,            setLoading]           = useState(false);
  const [error,              setError]             = useState(null);
  const [spinning,           setSpinning]          = useState(false);
  const [currentPeriod,      setCurrentPeriod]    = useState(null);
  
  const [filters, setFilters] = useState({
    ...INITIAL_FILTERS,
    project: searchParams.get("project_id") || "all",
    lot: searchParams.get("lot_id") || "all",
    period: searchParams.get("period_id") || "all",
    groupId: searchParams.get("group_id") || "all",
    developerId: searchParams.get("developer_id") || "all",
    siteId: searchParams.get("site_id") || "all",
  });

  const [developers,         setDevelopers]        = useState([]);
  const [groups,             setGroups]            = useState([]);
  const [allSites,           setAllSites]          = useState([]);

  const perPage = 8;

  const isInitialized = useRef(false);

  // Chargement projets, développeurs et groupes
  // Initialisation : Chargement des données de base (une seule fois)
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        const [projRes, perRes, devRes, grpRes, currRes, siteRes] = await Promise.all([
          api.get("/projects"),
          api.get("/periods"),
          api.get("/developers"), // Removed active_only to support historical lots
          api.get("/developer-groups"),
          api.get("/periods/current").catch(() => ({ data: null })),
          api.get("/sites").catch(() => ({ data: [] }))
        ]);
        
        const projData = Array.isArray(projRes.data) ? projRes.data : (projRes.data?.items ?? []);
        const perData = Array.isArray(perRes.data) ? perRes.data : (perRes.data?.items ?? []);
        const devData = Array.isArray(devRes.data) ? devRes.data : (devRes.data?.items ?? []);
        const siteData = Array.isArray(siteRes.data) ? siteRes.data : (siteRes.data?.items ?? []);
        
        setProjects(projData);
        setPeriods(perData);
        setDevelopers(devData);
        setGroups(Array.isArray(grpRes.data) ? grpRes.data : (grpRes.data?.items ?? []));
        setAllSites(siteData);
        setCurrentPeriod(currRes.data);

      } catch (err) {
        console.error("Base data loading error", err);
      }
    };
    fetchBaseData();
  }, []);

  // [SENIOR] URL Context Hydration (Responsive to URL changes)
  useEffect(() => {
    if (projects.length === 0 || periods.length === 0) return;

    const urlDevId = searchParams.get("developer_id");
    const urlSiteId = searchParams.get("site_id");
    const urlLotId = searchParams.get("lot_id");
    const urlProjectId = searchParams.get("project_id");
    const urlPeriodId = searchParams.get("period_id");
    const urlGroupId = searchParams.get("group_id");

    setFilters(prev => {
      let next = { ...prev };
      
      if (urlDevId) next.developerId = urlDevId;
      if (urlSiteId) next.siteId = urlSiteId;
      if (urlGroupId) next.groupId = urlGroupId;
      if (urlLotId) next.lot = urlLotId;
      if (urlProjectId) next.project = urlProjectId;
      if (urlPeriodId) next.period = urlPeriodId;

      // Auto-select current period ONLY if no period is in URL and no lot context
      if (currentPeriod && next.period === "all" && !urlPeriodId && !urlLotId) {
        next.period = String(currentPeriod.id);
      }
      
      return next;
    });
  }, [searchParams, projects, periods, currentPeriod]);

  const handleFilterChange = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  };

  const loadCommits = useCallback(async () => {
    setLoading(true); setSpinning(true);
    try {
      const isGlobal = filters.project === "all";
      const targetId = isGlobal ? "all" : filters.project;

      const params = {};
      if (filters.period      !== "all") params.period_id    = parseInt(filters.period);
      if (filters.lot         !== "all") params.lot_id       = parseInt(filters.lot);
      if (filters.developerId !== "all") params.developer_id = parseInt(filters.developerId);
      params.exclude_merge_commits = filters.excludeMerges;

      const res = await api.get(`/projects/${targetId}/commits`, { params });
      const data = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      
      setCommits(data.map(c => ({
        ...c,
        project_name: c.project_name || projects.find(p => p.id === c.project_id)?.name || "Project"
      })));
      setError(null);
    } catch (err) {
      setError("Impossible de charger les commits.");
    } finally {
      setLoading(false); setSpinning(false);
    }
  }, [filters.project, filters.period, filters.lot, filters.developerId, filters.excludeMerges, projects]);

  useEffect(() => { loadCommits(); }, [loadCommits]);

  // [SENIOR] Fetch contextual extraction lots to define filtering intent
  useEffect(() => {
    const fetchLots = async () => {
      try {
        const isGlobal = filters.project === "all";
        let url = "/extraction-lots?limit=1000";
        if (!isGlobal) {
          const p = projects.find(proj => proj.id === parseInt(filters.project));
          if (p) url = `/extraction-lots?project_id=${p.id}&limit=1000`;
        }
        const res = await api.get(url);
        setLots(res.data || []);
      } catch (err) {
        console.error("Erreur lors du chargement des lots:", err);
        setLots([]);
      }
    };
    if (projects.length > 0) fetchLots();
  }, [filters.project, projects]);


  // [FIX] useMemo remplace useEffect + setState sur le filtre — plus de state dérivé
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase();
    let result = commits;

    if (q) {
      result = result.filter((c) =>
        getCommitTitle(c).toLowerCase().includes(q) ||
        getAuthor(c).toLowerCase().includes(q)      ||
        (c.gitlab_commit_id || "").toLowerCase().includes(q)
      );
    }
    if (filters.siteId !== "all") {
      const targetSiteId = parseInt(filters.siteId);
      result = result.filter((c) => (c.site_id || c.developer?.site_id) === targetSiteId);
    }

    // ✅ [ENTERPRISE PARITY] — Le backend est l'unique Source de Vérité.
    // Le filtre exclude_merge_commits=true est déjà appliqué par le backend (commit_repository.py)
    // avant l'envoi des données. Un filtre côté frontend créerait une incohérence
    // avec les compteurs du Lot (extraction_lots.py) qui comptent les mêmes données.
    // NE PAS RE-FILTRER ICI.

    // [NEW] Filtre Equipe
    if (filters.groupId !== "all") {
      const gId = parseInt(filters.groupId);
      result = result.filter(c => {
         const devGroupIds = (c.developer?.group_ids || []);
         return devGroupIds.map(Number).includes(gId);
      });
    }

    // [NEW] Filtre Auteur (par ID)
    if (filters.developerId !== "all") {
      const targetId = parseInt(filters.developerId);
      result = result.filter(c => c.developer_id === targetId);
    }

    // [NEW] Tri
    return [...result].sort((a, b) => {
      if (filters.sort === "date")    return new Date(b.authored_date) - new Date(a.authored_date);
      if (filters.sort === "author")  return getAuthor(a).localeCompare(getAuthor(b));
      if (filters.sort === "changes") return (b.total_changes || 0) - (a.total_changes || 0);
      return 0;
    });
  }, [commits, filters]);

  const [page, setPage] = useState(1);
  const [detailCommit, setDetailCommit] = useState(null);

  // Reset page sur tout changement de filtre
  useEffect(() => { setPage(1); }, [filters]);

  // ✅ SENIOR INTENT-BASED FILTERING
  // Identification des développeurs ciblés par l'extraction (Intention)
  const trackedDevIds = useMemo(() => {
    // 1. On récupère les IDs via les lots d'extraction (axe session)
    let ids = [];
    if (lots && lots.length > 0) {
      if (filters.lot !== "all") {
        const selected = lots.find(l => String(l.id) === filters.lot);
        if (selected?.developer_id) ids.push(selected.developer_id);
      } else {
        ids = lots.map(l => l.developer_id).filter(Boolean);
      }
    }

    // 2. [SENIOR FIX] On complète avec les IDs présents dans les commits chargés
    // car des commits peuvent exister sans lot spécifique (ex: extraction globale projet)
    const commitDevIds = commits.map(c => c.developer_id).filter(Boolean);
    
    const finalSet = new Set([...ids, ...commitDevIds]);
    return [...finalSet];
  }, [lots, commits, filters.lot]);

  // ✅ SENIOR ROBUSTNESS : Source de vérité = liste globale des sites configurés.
  // On ne dépend plus des lots ou des développeurs chargés pour peupler le dropdown,
  // ce qui garantit une UI stable et prévisible pour la défense.
  // ✅ SENIOR "INTENT-BASED" FILTERING : 
  // On ne montre que les sites présents parmi les développeurs effectivement trackés.
  // Cela évite les "filtres morts" qui mènent à un tableau vide.
  const sites = useMemo(() => {
    if (!developers || developers.length === 0 || !allSites) return [];
    
    const activeSiteIds = new Set(
      developers
        .filter(d => trackedDevIds.includes(d.id))
        .map(d => d.site_id)
        .filter(Boolean)
    );

    if (activeSiteIds.size > 0) {
      return allSites.filter(s => activeSiteIds.has(s.id)).sort((a,b) => a.name.localeCompare(b.name));
    }
    return [...allSites].sort((a,b) => a.name.localeCompare(b.name));
  }, [allSites, developers, trackedDevIds]);

  // ✅ SENIOR AUTO-RESET : Si le site sélectionné n'est plus dans le périmètre actif, 
  // on reset à "all" pour éviter un écran vide incompréhensible.
  useEffect(() => {
    if (filters.siteId !== "all" && sites.length > 0 && !sites.find(s => String(s.id) === filters.siteId)) {
      handleFilterChange("siteId", "all");
    }
  }, [sites, filters.siteId]);


  const groupList = useMemo(() => {
    if (!groups || groups.length === 0) return [];

    // Raffinement : on ne montre que les groupes présents dans le périmètre actuel (lots + site)
    const activeGroupIds = new Set();
    developers
      .filter(d => trackedDevIds.includes(d.id))
      .filter(d => filters.site === "all" || d.site === filters.site)
      .forEach(dev => {
        if (dev.group_ids) dev.group_ids.forEach(gid => activeGroupIds.add(Number(gid)));
      });

    return groups
      .filter(g => activeGroupIds.has(g.id) || filters.group === String(g.id))
      .sort((a,b) => a.name.localeCompare(b.name));
  }, [trackedDevIds, groups, developers, filters.group, filters.site]);

  const authorsList = useMemo(() => {
    if (!developers || developers.length === 0) return [];
    
    // Raffinement : Filtre par Lot de capture (trackedDevIds) ET par Site ET par Groupe
    let filteredDevs = developers.filter(d => trackedDevIds.includes(d.id));
    
    if (filters.siteId !== "all") {
      const sId = parseInt(filters.siteId);
      filteredDevs = filteredDevs.filter(d => d.site_id === sId);
    }

    if (filters.groupId !== "all") {
      const gId = parseInt(filters.groupId);
      filteredDevs = filteredDevs.filter(d => (d.group_ids || []).map(Number).includes(gId));
    }
    
    return filteredDevs
      .map(d => ({ id: d.id, name: d.name || d.gitlab_username }))
      .sort((a,b) => a.name.localeCompare(b.name));
  }, [trackedDevIds, developers, filters.siteId, filters.groupId]);

  // ✅ SENIOR AUTO-RESETS : Cascade descendante
  // 1. Reset Groupe si invalide par rapport au Site
  useEffect(() => {
    if (filters.groupId !== "all" && groupList.length > 0 && !groupList.find(g => String(g.id) === filters.groupId)) {
      handleFilterChange("groupId", "all");
    }
  }, [groupList, filters.groupId]);

  // 2. Reset Auteur si invalide par rapport au Site/Groupe
  useEffect(() => {
    if (filters.developerId !== "all" && authorsList.length > 0 && !authorsList.find(a => String(a.id) === filters.developerId)) {
      handleFilterChange("developerId", "all");
    }
  }, [authorsList, filters.developerId]);

  const stats = useMemo(() => ({
    totalAdditions: filtered.reduce((s, c) => s + (c.additions    || 0), 0),
    totalDeletions: filtered.reduce((s, c) => s + (c.deletions    || 0), 0),
    uniqueAuthors:  new Set(filtered.map(getAuthor)).size,
    avgChanges:     filtered.length
      ? Math.round(filtered.reduce((s, c) => s + (c.total_changes || 0), 0) / filtered.length)
      : 0,
  }), [filtered]);

  const selectedProject = projects.find((p) => p.id === parseInt(filters.project));
  const totalPages      = Math.ceil(filtered.length / perPage);
  const paginated       = filtered.slice((page - 1) * perPage, page * perPage);
  const activeFilterCount = Object.keys(filters).reduce((acc, key) => {
    if (key === "sort") return acc;
    return acc + (filters[key] !== INITIAL_FILTERS[key] ? 1 : 0);
  }, 0);

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Modal */}
        {detailCommit && (
          <CommitDetailModal commit={detailCommit} onClose={() => setDetailCommit(null)} />
        )}

        {/* Page Title */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-git-commit-line me-2 text-primary"></i>
                Commits {filters.excludeMerges ? "(Hors Merges)" : "(Flux Brut)"}
                {/* [NEW] Badge total visible */}
                {filtered.length > 0 && (
                  <span className="badge bg-primary-subtle text-primary ms-2 fs-13 fw-normal align-middle">
                    {filtered.length}
                  </span>
                )}
                {/* [SENIOR] Badge de Certification */}
                <span 
                  className={`badge border border-${filters.excludeMerges ? "success" : "warning"} text-${filters.excludeMerges ? "success" : "warning"} ms-3 fs-10 fw-medium px-2 py-1`} 
                  style={{ verticalAlign: "middle", background: filters.excludeMerges ? "#f0fdf4" : "#fffbeb" }}
                >
                  <i className={filters.excludeMerges ? "ri-shield-check-line me-1" : "ri-error-warning-line me-1"}></i>
                  {filters.excludeMerges ? "CONTRIBUTION CERTIFIÉE" : "ANALYSE BRUTE"}
                </span>
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item active">Commits</li>
              </ol>
            </div>
          </div>
        </div>

        {/* ── Bandeau de contexte Lot (visible uniquement depuis ExtractionLotsPage) */}
        {filters.lot !== "all" && (() => {
          const activeLot = lots.find(l => String(l.id) === String(filters.lot));
          const activeDev = developers.find(d => String(d.id) === String(filters.developerId));
          return (
            <div className="row mb-3">
              <div className="col-12">
                <div className="alert alert-info border-0 d-flex align-items-center gap-3 py-2 px-4" 
                  style={{ borderRadius: 10, background: "linear-gradient(90deg, #eff6ff, #f0fdf4)", borderLeft: "4px solid #3b82f6 !important" }}>
                  <i className="ri-stack-line fs-18 text-primary"></i>
                  <div className="flex-grow-1">
                    <span className="fw-bold text-primary me-2">Extraction Lot #{filters.lot}</span>
                    {activeDev && <span className="text-dark me-2">— {activeDev.name || activeDev.gitlab_username}</span>}
                    {activeLot && <span className="text-muted fs-12">| Capturé le {new Date(activeLot.created_at || activeLot.started_at).toLocaleDateString("fr-FR")}</span>}
                    <span className="badge bg-primary-subtle text-primary ms-2 fs-11">
                      {commits.length} commit{commits.length !== 1 ? "s" : ""} dans ce lot
                    </span>
                  </div>
                  <a href="/extraction-lots" className="btn btn-sm btn-soft-primary d-flex align-items-center gap-1" style={{ whiteSpace: "nowrap" }}>
                    <i className="ri-arrow-left-line"></i> Retour aux lots
                  </a>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Toolbar Premium ────────────────────────────────────────────────── */}
        <div className="commits-filter-card mb-4">
          <div className="commits-filter-header">
            <div className="commits-filter-header-left">
              <div className="commits-filter-icon">
                <i className="ri-equalizer-3-line"></i>
              </div>
              <div>
                <span className="commits-filter-title">Filtres</span>
                {activeFilterCount > 0 && (
                  <span className="commits-filter-badge">{activeFilterCount} actif{activeFilterCount > 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
            <div className="d-flex gap-2">
              <button
                className="commits-btn-refresh"
                onClick={loadCommits}
                disabled={loading}
                title="Rafraîchir"
              >
                <i className={spinning ? "ri-restart-line commits-spin" : "ri-restart-line"}></i>
                Rafraîchir
              </button>
              {activeFilterCount > 0 && (
                <button
                  className="commits-btn-reset"
                  onClick={() => setFilters(INITIAL_FILTERS)}
                  title="Réinitialiser tous les filtres"
                >
                  <i className="ri-filter-off-line"></i>
                  Réinitialiser
                </button>
              )}
              <button
                className="commits-btn-export"
                onClick={() => exportCommitsCSV(filtered, filters.project === "all" ? "global" : projects.find(p=>p.id===parseInt(filters.project))?.name)}
                title="Exporter CSV"
              >
                <i className="ri-download-2-line"></i>
                Export CSV
              </button>
            </div>
          </div>

          <div className="commits-filter-body">
            {/* Recherche */}
            <div className="commits-filter-group">
              <label className="commits-filter-label">
                <i className="ri-search-line"></i> Recherche
              </label>
              <div className="commits-search-wrap">
                <i className="ri-search-line commits-search-icon"></i>
                <input
                  type="text"
                  className="commits-filter-input commits-search-input"
                  placeholder="SHA, auteur, message…"
                  value={filters.search}
                  onChange={(e) => handleFilterChange("search", e.target.value)}
                />
              </div>
            </div>

            {/* Période */}
            <div className="commits-filter-group">
              <label className="commits-filter-label">
                <i className="ri-calendar-line"></i> Période
              </label>
              <select
                className="commits-filter-select"
                value={filters.period}
                onChange={(e) => handleFilterChange("period", e.target.value)}
              >
                <option value="all">Toutes les périodes</option>
                {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Projet */}
            <div className="commits-filter-group">
              <label className="commits-filter-label">
                <i className="ri-git-repository-line"></i> Projet
              </label>
              <select
                className="commits-filter-select"
                value={filters.project}
                onChange={(e) => handleFilterChange("project", e.target.value)}
              >
                <option value="all">Tous les projets</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Développeur */}
            <div className="commits-filter-group">
              <label className="commits-filter-label">
                <i className="ri-user-line"></i> Développeur
              </label>
              <select
                className="commits-filter-select"
                value={filters.developerId}
                onChange={(e) => handleFilterChange("developerId", e.target.value)}
              >
                <option value="all">Tous les développeurs</option>
                {authorsList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Tri */}
            <div className="commits-filter-group">
              <label className="commits-filter-label">
                <i className="ri-sort-desc"></i> Tri par
              </label>
              <select
                className="commits-filter-select"
                value={filters.sort}
                onChange={(e) => handleFilterChange("sort", e.target.value)}
              >
                <option value="date">Date</option>
                <option value="changes">Changes</option>
                <option value="author">Auteur</option>
              </select>
            </div>

            {/* Type de flux */}
            <div className="commits-filter-group">
              <label className="commits-filter-label">
                <i className="ri-git-branch-line"></i> Type de flux
              </label>
              <div className="commits-toggle-wrap">
                <div
                  className={`commits-toggle ${filters.excludeMerges ? "commits-toggle-active" : ""}`}
                  onClick={() => handleFilterChange("excludeMerges", !filters.excludeMerges)}
                  title="Exclure les commits de merge pour une analyse de contribution pure"
                >
                  <div className="commits-toggle-thumb"></div>
                </div>
                <span className="commits-toggle-label">
                  {filters.excludeMerges ? "Contribution Pure" : "Flux Complet"}
                </span>
                <input
                  type="checkbox"
                  id="excludeMergesSwitch"
                  checked={filters.excludeMerges}
                  onChange={(e) => handleFilterChange("excludeMerges", e.target.checked)}
                  style={{ display: "none" }}
                />
              </div>
            </div>
          </div>

          {/* Active filter tags */}
          {activeFilterCount > 0 && (
            <div className="commits-filter-tags">
              {filters.search && (
                <span className="commits-filter-tag">
                  <i className="ri-search-line"></i> {filters.search}
                  <button onClick={() => handleFilterChange("search", "")} className="commits-filter-tag-remove">×</button>
                </span>
              )}
              {filters.period !== "all" && (
                <span className="commits-filter-tag commits-filter-tag-info">
                  <i className="ri-calendar-line"></i> {periods.find(p=>p.id===parseInt(filters.period))?.name}
                  <button onClick={() => handleFilterChange("period", "all")} className="commits-filter-tag-remove">×</button>
                </span>
              )}
              {filters.project !== "all" && (
                <span className="commits-filter-tag commits-filter-tag-primary">
                  <i className="ri-git-repository-line"></i> {projects.find(p=>p.id===parseInt(filters.project))?.name}
                  <button onClick={() => handleFilterChange("project", "all")} className="commits-filter-tag-remove">×</button>
                </span>
              )}
              {filters.developerId !== "all" && (
                <span className="commits-filter-tag commits-filter-tag-secondary">
                  <i className="ri-user-line"></i> {developers.find(d=>String(d.id)===filters.developerId)?.name}
                  <button onClick={() => handleFilterChange("developerId", "all")} className="commits-filter-tag-remove">×</button>
                </span>
              )}
              {filters.lot !== "all" && (
                <span className="commits-filter-tag commits-filter-tag-info">
                  <i className="ri-stack-line"></i> Session #{filters.lot}
                  <button onClick={() => handleFilterChange("lot", "all")} className="commits-filter-tag-remove">×</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Stat Cards Premium ──────────────────────────────────────────────── */}
        {(filters.period !== "all" || filters.project !== "all" || commits.length > 0) && !loading && (
          <div className="commits-kpi-grid-row">
            <KPICard
              icon="ri-git-commit-line"
              label="Total Commits"
              value={filtered.length}
              color="#405189"
              sub={`${stats.uniqueAuthors} développeur${stats.uniqueAuthors > 1 ? "s" : ""}`}
            />
            <KPICard
              icon="ri-add-circle-line"
              label="Total Additions"
              value={`+${stats.totalAdditions.toLocaleString("fr-FR")}`}
              color="#0ab39c"
              sub="Lignes ajoutées"
            />
            <KPICard
              icon="ri-subtract-line"
              label="Total Deletions"
              value={`-${stats.totalDeletions.toLocaleString("fr-FR")}`}
              color="#f06548"
              sub="Lignes supprimées"
            />
            <KPICard
              icon="ri-file-code-line"
              label="Moy. Changes"
              value={stats.avgChanges.toLocaleString("fr-FR")}
              color="#299cdb"
              sub="Par commit"
            />
          </div>
        )}

        {/* ── Charts — seulement si données ──────────────────────────────────── */}
        {filtered.length > 0 && (
          <ChartSection commits={filtered} stats={stats} />
        )}

        {loading && <LoadingSpinner text="Chargement des commits..." />}

        {!loading && error && (
          <div className="alert alert-warning d-flex align-items-center gap-3">
            <i className="ri-information-line fs-3 flex-shrink-0"></i>
            <div>
              {error}
              <a href="/extraction" className="btn btn-sm btn-primary ms-3">Lancer une extraction</a>
            </div>
          </div>
        )}

        {!loading && !error && paginated.length > 0 && (
          <>
            <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
              <p className="text-muted fs-13 mb-0">
                <i className="ri-git-commit-line me-1"></i>
                <strong>{filtered.length}</strong> commit{filtered.length > 1 ? "s" : ""}
                {filters.search && <span className="ms-1">pour « <strong>{filters.search}</strong> »</span>}
                {filtered.length < commits.length && (
                  <span className="text-warning ms-1">(sur {commits.length} total)</span>
                )}
              </p>
              <span className="text-muted fs-12">
                Cliquez sur <i className="ri-eye-line"></i> pour voir le message complet
              </span>
            </div>

            <div className="row">
              {paginated.map((commit, index) => (
                <CommitCard key={commit.id} commit={commit} index={index} onDetails={setDetailCommit} lots={lots} />
              ))}
            </div>

            <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />
          </>
        )}

        {/* ── Empty state : filtre actif mais 0 résultat de recherche ──────── */}
        {!loading && !error && filtered.length === 0 && commits.length > 0 && (
          <div className="text-center py-5">
            <i className="ri-search-line fs-1 text-muted d-block mb-3 opacity-50"></i>
            <p className="text-muted fs-14 fw-semibold mb-1">Aucun commit ne correspond à votre recherche</p>
            <p className="text-muted fs-13 mb-3">Essayez avec d'autres critères ou réinitialisez les filtres.</p>
            <button className="btn btn-soft-primary btn-sm" onClick={()=>setFilters(INITIAL_FILTERS)}>
              <i className="ri-refresh-line me-1"></i>Réinitialiser les filtres
            </button>
          </div>
        )}

        {/* ── Empty state : période ou projet sélectionné mais aucun commit ── */}
        {!loading && !error && commits.length === 0 && (filters.period !== "all" || filters.project !== "all") && (
          <div className="card border-0" style={{borderRadius:16, overflow:"hidden"}}>
            <div className="card-body py-5 text-center">
              <div className="mb-3" style={{width:72,height:72,borderRadius:"50%",background:"#f0f4ff",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
                <i className="ri-git-commit-line" style={{fontSize:32,color:"#405189"}}></i>
              </div>
              <h5 className="fw-semibold mb-2" style={{color:"#212529"}}>Aucun commit pour cette période</h5>
              <p className="text-muted fs-13 mb-4" style={{maxWidth:400,margin:"0 auto 20px"}}>
                Les données ne sont pas encore extraites pour cette combinaison de filtres.
                Lancez une extraction depuis le Moteur d'Extraction pour importer les commits GitLab.
              </p>
              <div className="d-flex gap-2 justify-content-center flex-wrap">
                <a href="/extraction" className="btn btn-primary btn-sm">
                  <i className="ri-download-cloud-2-line me-1"></i>Lancer une extraction
                </a>
                <button className="btn btn-soft-secondary btn-sm" onClick={()=>setFilters(INITIAL_FILTERS)}>
                  <i className="ri-filter-off-line me-1"></i>Réinitialiser les filtres
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state initial : rien sélectionné ───────────────────────── */}
        {filters.project === "all" && filters.period === "all" && !loading && !error && commits.length === 0 && (
          <div className="card border-0" style={{borderRadius:16}}>
            <div className="card-body py-5 text-center">
              <div className="mb-3" style={{width:72,height:72,borderRadius:"50%",background:"#f0f4ff",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
                <i className="ri-git-repository-line" style={{fontSize:32,color:"#405189"}}></i>
              </div>
              <h5 className="fw-semibold mb-2" style={{color:"#212529"}}>Sélectionnez un projet ou une période</h5>
              <p className="text-muted fs-13 mb-0">Ou utilisez les filtres ci-dessus pour explorer les commits.</p>
            </div>
          </div>
        )}

      </div>

      <style>{`
        /* ── Commits Filter Card ─────────────────────────────────────────────── */
        .commits-filter-card {
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 4px 24px rgba(64,81,137,0.08);
          border: 1px solid rgba(64,81,137,0.08);
          overflow: hidden;
          transition: box-shadow .25s;
        }
        .commits-filter-card:hover { box-shadow: 0 8px 32px rgba(64,81,137,0.13); }

        .commits-filter-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid #f1f4f9;
          background: linear-gradient(90deg, #f8f9ff 0%, #fff 100%);
        }
        .commits-filter-header-left { display: flex; align-items: center; gap: 12px; }
        .commits-filter-icon {
          width: 38px; height: 38px; border-radius: 10px;
          background: linear-gradient(135deg, #405189, #3577f1);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 17px; flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(64,81,137,0.3);
        }
        .commits-filter-title { font-weight: 700; font-size: 15px; color: #1a1f36; }
        .commits-filter-badge {
          display: inline-block;
          margin-left: 8px;
          background: linear-gradient(135deg, #405189, #3577f1);
          color: #fff;
          font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 20px;
          vertical-align: middle;
        }

        .commits-filter-body {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          padding: 20px 24px;
          align-items: flex-end;
        }
        .commits-filter-group {
          display: flex; flex-direction: column; gap: 6px;
          flex: 1; min-width: 160px;
        }
        .commits-filter-label {
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.8px;
          color: #8896ab;
          display: flex; align-items: center; gap: 5px; margin: 0;
        }
        .commits-filter-label i { font-size: 11px; }
        .commits-filter-select, .commits-filter-input {
          height: 38px;
          border: 1.5px solid #e8edf5;
          border-radius: 10px;
          padding: 0 12px;
          font-size: 13px;
          color: #1a1f36;
          background: #f8faff;
          transition: border-color .2s, box-shadow .2s;
          outline: none;
          width: 100%;
          appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238896ab' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
          padding-right: 32px;
        }
        .commits-filter-select:focus, .commits-filter-input:focus {
          border-color: #405189;
          box-shadow: 0 0 0 3px rgba(64,81,137,0.12);
          background-color: #fff;
        }
        .commits-search-wrap { position: relative; }
        .commits-search-icon {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
          color: #8896ab; font-size: 14px; pointer-events: none;
        }
        .commits-search-input {
          padding-left: 36px !important;
          background-image: none !important;
        }

        /* Toggle switch */
        .commits-toggle-wrap { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
        .commits-toggle {
          width: 42px; height: 24px; border-radius: 12px;
          background: #e2e8f0;
          position: relative; cursor: pointer;
          transition: background .25s;
          flex-shrink: 0;
        }
        .commits-toggle.commits-toggle-active { background: linear-gradient(135deg, #0ab39c, #06d6a0); }
        .commits-toggle-thumb {
          width: 18px; height: 18px; border-radius: 50%;
          background: #fff;
          position: absolute; top: 3px; left: 3px;
          transition: left .25s;
          box-shadow: 0 2px 5px rgba(0,0,0,0.18);
        }
        .commits-toggle.commits-toggle-active .commits-toggle-thumb { left: 21px; }
        .commits-toggle-label { font-size: 12px; font-weight: 600; color: #495057; white-space: nowrap; }

        /* Filter tag strip */
        .commits-filter-tags {
          display: flex; flex-wrap: wrap; gap: 8px;
          padding: 12px 24px;
          border-top: 1px dashed #e8edf5;
          background: #fafbff;
        }
        .commits-filter-tag {
          display: inline-flex; align-items: center; gap: 5px;
          background: #f0f4ff; border: 1px solid #c7d4f5;
          color: #405189; font-size: 11px; font-weight: 600;
          padding: 4px 10px; border-radius: 20px;
        }
        .commits-filter-tag-info { background: #e8f4fb; border-color: #9fd3ef; color: #299cdb; }
        .commits-filter-tag-primary { background: #eef2ff; border-color: #c5cfef; color: #405189; }
        .commits-filter-tag-secondary { background: #f4f5f7; border-color: #c4c8d4; color: #495057; }
        .commits-filter-tag-remove {
          background: none; border: none; cursor: pointer;
          font-size: 13px; line-height: 1; color: inherit;
          opacity: 0.6; padding: 0; margin-left: 2px;
          transition: opacity .15s;
        }
        .commits-filter-tag-remove:hover { opacity: 1; }

        /* Action buttons */
        .commits-btn-refresh, .commits-btn-reset, .commits-btn-export {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 10px;
          font-size: 12px; font-weight: 600;
          border: none; cursor: pointer;
          transition: all .2s; white-space: nowrap;
        }
        .commits-btn-refresh {
          background: #f0f4ff; color: #405189;
          border: 1.5px solid #c7d4f5;
        }
        .commits-btn-refresh:hover { background: #e0e8ff; transform: translateY(-1px); }
        .commits-btn-refresh:disabled { opacity: 0.55; cursor: not-allowed; }
        .commits-btn-reset {
          background: #fff0ed; color: #f06548;
          border: 1.5px solid #f8c4ba;
        }
        .commits-btn-reset:hover { background: #ffe4de; transform: translateY(-1px); }
        .commits-btn-export {
          background: linear-gradient(135deg, #d1fae5, #a7f3d0);
          border: 1.5px solid #6ee7b7;
          color: #065f46;
        }
        .commits-btn-export:hover {
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          border-color: #059669;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
          transform: translateY(-1px);
        }

        /* ── KPI Grid ─────────────────────────────────────────── */
        .commits-kpi-grid-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
          margin-bottom: 28px;
        }
        @media (max-width: 1200px) { .commits-kpi-grid-row { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 576px)  { .commits-kpi-grid-row { grid-template-columns: 1fr; } }

        .kpi-card-wrapper { display: flex; flex-direction: column; }

        .kpi-card-premium {
          position: relative;
          overflow: hidden;
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 20px;
          padding: 24px 20px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        
        .kpi-card-premium:hover {
          transform: translateY(-5px);
          border-color: var(--kpi-accent);
          box-shadow: 0 20px 30px -8px rgba(var(--kpi-accent-rgb), 0.18);
        }
        
        .kpi-card-glow-bg {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
          opacity: 0.5;
        }
        .kpi-card-premium:hover .kpi-card-glow-bg {
          opacity: 1;
        }
        
        .kpi-card-blob {
          position: absolute;
          top: -12px; right: -12px;
          pointer-events: none;
          transition: transform 0.4s ease;
        }
        .kpi-card-premium:hover .kpi-card-blob {
          transform: scale(1.15) rotate(5deg);
        }
        
        .kpi-card-inner {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .kpi-icon-wrap {
          width: 52px; height: 52px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          flex-shrink: 0;
          transition: all 0.3s ease;
        }
        .kpi-card-premium:hover .kpi-icon-wrap { 
          transform: scale(1.1) rotate(-8deg); 
        }
        
        .kpi-text { flex: 1; }
        
        .kpi-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .08em;
          color: #64748b;
          margin-bottom: 6px;
        }
        
        .kpi-value {
          font-size: 28px;
          font-weight: 800;
          margin-bottom: 0;
          line-height: 1.1;
          letter-spacing: -1px;
        }
        
        .kpi-sub {
          font-size: 11px;
          margin-top: 8px;
          margin-bottom: 0;
        }
        
        .kpi-sub-badge {
          padding: 3px 8px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 10px;
          display: inline-block;
        }
        
        .kpi-active-bar {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 4px;
          border-radius: 0 0 20px 20px;
          opacity: 0.3;
          transition: opacity 0.3s ease;
        }
        .kpi-card-premium:hover .kpi-active-bar {
          opacity: 1;
        }

        /* Spin animation */
        .commits-spin { animation: commits-spin-anim 1s linear infinite; }
        @keyframes commits-spin-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* ── Chart Cards ────────────────────────────────────────────────────── */
        .commits-chart-card {
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 4px 24px rgba(64,81,137,0.08);
          border: 1px solid rgba(64,81,137,0.08);
          overflow: hidden;
          transition: box-shadow .25s, transform .25s;
        }
        .commits-chart-card:hover {
          box-shadow: 0 8px 32px rgba(64,81,137,0.13);
          transform: translateY(-2px);
        }
        .commits-chart-card-header {
          padding: 16px 24px;
          border-bottom: 1px dashed #e8edf5;
          background: linear-gradient(90deg, #f8f9ff 0%, #fff 100%);
        }

        /* ── Commit Cards ───────────────────────────────────────────────────── */
        .commits-card {
          position: relative;
          background: #fff;
          border-radius: 20px;
          border: 1px solid rgba(64,81,137,0.08);
          box-shadow: 0 4px 20px rgba(64,81,137,0.07);
          overflow: hidden;
          transition: transform .25s ease, box-shadow .25s ease;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .commits-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 12px 30px rgba(64,81,137,0.15);
        }
        .commits-card-accent {
          height: 4px;
          width: 100%;
        }
        .commits-card-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          flex-grow: 1;
        }
        .commits-card-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .commits-card-time {
          font-size: 11px;
          color: #8896ab;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
        }
        .commits-card-time i {
          font-size: 12px;
          color: #a0aec0;
        }
        .commits-card-lot-badge {
          border-radius: 20px;
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          cursor: help;
        }
        .commits-card-id-badge {
          border-radius: 6px;
          padding: 2px 7px;
          font-size: 10px;
          font-weight: 700;
          font-family: 'SFMono-Regular', Consolas, monospace;
          display: inline-flex;
          align-items: center;
        }
        .commits-card-id-badge-primary { background: #e8ecf8; color: #405189; border: 1px solid #c7d2f0; }
        .commits-card-id-badge-success { background: #d4f5f0; color: #0a7a6a; border: 1px solid #a3e2d7; }
        .commits-card-id-badge-info { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
        .commits-card-id-badge-warning { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .commits-card-id-badge-danger { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        .commits-card-id-badge-secondary { background: #f4f5f7; color: #495057; border: 1px solid #e2e8f0; }

        .commits-card-user-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .commits-card-avatar {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          flex-shrink: 0;
          box-shadow: 0 4px 10px rgba(0,0,0,0.08);
        }
        .commits-card-title {
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
          margin: 0;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          cursor: pointer;
          transition: color .2s;
        }
        .commits-card-title:hover {
          color: #405189;
        }
        .commits-card-author-name {
          font-weight: 600;
          color: #64748b;
        }
        .commits-card-site-badge {
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
          border-radius: 20px;
          padding: 1px 7px;
          font-size: 9.5px;
          font-weight: 700;
        }
        .commits-card-body-preview {
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 11.5px;
          color: #64748b;
          line-height: 1.5;
          cursor: pointer;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          transition: background .2s, border-color .2s;
        }
        .commits-card-body-preview:hover {
          background: #f1f5f9;
          border-color: #e2e8f0;
        }

        .commits-card-changes-box {
          border-top: 1px dashed #f1f5f9;
          padding-top: 12px;
        }
        .commits-card-diff-numbers {
          font-size: 12px;
          font-weight: 600;
        }
        .commits-card-diff-total {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 500;
        }
        .commits-card-progress-bar {
          height: 6px;
          background: #f1f5f9;
          border-radius: 99px;
          overflow: hidden;
          display: flex;
        }
        .commits-card-progress-add {
          height: 100%;
          background: linear-gradient(90deg, #10b981, #34d399);
          border-radius: 99px 0 0 99px;
        }
        .commits-card-progress-del {
          height: 100%;
          background: linear-gradient(90deg, #ef4444, #f87171);
          border-radius: 0 99px 99px 0;
        }

        .commits-card-footer {
          padding: 12px 20px;
          background: #fafbfc;
          border-top: 1px dashed #e8edf5;
          display: flex;
          align-items: center;
        }
        .commits-card-footer-date {
          font-size: 11.5px;
          color: #64748b;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
        }
        .commits-card-footer-date i {
          font-size: 13px;
        }
        .commits-card-eye-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #fff;
          border: 1px solid #d1d5db;
          color: #374151;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all .2s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.03);
          outline: none;
        }
        .commits-card-eye-btn:hover {
          background: #f0f4ff;
          border-color: #a5b4fc;
          color: #405189;
          transform: scale(1.1);
          box-shadow: 0 4px 8px rgba(64,81,137,0.15);
        }
      `}</style>
    </div>
  );
}
