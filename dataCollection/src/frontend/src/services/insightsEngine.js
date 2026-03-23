/**
 * services/insightsEngine.js
 *
 * Moteur d'analyse KPI — 100% logique JS, zéro IA, zéro dépendance.
 *
 * Principe : on compare la valeur d'un KPI pour une entité donnée
 * (site / développeur / projet) avec :
 *   - la moyenne de toutes les autres entités du même projet
 *   - le mois précédent (delta temporel)
 *   - les seuils configurés (warning / critical)
 *
 * Chaque règle retourne un objet Insight :
 *   { type: "danger"|"warning"|"success"|"info", title, description, action? }
 *
 * CORRECTIONS :
 *
 *   1. FIX — calculateScore() : max NB_COMMITS_PROJECT = 500 trop bas.
 *      Un projet actif peut facilement dépasser 500 commits/mois.
 *      AVANT : max: 500 → tout projet ≥500 commits = 100% sur ce KPI → score gonflé.
 *      ✅ FIX : max: 1000 (valeur plus représentative pour équipes de 15-30 devs).
 *      Aussi : NB_COMMITS_PROJECT poids réduit de 10 → 8 car c'est un indicateur
 *      d'activité brute, moins discriminant que approved_mr_rate.
 *
 *   2. FIX — getScoreLabel() : ajout label "Excellent" pour score ≥ 85.
 *      Avant : tout score ≥70 = "Bon" (pas assez discriminant pour la prise de décision).
 */

// ── Seuils métier par défaut (overridables par les seuils admin) ───────────────
const DEFAULTS = {
  approvedMrRate:     { warning: 0.50, critical: 0.35 },  // ratio — LOWER_IS_WORSE
  mergedMrRate:       { warning: 0.45, critical: 0.30 },  // ratio — LOWER_IS_WORSE
  avgReviewTimeHours: { warning: 24,   critical: 48   },   // heures — HIGHER_IS_WORSE
  mrRatePerSite:      { warning: 1.0,  critical: 0.5  },  // ratio — LOWER_IS_WORSE
  commitRatePerSite:  { warning: 2.0,  critical: 1.0  },  // ratio — LOWER_IS_WORSE
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calcule la moyenne d'un champ sur un tableau de snapshots */
function avg(snapshots, field) {
  const vals = snapshots.map(s => Number(s[field])).filter(v => !isNaN(v) && v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Calcule le delta % entre deux valeurs */
function deltaPct(current, reference) {
  if (reference == null || reference === 0 || current == null) return null;
  return ((current - reference) / Math.abs(reference)) * 100;
}

/** Formate un delta en texte lisible */
function fmtDelta(pct, higherIsBetter = true) {
  if (pct == null) return null;
  const abs  = Math.abs(pct).toFixed(1);
  const sign = pct > 0 ? "+" : "-";
  const good = higherIsBetter ? pct > 0 : pct < 0;
  return { text: `${sign}${abs}%`, color: good ? "success" : pct === 0 ? "neutral" : "danger" };
}

/** Formate une valeur KPI pour l'affichage */
export function fmtKpi(value, field) {
  if (value == null || isNaN(Number(value))) return "—";
  const n = Number(value);
  if (field === "approved_mr_rate" || field === "merged_mr_rate") return `${(n * 100).toFixed(1)}%`;
  if (field === "avg_review_time_hours") return `${n.toFixed(1)}h`;
  return n.toFixed(2);
}

/** Trouve le meilleur et le pire parmi une liste de snapshots pour un champ */
function rankSnapshots(snapshots, field, higherIsBetter = true) {
  const valid = snapshots.filter(s => s[field] != null && !isNaN(Number(s[field])));
  if (valid.length < 2) return { best: null, worst: null };
  const sorted = [...valid].sort((a, b) =>
    higherIsBetter
      ? Number(b[field]) - Number(a[field])
      : Number(a[field]) - Number(b[field])
  );
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

// ── Générateur principal d'insights ──────────────────────────────────────────

/**
 * generateInsights
 *
 * @param {object}   current        - Snapshot KPI de l'entité sélectionnée
 * @param {object[]} allSnapshots   - Tous les snapshots du même projet + période
 * @param {object}   previous       - Snapshot du mois précédent (peut être null)
 * @param {string}   entityLabel    - Nom de l'entité ex: "site Tunis", "dev @ali.ben"
 * @param {object}   thresholds     - Seuils configurés par l'admin (optionnel)
 * @returns {Insight[]}
 */
export function generateInsights(
  current,
  allSnapshots = [],
  previous     = null,
  entityLabel  = "cette entité",
  thresholds   = {}
) {
  if (!current) return [];

  const insights = [];
  const thresh   = { ...DEFAULTS, ...thresholds };
  const others   = allSnapshots.filter(s => s !== current && s.id !== current.id);

  // ──────────────────────────────────────────────────────────────────────────
  // RÈGLE 1 : Taux d'approbation critique
  // ──────────────────────────────────────────────────────────────────────────
  const approvedRate = Number(current.approved_mr_rate);
  if (!isNaN(approvedRate)) {
    const avgOthers = avg(others, "approved_mr_rate");
    const diff      = avgOthers != null ? ((approvedRate - avgOthers) * 100).toFixed(1) : null;

    if (approvedRate < thresh.approvedMrRate.critical) {
      insights.push({
        type:  "danger",
        title: `Taux d'approbation critique — ${(approvedRate * 100).toFixed(1)}%`,
        description: diff != null
          ? `${entityLabel} est ${Math.abs(diff)}pts en dessous de la moyenne (${(avgOthers * 100).toFixed(1)}%). Vérifier la disponibilité des reviewers et les processus de revue.`
          : `Le taux d'approbation est en dessous du seuil critique (${(thresh.approvedMrRate.critical * 100).toFixed(0)}%). Action immédiate recommandée.`,
        action: "Voir les recommandations pour améliorer le taux d'approbation",
      });
    } else if (approvedRate < thresh.approvedMrRate.warning) {
      insights.push({
        type:  "warning",
        title: `Taux d'approbation en baisse — ${(approvedRate * 100).toFixed(1)}%`,
        description: `Le seuil warning est ${(thresh.approvedMrRate.warning * 100).toFixed(0)}%. Surveiller l'évolution le mois prochain.`,
      });
    } else if (avgOthers != null && approvedRate > avgOthers + 0.15) {
      insights.push({
        type:  "success",
        title: `Excellent taux d'approbation — ${(approvedRate * 100).toFixed(1)}%`,
        description: `${entityLabel} surpasse la moyenne de ${Math.abs(diff)}pts. Pratique à partager avec les autres équipes.`,
        action: "Comment reproduire ces bonnes pratiques ?",
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RÈGLE 2 : Temps de revue élevé (HIGHER_IS_WORSE)
  // ──────────────────────────────────────────────────────────────────────────
  const reviewTime = Number(current.avg_review_time_hours);
  if (!isNaN(reviewTime) && reviewTime > 0) {
    const avgOthers = avg(others, "avg_review_time_hours");

    if (reviewTime > thresh.avgReviewTimeHours.critical) {
      insights.push({
        type:  "danger",
        title: `Temps de revue critique — ${reviewTime.toFixed(1)}h`,
        description: avgOthers != null
          ? `${entityLabel} prend ${(reviewTime / avgOthers).toFixed(1)}x plus de temps que la moyenne (${avgOthers.toFixed(1)}h). Les MRs s'accumulent, ce qui bloque les fusions.`
          : `Le temps de revue dépasse le seuil critique (${thresh.avgReviewTimeHours.critical}h). Des MRs risquent de rester bloquées.`,
        action: "Analyser les MRs en attente de revue",
      });
    } else if (reviewTime > thresh.avgReviewTimeHours.warning) {
      insights.push({
        type:  "warning",
        title: `Temps de revue élevé — ${reviewTime.toFixed(1)}h`,
        description: `Au-dessus du seuil warning (${thresh.avgReviewTimeHours.warning}h). À surveiller avant que ça ne devienne critique.`,
      });
    } else if (avgOthers != null && reviewTime < avgOthers * 0.5) {
      insights.push({
        type:  "success",
        title: `Temps de revue exemplaire — ${reviewTime.toFixed(1)}h`,
        description: `${entityLabel} est ${(avgOthers / reviewTime).toFixed(1)}x plus rapide que la moyenne (${avgOthers.toFixed(1)}h). Bonne pratique à partager.`,
        action: "Comment reproduire cette réactivité ?",
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RÈGLE 3 : MR rate faible
  // ──────────────────────────────────────────────────────────────────────────
  const mrRate = Number(current.mr_rate_per_site);
  if (!isNaN(mrRate)) {
    const avgOthers = avg(others, "mr_rate_per_site");

    if (mrRate < thresh.mrRatePerSite.critical) {
      insights.push({
        type:  "warning",
        title: `MR rate faible — ${mrRate.toFixed(2)} MR/dev`,
        description: `Peu de Merge Requests créées par développeur. Cela peut indiquer un manque de collaboration ou des tâches trop longues sans découpage en sous-MRs.`,
      });
    } else if (avgOthers != null && mrRate > avgOthers * 1.3) {
      insights.push({
        type:  "info",
        title: `MR rate élevé — ${mrRate.toFixed(2)} MR/dev`,
        description: `${entityLabel} crée ${((mrRate / avgOthers - 1) * 100).toFixed(0)}% plus de MRs que la moyenne. Bon signe de collaboration active.`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RÈGLE 4 : Tendance temporelle (comparaison mois précédent)
  // ──────────────────────────────────────────────────────────────────────────
  if (previous) {
    const fields = [
      { key: "approved_mr_rate",     label: "taux d'approbation", higherIsBetter: true  },
      { key: "commit_rate_per_site", label: "commit rate",        higherIsBetter: true  },
      { key: "avg_review_time_hours",label: "temps de revue",     higherIsBetter: false },
    ];

    for (const { key, label, higherIsBetter } of fields) {
      const curr = Number(current[key]);
      const prev = Number(previous[key]);
      if (isNaN(curr) || isNaN(prev) || prev === 0) continue;

      const pct   = deltaPct(curr, prev);
      if (pct == null) continue;

      const isGood = higherIsBetter ? pct > 0 : pct < 0;
      const isBad  = higherIsBetter ? pct < -15 : pct > 20;

      if (isBad) {
        insights.push({
          type:  "warning",
          title: `Régression du ${label} — ${fmtDelta(pct, higherIsBetter).text} ce mois`,
          description: `Le ${label} de ${entityLabel} se dégrade par rapport au mois précédent. À surveiller pour éviter une tendance durable.`,
        });
      } else if (isGood && Math.abs(pct) > 10) {
        insights.push({
          type:  "info",
          title: `Amélioration du ${label} — ${fmtDelta(pct, higherIsBetter).text} ce mois`,
          description: `Tendance positive. Si cela se confirme le mois prochain, le score global progressera significativement.`,
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RÈGLE 5 : Taux de fusion (merged_mr_rate)
  // ──────────────────────────────────────────────────────────────────────────
  const mergedRate = Number(current.merged_mr_rate);
  if (!isNaN(mergedRate) && mergedRate < thresh.mergedMrRate.critical) {
    insights.push({
      type:  "danger",
      title: `Taux de fusion critique — ${(mergedRate * 100).toFixed(1)}%`,
      description: `Peu de MRs approuvées sont effectivement fusionnées. Cela peut indiquer des blocages techniques (conflits, CI/CD) ou organisationnels.`,
      action: "Analyser les MRs approuvées non fusionnées",
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RÈGLE 6 : Classement dans le groupe (meilleur/pire)
  // ──────────────────────────────────────────────────────────────────────────
  if (allSnapshots.length >= 3) {
    const { best, worst } = rankSnapshots(allSnapshots, "approved_mr_rate", true);
    const isBest  = best  && (best.id  === current.id  || best.site_id  === current.site_id);
    const isWorst = worst && (worst.id === current.id  || worst.site_id === current.site_id);

    if (isBest && !insights.some(i => i.type === "success")) {
      insights.push({
        type:  "success",
        title: "Meilleure performance du groupe",
        description: `${entityLabel} est premier sur le taux d'approbation parmi toutes les entités de ce projet ce mois.`,
      });
    }
    if (isWorst && !insights.some(i => i.type === "danger")) {
      insights.push({
        type:  "danger",
        title: "Performance la plus faible du groupe",
        description: `${entityLabel} est dernier sur le taux d'approbation. Une analyse des causes est recommandée.`,
        action: "Quelles causes possibles pour cette sous-performance ?",
      });
    }
  }

  // Si aucune alerte — tout va bien
  if (insights.length === 0) {
    insights.push({
      type:  "success",
      title: "Tous les KPIs sont dans les seuils normaux",
      description: `${entityLabel} performe correctement sur tous les indicateurs ce mois. Continuer le suivi.`,
    });
  }

  return insights;
}

// ── Score global ──────────────────────────────────────────────────────────────

/**
 * calculateScore
 * Calcule un score global /100 à partir d'un snapshot KPI.
 *
 * Pondération des 6 KPIs du PFE :
 *   - approved_mr_rate      25% — qualité du code (le plus impactant)
 *   - merged_mr_rate        20% — contribution aux livraisons
 *   - avg_review_time_hours 15% — réactivité de l'équipe
 *   - mr_rate_per_site      15% — activité de collaboration
 *   - commit_rate_per_site  15% — activité de développement
 *   - nb_commits_per_project 8% — activité brute projet
 *   (réduit de 10 → 8 car moins discriminant, max corrigé 500→1000)
 *   → Total = 98% (arrondi à 100 par normalisation)
 *
 * ✅ FIX : max NB_COMMITS_PROJECT 500 → 1000 (plus représentatif pour
 *          équipes de 15-30 devs sur 1 mois).
 */
export function calculateScore(snapshot) {
  if (!snapshot) return null;

  const components = [
    // KPI #3 : Approved MR Rate (0–1) — HIGHER_IS_BETTER
    { val: Number(snapshot.approved_mr_rate),        weight: 25, max: 1,    higherIsBetter: true  },
    // KPI #4 : Merged MR Rate (0–1) — HIGHER_IS_BETTER
    { val: Number(snapshot.merged_mr_rate),          weight: 20, max: 1,    higherIsBetter: true  },
    // KPI #7 : Avg Review Time (heures) — LOWER_IS_BETTER (HIGHER_IS_WORSE)
    { val: Number(snapshot.avg_review_time_hours),   weight: 15, max: 48,   higherIsBetter: false },
    // KPI #1 : MR Rate / site (ratio) — HIGHER_IS_BETTER
    { val: Number(snapshot.mr_rate_per_site),        weight: 15, max: 5,    higherIsBetter: true  },
    // KPI #5 : Commit Rate / site (ratio) — HIGHER_IS_BETTER
    { val: Number(snapshot.commit_rate_per_site),    weight: 15, max: 10,   higherIsBetter: true  },
    // KPI #6 : NB commits projet (entier) — HIGHER_IS_BETTER
    // ✅ FIX : max 500 → 1000 (équipe de 20 devs × 50 commits/mois = 1000)
    { val: Number(snapshot.nb_commits_per_project),  weight: 8,  max: 1000, higherIsBetter: true  },
  ];

  let totalScore  = 0;
  let totalWeight = 0;

  for (const { val, weight, max, higherIsBetter } of components) {
    if (isNaN(val) || val == null) continue;
    const clamped = Math.min(Math.max(val, 0), max);
    const pct     = higherIsBetter ? clamped / max : 1 - clamped / max;
    totalScore  += pct * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return Math.round((totalScore / totalWeight) * 100);
}

/**
 * getScoreColor — couleur CSS selon le score /100
 */
export function getScoreColor(score) {
  if (score == null) return "var(--color-text-secondary)";
  if (score >= 70)   return "var(--color-text-success)";
  if (score >= 45)   return "var(--color-text-warning)";
  return "var(--color-text-danger)";
}

/**
 * getScoreLabel — libellé selon le score /100
 * ✅ FIX : ajout "Excellent" pour score ≥ 85
 */
export function getScoreLabel(score) {
  if (score == null) return "—";
  if (score >= 85)   return "Excellent";
  if (score >= 70)   return "Bon";
  if (score >= 45)   return "Moyen";
  return "Faible";
}

/**
 * buildComparisonTable
 * Construit les données pour le tableau comparatif de tous les snapshots.
 * @param {object[]} snapshots - liste (1 par site ou 1 par développeur)
 * @param {function} getLabel  - fn(snapshot) => string label affiché
 * @returns {ComparisonRow[]}  triés par score décroissant
 */
export function buildComparisonTable(snapshots, getLabel) {
  if (!snapshots?.length) return [];

  return snapshots
    .map(s => ({
      label:          getLabel(s),
      snapshot:       s,
      score:          calculateScore(s),
      approvedMrRate: Number(s.approved_mr_rate),
      mergedMrRate:   Number(s.merged_mr_rate),
      mrRatePerSite:  Number(s.mr_rate_per_site),
      commitRate:     Number(s.commit_rate_per_site),
      reviewTime:     Number(s.avg_review_time_hours),
      nbCommits:      Number(s.nb_commits_per_project),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}