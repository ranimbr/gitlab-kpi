/**
 * services/index.js
 *
 * Barrel export — importer depuis "@/services" au lieu de "@/services/xxx".
 *
 * CORRECTION :
 *   Import circulaire résolu :
 *   AVANT : kpiService.js exportait projectService
 *           ET index.js l'exportait aussi depuis projectService.js
 *           → deux définitions → Vite pouvait résoudre dans le mauvais ordre
 *           → undefined au runtime selon l'ordre d'import des composants.
 *
 *   ✅ FIX : projectService exporté UNIQUEMENT depuis projectService.js.
 *            kpiService n'exporte plus projectService (supprimé).
 *            index.js est la source unique d'export de tous les services.
 *
 * Usage recommandé :
 *   import { analyticsService, siteService } from "@/services";
 *   import analyticsService from "@/services/analyticsService"; // aussi valide
 */

export { default as api }                  from "./api";
export { default as authService }          from "./authService";
export { default as analyticsService }     from "./analyticsService";
export { default as adminService }         from "./adminService";
export { default as alertService }         from "./alertService";
export { default as dashboardService }     from "./dashboardService";
export { default as developerService }     from "./developerService";
export { default as exportService }        from "./exportService";
export { default as extractionLotService } from "./extractionLotService";
export { default as gitlabConfigService }  from "./gitlabConfigService";
export { default as kpiDefinitionService } from "./kpiDefinitionService";
export { default as kpiThresholdService }  from "./kpiThresholdService";
export { default as periodFilterService }  from "./periodFilterService";
export { default as periodService }        from "./periodService";
export { default as projectService }       from "./projectService";   // ✅ source unique
export { default as siteService }          from "./siteService";

// kpiService et extractionService — façade pour les composants existants
// ✅ FIX : projectService supprimé de kpiService → plus d'import circulaire
export { kpiService, extractionService } from "./kpiService";

// Constantes utiles réexportées
export { KPI_LABELS, KPI_NAMES, alertLevelToColor, alertLevelToIcon } from "./kpiThresholdService";
export { PERIOD_FILTER_TYPES } from "./periodFilterService";

// insightsEngine — utilitaires d'analyse (pas un service API)
export {
  generateInsights,
  calculateScore,
  getScoreColor,
  getScoreLabel,
  buildComparisonTable,
  fmtKpi,
} from "./insightsEngine";