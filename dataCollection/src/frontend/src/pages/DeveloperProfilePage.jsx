/**
 * pages/DeveloperProfilePage.jsx
 * 
 * SENIOR REFACTOR: Harmonized with Corporate/Velzon style.
 * Using standard card-animate, page-title-box, and brand colors.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import developerService from "../services/developerService";
import analyticsService    from "../services/analyticsService";
import projectService      from "../services/projectService";
import periodService      from "../services/periodService";
import { exportService }   from "../services";
import api                from "../services/api";
import LoadingSpinner      from "../components/common/LoadingSpinner";
import EmptyState          from "../components/common/EmptyState";
import ScoreRadarChart     from "../components/charts/ScoreRadarChart";
import ReactApexChart      from "react-apexcharts";  // Phase 5: Evolution chart

// ─── Review Details Modal ──────────────────────────────────────────────────────────
function ReviewDetailModal({ reviews, loading, onClose, developerName, projectName, periodLabel }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const STATE_CFG = {
    opened: { label: "Open", icon: "ri-git-pull-request-line", bg: "#e8ecf8", color: "#405189" },
    merged: { label: "Merged", icon: "ri-git-merge-line", bg: "#d4f5f0", color: "#0a7a6a" },
    closed: { label: "Closed", icon: "ri-close-circle-line", bg: "#fde8e8", color: "#9b1c1c" },
  };

  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-label="Détails Revues de code"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-start gap-3">
              <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14"
                style={{ width: 44, height: 44, background: "linear-gradient(135deg,#405189,#3577f1)" }}>
                {developerName ? developerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "DV"}
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-1" style={{ fontSize: 14, lineHeight: 1.45 }}>
                  Revues de code - {developerName}
                </h5>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <span style={{ background: "#d7edf9", color: "#1a6fa3", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                    <i className="ri-building-line me-1"></i>{projectName}
                  </span>
                  {periodLabel && (
                    <span style={{ background: "#fef3dc", color: "#b78a1e", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                      <i className="ri-calendar-line me-1"></i>{periodLabel}
                    </span>
                  )}
                  <span style={{ background: "#e8ecf8", color: "#405189", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                    <i className="ri-eye-line me-1"></i>{reviews.length} revues
                  </span>
                </div>
              </div>
              <button className="btn-close flex-shrink-0" style={{ opacity: 0.5 }} onClick={onClose} aria-label="Fermer"></button>
            </div>
          </div>
          <div className="px-4 py-4" style={{ maxHeight: 500, overflowY: "auto" }}>
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status"></div>
                <p className="text-muted mt-3">Chargement des revues...</p>
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="ri-eye-off-line fs-1 d-block mb-2"></i>
                <p>Aucune revue de code trouvée pour cette période</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover table-nowrap align-middle">
                  <thead>
                    <tr style={{ background: "#f8f9fc" }}>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>MR</th>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>Titre</th>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>Auteur</th>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>Statut</th>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>Date</th>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>Comm.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((review, idx) => {
                      const cfg = STATE_CFG[review.state] || STATE_CFG.opened;
                      return (
                        <tr key={idx}>
                          <td>
                            <span className="fw-semibold text-primary">!{review.gitlab_mr_id}</span>
                          </td>
                          <td>
                            <div className="fw-semibold text-dark" style={{ fontSize: 13, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {review.title}
                            </div>
                          </td>
                          <td>
                            <span className="text-muted fs-12">{review.author || "Unknown"}</span>
                          </td>
                          <td>
                            <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 12, padding: "4px 10px", fontSize: 11, fontWeight: 700 }}>
                              <i className={`${cfg.icon} me-1`}></i>{cfg.label}
                            </span>
                          </td>
                          <td>
                            <span className="text-muted fs-12">{review.created_at_gitlab ? new Date(review.created_at_gitlab).toLocaleDateString("fr-FR") : "—"}</span>
                          </td>
                          <td>
                            <span className="fw-semibold text-dark">{review.user_notes_count || 0}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="px-4 py-3 d-flex align-items-center justify-content-between" style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              <i className="ri-eye-line me-1"></i>{reviews.length} revues affichées
            </span>
            <button className="btn btn-sm" onClick={onClose} style={{ fontSize: 12, padding: "5px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 500 }}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Comments Details Modal ─────────────────────────────────────────────────────────
function CommentsDetailModal({ comments, loading, onClose, developerName, projectName, periodLabel }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const STATE_CFG = {
    opened: { label: "Open", icon: "ri-git-pull-request-line", bg: "#e8ecf8", color: "#405189" },
    merged: { label: "Merged", icon: "ri-git-merge-line", bg: "#d4f5f0", color: "#0a7a6a" },
    closed: { label: "Closed", icon: "ri-close-circle-line", bg: "#fde8e8", color: "#9b1c1c" },
  };

  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-label="Détails Commentaires"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 900 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-start gap-3">
              <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14"
                style={{ width: 44, height: 44, background: "linear-gradient(135deg,#405189,#3577f1)" }}>
                {developerName ? developerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "DV"}
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-1" style={{ fontSize: 14, lineHeight: 1.45 }}>
                  Mentorat (Commentaires) - {developerName}
                </h5>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <span style={{ background: "#d7edf9", color: "#1a6fa3", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                    <i className="ri-building-line me-1"></i>{projectName}
                  </span>
                  {periodLabel && (
                    <span style={{ background: "#fef3dc", color: "#b78a1e", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                      <i className="ri-calendar-line me-1"></i>{periodLabel}
                    </span>
                  )}
                  <span style={{ background: "#e8ecf8", color: "#405189", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                    <i className="ri-chat-4-line me-1"></i>{comments.length} commentaires
                  </span>
                </div>
              </div>
              <button className="btn-close flex-shrink-0" style={{ opacity: 0.5 }} onClick={onClose} aria-label="Fermer"></button>
            </div>
          </div>
          <div className="px-4 py-4" style={{ maxHeight: 500, overflowY: "auto" }}>
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status"></div>
                <p className="text-muted mt-3">Chargement des commentaires...</p>
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="ri-chat-off-line fs-1 d-block mb-2"></i>
                <p>Aucun commentaire trouvé pour cette période</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover table-nowrap align-middle">
                  <thead>
                    <tr style={{ background: "#f8f9fc" }}>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>MR</th>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>Titre MR</th>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>Commentaire</th>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>Date</th>
                      <th className="fs-11 fw-bold text-muted text-uppercase" style={{ letterSpacing: 0.8 }}>Statut MR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comments.map((comment, idx) => {
                      const cfg = STATE_CFG[comment.mr_state] || STATE_CFG.opened;
                      return (
                        <tr key={idx}>
                          <td>
                            <span className="fw-semibold text-primary">!{comment.mr_gitlab_id}</span>
                          </td>
                          <td>
                            <div className="fw-semibold text-dark" style={{ fontSize: 13, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {comment.mr_title}
                            </div>
                          </td>
                          <td>
                            <div className="text-muted fs-12" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {comment.body}
                            </div>
                          </td>
                          <td>
                            <span className="text-muted fs-12">{comment.created_at ? new Date(comment.created_at).toLocaleDateString("fr-FR") : "—"}</span>
                          </td>
                          <td>
                            <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 12, padding: "4px 10px", fontSize: 11, fontWeight: 700 }}>
                              <i className={`${cfg.icon} me-1`}></i>{cfg.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="px-4 py-3 d-flex align-items-center justify-content-between" style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              <i className="ri-chat-4-line me-1"></i>{comments.length} commentaires affichés
            </span>
            <button className="btn btn-sm" onClick={onClose} style={{ fontSize: 12, padding: "5px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 500 }}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers (Standardized) ──────────────────────────────────────────────────
const fmt     = (n, d = 2) => (n == null || isNaN(+n)) ? "—" : (+n).toFixed(d);
const fmtPct  = (n) => (n == null || isNaN(+n)) ? "—" : `${(+n * 100).toFixed(0)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const MOIS_FR = { 0:"Jan",1:"Fév",2:"Mar",3:"Avr",4:"Mai",5:"Jun",6:"Jul",7:"Aoû",8:"Sep",9:"Oct",10:"Nov",11:"Déc" };
const COLORS  = ["primary", "success", "info", "warning", "danger", "secondary"];

function getInitials(name = "") { return (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2); }
function getBadges(summary) {
  if (!summary) return [];
  const badges = [];
  if (summary.total_comments > 100) badges.push({ label: "Menteur", icon: "ri-chat-smile-2-line", color: "primary" });
  else if (summary.total_comments > 20) badges.push({ label: "Collaborateur", icon: "ri-chat-4-line", color: "info" });
  
  if (summary.total_reviews > 50) badges.push({ label: "Lead Reviewer", icon: "ri-eye-line", color: "success" });
  else if (summary.total_reviews > 10) badges.push({ label: "Code Reviewer", icon: "ri-search-line", color: "info" });
  
  if (summary.total_mrs_created > 50) badges.push({ label: "Producteur MR", icon: "ri-git-pull-request-line", color: "warning" });
  
  if ((summary.developer_score || 0) > 0.8) badges.push({ label: "Top Performer", icon: "ri-medal-fill", color: "danger" });
  return badges;
}

function deltaInfo(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return { value: "±0%", color: "secondary", icon: "ri-subtract-line" };
  return pct > 0
    ? { value: `+${pct.toFixed(1)}%`, color: "success", icon: "ri-arrow-up-line" }
    : { value: `${pct.toFixed(1)}%`,  color: "danger",  icon: "ri-arrow-down-line" };
}

// ─── Component: Activity Heatmap (GitHub Style) ──────────────────────────────
function ActivityHeatmap({ data, startDate, endDate, maxCount, loading, accentColor }) {
  const [tooltip, setTooltip] = useState(null);

  const grid = useMemo(() => {
    if (!startDate || !endDate) return [];
    const countMap = {};
    (data || []).forEach(d => { countMap[d.date] = d.count; });
    const start = new Date(startDate);
    const dayOfWeek = start.getDay(); 
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(start.getDate() + mondayOffset);
    const end = new Date(endDate);
    const weeks = [];
    let week = [];
    const cur = new Date(start);
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      const inRange = cur >= new Date(startDate) && cur <= new Date(endDate);
      week.push({ date: iso, count: inRange ? (countMap[iso] || 0) : null, inRange });
      if (week.length === 7) { weeks.push(week); week = []; }
      cur.setDate(cur.getDate() + 1);
    }
    if (week.length > 0) {
      while (week.length < 7) week.push({ date: null, count: null, inRange: false });
      weeks.push(week);
    }
    return weeks;
  }, [data, startDate, endDate]);

  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    grid.forEach((week, wi) => {
      const firstValidDay = week.find(d => d.inRange);
      if (!firstValidDay) return;
      const m = new Date(firstValidDay.date).getMonth();
      if (m !== lastMonth) { labels.push({ weekIdx: wi, label: MOIS_FR[m] }); lastMonth = m; }
    });
    return labels;
  }, [grid]);

  const cellColor = (count, inRange) => {
    if (!inRange || count == null || count === 0) return "#f3f6f9";
    const max = maxCount || 10;
    const pct = count / max;
    if (pct <= 0.25) return "#dcfce7";
    if (pct <= 0.50) return "#86efac";
    if (pct <= 0.75) return "#22c55e";
    return "#15803d";
  };

  if (loading) return <div className="py-4 text-center text-muted fs-11"><span className="spinner-border spinner-border-sm me-2"></span>Calcul de l'activité...</div>;

  return (
    <div className="position-relative overflow-auto pb-2" style={{ minWidth: 600 }}>
      <div className="d-flex mb-1 ms-4 ps-1" style={{ gap: 0 }}>
        {grid.map((_, wi) => {
          const lbl = monthLabels.find(l => l.weekIdx === wi);
          return <div key={wi} style={{ width: 14, fontSize: 9, color: "#adb5bd", flexShrink: 0 }}>{lbl?.label || ""}</div>;
        })}
      </div>
      <div className="d-flex gap-1 align-items-start">
        <div className="d-flex flex-column me-2" style={{ gap: 3 }}>
          {["Lun","","Mer","","Ven","","Dim"].map((d, i) => (
            <div key={i} style={{ height: 11, fontSize: 9, color: "#adb5bd", lineHeight: "11px", width: 22, textAlign: "right" }}>{d}</div>
          ))}
        </div>
        <div className="d-flex" style={{ gap: 3 }}>
          {grid.map((week, wi) => (
            <div key={wi} className="d-flex flex-column" style={{ gap: 3 }}>
              {week.map((day, di) => (
                <div key={di} 
                  className="heat-cell position-relative"
                  style={{ 
                    width: 11, 
                    height: 11, 
                    borderRadius: 2, 
                    background: cellColor(day.count, day.inRange), 
                    cursor: day.inRange && day.count > 0 ? "pointer" : "default",
                    animation: "fadeHeatCell 0.4s ease-out forwards",
                    animationDelay: `${(wi * 0.02) + (di * 0.01)}s`,
                    opacity: 0,
                    zIndex: 1
                  }}
                  onMouseEnter={e => day.inRange && day.date && setTooltip({ x: e.clientX, y: e.clientY, date: day.date, count: day.count || 0 })}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {tooltip && (
        <div className="position-fixed bg-dark text-white p-2 rounded fs-10 shadow-lg" style={{ left: tooltip.x + 10, top: tooltip.y - 40, zIndex: 1000 }}>
          <strong>{tooltip.count} commits</strong> le {fmtDate(tooltip.date)}
        </div>
      )}
    </div>
  );
}

// ─── Component: Individual KPI Card (Dashboard Pattern) ───────────────────────
function KpiCard({ title, value, unit, icon, color, delta, subtitle, onClick }) {
  return (
    <div className="col-xl-3 col-sm-6">
      <div className="card card-animate border-0 shadow-sm h-100" 
           style={{ cursor: onClick ? 'pointer' : 'default' }}
           onClick={onClick}>
        <div className="card-body">
          <div className="d-flex align-items-start">
            <div className="avatar-sm flex-shrink-0">
              <span className={`avatar-title bg-${color}-subtle text-${color} rounded-2 fs-2`}>
                <i className={icon}></i>
              </span>
            </div>
            <div className="flex-grow-1 ms-3">
              <p className="text-uppercase fw-medium text-muted mb-1 fs-11" style={{ letterSpacing: ".05em" }}>{title}</p>
              <h4 className="fs-22 mb-1 fw-bold">{value ?? "—"}<span className="fs-13 text-muted fw-normal ms-1">{unit}</span></h4>
              {subtitle && (
                <p className="text-muted fs-11 mb-1">{subtitle}</p>
              )}
              {delta && (
                <span className={`badge bg-${delta.color}-subtle text-${delta.color} fs-11`}>
                  <i className={`${delta.icon} me-1`}></i>{delta.value}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeveloperProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("project_id");
  const lotIdParam = searchParams.get("lot_id");

  const [developer,  setDeveloper]  = useState(null);
  const [snapshot,   setSnapshot]   = useState(null);
  const [summary,    setSummary]    = useState(null);
  const [prevSnap,   setPrevSnap]   = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [heatmap,    setHeatmap]    = useState([]);
  const [heatmapMeta, setHeatmapMeta] = useState(null);
  const [timeline,   setTimeline]   = useState([]);
  const [alerts,     setAlerts]     = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [selectedPid, setSelectedPid] = useState(projectId || localStorage.getItem("last_project_id") || "");
  const [selectedPeriodId, setSelectedPeriodId] = useState(searchParams.get("period_id") ? Number(searchParams.get("period_id")) : null);

  // Debug: Log period changes
  useEffect(() => {
    console.log("selectedPeriodId changed:", selectedPeriodId);
  }, [selectedPeriodId]);
  const [selectedLotId, setSelectedLotId] = useState(lotIdParam || "");
  const [periods, setPeriods] = useState([]);

  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [exportingPdf,   setExportingPdf]   = useState(false);
  const [heatmapMonths,  setHeatmapMonths]  = useState(12);
  
  // Review details modal state
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [reviewsData, setReviewsData] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [commentsData, setCommentsData] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // Function to fetch review details
  const handleOpenReviewsModal = useCallback(async () => {
    setShowReviewsModal(true);
    setLoadingReviews(true);
    try {
      const p_id = selectedPid ? parseInt(selectedPid) : null;
      // Use the new endpoint that uses the same logic as KPI calculation
      const response = await api.get(`/kpis/developer/${id}/reviewed-mrs`, { 
        params: { 
          project_id: p_id,
          period_id: selectedPeriodId,
          lot_id: selectedLotId || undefined
        }
      });
      setReviewsData(response.data || []);
    } catch (err) {
      console.error("Failed to fetch reviews:", err);
      setReviewsData([]);
    } finally {
      setLoadingReviews(false);
    }
  }, [id, selectedPid, selectedPeriodId, selectedLotId]);

  // Function to fetch comment details
  const handleOpenCommentsModal = useCallback(async () => {
    setShowCommentsModal(true);
    setLoadingComments(true);
    try {
      const p_id = selectedPid ? parseInt(selectedPid) : null;
      // Use endpoint to fetch comments
      const response = await api.get(`/kpis/developer/${id}/comments`, { 
        params: { 
          project_id: p_id,
          period_id: selectedPeriodId,
          lot_id: selectedLotId || undefined
        }
      });
      setCommentsData(response.data || []);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
      setCommentsData([]);
    } finally {
      setLoadingComments(false);
    }
  }, [id, selectedPid, selectedPeriodId, selectedLotId]);

  // [SENIOR] Sync all filters to URL & LocalStorage
  useEffect(() => {
    const params = {};
    if (selectedPid) {
      params.project_id = selectedPid;
      localStorage.setItem("last_project_id", selectedPid);
    }
    if (selectedPeriodId) {
      params.period_id = selectedPeriodId;
    }
    if (selectedLotId) {
      params.lot_id = selectedLotId;
    }
    const currentParams = Object.fromEntries(searchParams.entries());
    if (JSON.stringify(currentParams) !== JSON.stringify(params)) {
      setSearchParams(params, { replace: true });
    }
  }, [selectedPid, selectedPeriodId, selectedLotId, setSearchParams]);

  useEffect(() => {
    projectService.getAll().then(data => {
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      // Force default project selection if none selected or "all"
      if (!selectedPid || selectedPid === "all" || selectedPid === "") {
        if (list.length > 0) {
          setSelectedPid(String(list[0].id));
        }
      }
    });
  }, [selectedPid]);

  // [SENIOR] Scroll to hash on load
  useEffect(() => {
    if (window.location.hash === "#timeline" && !loading) {
      setTimeout(() => {
        const el = document.getElementById("timeline-section");
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, [loading]);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Core Developer Data
      const devData = await developerService.getById(id, selectedPeriodId);
      if (!devData) throw new Error("Développeur introuvable");
      setDeveloper(devData);

      // 2. Fetch Secondary Data (Non-blocking)
      const [heatData, timelineData, allPeriodsData] = await Promise.all([
        developerService.getHeatmap(id, heatmapMonths).catch(() => null),
        developerService.getTimeline(id, selectedPeriodId).catch((err) => {
          console.error("Timeline fetch error:", err);
          // Return basic timeline with onboarding event if complex timeline fails
          return [{
            date: developerData?.onboarding_date || developerData?.created_at,
            title: "Onboarding",
            description: "Création du profil ou intégration dans l'entreprise",
            icon: "ri-user-add-line",
            color: "success"
          }];
        }),
        periodService.getAll().catch(() => [])
      ]);
      
      setAlerts([]); // Alerts endpoint désactivé - utiliser tableau vide
      setHeatmap(heatData?.activity || []);
      setHeatmapMeta(heatData || null);
      setTimeline(timelineData || []);
      
      // Load all periods globally (not project-specific)
      if (allPeriodsData && allPeriodsData.length > 0) {
        const availablePeriods = allPeriodsData.map(p => ({
          id: p.id,
          label: `${p.month}/${p.year}` // Use actual period month/year instead of created_at
        })).reverse();
        setPeriods(availablePeriods);
        
        // Auto-select first period if none selected
        if (!selectedPeriodId && availablePeriods.length > 0) {
          setSelectedPeriodId(availablePeriods[0].id);
        }
      }

      // 3. Project-specific KPIs (always project-specific, no global mode)
      const p_id = selectedPid ? parseInt(selectedPid) : null;

      // Validate that selected project exists in the projects list
      if (p_id && projects.length > 0) {
        const projectExists = projects.some(p => p.id === p_id);
        if (!projectExists) {
          console.warn(`Project ${p_id} not found in available projects, falling back to first project`);
          setSelectedPid(projects[0].id);
          return; // Exit and reload with valid project
        }
      }

      if (p_id) {
        // Mode Projet Spécifique
        const hist = await analyticsService.getHistory(p_id, { developerId: parseInt(id) }).catch(() => null);
        const snaps = hist?.snapshots || (Array.isArray(hist) ? hist : []);
        
        // Update periods with project-specific snapshots if available
        let targetPeriodId = selectedPeriodId;
        if (snaps && snaps.length > 0) {
          const projectPeriods = snaps.map(s => ({
            id: s.period_id,
            label: new Date(s.snapshot_date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
          })).reverse();
          setPeriods(projectPeriods);
          
          targetPeriodId = selectedPeriodId || (projectPeriods.length > 0 ? projectPeriods[0].id : null);
          if (targetPeriodId && !selectedPeriodId) setSelectedPeriodId(targetPeriodId);
        }

        let snap = null;
        if (targetPeriodId && !selectedLotId) {
          snap = snaps.find(s => s.period_id === targetPeriodId);
        } else {
          snap = await analyticsService.getLatest(p_id, { developerId: parseInt(id), lotId: selectedLotId, periodId: selectedPeriodId }).catch(() => null);
        }
        setSnapshot(snap);

        const summ = await analyticsService.getDeveloperSummary(p_id, parseInt(id), { lotId: selectedLotId, periodId: selectedPeriodId }).catch(() => null);
        setSummary(summ);
        
        const currentIndex = snaps.findIndex(s => s.period_id === targetPeriodId);
        setPrevSnap(currentIndex > 0 ? snaps[currentIndex - 1] : null);
      }
    } catch (err) {
      console.error("Profile Load Error:", err);
      setError(err.message || "Erreur lors du chargement du profil");
    } finally {
      setLoading(false);
      // 4. Load History Trend (Independent)
      setLoadingHistory(true);
      try {
        const histData = await analyticsService.getTrend(selectedPid, { 
          developerId: parseInt(id), 
          kpiField: 'developer_score', 
          months: 12,
          periodId: selectedPeriodId
        });
        setHistory(histData.datasets?.[0]?.data || []);
      } catch (e) {
        console.error("History Load Error:", e);
      } finally {
        setLoadingHistory(false);
      }
    }
  }, [id, selectedPid, selectedPeriodId, heatmapMonths, selectedLotId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <LoadingSpinner fullPage text="Chargement du profil..." />;
  if (!developer) return <EmptyState title="Profil introuvable" />;

  const kpis = [
    { 
      title: "Mentorat (Commentaires)", 
      value: summary?.total_comments ?? 0, 
      icon: "ri-chat-4-line",   
      color: "primary", 
      delta: snapshot ? { value: `${snapshot.total_comments ?? 0} ce mois`, color: "secondary", icon: "ri-calendar-event-line" } : null,
      onClick: handleOpenCommentsModal
    },
    { 
      title: "Revues de code",    
      value: summary?.total_reviews ?? 0, 
      icon: "ri-eye-line", 
      color: "info", 
      delta: snapshot ? { value: `${snapshot.total_reviews ?? 0} ce mois`, color: "secondary", icon: "ri-calendar-event-line" } : null,
      onClick: handleOpenReviewsModal
    },
    { 
      title: "MRs Créées", 
      value: summary?.total_mrs_created ?? 0, 
      icon: "ri-git-pull-request-line", 
      color: "success", 
      delta: snapshot ? { value: `${snapshot.total_mrs_created ?? 0} ce mois`, color: "secondary", icon: "ri-calendar-event-line" } : null 
    },
    { 
      title: "Total Commits", 
      value: summary?.total_commits ?? 0, 
      icon: "ri-code-line", 
      color: "warning", 
      delta: snapshot ? { value: `${snapshot.total_commits ?? 0} ce mois`, color: "secondary", icon: "ri-calendar-event-line" } : null 
    },
    { 
      title: "Score Global",   
      value: summary ? fmt((summary.developer_score || 0) * 100, 0) : "—", 
      unit: summary ? " pts" : "", 
      icon: "ri-medal-line", 
      color: "danger",
      delta: snapshot ? deltaInfo(snapshot.developer_score, prevSnap?.developer_score) : null,
      subtitle: "Basé sur commits, MRs, approbation et revues"
    }
  ];

  if (loading || !developer) return <LoadingSpinner message="Chargement du profil..." />;

  return (
    <div className="page-content">
      <div className="container-fluid">
        {/* ── Bandeau de contexte Lot */}
        {selectedLotId && (
          <div className="alert alert-info border-0 shadow-sm mb-4 d-flex align-items-center gap-3 py-2 px-4" 
            style={{ borderRadius: 12, background: "linear-gradient(90deg, #eff6ff, #f0fdf4)", borderLeft: "4px solid #3b82f6 !important" }}>
            <i className="ri-stack-line fs-20 text-primary"></i>
            <div className="flex-grow-1">
              <span className="fw-bold text-primary me-2">Mode Exploration : Session #{selectedLotId}</span>
              <span className="text-muted fs-12">| Profil restreint au périmètre de cette session d'extraction.</span>
              <span className="badge bg-primary-subtle text-primary ms-2 fs-11">Isolation Totale</span>
            </div>
            <Link to="/extraction-lots" className="btn btn-sm btn-soft-primary d-flex align-items-center gap-1">
              <i className="ri-arrow-left-line"></i> Retour aux lots
            </Link>
          </div>
        )}

        {/* Header pattern */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between mb-4">
              <h4 className="mb-sm-0 fw-bold"><i className="ri-user-settings-line me-2 text-primary"></i>Profil Développeur</h4>
              <div className="page-title-right">
                <ol className="breadcrumb m-0 fs-12">
                  <li className="breadcrumb-item"><Link to="/admin/developers">Hub</Link></li>
                  <li className="breadcrumb-item active">{developer.name || developer.gitlab_username}</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Identity Section */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="card border-0 shadow-sm overflow-hidden">
              <div className="card-body p-4">
                <div className="row align-items-center g-4">
                  <div className="col-auto">
                    <div className="avatar-lg">
                       <span className="avatar-title bg-primary-subtle text-primary rounded-3 fs-1 fw-bold">
                          {getInitials(developer.name || developer.gitlab_username)}
                       </span>
                    </div>
                  </div>
                  <div className="col">
                    <div className="d-flex align-items-center gap-3 mb-2">
                       <h3 className="fw-bold mb-0 text-dark">{developer.name || developer.gitlab_username}</h3>
                       {developer.is_validated ? <span className="badge bg-success-subtle text-success fs-11">VALIDÉ</span> : <span className="badge bg-warning-subtle text-warning fs-11">EN ATTENTE</span>}
                       {getBadges(summary).map((b, i) => (
                         <span key={i} className={`badge bg-${b.color}-subtle text-${b.color} fs-11 shadow-sm d-flex align-items-center gap-1`}>
                           <i className={b.icon}></i>{b.label}
                         </span>
                       ))}
                       {!developer.is_active && <span className="badge bg-danger-subtle text-danger fs-11">DÉPART LE {fmtDate(developer.offboarding_date)}</span>}
                    </div>
                    <div className="d-flex flex-wrap gap-4 text-muted fs-13">
                       <span><i className="ri-at-line me-1 text-primary"></i>@{developer.gitlab_username}</span>
                       <span><i className="ri-mail-line me-1 text-primary"></i>{developer.email || "N/A"}</span>
                       <span><i className="ri-building-line me-1 text-primary"></i>{projects.find(p=>p.id===parseInt(selectedPid))?.name || "Projet"}</span>
                       {developer.sites?.length > 0 && (() => {
                         const siteNames = developer.sites
                           .map(s => typeof s === "string" ? s : (s.name || s.site_name || s.label || s.code || null))
                           .filter(Boolean);
                         return siteNames.length > 0 ? (
                           <span><i className="ri-map-pin-line me-1 text-primary"></i>{siteNames.join(", ")}</span>
                         ) : null;
                       })()}
                    </div>
                  </div>
                  <div className="col-xl-auto">
                    <div className="d-flex flex-wrap justify-content-xl-end gap-2 mb-3">
                       <Link to={`/commits?developer_id=${id}&project_id=${selectedPid}${selectedLotId ? `&lot_id=${selectedLotId}` : ""}`} 
                          className="btn btn-soft-primary d-flex align-items-center gap-1 shadow-sm fs-12 fw-bold">
                          <i className="ri-history-line"></i> Commits
                       </Link>
                       <Link to={`/merge?developer_id=${id}&project_id=${selectedPid}${selectedLotId ? `&lot_id=${selectedLotId}` : ""}`} 
                          className="btn btn-soft-info d-flex align-items-center gap-1 shadow-sm fs-12 fw-bold">
                          <i className="ri-git-merge-line"></i> MRs
                       </Link>
                       <button className="btn btn-primary d-flex align-items-center gap-1 shadow-sm fs-12 fw-bold" onClick={() => setExportingPdf(true)}>
                          <i className="ri-file-pdf-line"></i> PDF
                       </button>
                    </div>
                    <div className="d-flex flex-wrap flex-sm-nowrap justify-content-sm-end gap-2">
                        <div style={{ width: 160 }}>
                           <label className="fs-11 fw-bold text-muted text-uppercase mb-1 d-block">Période</label>
                           <select className="form-select form-select-sm border-light"
                             value={selectedPeriodId || ""} onChange={e => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}>
                             <option value="">Dernière</option>
                             {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                           </select>
                        </div>
                        <div style={{ width: 160 }}>
                           <label className="fs-11 fw-bold text-muted text-uppercase mb-1 d-block">Projet</label>
                           <select className="form-select form-select-sm border-light"
                             value={selectedPid} onChange={e => setSelectedPid(e.target.value)}>
                             {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                           </select>
                        </div>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* KPI Cards — Toujours affichées pour la structure */}
        <div className="row g-3 mb-4">
          {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
        </div>

        {/* Phase 5: Monthly Evolution Chart (SENIOR Strategic View) */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="card border-0 shadow-sm overflow-hidden">
              <div className="card-header bg-light-subtle border-bottom py-3 d-flex align-items-center">
                <h4 className="card-title mb-0 flex-grow-1">
                  <i className="ri-pulse-line me-2 text-primary"></i>Évolution de la Performance Mensuelle
                </h4>
                <div className="badge bg-soft-primary text-primary">Vue Historique</div>
              </div>
              <div className="card-body p-0">
                 <div style={{ height: 320, padding: '20px 20px 0 20px' }}>
                    <ReactApexChart 
                       options={{
                          chart: { 
                            type: 'area', 
                            toolbar: { show: false }, 
                            sparkline: { enabled: false },
                            fontFamily: "'Inter', sans-serif"
                          },
                          stroke: { 
                            curve: 'smooth', 
                            width: 3,
                            lineCap: 'round'
                          },
                          fill: { 
                            type: 'gradient', 
                            gradient: { 
                              shadeIntensity: 1, 
                              opacityFrom: 0.7, 
                              opacityTo: 0.1,
                              stops: [0, 90, 100]
                            } 
                          },
                          xaxis: { 
                            categories: periods.map(p => p.label).reverse(),
                            labels: { 
                              style: { 
                                colors: '#64748b', 
                                fontSize: '12px', 
                                fontWeight: 500,
                                fontFamily: "'Inter', sans-serif"
                              } 
                            },
                            axisBorder: { show: false }, 
                            axisTicks: { show: false },
                            tooltip: { enabled: false }
                          },
                          yaxis: { 
                            labels: { 
                              style: { 
                                colors: '#64748b', 
                                fontSize: '12px', 
                                fontWeight: 500,
                                fontFamily: 'Inter, sans-serif'
                              } 
                            },
                            min: 0,
                            max: 100,
                            tickAmount: 8,
                            floating: false
                          },
                          grid: { 
                            borderColor: '#e2e8f0', 
                            strokeDashArray: 4,
                            row: { colors: ['#f1f5f9', 'transparent'], opacity: 1 },
                            padding: { top: 0, right: 0, bottom: 0, left: 10 }
                          },
                          colors: ['#6366f1'],
                          dataLabels: { enabled: false },
                          tooltip: { 
                            theme: 'light', 
                            x: { show: true },
                            y: { 
                              formatter: (val) => val.toFixed(0),
                              title: { formatter: () => 'Score' }
                            },
                            marker: { show: true },
                            style: {
                              fontSize: '12px',
                              fontFamily: 'Inter, sans-serif'
                            }
                          },
                          annotations: {
                            yaxis: [
                              {
                                y: 25,
                                borderColor: '#94a3b8',
                                borderWidth: 1,
                                borderDash: 4,
                                label: {
                                  borderColor: '#94a3b8',
                                  style: {
                                    color: '#64748b',
                                    background: '#fff',
                                    fontSize: '10px',
                                    fontWeight: 500,
                                    padding: { left: 4, right: 4, top: 2, bottom: 2 },
                                    borderRadius: 4
                                  },
                                  text: '25',
                                  position: 'left',
                                  textAnchor: 'start'
                                }
                              },
                              {
                                y: 50,
                                borderColor: '#94a3b8',
                                borderWidth: 1,
                                borderDash: 4,
                                label: {
                                  borderColor: '#94a3b8',
                                  style: {
                                    color: '#64748b',
                                    background: '#fff',
                                    fontSize: '10px',
                                    fontWeight: 500,
                                    padding: { left: 4, right: 4, top: 2, bottom: 2 },
                                    borderRadius: 4
                                  },
                                  text: '50',
                                  position: 'left',
                                  textAnchor: 'start'
                                }
                              },
                              {
                                y: 75,
                                borderColor: '#94a3b8',
                                borderWidth: 1,
                                borderDash: 4,
                                label: {
                                  borderColor: '#94a3b8',
                                  style: {
                                    color: '#64748b',
                                    background: '#fff',
                                    fontSize: '10px',
                                    fontWeight: 500,
                                    padding: { left: 4, right: 4, top: 2, bottom: 2 },
                                    borderRadius: 4
                                  },
                                  text: '75',
                                  position: 'left',
                                  textAnchor: 'start'
                                }
                              }
                            ]
                          },
                          markers: {
                            size: 6,
                            colors: ['#ffffff'],
                            strokeColors: ['#6366f1'],
                            strokeWidth: 2,
                            hover: { size: 8 }
                          }
                       }}
                       series={[{
                          name: 'Score de Performance',
                          data: history.length > 0 ? history : [Math.round((summary?.developer_score || 0) * 100)]
                       }]}
                       type="area"
                       height={300}
                    />
                 </div>
              </div>
            </div>
          </div>
        </div>


        <div className="row g-4">
          {/* Heatmap Section */}
          <div className="col-xl-8">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header border-bottom d-flex align-items-center">
                <h4 className="card-title mb-0 flex-grow-1"><i className="ri-calendar-todo-line me-2 text-success"></i>Activité Git (Derniers 12 mois)</h4>
                <div className="dropdown">
                   <button className="btn btn-soft-secondary btn-sm" onClick={() => loadData()}><i className="ri-refresh-line"></i></button>
                </div>
              </div>
              <div className="card-body">
                <ActivityHeatmap data={heatmap} startDate={heatmapMeta?.start_date} endDate={heatmapMeta?.end_date} loading={loadingHeatmap} />
                <div className="mt-4 pt-3 border-top border-light">
                   <div className="row text-center">
                      <div className="col-4 border-end border-light">
                         <h5 className="fw-bold mb-1">{heatmapMeta?.total_commits || 0}</h5>
                         <p className="text-muted fs-11 mb-0 text-uppercase">Total Commits <br/><span className="fs-9 opacity-75">(Hors merges)</span></p>
                      </div>
                      <div className="col-4 border-end border-light">
                         <h5 className="fw-bold mb-1">{heatmapMeta?.total_days_active || 0}</h5>
                         <p className="text-muted fs-12 mb-0 uppercase">JOURS ACTIFS</p>
                      </div>
                      <div className="col-4">
                         <h5 className="fw-bold mb-1">{fmt(heatmapMeta?.avg_per_day, 1)}</h5>
                         <p className="text-muted fs-12 mb-0 uppercase">MOY / JOUR</p>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>

          {/* Radar & Analysis - REMOVED */}
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="row mt-4">
            <div className="col-12">
              <div className="card border-0 shadow-sm">
                <div className="card-header border-bottom bg-danger bg-opacity-10 py-3">
                  <h4 className="card-title mb-0 text-danger"><i className="ri-error-warning-line me-2"></i>Alertes Actives ({alerts.length})</h4>
                </div>
                <div className="card-body">
                   <div className="table-responsive">
                      <table className="table table-nowrap align-middle mb-0">
                         <tbody>
                            {alerts.map((a, i) => (
                               <tr key={i}>
                                  <td style={{width: 40}}><i className={`ri-alert-fill fs-20 text-${a.level === 'CRITICAL' ? 'danger' : 'warning'}`}></i></td>
                                  <td>
                                     <h6 className="fs-13 mb-1">{a.rule_name}</h6>
                                     <p className="text-muted mb-0 fs-12">{a.description}</p>
                                  </td>
                                  <td><span className={`badge bg-${a.level === 'CRITICAL' ? 'danger' : 'warning'}-subtle text-${a.level === 'CRITICAL' ? 'danger' : 'warning'}`}>{a.level}</span></td>
                                  <td className="text-muted fs-12">{fmtDate(a.detected_at)}</td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 6: Lifecycle Timeline (SCD Type 2) */}
        <div className="row mt-4 mb-5" id="timeline-section">
          <div className="col-12">
            <div className="card border-0 shadow-sm overflow-hidden">
              <div className="card-header bg-light-subtle border-bottom py-3 d-flex align-items-center">
                <h4 className="card-title mb-0 flex-grow-1"><i className="ri-history-line me-2 text-primary"></i>Timeline d'Activité & Présence Professionnelle</h4>
                <span className="badge bg-soft-info text-info fs-11">Source : RH + GitLab</span>
              </div>
              <div className="card-body pt-4">
                <div className="position-relative ms-3 ps-4" style={{ borderLeft: "2px solid #eff2f7" }}>
                  {timeline.map((ev, i) => (
                    <div key={i} className="mb-4 position-relative">
                      <div className={`position-absolute bg-${ev.color}-subtle text-${ev.color} rounded-circle d-flex align-items-center justify-content-center shadow-sm`} 
                           style={{ width: 32, height: 32, left: -49, top: -2, border: "3px solid #fff", zIndex: 2 }}>
                        <i className={`${ev.icon} fs-14`}></i>
                      </div>
                      <div className="d-flex justify-content-between align-items-start mb-1 ms-2">
                        <div className="flex-grow-1">
                           <div className="d-flex align-items-center justify-content-between mb-1">
                             <div className="d-flex align-items-center gap-2">
                               <h6 className="mb-0 fw-bold text-dark">{ev.title}</h6>
                               {ev.is_mission && (
                                 <span className="badge bg-soft-success text-success fs-10 border border-success border-opacity-25">
                                   <i className="ri-verified-badge-line me-1"></i>AFFECTATION RH
                                 </span>
                               )}
                             </div>
                             <span className="text-muted fs-11 fw-semibold"><i className="ri-calendar-event-line me-1"></i>{fmtDate(ev.date)}</span>
                           </div>
                           
                           {ev.is_mission ? (
                             <div className="mt-2 p-3 bg-primary bg-opacity-10 rounded-3 border-start border-4 border-primary shadow-sm" style={{ borderColor: '#4361ee !important' }}>
                                <div className="d-flex align-items-center gap-3">
                                   <div style={{ width: 40, height: 40, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4361ee', boxShadow: '0 2px 6px rgba(67,97,238,0.1)' }}>
                                      <i className="ri-rocket-2-fill fs-20"></i>
                                   </div>
                                   <div>
                                      <p className="text-dark fs-13 mb-0 fw-bold">{ev.description}</p>
                                      <p className="text-muted fs-11 mb-0">Mission certifiée par le système de pilotage</p>
                                   </div>
                                </div>
                             </div>
                           ) : (
                             <div className="mt-2 p-3 bg-light bg-opacity-50 rounded-3 border-start border-4 border-primary shadow-sm" style={{ borderColor: `var(--vz-${ev.color}) !important` }}>
                                <p className="text-dark fs-13 mb-0" style={{ lineHeight: '1.5', fontWeight: 500 }}>{ev.description}</p>
                                {ev.details && Object.keys(ev.details).length > 0 && (
                                  <div className="mt-2 pt-2 border-top border-dashed border-muted fs-10 text-muted">
                                     <i className="ri-terminal-box-line me-1"></i>
                                     Données d'audit : {typeof ev.details === 'string' ? ev.details : JSON.stringify(ev.details).slice(0, 80)}...
                                  </div>
                                )}
                             </div>
                           )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {timeline.length === 0 && (
                    <div className="text-center py-4">
                      <i className="ri-calendar-line fs-40 text-light d-block mb-2"></i>
                      <div className="text-muted fs-13">Aucun historique d'activité disponible pour ce profil.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 3: Export PDF Button */}
        <div className="row mt-4 mb-4 d-print-none">
          <div className="col-12 d-flex gap-2 justify-content-end flex-wrap">
            {/* [NEW] Bouton Analyse Performance 360° */}
            <button
              className="btn d-flex align-items-center gap-2 fw-semibold"
              style={{background:"linear-gradient(135deg,#f7b84b,#f06548)",color:"#fff",border:"none",boxShadow:"0 4px 12px rgba(240,101,72,0.35)",transition:"all .2s"}}
              onClick={() => navigate(`/developers/${id}/performance?project_id=${selectedPid}${selectedPeriodId ? `&period_id=${selectedPeriodId}` : ""}${selectedLotId ? `&lot_id=${selectedLotId}` : ""}`)}
            >
              <i className="ri-bar-chart-2-line"></i>Analyse Performance 360°
            </button>
            <button 
              className="btn btn-soft-danger d-flex align-items-center gap-2"
              onClick={() => {
                const originalTitle = document.title;
                document.title = `Bilan_${(developer.name || developer.gitlab_username).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`;
                window.print();
                document.title = originalTitle;
              }}
            >
              <i className="ri-file-pdf-line"></i>Export PDF du bilan
            </button>
            <button className="btn btn-soft-primary d-flex align-items-center gap-2" onClick={() => navigate(`/developers`)}>
              <i className="ri-arrow-left-line"></i>Retour au Hub
            </button>
          </div>
        </div>
      </div>

      {/* Review Details Modal */}
      {showReviewsModal && (
        <ReviewDetailModal
          reviews={reviewsData}
          loading={loadingReviews}
          onClose={() => setShowReviewsModal(false)}
          developerName={developer?.name || developer?.gitlab_username || "Développeur"}
          projectName={projects.find(p => p.id === parseInt(selectedPid))?.name || "Projet"}
          periodLabel={periods.find(p => p.id === selectedPeriodId)?.label || ""}
        />
      )}

      {/* Comments Details Modal */}
      {showCommentsModal && (
        <CommentsDetailModal
          comments={commentsData}
          loading={loadingComments}
          onClose={() => setShowCommentsModal(false)}
          developerName={developer?.name || developer?.gitlab_username || "Développeur"}
          projectName={projects.find(p => p.id === parseInt(selectedPid))?.name || "Projet"}
          periodLabel={periods.find(p => p.id === selectedPeriodId)?.label || ""}
        />
      )}

      {/* Global & Print styles */}
      <style>{`
        @media print {
          .d-print-none, nav, .sidebar, #topnav, .topnav, .btn, select, .card-header .btn, .footer, .theme-customizer, .page-title-right { display: none !important; }
          .page-content { padding: 0 !important; margin: 0 !important; }
          .main-content { margin-left: 0 !important; }
          .card { break-inside: avoid; box-shadow: none !important; border: 1px solid #e9ecef !important; }
          body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .container-fluid { max-width: 100% !important; }
        }

        /* GitHub Style Premium Animaton */
        @keyframes fadeHeatCell {
          0% { opacity: 0; transform: scale(0.3) translateY(4px); }
          60% { transform: scale(1.2) translateY(-1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        
        .heat-cell {
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
        }
        
        .heat-cell:hover {
          transform: scale(1.6) translateY(-2px) !important;
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
          z-index: 10 !important;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
