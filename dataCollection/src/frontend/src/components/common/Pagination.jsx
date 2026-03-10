/**
 * Pagination — Composant pagination réutilisable
 *
 * Usage : <Pagination
 *           page={page}
 *           totalPages={totalPages}
 *           totalItems={totalItems}
 *           perPage={perPage}
 *           onPageChange={setPage}
 *         />
 */
export default function Pagination({
  page,
  totalPages,
  totalItems,
  perPage,
  onPageChange,
  showInfo = true,
}) {
  if (totalPages <= 1) return null;

  // Fenêtre de pages : max 5 pages affichées
  const getPages = () => {
    const delta = 2;
    const range = [];
    for (
      let i = Math.max(1, page - delta);
      i <= Math.min(totalPages, page + delta);
      i++
    ) {
      range.push(i);
    }
    return range;
  };

  const from = Math.min((page - 1) * perPage + 1, totalItems);
  const to   = Math.min(page * perPage, totalItems);

  return (
    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">

      {showInfo && (
        <p className="text-muted mb-0 fs-13">
          Affichage{" "}
          <span className="fw-semibold text-body">{from}</span>
          {" "}–{" "}
          <span className="fw-semibold text-body">{to}</span>
          {" "}sur{" "}
          <span className="fw-semibold text-body">{totalItems}</span>
        </p>
      )}

      <ul className="pagination pagination-separated mb-0">

        {/* Précédent */}
        <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
          <button
            className="page-link"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
          >
            <i className="ri-arrow-left-s-line"></i>
          </button>
        </li>

        {/* Première page si hors fenêtre */}
        {getPages()[0] > 1 && (
          <>
            <li className="page-item">
              <button className="page-link" onClick={() => onPageChange(1)}>1</button>
            </li>
            {getPages()[0] > 2 && (
              <li className="page-item disabled">
                <span className="page-link">…</span>
              </li>
            )}
          </>
        )}

        {/* Pages de la fenêtre */}
        {getPages().map((p) => (
          <li key={p} className={`page-item ${p === page ? "active" : ""}`}>
            <button className="page-link" onClick={() => onPageChange(p)}>
              {p}
            </button>
          </li>
        ))}

        {/* Dernière page si hors fenêtre */}
        {getPages().at(-1) < totalPages && (
          <>
            {getPages().at(-1) < totalPages - 1 && (
              <li className="page-item disabled">
                <span className="page-link">…</span>
              </li>
            )}
            <li className="page-item">
              <button className="page-link" onClick={() => onPageChange(totalPages)}>
                {totalPages}
              </button>
            </li>
          </>
        )}

        {/* Suivant */}
        <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
          <button
            className="page-link"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <i className="ri-arrow-right-s-line"></i>
          </button>
        </li>

      </ul>
    </div>
  );
}