/**
 * ConfirmModal — Modal de confirmation générique
 * Usage : <ConfirmModal
 *           show={showDelete}
 *           title="Supprimer cet élément ?"
 *           message="Cette action est irréversible."
 *           confirmLabel="Supprimer"
 *           confirmColor="danger"
 *           onConfirm={handleDelete}
 *           onClose={() => setShowDelete(false)}
 *         />
 */
export default function ConfirmModal({
  show         = false,
  title        = "Confirmer",
  message      = "Voulez-vous continuer ?",
  confirmLabel = "Confirmer",
  confirmColor = "danger",
  icon         = "ri-error-warning-line",
  iconColor    = "danger",
  onConfirm,
  onClose,
  loading      = false,
}) {
  if (!show) return null;

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 1055 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow">

          <div className="modal-header border-0 pb-0">
            <button
              className="btn-close"
              onClick={onClose}
              disabled={loading}
            ></button>
          </div>

          <div className="modal-body p-4 pt-2 text-center">
            <div className="avatar-md mx-auto mb-4">
              <div className={`avatar-title bg-${iconColor}-subtle text-${iconColor} rounded-circle fs-2`}>
                <i className={icon}></i>
              </div>
            </div>

            <h5 className="fw-semibold mb-2">{title}</h5>
            <p className="text-muted mb-0 fs-14">{message}</p>
          </div>

          <div className="modal-footer border-0 justify-content-center gap-2 pt-0">
            <button
              className="btn btn-light px-4"
              onClick={onClose}
              disabled={loading}
            >
              Annuler
            </button>
            <button
              className={`btn btn-${confirmColor} px-4`}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  En cours...
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}