import api from "./api";

const exportService = {
  /**
   * Télécharge le rapport KPI au format Excel (.xlsx)
   */
  exportExcel: async (projectId, periodId = null, siteId = null) => {
    try {
      const params = { project_id: projectId };
      if (periodId) params.period_id = periodId;
      if (siteId) params.site_id = siteId;

      const response = await api.get("/export/kpis/excel", {
        params,
        responseType: "blob", // Important pour les fichiers
      });

      downloadBlob(response.data, `kpi_rapport_projet${projectId}.xlsx`);
    } catch (error) {
      console.error("Erreur d'export Excel:", error);
      throw new Error("L'export Excel a échoué. " + (error.response?.data?.detail || ""));
    }
  },

  /**
   * Télécharge le rapport KPI au format PDF (.pdf)
   */
  exportPdf: async (projectId, periodId = null, siteId = null) => {
    try {
      const params = { project_id: projectId };
      if (periodId) params.period_id = periodId;
      if (siteId) params.site_id = siteId;

      const response = await api.get("/export/kpis/pdf", {
        params,
        responseType: "blob", // Important
      });

      downloadBlob(response.data, `kpi_rapport_projet${projectId}.pdf`);
    } catch (error) {
      console.error("Erreur d'export PDF:", error);
      throw new Error("L'export PDF a échoué. " + (error.response?.data?.detail || ""));
    }
  },
};

// ── Fonction utilitaire pour télécharger en navigateur ──
function downloadBlob(blob, defaultFilename) {
  // Créer un objet URL pour le blob
  const url = window.URL.createObjectURL(new Blob([blob]));
  
  // Créer un lien temporaire
  const link = document.createElement("a");
  link.href = url;
  
  // Assigner un nom de fichier par défaut (qui sera souvent redéfini par le Content-Disposition du backend)
  link.setAttribute("download", defaultFilename);
  
  // Ajouter au DOM le lien, cliquer dessus puis le supprimer
  document.body.appendChild(link);
  link.click();
  
  // Nettoyer
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export default exportService;
