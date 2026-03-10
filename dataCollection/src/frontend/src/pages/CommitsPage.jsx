import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { projectService } from "../services/kpiService";
import api from "../services/api";
import Chart from "chart.js/auto";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState     from "../components/common/EmptyState";
import Pagination     from "../components/common/Pagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function rgba(cssVar, alpha) {
  const val = getCssVar(cssVar);
  return val ? `rgba(${val}, ${alpha})` : `rgba(64,81,137,${alpha})`;
}
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}hrs ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function getInitials(name = "") {
  return (name || "?").split(/[\s._-]/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}
function getBadgeColor(index) {
  return ["primary","success","info","warning","danger","secondary"][index % 6];
}
function getCardBgColor(index) {
  return [
    "bg-warning-subtle","bg-danger-subtle","bg-success-subtle",
    "bg-info-subtle","bg-primary-subtle","bg-secondary-subtle",
  ][index % 6];
}
function getAuthor(commit) {
  return commit.developer?.username || commit.author_name || "Unknown";
}
function getSite(commit) {
  return commit.developer?.site || null;
}

// ─── [NEW] Extraire seulement la 1ère ligne du message (titre court) ──────────
function getCommitTitle(commit) {
  const raw = commit.title || commit.message || "";
  // Prend uniquement la 1ère ligne, ignore tout ce qui suit \n
  return raw.split("\n")[0].trim();
}

// ─── [NEW] Extraire le corps du message (lignes suivantes) ───────────────────
function getCommitBody(commit) {
  const raw = commit.title || commit.message || "";
  const lines = raw.split("\n").slice(1).join("\n").trim();
  return lines || null;
}

// ─── [NEW] Tronquer un texte à N caractères avec ellipsis ────────────────────
function truncate(text, maxLen = 60) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

// ─── Pie Chart ────────────────────────────────────────────────────────────────
function ContributorsPieChart({ commits }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !commits?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const authorMap = {};
    commits.forEach((c) => {
      const a = getAuthor(c);
      authorMap[a] = (authorMap[a] || 0) + 1;
    });

    const sorted = Object.entries(authorMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const labels = sorted.map(([name]) => name);
    const data   = sorted.map(([, count]) => count);

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
        labels,
        datasets: [{
          data,
          backgroundColor: COLORS,
          hoverBackgroundColor: COLORS,
          hoverBorderColor: "#fff",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: { font: { family: "Poppins", size: 12 }, padding: 16, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ` ${ctx.label}: ${ctx.raw} commits (${((ctx.raw / commits.length) * 100).toFixed(1)}%)`,
            },
          },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [commits]);

  return <canvas ref={ref} style={{ maxHeight: 260 }} />;
}

// ─── Polar Chart ──────────────────────────────────────────────────────────────
function AdditionsPolarChart({ commits }) {
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

    const sorted  = Object.entries(authorMap).sort((a, b) => b[1].additions - a[1].additions).slice(0, 6);
    const labels  = sorted.map(([name]) => name);
    const addData = sorted.map(([, v]) => v.additions);

    chartRef.current = new Chart(ref.current, {
      type: "polarArea",
      data: {
        labels,
        datasets: [{
          data: addData,
          backgroundColor: [
            rgba("--vz-danger-rgb",    0.75),
            rgba("--vz-info-rgb",      0.75),
            rgba("--vz-warning-rgb",   0.75),
            rgba("--vz-primary-rgb",   0.75),
            rgba("--vz-success-rgb",   0.75),
            rgba("--vz-secondary-rgb", 0.75),
          ],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: { font: { family: "Poppins", size: 11 }, padding: 14, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: +${ctx.raw.toLocaleString()} lignes ajoutées`,
            },
          },
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
  }, [commits]);

  return <canvas ref={ref} style={{ maxHeight: 260 }} />;
}

// ─── Modal détail commit — Sobre & Professionnel ─────────────────────────────
function CommitDetailModal({ commit, onClose }) {
  const [shaCopied, setShaCopied] = useState(false);

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
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-content border-0"
          style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
        >

          {/* ══ HEADER ════════════════════════════════════════════════════ */}
          <div
            className="px-4 pt-4 pb-3"
            style={{ borderBottom: "1px solid #f1f3f7" }}
          >
            <div className="d-flex align-items-start gap-3">

              {/* Avatar */}
              <div
                className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14"
                style={{
                  width: 44, height: 44,
                  background: "linear-gradient(135deg, #405189 0%, #3577f1 100%)",
                  letterSpacing: 0.5,
                }}
              >
                {getInitials(author)}
              </div>

              {/* Titre + meta */}
              <div className="flex-grow-1 min-w-0">
                <h5
                  className="fw-semibold text-dark mb-1"
                  style={{ fontSize: 15, lineHeight: 1.45, wordBreak: "break-word" }}
                >
                  {title}
                </h5>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="text-muted fs-12 fw-medium">{author}</span>
                  {site && (
                    <span
                      className="badge fs-10 fw-semibold"
                      style={{
                        background: "#eff6ff",
                        color: "#2563eb",
                        border: "1px solid #bfdbfe",
                        padding: "2px 8px",
                      }}
                    >
                      {site}
                    </span>
                  )}
                  <span className="text-muted fs-12">
                    <i className="ri-calendar-line me-1"></i>
                    {formatDate(commit.authored_date)}
                  </span>
                  <span
                    className="fs-11 fw-medium px-2 py-0"
                    style={{
                      background: "#f8f9fc",
                      border: "1px solid #e9ecef",
                      borderRadius: 20,
                      color: "#6c757d",
                    }}
                  >
                    {timeAgo(commit.authored_date)}
                  </span>
                </div>
              </div>

              {/* Close */}
              <button
                className="btn-close flex-shrink-0"
                style={{ opacity: 0.5 }}
                onClick={onClose}
              ></button>
            </div>
          </div>

          {/* ══ BODY ══════════════════════════════════════════════════════ */}
          <div className="px-4 py-4">

            {/* SHA */}
            <div className="mb-4">
              <label
                className="d-block text-uppercase fw-semibold mb-2"
                style={{ fontSize: 10, letterSpacing: 1, color: "#9ca3af" }}
              >
                Commit SHA
              </label>
              <div
                className="d-flex align-items-center gap-3 px-3 py-2 rounded-3"
                style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}
              >
                <i className="ri-git-commit-line text-muted fs-15 flex-shrink-0"></i>
                <code
                  className="flex-grow-1 fs-12"
                  style={{ color: "#374151", wordBreak: "break-all", fontFamily: "'SFMono-Regular', monospace" }}
                >
                  {commit.gitlab_commit_id || "—"}
                </code>
                <button
                  onClick={handleCopySha}
                  className="btn btn-sm flex-shrink-0"
                  style={{
                    fontSize: 11,
                    padding: "3px 12px",
                    borderRadius: 8,
                    background: shaCopied ? "#dcfce7" : "#fff",
                    border: shaCopied ? "1px solid #86efac" : "1px solid #d1d5db",
                    color: shaCopied ? "#16a34a" : "#374151",
                    whiteSpace: "nowrap",
                    transition: "all .2s",
                  }}
                >
                  {shaCopied
                    ? <><i className="ri-check-line me-1"></i>Copié !</>
                    : <><i className="ri-clipboard-line me-1"></i>Copier</>
                  }
                </button>
              </div>
            </div>

            {/* Séparateur section */}
            <div
              className="text-uppercase fw-semibold mb-3"
              style={{ fontSize: 10, letterSpacing: 1, color: "#9ca3af" }}
            >
              Statistiques
            </div>

            {/* Stats — 3 blocs + barre */}
            <div className="mb-4">
              <div className="row g-3 mb-3">

                <div className="col-4">
                  <div
                    className="rounded-3 p-3 text-center"
                    style={{ background: "#f0fdf4", border: "1px solid #d1fae5" }}
                  >
                    <div
                      className="fw-bold mb-1"
                      style={{ fontSize: 24, color: "#16a34a", lineHeight: 1 }}
                    >
                      +{commit.additions || 0}
                    </div>
                    <div style={{ fontSize: 10, color: "#15803d", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      Additions
                    </div>
                  </div>
                </div>

                <div className="col-4">
                  <div
                    className="rounded-3 p-3 text-center"
                    style={{ background: "#fff7f7", border: "1px solid #fecaca" }}
                  >
                    <div
                      className="fw-bold mb-1"
                      style={{ fontSize: 24, color: "#dc2626", lineHeight: 1 }}
                    >
                      -{commit.deletions || 0}
                    </div>
                    <div style={{ fontSize: 10, color: "#b91c1c", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      Deletions
                    </div>
                  </div>
                </div>

                <div className="col-4">
                  <div
                    className="rounded-3 p-3 text-center"
                    style={{ background: "#f0f9ff", border: "1px solid #bae6fd" }}
                  >
                    <div
                      className="fw-bold mb-1"
                      style={{ fontSize: 24, color: "#0284c7", lineHeight: 1 }}
                    >
                      {commit.total_changes || 0}
                    </div>
                    <div style={{ fontSize: 10, color: "#0369a1", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      Total
                    </div>
                  </div>
                </div>
              </div>

              {/* Barre +/- */}
              <div>
                <div className="d-flex justify-content-between mb-1" style={{ fontSize: 11, color: "#9ca3af" }}>
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>+{commit.additions || 0} additions ({addPct}%)</span>
                  <span style={{ color: "#dc2626", fontWeight: 600 }}>-{commit.deletions || 0} deletions ({100 - addPct}%)</span>
                </div>
                <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${addPct}%`,
                    background: "linear-gradient(90deg, #16a34a, #4ade80)",
                    borderRadius: 99,
                    display: "inline-block",
                  }}></div>
                </div>
              </div>
            </div>

            {/* Message complet */}
            {body && (
              <div className="mb-4">
                <div
                  className="text-uppercase fw-semibold mb-2"
                  style={{ fontSize: 10, letterSpacing: 1, color: "#9ca3af" }}
                >
                  Message complet
                </div>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 180,
                    overflowY: "auto",
                    background: "#f8f9fc",
                    border: "1px solid #e9ecef",
                    borderRadius: 10,
                    padding: "12px 16px",
                    fontSize: 12,
                    lineHeight: 1.75,
                    color: "#374151",
                    fontFamily: "inherit",
                    margin: 0,
                  }}
                >
                  {body}
                </pre>
              </div>
            )}

            {/* Infos auteur + date côte à côte */}
            <div
              className="rounded-3 p-3"
              style={{ background: "#f8f9fc", border: "1px solid #e9ecef" }}
            >
              <div
                className="text-uppercase fw-semibold mb-3"
                style={{ fontSize: 10, letterSpacing: 1, color: "#9ca3af" }}
              >
                Informations
              </div>
              <div className="row g-3">

                <div className="col-sm-6">
                  <div className="d-flex align-items-center gap-3">
                    <div
                      className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-12"
                      style={{
                        width: 36, height: 36,
                        background: "linear-gradient(135deg, #667eea, #764ba2)",
                      }}
                    >
                      {getInitials(author)}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.8 }}>
                        Auteur
                      </div>
                      <div className="fw-semibold text-dark fs-13">{author}</div>
                      {site && (
                        <span
                          style={{
                            fontSize: 10, background: "#eff6ff",
                            color: "#2563eb", border: "1px solid #bfdbfe",
                            borderRadius: 20, padding: "1px 8px", fontWeight: 600,
                          }}
                        >
                          {site}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-sm-6">
                  <div className="d-flex align-items-center gap-3">
                    <div
                      className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fs-16"
                      style={{ width: 36, height: 36, background: "#e9ecef", color: "#6c757d" }}
                    >
                      <i className="ri-calendar-check-line"></i>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.8 }}>
                        Date
                      </div>
                      <div className="fw-semibold text-dark fs-13">{formatDate(commit.authored_date)}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{timeAgo(commit.authored_date)}</div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* ══ FOOTER ════════════════════════════════════════════════════ */}
          <div
            className="px-4 py-3 d-flex align-items-center justify-content-between"
            style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}
          >
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              <i className="ri-hashtag me-1"></i>Commit #{commit.id}
            </span>
            <button
              className="btn btn-sm"
              onClick={onClose}
              style={{
                fontSize: 12,
                padding: "5px 20px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#374151",
                fontWeight: 500,
              }}
            >
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
  const title  = getCommitTitle(commit);   // [FIX] 1ère ligne seulement
  const body   = getCommitBody(commit);    // [FIX] corps du message
  const addPct = commit.total_changes > 0
    ? Math.round(((commit.additions || 0) / commit.total_changes) * 100)
    : 0;

  return (
    <div className="col-xxl-3 col-sm-6">
      <div className="card card-height-100">
        <div className="card-body">
          <div className="d-flex flex-column h-100">

            {/* Header */}
            <div className="d-flex mb-2">
              <div className="flex-grow-1">
                <p className="text-muted mb-1 fs-12">
                  <i className="ri-time-line me-1"></i>
                  {timeAgo(commit.authored_date)}
                </p>
              </div>
              <span className={`badge bg-${getBadgeColor(index)}-subtle text-${getBadgeColor(index)}`}>
                <i className="ri-git-commit-line me-1"></i>#{commit.id}
              </span>
            </div>

            {/* Auteur + Titre */}
            <div className="d-flex mb-2">
              <div className="flex-shrink-0 me-3">
                <div className="avatar-sm">
                  <span className={`avatar-title ${getCardBgColor(index)} text-${getBadgeColor(index)} rounded fs-14 fw-bold`}>
                    {getInitials(author)}
                  </span>
                </div>
              </div>
              <div className="flex-grow-1 min-w-0">
                {/* [FIX] Titre tronqué à 55 chars avec tooltip complet */}
                <h5
                  className="mb-1 fs-14 fw-semibold text-body"
                  title={title}
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    lineHeight: "1.4",
                    maxHeight: "2.8em",
                    wordBreak: "break-word",
                  }}
                >
                  {title}
                </h5>
                <p className="text-muted mb-0 fs-12">
                  <i className="ri-user-line me-1"></i>
                  {author}
                  {site && (
                    <span className="badge bg-info-subtle text-info ms-2 fs-10">{site}</span>
                  )}
                </p>
              </div>
            </div>

            {/* [NEW] Aperçu corps du message — seulement si existe */}
            {body && (
              <div
                className="bg-light rounded p-2 mb-2 fs-11 text-muted"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                  lineHeight: "1.5",
                  cursor: "pointer",
                }}
                onClick={() => onDetails(commit)}
                title="Cliquer pour voir le message complet"
              >
                {truncate(body, 80)}
              </div>
            )}

            {/* Stats +/- */}
            <div className="mt-auto">
              <div className="d-flex mb-2 align-items-center">
                <div className="flex-grow-1 fs-12">
                  <span className="text-success fw-semibold">
                    <i className="ri-add-line"></i>+{commit.additions || 0}
                  </span>
                  <span className="ms-2 text-danger fw-semibold">
                    <i className="ri-subtract-line"></i>-{commit.deletions || 0}
                  </span>
                </div>
                <span className="text-muted fs-12">
                  {commit.total_changes || 0} changes
                </span>
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
                style={{ width:24, height:24, display:"inline-flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:10 }}
              >
                {getInitials(author)}
              </span>
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted fs-11">
                <i className="ri-calendar-event-fill me-1 align-bottom"></i>
                {formatDate(commit.authored_date)}
              </span>
              {/* [NEW] Bouton "Voir détails" */}
              <button
                className="btn btn-xs btn-soft-primary py-0 px-2"
                style={{ fontSize: "10px" }}
                onClick={() => onDetails(commit)}
                title="Voir message complet"
              >
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
  const [searchParams, setSearchParams]     = useSearchParams();
  const [projects,          setProjects]    = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [commits,           setCommits]     = useState([]);
  const [filtered,          setFiltered]    = useState([]);
  const [loading,           setLoading]     = useState(false);
  const [error,             setError]       = useState(null);
  const [search,            setSearch]      = useState("");
  const [siteFilter,        setSiteFilter]  = useState("all");
  const [page,              setPage]        = useState(1);
  const [detailCommit,      setDetailCommit] = useState(null); // [NEW] modal
  const perPage = 8;

  useEffect(() => {
    projectService.getAll().then((data) => {
      setProjects(data);
      const urlId   = searchParams.get("project_id");
      const firstId = urlId ? parseInt(urlId) : data[0]?.id;
      if (firstId) setSelectedProjectId(firstId);
    });
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    setPage(1);
    api.get(`/projects/${selectedProjectId}/commits`)
      .then((res) => { setCommits(res.data); setFiltered(res.data); })
      .catch(() => setError("Aucun commit trouvé. Lancez une extraction d'abord."))
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  useEffect(() => {
    const q = search.toLowerCase();
    let result = commits;
    if (q) {
      result = result.filter((c) =>
        getCommitTitle(c).toLowerCase().includes(q) ||
        getAuthor(c).toLowerCase().includes(q) ||
        (c.gitlab_commit_id || "").toLowerCase().includes(q)
      );
    }
    if (siteFilter !== "all") {
      result = result.filter((c) => getSite(c) === siteFilter);
    }
    setFiltered(result);
    setPage(1);
  }, [search, siteFilter, commits]);

  const sites          = [...new Set(commits.map((c) => getSite(c)).filter(Boolean))].sort();
  const totalAdditions = commits.reduce((s, c) => s + (c.additions || 0), 0);
  const totalDeletions = commits.reduce((s, c) => s + (c.deletions || 0), 0);
  const uniqueAuthors  = new Set(commits.map((c) => getAuthor(c))).size;
  const avgChanges     = commits.length
    ? Math.round(commits.reduce((s, c) => s + (c.total_changes || 0), 0) / commits.length)
    : 0;

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Modal détail commit */}
        {detailCommit && (
          <CommitDetailModal
            commit={detailCommit}
            onClose={() => setDetailCommit(null)}
          />
        )}

        {/* Page Title */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-git-commit-line me-2 text-primary"></i>Commits
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item active">Commits</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="row g-3 mb-3">
          <div className="col-sm-auto">
            <select
              className="form-select"
              style={{ width: 230 }}
              value={selectedProjectId || ""}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                setSelectedProjectId(id);
                setSearchParams({ project_id: id });
                setSiteFilter("all");
                setSearch("");
              }}
            >
              <option value="">Choisir un projet...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {sites.length > 0 && (
            <div className="col-sm-auto">
              <select
                className="form-select"
                value={siteFilter}
                onChange={(e) => { setSiteFilter(e.target.value); setPage(1); }}
              >
                <option value="all">Tous les sites</option>
                {sites.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <div className="col-sm">
            <div className="d-flex justify-content-sm-end gap-2">
              <div className="search-box">
                <input
                  type="text"
                  className="form-control"
                  placeholder="SHA, titre, auteur..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <i className="ri-search-line search-icon"></i>
              </div>
              <a href="/extraction" className="btn btn-success">
                <i className="ri-add-line align-bottom me-1"></i>Extraction
              </a>
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        {commits.length > 0 && (
          <div className="row mb-3">
            {[
              { label: "Total Commits",   value: commits.length,                        color: "primary", icon: "ri-git-commit-line", sub: `${uniqueAuthors} développeurs` },
              { label: "Total Additions", value: `+${totalAdditions.toLocaleString()}`, color: "success", icon: "ri-add-circle-line",  sub: "Lignes ajoutées"              },
              { label: "Total Deletions", value: `-${totalDeletions.toLocaleString()}`, color: "danger",  icon: "ri-subtract-line",    sub: "Lignes supprimées"            },
              { label: "Moy. changes",    value: avgChanges.toLocaleString(),           color: "info",    icon: "ri-file-code-line",   sub: "Par commit"                   },
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

        {/* Charts */}
        {commits.length > 0 && (
          <div className="row mb-4">
            <div className="col-xl-6">
              <div className="card h-100">
                <div className="card-header d-flex align-items-center border-bottom-dashed">
                  <div className="flex-grow-1">
                    <h4 className="card-title mb-1">
                      <i className="ri-pie-chart-line me-2 text-info"></i>
                      Commits par développeur
                    </h4>
                    <p className="text-muted mb-0 fs-12">Distribution par membre de l'équipe</p>
                  </div>
                  <span className="badge bg-info-subtle text-info fs-12">{uniqueAuthors} devs</span>
                </div>
                <div className="card-body">
                  <div style={{ height: 260 }}><ContributorsPieChart commits={commits} /></div>
                </div>
              </div>
            </div>
            <div className="col-xl-6">
              <div className="card h-100">
                <div className="card-header d-flex align-items-center border-bottom-dashed">
                  <div className="flex-grow-1">
                    <h4 className="card-title mb-1">
                      <i className="ri-donut-chart-line me-2 text-danger"></i>
                      Volume de contribution
                    </h4>
                    <p className="text-muted mb-0 fs-12">Lignes ajoutées — top 6 développeurs</p>
                  </div>
                  <span className="badge bg-danger-subtle text-danger fs-12">
                    +{totalAdditions.toLocaleString()} lignes
                  </span>
                </div>
                <div className="card-body">
                  <div style={{ height: 260 }}><AdditionsPolarChart commits={commits} /></div>
                </div>
              </div>
            </div>
          </div>
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
            {/* [NEW] Compteur résultats filtrés */}
            <div className="d-flex align-items-center justify-content-between mb-3">
              <p className="text-muted fs-13 mb-0">
                <i className="ri-git-commit-line me-1"></i>
                <strong>{filtered.length}</strong> commit{filtered.length > 1 ? "s" : ""}
                {search && <span className="ms-1">pour "<strong>{search}</strong>"</span>}
              </p>
              <span className="text-muted fs-12">
                <i className="ri-eye-line me-1"></i>
                Cliquez <i className="ri-eye-line"></i> pour voir le message complet
              </span>
            </div>

            <div className="row">
              {paginated.map((commit, index) => (
                <CommitCard
                  key={commit.id}
                  commit={commit}
                  index={index}
                  onDetails={setDetailCommit}  // [NEW]
                />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              perPage={perPage}
              onPageChange={setPage}
            />
          </>
        )}

        {!loading && !error && filtered.length === 0 && selectedProjectId && (
          <EmptyState
            icon="ri-git-commit-line"
            title="Aucun commit trouvé"
            description="Essayez une autre recherche ou lancez une extraction."
          />
        )}

        {!selectedProjectId && !loading && (
          <EmptyState
            icon="ri-git-repository-line"
            title="Sélectionnez un projet"
            description="Choisissez un projet pour voir ses commits."
          />
        )}

      </div>
    </div>
  );
}
