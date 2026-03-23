/**
 * components/common/AlertBadge.jsx
 *
 * CORRECTION :
 *   Pas de cleanup dans useEffect → si le composant est démonté avant que la
 *   requête aboutisse, React lance un warning "Can't perform a React state
 *   update on an unmounted component" et peut causer des bugs subtils.
 *   ✅ FIX : pattern `let mounted = true` + cleanup `() => { mounted = false }`
 *
 * Usage :
 *   <AlertBadge projectId={selectedProject?.id} />
 *   <AlertBadge dashboardId={dashboard?.id} compact />
 */

import { useState, useEffect } from "react";
import alertService from "../../services/alertService";

export default function AlertBadge({
  projectId   = null,
  dashboardId = null,
  compact     = false,
  onClick     = null,
}) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!projectId && !dashboardId) return;

    // ✅ FIX : flag pour éviter setState sur composant démonté
    let mounted = true;

    alertService
      .getSummary(projectId, dashboardId)
      .then((data) => {
        if (mounted) setSummary(data);
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, [projectId, dashboardId]);

  if (!summary || summary.total_active === 0) return null;

  const { total_warning, total_critical } = summary;

  if (compact) {
    return (
      <span
        className="d-inline-flex align-items-center gap-1"
        onClick={onClick}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        {total_critical > 0 && (
          <span className="badge bg-danger-subtle text-danger fs-11 d-inline-flex align-items-center gap-1">
            <i className="ri-close-circle-line" />
            {total_critical}
          </span>
        )}
        {total_warning > 0 && (
          <span className="badge bg-warning-subtle text-warning fs-11 d-inline-flex align-items-center gap-1">
            <i className="ri-alert-line" />
            {total_warning}
          </span>
        )}
      </span>
    );
  }

  return (
    <div
      className="d-flex align-items-center gap-2 p-2 rounded"
      style={{ background: "rgba(242, 51, 51, 0.05)", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <i className="ri-alarm-warning-line text-danger fs-16" />
      <div>
        <p className="mb-0 fs-12 fw-semibold text-danger">
          {summary.total_active} alerte{summary.total_active > 1 ? "s" : ""} active{summary.total_active > 1 ? "s" : ""}
        </p>
        <p className="mb-0 fs-11 text-muted">
          {total_critical > 0 && <span className="text-danger me-2">{total_critical} critical</span>}
          {total_warning  > 0 && <span className="text-warning">{total_warning} warning</span>}
        </p>
      </div>
    </div>
  );
}
