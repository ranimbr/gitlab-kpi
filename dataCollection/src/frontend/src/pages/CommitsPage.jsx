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
  return commit.developer?.site || null;
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
function CommitCard({ commit, index, onDetails }) {
  const author = getAuthor(commit);
  const site   = getSite(commit);
  const title  = getCommitTitle(commit);
  const body   = getCommitBody(commit);
  const addPct = commit.total_changes > 0
    ? Math.round(((commit.additions || 0) / commit.total_changes) * 100)
    : 0;

  return (
    <div className="col-xxl-3 col-sm-6">
      <div className="card card-height-100">
        <div className="card-body">
          <div className="d-flex flex-column h-100">

            <div className="d-flex mb-2">
              <div className="flex-grow-1">
                <p className="text-muted mb-1 fs-12">
                  <i className="ri-time-line me-1"></i>il y a {timeAgo(commit.authored_date)}
                </p>
              </div>
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

        <div className="card-footer bg-transparent border-top-dashed py-2">
          <div className="d-flex align-items-center">
            <div className="flex-grow-1">
              <span
                className={`avatar-title avatar-xxs rounded-circle bg-${getBadgeColor(index)}`}
                style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10 }}
              >
                {getInitials(author)}
              </span>
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted fs-11">
                <i className="ri-calendar-event-fill me-1 align-bottom"></i>{formatDate(commit.authored_date)}
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
export default function CommitsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects,           setProjects]         = useState([]);
  const [selectedProjectId,  setSelectedProjectId] = useState(null);
  const [lots,               setLots]              = useState([]);        // [NEW] Sessions d'extraction
  const [selectedLotId,      setSelectedLotId]    = useState("");      // [NEW] Lot sélectionné
  const [commits,            setCommits]           = useState([]);
  const [loading,            setLoading]           = useState(false);
  const [error,              setError]             = useState(null);
  const [search,             setSearch]            = useState("");
  const [siteFilter,         setSiteFilter]        = useState("all");
  const [sortKey,            setSortKey]           = useState("date");   
  const [page,               setPage]              = useState(1);
  const [detailCommit,       setDetailCommit]      = useState(null);
  
  // [NEW] States pour Equipe et Développeur
  const [developers,         setDevelopers]        = useState([]);
  const [groups,             setGroups]            = useState([]);
  const [selectedGroup,      setSelectedGroup]     = useState("all");
  const [authorFilter,       setAuthorFilter]      = useState("all");

  const perPage = 8;

  const isInitialized = useRef(false);

  // Chargement projets, développeurs et groupes
  useEffect(() => {
    projectService.getAll()
      .then((data) => {
        setProjects(data);
        const urlProjId = searchParams.get("project_id");
        const urlLotId  = searchParams.get("lot_id");
        
        const firstProjId = urlProjId ? parseInt(urlProjId) : data[0]?.id;
        if (firstProjId) setSelectedProjectId(firstProjId);
        if (urlLotId)    setSelectedLotId(urlLotId);
      })
      .catch(() => {});
      
    api.get("/developers/").then(res => setDevelopers(Array.isArray(res.data) ? res.data : (res.data?.items ?? []))).catch(()=>{});
    api.get("/developer-groups").then(res => setGroups(Array.isArray(res.data) ? res.data : (res.data?.items ?? []))).catch(()=>{});
  }, []); 

  // [NEW] Charger les lots quand le projet change
  useEffect(() => {
    if (selectedProjectId) {
      api.get(`/extraction-lots?project_id=${selectedProjectId}`)
        .then(res => setLots(res.data || []))
        .catch(() => setLots([]));
    } else {
      setLots([]);
    }

    // On ne reset le lot que si ce n'est pas l'initialisation depuis l'URL
    if (isInitialized.current) {
        setSelectedLotId(""); 
    } else if (selectedProjectId !== null) {
        isInitialized.current = true;
    }
  }, [selectedProjectId]);


  // [FIX] loadCommits — inclut maintenant lotId
  const loadCommits = useCallback((projectId, lotId) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setPage(1);
    
    const params = {};
    if (lotId) params.lot_id = lotId;

    api.get(`/projects/${projectId}/commits`, { params })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
        setCommits(data);
      })
      .catch(() => setError("Aucun commit trouvé pour cette session."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { 
    loadCommits(selectedProjectId, selectedLotId); 
  }, [selectedProjectId, selectedLotId, loadCommits]);


  // [FIX] useMemo remplace useEffect + setState sur le filtre — plus de state dérivé
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let result = commits;

    if (q) {
      result = result.filter((c) =>
        getCommitTitle(c).toLowerCase().includes(q) ||
        getAuthor(c).toLowerCase().includes(q)      ||
        (c.gitlab_commit_id || "").toLowerCase().includes(q)
      );
    }
    if (siteFilter !== "all") {
      result = result.filter((c) => getSite(c) === siteFilter);
    }

    // [NEW] Filtre Equipe
    if (selectedGroup !== "all") {
      const gId = parseInt(selectedGroup);
      const groupDevs = developers.filter(d => d.group_id === gId);
      const groupNames = groupDevs.flatMap(d => [(d.name || "").toLowerCase(), (d.gitlab_username || "").toLowerCase()]).filter(Boolean);
      result = result.filter(c => {
         const author = getAuthor(c).toLowerCase();
         return groupNames.some(n => author.includes(n));
      });
    }

    // [NEW] Filtre Auteur
    if (authorFilter !== "all") {
      const target = authorFilter.toLowerCase().trim();
      result = result.filter(c => getAuthor(c).toLowerCase().trim() === target);
    }

    // [NEW] Tri
    return [...result].sort((a, b) => {
      if (sortKey === "date")    return new Date(b.authored_date) - new Date(a.authored_date);
      if (sortKey === "author")  return getAuthor(a).localeCompare(getAuthor(b));
      if (sortKey === "changes") return (b.total_changes || 0) - (a.total_changes || 0);
      return 0;
    });
  }, [commits, search, siteFilter, sortKey, selectedGroup, authorFilter, developers]);

  // Reset page sur tout changement de filtre
  useEffect(() => { setPage(1); }, [search, siteFilter, sortKey, selectedGroup, authorFilter]);

  // [NEW] Stats en useMemo — pas de recalcul inutile
  const sites = useMemo(
    () => [...new Set(commits.map(getSite).filter(Boolean))].sort(),
    [commits]
  );
  const authorsList = useMemo(() => {
    let devs = developers;
    if (selectedGroup !== "all") {
      const gId = parseInt(selectedGroup);
      devs = developers.filter(d => d.group_id === gId);
    }
    const extractedAuthors = [...new Set(commits.map(getAuthor))];
    
    // Si on a des devs chargés via API
    if (developers.length > 0) {
      const validNames = new Set(devs.flatMap(d => [d.name, d.gitlab_username]).filter(Boolean));
      // S'il n'y a pas de filtre groupe, les commits suffisent, mais on filtre pour exclure les bots/externes
      return extractedAuthors.filter(a => validNames.has(a)).sort();
    }
    return extractedAuthors.sort();
  }, [commits, developers, selectedGroup]);

  const stats = useMemo(() => ({
    totalAdditions: filtered.reduce((s, c) => s + (c.additions    || 0), 0),
    totalDeletions: filtered.reduce((s, c) => s + (c.deletions    || 0), 0),
    uniqueAuthors:  new Set(filtered.map(getAuthor)).size,
    avgChanges:     filtered.length
      ? Math.round(filtered.reduce((s, c) => s + (c.total_changes || 0), 0) / filtered.length)
      : 0,
  }), [filtered]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const totalPages      = Math.ceil(filtered.length / perPage);
  const paginated       = filtered.slice((page - 1) * perPage, page * perPage);
  const hasActiveFilter = search || siteFilter !== "all" || selectedGroup !== "all" || authorFilter !== "all";

  const resetFilters = () => { setSearch(""); setSiteFilter("all"); setSortKey("date"); setSelectedGroup("all"); setAuthorFilter("all"); };

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
                Commits
                {/* [NEW] Badge total visible */}
                {filtered.length > 0 && (
                  <span className="badge bg-primary-subtle text-primary ms-2 fs-13 fw-normal align-middle">
                    {filtered.length}
                  </span>
                )}
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item active">Commits</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="row g-2 mb-3 align-items-center">
          <div className="col-sm-auto">
            <select className="form-select" style={{ width: 220 }}
              value={selectedProjectId || ""}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                setSelectedProjectId(id);
                setSearchParams({ project_id: id });
                resetFilters();
              }}>
              <option value="">Choisir un projet...</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* [NEW] Sélecteur de Lot */}
          <div className="col-sm-auto">
            <select className="form-select" style={{ width: 220 }}
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}>
              <option value="">Toutes les extractions</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.extraction_type} - {l.period?.name || `Lot #${l.id}`} ({new Date(l.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>


          {/* [NEW] Filtre Equipe */}
          <div className="col-sm-auto">
            <select className="form-select" value={selectedGroup} style={{ width: 140 }}
              onChange={(e) => {setSelectedGroup(e.target.value); setAuthorFilter("all");}}>
              <option value="all">Équipe : Toutes</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          {/* [NEW] Filtre Auteur */}
          <div className="col-sm-auto">
            <select className="form-select" value={authorFilter} style={{ width: 140 }}
              onChange={(e) => setAuthorFilter(e.target.value)}>
              <option value="all">Développeur : Tous</option>
              {authorsList.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {sites.length > 0 && (
            <div className="col-sm-auto">
              <select className="form-select" value={siteFilter} style={{ width: 140 }}
                onChange={(e) => setSiteFilter(e.target.value)}>
                <option value="all">Tous les sites</option>
                {sites.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* [NEW] Tri */}
          <div className="col-sm-auto">
            <select className="form-select" value={sortKey} style={{ width: 150 }}
              onChange={(e) => setSortKey(e.target.value)}>
              <option value="date">Plus récents</option>
              <option value="changes">+ de changements</option>
              <option value="author">Auteur (A→Z)</option>
            </select>
          </div>

          <div className="col-sm">
            <div className="d-flex justify-content-sm-end gap-2 flex-wrap">
              <div className="search-box">
                <input type="text" className="form-control"
                  placeholder="SHA, titre, auteur..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)} />
                <i className="ri-search-line search-icon"></i>
              </div>

              {/* [NEW] Reset visible seulement si filtre actif */}
              {hasActiveFilter && (
                <button className="btn btn-soft-warning" onClick={resetFilters} title="Réinitialiser les filtres">
                  <i className="ri-filter-off-line me-1"></i>Reset
                </button>
              )}

              {/* [NEW] Export CSV */}
              {filtered.length > 0 && (
                <button className="btn btn-soft-success"
                  onClick={() => exportCommitsCSV(filtered, selectedProject?.name)}
                  title={`Exporter ${filtered.length} commits en CSV`}>
                  <i className="ri-download-2-line me-1"></i>CSV
                </button>
              )}

              {/* [NEW] Refresh */}
              <button className="btn btn-soft-primary"
                onClick={() => loadCommits(selectedProjectId)}
                disabled={loading || !selectedProjectId}
                title="Rafraîchir">
                <i className={`ri-refresh-line${loading ? " spinning" : ""}`}></i>
              </button>

              <a href="/extraction" className="btn btn-success">
                <i className="ri-add-line align-bottom me-1"></i>Extraction
              </a>
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        {filtered.length > 0 && (
          <div className="row mb-3">
            {[
              { label: "Total Commits",   value: filtered.length,                                     color: "primary", icon: "ri-git-commit-line", sub: `${stats.uniqueAuthors} développeurs`  },
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


        {/* Charts — Sous-titres dynamiques via ChartSection (Top N sur Total) */}
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
                {search && <span className="ms-1">pour « <strong>{search}</strong> »</span>}
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
                <CommitCard key={commit.id} commit={commit} index={index} onDetails={setDetailCommit} />
              ))}
            </div>

            <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />
          </>
        )}

        {/* [NEW] Empty state filtre actif — message dédié + bouton reset */}
        {!loading && !error && filtered.length === 0 && commits.length > 0 && (
          <div className="text-center py-5">
            <i className="ri-search-line fs-1 text-muted d-block mb-3 opacity-50"></i>
            <p className="text-muted fs-14 fw-semibold mb-1">Aucun commit ne correspond à votre recherche</p>
            <p className="text-muted fs-13 mb-3">Essayez avec d'autres critères ou réinitialisez les filtres.</p>
            <button className="btn btn-soft-primary btn-sm" onClick={resetFilters}>
              <i className="ri-refresh-line me-1"></i>Réinitialiser les filtres
            </button>
          </div>
        )}

        {!loading && !error && commits.length === 0 && selectedProjectId && (
          <EmptyState icon="ri-git-commit-line" title="Aucun commit trouvé"
            description="Lancez une extraction pour récupérer les commits de ce projet." />
        )}

        {!selectedProjectId && !loading && (
          <EmptyState icon="ri-git-repository-line" title="Sélectionnez un projet"
            description="Choisissez un projet pour voir ses commits." />
        )}

      </div>

      <style>{`
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
