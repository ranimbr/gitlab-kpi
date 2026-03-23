/**
 * services/kpiService.js
 *
 * Façade KPI — délègue à analyticsService pour éviter la duplication.
 *
 * CORRECTIONS :
 *
 *   1. FIX CRITIQUE — extractionService.run() :
 *      Le backend ExtractionLotCreate attend `extraction_type` (pas `type`).
 *      AVANT : { type: "REALTIME", project_id: X } → 422 Unprocessable Entity
 *      ✅ FIX : normalise le payload avant envoi.
 *
 *   2. FIX — import circulaire supprimé.
 *      AVANT : ce fichier exportait projectService ET index.js l'exportait aussi
 *              depuis projectService.js → Vite pouvait résoudre dans le mauvais
 *              ordre → undefined au runtime.
 *      ✅ FIX : projectService supprimé de ce fichier.
 *              Utiliser projectService depuis projectService.js directement,
 *              ou depuis index.js (qui l'exporte depuis la bonne source).
 *
 *   3. AJOUT — kpiService expose les nouveaux endpoints :
 *      getMultiPeriod() et getTrend() depuis analyticsService.
 */

import analyticsService from "./analyticsService";
import api from "./api";

// ── Re-exports depuis analyticsService ────────────────────────────────────────
export const kpiService = {
  // Endpoints existants
  getDashboard:     analyticsService.getKpiDashboard,
  getLatest:        analyticsService.getLatest,
  getHistory:       analyticsService.getHistory,
  generateSnapshot: analyticsService.generateSnapshot,
  compareSites:     analyticsService.compareSites,
  getTopDevelopers: analyticsService.getTopDevelopers,

  // ✅ NOUVEAUX endpoints (tableau multi-mois + graphiques linéaires)
  getMultiPeriod:   analyticsService.getMultiPeriod,
  getTrend:         analyticsService.getTrend,
};

// ── extractionService ─────────────────────────────────────────────────────────
export const extractionService = {
  /**
   * POST /extraction/run
   *
   * ✅ FIX : normalise le payload avant envoi.
   * Le backend ExtractionLotCreate attend `extraction_type` (NOT `type`).
   *
   * Accepte les deux formats pour compatibilité :
   *   { type: "REALTIME", project_id: 1 }           → normalisé automatiquement
   *   { extraction_type: "REALTIME", project_id: 1 } → passé tel quel
   *
   * @param {Object} payload
   * @param {number} payload.project_id
   * @param {string} payload.extraction_type  - "REALTIME" | "MONTHLY"
   * @param {number} [payload.period_id]      - Obligatoire si MONTHLY
   */
  run: async (payload) => {
    const normalized = { ...payload };
    if (normalized.type && !normalized.extraction_type) {
      normalized.extraction_type = normalized.type;
      delete normalized.type;
    }
    return (await api.post("/extraction/run", normalized)).data;
  },

  /**
   * GET /extraction/lots
   * Liste les lots d'extraction avec filtres optionnels.
   */
  getLots: async (projectId = null, periodId = null) => {
    const params = {};
    if (projectId != null) params.project_id = projectId;
    if (periodId  != null) params.period_id  = periodId;
    return (await api.get("/extraction/lots", { params })).data;
  },

  /**
   * GET /extraction/lots/{lotId}/download
   * Télécharge le fichier dump JSON d'un lot MONTHLY.
   */
  downloadLot: (lotId) => {
    const token = localStorage.getItem("access_token");
    const url   = `${import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"}/extraction/lots/${lotId}/download`;
    // Ouvre dans un nouvel onglet — le navigateur déclenche le téléchargement
    const a = document.createElement("a");
    a.href   = url;
    a.target = "_blank";
    a.rel    = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
};

// ✅ FIX : projectService intentionnellement ABSENT de ce fichier.
// Importer depuis projectService.js ou depuis index.js.
// Ne plus importer { projectService } depuis kpiService — source de confusion.