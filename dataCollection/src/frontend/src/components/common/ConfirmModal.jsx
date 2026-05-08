import AdminModal from "./AdminModal";

export default function ConfirmModal({
  show=false, 
  title="Confirmer", 
  message="Voulez-vous continuer ?",
  confirmLabel="Confirmer", 
  confirmColor="danger",
  icon="ri-error-warning-line", 
  iconColor="danger",
  onConfirm, 
  onClose, 
  loading=false,
}) {
  return (
    <AdminModal
      show={show}
      onClose={onClose}
      title={title}
      icon={icon}
      iconBg={`bg-${iconColor}-subtle`}
      iconColor={`text-${iconColor}`}
      loading={loading}
      maxWidth={400}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
          <button className={`btn btn-sm btn-${confirmColor} px-4 fw-bold`} onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="spinner-border spinner-border-sm me-2" />En cours...</> : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-center py-2">
        <p className="text-muted mb-0 fs-14">{message}</p>
      </div>
    </AdminModal>
  );
}
