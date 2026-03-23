/**
 * StatusBadge — Badge de statut réutilisable
 *
 * Types supportés :
 *   period    — open | closed
 *   lot       — pending | running | completed | failed
 *   lotType   — REALTIME | MONTHLY
 *   mr        — opened | merged | closed
 *   user      — true | false (is_active)
 *   role      — admin | user
 *   draft     — true | false (is_draft)
 *   gitlab    — active | inactive
 *   threshold — ok | warning | critical | unknown  (KPI alert level)
 *   site      — true | false (is_active)
 *   alert     — WARNING | CRITICAL
 *
 * CORRECTION :
 *   Fallback original → typeConfig[Object.keys(typeConfig)[0]]
 *   Problème : affichait le premier statut du type (ex: "Open") pour toute
 *   valeur inconnue → badge trompeur.
 *   ✅ FIX : fallback neutre { label: String(value), color: "secondary", icon: "ri-question-line" }
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

  threshold: {
    ok:       { label: "OK",       color: "success",   icon: "ri-checkbox-circle-line" },
    warning:  { label: "Warning",  color: "warning",   icon: "ri-alert-line" },
    critical: { label: "Critical", color: "danger",    icon: "ri-close-circle-line" },
    unknown:  { label: "Unknown",  color: "secondary", icon: "ri-question-line" },
  },

  site: {
    true:  { label: "Actif",   color: "success",   icon: "ri-map-pin-line" },
    false: { label: "Inactif", color: "secondary", icon: "ri-map-pin-2-line" },
  },

  alert: {
    WARNING:  { label: "Warning",  color: "warning", icon: "ri-alert-line" },
    CRITICAL: { label: "Critical", color: "danger",  icon: "ri-close-circle-line" },
  },
};

export default function StatusBadge({ type, value, size = "sm" }) {
  const typeConfig = CONFIG[type];
  if (!typeConfig) return null;

  const key = String(value);

  // ✅ FIX : fallback neutre au lieu du premier élément du type
  const cfg = typeConfig[key] ?? {
    label: String(value),
    color: "secondary",
    icon:  "ri-question-line",
  };

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