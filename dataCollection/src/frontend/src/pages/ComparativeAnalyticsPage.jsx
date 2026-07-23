/**
 * ComparativeAnalyticsPage.jsx — Dashboard de Pilotage Stratégique
 *
 * Page de Business Intelligence permettant de :
 *  - Comparer les tendances entre Sites (ex: France vs Tunisie)
 *  - Comparer les tendances entre Équipes (Teams)
 *  - Visualiser l'évolution historique des KPIs de vélocité et qualité
 *
 * Route : /analytics/comparison?project_id=X
 * 
 * Dernière mise à jour: Restauration après suppression du filtre de période
 * Note: Prêt pour déploiement Vercel
 */
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import ReactApexChart from "react-apexcharts";
import analyticsService from "../services/analyticsService";
import projectService from "../services/projectService";
import developerService from "../services/developerService";
import authService from "../services/authService";
import { METRIC_THRESHOLDS, getMetricStatus, getHealthScoreStatus, calculateHealthScore, HEALTH_SCORE_FORMULA } from "../constants/metricsThresholds";
import { toUserError } from "../services/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";
import { exportDashboardPDF } from "../utils/pdfExportService";
import { useAuth } from "../context/AuthContext";
import IntelligenceCard from "../components/analytics/IntelligenceCard";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, d = 1) => (n == null || isNaN(+n)) ? "—" : (+n).toFixed(d);

const CHART_COLORS = ["#4f46e5", "#0ab39c", "#299cdb", "#f7b84b", "#f06548", "#3577f1", "#6559cc", "#ffbe0b"];
const CHART_FONT = "'Inter', system-ui, -apple-system, sans-serif";

// ─── Custom Branding Constants (Enterprise-Unique) ─────────────────────────────
// Custom easing functions pour éviter le look AI-générique
const EASING = {
  smooth: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  snappy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  elastic: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  enterprise: 'cubic-bezier(0.16, 1, 0.3, 1)'
};

// Custom flat colors pour remplacer les gradients répétitifs
const BRAND_COLORS = {
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  secondary: '#8b5cf6',
  accent: '#06b6d4',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  surface: '#1e293b',
  surfaceLight: '#334155'
};

// Custom transition durations pour varier les animations
const TRANSITION_DURATION = {
  fast: '150ms',
  normal: '250ms',
  slow: '400ms',
  extraSlow: '600ms'
};

// ✅ TREND BADGE FOR MULTI-PERIOD ANALYSIS
const TrendBadge = ({ trend, metricType }) => {
  if (!trend) return null;
  const { direction, delta_pct } = trend;

  // For review time, lower is better. For others, higher is better.
  const isGood = metricType === 'review_time' ? direction === 'declining' : direction === 'improving';
  const isBad = metricType === 'review_time' ? direction === 'improving' : direction === 'declining';

  let icon = 'ri-arrow-right-line';
  let color = '#94a3b8'; // grey

  if (isGood) {
    icon = direction === 'improving' ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line';
    color = '#10b981'; // green
  } else if (isBad) {
    icon = direction === 'improving' ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line';
    color = '#ef4444'; // red
  } else {
    icon = 'ri-arrow-right-line';
    color = '#94a3b8'; // grey
  }

  const pctText = delta_pct > 0 ? `+${delta_pct}%` : `${delta_pct}%`;

  return (
    <span className="d-inline-flex align-items-center gap-1 px-2 py-0.5 rounded" style={{
      background: color === '#10b981' ? 'rgba(16,185,129,0.12)' : color === '#ef4444' ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)',
      color: color,
      fontSize: 10,
      fontWeight: '600'
    }}>
      <i className={icon} style={{ fontSize: 11 }}></i>
      {pctText}
    </span>
  );
};

// ✅ SKELETON COMPONENTS FOR PREMIUM UX
const SkeletonCard = ({ height = 200, width = "100%" }) => (
  <div className="card border-0 shadow-sm mb-4 skeleton-pulse" style={{ borderRadius: 16, height, width, background: '#fff', overflow: 'hidden' }}>
    <div style={{ height: '20%', background: '#f8fafc', margin: '20px', borderRadius: 8 }}></div>
    <div style={{ height: '40%', background: '#f1f5f9', margin: '20px', borderRadius: 8 }}></div>
  </div>
);

// ✅ CIRCULAR PROGRESS INDICATOR
const CircularProgress = ({ score, size = 48, strokeWidth = 4 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (score) => {
    if (score >= 70) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const color = getColor(score);

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <filter id={`glow-${score}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          filter={`url(#glow-${score})`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontWeight: 800,
        fontSize: size * 0.28,
        color: '#fff',
        textShadow: '0 0 8px rgba(0,0,0,0.5)'
      }}>
        {Math.round(score)}
      </div>
    </div>
  );
};

// ✅ TREND ARROW INDICATOR
const TrendArrow = ({ trend, metricType }) => {
  if (!trend) return null;
  const { direction, delta_pct } = trend;

  const isGood = metricType === 'review_time' ? direction === 'declining' : direction === 'improving';
  const isBad = metricType === 'review_time' ? direction === 'improving' : direction === 'declining';

  let icon = 'ri-arrow-right-line';
  let color = '#94a3b8';

  if (isGood) {
    icon = direction === 'improving' ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line';
    color = '#10b981';
  } else if (isBad) {
    icon = direction === 'improving' ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line';
    color = '#ef4444';
  }

  const pctText = delta_pct > 0 ? `+${delta_pct}%` : `${delta_pct}%`;

  return (
    <div className="d-flex align-items-center gap-1" style={{ fontSize: 11, fontWeight: 600, color }}>
      <i className={icon} style={{ fontSize: 12 }}></i>
      <span>{pctText}</span>
    </div>
  );
};

// ✅ COMPACT ENTITY CARD
const EntityCard = ({ entity, entityType, onViewDetails }) => {
  const scoreColor = entity.health_score >= 70 ? '#10b981' : entity.health_score >= 50 ? '#f59e0b' : '#ef4444';
  const scoreBg = entity.health_score >= 70 ? 'rgba(16,185,129,0.12)' : entity.health_score >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
  const scoreText = entity.health_score >= 70 ? 'Excellent' : entity.health_score >= 50 ? 'Surveillance' : 'Critique';

  const latestVelocity = entity.velocity_trend?.values?.[entity.velocity_trend.values.length - 1] || 0;
  const latestReview = entity.review_trend?.values?.[entity.review_trend.values.length - 1] || 0;
  const latestQuality = entity.quality_trend?.values?.[entity.quality_trend.values.length - 1] || 0;
  const latestAvgCommits = entity.avg_commits_per_mr || 0;

  // Business-specific: Calculate YoY trend if we have enough data
  const velocityValues = entity.velocity_trend?.values || [];
  const hasYoYData = velocityValues.length >= 2;
  const yoyGrowth = hasYoYData ? ((velocityValues[velocityValues.length - 1] - velocityValues[0]) / velocityValues[0] * 100) : null;
  const yoyLabel = yoyGrowth !== null ? (yoyGrowth > 0 ? `+${yoyGrowth.toFixed(0)}% YoY` : `${yoyGrowth.toFixed(0)}% YoY`) : null;

  return (
    <div
      className="card border-0 h-100 transition-all"
      style={{
        borderRadius: 20,
        background: 'rgba(30, 41, 59, 0.45)',
        border: '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer',
        transition: `all ${TRANSITION_DURATION.normal} ${EASING.snappy}`,
        backdropFilter: 'blur(8px)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)';
        e.currentTarget.style.boxShadow = '0 12px 30px rgba(99,102,241,0.15)';
        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.45)';
      }}
      onClick={() => onViewDetails(entity)}
    >
      <div className="card-body p-4">
        {/* Card Header */}
        <div className="d-flex align-items-center justify-content-between mb-4">
          <div>
            <h6 className="fw-bold mb-1.5 text-white" style={{ fontSize: 17, letterSpacing: '-0.3px' }}>
              {entity.site_name || entity.entity_name}
            </h6>
            <div className="d-flex align-items-center gap-2">
              <span className="badge px-2.5 py-1 rounded-pill text-uppercase" style={{
                fontSize: 9,
                background: scoreBg,
                color: scoreColor,
                fontWeight: 750,
                letterSpacing: '0.5px'
              }}>
                {scoreText}
              </span>
              <span className="opacity-50" style={{ fontSize: 11, color: '#cbd5e1' }}>
                {entity.n_periods} mois
              </span>
              {yoyLabel && (
                <span className="badge px-2 py-0.5 rounded-pill" style={{
                  fontSize: 8,
                  background: yoyGrowth > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color: yoyGrowth > 0 ? '#10b981' : '#ef4444',
                  fontWeight: 700,
                  letterSpacing: '0.3px'
                }}>
                  {yoyLabel}
                </span>
              )}
            </div>
          </div>
          <CircularProgress score={entity.health_score} size={56} strokeWidth={4.5} />
        </div>

        {/* Metrics Grid */}
        <div className="row g-2">
          {[
            { label: "Vélocité", value: latestVelocity.toFixed(1), suffix: "", trend: entity.velocity_trend, type: "velocity", icon: "ri-flashlight-line", context: "commits/dev" },
            { label: "Revue", value: latestReview.toFixed(1), suffix: "h", trend: entity.review_trend, type: "review_time", icon: "ri-time-line", context: "délai moyen" },
            { label: "Qualité", value: Math.round(latestQuality * 100), suffix: "%", trend: entity.quality_trend, type: "quality", icon: "ri-shield-check-line", context: "taux approbation" },
          ].map((m, idx) => (
            <div key={idx} className="col-3">
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '12px',
                padding: '12px 8px',
                textAlign: 'center'
              }}>
                <span className="d-block opacity-50 mb-1" style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  {m.label}
                </span>
                <span className="fw-extrabold text-white d-block" style={{ fontSize: 15, fontFamily: "'JetBrains Mono', monospace" }}>
                  {m.value}{m.suffix}
                </span>
                <div className="d-flex justify-content-center mt-1">
                  <TrendArrow trend={m.trend} metricType={m.type} />
                </div>
                
              </div>
            </div>
          ))}
        </div>

        {/* Action Button */}
        <div
          className="w-100 mt-4 d-flex align-items-center justify-content-center gap-2"
          style={{
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.15)',
            color: '#a5b4fc',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 12,
            padding: '10px',
            transition: `all ${TRANSITION_DURATION.fast} ${EASING.smooth}`,
            letterSpacing: '0.3px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.15)';
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.08)';
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.15)';
          }}
        >
          <i className="ri-eye-line" style={{ fontSize: 14 }}></i>
          Voir le rapport détaillé
        </div>
      </div>
    </div>
  );
};

// ✅ RECOMMENDATION CARD
const RecommendationCard = ({ rec }) => {
  let prioColor = "#ef4444";
  let prioBg = "rgba(239,68,68,0.12)";
  if (rec.priority === "moyenne") {
    prioColor = "#f59e0b";
    prioBg = "rgba(245,158,11,0.12)";
  } else if (rec.priority === "basse") {
    prioColor = "#10b981";
    prioBg = "rgba(16,185,129,0.12)";
  }

  return (
    <div style={{
      padding: '16px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderLeft: `4px solid ${rec.color || '#6366f1'}`,
      borderRadius: '4px 12px 12px 4px'
    }}>
      <div className="d-flex align-items-start gap-3">
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: `rgba(${rec.color === '#ef4444' ? '239,68,68' : rec.color === '#10b981' ? '16,185,129' : '245,158,11'}, 0.12)`,
          color: rec.color || '#cbd5e1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <i className={rec.icon || 'ri-lightbulb-line'} style={{ fontSize: 16 }}></i>
        </div>
        <div className="flex-grow-1">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
            <span className="fw-bold text-white" style={{ fontSize: 13 }}>{rec.category}</span>
            <span className="badge px-2 py-0.5 rounded-pill text-uppercase" style={{
              background: prioBg,
              color: prioColor,
              fontSize: 8,
              letterSpacing: '0.5px',
              fontWeight: 600
            }}>{rec.priority}</span>
          </div>
          <p className="mb-0 text-white opacity-80" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {rec.message}
          </p>
        </div>
      </div>
    </div>
  );
};

// ✅ ENTITY DETAILS MODAL
const EntityDetailsModal = ({ entity, entityType, onClose }) => {
  if (!entity) return null;

  const scoreColor = entity.health_score >= 70 ? '#10b981' : entity.health_score >= 50 ? '#f59e0b' : '#ef4444';
  const scoreBg = entity.health_score >= 70 ? 'rgba(16,185,129,0.12)' : entity.health_score >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
  const scoreText = entity.health_score >= 70 ? 'Excellent' : entity.health_score >= 50 ? 'Surveillance' : 'Critique';

  const getMetricProgressDetails = (metricId, value) => {
    let checkVal = value;
    let maxVal = 10;
    let progressPct = 0;
    let barColor = '#10b981'; // green

    if (metricId === 'velocity') {
      maxVal = 10;
      progressPct = Math.min(100, (checkVal / maxVal) * 100);
      barColor = checkVal >= 5 ? '#10b981' : checkVal >= 3 ? '#f59e0b' : '#ef4444';
    } else if (metricId === 'review_time') {
      maxVal = 72; // hours
      progressPct = Math.min(100, (checkVal / maxVal) * 100);
      barColor = checkVal <= 24 ? '#10b981' : checkVal <= 48 ? '#f59e0b' : '#ef4444';
    } else if (metricId === 'avg_commits') {
      maxVal = 10; // commits per MR
      progressPct = Math.min(100, (checkVal / maxVal) * 100);
      barColor = checkVal <= 3 ? '#10b981' : checkVal <= 6 ? '#f59e0b' : '#ef4444';
    } else { // quality or general %
      maxVal = 100;
      progressPct = Math.min(100, checkVal);
      barColor = checkVal >= 90 ? '#10b981' : checkVal >= 70 ? '#f59e0b' : '#ef4444';
    }

    return { progressPct, barColor };
  };

  return (
    <div
      className="modal fade show d-block"
      style={{
        backgroundColor: 'rgba(8, 10, 20, 0.75)',
        zIndex: 10000,
        backdropFilter: 'blur(12px)',
        animation: 'fadeIn 0.3s ease-out'
      }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-content border-0"
          style={{
            borderRadius: 24,
            background: BRAND_COLORS.surface,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            overflow: 'hidden'
          }}
        >
          {/* Modal Header */}
          <div className="modal-header border-0 p-5 pb-4">
            <div className="d-flex align-items-center justify-content-between w-100">
              <div className="d-flex align-items-center gap-4">
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  background: BRAND_COLORS.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(59,130,246,0.35)'
                }}>
                  <i className={entityType === 'sites' || entityType === 'site' ? "ri-building-4-line" : "ri-team-line"} style={{ fontSize: 30, color: '#fff' }}></i>
                </div>
                <div>
                  <h4 className="fw-extrabold mb-1 text-white" style={{ fontSize: 22, letterSpacing: '-0.5px' }}>
                    {entity.site_name || entity.entity_name}
                  </h4>
                  <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                    Analyse détaillée de l'activité • {entity.n_periods} mois
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: `all ${TRANSITION_DURATION.fast} ${EASING.smooth}`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                }}
              >
                <i className="ri-close-line" style={{ fontSize: 22 }}></i>
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="modal-body p-5 pt-0">
            {/* Score Card */}
            <div className="d-flex align-items-center justify-content-between mb-5 p-4 rounded-4" style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              backdropFilter: 'blur(8px)'
            }}>
              <div className="d-flex align-items-center gap-4">
                <CircularProgress score={entity.health_score} size={88} strokeWidth={6} />
                <div>
                  <div className="opacity-60 mb-1" style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    Score de Santé Global
                  </div>
                  <div className="d-flex align-items-center gap-3">
                    <span className="fw-extrabold text-white" style={{ fontSize: 32, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                      {Math.round(entity.health_score)}/100
                    </span>
                    <span className="badge px-3 py-1.5 rounded-pill" style={{
                      fontSize: 10,
                      background: scoreBg,
                      color: scoreColor,
                      fontWeight: 750,
                      letterSpacing: '0.5px'
                    }}>
                      {scoreText}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <h6 className="fw-bold mb-4 text-white" style={{ fontSize: 15, letterSpacing: '-0.3px' }}>
              <i className="ri-bar-chart-2-line me-2 text-primary"></i>
              Métriques Détaillées & Tendances
            </h6>

            <div className="d-flex flex-column gap-4">
              {[
                { label: "Vélocité moyenne (MRs/dev)", trend: entity.velocity_trend, metricType: "velocity", suffix: "", icon: "ri-flashlight-line" },
                { label: "Temps moyen de revue", trend: entity.review_trend, metricType: "review_time", suffix: "h", icon: "ri-time-line" },
                { label: "Taux moyen d'approbation", trend: entity.quality_trend, metricType: "quality", suffix: "%", multiplier: 100, icon: "ri-shield-check-line" },
               
              ].map((metric, idx) => {
                const vals = metric.trend?.values || [];
                const latestVal = vals.length > 0 ? vals[vals.length - 1] : (metric.value !== undefined ? metric.value : 0);
                const displayVal = metric.multiplier ? (latestVal * metric.multiplier) : latestVal;
                const pDetails = getMetricProgressDetails(metric.metricType, displayVal);

                return (
                  <div key={idx} style={{
                    padding: '20px',
                    borderRadius: '16px',
                    background: 'rgba(30, 41, 59, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <div className="d-flex align-items-center gap-2.5">
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <i className={metric.icon} style={{ fontSize: 18, color: '#a5b4fc' }}></i>
                        </div>
                        <span className="opacity-80 fw-semibold text-white" style={{ fontSize: 13.5 }}>{metric.label}</span>
                      </div>
                      <div className="d-flex align-items-center gap-3">
                        <span className="fw-extrabold text-white" style={{ fontSize: 18, fontFamily: "'JetBrains Mono', monospace" }}>
                          {metric.multiplier ? Math.round(displayVal) : displayVal.toFixed(1)}{metric.suffix}
                        </span>
                        <TrendArrow trend={metric.trend} metricType={metric.metricType} />
                      </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', margin: '14px 0 10px 0', position: 'relative' }}>
                      <div style={{
                        height: '100%',
                        width: `${pDetails.progressPct}%`,
                        background: pDetails.barColor,
                        borderRadius: '3px',
                        transition: `width ${TRANSITION_DURATION.slow} ${EASING.smooth}`
                      }}></div>
                    </div>

                    {vals.length > 1 && (
                      <div className="d-flex align-items-center justify-content-between mt-2 opacity-50" style={{ fontSize: 11, color: '#94a3b8' }}>
                        <span>Historique de tendance</span>
                        <span className="font-monospace fw-medium">
                          {vals.map(v => metric.multiplier ? `${Math.round(v * metric.multiplier)}` : v.toFixed(1)).join(' → ')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="modal-footer border-0 p-5 pt-0">
            <button
              onClick={onClose}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 14,
                background: BRAND_COLORS.primaryDark,
                border: 'none',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all ${TRANSITION_DURATION.normal} ${EASING.smooth}`,
                letterSpacing: '0.3px',
                boxShadow: '0 4px 15px rgba(37,99,235,0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(79,70,229,0.45)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(79,70,229,0.3)';
              }}
            >
              Fermer l'analyse
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ✅ FLOATING INTELLIGENCE FAB
const IntelligenceFAB = ({ onClick, hasAlerts }) => {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: '32px',
        right: '32px',
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: hasAlerts ? BRAND_COLORS.danger : BRAND_COLORS.secondary,
        border: 'none',
        boxShadow: '0 8px 32px rgba(139,92,246,0.4)',
        cursor: 'pointer',
        zIndex: 1000,
        transition: `all ${TRANSITION_DURATION.normal} ${EASING.enterprise}`,
        animation: 'fabPulse 2s ease-in-out infinite'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1) translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(99,102,241,0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1) translateY(0)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,0.4)';
      }}
    >
      <i className="ri-brain-line" style={{ fontSize: 28, color: '#fff' }}></i>
      {hasAlerts && (
        <div style={{
          position: 'absolute',
          top: '-4px',
          right: '-4px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#ef4444',
          border: '3px solid #fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 'bold',
          color: '#fff'
        }}>
          !
        </div>
      )}
      <style>{`
        @keyframes fabPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </button>
  );
};

// ✅ PROFESSIONAL INTELLIGENCE DRAWER
const IntelligenceDrawer = ({ isOpen, onClose, intelligenceView, setIntelligenceView, intelligenceData, intelligenceLoading, teamIntelligenceData, teamIntelligenceLoading, user, userAssignments, sites, onEntityClick }) => {
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);

  if (!isOpen) return null;

  const hasAlerts = (intelligenceData?.anomalies?.length ?? 0) > 0 ||
    (intelligenceData?.trend_analysis?.alerts?.filter(a => a.severity !== 'info')?.length ?? 0) > 0 ||
    (teamIntelligenceData?.anomalies?.length ?? 0) > 0 ||
    (teamIntelligenceData?.trend_analysis?.alerts?.filter(a => a.severity !== 'info')?.length ?? 0) > 0;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          zIndex: 9998,
          backdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.3s ease-out'
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '600px',
          height: '100vh',
          background: BRAND_COLORS.surface,
          zIndex: 9999,
          boxShadow: '-10px 0 40px rgba(0,0,0,0.6)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Drawer Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.01)'
        }}>
          <div className="d-flex align-items-center justify-content-between mb-4">
            <div className="d-flex align-items-center gap-3">
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: BRAND_COLORS.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(59,130,246,0.35)'
              }}>
                <i className="ri-brain-line" style={{ fontSize: 24, color: '#fff' }}></i>
              </div>
              <div>
                <h4 className="fw-extrabold mb-0 text-white" style={{ fontSize: 18, letterSpacing: '-0.3px' }}>Intelligence</h4>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>Analyse· Détection d'anomalies</span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: `all ${TRANSITION_DURATION.fast} ${EASING.smooth}`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              }}
            >
              <i className="ri-close-line" style={{ fontSize: 20 }}></i>
            </button>
          </div>

          {/* Tabbed Navigation */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '12px',
            padding: '4px',
            display: 'flex',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            width: '100%'
          }}>
            {(user?.role === 'super_admin' || user?.role === 'site_manager' || user?.role === 'project_manager' || user?.role === 'viewer') && (
              <button
                onClick={() => setIntelligenceView('sites')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '9px',
                  background: intelligenceView === 'sites' ? BRAND_COLORS.primary : 'transparent',
                  border: 'none',
                  color: intelligenceView === 'sites' ? '#fff' : '#94a3b8',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: `all ${TRANSITION_DURATION.normal} ${EASING.smooth}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: intelligenceView === 'sites' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
                }}
              >
                <i className="ri-building-4-line"></i>
                Sites
              </button>
            )}
            {(user?.role === 'super_admin' || user?.role === 'team_lead' || user?.role === 'project_manager' || user?.role === 'viewer') && (
              <button
                onClick={() => setIntelligenceView('teams')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '9px',
                  background: intelligenceView === 'teams' ? BRAND_COLORS.primary : 'transparent',
                  border: 'none',
                  color: intelligenceView === 'teams' ? '#fff' : '#94a3b8',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: `all ${TRANSITION_DURATION.normal} ${EASING.smooth}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: intelligenceView === 'teams' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
                }}
              >
                <i className="ri-team-line"></i>
                Équipes
              </button>
            )}
          </div>
        </div>

        {/* Drawer Content */}
        <div style={{ padding: '24px' }}>
          {intelligenceView === 'sites' ? (
            intelligenceLoading ? (
              <div className="text-center py-5" style={{ opacity: 0.5 }}>
                <i className="ri-loader-4-line fs-2 text-white mb-2 d-block" style={{ animation: 'spin 1s linear infinite' }}></i>
                <p className="text-white mb-0" style={{ fontSize: 13 }}>Chargement...</p>
              </div>
            ) : !intelligenceData ? (
              <div className="text-center py-5" style={{ opacity: 0.5 }}>
                <i className="ri-database-2-line fs-2 text-white mb-2 d-block"></i>
                <p className="text-white mb-0" style={{ fontSize: 13 }}>
                  En attente de données KPI suffisantes pour l'analyse…
                </p>
              </div>
            ) : intelligenceData.error ? (
              <div className="p-4 rounded-4" style={{ background: 'rgba(30, 41, 59, 0.35)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="d-flex align-items-start gap-3">
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(16,185,129,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <i className="ri-information-line" style={{ fontSize: 18, color: '#10b981' }}></i>
                  </div>
                  <div>
                    <p className="text-white fw-bold mb-1" style={{ fontSize: 14 }}>Analyse en attente</p>
                    <p className="mb-0 opacity-70" style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>
                      {intelligenceData.error} — Le moteur s'activera automatiquement avec plus de données historiques inter-sites.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Summary Stats */}
                <div className="row g-3 mb-4">
                  {[
                    { icon: "ri-bug-line", label: "Anomalies", value: (intelligenceData.anomalies?.length ?? 0) + (intelligenceData.trend_analysis?.alerts?.filter(a => a.severity !== 'info')?.length ?? 0), color: "#ef4444", bgGlow: "rgba(239, 68, 68, 0.08)" },
                    { icon: "ri-lightbulb-flash-line", label: "Recommandations", value: intelligenceData.recommendations?.length ?? 0, color: "#10b981", bgGlow: "rgba(16, 185, 129, 0.08)" },
                  ].map((stat, i) => (
                    <div key={i} className="col-6">
                      <div style={{
                        padding: '16px 12px',
                        borderRadius: '16px',
                        background: 'rgba(30, 41, 59, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        backdropFilter: 'blur(8px)'
                      }}>
                        <div style={{
                          position: 'absolute',
                          top: '-15%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '50px',
                          height: '50px',
                          borderRadius: '50%',
                          background: stat.bgGlow,
                          filter: 'blur(15px)',
                          zIndex: 0
                        }}></div>

                        <div style={{ position: 'relative', zIndex: 1 }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 8px auto'
                          }}>
                            <i className={stat.icon} style={{ fontSize: 20, color: stat.color }}></i>
                          </div>
                          <div className="fw-extrabold text-white" style={{ fontSize: 22, fontFamily: "'Inter', sans-serif", letterSpacing: '-0.5px' }}>{stat.value}</div>
                          <div className="opacity-60 mt-1 fw-medium" style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{stat.label}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Entity Cards */}
                {intelligenceData.trend_analysis?.site_trends && (
                  <div className="row g-3 mb-5">
                    {Object.values(intelligenceData.trend_analysis.site_trends).map((site, index) => (
                      <div key={index} className="col-12">
                        <EntityCard
                          entity={site}
                          entityType="site"
                          onViewDetails={onEntityClick}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommendations Section */}
                {(intelligenceData.recommendations?.length > 0 || intelligenceData.trend_analysis?.rh_recommendations?.length > 0) && (
                  <div style={{
                    marginTop: '32px',
                    paddingTop: '24px',
                    borderTop: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    <h6 className="fw-bold mb-4 text-white" style={{ fontSize: 15, letterSpacing: '-0.3px' }}>
                      <i className="ri-lightbulb-flash-line me-2" style={{ color: '#10b981' }}></i>
                      Recommandations
                    </h6>

                    {/* AI Recommendations */}
                    {intelligenceData.recommendations?.length > 0 && (
                      <div className="mb-4">
                        <div className="opacity-60 mb-3" style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          Recommandations IA & Synthèse
                        </div>
                        <div className="d-flex flex-column gap-3">
                          {(intelligenceData.trend_analysis
                            ? intelligenceData.recommendations?.filter(r => !r.startsWith('['))
                            : intelligenceData.recommendations
                          )?.map((rec, idx) => (
                            <div key={idx} style={{
                              padding: '16px 20px',
                              borderRadius: '16px',
                              background: 'rgba(16,185,129,0.04)',
                              border: '1px solid rgba(16,185,129,0.12)',
                              borderLeft: '4px solid #10b981'
                            }}>
                              <div className="d-flex align-items-start gap-3">
                                <div style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  background: 'rgba(16,185,129,0.12)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  <i className="ri-arrow-right-circle-line" style={{ fontSize: 16, color: '#10b981' }}></i>
                                </div>
                                <div className="flex-grow-1">
                                  <p className="mb-0 text-white opacity-90 fw-medium" style={{ fontSize: 13, lineHeight: 1.5 }}>
                                    {rec}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RH Recommendations */}
                    {intelligenceData.trend_analysis?.rh_recommendations?.length > 0 && (
                      <div>
                        <div className="opacity-60 mb-3 d-flex align-items-center justify-content-between" style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          <span>Actions RH & Recommandations Opérationnelles</span>
                          {intelligenceData.trend_analysis.rh_recommendations.length > 3 && (
                            <button
                              onClick={() => setShowAllRecommendations(!showAllRecommendations)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#a5b4fc',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                padding: 0,
                                transition: `all ${TRANSITION_DURATION.fast} ${EASING.smooth}`
                              }}
                            >
                              {showAllRecommendations ? 'Masquer' : `Voir les autres (${intelligenceData.trend_analysis.rh_recommendations.length - 3})`}
                            </button>
                          )}
                        </div>
                        <div className="d-flex flex-column gap-2.5">
                          {showAllRecommendations
                            ? intelligenceData.trend_analysis.rh_recommendations.map((rec, idx) => (
                              <RecommendationCard key={idx} rec={rec} />
                            ))
                            : intelligenceData.trend_analysis.rh_recommendations.slice(0, 3).map((rec, idx) => (
                              <RecommendationCard key={idx} rec={rec} />
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          ) : (
            teamIntelligenceLoading ? (
              <div className="text-center py-5" style={{ opacity: 0.5 }}>
                <i className="ri-loader-4-line fs-2 text-white mb-2 d-block" style={{ animation: 'spin 1s linear infinite' }}></i>
                <p className="text-white mb-0" style={{ fontSize: 13 }}>Chargement...</p>
              </div>
            ) : !teamIntelligenceData ? (
              <div className="text-center py-5" style={{ opacity: 0.5 }}>
                <i className="ri-database-2-line fs-2 text-white mb-2 d-block"></i>
                <p className="text-white mb-0" style={{ fontSize: 13 }}>
                  En attente de données KPI suffisantes pour l'analyse…
                </p>
              </div>
            ) : !teamIntelligenceData.trend_analysis?.team_trends || Object.keys(teamIntelligenceData.trend_analysis?.team_trends || {}).length === 0 ? (
              <div className="text-center py-5" style={{ opacity: 0.5 }}>
                <i className="ri-database-2-line fs-2 text-white mb-2 d-block"></i>
                <p className="text-white mb-0" style={{ fontSize: 13 }}>
                  En attente de données KPI suffisantes pour l'analyse…
                </p>
              </div>
            ) : teamIntelligenceData.error ? (
              <div className="p-4 rounded-4" style={{ background: 'rgba(30, 41, 59, 0.35)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="d-flex align-items-start gap-3">
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(16,185,129,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <i className="ri-information-line" style={{ fontSize: 18, color: '#10b981' }}></i>
                  </div>
                  <div>
                    <p className="text-white fw-bold mb-1" style={{ fontSize: 14 }}>Analyse en attente</p>
                    <p className="mb-0 opacity-70" style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>
                      {teamIntelligenceData.error} — Le moteur s'activera automatiquement avec plus de données historiques inter-équipes.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Summary Stats */}
                <div className="row g-3 mb-4">
                  {[
                    { icon: "ri-bug-line", label: "Anomalies", value: (teamIntelligenceData.anomalies?.length ?? 0) + (teamIntelligenceData.trend_analysis?.alerts?.filter(a => a.severity !== 'info')?.length ?? 0), color: "#ef4444", bgGlow: "rgba(239, 68, 68, 0.08)" },
                    { icon: "ri-lightbulb-flash-line", label: "Recommandations", value: teamIntelligenceData.recommendations?.length ?? 0, color: "#10b981", bgGlow: "rgba(16, 185, 129, 0.08)" },
                  ].map((stat, i) => (
                    <div key={i} className="col-6">
                      <div style={{
                        padding: '16px 12px',
                        borderRadius: '16px',
                        background: 'rgba(30, 41, 59, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        backdropFilter: 'blur(8px)'
                      }}>
                        <div style={{
                          position: 'absolute',
                          top: '-15%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '50px',
                          height: '50px',
                          borderRadius: '50%',
                          background: stat.bgGlow,
                          filter: 'blur(15px)',
                          zIndex: 0
                        }}></div>

                        <div style={{ position: 'relative', zIndex: 1 }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 8px auto'
                          }}>
                            <i className={stat.icon} style={{ fontSize: 20, color: stat.color }}></i>
                          </div>
                          <div className="fw-extrabold text-white" style={{ fontSize: 22, fontFamily: "'Inter', sans-serif", letterSpacing: '-0.5px' }}>{stat.value}</div>
                          <div className="opacity-60 mt-1 fw-medium" style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{stat.label}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Entity Cards */}
                {teamIntelligenceData.trend_analysis?.team_trends && (
                  <div className="row g-3 mb-5">
                    {Object.values(teamIntelligenceData.trend_analysis.team_trends).map((team, index) => (
                      <div key={index} className="col-12">
                        <EntityCard
                          entity={team}
                          entityType="team"
                          onViewDetails={onEntityClick}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommendations Section */}
                {(teamIntelligenceData.recommendations?.length > 0 || teamIntelligenceData.trend_analysis?.rh_recommendations?.length > 0) && (
                  <div style={{
                    marginTop: '32px',
                    paddingTop: '24px',
                    borderTop: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    <h6 className="fw-bold mb-4 text-white" style={{ fontSize: 15, letterSpacing: '-0.3px' }}>
                      <i className="ri-lightbulb-flash-line me-2" style={{ color: '#10b981' }}></i>
                      Recommandations
                    </h6>

                    {/* AI Recommendations */}
                    {teamIntelligenceData.recommendations?.length > 0 && (
                      <div className="mb-4">
                        <div className="opacity-60 mb-3" style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          Recommandations IA & Synthèse
                        </div>
                        <div className="d-flex flex-column gap-3">
                          {(teamIntelligenceData.trend_analysis
                            ? teamIntelligenceData.recommendations?.filter(r => !r.startsWith('['))
                            : teamIntelligenceData.recommendations
                          )?.map((rec, idx) => (
                            <div key={idx} style={{
                              padding: '16px 20px',
                              borderRadius: '16px',
                              background: 'rgba(16,185,129,0.04)',
                              border: '1px solid rgba(16,185,129,0.12)',
                              borderLeft: '4px solid #10b981'
                            }}>
                              <div className="d-flex align-items-start gap-3">
                                <div style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  background: 'rgba(16,185,129,0.12)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  <i className="ri-arrow-right-circle-line" style={{ fontSize: 16, color: '#10b981' }}></i>
                                </div>
                                <div className="flex-grow-1">
                                  <p className="mb-0 text-white opacity-90 fw-medium" style={{ fontSize: 13, lineHeight: 1.5 }}>
                                    {rec}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RH Recommendations */}
                    {teamIntelligenceData.trend_analysis?.rh_recommendations?.length > 0 && (
                      <div>
                        <div className="opacity-60 mb-3 d-flex align-items-center justify-content-between" style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          <span>Actions RH & Recommandations Opérationnelles</span>
                          {teamIntelligenceData.trend_analysis.rh_recommendations.length > 3 && (
                            <button
                              onClick={() => setShowAllRecommendations(!showAllRecommendations)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#a5b4fc',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                padding: 0,
                                transition: `all ${TRANSITION_DURATION.fast} ${EASING.smooth}`
                              }}
                            >
                              {showAllRecommendations ? 'Masquer' : `Voir les autres (${teamIntelligenceData.trend_analysis.rh_recommendations.length - 3})`}
                            </button>
                          )}
                        </div>
                        <div className="d-flex flex-column gap-2.5">
                          {showAllRecommendations
                            ? teamIntelligenceData.trend_analysis.rh_recommendations.map((rec, idx) => (
                              <RecommendationCard key={idx} rec={rec} />
                            ))
                            : teamIntelligenceData.trend_analysis.rh_recommendations.slice(0, 3).map((rec, idx) => (
                              <RecommendationCard key={idx} rec={rec} />
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
};

const METRICS_OPTIONS = [
  { id: "velocity", label: "Vélocité commits (Commits/Dev)", icon: "ri-flashlight-line", color: "#4f46e5" },
  { id: "mr_rate", label: "Vélocité Mrs (MRs/Dev)", icon: "ri-git-merge-line", color: "#0ab39c" },
  { id: "quality_score", label: "Taux d'Approbation (%)", icon: "ri-shield-check-line", color: "#299cdb" },
  { id: "merged_rate", label: "Taux de Fusion (%)", icon: "ri-git-pull-request-line", color: "#f06548" },
  { id: "review_time", label: "Temps de Revue (h)", icon: "ri-timer-flash-line", color: "#f7b84b" },
  
];

export default function ComparativeAnalyticsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = parseInt(searchParams.get("project_id")) || 1;

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);
  const [showDetailedAudit, setShowDetailedAudit] = useState(false);
  const [pageError, setPageError] = useState("");
  const [intelligenceData, setIntelligenceData] = useState(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [teamIntelligenceData, setTeamIntelligenceData] = useState(null);
  const [teamIntelligenceLoading, setTeamIntelligenceLoading] = useState(false);
  const [selectedEntityForDetails, setSelectedEntityForDetails] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showIntelligenceDrawer, setShowIntelligenceDrawer] = useState(false);
  const [showMatrixHelpModal, setShowMatrixHelpModal] = useState(false);

  // ✅ État séparé pour les assignations multi-tenant (pour éviter de modifier l'objet user en lecture seule)
  const [userAssignments, setUserAssignments] = useState({ site_ids: [], group_ids: [], project_ids: [] });

  // ✅ Stabiliser les valeurs pour éviter les boucles infinies dans useEffect
  const siteIdsLength = userAssignments.site_ids.length;
  const groupIdsLength = userAssignments.group_ids.length;

  // States de sélection
  const [activeMetricId, setActiveMetricId] = useState("velocity");
  const [entityType, setEntityType] = useState('site'); // 'site' or 'group'
  const [selectedEntityIds, setSelectedEntityIds] = useState([]);
  const [intelligenceView, setIntelligenceView] = useState('sites'); // 'sites' or 'teams' - for tabbed navigation
  
  // ✅ Filtre de période (côté client uniquement)
  const [availablePeriods, setAvailablePeriods] = useState([]);
  const [selectedPeriods, setSelectedPeriods] = useState([]);
  const [showPeriodFilter, setShowPeriodFilter] = useState(false);
  
  // ✅ Modal d'explication du score de santé
  const [showHealthScoreModal, setShowHealthScoreModal] = useState(false);

  // ✅ Rafraîchir les assignations au chargement du composant (pour les utilisateurs connectés avant l'ajout du endpoint)
  useEffect(() => {
    const fetchAssignments = async () => {
      if (user?.role === 'site_manager' || user?.role === 'team_lead' || user?.role === 'project_manager' || user?.role === 'viewer') {
        try {
          const assignments = await authService.getUserAssignments();
          console.log("[DEBUG] Initial assignments fetch:", assignments);
          setUserAssignments(assignments);
        } catch (e) {
          console.error("[DEBUG] Error fetching initial assignments:", e);
        }
      }
    };
    fetchAssignments();
  }, [user?.role]);

  // 1. Charger la liste des projets une seule fois
  useEffect(() => {
    const fetchProjectsList = async () => {
      try {
        const data = await projectService.getAll();
        setProjects(data);
        const projectIdParam = searchParams.get("project_id");
        if ((!projectIdParam || projectIdParam === "all") && data.length > 0) {
          setSearchParams({ project_id: data[0].id || data[0].project_id });
        }
      } catch (err) {
        console.error("Erreur chargement liste projets:", err);
        setPageError(toUserError(err, "Impossible de charger la liste des projets."));
      }
    };
    fetchProjectsList();
  }, [searchParams, setSearchParams]);

  // 2. Initialisation réactive au changement de projectId
  useEffect(() => {
    const loadProjectData = async () => {
      if (!projectId) return;
      try {
        setLoading(true);
        setPageError("");

        console.log("DEBUG - User info:", {
          role: user?.role,
          site_id: user?.site_id,
          group_id: user?.group_id,
          site_ids: user?.site_ids,
          group_ids: user?.group_ids,
          project_ids: user?.project_ids,
          is_site_manager: user?.role === "site_manager",
          is_team_lead: user?.role === "team_lead",
          is_project_manager: user?.role === "project_manager"
        });

        // ✅ FILTRAGE AUTOMATIQUE MULTI-TENANT
        let siteIdParam = null;
        let groupIdParam = null;

        if (user?.role === "site_manager" && user?.site_ids?.length > 0) {
          // Site manager: utiliser ses sites assignés
          siteIdParam = user.site_ids[0]; // Premier site assigné
        } else if (user?.role === "team_lead" && user?.group_ids?.length > 0) {
          // Team lead: utiliser ses équipes assignées
          groupIdParam = user.group_ids[0]; // Première équipe assignée
        }

        console.log("DEBUG - siteIdParam passed to getGroups:", siteIdParam);
        console.log("DEBUG - groupIdParam passed to getGroups:", groupIdParam);

        const [sitesData, groupsData] = await Promise.all([
          analyticsService.getAvailableSites(projectId).catch(() => []),
          developerService.getGroups(siteIdParam, false, null, groupIdParam).catch(() => [])
        ]);

        console.log("DEBUG - groupsData received:", groupsData);
        console.log("DEBUG - userAssignments:", userAssignments);
        console.log("DEBUG - user role:", user?.role);

        // ✅ FILTRER LES DONNÉES AVANT DE LES DÉFINIR (pour Viewer)
        let filteredSites = sitesData;
        let filteredGroups = groupsData;

        if (user?.role === "viewer") {
          // Viewer: ne montrer que les sites/équipes assignés
          console.log("DEBUG - Applying Viewer filtering logic");
          if (userAssignments.site_ids?.length > 0) {
            filteredSites = sitesData.filter(s => userAssignments.site_ids.includes(s.id || s.site_id));
            filteredGroups = groupsData.filter(g => userAssignments.group_ids.includes(g.id || g.group_id));
            console.log("DEBUG - Filtered sites by site_ids:", filteredSites.length);
            console.log("DEBUG - Filtered groups by group_ids:", filteredGroups.length);
          } else if (userAssignments.group_ids?.length > 0) {
            filteredSites = sitesData.filter(s => userAssignments.group_ids.includes(s.id || s.site_id));
            filteredGroups = groupsData.filter(g => userAssignments.group_ids.includes(g.id || g.group_id));
            console.log("DEBUG - Filtered sites by group_ids:", filteredSites.length);
            console.log("DEBUG - Filtered groups by group_ids:", filteredGroups.length);
          } else {
            console.log("DEBUG - Viewer has no assignments, showing all as fallback");
          }
        }

        console.log("DEBUG - Final sites count:", filteredSites.length);
        console.log("DEBUG - Final groups count:", filteredGroups.length);

        setSites(filteredSites);
        setGroups(filteredGroups);

        // ✅ FILTRAGE AUTOMATIQUE SELON LE RÔLE
        if (user?.role === "site_manager" && user?.site_ids?.length > 0) {
          // Site manager: sélectionner automatiquement ses sites assignés
          const accessibleSites = filteredSites.filter(s => user.site_ids.includes(s.id || s.site_id));
          setSelectedEntityIds(accessibleSites.map(s => s.id || s.site_id));
          setEntityType('site');
        } else if (user?.role === "team_lead" && user?.group_ids?.length > 0) {
          // Team lead: sélectionner automatiquement ses équipes assignées
          const accessibleGroups = filteredGroups.filter(g => user.group_ids.includes(g.id || g.group_id));
          setSelectedEntityIds(accessibleGroups.map(g => g.id || g.group_id));
          setEntityType('group');
        } else if (user?.role === "viewer") {
          // Viewer: utiliser ses assignations (prioriser les équipes si disponibles)
          if (userAssignments.group_ids?.length > 0) {
            const accessibleGroups = filteredGroups.filter(g => userAssignments.group_ids.includes(g.id || g.group_id));
            setSelectedEntityIds(accessibleGroups.map(g => g.id || g.group_id));
            setEntityType('group');
          } else if (userAssignments.site_ids?.length > 0) {
            const accessibleSites = filteredSites.filter(s => userAssignments.site_ids.includes(s.id || s.site_id));
            setSelectedEntityIds(accessibleSites.map(s => s.id || s.site_id));
            setEntityType('site');
          } else {
            // Viewer sans assignations: tous les sites (fallback)
            setSelectedEntityIds(filteredSites.map(s => s.id || s.site_id));
            setEntityType('site');
          }
        } else if (user?.role === "project_manager" && user?.project_ids?.length > 0) {
          // Project manager: utiliser son projet assigné
          setEntityType('project');
          // Les données de projet sont déjà filtrées par le backend
        } else if (filteredSites.length > 0) {
          // Super admin ou fallback: tous les sites
          setSelectedEntityIds(filteredSites.map(s => s.id || s.site_id));
        }
      } catch (err) {
        console.error("Erreur loadProjectData:", err);
        setPageError(toUserError(err, "Impossible de charger les donnees du projet."));
      } finally {
        setLoading(false);
      }
    };
    loadProjectData();
  }, [projectId, user]);

  const handleProjectChange = (e) => {
    const newId = e.target.value;
    setSearchParams({ project_id: newId });
    setSelectedEntityIds([]);
  };

  // Données de tendance
  const [trends, setTrends] = useState([]);
  
  // ✅ Données filtrées par période (côté client)
  const filteredTrends = useMemo(() => {
    if (selectedPeriods.length === 0 || selectedPeriods.length === availablePeriods.length) {
      return trends; // Aucun filtre ou toutes les périodes sélectionnées
    }
    return trends.filter(t => selectedPeriods.includes(t.period_label));
  }, [trends, selectedPeriods, availablePeriods]);

  // 2. Chargement des données de tendance
  useEffect(() => {
    if (selectedEntityIds.length === 0) {
      setTrends([]);
      return;
    }

    const fetchTrends = async () => {
      try {
        setPageError("");
        const data = await analyticsService.getComparativeTrends(projectId, {
          siteIds: entityType === "site" ? selectedEntityIds : [],
          groupIds: entityType === "group" ? selectedEntityIds : [],
        });
        setTrends(data);
        
        // ✅ Extraire les périodes disponibles
        const periods = [...new Set(data.map(t => t.period_label))];
        setAvailablePeriods(periods);
        // Par défaut, toutes les périodes sont sélectionnées
        setSelectedPeriods(periods);
      } catch (err) {
        console.error("Erreur fetchTrends:", err);
        setPageError(toUserError(err, "Impossible de charger les tendances comparatives."));
      }
    };
    fetchTrends();
  }, [projectId, entityType, selectedEntityIds]);

  // 4. Chargement Intelligence Statistique (Super Admin, Site Manager, Project Manager et Viewer)
  useEffect(() => {
    if (projectId && (user?.role === 'super_admin' || user?.role === 'site_manager' || user?.role === 'project_manager' || user?.role === 'viewer')) {
      const fetchIntelligence = async () => {
        setIntelligenceLoading(true);
        try {
          // ✅ FIX: Pour site_manager, rafraîchir les assignments si vides et attendre le résultat
          let effectiveSiteIds = null;
          if (user?.role === 'site_manager') {
            if (userAssignments.site_ids.length === 0) {
              try {
                const assignments = await authService.getUserAssignments();
                console.log("[DEBUG] Refreshed assignments for intelligence:", assignments);
                setUserAssignments(assignments);
                effectiveSiteIds = assignments.site_ids.length > 0 ? assignments.site_ids : [user?.site_id].filter(Boolean);
              } catch (e) {
                console.error("[DEBUG] Error refreshing assignments:", e);
                effectiveSiteIds = [user?.site_id].filter(Boolean);
              }
            } else {
              effectiveSiteIds = userAssignments.site_ids;
            }
          } else if (user?.role === 'viewer') {
            // ✅ FIX: Pour viewer, utiliser ses assignments de sites
            effectiveSiteIds = userAssignments.site_ids.length > 0 ? userAssignments.site_ids : null;
          }

          console.log("[DEBUG] Fetching intelligence - user role:", user?.role, "siteIds:", effectiveSiteIds, "userAssignments.site_ids:", userAssignments.site_ids, "user.site_id:", user?.site_id);
          const data = await analyticsService.getAdminIntelligence(projectId, null, null, effectiveSiteIds);
          
          // ✅ FIX: Filtrer l'intelligence par les périodes sélectionnées pour cohérence avec le reste de la page
          if (data && data.trend_analysis && selectedPeriods.length > 0 && selectedPeriods.length < availablePeriods.length) {
            // Filtrer les site_trends pour ne garder que les périodes sélectionnées
            if (data.trend_analysis.site_trends) {
              const filteredSiteTrends = {};
              Object.entries(data.trend_analysis.site_trends).forEach(([siteId, siteData]) => {
                // Filtrer les alertes pour ne garder que celles des périodes sélectionnées
                const filteredAlerts = (data.trend_analysis.alerts || []).filter(alert => {
                  // Les alertes n'ont pas directement de période, mais on peut filtrer par site
                  return effectiveSiteIds === null || effectiveSiteIds.includes(parseInt(siteId));
                });
                filteredSiteTrends[siteId] = siteData;
              });
              data.trend_analysis.site_trends = filteredSiteTrends;
              data.trend_analysis.alerts = filteredAlerts;
            }
          }
          
          setIntelligenceData(data);
        } catch (err) {
          console.warn("Intelligence non disponible:", err);
          setIntelligenceData(null);
        } finally {
          setIntelligenceLoading(false);
        }
      };
      fetchIntelligence();
    }
  }, [projectId, user, selectedPeriods, availablePeriods]); // ✅ Ajouter selectedPeriods et availablePeriods comme dépendances

  // 5. Chargement Intelligence Équipes (Super Admin, Team Lead, Project Manager et Viewer)
  useEffect(() => {
    if (projectId && (user?.role === 'super_admin' || user?.role === 'team_lead' || user?.role === 'project_manager' || user?.role === 'viewer')) {
      const fetchTeamIntelligence = async () => {
        setTeamIntelligenceLoading(true);
        try {
          // ✅ FIX: Ne rafraîchir les assignments que si c'est réellement nécessaire (tableaux vides ET pas déjà tenté)
          const needsRefresh = user?.role === 'team_lead' && userAssignments.group_ids.length === 0;

          if (needsRefresh) {
            try {
              const assignments = await authService.getUserAssignments();
              console.log("[DEBUG] Refreshed assignments for team intelligence:", assignments);
              setUserAssignments(assignments);
            } catch (e) {
              console.error("[DEBUG] Error refreshing assignments for team intelligence:", e);
            }
          }

          // ✅ FIX: Pour team_lead, project_manager et viewer, utiliser group_ids depuis userAssignments au lieu de user.group_id
          const groupIds = (user?.role === 'team_lead' || user?.role === 'project_manager' || user?.role === 'viewer') ? (userAssignments.group_ids.length > 0 ? userAssignments.group_ids : [user?.group_id].filter(Boolean)) : null;
          console.log("[DEBUG] Fetching team intelligence - user role:", user?.role, "groupIds:", groupIds, "userAssignments.group_ids:", userAssignments.group_ids, "user.group_ids:", user?.group_id);
          const data = await analyticsService.getTeamIntelligence(projectId, null, groupIds);
          console.log("[DEBUG] Team intelligence data received:", data);
          
          // ✅ FIX: Filtrer l'intelligence équipe par les périodes sélectionnées pour cohérence
          if (data && data.trend_analysis && selectedPeriods.length > 0 && selectedPeriods.length < availablePeriods.length) {
            if (data.trend_analysis.team_trends) {
              const filteredTeamTrends = {};
              Object.entries(data.trend_analysis.team_trends).forEach(([groupId, teamData]) => {
                const filteredAlerts = (data.trend_analysis.alerts || []).filter(alert => {
                  return groupIds === null || groupIds.includes(parseInt(groupId));
                });
                filteredTeamTrends[groupId] = teamData;
              });
              data.trend_analysis.team_trends = filteredTeamTrends;
              data.trend_analysis.alerts = filteredAlerts;
            }
          }
          
          setTeamIntelligenceData(data);
        } catch (err) {
          console.warn("Intelligence équipes non disponible:", err);
          setTeamIntelligenceData(null);
        } finally {
          setTeamIntelligenceLoading(false);
        }
      };
      fetchTeamIntelligence();
    }
  }, [projectId, user, selectedPeriods, availablePeriods]); // ✅ Ajouter selectedPeriods et availablePeriods comme dépendances

  const executiveSummary = useMemo(() => {
    if (!filteredTrends.length) return null;
    const lastPeriod = filteredTrends[filteredTrends.length - 1]?.period_label;
    const currentData = filteredTrends.filter(t => t.period_label === lastPeriod);
    if (currentData.length === 0) return null;

    // ✅ FIX: Filtrer les valeurs <= 0 pour la vélocité MRs/dev (données manquantes)
    const validVelocityData = currentData.filter(t => (t.metrics.mr_rate || 0) > 0);
    const bestVelocity = validVelocityData.length > 0 
      ? [...validVelocityData].sort((a, b) => b.metrics.mr_rate - a.metrics.mr_rate)[0]
      : null;
    
    // Filtrer les valeurs 0 pour le temps de revue (pas de données)
    const validReviews = currentData.filter(t => t.metrics.review_time > 0);
    const slowReviews = validReviews.filter(t => t.metrics.review_time > 48);
    
    // Filtrer les valeurs 0 pour la qualité (pas de données)
    const validQuality = currentData.filter(t => t.metrics.quality_score > 0);
    const avgQuality = validQuality.length > 0 
      ? validQuality.reduce((acc, c) => acc + c.metrics.quality_score, 0) / validQuality.length 
      : 0;
    const avgQualityPct = avgQuality <= 1 ? avgQuality * 100 : avgQuality;

    let text = `Pour la période de ${lastPeriod}, l'analyse comparative montre que la dynamique est principalement tirée par ${bestVelocity?.entity_name || 'une entité'} qui se distingue avec la meilleure vélocité (${fmt(bestVelocity?.metrics?.mr_rate)} MRs/dev). `;

    if (validQuality.length === 0) {
      text += `Aucune donnée de qualité disponible pour cette période. `;
    } else if (avgQualityPct > 85) {
      text += `La qualité globale du code est à un excellent niveau (${fmt(avgQualityPct, 0)}% d'approbation). `;
    } else {
      text += `La qualité globale du code nécessite une attention particulière (${fmt(avgQualityPct, 0)}% d'approbation). `;
    }

    if (validReviews.length === 0) {
      text += `Aucune donnée de temps de revue disponible pour cette période.`;
    } else if (slowReviews.length > 0) {
      text += `⚠️ Attention cependant au goulot d'étranglement identifié sur ${slowReviews.length} entité(s) (${slowReviews.map(s => s.entity_name).join(', ')}) où le temps de revue dépasse les 48 heures.`;
    } else {
      text += `Le flux de revue est fluide sur l'ensemble du périmètre (aucun site critique > 48h).`;
    }

    return { title: `Résumé Exécutif — ${lastPeriod}`, text };
  }, [filteredTrends]);

  const healthScore = useMemo(() => {
    if (!filteredTrends.length) return 0;
    const latest = filteredTrends[filteredTrends.length - 1];
    if (!latest) return 0;

    // Utiliser la formule unifiée depuis metricsThresholds.js
    return calculateHealthScore(
      latest.metrics.velocity,
      latest.metrics.quality_score || 0,
      latest.metrics.review_time
    );
  }, [filteredTrends]);

  const getChartDataForMetric = (metricId) => {
    if (!filteredTrends.length) return { series: [], categories: [] };

    const periods = [...new Set(filteredTrends.map(t => t.period_label))];

    const entityGroups = {};
    filteredTrends.forEach(t => {
      // ✅ FIX: Vérifier que t et t.metrics existent avant d'y accéder
      if (!t || !t.metrics) return;
      
      if (!entityGroups[t.entity_name]) entityGroups[t.entity_name] = {};
      let val = t.metrics[metricId];
      if ((metricId === 'quality_score' || metricId === 'merged_rate') && val != null && val <= 1.0) {
        val = val * 100;
      }
      entityGroups[t.entity_name][t.period_label] = val;
    });

    const series = Object.keys(entityGroups).map(name => ({
      name,
      data: periods.map(p => entityGroups[name][p] || 0)
    }));

    return { series, categories: periods };
  };

  const chartData = useMemo(() => {
    return getChartDataForMetric(activeMetricId);
  }, [filteredTrends, activeMetricId]);

  const strategicPivotData = useMemo(() => {
    if (!filteredTrends.length) return { rows: [], columns: [] };

    const columns = [...new Set(filteredTrends.map(t => t.period_label))];
    const entityNames = [...new Set(filteredTrends.map(t => t.entity_name))];

    const rows = entityNames.map(name => {
      const rowData = { entity_name: name, cells: {} };
      columns.forEach(col => {
        const trend = filteredTrends.find(t => t.entity_name === name && t.period_label === col);
        // ✅ FIX: Vérifier que trend et trend.metrics existent
        rowData.cells[col] = (trend && trend.metrics) ? trend.metrics : null;
      });
      return rowData;
    });

    return { rows, columns };
  }, [filteredTrends]);

  const getMetricHealth = (metricId, value) => {
    if (value == null) return { color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", label: "N/A", icon: "ri-question-line" };
    
    // Pour les métriques d'activité où 0 signifie "pas d'activité", traiter comme N/A
    // Mais pour quality_score et merged_rate, 0% est une vraie métrique (très mauvaise)
    const activityMetrics = ['velocity', 'mr_rate', 'review_time', 'avg_commits'];
    if (activityMetrics.includes(metricId) && value === 0) {
      return { color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", label: "N/A", icon: "ri-question-line" };
    }

    // Utiliser les seuils partagés depuis metricsThresholds.js
    const t = METRIC_THRESHOLDS[metricId] || { low: 0, high: 0, reverse: false };

    let checkVal = value;
    if ((metricId === 'quality_score' || metricId === 'merged_rate') && value <= 1.0) checkVal = value * 100;

    let status = "medium";
    if (t.reverse) {
      if (checkVal <= t.low) status = "good";
      else if (checkVal > t.high) status = "bad";
    } else {
      if (checkVal >= t.high) status = "good";
      else if (checkVal < t.low) status = "bad";
    }

    const map = {
      good: { color: "#047857", bg: "#ecfdf5", border: "#10b981", icon: "ri-checkbox-circle-fill", label: "Excellent" },
      medium: { color: "#b45309", bg: "#fffbeb", border: "#f59e0b", icon: "ri-error-warning-fill", label: "Moyen" },
      bad: { color: "#b91c1c", bg: "#fef2f2", border: "#ef4444", icon: "ri-close-circle-fill", label: "Critique" }
    };

    return map[status];
  };

  const getDeltaText = (val, prevVal, metricId) => {
    if (prevVal == null || val == null) return { text: "→ stable", color: "text-muted" };
    const diff = val - prevVal;
    if (Math.abs(diff) < 0.01) return { text: "→ stable", color: "text-muted" };

    const isPositive = (metricId === 'review_time' || metricId === 'avg_commits') ? diff < 0 : diff > 0;
    const percent = ((diff / (prevVal || 1)) * 100).toFixed(0);
    return {
      text: `${diff > 0 ? '↑' : '↓'} ${Math.abs(percent)}%`,
      color: isPositive ? "text-success" : "text-danger"
    };
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleExportPDF = async () => {
    setPdfLoading(true);
    setShowExportMenu(false);
    try {
      const projectName = projects.find(p => (p.id || p.project_id) === projectId)?.name || 'Dashboard';
      const periods = [...new Set(trends.map(t => t.period_label))];
      const period = periods.length
        ? `${periods[0]} - ${periods[periods.length - 1]}`
        : 'Toutes periodes';

      // ── Dynamic insights from real data ──────────────────────────────────
      const insightsArray = [];
      if (filteredTrends.length > 0) {
        const lastPeriodLabel = filteredTrends[filteredTrends.length - 1]?.period_label;
        const currentData = filteredTrends.filter(
          t => t.period_label === lastPeriodLabel &&
            t.entity_name !== 'Global' &&
            t.entity_name !== 'Autres / Non-assignes'
        );

        if (currentData.length > 0) {
          // 1. Best velocity entity
          const byVelocity = [...currentData].sort((a, b) => (b.metrics.velocity || 0) - (a.metrics.velocity || 0));
          if (byVelocity[0]?.metrics.velocity > 0) {
            insightsArray.push({
              type: 'success',
              title: 'Leader en Velocite de Livraison',
              text: `${byVelocity[0].entity_name} enregistre la meilleure velocite sur la periode (${(byVelocity[0].metrics.velocity || 0).toFixed(1)} commits/dev), soit un niveau de performance superieur a la moyenne du perimetre.`,
            });
          }

          // 2. Bottleneck: slow review time (✅ UNIFICATION : utiliser seuil partagé)
          const slowReview = currentData.filter(t => (t.metrics.review_time || 0) > METRIC_THRESHOLDS.review_time.high); // 48h
          if (slowReview.length > 0) {
            insightsArray.push({
              type: 'danger',
              title: 'Goulot d\'etranglement : Revue de Code Critique',
              text: `Le temps moyen de revue depasse le seuil critique de ${METRIC_THRESHOLDS.review_time.high}h sur ${slowReview.length} entite(s) : ${slowReview.map(s => s.entity_name).join(', ')}. Ce retard structurel impacte directement la frequence de deploiement.`,
            });
          }

          // 3. Quality alert (✅ UNIFICATION : utiliser seuil partagé)
          const lowQuality = currentData.filter(t => {
            const q = t.metrics.quality_score || 0;
            const qPct = q <= 1 ? q * 100 : q;
            return qPct < METRIC_THRESHOLDS.quality_score.low; // 70%
          });
          if (lowQuality.length > 0) {
            insightsArray.push({
              type: 'warning',
              title: 'Vigilance Qualite : Taux d\'Approbation Insuffisant',
              text: `Le taux d'approbation est en-dessous de l'objectif de ${METRIC_THRESHOLDS.quality_score.low}% pour : ${lowQuality.map(s => s.entity_name).join(', ')}. Un renforcement des processus de revue et de test est recommande.`,
            });
          }

          // 4. Excellence signal (✅ UNIFICATION : utiliser seuils partagés)
          const excellent = currentData.filter(t => {
            const q = t.metrics.quality_score || 0;
            const qPct = q <= 1 ? q * 100 : q;
            return (t.metrics.velocity || 0) >= METRIC_THRESHOLDS.velocity.high && // 5.0
                   qPct >= METRIC_THRESHOLDS.quality_score.high && // 90%
                   (t.metrics.review_time || 0) <= METRIC_THRESHOLDS.review_time.low; // 24h
          });
          if (excellent.length > 0) {
            insightsArray.push({
              type: 'success',
              title: 'Excellence Operationnelle Confirmee',
              text: `${excellent.map(s => s.entity_name).join(', ')} repondent simultanement aux 3 criteres d'excellence : velocite >= ${METRIC_THRESHOLDS.velocity.high}, qualite >= ${METRIC_THRESHOLDS.quality_score.high}% et delai de revue <= ${METRIC_THRESHOLDS.review_time.low}h. Modele a repliquer sur l'ensemble du perimetre.`,
            });
          }

          // 5. Performance trend (if multi-period)
          if (periods.length >= 2) {
            const prevPeriodLabel = periods[periods.length - 2];
            const prevData = trends.filter(t => t.period_label === prevPeriodLabel && t.entity_name !== 'Global');
            const avgCurrent = currentData.reduce((s, t) => s + (t.metrics.velocity || 0), 0) / currentData.length;
            const avgPrev = prevData.length ? prevData.reduce((s, t) => s + (t.metrics.velocity || 0), 0) / prevData.length : 0;
            if (avgPrev > 0) {
              const delta = ((avgCurrent - avgPrev) / avgPrev * 100).toFixed(0);
              const sign = delta > 0 ? '+' : '';
              insightsArray.push({
                type: delta >= 0 ? 'info' : 'warning',
                title: `Evolution Mensuelle de la Velocite : ${sign}${delta}%`,
                text: `La velocite moyenne du perimetre est passee de ${avgPrev.toFixed(1)} (${prevPeriodLabel}) a ${avgCurrent.toFixed(1)} commits/dev (${lastPeriodLabel}), soit une variation de ${sign}${delta}% sur la periode analysee.`,
              });
            }
          }
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      await exportDashboardPDF({
        projectName,
        period,
        healthScore,
        insights: insightsArray,
        trends,
        chartElementId: 'kpi-evolution-chart',
        executiveSummary,
        intelligenceData,
        teamIntelligenceData,
      });
    } catch (err) {
      console.error('[PDF Export] Erreur:', err);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!filteredTrends.length) return;
    const projectName = projects.find(p => (p.id || p.project_id) === projectId)?.name || 'dashboard';
    const safeProject = projectName.replace(/[^a-zA-Z0-9]/g, '_');
    const date = new Date().toISOString().slice(0, 10);

    const header = ['Entité', 'Période', 'Commits Totaux', 'MRs Totaux', 'Vélocité (C/Dev)', 'Qualité (%)', 'Fusion (%)', 'Review Time (h)'];
    const rows = filteredTrends.map(t => [
      `"${t.entity_name}"`,
      `"${t.period_label}"`,
      t.metrics.total_commits ?? '',
      t.metrics.total_mrs ?? '',
      (t.metrics.velocity ?? '').toString().replace('.', ','),
      ((t.metrics.quality_score != null ? (t.metrics.quality_score <= 1 ? t.metrics.quality_score * 100 : t.metrics.quality_score) : '')).toString().replace('.', ','),
      ((t.metrics.merged_rate != null ? (t.metrics.merged_rate <= 1 ? t.metrics.merged_rate * 100 : t.metrics.merged_rate) : '')).toString().replace('.', ','),
      (t.metrics.review_time ?? '').toString().replace('.', ',')
    ]);

    const csvContent = [header.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `KPI_${safeProject}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportJSON = () => {
    if (!filteredTrends.length) return;
    const projectName = projects.find(p => (p.id || p.project_id) === projectId)?.name || 'dashboard';
    const safeProject = projectName.replace(/[^a-zA-Z0-9]/g, '_');
    const date = new Date().toISOString().slice(0, 10);
    const payload = { project: projectName, exported_at: new Date().toISOString(), data: filteredTrends };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `KPI_${safeProject}_${date}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const getChartOptionsForMetric = (metricId, categories) => {
    return {
      chart: {
        type: 'area',
        height: 380,
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: CHART_FONT,
        animations: { enabled: false }
      },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 3 },
      colors: CHART_COLORS,
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.15,
          opacityTo: 0.05,
          stops: [0, 90, 100]
        }
      },
      xaxis: {
        categories: categories || [],
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          formatter: (val) => val.toFixed((metricId === 'quality_score' || metricId === 'merged_rate') ? 0 : 1) + ((metricId === 'quality_score' || metricId === 'merged_rate') ? '%' : '')
        }
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (val) => val.toFixed(2)
        }
      },
      grid: {
        borderColor: '#f1f1f1',
        padding: { top: 10, bottom: 10 }
      },
      legend: {
        position: 'top',
        horizontalAlign: 'right',
        floating: true,
        offsetY: -25,
        offsetX: -5
      },
      annotations: {
        yaxis: [{
          y: metricId === 'velocity' ? 4 : (metricId === 'mr_rate' ? 2 : ((metricId === 'quality_score' || metricId === 'merged_rate') ? 85 : 24)),
          borderColor: '#9ca3af',
          label: {
            borderColor: '#9ca3af',
            style: { color: '#fff', background: '#9ca3af' },
            text: 'Objectif Entreprise'
          }
        }]
      }
    };
  };

  const chartOptions = useMemo(() => {
    return getChartOptionsForMetric(activeMetricId, chartData.categories);
  }, [activeMetricId, chartData.categories]);

  const activeMetric = METRICS_OPTIONS.find(m => m.id === activeMetricId);

  if (loading && projects.length === 0) {
    return <LoadingSpinner fullPage text="Initialisation de l'analyse strategique..." />;
  }

  return (
    <div className="page-content">
      <div className="container-fluid" style={{ background: "#f3f3f9", minHeight: "100vh", paddingTop: "24px", paddingBottom: "24px" }}>
        {/* Header Dynamique avec Health Score */}
        <div className="row mb-4 align-items-center">
          <div className="col-lg-7">
            <div className="d-flex align-items-center gap-4">
              <div className="bg-white p-3 rounded-4 shadow-sm border d-flex align-items-center justify-content-center" style={{ width: 80, height: 80 }}>
                <div style={{ position: 'relative', width: 60, height: 60 }}>
                  <svg width="60" height="60" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#eee" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={healthScore > 70 ? "#0ab39c" : "#f7b84b"} strokeWidth="3" strokeDasharray={`${healthScore}, 100`} />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontWeight: 800, fontSize: 14 }}>{healthScore}%</div>
                </div>
              </div>
              <button
                className="btn btn-link p-0 text-muted"
                onClick={() => setShowHealthScoreModal(true)}
                style={{ fontSize: 16, lineHeight: 1 }}
                title="Comment est calculé ce score ?"
              >
                <i className="ri-question-circle-line"></i>
              </button>
              <div>
               
                <p className="text-muted mb-0 fs-14 fw-medium">
                  <i className="ri-map-pin-2-line me-1"></i> Visualisation multi-sites pour {(() => {
                    const p = projects.find(proj => (proj.id || proj.project_id) === projectId);
                    if (!p) return "Projet Actif";
                    return p.namespace 
                      ? `${p.namespace.split('/').slice(-1)[0]} / ${p.name}` 
                      : p.name;
                  })()}
                </p>
              </div>
            </div>
          </div>
          <div className="col-lg-5 mt-3 mt-lg-0 text-lg-end">
            <div className="d-inline-flex align-items-center gap-3 bg-white p-2 rounded-4 shadow-sm border px-3">
              <div className="position-relative">
                <button
                  className="btn btn-primary btn-sm rounded-3 px-3 fw-bold d-flex align-items-center gap-2 shadow-sm"
                  onClick={() => setShowExportMenu(v => !v)}
                  disabled={!filteredTrends.length}
                >
                  <i className="ri-download-2-line"></i> Export
                  <i className={`ri-arrow-${showExportMenu ? 'up' : 'down'}-s-line`}></i>
                </button>
                {showExportMenu && (
                  <div
                    className="position-absolute end-0 mt-1 bg-white border shadow-lg rounded-3 py-1 z-3"
                    style={{ minWidth: 160, zIndex: 9999 }}
                  >
                    <button
                      className="btn btn-sm btn-white w-100 text-start px-3 py-2 d-flex align-items-center gap-2 text-dark fw-semibold fs-13"
                      onClick={handleExportCSV}
                    >
                      <i className="ri-file-excel-2-line text-success"></i> Export CSV
                    </button>
                    <button
                      className="btn btn-sm btn-white w-100 text-start px-3 py-2 d-flex align-items-center gap-2 text-dark fw-semibold fs-13"
                      onClick={handleExportJSON}
                    >
                      <i className="ri-braces-line text-primary"></i> Export JSON
                    </button>
                    <hr className="my-1" />
                    <button
                      className="btn btn-sm btn-white w-100 text-start px-3 py-2 d-flex align-items-center gap-2 text-dark fw-semibold fs-13"
                      onClick={handleExportPDF}
                      disabled={pdfLoading}
                    >
                      {pdfLoading
                        ? <><i className="ri-loader-4-line text-danger"></i> Génération...</>
                        : <><i className="ri-file-pdf-2-line text-danger"></i> Export PDF Rapport</>
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {pageError && (
          <div className="alert alert-warning mb-4 border-0 shadow-sm d-flex align-items-center gap-3" style={{ borderRadius: 12, background: "#fffbeb" }}>
            <i className="ri-error-warning-fill text-warning fs-4"></i>
            <div className="fw-medium text-warning">{pageError}</div>
          </div>
        )}

        {/* Executive Summary */}
        {loading ? (
          <SkeletonCard height={100} />
        ) : executiveSummary && (
          <div className="card border-0 shadow-sm mb-4 bg-primary text-white" style={{ borderRadius: 16, background: BRAND_COLORS.surfaceLight }}>
            <div className="card-body d-flex gap-4 p-4 align-items-center">
              <div className="bg-white bg-opacity-25 rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 56, height: 56 }}>
                <i className="ri-robot-2-line fs-2 text-white"></i>
              </div>
              <div>
                <h6 className="fw-bold mb-2 text-white opacity-75 text-uppercase letter-spacing-1 fs-11">
                  {executiveSummary.title}
                </h6>
                <p className="mb-0 fs-15 fw-medium lh-base text-white">
                  {executiveSummary.text}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Intelligence FAB */}
        {(user?.role === 'super_admin' || user?.role === 'site_manager' || user?.role === 'team_lead' || user?.role === 'project_manager' || user?.role === 'viewer') && (
          <IntelligenceFAB
            onClick={() => {
              // ✅ Sélectionner automatiquement l'onglet selon le rôle
              if (user?.role === 'team_lead') {
                setIntelligenceView('teams');
              } else if (user?.role === 'site_manager' || user?.role === 'project_manager' || user?.role === 'viewer') {
                setIntelligenceView('sites');
              } else {
                // Super admin: garder la vue actuelle ou défaut 'sites'
                setIntelligenceView('sites');
              }
              setShowIntelligenceDrawer(true);
            }}
            hasAlerts={
              (intelligenceData?.anomalies?.length ?? 0) > 0 ||
              (intelligenceData?.trend_analysis?.alerts?.filter(a => a.severity !== 'info')?.length ?? 0) > 0 ||
              (teamIntelligenceData?.anomalies?.length ?? 0) > 0 ||
              (teamIntelligenceData?.trend_analysis?.alerts?.filter(a => a.severity !== 'info')?.length ?? 0) > 0
            }
          />
        )}

        {/* Intelligence Drawer */}
        <IntelligenceDrawer
          isOpen={showIntelligenceDrawer}
          onClose={() => setShowIntelligenceDrawer(false)}
          intelligenceView={intelligenceView}
          setIntelligenceView={setIntelligenceView}
          intelligenceData={intelligenceData}
          intelligenceLoading={intelligenceLoading}
          teamIntelligenceData={teamIntelligenceData}
          teamIntelligenceLoading={teamIntelligenceLoading}
          user={user}
          userAssignments={userAssignments}
          sites={sites}
          onEntityClick={(entity) => {
            setSelectedEntityForDetails(entity);
            setShowIntelligenceDrawer(false);
            setShowDetailsModal(true);
          }}
        />

        {/* Entity Details Modal */}
        {showDetailsModal && selectedEntityForDetails && (
          <EntityDetailsModal
            entity={selectedEntityForDetails}
            entityType={intelligenceView}
            onClose={() => {
              setShowDetailsModal(false);
              setSelectedEntityForDetails(null);
            }}
          />
        )}

        {/* Bandeau de Performance Analytique */}
        {loading ? (
          <SkeletonCard height={120} />
        ) : strategicPivotData.rows.length > 0 && (
          <div className="row mb-4">
            <div className="col-12">
              <div className="card border-0 shadow-sm overflow-hidden" style={{ borderRadius: 20, background: '#fff' }}>
                <div className="card-body p-0">
                  <div className="row g-0">
                    {(() => {
                      const cols = strategicPivotData.columns;
                      const lastCol = cols[cols.length - 1];
                      const prevCol = cols.length > 1 ? cols[cols.length - 2] : null;

                      const currentRows = strategicPivotData.rows.map(r => ({
                        name: r.entity_name,
                        val: r.cells[lastCol] ? r.cells[lastCol][activeMetricId] : null,
                        prevVal: prevCol && r.cells[prevCol] ? r.cells[prevCol][activeMetricId] : null
                      }));

                      // ✅ FIX: Filtrer les valeurs invalides (null) et les valeurs <= 0 pour la vélocité
                      const validRows = currentRows.filter(v => {
                        if (v.val == null) return false;
                        // Pour les métriques de vélocité, exclure les valeurs <= 0 (données manquantes)
                        if (activeMetricId === 'velocity' || activeMetricId === 'mr_rate_per_site' || activeMetricId === 'commit_rate_per_site') {
                          return v.val > 0;
                        }
                        return true;
                      });
                      if (validRows.length === 0) return <div className="p-4 text-center w-100 text-muted">Collecte de données en cours...</div>;

                      const sorted = [...validRows].sort((a, b) => b.val - a.val);
                      const best = sorted[0];
                      const atRisk = validRows.filter(v => getMetricHealth(activeMetricId, v.val).color === "#991b1b");
                      const avgNow = validRows.reduce((acc, curr) => acc + curr.val, 0) / validRows.length;
                      const validPrevRows = currentRows.filter(v => v.prevVal != null);
                      const avgPrev = validPrevRows.length > 0 ? validPrevRows.reduce((acc, curr) => acc + curr.prevVal, 0) / validPrevRows.length : null;

                      const deltaBest = getDeltaText(best.val, best.prevVal, activeMetricId);
                      const deltaAvg = getDeltaText(avgNow, avgPrev, activeMetricId);

                      return (
                        <>
                          <div className="col-md-4 border-end">
                            <div className="p-3 d-flex align-items-center gap-2">
                              <div className="p-2 bg-primary-subtle rounded-3 text-primary fs-4 d-flex align-items-center justify-content-center" style={{ width: 44, height: 44 }}>
                                <i className="ri-medal-2-line"></i>
                              </div>
                              <div>
                                <div className="text-muted text-uppercase fs-10 fw-bold letter-spacing-1">Top Performer</div>
                                <h5 className="mb-0 fw-800 text-primary fs-14">{best.name}</h5>
                                <small className={`fw-bold ${deltaBest.color} fs-10`}>{deltaBest.text} vs mois préc.</small>
                              </div>
                            </div>
                          </div>
                          <div className="col-md-4 border-end">
                            <div className="p-3 d-flex align-items-center gap-2">
                              <div className="p-2 bg-warning-subtle rounded-3 text-warning fs-4 d-flex align-items-center justify-content-center" style={{ width: 44, height: 44 }}>
                                <i className="ri-pulse-line"></i>
                              </div>
                              <div>
                                <div className="text-muted text-uppercase fs-10 fw-bold letter-spacing-1">Moyenne Globale</div>
                                <h5 className="mb-0 fw-800 text-dark fs-14">{fmt(avgNow)}</h5>
                                <small className={`fw-bold ${deltaAvg.color} fs-10`}>{deltaAvg.text === "→ stable" ? "→ Stable" : `${deltaAvg.text} tendance`}</small>
                              </div>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div className="p-3 d-flex align-items-center gap-2">
                              <div className="p-2 bg-danger-subtle rounded-3 text-danger fs-4 d-flex align-items-center justify-content-center" style={{ width: 44, height: 44 }}>
                                <i className="ri-alarm-warning-line"></i>
                              </div>
                              <div>
                                <div className="text-muted text-uppercase fs-10 fw-bold letter-spacing-1">Sites en Alerte</div>
                                <h5 className="mb-0 fw-800 text-danger fs-14">{atRisk.length}</h5>
                                <small className="text-muted fw-medium fs-10">{atRisk.length > 0 ? atRisk.map(s => s.name).join(', ') : 'Aucun site critique'}</small>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="row g-4">

          {/* Sidebar Filters */}
          <div className="col-lg-3">
            <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 14 }}>
              <div className="card-header bg-white border-bottom-0 pt-4 px-4">
                <h6 className="card-title mb-0 fw-bold text-uppercase" style={{ fontSize: 10, letterSpacing: ".1em", color: "#9ca3af" }}>Métriques</h6>
              </div>
              <div className="card-body px-3 pb-4">
                <div className="d-flex flex-column gap-1">
                  {METRICS_OPTIONS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setActiveMetricId(m.id)}
                      className={`btn d-flex align-items-center gap-3 p-2 text-start border-0 transition-all ${activeMetricId === m.id ? 'bg-primary text-white shadow-lg' : 'bg-transparent text-dark hover-bg-light'}`}
                      style={{ borderRadius: 10, transition: "all 0.2s" }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: activeMetricId === m.id ? "rgba(255,255,255,0.2)" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: '1.1rem' }}>
                        <i className={m.icon} style={{ color: activeMetricId === m.id ? "#fff" : m.color }}></i>
                      </div>
                      <span className="fw-semibold fs-13">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ✅ Filtre de Période */}
            <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 14 }}>
              <div className="card-header bg-white border-bottom-0 pt-4 px-4">
                <div className="d-flex align-items-center justify-content-between">
                  <h6 className="card-title mb-0 fw-bold text-uppercase" style={{ fontSize: 10, letterSpacing: ".1em", color: "#9ca3af" }}>
                    <i className="ri-calendar-line me-1"></i> Périodes
                  </h6>
                  <button
                    className="btn btn-link p-0 text-primary fs-10 fw-bold"
                    onClick={() => {
                      setSelectedPeriods(availablePeriods);
                      setShowPeriodFilter(false);
                    }}
                    style={{ fontSize: 10 }}
                  >
                    Réinitialiser
                  </button>
                </div>
              </div>
              <div className="card-body px-3 pb-4">
                {availablePeriods.length > 0 ? (
                  <>
                    <div className="d-flex flex-column gap-1.5 mb-3">
                      {availablePeriods.map((period, idx) => {
                        const isSelected = selectedPeriods.includes(period);
                        return (
                          <div
                            key={period}
                            className="d-flex align-items-center justify-content-between py-1.5 px-2 rounded-2 cursor-pointer transition-all"
                            style={{
                              background: isSelected ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                              border: isSelected ? '1px solid rgba(79, 70, 229, 0.15)' : '1px solid transparent',
                            }}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedPeriods(selectedPeriods.filter(p => p !== period));
                              } else {
                                setSelectedPeriods([...selectedPeriods, period]);
                              }
                            }}
                          >
                            <div className="d-flex align-items-center gap-2">
                              <div style={{ 
                                width: 6, 
                                height: 6, 
                                borderRadius: "50%", 
                                background: isSelected ? BRAND_COLORS.primary : "#ced4da" 
                              }}></div>
                              <span className="fs-12 fw-medium" style={{ color: isSelected ? BRAND_COLORS.primaryDark : '#475569' }}>
                                {period}
                              </span>
                            </div>
                            <div className="form-check form-switch mb-0">
                              <input 
                                className="form-check-input" 
                                type="checkbox" 
                                checked={isSelected} 
                                style={{ cursor: 'pointer' }} 
                                readOnly 
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {selectedPeriods.length !== availablePeriods.length && (
                      <button
                        className="btn btn-primary btn-sm w-100 fw-bold rounded-3 shadow-sm"
                        onClick={() => setShowPeriodFilter(false)}
                        style={{
                          background: BRAND_COLORS.primary,
                          border: 'none',
                          fontSize: 12,
                          padding: '8px 16px',
                          transition: `all ${TRANSITION_DURATION.normal} ${EASING.smooth}`
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(79,70,229,0.2)';
                        }}
                      >
                        <i className="ri-check-line me-1"></i>
                        Appliquer ({selectedPeriods.length} période{selectedPeriods.length > 1 ? 's' : ''})
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-center py-3 border rounded-3 bg-light-subtle">
                    <i className="ri-calendar-line fs-1 text-muted opacity-25"></i>
                    <p className="fs-11 text-muted mt-2 px-2">Aucune période disponible.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="card border-0 shadow-sm" style={{ borderRadius: 14 }}>
              <div className="card-header bg-white border-bottom-0 pt-3 px-4 pb-0">
                <ul className="nav nav-tabs-custom rounded card-header-tabs border-bottom-0" role="tablist">
                  <li className="nav-item">
                    <a className={`nav-link border-0 fs-12 text-uppercase fw-bold letter-spacing-1 ${entityType === 'site' ? 'active text-primary' : 'text-muted opacity-50'} ${user?.role === 'team_lead' ? 'opacity-25' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        if (user?.role !== 'team_lead') {
                          setEntityType('site');
                          if (sites.length > 0) setSelectedEntityIds(sites.map(s => s.id || s.site_id));
                        }
                      }}
                      style={{ cursor: user?.role === 'team_lead' ? 'not-allowed' : 'pointer' }}>
                      Sites
                    </a>
                  </li>
                  <li className="nav-item">
                    <a className={`nav-link border-0 fs-12 text-uppercase fw-bold letter-spacing-1 ${entityType === 'group' ? 'active text-primary' : 'text-muted opacity-50'} ${user?.role === 'site_manager' || user?.role === 'developer' ? 'opacity-25' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        if (user?.role !== 'site_manager' && user?.role !== 'developer') {
                          setEntityType('group');
                          // Pour viewer: ne sélectionner que les groupes assignés
                          if (user?.role === 'viewer' && userAssignments.group_ids?.length > 0) {
                            const accessibleGroups = groups.filter(g => userAssignments.group_ids.includes(g.id || g.group_id));
                            setSelectedEntityIds(accessibleGroups.map(g => g.id || g.group_id));
                          } else if (groups.length > 0) {
                            setSelectedEntityIds(groups.map(g => g.id || g.group_id));
                          }
                        }
                      }}
                      style={{ cursor: user?.role === 'site_manager' || user?.role === 'developer' ? 'not-allowed' : 'pointer' }}>
                      Équipes
                    </a>
                  </li>
                </ul>
              </div>
              <div className="card-body px-4 pb-4 pt-3 mt-1">
                <div className="d-flex flex-column gap-2 mt-2">
                  {(entityType === 'site' ? sites : groups).length > 0 ? (
                    (entityType === 'site' ? sites : groups).map((ent, idx) => {
                      const entId = ent.id || ent.site_id;
                      const isSelected = selectedEntityIds.includes(entId);
                      return (
                        <div
                          key={entId}
                          className="d-flex align-items-center justify-content-between py-2 border-bottom border-light cursor-pointer"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedEntityIds(selectedEntityIds.filter(id => id !== entId));
                            } else {
                              setSelectedEntityIds([...selectedEntityIds, entId]);
                            }
                          }}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isSelected ? CHART_COLORS[idx % CHART_COLORS.length] : "#ced4da" }}></div>
                            <span className="fs-13 fw-semibold text-dark">{ent.name || ent.site_name}</span>
                          </div>
                          <div className="form-check form-switch mb-0">
                            <input className="form-check-input" type="checkbox" checked={isSelected} style={{ cursor: 'pointer' }} readOnly />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4 border rounded-3 bg-light-subtle">
                      <i className={entityType === 'site' ? "ri-building-line fs-1 text-muted opacity-25" : "ri-team-line fs-1 text-muted opacity-25"}></i>
                      <p className="fs-12 text-muted mt-2 px-2">Aucune donnée trouvée.</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-3 border-top">
                  <p className="text-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
                    <i className="ri-information-line me-1"></i>
                    Sélectionnez plusieurs sites pour comparer leurs performances relatives au fil des mois.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="col-lg-9">

            {/* Matrice Stratégique */}
            {loading ? (
              <SkeletonCard height={400} />
            ) : (
              <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 16, overflow: "hidden" }}>
                <div className="card-header bg-white border-0 p-4 d-flex align-items-center justify-content-between">
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <div className="bg-primary-subtle p-1 rounded">
                        <i className={`${activeMetric.icon} text-primary fs-5`}></i>
                      </div>
                      <h5 className="mb-0 fw-bold">Performance Matrix — {activeMetric.label}</h5>
                      <button
                        className="btn btn-link p-0 ms-2"
                        onClick={() => setShowMatrixHelpModal(true)}
                        title="Comprendre la matrice"
                      >
                        <i className="ri-question-line text-muted fs-5"></i>
                      </button>
                    </div>
                    <p className="text-muted mb-0 fs-12">Comparaison matricielle · Formatage conditionnel par seuils métier</p>
                  </div>
                  <div className="d-flex align-items-center gap-3">
                    <div className="d-inline-flex align-items-center gap-2 bg-white p-2 rounded-4 shadow-sm border px-3">
                      <div className="text-start me-2 border-end pe-3">
                        <div className="text-muted fs-10 fw-bold text-uppercase">Extraction</div>
                      </div>
                      <select
                        className="form-select form-select-sm border-0 fw-bold text-primary fs-12"
                        style={{ minWidth: 180, boxShadow: 'none', cursor: 'pointer', background: 'transparent' }}
                        value={projectId}
                        onChange={handleProjectChange}
                      >
                        {projects.map(p => {
                          const displayName = p.namespace 
                            ? `${p.namespace.split('/').slice(-1)[0]} / ${p.name}` 
                            : p.name;
                          return (
                            <option key={p.id || p.project_id} value={p.id || p.project_id}>
                              {displayName}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    
                    <span className="d-flex align-items-center gap-2 px-3 py-2 rounded-3 fw-bold" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: 12 }}>
                      <i className="ri-calendar-2-line" style={{ color: '#4f46e5', fontSize: 14 }}></i>
                      {strategicPivotData.columns.length} Périodes
                    </span>
                  </div>
                </div>
                <div className="card-body p-0">
                  <div className="table-responsive">
                    <table className="table table-borderless align-middle mb-0">
                      <thead className="bg-light">
                        <tr>
                          <th className="ps-4 py-3" style={{ width: 220, fontSize: 11, textTransform: "uppercase", color: "#9ca3af", letterSpacing: '.05em' }}>Site / Équipe</th>
                          {strategicPivotData.columns.map(col => (
                            <th key={col} className="text-center py-3" style={{ fontSize: 11, textTransform: "uppercase", color: "#9ca3af", letterSpacing: '.05em' }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {strategicPivotData.rows.length > 0 ? (
                          strategicPivotData.rows.map((row, idx) => {
                            const cols = strategicPivotData.columns;
                            const lastCol = cols[cols.length - 1];

                            return (
                              <tr key={idx} className="border-bottom border-light">
                                <td className="ps-4">
                                  <div className="d-flex flex-column">
                                    <span className="fw-bold text-dark fs-14">{row.entity_name}</span>
                                    <span className="text-muted fs-10 text-uppercase ls-1">Site / Équipe</span>
                                  </div>
                                </td>
                                {cols.map((col, colIdx) => {
                                  const metrics = row.cells[col];
                                  const val = metrics ? metrics[activeMetricId] : null;
                                  const currentDevCount = metrics?.nb_developers || 0;
                                  const prevCol = colIdx > 0 ? cols[colIdx - 1] : null;
                                  const prevVal = prevCol && row.cells[prevCol] ? row.cells[prevCol][activeMetricId] : null;
                                  const health = getMetricHealth(activeMetricId, val);
                                  const delta = getDeltaText(val, prevVal, activeMetricId);

                                  return (
                                    <td key={col} className="text-center py-3">
                                      <div
                                        className="d-inline-flex flex-column align-items-center justify-content-center px-3 py-2 position-relative"
                                        style={{
                                          background: health.bg,
                                          color: health.color,
                                          borderRadius: 10,
                                          minWidth: 100,
                                          border: `1.5px solid ${health.border}`,
                                          transition: "all 0.2s",
                                          boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
                                        }}
                                      >
                                        {/* Valeur principale */}
                                        <span className="fw-800 fs-14" style={{ lineHeight: 1.2 }}>
                                          {val != null ? ((activeMetricId === 'quality_score' || activeMetricId === 'merged_rate') ? ((val <= 1 ? val * 100 : val).toFixed(0) + '%') : val.toFixed(1)) : "—"}
                                        </span>
                                        
                                        {/* Delta et devs sur une ligne */}
                                        <div className="d-flex align-items-center gap-2 mt-1">
                                          <small className={`fw-bold ${delta.color}`} style={{ fontSize: 8, opacity: 0.85 }}>
                                            {val != null ? delta.text : "—"}
                                          </small>
                                          {currentDevCount > 0 && (
                                            <span className="d-flex align-items-center gap-1" style={{ opacity: 0.6 }}>
                                              <i className="ri-user-3-line" style={{ fontSize: 8 }}></i>
                                              <span style={{ fontSize: 8, fontWeight: 700 }}>{currentDevCount}</span>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={strategicPivotData.columns.length + 1} className="text-center py-5 text-muted">
                              Sélectionnez au moins un site dans le panneau latéral.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="card-footer bg-white border-0 py-3 px-4 d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-4">
                    <div className="d-flex align-items-center gap-2">
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: "#d1fae5", border: "1.5px solid #10b981" }}></div>
                      <small className="text-muted fs-11 fw-bold">Objectif Atteint</small>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: "#fef3c7", border: "1.5px solid #f59e0b" }}></div>
                      <small className="text-muted fs-11 fw-bold">À Surveiller</small>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: "#fee2e2", border: "1.5px solid #ef4444" }}></div>
                      <small className="text-muted fs-11 fw-bold">Action Requise</small>
                    </div>
                  </div>
                  <small className="text-muted fs-11 fw-medium d-flex align-items-center gap-1">
                    <i className="ri-lightbulb-flash-line text-warning"></i>
                    Les deltas (↑↓) sont comparés à la période précédente du même site.
                  </small>
                </div>
              </div>
            )}

            {/* Main Chart Card */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-header bg-white border-0 p-4 d-flex align-items-center justify-content-between">
                <div>
                  <h5 className="mb-0 fw-bold">{activeMetric.label}</h5>
                  <p className="text-muted mb-0 fs-12">Évolution historique par entité sélectionnée</p>
                </div>

              </div>
              <div className="card-body p-4 pt-0">
                {trends.length > 0 ? (
                  <div id="kpi-evolution-chart">
                    <ReactApexChart
                      options={chartOptions}
                      series={chartData.series}
                      type="area"
                      height={380}
                    />
                  </div>
                ) : (
                  <EmptyState
                    variant="kpi"
                    title="Données historiques manquantes"
                    description="Aucun snapshot archivé trouvé."
                  />
                )}
              </div>
            </div>

            <div className="card border-0 shadow-sm overflow-hidden mb-4" style={{ borderRadius: 16 }}>
              <div
                className="card-header bg-white border-0 p-4 d-flex align-items-center justify-content-between cursor-pointer"
                onClick={() => setShowDetailedAudit(!showDetailedAudit)}
                style={{ cursor: 'pointer' }}
              >
                <div className="d-flex align-items-center gap-3">
                  <div className="p-2 bg-primary-subtle rounded-3" style={{ width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ri-table-alt-line text-primary fs-5"></i>
                  </div>
                  <div>
                    <h6 className="mb-0 fw-bold">Données Détaillées par Période</h6>
                    <p className="text-muted mb-0 fs-11 fw-medium uppercase letter-spacing-1">
                      {showDetailedAudit ? "Masquer les données détaillées" : "Voir les chiffres détaillés mois par mois"}
                    </p>
                  </div>
                </div>
                <button className={`btn btn-sm ${showDetailedAudit ? 'btn-light' : 'btn-primary-subtle'} rounded-pill px-3 fw-bold border-0`}>
                  <i className={`${showDetailedAudit ? 'ri-eye-off-line' : 'ri-eye-line'} me-1`}></i>
                  {showDetailedAudit ? "Masquer" : "Voir Détails"}
                </button>
              </div>

              {showDetailedAudit && (
                <div className="card-body p-0 border-top animate__animated animate__fadeIn">
                  <div className="p-3 bg-light-subtle border-bottom">
                    <p className="text-muted mb-0 fs-12">
                      <i className="ri-information-line me-1"></i>
                      Ce tableau montre les chiffres bruts pour chaque site/équipe et chaque mois. Utilisez-le pour analyser l'évolution dans le temps.
                    </p>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ fontFamily: "var(--sb-sans)" }}>
                      <thead>
                        <tr className="bg-light-subtle">
                          <th className="ps-4 py-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280", fontWeight: 700 }}>Site / Équipe</th>
                          <th className="py-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280", fontWeight: 700 }}>Mois</th>
                          <th className="text-center py-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280", fontWeight: 700 }}>Commits</th>
                          <th className="text-center py-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280", fontWeight: 700 }}>MRs</th>
                          <th className="text-center py-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280", fontWeight: 700 }}>Vélocité</th>
                          <th className="text-center py-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280", fontWeight: 700 }}>Approbation</th>
                          <th className="text-center py-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280", fontWeight: 700 }}>Fusion</th>
                          <th className="text-center pe-4 py-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280", fontWeight: 700 }}>Revue (h)</th>
                        </tr>
                      </thead>
                      <tbody className="border-top-0">
                        {filteredTrends.slice().reverse().map((t, idx) => (
                          <tr key={idx} style={{ transition: "all 0.1s" }}>
                            <td className="ps-4">
                              <span className="fw-bold fs-13 text-dark">{t.entity_name}</span>
                            </td>
                            <td>
                              <span className="text-muted fs-12 fw-medium">{t.period_label}</span>
                            </td>
                            <td className="text-center fw-800 fs-13" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.metrics.total_commits}</td>
                            <td className="text-center fw-800 fs-13" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.metrics.total_mrs}</td>
                            <td className="text-center">
                              <span className="badge border-0 bg-primary-subtle text-primary px-2 py-1 fs-12 fw-800" style={{ borderRadius: 6 }}>
                                {fmt(t.metrics.velocity)}
                              </span>
                            </td>
                            <td className="text-center">
                              <div className="d-flex align-items-center justify-content-center gap-3">
                                <div className="progress flex-grow-1" style={{ height: 6, width: 70, background: "#f1f5f9", borderRadius: 10, overflow: "hidden" }}>
                                  <div className="progress-bar bg-success" style={{ width: `${Math.min(100, (t.metrics.quality_score || 0) * 100)}%`, borderRadius: 10 }}></div>
                                </div>
                                <span className="fs-12 fw-800 text-success" style={{ minWidth: 35 }}>{fmt((t.metrics.quality_score || 0) * 100, 0)}%</span>
                              </div>
                            </td>
                            <td className="text-center">
                              <div className="d-flex align-items-center justify-content-center gap-3">
                                <div className="progress flex-grow-1" style={{ height: 6, width: 70, background: "#f1f5f9", borderRadius: 10, overflow: "hidden" }}>
                                  <div className="progress-bar bg-info" style={{ width: `${Math.min(100, (t.metrics.merged_rate || 0) * 100)}%`, borderRadius: 10 }}></div>
                                </div>
                                <span className="fs-12 fw-800 text-info" style={{ minWidth: 35 }}>{fmt((t.metrics.merged_rate || 0) * 100, 0)}%</span>
                              </div>
                            </td>
                            <td className="text-center pe-4">
                              <span className="text-muted fs-12 fw-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(t.metrics.review_time)}h</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Container hors-écran pour les graphiques du PDF */}
            <div style={{ position: 'absolute', left: '-9999px', top: '0', width: '800px', zIndex: -1000, pointerEvents: 'none' }}>
              <div id="pdf-chart-velocity" style={{ background: '#ffffff', padding: '15px', borderRadius: '10px' }}>
                <h5 style={{ margin: '0 0 10px 0', fontFamily: CHART_FONT, fontWeight: 700, color: '#0f172a' }}>Velocite (Commits/Dev)</h5>
                {filteredTrends.length > 0 && (
                  <ReactApexChart
                    options={getChartOptionsForMetric('velocity', chartData.categories)}
                    series={getChartDataForMetric('velocity').series}
                    type="area"
                    height={320}
                  />
                )}
              </div>
              <div id="pdf-chart-mr_rate" style={{ background: '#ffffff', padding: '15px', borderRadius: '10px', marginTop: '20px' }}>
                <h5 style={{ margin: '0 0 10px 0', fontFamily: CHART_FONT, fontWeight: 700, color: '#0f172a' }}>Livraison (MRs/Dev)</h5>
                {filteredTrends.length > 0 && (
                  <ReactApexChart
                    options={getChartOptionsForMetric('mr_rate', chartData.categories)}
                    series={getChartDataForMetric('mr_rate').series}
                    type="area"
                    height={320}
                  />
                )}
              </div>
              <div id="pdf-chart-quality_score" style={{ background: '#ffffff', padding: '15px', borderRadius: '10px', marginTop: '20px' }}>
                <h5 style={{ margin: '0 0 10px 0', fontFamily: CHART_FONT, fontWeight: 700, color: '#0f172a' }}>Taux d'Approbation (%)</h5>
                {filteredTrends.length > 0 && (
                  <ReactApexChart
                    options={getChartOptionsForMetric('quality_score', chartData.categories)}
                    series={getChartDataForMetric('quality_score').series}
                    type="area"
                    height={320}
                  />
                )}
              </div>
              <div id="pdf-chart-merged_rate" style={{ background: '#ffffff', padding: '15px', borderRadius: '10px', marginTop: '20px' }}>
                <h5 style={{ margin: '0 0 10px 0', fontFamily: CHART_FONT, fontWeight: 700, color: '#0f172a' }}>Taux de Fusion (%)</h5>
                {filteredTrends.length > 0 && (
                  <ReactApexChart
                    options={getChartOptionsForMetric('merged_rate', chartData.categories)}
                    series={getChartDataForMetric('merged_rate').series}
                    type="area"
                    height={320}
                  />
                )}
              </div>
              <div id="pdf-chart-review_time" style={{ background: '#ffffff', padding: '15px', borderRadius: '10px', marginTop: '20px' }}>
                <h5 style={{ margin: '0 0 10px 0', fontFamily: CHART_FONT, fontWeight: 700, color: '#0f172a' }}>Temps de Revue Moyen (h)</h5>
                {filteredTrends.length > 0 && (
                  <ReactApexChart
                    options={getChartOptionsForMetric('review_time', chartData.categories)}
                    series={getChartDataForMetric('review_time').series}
                    type="area"
                    height={320}
                  />
                )}
              </div>
             
            </div>

          </div>
        </div>
      </div>

      {/* Modal explicatif Performance Matrix */}
      {showMatrixHelpModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 pb-3">
                <h5 className="modal-title fw-bold">
                  <i className="ri-information-line text-primary me-2"></i>
                  Comprendre la Performance Matrix
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowMatrixHelpModal(false)}></button>
              </div>
              <div className="modal-body">
                <p className="text-muted mb-4">La matrice utilise un formatage conditionnel basé sur des seuils métier pour identifier rapidement les performances.</p>
                
                <h6 className="fw-bold mb-3">Légende des couleurs</h6>
                <div className="d-flex flex-column gap-3 mb-4">
                  <div className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ background: '#ecfdf5', border: '1px solid #10b981' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: '#047857' }}></div>
                    <div>
                      <div className="fw-bold text-success">Objectif Atteint</div>
                      <small className="text-muted">Performance excellente selon les seuils</small>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ background: '#fffbeb', border: '1px solid #f59e0b' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: '#b45309' }}></div>
                    <div>
                      <div className="fw-bold text-warning">À Surveiller</div>
                      <small className="text-muted">Performance dans la moyenne</small>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ background: '#fef2f2', border: '1px solid #ef4444' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: '#b91c1c' }}></div>
                    <div>
                      <div className="fw-bold text-danger">Action Requise</div>
                      <small className="text-muted">Performance critique, intervention nécessaire</small>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: '#64748b' }}></div>
                    <div>
                      <div className="fw-bold text-secondary">N/A</div>
                      <small className="text-muted">Pas de données ou pas d'activité</small>
                    </div>
                  </div>
                </div>

                <h6 className="fw-bold mb-3">Seuils métier par métrique</h6>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Métrique</th>
                        <th>Objectif Atteint</th>
                        <th>À Surveiller</th>
                        <th>Action Requise</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Vélocité (Commits/Dev)</td>
                        <td className="text-success">≥ 5.0</td>
                        <td className="text-warning">3.0 - 5.0</td>
                        <td className="text-danger">&lt; 3.0</td>
                      </tr>
                      <tr>
                        <td>MRs/Dev</td>
                        <td className="text-success">≥ 2.0</td>
                        <td className="text-warning">1.0 - 2.0</td>
                        <td className="text-danger">&lt; 1.0</td>
                      </tr>
                      <tr>
                        <td>Taux d'Approbation (%)</td>
                        <td className="text-success">≥ 90%</td>
                        <td className="text-warning">70% - 90%</td>
                        <td className="text-danger">&lt; 70%</td>
                      </tr>
                      <tr>
                        <td>Taux de Fusion (%)</td>
                        <td className="text-success">≥ 90%</td>
                        <td className="text-warning">70% - 90%</td>
                        <td className="text-danger">&lt; 70%</td>
                      </tr>
                      <tr>
                        <td>Temps de Revue (h)</td>
                        <td className="text-success">≤ 24h</td>
                        <td className="text-warning">24h - 48h</td>
                        <td className="text-danger">&gt; 48h</td>
                      </tr>
                      <tr>
                        <td>Commits Moyens</td>
                        <td className="text-success">≤ 3.0</td>
                        <td className="text-warning">3.0 - 6.0</td>
                        <td className="text-danger">&gt; 6.0</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-primary" onClick={() => setShowMatrixHelpModal(false)}>
                  Compris
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal explicatif Score de Santé */}
      {showHealthScoreModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 pb-3">
                <h5 className="modal-title fw-bold">
                  <i className="ri-heart-pulse-line text-primary me-2"></i>
                  Comment est calculé le Score de Santé ?
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowHealthScoreModal(false)}></button>
              </div>
              <div className="modal-body">
                <p className="text-muted mb-4">Le score de santé est calculé à partir de la dernière période de vos données filtrées. C'est une moyenne pondérée de 3 métriques clés.</p>
                
                <h6 className="fw-bold mb-3">Formule de calcul</h6>
                <div className="alert alert-light border mb-4" style={{ background: '#f8fafc', borderRadius: 12 }}>
                  <code className="fs-13">
                    Score = (Vélocité × 40%) + (Qualité × 40%) + (Revue × 20%)
                  </code>
                </div>

                <h6 className="fw-bold mb-3">Les 3 composants</h6>
                <div className="mb-4">
                  <div className="d-flex align-items-center gap-3 mb-3 p-3 rounded-3" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                    <div className="fw-bold text-success" style={{ minWidth: 120 }}>Vélocité (40%)</div>
                    <div className="text-muted fs-13">Commits/dev (excellent ≥5.0, critique &lt;3.0)</div>
                  </div>
                  <div className="d-flex align-items-center gap-3 mb-3 p-3 rounded-3" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                    <div className="fw-bold text-primary" style={{ minWidth: 120 }}>Qualité (40%)</div>
                    <div className="text-muted fs-13">Taux approbation % (excellent ≥90%, critique &lt;70%)</div>
                  </div>
                  <div className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                    <div className="fw-bold text-warning" style={{ minWidth: 120 }}>Revue (20%)</div>
                    <div className="text-muted fs-13">Temps revue heures (excellent ≤24h, critique &gt;48h)</div>
                  </div>
                </div>

                <h6 className="fw-bold mb-3">Exemple de calcul</h6>
                <div className="table-responsive mb-3">
                  <table className="table table-sm table-bordered" style={{ fontSize: 13 }}>
                    <thead className="bg-light">
                      <tr>
                        <th>Métrique</th>
                        <th>Valeur</th>
                        <th>Score partiel</th>
                        <th>Pondération</th>
                        <th>Contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Vélocité</td>
                        <td>3.0 C/Dev</td>
                        <td>50 pts</td>
                        <td>40%</td>
                        <td><strong>20 pts</strong></td>
                      </tr>
                      <tr>
                        <td>Qualité</td>
                        <td>85%</td>
                        <td>85 pts</td>
                        <td>40%</td>
                        <td><strong>34 pts</strong></td>
                      </tr>
                      <tr>
                        <td>Revue</td>
                        <td>24h</td>
                        <td>67 pts</td>
                        <td>20%</td>
                        <td><strong>13 pts</strong></td>
                      </tr>
                      <tr className="bg-primary-subtle fw-bold">
                        <td colSpan="4">Score Final</td>
                        <td>67%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="alert alert-info fs-12 mb-0" style={{ borderRadius: 12 }}>
                  <i className="ri-information-line me-1"></i>
                  <strong>Note :</strong> Ce score est calculé sur la dernière période visible dans vos données filtrées. Utilisez le filtre de période pour analyser l'évolution du score dans le temps.
                </div>
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-primary" onClick={() => setShowHealthScoreModal(false)}>
                  Compris
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}