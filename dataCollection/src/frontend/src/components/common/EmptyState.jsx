/**
 * components/common/EmptyState.jsx
 *
 * AMÉLIORATIONS PRO :
 *   1. ✅ Variantes visuelles : default | info | warning | search | import | error
 *      Chaque variante a une couleur et une illustration adaptées au contexte.
 *   2. ✅ Support action secondaire (ex: "En savoir plus" + "Créer")
 *   3. ✅ Slot `extra` pour injecter du contenu custom (badges, liens, etc.)
 *   4. ✅ Animation d'apparition douce (fade-in CSS)
 *   5. ✅ Tailles : xs | sm | md | lg
 *
 * Usage :
 *   <EmptyState
 *     variant="search"
 *     title="Aucun résultat"
 *     description="Essayez d'autres termes de recherche."
 *   />
 *
 *   <EmptyState
 *     variant="import"
 *     title="Aucun développeur"
 *     description="Commencez par importer des développeurs depuis GitLab ou via CSV."
 *     actionLabel="Importer des développeurs"
 *     onAction={() => navigate("/admin/developers/import")}
 *     secondaryLabel="Créer manuellement"
 *     onSecondary={() => setShowCreate(true)}
 *   />
 */

const VARIANT_CONFIG = {
  default: { color: "secondary", bgColor: "rgba(108,117,125,0.06)", icon: "ri-inbox-line"            },
  info:    { color: "primary",   bgColor: "rgba(64,81,137,0.06)",   icon: "ri-information-line"      },
  warning: { color: "warning",   bgColor: "rgba(247,184,75,0.08)",  icon: "ri-alert-line"            },
  error:   { color: "danger",    bgColor: "rgba(240,101,72,0.06)",  icon: "ri-error-warning-line"    },
  search:  { color: "primary",   bgColor: "rgba(64,81,137,0.06)",   icon: "ri-search-line"           },
  import:  { color: "success",   bgColor: "rgba(10,179,156,0.06)",  icon: "ri-upload-cloud-2-line"   },
  dev:     { color: "primary",   bgColor: "rgba(64,81,137,0.06)",   icon: "ri-team-line"             },
  kpi:     { color: "info",      bgColor: "rgba(41,156,219,0.06)",  icon: "ri-bar-chart-2-line"      },
  project: { color: "primary",   bgColor: "rgba(64,81,137,0.06)",   icon: "ri-folder-line"           },
  commit:  { color: "secondary", bgColor: "rgba(108,117,125,0.06)", icon: "ri-git-commit-line"       },
  alert:   { color: "danger",    bgColor: "rgba(240,101,72,0.06)",  icon: "ri-alarm-warning-line"    },
};

const SIZE_CONFIG = {
  xs: { iconSize: "1.8rem", titleSize: "0.85rem", py: "py-3", avatarSize: 40 },
  sm: { iconSize: "2.5rem", titleSize: "0.95rem", py: "py-4", avatarSize: 48 },
  md: { iconSize: "3rem",   titleSize: "1rem",    py: "py-5", avatarSize: 56 },
  lg: { iconSize: "4rem",   titleSize: "1.15rem", py: "py-5", avatarSize: 72 },
};

export default function EmptyState({
  // Apparence
  icon       = null,        // Override icône (sinon pris depuis variant)
  variant    = "default",   // default | info | warning | error | search | import | dev | kpi | project | commit | alert
  size       = "md",        // xs | sm | md | lg
  // Contenu
  title      = "Aucune donnée",
  description = "Aucun élément à afficher pour le moment.",
  // Actions
  actionLabel    = null,
  onAction       = null,
  actionIcon     = "ri-add-line",
  secondaryLabel = null,
  onSecondary    = null,
  // Slots
  extra = null,             // JSX custom injecté sous les boutons
  // Layout
  inline = false,           // true = horizontal compact (icon + texte côte à côte)
}) {
  const vConf = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.default;
  const sConf = SIZE_CONFIG[size]       ?? SIZE_CONFIG.md;
  const displayIcon = icon ?? vConf.icon;

  if (inline) {
    return (
      <div
        className="d-flex align-items-center gap-3 p-3 rounded-3"
        style={{ background: vConf.bgColor, border: `1px solid rgba(0,0,0,0.05)` }}
      >
        <span
          className={`rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 text-${vConf.color}`}
          style={{ width: 36, height: 36, background: vConf.bgColor, fontSize: "1.1rem" }}
        >
          <i className={displayIcon} />
        </span>
        <div className="flex-grow-1">
          <p className="mb-0 fw-semibold fs-13">{title}</p>
          {description && <p className="mb-0 text-muted fs-12">{description}</p>}
        </div>
        {actionLabel && onAction && (
          <button className={`btn btn-${vConf.color} btn-sm flex-shrink-0`} onClick={onAction}>
            <i className={`${actionIcon} me-1`} />{actionLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`text-center ${sConf.py}`}
      style={{ animation: "fadeInUp 0.3s ease forwards" }}
    >
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Icône dans un cercle coloré */}
      <div className="d-flex justify-content-center mb-3">
        <div
          className={`rounded-circle d-flex align-items-center justify-content-center text-${vConf.color}`}
          style={{
            width:      sConf.avatarSize,
            height:     sConf.avatarSize,
            background: vConf.bgColor,
            border:     `2px solid ${vConf.bgColor}`,
            fontSize:   sConf.iconSize,
          }}
        >
          <i className={displayIcon} style={{ opacity: 0.75 }} />
        </div>
      </div>

      {/* Texte */}
      <h5
        className="text-muted mb-2 fw-semibold"
        style={{ fontSize: sConf.titleSize }}
      >
        {title}
      </h5>
      {description && (
        <p className="text-muted mb-4 fs-13 mx-auto" style={{ maxWidth: 360 }}>
          {description}
        </p>
      )}

      {/* Actions */}
      {(actionLabel || secondaryLabel) && (
        <div className="d-flex align-items-center justify-content-center gap-2 flex-wrap">
          {actionLabel && onAction && (
            <button
              className={`btn btn-${vConf.color} btn-sm px-4`}
              onClick={onAction}
            >
              <i className={`${actionIcon} me-1`} />
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              className="btn btn-light btn-sm px-4"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}

      {/* Slot extra */}
      {extra && <div className="mt-3">{extra}</div>}
    </div>
  );
}
