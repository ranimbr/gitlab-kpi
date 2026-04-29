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
      <div className="col-xl-6">
        <div className="card h-100">
          <div className="card-header d-flex align-items-center border-bottom-dashed">
            <div className="flex-grow-1">
              <h4 className="card-title mb-1">
                <i className="ri-pie-chart-line me-2 text-info"></i>Commits par développeur
              </h4>
              <p className="text-muted mb-0 fs-12">{pieSubtitle}</p>
            </div>
            <span className="badge bg-info-subtle text-info fs-12">{stats.uniqueAuthors} devs</span>
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
        <div className="card h-100">
          <div className="card-header d-flex align-items-center border-bottom-dashed">
            <div className="flex-grow-1">
              <h4 className="card-title mb-1">
                <i className="ri-donut-chart-line me-2 text-danger"></i>Volume de contribution
              </h4>
              <p className="text-muted mb-0 fs-12">{polarSubtitle}</p>
            </div>
            <span className="badge bg-danger-subtle text-danger fs-12">
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
    <div className="col-xxl-3 col-sm-6">
      <div className="card card-height-100">
        <div className="card-body">
          <div className="d-flex flex-column h-100">

            {/* ── Header : timing + badges ─────────────────────── */}
            <div className="d-flex mb-2 align-items-start gap-1 flex-wrap">
              <div className="flex-grow-1">
                <p className="text-muted mb-1 fs-12">
                  <i className="ri-time-line me-1"></i>il y a {timeAgo(commit.authored_date)}
                </p>
              </div>
              {/* Badge Lot — data lineage */}
              {commit.extraction_lot_id && (
                <span
                  title={`Capturé lors de la session d'extraction Lot #${commit.extraction_lot_id}${lot ? ` le ${formatDate(lot.created_at)}` : ""}`}
                  style={{
                    background: lotColor.bg, color: lotColor.text,
                    borderRadius: 20, padding: "2px 8px",
                    fontSize: 10, fontWeight: 700,
                    cursor: "help", whiteSpace: "nowrap",
                    border: `1px solid ${lotColor.text}22`,
                  }}
                >
                  <i className="ri-stack-line me-1"></i>Lot #{commit.extraction_lot_id}
                </span>
              )}
              <span className={`badge bg-${getBadgeColor(index)}-subtle text-${getBadgeColor(index)}`}>
                <i className="ri-git-commit-line me-1"></i>#{commit.id}
              </span>
            </div>


            <div className="d-flex mb-2">
              <div className="flex-shrink-0 me-3">
                <div className="avatar-sm">
                  <span className={`avatar-title ${getCardBgColor(index)} text-${getBadgeColor(index)} rounded fs-14 fw-bold`}>
                    {getInitials(author)}
                  </span>
                </div>
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5
                  className="mb-1 fs-14 fw-semibold text-body"
                  title={title}
                  style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.4, maxHeight: "2.8em", wordBreak: "break-word" }}
                >
                  {title}
                </h5>
                <p className="text-muted mb-0 fs-12">
                  <i className="ri-user-line me-1"></i>{author}
                  {site && <span className="badge bg-info-subtle text-info ms-2 fs-10">{site}</span>}
                </p>
              </div>
            </div>

            {body && (
              <div
                className="bg-light rounded p-2 mb-2 fs-11 text-muted"
                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word", lineHeight: 1.5, cursor: "pointer" }}
                onClick={() => onDetails(commit)}
                title="Cliquer pour voir le message complet"
              >
                {truncate(body, 80)}
              </div>
            )}

            <div className="mt-auto">
              <div className="d-flex mb-2 align-items-center">
                <div className="flex-grow-1 fs-12">
                  <span className="text-success fw-semibold"><i className="ri-add-line"></i>+{commit.additions || 0}</span>
                  <span className="ms-2 text-danger fw-semibold"><i className="ri-subtract-line"></i>-{commit.deletions || 0}</span>
                </div>
                <span className="text-muted fs-12">{commit.total_changes || 0} changes</span>
              </div>
              <div className="progress progress-sm animated-progress">
                <div className="progress-bar bg-success" style={{ width: `${addPct}%` }}></div>
                <div className="progress-bar bg-danger"  style={{ width: `${100 - addPct}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer : double date (authored vs capturé) ───────── */}
        <div className="card-footer bg-transparent border-top-dashed py-2">
          <div className="d-flex align-items-center flex-wrap gap-1">
            <div className="flex-grow-1">
              <span
                className={`avatar-title avatar-xxs rounded-circle bg-${getBadgeColor(index)}`}
                style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10 }}
              >
                {getInitials(author)}
              </span>
            </div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              {/* Date authored (écriture du code) */}
              <span
                className="text-muted fs-11"
                title="authored_date : date à laquelle le développeur a écrit ce commit dans son environnement local"
              >
                <i className="ri-quill-pen-line me-1 align-bottom" style={{ color: "#405189" }}></i>
                {formatDate(commit.authored_date)}
              </span>
              <button className="btn btn-xs btn-soft-primary py-0 px-2" style={{ fontSize: 10 }}
                onClick={() => onDetails(commit)} title="Voir détails">
                <i className="ri-eye-line"></i>
              </button>
            </div>
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
  site: "all",
  group: "all",
  author: "all",
  sort: "date",
  excludeMerges: true // [SENIOR] Default to certified human contribution (excludes noise)
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
    group: searchParams.get("group_id") || "all",
    // Site and Author will be hydrated in useEffect once meta-data is ready
  });

  const [developers,         setDevelopers]        = useState([]);
  const [groups,             setGroups]            = useState([]);
  const [allSites,           setAllSites]          = useState([]);

  const perPage = 8;

  const isInitialized = useRef(false);

  // Chargement projets, développeurs et groupes
  // Initialisation : Projets, Périodes, Développeurs, Groupes
  useEffect(() => {
    const initData = async () => {
      try {
        const [projRes, perRes, devRes, grpRes, currRes, siteRes] = await Promise.all([
          api.get("/projects"),
          api.get("/periods"),
          api.get("/developers?active_only=true"),
          api.get("/developer-groups?active_only=true"),
          api.get("/periods/current").catch(() => ({ data: null })),
          api.get("/sites?active_only=true").catch(() => ({ data: [] }))
        ]);
        
        const projData = Array.isArray(projRes.data) ? projRes.data : (projRes.data?.items ?? []);
        const perData = Array.isArray(perRes.data) ? perRes.data : (perRes.data?.items ?? []);
        const devData = Array.isArray(devRes.data) ? devRes.data : (devRes.data?.items ?? []);
        const siteData = Array.isArray(siteRes.data) ? siteRes.data : (siteRes.data?.items ?? []);
        const cur = currRes.data;

        setProjects(projData);
        setPeriods(perData);
        setDevelopers(devData);
        setGroups(Array.isArray(grpRes.data) ? grpRes.data : (grpRes.data?.items ?? []));
        setAllSites(siteData);
        setCurrentPeriod(cur);

        // [SENIOR] URL Context Hydration
        const urlDevId = searchParams.get("developer_id");
        const urlSiteId = searchParams.get("site_id");
        
        setFilters(prev => {
          let next = { ...prev };
          
          if (urlDevId) {
            const dev = devData.find(d => String(d.id) === urlDevId);
            if (dev) next.author = dev.name || dev.gitlab_username;
          }
          
          if (urlSiteId) {
            const site = siteData.find(s => String(s.id) === urlSiteId);
            if (site) next.site = site.name;
          }

          const urlLotId = searchParams.get("lot_id");
          const urlProjectId = searchParams.get("project_id");
          if (urlLotId) next.lot = urlLotId;
          if (urlProjectId) next.project = urlProjectId;

          // Auto-select current period if none selected and NOT in lot/session context
          if (cur && next.period === "all" && !searchParams.get("period_id") && !searchParams.get("lot_id")) {
            next.period = cur.id;
          }
          
          return next;
        });

      } catch (err) {
        console.error("Initialization error", err);
      }
    };
    initData();
  }, []); // eslint-disable-line

  const handleFilterChange = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  };

  const loadCommits = useCallback(async () => {
    setLoading(true); setSpinning(true);
    try {
      const isGlobal = filters.project === "all";
      const targetId = isGlobal ? "all" : filters.project;

      const params = {};
      if (filters.period !== "all") params.period_id = parseInt(filters.period);
      if (filters.lot    !== "all") params.lot_id    = parseInt(filters.lot);

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
  }, [filters.project, filters.period, filters.lot, projects]);

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
    if (filters.site !== "all") {
      result = result.filter((c) => getSite(c) === filters.site);
    }

    // [SENIOR] Normalisation des données (Exclusion des Merges)
    // On détecte les merges par flag ou par titre (pattern GitLab standard)
    if (filters.excludeMerges) {
      result = result.filter(c => {
        const title = getCommitTitle(c).toLowerCase();
        return !c.is_merge && !title.startsWith("merge branch") && !title.startsWith("merge pull request");
      });
    }

    // [NEW] Filtre Equipe
    if (filters.group !== "all") {
      const gId = parseInt(filters.group);
      const groupDevs = developers.filter(d => (d.group_ids || []).map(Number).includes(gId));
      const groupNames = groupDevs.flatMap(d => [(d.name || "").toLowerCase(), (d.gitlab_username || "").toLowerCase()]).filter(Boolean);
      result = result.filter(c => {
         const auth = getAuthor(c).toLowerCase();
         return groupNames.some(n => auth.includes(n));
      });
    }

    // [NEW] Filtre Auteur
    if (filters.author !== "all") {
      const target = filters.author.toLowerCase().trim();
      result = result.filter(c => getAuthor(c).toLowerCase().trim() === target);
    }

    // [NEW] Tri
    return [...result].sort((a, b) => {
      if (filters.sort === "date")    return new Date(b.authored_date) - new Date(a.authored_date);
      if (filters.sort === "author")  return getAuthor(a).localeCompare(getAuthor(b));
      if (filters.sort === "changes") return (b.total_changes || 0) - (a.total_changes || 0);
      return 0;
    });
  }, [commits, filters, developers]);

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
    if (!developers || developers.length === 0) return [];
    
    // 1. On identifie les sites des développeurs ciblés par l'extraction actuelle
    const activeSitesNames = new Set(
      developers
        .filter(d => trackedDevIds.includes(d.id))
        .map(d => d.site)
        .filter(Boolean)
    );

    // 2. On croise avec la liste globale pour garantir la cohérence des noms (et casquette pro)
    if (activeSitesNames.size > 0) {
      return allSites
        .filter(s => activeSitesNames.has(s.name))
        .map(s => s.name)
        .sort();
    }
    // Fallback : si rien n'est tracké (ex: début), on montre tout le périmètre configuré
    return allSites.map(s => s.name).sort();
  }, [allSites, developers, trackedDevIds]);

  // ✅ SENIOR AUTO-RESET : Si le site sélectionné n'est plus dans le périmètre actif, 
  // on reset à "all" pour éviter un écran vide incompréhensible.
  useEffect(() => {
    if (filters.site !== "all" && sites.length > 0 && !sites.includes(filters.site)) {
      handleFilterChange("site", "all");
    }
  }, [sites, filters.site]);


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
    
    if (filters.site !== "all") {
      filteredDevs = filteredDevs.filter(d => d.site === filters.site);
    }

    if (filters.group !== "all") {
      const groupId = parseInt(filters.group);
      filteredDevs = filteredDevs.filter(d => (d.group_ids || []).map(Number).includes(groupId));
    }
    
    return filteredDevs.map(d => d.name || d.gitlab_username).filter(Boolean).sort();
  }, [trackedDevIds, developers, filters.group, filters.site]);

  // ✅ SENIOR AUTO-RESETS : Cascade descendante
  // 1. Reset Groupe si invalide par rapport au Site
  useEffect(() => {
    if (filters.group !== "all" && groupList.length > 0 && !groupList.find(g => String(g.id) === filters.group)) {
      handleFilterChange("group", "all");
    }
  }, [groupList, filters.group]);

  // 2. Reset Auteur si invalide par rapport au Site/Groupe
  useEffect(() => {
    if (filters.author !== "all" && authorsList.length > 0 && !authorsList.includes(filters.author)) {
      handleFilterChange("author", "all");
    }
  }, [authorsList, filters.author]);

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

        {/* Toolbar Unifié Senior+++++ */}
        <div className="card mb-3">
          <div className="card-body pb-2">
            <div className="row g-2 align-items-end">
              <div className="col-xl-2 col-md-5">
                <label className="form-label fs-11 text-muted text-uppercase fw-bold mb-1">Recherche</label>
                <div className="search-box">
                  <input type="text" className="form-control form-control-sm" placeholder="SHA, auteur, message…" value={filters.search} onChange={(e)=>handleFilterChange("search",e.target.value)} />
                  <i className="ri-search-line search-icon"></i>
                </div>
              </div>

              <div className="col-xl-2 col-md-3">
                <label className="form-label fs-11 text-muted text-uppercase fw-bold mb-1">Période (Mois)</label>
                <select className="form-select form-select-sm" value={filters.period} onChange={(e)=>handleFilterChange("period",e.target.value)}>
                  <option value="all">Toutes les périodes</option>
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="col-xl-1 col-md-3">
                <label className="form-label fs-11 text-muted text-uppercase fw-bold mb-1">Projet</label>
                <select className="form-select form-select-sm" value={filters.project} onChange={(e)=>handleFilterChange("project",e.target.value)}>
                  <option value="all">Tous les projets</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="col-xl-1 col-md-3">
                <label className="form-label fs-11 text-muted text-uppercase fw-bold mb-1">Site</label>
                <select className="form-select form-select-sm" value={filters.site} onChange={(e)=>handleFilterChange("site",e.target.value)}>
                  <option value="all">Tous</option>
                  {sites.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="col-xl-1 col-md-3">
                <label className="form-label fs-11 text-muted text-uppercase fw-bold mb-1">Équipe</label>
                <select className="form-select form-select-sm" value={filters.group} onChange={(e)=>{handleFilterChange("group",e.target.value);handleFilterChange("author","all");}}>
                  <option value="all">Toutes</option>
                  {groupList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>

              <div className="col-xl-2 col-md-3">
                <label className="form-label fs-11 text-muted text-uppercase fw-bold mb-1">Développeur</label>
                <select className="form-select form-select-sm" value={filters.author} onChange={(e)=>handleFilterChange("author",e.target.value)}>
                  <option value="all">Tous</option>
                  {authorsList.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div className="col-xl-1 col-md-2">
                <label className="form-label fs-11 text-muted text-uppercase fw-bold mb-1">Tri par</label>
                <select className="form-select form-select-sm" value={filters.sort} onChange={(e)=>handleFilterChange("sort",e.target.value)}>
                  <option value="date">Date</option>
                  <option value="changes">Changes</option>
                  <option value="author">Auteur</option>
                </select>
              </div>

              <div className="col-xl-2 col-md-3">
                <label className="form-label fs-11 text-muted text-uppercase fw-bold mb-1">Type de flux</label>
                <div className="d-flex align-items-center">
                  <div className="form-check form-switch form-switch-success" title="Exclure les commits de merge pour une analyse de contribution pure">
                    <input 
                      className="form-check-input" 
                      type="checkbox" 
                      id="excludeMergesSwitch" 
                      checked={filters.excludeMerges} 
                      onChange={(e) => handleFilterChange("excludeMerges", e.target.checked)} 
                    />
                    <label className="form-check-label fs-12 ms-1 fw-medium" htmlFor="excludeMergesSwitch">
                      {filters.excludeMerges ? "Contribution Pure" : "Flux Complet"}
                    </label>
                  </div>
                </div>
              </div>

              <div className="col-xl-2 col-md-2">
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-light flex-grow-1" onClick={loadCommits} title="Rafraîchir" disabled={loading}>
                    <i className={spinning ? "ri-restart-line spin" : "ri-restart-line"}></i>
                  </button>
                  {activeFilterCount > 0 && (
                    <button className="btn btn-sm btn-soft-danger flex-grow-1" onClick={()=>setFilters(INITIAL_FILTERS)} title="Réinitialiser">
                      <i className="ri-filter-off-line"></i> {activeFilterCount}
                    </button>
                  )}
                  <button className="btn btn-sm btn-primary flex-grow-1" onClick={() => exportCommitsCSV(filtered, filters.project === "all" ? "global" : projects.find(p=>p.id===parseInt(filters.project))?.name)} title="Download CSV">
                    <i className="ri-download-2-line"></i>
                  </button>
                </div>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="d-flex flex-wrap gap-2 mt-3 pt-2 border-top border-top-dashed">
                {filters.search && <span className="badge bg-light text-dark border py-1.5 px-2">Recherche: {filters.search}</span>}
                {filters.period !== "all" && <span className="badge bg-info-subtle text-info py-1.5 px-2">Période: {periods.find(p=>p.id===parseInt(filters.period))?.name}</span>}
                {filters.project !== "all" && <span className="badge bg-primary-subtle text-primary py-1.5 px-2">Projet: {projects.find(p=>p.id===parseInt(filters.project))?.name}</span>}
                {filters.site !== "all" && <span className="badge bg-success-subtle text-success py-1.5 px-2">Site: {filters.site}</span>}
                {filters.lot !== "all" && <span className="badge bg-info-subtle text-info py-1.5 px-2">Session: {lots.find(l=>String(l.id)===String(filters.lot))?.created_at ? new Date(lots.find(l=>String(l.id)===String(filters.lot)).created_at).toLocaleDateString("fr-FR") : `#${filters.lot}`}</span>}
                {filters.group !== "all" && <span className="badge bg-warning-subtle text-warning py-1.5 px-2">Équipe: {groups.find(g=>g.id===parseInt(filters.group))?.name}</span>}
                {filters.author !== "all" && <span className="badge bg-secondary-subtle text-secondary py-1.5 px-2">Auteur: {filters.author}</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── Stat Cards — toujours affichées si un filtre est actif ─────────── */}
        {(filters.period !== "all" || filters.project !== "all" || commits.length > 0) && !loading && (
          <div className="row mb-3">
            {[
              { label: "Total Commits",   value: filtered.length,                                     color: "primary", icon: "ri-git-commit-line", sub: `${stats.uniqueAuthors} développeur${stats.uniqueAuthors > 1 ? 's' : ''}`  },
              { label: "Total Additions", value: `+${stats.totalAdditions.toLocaleString("fr-FR")}`, color: "success", icon: "ri-add-circle-line",  sub: "Lignes ajoutées"                      },
              { label: "Total Deletions", value: `-${stats.totalDeletions.toLocaleString("fr-FR")}`, color: "danger",  icon: "ri-subtract-line",    sub: "Lignes supprimées"                    },
              { label: "Moy. changes",    value: stats.avgChanges.toLocaleString("fr-FR"),           color: "info",    icon: "ri-file-code-line",   sub: "Par commit"                           },
            ].map((s, i) => (
              <div key={i} className="col-xl-3 col-sm-6">
                <div className="card card-animate">
                  <div className="card-body">
                    <div className="d-flex align-items-center">
                      <div className="avatar-sm flex-shrink-0">
                        <span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-3`}>
                          <i className={s.icon}></i>
                        </span>
                      </div>
                      <div className="flex-grow-1 ms-3">
                        <p className="text-uppercase fw-medium text-muted mb-1 fs-12">{s.label}</p>
                        <h4 className={`mb-0 text-${s.color}`}>{s.value}</h4>
                        <p className="text-muted mb-0 fs-11 mt-1">{s.sub}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
