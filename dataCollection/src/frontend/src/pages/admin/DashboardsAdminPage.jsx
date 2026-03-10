import { useState, useEffect } from "react";
import projectService    from "../../services/projectService";
import dashboardService  from "../../services/dashboardService";
import adminService      from "../../services/adminService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import ConfirmModal   from "../../components/common/ConfirmModal";
function CreateDashboardModal({ projects, onClose, onSave }) {
  const [form, setForm] = useState({
    name:       "",
    project_id: projects[0]?.id || "",
    view_group: "",
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async () => {
    setError("");
    if (!form.name.trim())   return setError("Le nom est requis.");
    if (!form.project_id)    return setError("Le projet est requis.");
    setLoading(true);
    try {
      await dashboardService.create({
        name:       form.name,
        project_id: parseInt(form.project_id),
        view_group: form.view_group || null,
      });
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur création dashboard.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 1055 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow">
          <div className="modal-header bg-light p-3">
            <h5 className="modal-title">
              <i className="ri-layout-grid-line me-2 text-primary"></i>
              Nouveau dashboard
            </h5>
            <button className="btn-close" onClick={onClose} disabled={loading}></button>
          </div>
          <div className="modal-body p-4">
            {error && (
              <div className="alert alert-danger py-2 fs-13">
                <i className="ri-error-warning-line me-1"></i>{error}
              </div>
            )}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label fw-medium">Nom *</label>
                <input
                  type="text" name="name" className="form-control"
                  placeholder="ex: Dashboard Q1 2026"
                  value={form.name} onChange={handle}
                />
              </div>
              <div className="col-12">
                <label className="form-label fw-medium">Projet *</label>
                <select
                  name="project_id" className="form-select"
                  value={form.project_id} onChange={handle}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label fw-medium">
                  Groupe de vue
                  <span className="text-muted fs-12 ms-2">(optionnel)</span>
                </label>
                <input
                  type="text" name="view_group" className="form-control"
                  placeholder="ex: managers, rh, direction..."
                  value={form.view_group} onChange={handle}
                />
                <p className="text-muted fs-12 mt-1 mb-0">
                  <i className="ri-information-line me-1"></i>
                  Les utilisateurs ayant ce groupe auront accès automatiquement.
                </p>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-light" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-primary" onClick={submit} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Création...</>
                : <><i className="ri-add-line me-1"></i>Créer</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccessModal({ dashboard, users, onClose, onSave }) {
  const [userId,  setUserId]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleGrant = async () => {
    if (!userId) return setError("Sélectionnez un utilisateur.");
    setLoading(true);
    setError("");
    try {
      await dashboardService.grantAccess(dashboard.id, parseInt(userId));
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de l'attribution.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 1055 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow">
          <div className="modal-header bg-light p-3">
            <h5 className="modal-title">
              <i className="ri-user-add-line me-2 text-success"></i>
              Gérer les accès — {dashboard.name}
            </h5>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body p-4">
            {error && (
              <div className="alert alert-danger py-2 fs-13">
                <i className="ri-error-warning-line me-1"></i>{error}
              </div>
            )}

            <label className="form-label fw-medium">Accorder l'accès à un utilisateur</label>
            <div className="input-group">
              <select
                className="form-select"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">-- Choisir un utilisateur --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.role})
                  </option>
                ))}
              </select>
              <button
                className="btn btn-success"
                onClick={handleGrant}
                disabled={loading || !userId}
              >
                {loading
                  ? <span className="spinner-border spinner-border-sm"></span>
                  : <><i className="ri-add-line me-1"></i>Accorder</>
                }
              </button>
            </div>

            {dashboard.view_group && (
              <div className="alert alert-info mt-3 mb-0 py-2 fs-13">
                <i className="ri-group-line me-1"></i>
                Groupe auto : <strong>{dashboard.view_group}</strong>
                — tous les users avec ce groupe ont déjà accès.
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-light" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardsAdminPage() {
  const [dashboards,   setDashboards]   = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showCreate,   setShowCreate]   = useState(false);
  const [accessTarget, setAccessTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading,setDeleteLoading]= useState(false);
  const [toast,        setToast]        = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      dashboardService.getMyDashboards(),
      projectService.getAll(),
      adminService.getUsers(),
    ])
      .then(([dashs, projs, usrs]) => {
        setDashboards(dashs);
        setProjects(projs);
        setUsers(usrs);
      })
      .catch(() => showToast("Erreur chargement.", "danger"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await dashboardService.delete(deleteTarget.id);
      setDeleteTarget(null);
      showToast("Dashboard supprimé.");
      loadAll();
    } catch (err) {
      setDeleteTarget(null);
      showToast(err.response?.data?.detail || "Erreur suppression.", "danger");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Toast */}
        {toast && (
          <div
            className={`alert alert-${toast.type} position-fixed top-0 end-0 m-3 shadow`}
            style={{ zIndex: 9999, minWidth: 300 }}
          >
            <i className={`${toast.type === "success" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} me-2`}></i>
            {toast.msg}
          </div>
        )}

        {/* Page Title */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-layout-grid-line me-2 text-primary"></i>
                Gestion des Dashboards
              </h4>
              <div className="page-title-right">
                <ol className="breadcrumb m-0">
                  <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                  <li className="breadcrumb-item active">Dashboards Admin</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Header action */}
        <div className="d-flex justify-content-end mb-4">
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
          >
            <i className="ri-add-line me-1"></i>Nouveau dashboard
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSpinner fullPage text="Chargement des dashboards..." />
        ) : dashboards.length === 0 ? (
          <EmptyState
            icon="ri-layout-grid-line"
            title="Aucun dashboard"
            description="Créez votre premier dashboard pour organiser les KPIs par projet."
            actionLabel="Créer un dashboard"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <div className="row g-3">
            {dashboards.map((dash) => {
              const project = projects.find((p) => p.id === dash.project_id);
              return (
                <div key={dash.id} className="col-xl-4 col-md-6">
                  <div className="card h-100">
                    <div className="card-body">
                      <div className="d-flex align-items-start justify-content-between mb-3">
                        <div className="d-flex align-items-center gap-3">
                          <div className="avatar-sm rounded bg-primary-subtle d-flex align-items-center justify-content-center">
                            <i className="ri-layout-grid-line text-primary fs-4"></i>
                          </div>
                          <div>
                            <h6 className="fw-semibold mb-0">{dash.name}</h6>
                            <p className="text-muted mb-0 fs-12">
                              <i className="ri-folder-2-line me-1"></i>
                              {project?.name || `Projet #${dash.project_id}`}
                            </p>
                          </div>
                        </div>
                        <div className="dropdown">
                          <button
                            className="btn btn-sm btn-ghost-secondary"
                            data-bs-toggle="dropdown"
                          >
                            <i className="ri-more-2-fill"></i>
                          </button>
                          <ul className="dropdown-menu dropdown-menu-end">
                            <li>
                              <button
                                className="dropdown-item"
                                onClick={() => setAccessTarget(dash)}
                              >
                                <i className="ri-user-add-line me-2"></i>Gérer les accès
                              </button>
                            </li>
                            <li><hr className="dropdown-divider" /></li>
                            <li>
                              <button
                                className="dropdown-item text-danger"
                                onClick={() => setDeleteTarget(dash)}
                              >
                                <i className="ri-delete-bin-line me-2"></i>Supprimer
                              </button>
                            </li>
                          </ul>
                        </div>
                      </div>

                      <div className="vstack gap-2">
                        {dash.view_group && (
                          <div className="d-flex align-items-center gap-2">
                            <i className="ri-group-line text-muted fs-14"></i>
                            <span className="fs-13 text-muted">Groupe :</span>
                            <span className="badge bg-info-subtle text-info">
                              {dash.view_group}
                            </span>
                          </div>
                        )}
                        <div className="d-flex align-items-center gap-2">
                          <i className="ri-calendar-line text-muted fs-14"></i>
                          <span className="fs-12 text-muted">
                            Créé le {dash.created_at
                              ? new Date(dash.created_at).toLocaleDateString("fr-FR")
                              : "—"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-top d-flex gap-2">
                        <button
                          className="btn btn-sm btn-soft-success flex-grow-1"
                          onClick={() => setAccessTarget(dash)}
                        >
                          <i className="ri-user-add-line me-1"></i>
                          Accès
                        </button>
                        <button
                          className="btn btn-sm btn-soft-danger"
                          onClick={() => setDeleteTarget(dash)}
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Modals */}
      {showCreate && (
        <CreateDashboardModal
          projects={projects}
          onClose={() => setShowCreate(false)}
          onSave={() => {
            setShowCreate(false);
            showToast("Dashboard créé.");
            loadAll();
          }}
        />
      )}

      {accessTarget && (
        <AccessModal
          dashboard={accessTarget}
          users={users}
          onClose={() => setAccessTarget(null)}
          onSave={() => {
            showToast("Accès accordé.");
          }}
        />
      )}

      <ConfirmModal
        show={!!deleteTarget}
        title="Supprimer ce dashboard ?"
        message={
          deleteTarget
            ? `Vous allez supprimer "${deleteTarget.name}". Les accès associés seront également supprimés.`
            : ""
        }
        confirmLabel="Supprimer"
        confirmColor="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}