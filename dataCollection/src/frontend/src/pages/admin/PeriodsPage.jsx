/**
 * pages/admin/PeriodsPage.jsx
 * CORRECTION v3 : réécriture propre du bloc return pour résoudre
 * définitivement les erreurs Babel "Unterminated JSX" / "Adjacent JSX elements".
 */
import { useState, useEffect, useCallback } from "react";
import periodService  from "../../services/periodService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import StatusBadge    from "../../components/common/StatusBadge";
import Pagination     from "../../components/common/Pagination";
import AdminModal     from "../../components/common/AdminModal";

const MONTHS = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

// ── Sub-component: Create Period Modal ───────────────────────────────────────
function CreatePeriodModal({ onClose, onSave }) {
  const currentDate = new Date();
  const [year,    setYear]    = useState(currentDate.getFullYear());
  const [month,   setMonth]   = useState(currentDate.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    try { await periodService.create(year, month); onSave(); }
    catch(err) { setError(err.response?.data?.detail || "Erreur lors de la création."); }
    finally { setLoading(false); }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Nouvelle période"
      subtitle="Initialiser un nouveau mois d'analyse KPI"
      icon="ri-calendar-check-line"
      loading={loading}
      maxWidth={480}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4 fw-medium" onClick={onClose} disabled={loading}>Annuler</button>
          <button className="btn btn-sm btn-primary px-4 fw-bold shadow-sm" onClick={handleSubmit} disabled={loading}>
            {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Création...</> : <><i className="ri-add-line me-1"></i>Créer la période</>}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-danger py-2 fs-13 mb-3"><i className="ri-error-warning-line me-1"></i>{error}</div>}
      <div className="row g-3">
        <div className="col-6">
          <label className="form-label fw-medium fs-13">Année de référence</label>
          <div className="input-group">
            <span className="input-group-text bg-light border-end-0"><i className="ri-time-line text-muted"></i></span>
            <input type="number" className="form-control border-start-0 ps-0" value={year} min={2020} max={2030} onChange={(e) => setYear(parseInt(e.target.value))} />
          </div>
        </div>
        <div className="col-6">
          <label className="form-label fw-medium fs-13">Mois d'analyse</label>
          <select className="form-select bg-light" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 p-3 rounded-3 bg-primary-subtle border border-primary-subtle">
        <div className="d-flex align-items-start gap-2">
          <i className="ri-information-line fs-16 text-primary mt-1"></i>
          <p className="mb-0 fs-12 text-primary-emphasis" style={{lineHeight: "1.4"}}>
            L'ouverture d'une période active la collecte de données GitLab pour ce mois. Cette action est irréversible.
          </p>
        </div>
      </div>
    </AdminModal>
  );
}

// ── Sub-component: Delete Period Modal ──────────────────────────────────────
function DeletePeriodModal({ period, onClose, onConfirm, onDeleteLots }) {
  const [confirming,    setConfirming]    = useState(false);
  const [purgingLots,   setPurgingLots]   = useState(false);
  const [error,         setError]         = useState("");
  const [lotsBlocking,  setLotsBlocking]  = useState(false); // true si l'erreur est due aux lots

  const handleConfirm = async () => {
    setError(""); setConfirming(true);
    try {
      await onConfirm();
    } catch(err) {
      const msg = err.response?.data?.detail || "Erreur lors de la suppression.";
      setError(msg);
      // Détecte si le message concerne des lots d'extraction
      setLotsBlocking(msg.includes("lot(s) d'extraction"));
      setConfirming(false);
    }
  };

  const handlePurgeAndDelete = async () => {
    setError(""); setPurgingLots(true);
    try {
      // Étape 1 : vider tous les lots
      await onDeleteLots();
      // Étape 2 : supprimer la période (maintenant vide)
      await onConfirm();
    } catch(err) {
      const msg = err.response?.data?.detail || "Erreur lors de la purge.";
      setError(msg);
      setLotsBlocking(false);
      setPurgingLots(false);
    }
  };

  const isLoading = confirming || purgingLots;

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Supprimer la période"
      subtitle="Cette action est irréversible"
      icon="ri-delete-bin-6-line"
      iconBg="bg-danger-subtle"
      iconColor="text-danger"
      loading={isLoading}
      maxWidth={480}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4 fw-medium" onClick={onClose} disabled={isLoading}>
            Annuler
          </button>
          {lotsBlocking ? (
            /* Bouton alternatif quand des lots bloquent la suppression */
            <button
              className="btn btn-sm btn-warning px-4 fw-bold shadow-sm"
              onClick={handlePurgeAndDelete}
              disabled={isLoading}
            >
              {purgingLots
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Purge en cours...</>
                : <><i className="ri-delete-bin-2-line me-1"></i>Vider les lots &amp; Supprimer</>
              }
            </button>
          ) : (
            <button
              className="btn btn-sm btn-danger px-4 fw-bold shadow-sm"
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {confirming
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Suppression...</>
                : <><i className="ri-delete-bin-6-line me-1"></i>Confirmer la suppression</>
              }
            </button>
          )}
        </>
      }
    >
      {/* Bandeau d'erreur avec action contextuelle */}
      {error && (
        <div className={`alert py-2 fs-13 mb-3 border-0 ${lotsBlocking ? "alert-warning" : "alert-danger"}`}>
          <i className={`me-2 ${lotsBlocking ? "ri-archive-line" : "ri-error-warning-line"}`}></i>
          {error}
          {lotsBlocking && (
            <div className="mt-2 fs-12 fw-medium">
              <i className="ri-arrow-right-line me-1"></i>
              Cliquez sur <strong>"Vider les lots &amp; Supprimer"</strong> pour supprimer les lots puis la période en une seule action.
            </div>
          )}
        </div>
      )}

      <div className="d-flex align-items-center mb-4 p-3 bg-danger-subtle rounded-3">
        <div className="flex-shrink-0 avatar-xs bg-danger rounded-circle d-flex align-items-center justify-content-center me-3">
          <i className="ri-calendar-close-line text-white"></i>
        </div>
        <div>
          <h6 className="mb-0 fw-bold text-danger">{period.year} / {String(period.month).padStart(2, "0")}</h6>
          <p className="text-muted fs-12 mb-0">{MONTHS[period.month]} — Période ouverte</p>
        </div>
      </div>

      <p className="fs-13 text-dark mb-3">
        Vous êtes sur le point de <strong>supprimer définitivement</strong> cette période et toutes ses références.
      </p>

      <div className="vstack gap-2 mb-3">
        <div className="d-flex align-items-start gap-2 fs-12 text-success">
          <i className="ri-checkbox-circle-fill mt-1 flex-shrink-0"></i>
          <span>Applicable aux périodes <strong>ouvertes</strong>. Si des lots existent, utilisez le bouton jaune pour tout supprimer en une fois.</span>
        </div>
        <div className="d-flex align-items-start gap-2 fs-12 text-danger">
          <i className="ri-close-circle-fill mt-1 flex-shrink-0"></i>
          <span>Les périodes <strong>clôturées</strong> et celles avec des <strong>jobs en cours</strong> ne peuvent pas être supprimées.</span>
        </div>
      </div>

      <div className="alert alert-danger border-danger-subtle py-2 mb-0 fs-12">
        <i className="ri-error-warning-line me-2"></i>
        <strong>Attention :</strong> Cette action est irréversible. Aucune restauration ne sera possible.
      </div>
    </AdminModal>
  );
}

// ── Sub-component: Advanced Close Modal ─────────────────────────────────────
function AdvancedCloseModal({ period, onClose, onConfirm }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    periodService.validate(period.id)
      .then(setData)
      .catch(() => setError("Impossible de charger le bilan de validation."))
      .finally(() => setLoading(false));
  }, [period.id]);

  const handleConfirm = async () => {
    setConfirming(true);
    try { await onConfirm(); }
    catch(err) { setError(err.response?.data?.detail || "Erreur lors de la clôture."); setConfirming(false); }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Clôture de période"
      subtitle="Vérification de l'intégrité avant scellage des données"
      icon="ri-lock-password-fill"
      iconBg="bg-danger-subtle"
      iconColor="text-danger"
      loading={confirming}
      maxWidth={520}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4 fw-medium" onClick={onClose} disabled={confirming}>Abandonner</button>
          <button className="btn btn-sm btn-danger px-4 fw-bold shadow-sm" onClick={handleConfirm} disabled={!data?.can_close || confirming}>
            {confirming ? <><span className="spinner-border spinner-border-sm me-2"></span>Scellage...</> : <><i className="ri-lock-line me-1"></i>Confirmer la Clôture</>}
          </button>
        </>
      }
    >
      <div className="d-flex align-items-center mb-4 p-3 bg-light rounded-3">
        <div className="flex-shrink-0 avatar-xs bg-dark rounded-circle d-flex align-items-center justify-content-center me-3">
          <i className="ri-calendar-line text-white"></i>
        </div>
        <div>
          <h6 className="mb-0 fw-bold">{period.year} / {String(period.month).padStart(2, "0")}</h6>
          <p className="text-muted fs-12 mb-0">Bilan consolidé de la période</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary"></div>
          <p className="mt-3 text-muted fs-13">Analyse des flux GitLab en cours...</p>
        </div>
      ) : error ? (
        <div className="alert alert-danger border-0"><i className="ri-error-warning-line me-2"></i>{error}</div>
      ) : (
        <div className="vstack gap-3">
          <div className={`p-3 rounded-3 border-2 transition-all ${data.can_close ? "bg-success-subtle border-success" : "bg-danger-subtle border-danger"}`} style={{borderStyle: "dashed"}}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h6 className={`mb-1 fw-bold ${data.can_close ? "text-success" : "text-danger"}`}>{data.can_close ? "VALIDATION OK" : "ERREUR DE COHÉRENCE"}</h6>
                <p className="mb-0 fs-11 text-muted">{data.running_jobs > 0 ? "Extraction en cours détectée." : "Toutes les conditions de clôture sont réunies."}</p>
              </div>
              <i className={`${data.can_close ? "ri-checkbox-circle-fill text-success" : "ri-error-warning-fill text-danger"} fs-2`}></i>
            </div>
          </div>
          <div className="row g-2 text-center">
            <div className="col-4"><div className="p-2 bg-light rounded-2"><span className="d-block fs-11 text-muted text-uppercase">Terminés</span><strong className="fs-16 text-dark">{data.completed_jobs}</strong></div></div>
            <div className="col-4"><div className="p-2 bg-light rounded-2"><span className="d-block fs-11 text-muted text-uppercase">En cours</span><strong className={`fs-16 ${data.running_jobs > 0 ? "text-warning" : "text-dark"}`}>{data.running_jobs}</strong></div></div>
            <div className="col-4"><div className="p-2 bg-light rounded-2"><span className="d-block fs-11 text-muted text-uppercase">Échecs</span><strong className={`fs-16 ${data.failed_jobs > 0 ? "text-danger" : "text-dark"}`}>{data.failed_jobs}</strong></div></div>
          </div>
          <div className="alert alert-secondary py-2 mb-0 fs-12 border-0 bg-light">
            <i className="ri-information-line me-2 text-primary"></i>
            La clôture scelle les données définitivement. Les rapports KPI seront archivés et ne pourront plus être modifiés.
          </div>
        </div>
      )}
    </AdminModal>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function PeriodsPage() {
  const [periods,      setPeriods]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showCreate,   setShowCreate]   = useState(false);
  const [closeTarget,  setCloseTarget]  = useState(null);
  const [closeLoading, setCloseLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast,        setToast]        = useState(null);
  const [page,         setPage]         = useState(1);
  const perPage = 10;

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadPeriods = useCallback(() => {
    setLoading(true);
    periodService.getAll()
      .then(setPeriods)
      .catch(() => showToast("Erreur chargement des périodes.", "danger"))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  const handleClose = async () => {
    if (!closeTarget) return;
    setCloseLoading(true);
    try {
      await periodService.close(closeTarget.id);
      setCloseTarget(null);
      showToast(`Période ${closeTarget.year}/${String(closeTarget.month).padStart(2, "0")} clôturée.`);
      loadPeriods();
    } catch(err) {
      setCloseTarget(null);
      showToast(err.response?.data?.detail || "Erreur lors de la clôture.", "danger");
    } finally {
      setCloseLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await periodService.delete(deleteTarget.id);
      showToast(`Période ${deleteTarget.year}/${String(deleteTarget.month).padStart(2, "0")} supprimée.`);
      setDeleteTarget(null);
      loadPeriods();
    } catch(err) {
      // l'erreur sera gérée dans la modale via le throw
      throw err;
    }
  };

  const handleDeleteLots = async () => {
    if (!deleteTarget) return;
    await periodService.deleteLots(deleteTarget.id);
  };


  const openCount   = periods.filter(p => p.status === "open").length;
  const closedCount = periods.filter(p => p.status === "closed").length;
  const totalPages  = Math.ceil(periods.length / perPage);
  const paginated   = periods.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Toast */}
        {toast && (
          <div className={`alert alert-${toast.type} position-fixed top-0 end-0 m-3 shadow`} style={{ zIndex: 9999, minWidth: 300 }}>
            <i className={`${toast.type === "success" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} me-2`}></i>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-calendar-2-line me-2 text-primary"></i>Gestion des Périodes
              </h4>
              <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => setShowCreate(true)}>
                <i className="ri-add-line me-2"></i> Nouvelle période
              </button>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Périodes d'analyse</li>
            </ol>
          </div>
        </div>

        {/* Stats Hub */}
        <div className="row g-4 mb-4">
          {[
            { label: "Total Périodes",     value: periods.length, color: "primary",   icon: "ri-calendar-2-line"   },
            { label: "Périodes Ouvertes",  value: openCount,      color: "success",   icon: "ri-lock-unlock-line"  },
            { label: "Périodes Clôturées", value: closedCount,    color: "secondary", icon: "ri-lock-line"         },
            { label: "Règle RG-01",        value: "Active",       color: "warning",   icon: "ri-shield-check-line" },
          ].map((s, i) => (
            <div className="col-xl-3 col-sm-6" key={i}>
              <div className="card border-0 shadow-sm rounded-4 h-100">
                <div className="card-body p-4 d-flex align-items-center gap-3">
                  <div className={`avatar-md rounded-circle d-flex align-items-center justify-content-center bg-${s.color}-subtle`} style={{ width: 48, height: 48 }}>
                    <i className={`${s.icon} fs-22 text-${s.color}`}></i>
                  </div>
                  <div>
                    <h4 className={`fw-bold mb-0 fs-24 text-${s.color}`}>{s.value}</h4>
                    <p className="text-muted fs-12 fw-bold text-uppercase ls-1 mb-0">{s.label}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Governance Alert */}
        <div className="alert alert-warning-soft border-0 d-flex align-items-start gap-3 mb-4 p-3 rounded-4">
          <i className="ri-shield-check-line fs-24 text-warning flex-shrink-0"></i>
          <div className="fs-13 text-warning-emphasis">
            <strong className="d-block mb-1">Règle métier RG-01 :</strong>
            Les extractions sont bloquées si la période courante est clôturée. Clôturer une période déclenche le dump mensuel automatique (archivage des lots REALTIME → MONTHLY + génération des snapshots KPI).
          </div>
        </div>

        {/* Periods Table */}
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-5">
          <div className="card-header bg-white border-bottom-light p-4">
            <div className="d-flex align-items-center justify-content-between">
              <h5 className="card-title mb-0 fw-bold">
                <i className="ri-list-check me-2 text-primary"></i>Registre des périodes
              </h5>
              <span className="badge bg-light text-muted border px-3 py-1 fs-12">{periods.length} entrées</span>
            </div>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="py-5 text-center">
                <LoadingSpinner text="Chargement des périodes..." />
              </div>
            ) : periods.length === 0 ? (
              <EmptyState
                icon="ri-calendar-2-line"
                title="Aucune période"
                description="Créez votre première période pour commencer les extractions."
                actionLabel="Créer une période"
                onAction={() => setShowCreate(true)}
              />
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="bg-light-subtle">
                      <tr>
                        <th className="ps-4 py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">ID</th>
                        <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Période</th>
                        <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Mois</th>
                        <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Statut</th>
                        <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Ouverture</th>
                        <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Clôture</th>
                        <th className="pe-4 py-3 text-end fs-11 text-uppercase text-muted ls-1 fw-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(period => (
                        <tr key={period.id}>
                          <td className="text-muted fs-12">#{period.id}</td>
                          <td>
                            <div className="d-flex align-items-center">
                              <div className="flex-shrink-0 avatar-xs me-2">
                                <div className="avatar-title bg-light text-primary rounded-circle fs-12">{period.month}</div>
                              </div>
                              <span className="fw-semibold fs-14">{period.year} / {String(period.month).padStart(2, "0")}</span>
                            </div>
                          </td>
                          <td className="text-muted">{MONTHS[period.month]}</td>
                          <td><StatusBadge type="period" value={period.status} /></td>
                          <td className="text-muted fs-12">
                            <i className="ri-time-line me-1"></i>
                            {period.created_at ? new Date(period.created_at).toLocaleDateString("fr-FR") : "—"}
                          </td>
                          <td className="fs-12">
                            {period.closed_at ? (
                              <div className="d-flex flex-column">
                                <span><i className="ri-calendar-check-line me-1 text-success"></i>{new Date(period.closed_at).toLocaleDateString("fr-FR")}</span>
                                <span className="text-muted"><i className="ri-user-follow-line me-1"></i>{period.closed_by_name || "Système"}</span>
                              </div>
                            ) : "—"}
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              {period.status === "open" ? (
                                <>
                                  <button
                                    className="btn btn-sm btn-soft-danger waves-effect waves-light"
                                    onClick={() => setCloseTarget(period)}
                                    title="Clôturer cette période"
                                  >
                                    <i className="ri-lock-password-line me-1"></i>Clôturer
                                  </button>
                                  <button
                                    className="btn btn-sm btn-soft-secondary waves-effect waves-light px-2"
                                    onClick={() => setDeleteTarget(period)}
                                    title="Supprimer cette période"
                                  >
                                    <i className="ri-delete-bin-6-line"></i>
                                  </button>
                                </>
                              ) : (
                                <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1">
                                  <i className="ri-shield-user-line me-1"></i>Archive Scellée
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} totalPages={totalPages} totalItems={periods.length} perPage={perPage} onPageChange={setPage} />
              </>
            )}
          </div>
        </div>

      </div>

      {/* Modals */}
      {showCreate && (
        <CreatePeriodModal
          onClose={() => setShowCreate(false)}
          onSave={() => { setShowCreate(false); showToast("Période créée avec succès."); loadPeriods(); }}
        />
      )}
      {closeTarget && (
        <AdvancedCloseModal
          period={closeTarget}
          onClose={() => setCloseTarget(null)}
          onConfirm={handleClose}
        />
      )}
      {deleteTarget && (
        <DeletePeriodModal
          period={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          onDeleteLots={handleDeleteLots}
        />
      )}
    </div>
  );
}
