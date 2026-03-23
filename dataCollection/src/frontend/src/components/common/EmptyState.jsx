/**
 * components/common/EmptyState.jsx — inchangé.
 */
export default function EmptyState({
  icon="ri-inbox-line", title="Aucune donnée",
  description="Aucun élément à afficher pour le moment.",
  actionLabel=null, onAction=null, compact=false,
}) {
  return (
    <div className={`text-center ${compact ? "py-4" : "py-5"}`}>
      <div className="mb-3">
        <i className={`${icon} text-muted`} style={{ fontSize: compact ? "2.5rem" : "3.5rem", opacity: 0.3 }} />
      </div>
      <h5 className="text-muted mb-2" style={{ fontSize: compact ? "0.95rem" : "1.1rem" }}>{title}</h5>
      {description && <p className="text-muted mb-4 fs-13">{description}</p>}
      {actionLabel && onAction && (
        <button className="btn btn-primary btn-sm" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
