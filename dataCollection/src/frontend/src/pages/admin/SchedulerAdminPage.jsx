/**
 * SchedulerAdminPage.jsx
 * 
 * Admin interface for monitoring and managing the automated extraction scheduler.
 * 
 * Features:
 * - View scheduler status and next scheduled run
 * - Manual trigger for extractions
 * - View extraction history
 * - Manage periods (open/close)
 * - View recent extraction lots with status
 * 
 * Design: Matches existing admin pages visual theme with Bootstrap-like styling
 */
import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import api from "../../services/api";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import StatusBadge from "../../components/common/StatusBadge";
import UserAvatar from "../../components/common/UserAvatar";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";

// DevCell component for displaying developers with avatars
function DevCell({ lot }) {
  const developers = lot.targeted_developers || [];
  
  if (developers.length === 0) {
    return (
      <div className="d-flex align-items-center gap-2">
        <div className="avatar-xs rounded-circle bg-secondary-subtle text-secondary d-flex align-items-center justify-content-center" style={{ width: 28, height: 28 }}>
          <i className="ri-user-line fs-12"></i>
        </div>
        <span className="text-muted fs-12">
          {lot.developer_name 
            ? lot.developer_name 
            : lot.developer_id === null 
              ? 'Legacy (Projet)' 
              : `Dev #${lot.developer_id}`
          }
        </span>
      </div>
    );
  }

  const displayDevs = developers.slice(0, 4);
  const remaining = developers.length - displayDevs.length;

  return (
    <div className="d-flex align-items-center gap-2">
      <div className="avatar-group d-flex align-items-center">
        {displayDevs.map((name, i) => (
          <div key={i} className="avatar-group-item" style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
            <UserAvatar 
              name={name} 
              size={28} 
              border={true}
              title={name}
            />
          </div>
        ))}
        {remaining > 0 && (
          <div className="avatar-group-item" style={{ marginLeft: -8, zIndex: 0 }}>
            <div className="avatar-xs rounded-circle bg-light text-muted border border-2 border-white d-flex align-items-center justify-content-center shadow-sm fw-bold" 
                 style={{ width: 28, height: 28, fontSize: 10 }}>
              +{remaining}
            </div>
          </div>
        )}
      </div>
      <span className="badge bg-soft-info text-info border-0 p-0 fs-10 fw-medium">
        {developers.length} Devs
      </span>
    </div>
  );
}

const SchedulerAdminPage = () => {
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [extractionHistory, setExtractionHistory] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const loadSchedulerData = useCallback(async () => {
    setLoading(true);
    try {
      // Load scheduler status
      const statusRes = await api.get("/admin/scheduler/status");
      setSchedulerStatus(statusRes.data);

      // Load extraction history
      const historyRes = await api.get("/admin/scheduler/history?limit=20");
      setExtractionHistory(historyRes.data.extractions);

      // Load periods
      const periodsRes = await api.get("/admin/scheduler/periods");
      setPeriods(periodsRes.data.periods);

      // Load projects for name mapping (uses correct database context via api service)
      const projectsRes = await api.get("/projects", { params: { all_projects: true } });
      const projectsData = Array.isArray(projectsRes.data) ? projectsRes.data : (projectsRes.data?.items ?? []);
      setProjects(projectsData);
    } catch (error) {
      console.error("Failed to load scheduler data:", error);
      showToast("Failed to load scheduler data", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSchedulerData();
  }, [loadSchedulerData]);

  const handleManualTrigger = async () => {
    if (!confirm(`Trigger manual extraction for ${selectedYear}/${selectedMonth.toString().padStart(2, '0')}?`)) {
      return;
    }

    setTriggering(true);
    try {
      const res = await api.post("/admin/scheduler/trigger", {
        year: selectedYear,
        month: selectedMonth
      });
      
      showToast(`Manual extraction completed: ${res.data.result.projects_processed} projects processed`);
      loadSchedulerData();
    } catch (error) {
      console.error("Manual trigger failed:", error);
      showToast(error.message || "Manual extraction failed", "danger");
    } finally {
      setTriggering(false);
    }
  };

  const handleClosePeriod = async (periodId) => {
    if (!confirm("Close this period? This will prevent further extractions.")) {
      return;
    }

    try {
      await api.post(`/admin/scheduler/period/${periodId}/close`);
      showToast("Period closed successfully");
      loadSchedulerData();
    } catch (error) {
      console.error("Failed to close period:", error);
      showToast("Failed to close period", "danger");
    }
  };

  const handleOpenPeriod = async (periodId) => {
    if (!confirm("Open this period? This will allow extractions again.")) {
      return;
    }

    try {
      await api.post(`/admin/scheduler/period/${periodId}/open`);
      showToast("Period opened successfully");
      loadSchedulerData();
    } catch (error) {
      console.error("Failed to open period:", error);
      showToast("Failed to open period", "danger");
    }
  };

  const openCount = periods.filter(p => p.status === "open").length;
  const closedCount = periods.filter(p => p.status === "closed").length;

  // Helper function to get project name from ID using correct database context
  const getProjectName = (projectId) => {
    const project = projects.find(p => p.id === projectId || p.gitlab_project_id === projectId);
    return project ? project.name : projectId;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Toast */}
        {toastMsg && (
          <div className={`alert alert-${toastMsg.type} position-fixed top-0 end-0 m-3 shadow`} style={{ zIndex: 9999, minWidth: 300 }}>
            <i className={`${toastMsg.type === "success" ? "ri-checkbox-circle-line" : "ri-error-warning-line"} me-2`}></i>
            {toastMsg.msg}
          </div>
        )}

        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-time-line me-2 text-primary"></i>Administration du Scheduler
              </h4>
              <button 
                className="btn btn-light border px-4 fs-13 fw-medium" 
                onClick={loadSchedulerData}
                disabled={loading}
              >
                <i className="ri-refresh-line me-1"></i> Rafraîchir
              </button>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Scheduler</li>
            </ol>
          </div>
        </div>

        {/* Stats Hub */}
        <div className="row g-4 mb-4">
          {[
            { label: "Statut Scheduler", value: schedulerStatus?.enabled ? "Actif" : "Inactif", color: schedulerStatus?.enabled ? "success" : "secondary", icon: schedulerStatus?.enabled ? "ri-checkbox-circle-line" : "ri-close-circle-line" },
            { label: "Prochain Run", value: schedulerStatus?.next_run ? new Date(schedulerStatus.next_run).toLocaleDateString() : "Non planifié", color: "primary", icon: "ri-calendar-event-line" },
            { label: "Périodes Ouvertes", value: openCount, color: "success", icon: "ri-lock-unlock-line" },
            { label: "Périodes Clôturées", value: closedCount, color: "secondary", icon: "ri-lock-line" },
          ].map((s, i) => (
            <div className="col-xl-3 col-sm-6" key={i}>
              <div className="card border-0 shadow-sm rounded-4 h-100">
                <div className="card-body p-4 d-flex align-items-center gap-3">
                  <div className={`avatar-md rounded-circle d-flex align-items-center justify-content-center bg-${s.color}-subtle`} style={{ width: 48, height: 48 }}>
                    <i className={`${s.icon} fs-22 text-${s.color}`}></i>
                  </div>
                  <div className="flex-grow-1">
                    <div className="fs-11 text-muted fw-medium mb-1">{s.label}</div>
                    <div className="fs-16 fw-bold text-dark">{s.value}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="row g-4">
          {/* Left Column - Manual Trigger & Periods */}
          <div className="col-lg-6">
            
            {/* Manual Trigger Card */}
            <div className="card border-0 shadow-sm rounded-4 mb-4">
              <div className="card-header border-0 bg-transparent pb-3">
                <h5 className="mb-0">
                  <i className="ri-rocket-2-line me-2 text-primary"></i>
                  Déclenchement Manuel
                </h5>
              </div>
              <div className="card-body">
                <div className="alert alert-secondary py-2 mb-3 border-0 bg-light">
                  <i className="ri-information-line me-2 text-primary"></i>
                  Utilisez ceci pour relancer des extractions échouées ou pour compléter des données manquantes
                </div>
                <div className="row g-3">
                  <div className="col-6">
                    <label className="form-label fw-medium fs-13">Année</label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0"><i className="ri-calendar-line text-muted"></i></span>
                      <input 
                        type="number" 
                        className="form-control border-start-0 ps-0" 
                        value={selectedYear}
                        min={2020}
                        max={2030}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-medium fs-13">Mois</label>
                    <select 
                      className="form-select bg-light"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    >
                      {[...Array(12).keys()].map(i => (
                        <option key={i+1} value={i+1}>{i+1}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleManualTrigger}
                  disabled={triggering}
                  className="btn btn-primary shadow-sm fs-13 fw-bold px-4 mt-3 w-100"
                >
                  {triggering ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>Déclenchement...</>
                  ) : (
                    <><i className="ri-play-line me-1"></i>Déclencher l'Extraction</>
                  )}
                </button>
              </div>
            </div>

            {/* Periods Management Card */}
            <div className="card border-0 shadow-sm rounded-4">
              <div className="card-header border-0 bg-transparent pb-3">
                <h5 className="mb-0">
                  <i className="ri-calendar-check-line me-2 text-primary"></i>
                  Gestion des Périodes
                </h5>
              </div>
              <div className="card-body">
                {periods.length === 0 ? (
                  <EmptyState 
                    icon="ri-calendar-line"
                    message="Aucune période disponible"
                    subMessage="Les périodes seront créées automatiquement par le scheduler"
                  />
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover table-sm fs-13">
                      <thead>
                        <tr>
                          <th>Période</th>
                          <th>Statut</th>
                          <th>Extractions</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periods.map((period) => (
                          <tr key={period.id}>
                            <td className="fw-medium">
                              {period.year}/{period.month.toString().padStart(2, '0')}
                            </td>
                            <td>
                              <StatusBadge type="period" value={period.status} />
                            </td>
                            <td>{period.extraction_count}</td>
                            <td>
                              {period.status === 'open' ? (
                                <button
                                  onClick={() => handleClosePeriod(period.id)}
                                  className="btn btn-sm btn-light border text-danger"
                                >
                                  <i className="ri-lock-line me-1"></i> Clôturer
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleOpenPeriod(period.id)}
                                  className="btn btn-sm btn-light border text-success"
                                >
                                  <i className="ri-lock-unlock-line me-1"></i> Ouvrir
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Column - Extraction History */}
          <div className="col-lg-6">
            <div className="card border-0 shadow-sm rounded-4 h-100">
              <div className="card-header border-0 bg-transparent pb-3">
                <h5 className="mb-0">
                  <i className="ri-history-line me-2 text-primary"></i>
                  Historique des Extractions
                </h5>
              </div>
              <div className="card-body">
                {extractionHistory.length === 0 ? (
                  <EmptyState 
                    icon="ri-database-2-line"
                    message="Aucune extraction disponible"
                    subMessage="Les extractions apparaîtront ici après exécution"
                  />
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover table-sm fs-12">
                      <thead>
                        <tr>
                          <th>Période</th>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Statut</th>
                          <th>Développeur</th>
                          <th>Projet</th>
                          <th>Items</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractionHistory.map((lot) => (
                          <tr key={lot.id}>
                            <td className="fw-medium">{lot.period || '-'}</td>
                            <td className="text-muted">
                              {lot.created_at ? new Date(lot.created_at).toLocaleDateString('fr-FR') : '-'}
                              {lot.is_manual && (
                                <span className="badge bg-warning-subtle text-warning ms-1 fs-10">
                                  <i className="ri-hand-coin-line me-1"></i>Manuel
                                </span>
                              )}
                            </td>
                            <td>{lot.extraction_type}</td>
                            <td>
                              <StatusBadge type="lot" value={lot.status} />
                              {lot.status === 'failed' && lot.error_message && (
                                <div className="text-danger fs-10 mt-1" title={lot.error_message}>
                                  <i className="ri-error-warning-line me-1"></i>
                                  {lot.error_message.length > 30 ? lot.error_message.substring(0, 30) + '...' : lot.error_message}
                                </div>
                              )}
                            </td>
                            <td>
                              <DevCell lot={lot} />
                            </td>
                            <td>{getProjectName(lot.project_id)}</td>
                            <td>{lot.items_count || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default SchedulerAdminPage;
