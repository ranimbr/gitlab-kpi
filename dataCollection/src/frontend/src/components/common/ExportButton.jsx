/**
 * components/common/ExportButton.jsx
 *
 * Boutons d'export PDF et Excel pour les rapports KPI.
 * À intégrer dans DashboardKPI.jsx, KpiAnalysisPage.jsx, etc.
 *
 * Usage :
 *   <ExportButton projectId={1} periodId={3} siteId={2} />
 *   <ExportButton projectId={1} size="sm" label="Exporter" />
 *   <ExportButton projectId={1} variant="icon" />  ← boutons icônes seuls
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

/**
 * Déclenche un téléchargement depuis une URL backend.
 * Le token JWT est ajouté dans l'URL car les téléchargements
 * ne passent pas par l'intercepteur Axios.
 */
function triggerDownload(url) {
  const token = localStorage.getItem("access_token");
  const sep   = url.includes("?") ? "&" : "?";
  const full  = token ? `${url}${sep}token=${token}` : url;
  const a     = document.createElement("a");
  a.href      = full;
  a.target    = "_blank";
  a.rel       = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Construit l'URL d'export avec les paramètres donnés.
 */
function buildUrl(format, { projectId, periodId, siteId }) {
  const params = new URLSearchParams();
  if (projectId) params.append("project_id", projectId);
  if (periodId)  params.append("period_id",  periodId);
  if (siteId)    params.append("site_id",    siteId);
  return `${BASE_URL}/export/kpis/${format}?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT BUTTON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {number}  projectId   - Requis
 * @param {number}  [periodId]  - Optionnel (défaut = dernière période)
 * @param {number}  [siteId]    - Optionnel (défaut = tous les sites)
 * @param {string}  [size]      - "sm" | "md" | "lg" (défaut "sm")
 * @param {string}  [label]     - Texte affiché avant les boutons (défaut "Exporter")
 * @param {string}  [variant]   - "full" | "icon" | "dropdown" (défaut "full")
 * @param {boolean} [showLabel] - Afficher le texte dans les boutons (défaut true)
 * @param {string}  [className] - Classes CSS supplémentaires
 */
export default function ExportButton({
  projectId,
  periodId  = null,
  siteId    = null,
  size      = "sm",
  label     = null,
  variant   = "full",
  showLabel = true,
  className = "",
}) {
  if (!projectId) return null;

  const exportParams = { projectId, periodId, siteId };

  const handleExcel = () => triggerDownload(buildUrl("excel", exportParams));
  const handlePdf   = () => triggerDownload(buildUrl("pdf",   exportParams));

  // ── Variante icônes seules (compact) ──────────────────────────────────────
  if (variant === "icon") {
    return (
      <div className={`d-flex gap-1 ${className}`}>
        <button
          className={`btn btn-${size} btn-icon`}
          style={{ background: "#F0FDF4", color: "#15803D", border: "1px solid #A7F3D0", borderRadius: 8 }}
          onClick={handleExcel}
          title="Exporter Excel (.xlsx)">
          <i className="ri-file-excel-2-line fs-14"></i>
        </button>
        <button
          className={`btn btn-${size} btn-icon`}
          style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 8 }}
          onClick={handlePdf}
          title="Exporter PDF (.pdf)">
          <i className="ri-file-pdf-line fs-14"></i>
        </button>
      </div>
    );
  }

  // ── Variante dropdown ─────────────────────────────────────────────────────
  if (variant === "dropdown") {
    return (
      <div className={`dropdown ${className}`}>
        <button
          className={`btn btn-${size} btn-soft-secondary dropdown-toggle d-flex align-items-center gap-1`}
          style={{ borderRadius: 10 }}
          data-bs-toggle="dropdown"
          aria-expanded="false">
          <i className="ri-download-2-line fs-14"></i>
          {showLabel && <span>Export</span>}
        </button>
        <ul className="dropdown-menu dropdown-menu-end border-0"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,.12)", borderRadius: 12, minWidth: 180 }}>
          {label && (
            <>
              <li><h6 className="dropdown-header fs-11 text-uppercase" style={{ letterSpacing: ".06em" }}>{label}</h6></li>
              <li><hr className="dropdown-divider my-1" /></li>
            </>
          )}
          <li>
            <button className="dropdown-item d-flex align-items-center gap-2 py-2" onClick={handleExcel}>
              <div className="d-flex align-items-center justify-content-center rounded-2 flex-shrink-0"
                style={{ width: 28, height: 28, background: "#F0FDF4" }}>
                <i className="ri-file-excel-2-line text-success fs-14"></i>
              </div>
              <div>
                <p className="mb-0 fs-13 fw-medium">Excel (.xlsx)</p>
                <p className="mb-0 fs-11 text-muted">Tableau avec deltas</p>
              </div>
            </button>
          </li>
          <li>
            <button className="dropdown-item d-flex align-items-center gap-2 py-2" onClick={handlePdf}>
              <div className="d-flex align-items-center justify-content-center rounded-2 flex-shrink-0"
                style={{ width: 28, height: 28, background: "#FEF2F2" }}>
                <i className="ri-file-pdf-line text-danger fs-14"></i>
              </div>
              <div>
                <p className="mb-0 fs-13 fw-medium">PDF (.pdf)</p>
                <p className="mb-0 fs-11 text-muted">Rapport paysage A4</p>
              </div>
            </button>
          </li>
        </ul>
      </div>
    );
  }

  // ── Variante full (défaut) — 2 boutons côte à côte ────────────────────────
  return (
    <div className={`d-flex align-items-center gap-2 ${className}`}>
      {label && <span className="text-muted fs-12 fw-medium">{label}</span>}

      <button
        className={`btn btn-${size} d-flex align-items-center gap-1`}
        style={{
          background:   "#F0FDF4",
          color:        "#15803D",
          border:       "1px solid #A7F3D0",
          borderRadius: 10,
          fontWeight:   500,
        }}
        onClick={handleExcel}
        title="Télécharger le rapport Excel">
        <i className="ri-file-excel-2-line fs-14"></i>
        {showLabel && <span>Excel</span>}
      </button>

      <button
        className={`btn btn-${size} d-flex align-items-center gap-1`}
        style={{
          background:   "#FEF2F2",
          color:        "#DC2626",
          border:       "1px solid #FECACA",
          borderRadius: 10,
          fontWeight:   500,
        }}
        onClick={handlePdf}
        title="Télécharger le rapport PDF">
        <i className="ri-file-pdf-line fs-14"></i>
        {showLabel && <span>PDF</span>}
      </button>
    </div>
  );
}
