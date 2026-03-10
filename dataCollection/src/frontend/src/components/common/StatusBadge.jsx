/**
 * StatusBadge — Badge de statut réutilisable
 *
 * Gère : period status, extraction status, MR state, user status,
 *        KPI alert level (threshold)
 *
 * Usage : <StatusBadge type="period"    value="open" />
 *         <StatusBadge type="lot"       value="completed" />
 *         <StatusBadge type="mr"        value="merged" />
 *         <StatusBadge type="user"      value={true} />      // is_active
 *         <StatusBadge type="draft"     value={true} />      // is_draft
 *         <StatusBadge type="threshold" value="warning" />   // [NEW] KPI alert level
 */

const CONFIG = {

  period: {
    open:   { label: "Open",   color: "success",   icon: "ri-lock-unlock-line" },
    closed: { label: "Closed", color: "secondary", icon: "ri-lock-line" },
  },

  lot: {
    pending:   { label: "Pending",   color: "warning", icon: "ri-time-line" },
    running:   { label: "Running",   color: "info",    icon: "ri-loader-4-line" },
    completed: { label: "Completed", color: "success", icon: "ri-checkbox-circle-line" },
    failed:    { label: "Failed",    color: "danger",  icon: "ri-close-circle-line" },
  },

  lotType: {
    REALTIME: { label: "Realtime", color: "info",    icon: "ri-play-circle-line" },
    MONTHLY:  { label: "Monthly",  color: "primary", icon: "ri-calendar-check-line" },
  },

  mr: {
    opened: { label: "Open",   color: "primary", icon: "ri-git-pull-request-line" },
    merged: { label: "Merged", color: "success", icon: "ri-git-merge-line" },
    closed: { label: "Closed", color: "danger",  icon: "ri-close-circle-line" },
  },

  user: {
    true:  { label: "Active",   color: "success", icon: "ri-checkbox-circle-line" },
    false: { label: "Inactive", color: "danger",  icon: "ri-close-circle-line" },
  },

  role: {
    admin: { label: "Admin", color: "danger", icon: "ri-shield-user-line" },
    user:  { label: "User",  color: "info",   icon: "ri-user-line" },
  },

  draft: {
    true:  { label: "Draft", color: "secondary", icon: "ri-draft-line" },
    false: { label: "Ready", color: "success",   icon: "ri-checkbox-circle-line" },
  },

  gitlab: {
    active:   { label: "Active",   color: "success",   icon: "ri-checkbox-circle-line" },
    inactive: { label: "Inactive", color: "secondary", icon: "ri-forbid-line" },
  },

  // [NEW] Niveaux d'alerte KPI — mappés depuis KpiAlertLevel.level
  // Valeurs : "ok" | "warning" | "critical"
  threshold: {
    ok:       { label: "OK",       color: "success", icon: "ri-checkbox-circle-line" },
    warning:  { label: "Warning",  color: "warning", icon: "ri-alert-line" },
    critical: { label: "Critical", color: "danger",  icon: "ri-close-circle-line" },
  },
};

export default function StatusBadge({ type, value, size = "sm" }) {
  const typeConfig = CONFIG[type];
  if (!typeConfig) return null;

  const key    = String(value);
  const cfg    = typeConfig[key] || typeConfig[Object.keys(typeConfig)[0]];
  const { label, color, icon } = cfg;

  return (
    <span
      className={`badge bg-${color}-subtle text-${color} fs-${size === "sm" ? "12" : "13"} d-inline-flex align-items-center gap-1`}
    >
      <i className={icon}></i>
      {label}
    </span>
  );
}
