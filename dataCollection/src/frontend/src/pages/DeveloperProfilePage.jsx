/**
 * pages/DeveloperProfilePage.jsx
 * 
 * SENIOR REFACTOR: Harmonized with Corporate/Velzon style.
 * Using standard card-animate, page-title-box, and brand colors.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import developerService from "../services/developerService";
import analyticsService from "../services/analyticsService";
import projectService from "../services/projectService";
import periodService from "../services/periodService";
import { exportService } from "../services";
import api from "../services/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";
import ScoreRadarChart from "../components/charts/ScoreRadarChart";
import ReactApexChart from "react-apexcharts";  // Phase 5: Evolution chart

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

// ─── Score Formula Modal ─────────────────────────────────────────────────────────
function ScoreFormulaModal({ onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-label="Formule Score Global"
      style={{ backgroundColor: "rgba(30,34,45,0.6)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f1f3f7" }}>
            <div className="d-flex align-items-center justify-content-between">
              <h5 className="fw-semibold text-dark mb-0" style={{ fontSize: 16 }}>
                <i className="ri-medal-line me-2 text-danger"></i>Formule Score Global
              </h5>
              <button className="btn-close flex-shrink-0" style={{ opacity: 0.5 }} onClick={onClose} aria-label="Fermer"></button>
            </div>
          </div>
          <div className="px-4 py-4">
            <p className="text-muted mb-4" style={{ fontSize: 13 }}>
              Le score global est calculé sur une échelle de 0 à 100 pts basé sur 4 métriques pondérées :
            </p>
            <div className="d-flex flex-column gap-3">
              <div className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ background: "#f0fdf4", border: "1px solid #d1fae5" }}>
                <div className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white" style={{ width: 40, height: 40, background: "#10b981", fontSize: 14 }}>
                  25%
                </div>
                <div className="flex-grow-1">
                  <div className="fw-semibold text-dark" style={{ fontSize: 14 }}>Taux de Commits</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>Commits par développeur (normalisé sur 10 commits/mois)</div>
                </div>
              </div>
              <div className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                <div className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white" style={{ width: 40, height: 40, background: "#3b82f6", fontSize: 14 }}>
                  25%
                </div>
                <div className="flex-grow-1">
                  <div className="fw-semibold text-dark" style={{ fontSize: 14 }}>Taux de MRs</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>MRs créées par développeur (normalisé sur 5 MRs/mois)</div>
                </div>
              </div>
              <div className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ background: "#fef3c7", border: "1px solid #fde68a" }}>
                <div className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white" style={{ width: 40, height: 40, background: "#f59e0b", fontSize: 14 }}>
                  30%
                </div>
                <div className="flex-grow-1">
                  <div className="fw-semibold text-dark" style={{ fontSize: 14 }}>Taux d'Approbation</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>Pourcentage de MRs approuvées</div>
                </div>
              </div>
              <div className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ background: "#fce7f3", border: "1px solid #fbcfe8" }}>
                <div className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white" style={{ width: 40, height: 40, background: "#ec4899", fontSize: 14 }}>
                  20%
                </div>
                <div className="flex-grow-1">
                  <div className="fw-semibold text-dark" style={{ fontSize: 14 }}>Temps de Revue</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>Score inverse (moins de temps = meilleur score)</div>
                </div>
              </div>
            </div>
            
          </div>
          <div className="px-4 py-3 d-flex align-items-center justify-content-end" style={{ borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px" }}>
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
                  Profil Développeur - {developerName}
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
const fmt = (n, d = 2) => (n == null || isNaN(+n)) ? "—" : (+n).toFixed(d);
const fmtPct = (n) => (n == null || isNaN(+n)) ? "—" : `${(+n * 100).toFixed(0)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const MOIS_FR = { 0: "Jan", 1: "Fév", 2: "Mar", 3: "Avr", 4: "Mai", 5: "Jun", 6: "Jul", 7: "Aoû", 8: "Sep", 9: "Oct", 10: "Nov", 11: "Déc" };
const COLORS = ["primary", "success", "info", "warning", "danger", "secondary"];

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
    : { value: `${pct.toFixed(1)}%`, color: "danger", icon: "ri-arrow-down-line" };
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
          {["Lun", "", "Mer", "", "Ven", "", "Dim"].map((d, i) => (
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

// ─── Component: Individual KPI Card (Premium Pattern from CommitsPage) ───────────────
function KpiCard({ title, value, unit, icon, color, delta, subtitle, onClick }) {
  // Map Bootstrap color names to hex values
  const colorMap = {
    primary: "#405189",
    success: "#0ab39c",
    info: "#299cdb",
    warning: "#f7b84b",
    danger: "#f06548",
    secondary: "#3577f1"
  };
  const accentColor = colorMap[color] || colorMap.primary;
  const rgbColor = accentColor === "#405189" ? "64, 81, 137" :
                   accentColor === "#0ab39c" ? "10, 179, 156" :
                   accentColor === "#f06548" ? "240, 101, 72" :
                   accentColor === "#299cdb" ? "41, 156, 219" :
                   accentColor === "#f7b84b" ? "247, 184, 75" : "64, 81, 137";

  return (
    <div className="col-xl-4 col-sm-6">
      <div className="kpi-card-wrapper">
        <div className="kpi-card-premium"
          style={{
            cursor: onClick ? 'pointer' : 'default',
            '--kpi-accent': accentColor,
            '--kpi-accent-rgb': rgbColor,
          }}
          onClick={onClick}>
          {/* Subtle dynamic background gradient glowing effect */}
          <div className="kpi-card-glow-bg" style={{background: `radial-gradient(circle at top right, rgba(${rgbColor}, 0.08), transparent 70%)`}}></div>
          
          {/* Background blob */}
          <div className="kpi-card-blob" style={{opacity: 0.04}}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="180" height="110">
              <path fill={accentColor} d="m189.5-25.8c0 0 20.1 46.2-26.7 71.4 0 0-60 15.4-62.3 65.3-2.2 49.8-50.6 59.3-57.8 61.5-7.2 2.3-60.8 0-60.8 0l-11.9-199.4z"/>
            </svg>
          </div>
          
          <div className="kpi-card-inner">
            <div className="kpi-icon-wrap" style={{background: `${accentColor}12`, color: accentColor, boxShadow: `0 4px 14px rgba(${rgbColor}, 0.15)`}}>
              <i className={icon}></i>
            </div>
            <div className="kpi-text">
              <p className="kpi-label">{title}</p>
              <h4 className="kpi-value" style={{color: "#1e293b"}}>{value ?? "—"}<span className="kpi-unit">{unit}</span></h4>
              {subtitle && <p className="kpi-sub"><span className="kpi-sub-badge" style={{background: `${accentColor}10`, color: accentColor}}>{subtitle}</span></p>}
              {delta && (
                <p className="kpi-delta">
                  <span className={`badge bg-${delta.color}-subtle text-${delta.color} fs-11`}>
                    <i className={`${delta.icon} me-1`}></i>{delta.value}
                  </span>
                </p>
              )}
            </div>
          </div>
          
          {/* Beautiful indicator bar at the bottom */}
          <div className="kpi-active-bar" style={{background: `linear-gradient(90deg, ${accentColor}, rgba(${rgbColor}, 0.4))`}}></div>
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

  const [developer, setDeveloper] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [summary, setSummary] = useState(null);
  const [prevSnap, setPrevSnap] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [heatmap, setHeatmap] = useState([]);
  const [heatmapMeta, setHeatmapMeta] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedPid, setSelectedPid] = useState(projectId || localStorage.getItem("last_project_id") || "");
  const [selectedPeriodId, setSelectedPeriodId] = useState(searchParams.get("period_id") ? Number(searchParams.get("period_id")) : null);
  const [selectedLotId, setSelectedLotId] = useState(lotIdParam || "");
  const [periods, setPeriods] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [heatmapMonths, setHeatmapMonths] = useState(12);

  // Review details modal state
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [reviewsData, setReviewsData] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [commentsData, setCommentsData] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [showScoreFormulaModal, setShowScoreFormulaModal] = useState(false);

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
      // Sort timeline: Onboarding first, then mutation events before missions for same date, then chronological (oldest to newest)
      const sortedTimeline = (timelineData || []).sort((a, b) => {
        // Onboarding always first
        if (a.title === 'Onboarding' && b.title !== 'Onboarding') return -1;
        if (b.title === 'Onboarding' && a.title !== 'Onboarding') return 1;
        
        // For same date, mutation events (non-mission) before missions
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (dateA.getTime() === dateB.getTime()) {
          const isMissionA = a.title.startsWith('Mission :');
          const isMissionB = b.title.startsWith('Mission :');
          // Non-mission events (like "Mutation d'affectation") come before missions
          if (!isMissionA && isMissionB) return -1;
          if (isMissionA && !isMissionB) return 1;
        }
        
        // Then sort by date (oldest first)
        return dateA - dateB;
      });
      setTimeline(sortedTimeline);

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
        // Mode Projet Spécifique - Use global periods like DevelopersHubPage
        const hist = await analyticsService.getHistory(p_id, { developerId: parseInt(id), periodId: selectedPeriodId }).catch(() => null);
        const snaps = hist?.snapshots || (Array.isArray(hist) ? hist : []);

        // Keep global periods (don't replace with project-specific snapshots)
        // This ensures consistency with DevelopersHubPage behavior
        // Only use project periods if no global periods exist
        if (periods.length === 0 && snaps && snaps.length > 0) {
          const projectPeriods = snaps.map(s => ({
            id: s.period_id,
            label: new Date(s.snapshot_date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
          })).reverse();
          setPeriods(projectPeriods);
        }

        let targetPeriodId = selectedPeriodId;
        
        // Find snapshot for selected period
        let snap = null;
        if (targetPeriodId && !selectedLotId && snaps && snaps.length > 0) {
          snap = snaps.find(s => s.period_id === targetPeriodId);
        }
        
        // If no snapshot found in history, try getLatest with period_id
        if (!snap) {
          snap = await analyticsService.getLatest(p_id, { developerId: parseInt(id), lotId: selectedLotId, periodId: selectedPeriodId }).catch(() => null);
        }
        
        setSnapshot(snap);

        // Use leaderboard data like DevelopersHubPage for consistency
        const leaderboard = await developerService.getLeaderboard(p_id, { 
          limit: 1, 
          developerId: parseInt(id), 
          periodId: selectedPeriodId 
        }).catch(() => null);
        
        const lbEntry = leaderboard?.entries?.[0];
        setSummary(lbEntry ? {
          developer_score: lbEntry.developer_score,
          total_commits: lbEntry.commit_count,
          total_mrs_created: lbEntry.mr_count,
          total_reviews: lbEntry.review_count || 0,
          approved_mr_rate: lbEntry.approved_rate,
          avg_review_time_hours: lbEntry.avg_review_hours,
          latest_snapshot: snap
        } : null);

        const currentIndex = snaps.findIndex(s => s.period_id === selectedPeriodId);
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
        // Convert decimal scores (0-1) to percentage (0-100)
        const historyData = histData.datasets?.[0]?.data || [];
        setHistory(historyData.map(val => Math.round((val || 0) * 100)));
      } catch (e) {
        console.error("History Load Error:", e);
      } finally {
        setLoadingHistory(false);
      }
    }
  }, [id, selectedPid, selectedPeriodId, heatmapMonths, selectedLotId]);

  useEffect(() => { 
    loadData(); 
  }, [loadData, selectedPeriodId]);

  if (loading) return <LoadingSpinner fullPage text="Chargement du profil..." />;
  if (!developer) return <EmptyState title="Profil introuvable" />;

  const kpis = [
    {
      title: "Score Global",
      value: summary ? fmt((summary.developer_score || 0) * 100, 0) : "—",
      unit: summary ? " pts" : "",
      icon: "ri-medal-line",
      color: "danger",
      delta: summary?.latest_snapshot ? deltaInfo(summary.developer_score, prevSnap?.developer_score) : null,
      subtitle: "Basé sur commits, MRs et approbation",
      onClick: () => setShowScoreFormulaModal(true)
    },
    {
      title: "Total Commits",
      value: summary?.total_commits ?? 0,
      icon: "ri-code-line",
      color: "warning",
      delta: summary?.latest_snapshot ? { value: `${summary?.latest_snapshot?.total_commits ?? 0} ce mois`, color: "secondary", icon: "ri-calendar-event-line" } : null
    },
    {
      title: "MRs Créées",
      value: summary?.total_mrs_created ?? 0,
      icon: "ri-git-pull-request-line",
      color: "success",
      delta: summary?.latest_snapshot ? { value: `${summary?.latest_snapshot?.total_mrs_created ?? 0} ce mois`, color: "secondary", icon: "ri-calendar-event-line" } : null
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

        {/* Identity Section - Premium Design */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="card border-0 shadow-sm overflow-hidden">
              <div className="card-body p-0">
                <div className="premium-identity-card">
                  {/* Left side: Avatar and basic info */}
                  <div className="premium-identity-left">
                    <div className="premium-identity-avatar-wrapper">
                      <div className="premium-identity-avatar">
                        <span className="premium-identity-avatar-text">
                          {getInitials(developer.name || developer.gitlab_username)}
                        </span>
                      </div>
                      <div className="premium-identity-avatar-glow"></div>
                    </div>
                    
                    <div className="premium-identity-info">
                      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                        <h3 className="premium-identity-name">{developer.name || developer.gitlab_username}</h3>
                        {developer.is_validated ? (
                          <span className="premium-identity-badge premium-identity-badge-success">
                            <i className="ri-check-double-line me-1"></i>VALIDÉ
                          </span>
                        ) : (
                          <span className="premium-identity-badge premium-identity-badge-warning">
                            <i className="ri-time-line me-1"></i>EN ATTENTE
                          </span>
                        )}
                        {getBadges(summary).map((b, i) => (
                          <span key={i} className={`premium-identity-badge premium-identity-badge-${b.color}`}>
                            <i className={b.icon}></i>{b.label}
                          </span>
                        ))}
                        {!developer.is_active && (
                          <span className="premium-identity-badge premium-identity-badge-danger">
                            <i className="ri-logout-box-line me-1"></i>DÉPART LE {fmtDate(
                              developer.offboarding_date ||
                              timeline.find(ev => ev.badge === 'DÉSACTIVATION' || ev.title?.includes('Désactivation') || ev.title?.includes('Archivage'))?.date
                            )}
                          </span>
                        )}
                      </div>
                      
                      <div className="premium-identity-contact">
                        <div className="premium-identity-contact-item">
                          <i className="ri-at-line"></i>
                          <span>@{developer.gitlab_username}</span>
                        </div>
                        <div className="premium-identity-contact-item">
                          <i className="ri-mail-line"></i>
                          <span>{developer.email || "N/A"}</span>
                        </div>
                        <div className="premium-identity-contact-item">
                          <i className="ri-building-line"></i>
                          <span>{projects.find(p => p.id === parseInt(selectedPid))?.name || "Projet"}</span>
                        </div>
                        {developer.sites?.length > 0 && (() => {
                          const siteNames = developer.sites
                            .map(s => typeof s === "string" ? s : (s.name || s.site_name || s.label || s.code || null))
                            .filter(Boolean);
                          return siteNames.length > 0 ? (
                            <div className="premium-identity-contact-item">
                              <i className="ri-map-pin-line"></i>
                              <span>{siteNames.join(", ")}</span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right side: Actions and filters */}
                  <div className="premium-identity-right">
                    <div className="premium-identity-actions">
                      <button className="premium-identity-action-btn premium-identity-action-danger" onClick={() => {
                        const originalTitle = document.title;
                        document.title = `Profil_${(developer.name || developer.gitlab_username).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
                        window.print();
                        document.title = originalTitle;
                      }}>
                        <i className="ri-file-pdf-line"></i>
                        <span>PDF</span>
                      </button>
                    </div>
                    
                    <div className="premium-identity-filters">
                      <div className="premium-identity-filter">
                        <label className="premium-identity-filter-label">Période</label>
                        <select className="premium-identity-filter-select"
                          value={selectedPeriodId || ""} onChange={e => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}>
                          <option value="">Dernière</option>
                          {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                      <div className="premium-identity-filter">
                        <label className="premium-identity-filter-label">Projet</label>
                        <select className="premium-identity-filter-select"
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
                        type: 'line',
                        toolbar: { show: false },
                        sparkline: { enabled: false },
                        fontFamily: "'Inter', sans-serif",
                        background: 'transparent'
                      },
                      stroke: {
                        curve: 'smooth',
                        width: 4,
                        lineCap: 'round',
                        shadow: {
                          enabled: true,
                          color: '#4361ee',
                          blur: 10,
                          opacity: 0.3
                        }
                      },
                      fill: {
                        type: 'gradient',
                        gradient: {
                          shadeIntensity: 1,
                          opacityFrom: 0.4,
                          opacityTo: 0.05,
                          stops: [0, 90, 100],
                          colorStops: [
                            { offset: 0, color: '#4361ee', opacity: 0.4 },
                            { offset: 100, color: '#4361ee', opacity: 0.05 }
                          ]
                        }
                      },
                      xaxis: {
                        categories: periods.map(p => p.label).reverse(),
                        labels: {
                          style: {
                            colors: '#64748b',
                            fontSize: '12px',
                            fontWeight: 600,
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
                            fontWeight: 600,
                            fontFamily: 'Inter, sans-serif'
                          }
                        },
                        min: 0,
                        max: 100,
                        tickAmount: 5,
                        floating: false
                      },
                      grid: {
                        borderColor: '#f1f5f9',
                        strokeDashArray: 0,
                        row: { colors: ['transparent', 'transparent'], opacity: 1 },
                        column: { colors: ['transparent', 'transparent'], opacity: 1 },
                        padding: { top: 0, right: 0, bottom: 0, left: 10 }
                      },
                      colors: ['#4361ee'],
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
                          fontSize: '13px',
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 600
                        },
                        background: {
                          foreColor: '#1e293b'
                        }
                      },
                      annotations: {
                        yaxis: [
                          {
                            y: 50,
                            borderColor: '#cbd5e1',
                            borderWidth: 2,
                            borderDash: 5,
                            label: {
                              borderColor: 'transparent',
                              style: {
                                color: '#64748b',
                                background: '#f8fafc',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: { left: 8, right: 8, top: 4, bottom: 4 },
                                borderRadius: 6,
                                cssClass: 'annotation-label'
                              },
                              text: 'MOYENNE',
                              position: 'left',
                              textAnchor: 'start',
                              offsetX: 0
                            }
                          },
                          {
                            y: 75,
                            borderColor: '#10b981',
                            borderWidth: 2,
                            borderDash: 5,
                            label: {
                              borderColor: 'transparent',
                              style: {
                                color: '#059669',
                                background: '#ecfdf5',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: { left: 8, right: 8, top: 4, bottom: 4 },
                                borderRadius: 6,
                                cssClass: 'annotation-label-success'
                              },
                              text: 'EXCELLENT',
                              position: 'left',
                              textAnchor: 'start',
                              offsetX: 0
                            }
                          }
                        ]
                      },
                      markers: {
                        size: 8,
                        colors: ['#4361ee'],
                        strokeColors: '#ffffff',
                        strokeWidth: 3,
                        hover: {
                          size: 10,
                          strokeWidth: 4
                        },
                        discrete: []
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
          {/* Heatmap Section - Premium Design */}
          <div className="col-12">
            <div className="card border-0 shadow-sm h-100 overflow-hidden">
              <div className="card-header bg-gradient-to-r from-success-subtle to-white border-bottom py-4 d-flex align-items-center" style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)" }}>
                <div className="flex-grow-1">
                  <h4 className="card-title mb-1 fw-bold" style={{ fontSize: 16, color: "#1e293b" }}>
                    <i className="ri-calendar-todo-line me-2 text-success"></i>Activité Git (Derniers 12 mois)
                  </h4>
                  <p className="text-muted mb-0 fs-12">Visualisation de l'activité de commits par jour</p>
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-soft-success btn-sm" onClick={() => loadData()} style={{ borderRadius: 10 }}>
                    <i className="ri-refresh-line"></i>
                  </button>
                </div>
              </div>
              <div className="card-body">
                <div className="premium-heatmap-wrapper">
                  <ActivityHeatmap data={heatmap} startDate={heatmapMeta?.start_date} endDate={heatmapMeta?.end_date} loading={loadingHeatmap} />
                </div>
                
                {/* Premium Stats Row */}
                <div className="premium-heatmap-stats mt-4 pt-4">
                  <div className="row g-3">
                    <div className="col-6">
                      <div className="premium-heatmap-stat-card">
                        <div className="premium-heatmap-stat-icon premium-heatmap-stat-icon-success">
                          <i className="ri-git-commit-line"></i>
                        </div>
                        <div className="premium-heatmap-stat-content">
                          <h5 className="premium-heatmap-stat-value">{heatmapMeta?.total_commits || 0}</h5>
                          <p className="premium-heatmap-stat-label">Total Commits</p>
                          <span className="premium-heatmap-stat-sub">Hors merges</span>
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="premium-heatmap-stat-card">
                        <div className="premium-heatmap-stat-icon premium-heatmap-stat-icon-primary">
                          <i className="ri-calendar-check-line"></i>
                        </div>
                        <div className="premium-heatmap-stat-content">
                          <h5 className="premium-heatmap-stat-value">{heatmapMeta?.total_days_active || 0}</h5>
                          <p className="premium-heatmap-stat-label">Jours Actifs</p>
                          <span className="premium-heatmap-stat-sub">Présence Git</span>
                        </div>
                      </div>
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
                            <td style={{ width: 40 }}><i className={`ri-alert-fill fs-20 text-${a.level === 'CRITICAL' ? 'danger' : 'warning'}`}></i></td>
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

        {/* Phase 6: Lifecycle Timeline (Premium Design) */}
        <div className="row mt-4 mb-5" id="timeline-section">
          <div className="col-12">
            <div className="card border-0 shadow-sm overflow-hidden">
              <div className="card-header bg-gradient-to-r from-light-subtle to-white border-bottom py-4 d-flex align-items-center" style={{ background: "linear-gradient(135deg, #f8f9fc 0%, #ffffff 100%)" }}>
                <div className="flex-grow-1">
                  <h4 className="card-title mb-1 fw-bold" style={{ fontSize: 16, color: "#1e293b" }}>
                    <i className="ri-history-line me-2 text-primary"></i>Timeline d'Activité & Présence Professionnelle
                  </h4>
                  <p className="text-muted mb-0 fs-12">Historique complet des événements RH et GitLab</p>
                </div>
                <div className="d-flex gap-2">
                  <span className="badge bg-soft-info text-info fs-11" style={{ padding: "6px 12px", borderRadius: 20 }}>
                    <i className="ri-database-2-line me-1"></i>Source : RH + GitLab
                  </span>
                  <span className="badge bg-soft-primary text-primary fs-11" style={{ padding: "6px 12px", borderRadius: 20 }}>
                    <i className="ri-time-line me-1"></i>{timeline.length} événements
                  </span>
                </div>
              </div>
              <div className="card-body pt-5 pb-4">
                <div className="premium-timeline-container">
                  {timeline.map((ev, i) => (
                    <div key={i} className="premium-timeline-item" style={{ animationDelay: `${i * 0.1}s` }}>
                      {/* Timeline dot with glow effect */}
                      <div className={`premium-timeline-dot premium-timeline-dot-${ev.color}`}>
                        <div className={`premium-timeline-dot-inner bg-${ev.color}-subtle text-${ev.color}`}>
                          <i className={`${ev.icon} fs-14`}></i>
                        </div>
                        <div className={`premium-timeline-dot-glow bg-${ev.color}-subtle`}></div>
                      </div>
                      
                      {/* Timeline content card */}
                      <div className="premium-timeline-content">
                        <div className="premium-timeline-card">
                          {/* Card header */}
                          <div className="premium-timeline-header">
                            <div className="d-flex align-items-center gap-2 flex-wrap">
                              <h6 className="premium-timeline-title">{ev.title}</h6>
                              {ev.badge ? (
                                <span className={`premium-timeline-badge premium-timeline-badge-${ev.color}`}>
                                  <i className="ri-verified-badge-line me-1"></i>{ev.badge}
                                </span>
                              ) : ev.is_mission ? (
                                <span className="premium-timeline-badge premium-timeline-badge-success">
                                  <i className="ri-verified-badge-line me-1"></i>AFFECTATION RH
                                </span>
                              ) : null}
                            </div>
                            <span className="premium-timeline-date">
                              <i className="ri-calendar-event-line me-1"></i>{fmtDate(ev.date)}
                            </span>
                          </div>
                          
                          {/* Card body */}
                          {ev.is_mission ? (
                            <div className={`premium-timeline-body premium-timeline-body-${ev.color}`}>
                              <div className="d-flex align-items-center gap-3">
                                <div className={`premium-timeline-icon-box bg-${ev.color}-subtle text-${ev.color}`}>
                                  <i className={`${ev.icon || 'ri-rocket-2-fill'} fs-20`}></i>
                                </div>
                                <div className="flex-grow-1">
                                  <p className="premium-timeline-description">{ev.description}</p>
                                  <p className="premium-timeline-meta">Mission certifiée par le système de pilotage</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="premium-timeline-body">
                              <p className="premium-timeline-description">{ev.description}</p>
                              {ev.details && Object.keys(ev.details).length > 0 && (
                                <div className="premium-timeline-audit">
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
                    <div className="text-center py-5">
                      <div className="premium-empty-state">
                        <i className="ri-calendar-line fs-48 text-light d-block mb-3"></i>
                        <h6 className="text-muted fw-semibold mb-2">Aucun historique disponible</h6>
                        <p className="text-muted fs-13">Les données d'activité n'ont pas encore été collectées pour ce profil.</p>
                      </div>
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
              className="btn btn-soft-danger d-flex align-items-center gap-2"
              onClick={() => {
                const originalTitle = document.title;
                document.title = `Bilan_${(developer.name || developer.gitlab_username).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
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

      {/* Score Formula Modal */}
      {showScoreFormulaModal && (
        <ScoreFormulaModal
          onClose={() => setShowScoreFormulaModal(false)}
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

        /* Enterprise KPI Card Styles */
        .kpi-card-wrapper { display: flex; flex-direction: column; }

        .kpi-card-premium {
          position: relative;
          overflow: hidden;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px 16px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        
        .kpi-card-premium:hover {
          border-color: #d1d5db;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }
        
        .kpi-card-glow-bg {
          display: none;
        }
        
        .kpi-card-blob {
          display: none;
        }
        
        .kpi-card-inner {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        
        .kpi-icon-wrap {
          width: 48px; height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }
        
        .kpi-text { flex: 1; }
        
        .kpi-label {
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          color: #6b7280;
          margin-bottom: 6px;
        }
        
        .kpi-value {
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 0;
          line-height: 1.2;
          letter-spacing: -0.3px;
        }

        .kpi-unit {
          font-size: 13px;
          font-weight: 400;
          color: #6b7280;
          margin-left: 3px;
        }
        
        .kpi-sub {
          font-size: 11px;
          margin-top: 6px;
          margin-bottom: 0;
        }
        
        .kpi-sub-badge {
          padding: 3px 8px;
          border-radius: 4px;
          font-weight: 500;
          font-size: 10px;
          display: inline-block;
        }

        .kpi-delta {
          margin-top: 6px;
          margin-bottom: 0;
        }
        
        .kpi-active-bar {
          display: none;
        }

        /* Enterprise Timeline Styles */
        .premium-timeline-container {
          position: relative;
          padding-left: 20px;
        }

        .premium-timeline-container::before {
          content: '';
          position: absolute;
          left: 5px;
          top: 4px;
          bottom: 4px;
          width: 2px;
          background: #e5e7eb;
          border-radius: 1px;
        }

        .premium-timeline-item {
          position: relative;
          margin-bottom: 24px;
          opacity: 1;
          animation: none;
        }

        @keyframes timelineFadeIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .premium-timeline-dot {
          position: absolute;
          left: -20px;
          top: 2px;
          width: 12px;
          height: 12px;
          z-index: 2;
        }

        .premium-timeline-dot-inner {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #fff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.2s ease;
        }

        .premium-timeline-dot-glow {
          display: none;
        }

        .premium-timeline-item:hover .premium-timeline-dot-inner {
          transform: scale(1.1);
        }

        .premium-timeline-content {
          margin-left: 6px;
        }

        .premium-timeline-card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .premium-timeline-card:hover {
          border-color: #d1d5db;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }

        .premium-timeline-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid #f3f4f6;
        }

        .premium-timeline-title {
          font-size: 13px;
          font-weight: 600;
          color: #111827;
          margin: 0;
          letter-spacing: -0.2px;
        }

        .premium-timeline-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .premium-timeline-badge-primary {
          background: #dbeafe;
          color: #1e40af;
          border: 1px solid #bfdbfe;
        }

        .premium-timeline-badge-success {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #bbf7d0;
        }

        .premium-timeline-badge-info {
          background: #e0f2fe;
          color: #075985;
          border: 1px solid #bae6fd;
        }

        .premium-timeline-badge-warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }

        .premium-timeline-badge-danger {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }

        .premium-timeline-date {
          font-size: 11px;
          font-weight: 500;
          color: #6b7280;
          background: #f9fafb;
          padding: 3px 8px;
          border-radius: 4px;
        }

        .premium-timeline-body {
          padding-top: 2px;
        }

        .premium-timeline-body-primary {
          background: #f9fafb;
          border-radius: 6px;
          padding: 12px;
          border: 1px solid #e5e7eb;
        }

        .premium-timeline-body-success {
          background: #f9fafb;
          border-radius: 6px;
          padding: 12px;
          border: 1px solid #e5e7eb;
        }

        .premium-timeline-body-info {
          background: #f9fafb;
          border-radius: 6px;
          padding: 12px;
          border: 1px solid #e5e7eb;
        }

        .premium-timeline-body-warning {
          background: #f9fafb;
          border-radius: 6px;
          padding: 12px;
          border: 1px solid #e5e7eb;
        }

        .premium-timeline-body-danger {
          background: #f9fafb;
          border-radius: 6px;
          padding: 12px;
          border: 1px solid #e5e7eb;
        }

        .premium-timeline-icon-box {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        .premium-timeline-description {
          font-size: 13px;
          font-weight: 400;
          color: #374151;
          margin: 0 0 4px 0;
          line-height: 1.5;
        }

        .premium-timeline-meta {
          font-size: 11px;
          color: #6b7280;
          margin: 0;
          font-weight: 400;
        }

        .premium-timeline-audit {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #e5e7eb;
          font-size: 10px;
          color: #9ca3af;
          font-family: 'SFMono-Regular', monospace;
        }

        .premium-empty-state {
          padding: 32px 16px;
        }

        .premium-empty-state i {
          opacity: 0.4;
        }

        /* Enterprise Heatmap Styles */
        .premium-heatmap-wrapper {
          background: #fff;
          border-radius: 8px;
          padding: 16px;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          transition: all 0.2s ease;
        }

        .premium-heatmap-wrapper:hover {
          border-color: #d1d5db;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }

        .premium-heatmap-stats {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
        }

        .premium-heatmap-stat-card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          height: 100%;
        }

        .premium-heatmap-stat-card:hover {
          border-color: #d1d5db;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }

        .premium-heatmap-stat-icon {
          width: 44px;
          height: 44px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }

        .premium-heatmap-stat-card:hover .premium-heatmap-stat-icon {
          transform: scale(1.05);
        }

        .premium-heatmap-stat-icon-success {
          background: #dcfce7;
          color: #166534;
        }

        .premium-heatmap-stat-icon-primary {
          background: #dbeafe;
          color: #1e40af;
        }

        .premium-heatmap-stat-icon-info {
          background: #e0f2fe;
          color: #075985;
        }

        .premium-heatmap-stat-content {
          flex: 1;
        }

        .premium-heatmap-stat-value {
          font-size: 24px;
          font-weight: 600;
          color: #111827;
          margin: 0 0 4px 0;
          line-height: 1.2;
          letter-spacing: -0.3px;
        }

        .premium-heatmap-stat-label {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          margin: 0 0 2px 0;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .premium-heatmap-stat-sub {
          font-size: 10px;
          font-weight: 400;
          color: #6b7280;
          text-transform: none;
          letter-spacing: normal;
        }

        /* Enterprise Identity Card Styles */
        .premium-identity-card {
          display: flex;
          align-items: center;
          gap: 32px;
          padding: 28px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          min-height: 120px;
        }

        .premium-identity-left {
          display: flex;
          align-items: center;
          gap: 24px;
          flex: 1;
        }

        .premium-identity-avatar-wrapper {
          position: relative;
        }

        .premium-identity-avatar {
          width: 72px;
          height: 72px;
          border-radius: 12px;
          background: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: all 0.2s ease;
        }

        .premium-identity-avatar:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        }

        .premium-identity-avatar-text {
          font-size: 28px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.5px;
        }

        .premium-identity-avatar-glow {
          display: none;
        }

        .premium-identity-info {
          flex: 1;
        }

        .premium-identity-name {
          font-size: 22px;
          font-weight: 600;
          color: #111827;
          margin: 0;
          letter-spacing: -0.3px;
        }

        .premium-identity-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 5px 10px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          display: inline-flex;
          align-items: center;
        }

        .premium-identity-badge-success {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #bbf7d0;
        }

        .premium-identity-badge-warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }

        .premium-identity-badge-danger {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }

        .premium-identity-badge-primary {
          background: #dbeafe;
          color: #1e40af;
          border: 1px solid #bfdbfe;
        }

        .premium-identity-badge-info {
          background: #e0f2fe;
          color: #075985;
          border: 1px solid #bae6fd;
        }

        .premium-identity-contact {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-top: 10px;
        }

        .premium-identity-contact-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #6b7280;
          font-weight: 400;
        }

        .premium-identity-contact-item i {
          font-size: 14px;
          color: #2563eb;
        }

        .premium-identity-right {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 300px;
        }

        .premium-identity-actions {
          display: flex;
          gap: 10px;
        }

        .premium-identity-action-btn {
          flex: 1;
          padding: 10px 16px;
          border-radius: 6px;
          border: 1px solid #d1d5db;
          font-size: 12px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          background: #ffffff;
          color: #374151;
        }

        .premium-identity-action-btn:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .premium-identity-action-btn i {
          font-size: 14px;
        }

        .premium-identity-action-btn span {
          text-transform: none;
          letter-spacing: normal;
        }

        .premium-identity-action-primary {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }

        .premium-identity-action-primary:hover {
          background: #1d4ed8;
          border-color: #1d4ed8;
        }

        .premium-identity-action-info {
          background: #ffffff;
          color: #0891b2;
          border-color: #0891b2;
        }

        .premium-identity-action-info:hover {
          background: #f0f9ff;
          border-color: #0e7490;
        }

        .premium-identity-action-danger {
          background: #ffffff;
          color: #dc2626;
          border-color: #dc2626;
        }

        .premium-identity-action-danger:hover {
          background: #fef2f2;
          border-color: #b91c1c;
        }

        .premium-identity-filters {
          display: flex;
          gap: 14px;
        }

        .premium-identity-filter {
          flex: 1;
        }

        .premium-identity-filter-label {
          font-size: 11px;
          font-weight: 500;
          color: #6b7280;
          text-transform: none;
          letter-spacing: normal;
          margin-bottom: 5px;
          display: block;
        }

        .premium-identity-filter-select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 400;
          color: #374151;
          background: #ffffff;
          transition: all 0.2s ease;
        }

        .premium-identity-filter-select:hover {
          border-color: #9ca3af;
        }

        .premium-identity-filter-select:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

        @media (max-width: 992px) {
          .premium-identity-card {
            flex-direction: column;
            gap: 20px;
            padding: 20px;
          }

          .premium-identity-left {
            width: 100%;
            flex-direction: column;
            text-align: center;
          }

          .premium-identity-contact {
            justify-content: center;
          }

          .premium-identity-right {
            width: 100%;
            min-width: unset;
          }
        }
      `}</style>
    </div>
  );
}
