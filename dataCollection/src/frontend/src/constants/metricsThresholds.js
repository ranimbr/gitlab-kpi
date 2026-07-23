/**
 * metricsThresholds.js - Seuils métier partagés pour les KPIs
 * 
 * Ce fichier centralise les seuils utilisés dans toute l'application
 * pour assurer la cohérence entre les différents composants.
 * 
 * Utilisé par :
 * - ComparativeAnalyticsPage.jsx (matrice de performance, santé)
 * - IntelligenceCard.jsx (cartes d'intelligence)
 * - Backend TrendAnalyzer (analyse d'intelligence)
 */

// ─── Seuils par métrique (Option 1 : seuils Frontend plus stricts) ─────────
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

// ─── Formule unifiée du Score de Santé (Option 1 : formule Frontend) ───────────
export const HEALTH_SCORE_FORMULA = {
  // Pondération des composants
  velocity_weight: 0.4,  // 40%
  quality_weight: 0.4,   // 40%
  review_weight: 0.2,    // 20%
  
  // Seuils de calcul (pour normaliser à 0-100)
  velocity_max: 6.0,      // 6.0 commits/dev = 100%
  review_max: 72.0,       // 72 heures = 0%
  
  // Description
  description: "Score = (Vélocité × 40%) + (Qualité × 40%) + (Revue × 20%)"
};

// ─── Fonction unifiée de calcul du score de santé ───────────────────────────────
export const calculateHealthScore = (velocity, quality, review_time) => {
  /**
   * Calcule le score de santé 0-100 selon la formule unifiée.
   * 
   * Formule : (Vélocité × 40%) + (Qualité × 40%) + (Revue × 20%)
   * 
   * Args:
   *   velocity: Commits par développeur
   *   quality: Taux d'approbation (0-1)
   *   review_time: Temps de revue en heures
   * 
   * Returns:
   *   Score de santé 0-100
   */
  // Normaliser la qualité si elle est en 0-1
  const normalizedQuality = quality <= 1.0 ? quality * 100 : quality;
  
  // Score de vélocité (40% du total)
  const vScore = Math.min(100, (velocity / HEALTH_SCORE_FORMULA.velocity_max) * 100);
  
  // Score de qualité (40% du total)
  const qScore = normalizedQuality;
  
  // Score de revue (20% du total)
  const rScore = Math.max(0, 100 - (review_time / HEALTH_SCORE_FORMULA.review_max) * 100);
  
  // Score final (moyenne pondérée)
  const finalScore = (vScore * HEALTH_SCORE_FORMULA.velocity_weight) + 
                      (qScore * HEALTH_SCORE_FORMULA.quality_weight) + 
                      (rScore * HEALTH_SCORE_FORMULA.review_weight);
  
  return Math.round(finalScore);
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
