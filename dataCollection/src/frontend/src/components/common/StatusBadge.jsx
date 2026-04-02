/**
 * components/common/StatusBadge.jsx
 *
 * CORRECTIONS :
 *   1. ✅ FIX CRITIQUE — section `role` mise à jour avec les 4 nouveaux rôles :
 *      super_admin, site_manager, team_lead, developer
 *      (les anciens admin/user sont conservés en fallback)
 *   2. ✅ FIX — fallback neutre { label: String(value), color: "secondary" }
 *      au lieu du premier élément du type (badge trompeur)
 *   3. ✅ AJOUT — type `developer` pour les statuts is_validated, is_bot, is_external
 *   4. ✅ AJOUT — type `importStatus` pour les imports CSV/Excel
 *
 * Types supportés :
 *   period       — open | closed
 *   lot          — pending | running | completed | failed
 *   lotType      — REALTIME | MONTHLY
 *   mr           — opened | merged | closed
 *   user         — true | false (is_active)
 *   role         — super_admin | site_manager | team_lead | developer (+ admin | user fallback)
 *   draft        — true | false (is_draft)
 *   gitlab       — active | inactive
 *   threshold    — ok | warning | critical | unknown
 *   site         — true | false (is_active)
 *   alert        — WARNING | CRITICAL
 *   devStatus    — validated | pending | bot | external  (statut développeur)
 *   importStatus — pending | processing | completed | failed
 */

const CONFIG = {

  period: {
    open:   { label: "Open",   color: "success",   icon: "ri-lock-unlock-line" },
    closed: { label: "Closed", color: "secondary", icon: "ri-lock-line"        },
  },

  lot: {
    pending:   { label: "Pending",   color: "warning", icon: "ri-time-line"            },
    running:   { label: "Running",   color: "info",    icon: "ri-loader-4-line"         },
    completed: { label: "Completed", color: "success", icon: "ri-checkbox-circle-line" },
    failed:    { label: "Failed",    color: "danger",  icon: "ri-close-circle-line"    },
  },

  lotType: {
    REALTIME: { label: "Realtime", color: "info",    icon: "ri-play-circle-line"      },
    MONTHLY:  { label: "Monthly",  color: "primary", icon: "ri-calendar-check-line"   },
  },

  mr: {
    opened: { label: "Open",   color: "primary", icon: "ri-git-pull-request-line" },
    merged: { label: "Merged", color: "success", icon: "ri-git-merge-line"        },
    closed: { label: "Closed", color: "danger",  icon: "ri-close-circle-line"     },
  },

  user: {
    true:  { label: "Active",   color: "success", icon: "ri-checkbox-circle-line" },
    false: { label: "Inactive", color: "danger",  icon: "ri-close-circle-line"    },
  },

  // ✅ FIX : 4 nouveaux rôles + anciens en fallback
  role: {
    // Nouveaux rôles (backend v2)
    super_admin:  { label: "Super Admin",  color: "danger",  icon: "ri-shield-star-line"  },
    site_manager: { label: "Site Manager", color: "warning", icon: "ri-shield-user-line"  },
    team_lead:    { label: "Team Lead",    color: "primary", icon: "ri-group-line"        },
    developer:    { label: "Développeur",  color: "info",    icon: "ri-code-s-slash-line" },
    // Anciens rôles (fallback rétrocompatibilité)
    admin:        { label: "Admin",        color: "danger",  icon: "ri-shield-user-line"  },
    user:         { label: "User",         color: "info",    icon: "ri-user-line"         },
  },

  draft: {
    true:  { label: "Draft", color: "secondary", icon: "ri-draft-line"            },
    false: { label: "Ready", color: "success",   icon: "ri-checkbox-circle-line"  },
  },

  gitlab: {
    active:   { label: "Active",   color: "success",   icon: "ri-checkbox-circle-line" },
    inactive: { label: "Inactive", color: "secondary", icon: "ri-forbid-line"          },
  },

  threshold: {
    ok:       { label: "OK",       color: "success",   icon: "ri-checkbox-circle-line" },
    warning:  { label: "Warning",  color: "warning",   icon: "ri-alert-line"           },
    critical: { label: "Critical", color: "danger",    icon: "ri-close-circle-line"    },
    unknown:  { label: "Unknown",  color: "secondary", icon: "ri-question-line"        },
  },

  site: {
    true:  { label: "Actif",   color: "success",   icon: "ri-map-pin-line"   },
    false: { label: "Inactif", color: "secondary", icon: "ri-map-pin-2-line" },
  },

  alert: {
    WARNING:  { label: "Warning",  color: "warning", icon: "ri-alert-line"        },
    CRITICAL: { label: "Critical", color: "danger",  icon: "ri-close-circle-line" },
  },

  // ✅ AJOUT : statuts développeur (validation, bot, externe)
  devStatus: {
    validated: { label: "Validé",   color: "success",   icon: "ri-checkbox-circle-line" },
    pending:   { label: "En attente", color: "warning", icon: "ri-time-line"             },
    bot:       { label: "Bot",       color: "secondary", icon: "ri-robot-line"           },
    external:  { label: "Externe",   color: "info",      icon: "ri-user-shared-line"     },
  },

  // ✅ AJOUT : statuts import CSV/Excel
  importStatus: {
    pending:    { label: "En attente", color: "warning",   icon: "ri-time-line"             },
    processing: { label: "En cours",   color: "info",      icon: "ri-loader-4-line"         },
    completed:  { label: "Terminé",    color: "success",   icon: "ri-checkbox-circle-line"  },
    failed:     { label: "Échoué",     color: "danger",    icon: "ri-close-circle-line"     },
  },
};

export default function StatusBadge({ type, value, size = "sm" }) {
  const typeConfig = CONFIG[type];
  if (!typeConfig) return null;

  const key = String(value);

  // ✅ FIX : fallback neutre — pas de badge trompeur
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
