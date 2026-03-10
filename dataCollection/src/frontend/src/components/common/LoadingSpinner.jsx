/**
 * LoadingSpinner — Spinner réutilisable
 * Usage : <LoadingSpinner />
 *         <LoadingSpinner size="sm" color="success" text="Chargement..." />
 *         <LoadingSpinner fullPage />
 */
export default function LoadingSpinner({
  size     = "md",
  color    = "primary",
  text     = "Chargement...",
  fullPage = false,
}) {
  const sizeMap = { sm: "1.5rem", md: "3rem", lg: "4rem" };
  const dim     = sizeMap[size] || sizeMap.md;

  const spinner = (
    <div className="d-flex flex-column align-items-center justify-content-center gap-3">
      <div
        className={`spinner-border text-${color}`}
        style={{ width: dim, height: dim }}
        role="status"
      >
        <span className="visually-hidden">Chargement...</span>
      </div>
      {text && <p className="text-muted mb-0 fs-13">{text}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div
        className="d-flex align-items-center justify-content-center"
        style={{ minHeight: "60vh" }}
      >
        {spinner}
      </div>
    );
  }

  return (
    <div className="text-center py-5">
      {spinner}
    </div>
  );
}