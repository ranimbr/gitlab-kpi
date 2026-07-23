/**
 * metricsThresholds.js - Seuils métier partagés pour les KPIs
 * 
 * Ce fichier centralise les seuils utilisés dans toute l'application
 * pour assurer la cohérence entre les différents composants.
 * 
 * Utilisé par :
 * - ComparativeAnalyticsPage.jsx (matrice de performance, santé)
 * - IntelligenceCard.jsx (cartes d'intelligence)
 */

// ─── Seuils par métrique ─────────────────────────────────────────────────────
export const METRIC_THRESHOLDS = {
  velocity: {
    low: 3.0,
    high: 5.0,
    reverse: false,
    label: "Vélocité",
    unit: "commits/dev",
    description: "Commits par développeur"
  },
  mr_rate: {
    low: 1.0,
    high: 2.0,
    reverse: false,
    label: "Livraison",
    unit: "MRs/dev",
    description: "Merge Requests par développeur"
  },
  quality_score: {
    low: 70,
    high: 90,
    reverse: false,
    label: "Qualité",
    unit: "%",
    description: "Taux d'approbation des MRs"
  },
  merged_rate: {
    low: 70,
    high: 90,
    reverse: false,
    label: "Fusion",
    unit: "%",
    description: "Taux de fusion des MRs"
  },
  review_time: {
    low: 24.0,
    high: 48.0,
    reverse: true,
    label: "Revue",
    unit: "heures",
    description: "Temps moyen de revue de code"
  },
  avg_commits: {
    low: 3.0,
    high: 6.0,
    reverse: true,
    label: "Commits",
    unit: "commits",
    description: "Commits moyens par période"
  }
};

// ─── Seuils du Score de Santé Global ───────────────────────────────────────────
export const HEALTH_SCORE_THRESHOLDS = {
  excellent: 70,
  warning: 40,
  critical: 0
};

// ─── Fonction utilitaire pour obtenir le statut de santé ────────────────────────
export const getHealthScoreStatus = (score) => {
  if (score >= HEALTH_SCORE_THRESHOLDS.excellent) {
    return {
      color: "#10b981",
      bg: "rgba(16, 185, 129, 0.15)",
      text: "Excellent",
      icon: "ri-heart-pulse-line"
    };
  }
  if (score >= HEALTH_SCORE_THRESHOLDS.warning) {
    return {
      color: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.15)",
      text: "Surveillance",
      icon: "ri-alert-line"
    };
  }
  return {
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.15)",
    text: "Critique",
    icon: "ri-error-warning-line"
  };
};

// ─── Fonction utilitaire pour évaluer une métrique ────────────────────────────────
export const getMetricStatus = (metricId, value) => {
  if (value == null) {
    return { 
      color: "#64748b", 
      bg: "#f1f5f9", 
      border: "#cbd5e1", 
      label: "N/A", 
      icon: "ri-question-line" 
    };
  }

  const threshold = METRIC_THRESHOLDS[metricId];
  if (!threshold) {
    return { 
      color: "#64748b", 
      bg: "#f1f5f9", 
      border: "#cbd5e1", 
      label: "N/A", 
      icon: "ri-question-line" 
    };
  }

  // Gestion des valeurs en pourcentage (0-1 vs 0-100)
  let checkVal = value;
  if ((metricId === 'quality_score' || metricId === 'merged_rate') && value <= 1.0) {
    checkVal = value * 100;
  }

  let status = "medium";
  if (threshold.reverse) {
    // Pour les métriques où plus bas = mieux (ex: review_time)
    if (checkVal <= threshold.low) status = "good";
    else if (checkVal >= threshold.high) status = "bad";
  } else {
    // Pour les métriques où plus haut = mieux (ex: velocity)
    if (checkVal >= threshold.high) status = "good";
    else if (checkVal <= threshold.low) status = "bad";
  }

  const statusConfig = {
    good: { color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "#10b981", label: "Excellent", icon: "ri-check-line" },
    medium: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "#f59e0b", label: "Moyen", icon: "ri-line-line" },
    bad: { color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "#ef4444", label: "Critique", icon: "ri-error-warning-line" }
  };

  return statusConfig[status];
};
