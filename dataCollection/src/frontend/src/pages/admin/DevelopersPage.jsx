import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import developerService from "../../services/developerService";
import siteService      from "../../services/siteService";
import projectService   from "../../services/projectService";
import periodService    from "../../services/periodService";
import LoadingSpinner   from "../../components/common/LoadingSpinner";
import EmptyState       from "../../components/common/EmptyState";
import Pagination       from "../../components/common/Pagination";
import AdminModal       from "../../components/common/AdminModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name = "") {
  return (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const AVATAR_COLORS = ["#3577f1", "#0ab39c", "#f06548", "#299cdb", "#f7b84b", "#6f42c1"];
function avatarColor(seed = "") {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function devDisplayName(dev) {
  return dev.name || dev.gitlab_username || `#${dev.id}`;
}

function devHandle(dev) {
  return dev.gitlab_username ? `@${dev.gitlab_username}` : `#${dev.id}`;
}

// ── Détection des doublons (sur la liste globale, sans filtre projet) ─────────
function detectDuplicates(allDevelopers) {
  const byUsername   = {};
  const byEmail      = {};
  const duplicateIds = new Set();

  for (const dev of allDevelopers) {
    const key = (dev.gitlab_username || "").toLowerCase().trim();
    if (key) {
      if (!byUsername[key]) byUsername[key] = [];
      byUsername[key].push(dev.id);
    }
  }
  for (const dev of allDevelopers) {
    const key = (dev.email || "").toLowerCase().trim();
    if (key) {
      if (!byEmail[key]) byEmail[key] = [];
      byEmail[key].push(dev.id);
    }
  }
  for (const ids of Object.values(byUsername)) {
    if (ids.length > 1) {
      const canonical = Math.min(...ids);
      ids.filter(id => id !== canonical).forEach(id => duplicateIds.add(id));
    }
  }
  for (const ids of Object.values(byEmail)) {
    if (ids.length > 1) {
      const canonical = Math.min(...ids);
      ids.filter(id => id !== canonical).forEach(id => duplicateIds.add(id));
    }
  }
  return duplicateIds;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  const iconMap = {
    success: "ri-checkbox-circle-line",
    warning: "ri-alert-fill",
    danger: "ri-error-warning-line",
    info: "ri-information-line"
  };
  return (
    <div
      className={`alert alert-${toast.type} d-flex align-items-start gap-3 position-fixed`}
      style={{
        zIndex: 9999, minWidth: 350, top: 80, right: 24,
        borderRadius: 14, border: "none",
        boxShadow: "0 12px 40px rgba(0,0,0,.2)",
        animation: "slideInRight .3s cubic-bezier(0.68, -0.55, 0.27, 1.55)",
      }}
    >
      <i className={`${iconMap[toast.type] || "ri-notification-3-line"} fs-18 mt-1`}></i>
      <div className="fs-13 fw-medium flex-grow-1">{toast.msg}</div>
    </div>
  );
}

function useEscapeKey(cb, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e) => { if (e.key === "Escape") cb(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [cb, enabled]);
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ dev, size = 40 }) {
  const color = avatarColor(dev.gitlab_username || dev.name || "");
  if (dev.is_bot) {
    return (
      <div
        className="d-flex align-items-center justify-content-center rounded-circle bg-warning-subtle flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <i className="ri-robot-line text-warning" style={{ fontSize: size * 0.4 }}></i>
      </div>
    );
  }
  return (
    <div
      className="d-flex align-items-center justify-content-center rounded-circle text-white fw-bold flex-shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.32 }}
    >
      {getInitials(dev.name || dev.gitlab_username)}
    </div>
  );
}

// ── ValidateModal ─────────────────────────────────────────────────────────────
function ValidateModal({ dev, action, onClose, onConfirm }) {
  const isReject = action === "reject";
  const [loading, setLoading] = useState(false);
  if (!dev) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(dev.id, action); }
    finally { setLoading(false); }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title={isReject ? "Rejeter ce développeur" : "Valider ce développeur"}
      subtitle={`${devDisplayName(dev)} · ${devHandle(dev)}`}
      icon={isReject ? "ri-close-circle-line" : "ri-checkbox-circle-line"}
      iconBg={isReject ? "bg-danger-subtle" : "bg-success-subtle"}
      iconColor={isReject ? "text-danger" : "text-success"}
      loading={loading}
      maxWidth={460}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
          <button
            className={`btn btn-sm px-4 fw-bold ${isReject ? "btn-danger" : "btn-success"}`}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2"></span>En cours…</>
              : <><i className={`${isReject ? "ri-close-line" : "ri-check-line"} me-1`}></i>{isReject ? "Rejeter" : "Valider"}</>
            }
          </button>
        </>
      }
    >
      <div className={`alert ${isReject ? "alert-danger" : "alert-success"} d-flex gap-2 py-3 fs-13 mb-0 border-0`}>
        <i className={`${isReject ? "ri-alert-line" : "ri-information-line"} flex-shrink-0 mt-1`}></i>
        <div>
          {isReject ? (
            <>Ce développeur sera <strong>exclu</strong> des calculs KPI et des extractions de données.</>
          ) : (
            <>Ce développeur sera <strong>inclus</strong> dans les métriques KPI et les rapports d'équipe.</>
          )}
        </div>
      </div>
    </AdminModal>
  );
}

// ── ValidateAllModal ──────────────────────────────────────────────────────────
function ValidateAllModal({ count, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); }
    finally { setLoading(false); }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Validation en masse"
      subtitle={`Valider ${count} développeur${count > 1 ? "s" : ""} en attente`}
      icon="ri-check-double-fill"
      iconBg="bg-warning-subtle"
      iconColor="text-warning"
      loading={loading}
      maxWidth={460}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
          <button className="btn btn-sm btn-warning px-4 fw-bold shadow-sm" onClick={handleConfirm} disabled={loading}>
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Validation...</>
              : <><i className="ri-check-double-line me-1"></i>Tout Valider</>
            }
          </button>
        </>
      }
    >
      <div className="alert alert-warning border-0 d-flex gap-3 p-3 mb-0 bg-warning-subtle">
        <i className="ri-information-line fs-18 text-warning flex-shrink-0"></i>
        <div className="fs-13 text-warning-emphasis">
          Vous allez valider <strong>{count} profils</strong>. Ils seront inclus dans les statistiques globales. Les bots détectés seront automatiquement filtrés.
        </div>
      </div>
    </AdminModal>
  );
}

// ── MergeModal ────────────────────────────────────────────────────────────────
function MergeModal({ dev, canonicalDev, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  if (!dev) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(dev.id, canonicalDev?.id); }
    finally { setLoading(false); }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Fusionner les historiques"
      subtitle="Transfert des données et suppression du doublon"
      icon="ri-merge-cells-horizontal-line"
      iconBg="bg-warning-subtle"
      iconColor="text-warning"
      loading={loading}
      maxWidth={500}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
          <button
            className="btn btn-sm px-4 fw-bold text-white"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none" }}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Fusion...</>
              : <><i className="ri-merge-cells-horizontal-line me-1"></i>Confirmer la Fusion</>
            }
          </button>
        </>
      }
    >
      <div className="alert alert-warning border-0 mb-3 bg-warning-subtle p-3">
        <div className="d-flex align-items-center gap-2 mb-2">
          <i className="ri-alert-fill text-warning fs-18"></i>
          <span className="fw-bold fs-13 text-warning-emphasis">Action irréversible</span>
        </div>
        <div className="fs-12 text-warning-emphasis">
          Le profil <strong>{devDisplayName(dev)}</strong> sera supprimé. Tous ses commits et KPIs seront rattachés au profil principal :
          <div className="mt-2 p-2 rounded bg-white border border-warning-subtle fw-bold text-dark">
            <i className="ri-user-star-line me-2 text-success"></i>{devDisplayName(canonicalDev)}
          </div>
        </div>
      </div>
      <p className="text-muted fs-11 mb-0 px-1">
        <i className="ri-information-line me-1 text-primary"></i>
        Cette opération garantit l'intégrité de vos rapports annuels en évitant le comptage multiple d'un même individu.
      </p>
    </AdminModal>
  );
}

// ── DevEditModal ──────────────────────────────────────────────────────────────
function DevEditModal({ dev, sites, groups, projects, period_id, periods, onClose, onSave }) {
  const [form, setForm] = useState({
    is_active:        dev?.is_active        ?? true,
    name:             dev?.name             || "",
    email:            dev?.email            || "",
    gitlab_username:  dev?.gitlab_username  || "",
    primary_site_id:  dev?.primary_site_id  || "",
    group_id:         (dev?.group_ids && dev.group_ids.length > 0) ? dev.group_ids[0] : "",
    project_ids:      (dev?.projects && Array.isArray(dev.projects)) ? dev.projects.map(p => p.project_id) : [],
    is_bot:           dev?.is_bot           || false,
    is_external:      dev?.is_external      || false,
    onboarding_date:  dev?.onboarding_date  || "",
    offboarding_date: dev?.offboarding_date || "",
    mutation_date:    "", // Toujours vide par défaut pour forcer une saisie ou utiliser le fallback
    update_type:      "A", // "A" pour Case A (Correction directe), "B" pour Case B (Mutation historique)
  });
  const [loading, setLoading]  = useState(false);
  const [fetching, setFetching] = useState(false); // ✅ Master View loading
  const [error,   setError]    = useState("");
  const [showReonboard, setShowReonboard] = useState(false);
  const [newOnboardingDate, setNewOnboardingDate] = useState("");

  // [ENTERPRISE] Master View Fetch
  // Si on édite un profil existant, on recharge ses données complètes (non filtrées par la période)
  // pour garantir que l'admin voit les affectations futures ou passées.
  useEffect(() => {
    if (dev?.id) {
      const fetchMasterData = async () => {
        setFetching(true);
        try {
          const masterDev = await developerService.getById(dev.id);

          // [TRACE DE SUSPENSION] Dériver la date de suspension depuis les segments site
          let suspendedSince = null;
          let reactivatedSince = null;
          if (masterDev.sites && Array.isArray(masterDev.sites)) {
            const closedSegs = masterDev.sites
              .filter(s => s.is_active === false && s.end_date)
              .sort((a, b) => new Date(b.end_date) - new Date(a.end_date));
            const activeSegs = masterDev.sites
              .filter(s => s.is_active === true || s.is_active == null)
              .sort((a, b) => new Date(a.start_date || '2000-01-01') - new Date(b.start_date || '2000-01-01'));

            if (closedSegs.length > 0) {
              const lastClosed = new Date(closedSegs[0].end_date);
              lastClosed.setDate(lastClosed.getDate() + 1);
              suspendedSince = lastClosed.toISOString().split('T')[0];
            }
            if (activeSegs.length > 0 && closedSegs.length > 0) {
              const lastClosedEnd = new Date(closedSegs[0].end_date);
              const laterActive = activeSegs.find(s => s.start_date && new Date(s.start_date) > lastClosedEnd);
              if (laterActive) reactivatedSince = laterActive.start_date;
            }
          }

          setForm(f => ({
            ...f,
            is_active:         masterDev.is_active        ?? f.is_active,
            rh_status:         masterDev.rh_status        || null,
            suspended_since:   suspendedSince,
            reactivated_since: reactivatedSince,
            name:              masterDev.name             || f.name,
            email:             masterDev.email            || f.email,
            gitlab_username:   masterDev.gitlab_username  || f.gitlab_username,
            primary_site_id:   (() => {
              if (!masterDev.sites || masterDev.sites.length === 0) return f.primary_site_id;
              
              if (period_id && periods && periods.length > 0) {
                const targetPeriod = periods.find(p => p.id === period_id);
                if (targetPeriod) {
                  const pStart = new Date(targetPeriod.year, targetPeriod.month - 1, 1);
                  const pEnd = new Date(targetPeriod.year, targetPeriod.month, 0);
                  
                  const activeSiteSeg = masterDev.sites.find(s => {
                    const sStart = s.start_date ? new Date(s.start_date) : new Date('2000-01-01');
                    const sEnd = s.end_date ? new Date(s.end_date) : new Date('2099-12-31');
                    return sStart <= pEnd && sEnd >= pStart;
                  });
                  
                  if (activeSiteSeg) {
                    return activeSiteSeg.site_id;
                  }
                }
              }
              
              const sortedSites = [...masterDev.sites].sort((a,b) => new Date(b.start_date || '2000-01-01') - new Date(a.start_date || '2000-01-01'));
              const primary = sortedSites.find(s => s.is_primary);
              return primary ? primary.site_id : sortedSites[0].site_id;
            })(),
            group_id:          (() => {
              if (period_id && dev?.group_ids && dev.group_ids.length > 0) {
                return dev.group_ids[0];
              }
              return (masterDev.group_ids && masterDev.group_ids.length > 0) ? masterDev.group_ids[masterDev.group_ids.length - 1] : f.group_id;
            })(),
            project_ids:       (() => {
              if (!masterDev.projects || !Array.isArray(masterDev.projects)) return f.project_ids;
              
              if (period_id && periods && periods.length > 0) {
                const targetPeriod = periods.find(p => p.id === period_id);
                if (targetPeriod) {
                  const pStart = new Date(targetPeriod.year, targetPeriod.month - 1, 1);
                  const pEnd = new Date(targetPeriod.year, targetPeriod.month, 0);
                  
                  const activeProjs = masterDev.projects.filter(p => {
                    const pS = p.start_date ? new Date(p.start_date) : new Date('2000-01-01');
                    const pE = p.end_date ? new Date(p.end_date) : new Date('2099-12-31');
                    return pS <= pEnd && pE >= pStart;
                  });
                  
                  return activeProjs.map(p => p.project_id);
                }
              }
              
              return [...new Set(masterDev.projects.filter(p => p.is_active).map(p => p.project_id))];
            })(),
            onboarding_date:   masterDev.onboarding_date  || f.onboarding_date,
            offboarding_date:  masterDev.offboarding_date || f.offboarding_date,
          }));
        } catch (err) {
          console.error("Master View Fetch Error:", err);
        } finally {
          setFetching(false);
        }
      };
      fetchMasterData();
    }
  }, [dev?.id]);

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Le nom est requis.");

    // ── [RG-05] Validation des dates côté client ────────────────────────
    if (form.onboarding_date && form.offboarding_date) {
      if (form.onboarding_date >= form.offboarding_date) {
        return setError("⚠️ La date d'entrée doit être antérieure à la date de départ.");
      }
    }

    setLoading(true);
    try {
      // ✅ FIX ENTERPRISE : period_id du filtre de la page Admin intentionnellement
      // exclu du payload. Les missions créées manuellement sont TOUJOURS permanentes
      // (period_id=null en BDD). Sinon, les projets seraient liés à la période
      // sélectionnée dans la sidebar, les rendant invisibles dans les autres mois.
      const payload = {
        is_active:        form.is_active,
        name:             form.name.trim()            || null,
        email:            form.email.trim()           || null,
        gitlab_username:  form.gitlab_username.trim() || null,
        group_ids:        form.group_id ? [parseInt(form.group_id)] : [],
        projects:         form.project_ids.map(pid => ({ project_id: pid, is_active: true })),
        period_id:        null, // Mission permanente — NE PAS utiliser le filtre de la page ici
        is_bot:           form.is_bot,
        is_external:      form.is_external,
        onboarding_date:  form.onboarding_date  || null,
        offboarding_date: form.offboarding_date || null,
        mutation_date:    (form.update_type === "B" || (dev?.id && form.is_active !== (dev?.is_active ?? true))) ? (form.mutation_date || null) : null,
      };
      if (form.primary_site_id) {
        payload.sites = [{ site_id: parseInt(form.primary_site_id), is_primary: true }];
      } else {
        payload.sites = [];
      }

      let recalculationNeeded = false;
      let changedFields = [];

      if (dev?.id) {
        // [ENTERPRISE] Capture de la réponse enrichie du backend
        const response = await developerService.update(dev.id, payload);
        recalculationNeeded = response?.recalculation_needed || false;
        changedFields       = response?.changed_fields       || [];
      } else {
        await developerService.create(payload);
      }

      // Passer les métadonnées de recalcul au parent
      onSave({ recalculationNeeded, changedFields });
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title={dev?.id ? "Modifier le développeur" : "Nouveau développeur"}
      subtitle={dev?.id ? devHandle(dev) : "Création manuelle d'un profil"}
      icon={dev?.id ? "ri-user-settings-line" : "ri-user-add-line"}
      loading={loading || fetching}
      maxWidth={540}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading || fetching}>Annuler</button>
          <button className="btn btn-sm btn-primary px-4 fw-bold shadow-sm" onClick={submit} disabled={loading || fetching}>
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement...</>
              : <><i className="ri-save-line me-1"></i>Enregistrer</>
            }
          </button>
        </>
      }
    >
      {fetching && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="mt-2 fs-13 text-muted">Chargement de la Master View...</p>
        </div>
      )}

      {error && !fetching && (
        <div className="alert alert-danger py-2 fs-13 mb-3">
          <i className="ri-error-warning-line me-1"></i>{error}
        </div>
      )}

      {!fetching && (
        <div className="row g-3 animate__animated animate__fadeIn">
        <div className="col-md-6">
          <label className="form-label fw-medium fs-13">Nom complet <span className="text-danger">*</span></label>
          <input type="text" name="name" className="form-control bg-light-subtle" value={form.name} onChange={handle} placeholder="Prénom Nom" autoFocus />
        </div>
        <div className="col-md-6">
          <label className="form-label fw-medium fs-13">Username GitLab</label>
          <div className="input-group">
            <span className="input-group-text bg-light text-muted fs-13">@</span>
            <input type="text" name="gitlab_username" className="form-control" value={form.gitlab_username} onChange={handle} placeholder="handle.gitlab" />
          </div>
        </div>
        <div className="col-md-12">
          <label className="form-label fw-medium fs-13">Adresse Email</label>
          <input type="email" name="email" className="form-control" value={form.email} onChange={handle} placeholder="dev@organisation.com" />
        </div>
        <div className="col-md-6">
          <label className="form-label fw-medium fs-13">Site géographique</label>
          <select name="primary_site_id" className="form-select" value={form.primary_site_id} onChange={handle}>
            <option value="">— Aucun site —</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}{s.country ? ` (${s.country})` : ""}</option>)}
          </select>
        </div>
        <div className="col-md-6">
          <label className={`form-label fw-medium fs-13 ${form.update_type === "A" ? "text-muted opacity-50" : "text-primary"}`}>
            <i className="ri-calendar-event-line me-1"></i>Date d'effet
          </label>
          <input 
            type="date" 
            name="mutation_date" 
            className={`form-control ${form.update_type === "A" ? "bg-light text-muted border-dashed" : "border-primary-subtle bg-primary-subtle bg-opacity-10"}`}
            value={form.update_type === "A" ? "" : form.mutation_date} 
            onChange={handle} 
            disabled={form.update_type === "A"}
            placeholder="Non applicable"
          />
          <div className="form-text fs-11 text-muted opacity-75">
            <i className="ri-information-line me-1"></i>
            {form.update_type === "A" ? "Non applicable (correction rétroactive)." : "Date précise du changement (mutation)."}
          </div>
        </div>

        {/* ── SELECTION DU TYPE DE MISE A JOUR (CASE A vs CASE B) ── */}
        <div className="col-md-12">
          <label className="form-label fw-semibold fs-13 mb-2 text-primary-emphasis">
            <i className="ri-settings-4-line me-1"></i>Nature de la mise à jour (Site / Équipe)
          </label>
          <div className="card border-primary-subtle bg-primary bg-opacity-10 py-3 px-3 rounded-3 shadow-sm border-0">
            <div className="d-flex flex-column gap-3">
              <div className="form-check d-flex align-items-start gap-2 ps-0">
                <input 
                  className="form-check-input ms-0 mt-1" 
                  type="radio" 
                  name="update_type" 
                  id="updateTypeA" 
                  value="A" 
                  checked={form.update_type === "A"} 
                  onChange={handle} 
                  style={{ cursor: "pointer", width: "1.15em", height: "1.15em" }}
                />
                <label className="form-check-label fs-12 fw-medium mb-0" htmlFor="updateTypeA" style={{ cursor: "pointer" }}>
                  <span className="badge bg-primary bg-opacity-75 text-white mb-1 fs-10 px-2 py-1 rounded">Case A (Correction d'une erreur de saisie)</span>
                  <span className="d-block text-dark fw-semibold fs-13">Correction directe / Rétroactive</span>
                  <span className="d-block text-muted fs-11 mt-0.5">
                    Modifie directement le site ou le groupe d'affectation actuel sans créer de nouvelle ligne historique ni de doublon. À utiliser pour corriger une faute de frappe ou une mauvaise affectation initiale.
                  </span>
                </label>
              </div>
              <hr className="my-1 border-primary-subtle opacity-25" />
              <div className="form-check d-flex align-items-start gap-2 ps-0">
                <input 
                  className="form-check-input ms-0 mt-1" 
                  type="radio" 
                  name="update_type" 
                  id="updateTypeB" 
                  value="B" 
                  checked={form.update_type === "B"} 
                  onChange={handle} 
                  style={{ cursor: "pointer", width: "1.15em", height: "1.15em" }}
                />
                <label className="form-check-label fs-12 fw-medium mb-0" htmlFor="updateTypeB" style={{ cursor: "pointer" }}>
                  <span className="badge bg-info bg-opacity-75 text-white mb-1 fs-10 px-2 py-1 rounded">Case B (Mutation historique)</span>
                  <span className="d-block text-dark fw-semibold fs-13">Mutation à date d'effet</span>
                  <span className="d-block text-muted fs-11 mt-0.5">
                    Conserve le passé et crée un nouveau segment d'affectation à partir de la <strong>Date d'effet</strong> sélectionnée ci-dessus. À utiliser lorsqu'un développeur déménage ou change d'équipe dans le temps.
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <label className="form-label fw-medium fs-13">Équipe / Groupe</label>
          <select name="group_id" className="form-select" value={form.group_id} onChange={handle}>
            <option value="">— Aucun groupe —</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div className="col-12">
          <label className="form-label fw-medium fs-13 mb-2 d-flex align-items-center gap-2">
            <i className="ri-folder-6-line text-primary"></i>
            Projets affectés <span className="text-muted fw-normal fs-11">({form.project_ids.length} sélectionné{form.project_ids.length > 1 ? "s" : ""})</span>
          </label>
          <div 
            className="p-3 rounded-3 border bg-light-subtle" 
            style={{ maxHeight: "160px", overflowY: "auto", borderStyle: "dashed !important" }}
          >
            {projects.length === 0 ? (
              <div className="text-center py-2 text-muted fs-12 italic">Aucun projet disponible</div>
            ) : (
              <div className="row g-2">
                {projects.map(p => {
                  const isChecked = form.project_ids.includes(p.id);
                  return (
                    <div key={p.id} className="col-md-6">
                      <div 
                        className={`form-check p-2 rounded-2 border transition-all ${isChecked ? "bg-white border-primary shadow-sm" : "border-transparent opacity-75"}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setForm(f => {
                            const newIds = isChecked ? f.project_ids.filter(id => id !== p.id) : [...f.project_ids, p.id];
                            return { ...f, project_ids: newIds };
                          });
                        }}
                      >
                        <input 
                          type="checkbox" 
                          className="form-check-input ms-0 me-2" 
                          checked={isChecked} 
                          onChange={() => {}} // Géré par le clic sur le parent
                          style={{ pointerEvents: "none" }}
                        />
                        <label className={`form-check-label fs-12 mb-0 ${isChecked ? "fw-bold text-primary" : "text-dark"}`} style={{ cursor: "pointer" }}>
                          {p.name}
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="form-text fs-11 mt-1 text-muted">
            <i className="ri-information-line me-1"></i>
            Sélectionnez les dépôts GitLab auxquels ce développeur contribue activement.
          </div>
        </div>
        <div className="col-12 mt-4">
          <div className={`p-3 rounded-3 border ${form.is_bot ? "bg-warning-subtle border-warning" : "bg-light"}`}>
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="d-flex align-items-center gap-2">
                <i className={`${form.is_bot ? "ri-robot-line text-warning" : "ri-user-heart-line text-primary"} fs-18`}></i>
                <span className="fw-bold fs-13">{form.is_bot ? "COMPTE AUTOMATISÉ (BOT)" : "DÉVELOPPEUR PHYSIQUE"}</span>
              </div>
              <div className="form-check form-switch mb-0">
                <input type="checkbox" className="form-check-input" role="switch" name="is_bot" checked={form.is_bot} onChange={handle} style={{ cursor: "pointer" }} />
              </div>
            </div>
            <p className="mb-0 fs-11 text-muted">
              {form.is_bot
                ? "Ce compte sera exclu des KPIs de performance et de vélocité de l'équipe."
                : "Ce compte sera pleinement intégré dans les calculs de productivité."}
            </p>
          </div>
        </div>
        <div className="col-12">
          <div className="form-check form-check-inline ms-1">
            <input type="checkbox" className="form-check-input" id="is_external" name="is_external" checked={form.is_external} onChange={handle} />
            <label className="form-check-label fs-13 text-muted" htmlFor="is_external">Marquer comme prestataire externe (Freelance / Partner)</label>
          </div>
        </div>
        <div className="col-12">
          {form.rh_status === "OUT" ? (
            <div className="p-3 rounded-3 border bg-info-subtle border-info">
              <div className="d-flex align-items-center gap-2">
                <i className="ri-archive-line text-info fs-18"></i>
                <span className="fw-bold fs-13 text-dark">PROFIL ARCHIVÉ</span>
              </div>
              <p className="mb-0 fs-11 text-muted mt-1">
                Départ définitif : le développeur a quitté l'entreprise le{" "}
                <strong>
                  {new Date(form.offboarding_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </strong>.
              </p>
              
              {showReonboard ? (
                <div className="mt-3 p-3 bg-white rounded-3 border border-info-subtle shadow-sm">
                  <h6 className="fs-12 fw-bold text-info mb-2">
                    <i className="ri-user-received-2-line me-1"></i>Paramètres de Réactivation
                  </h6>
                  <div className="row g-2 align-items-end">
                    <div className="col-sm-7">
                      <label className="form-label fs-11 text-muted mb-1 fw-medium">Nouvelle date d'entrée (Onboarding)</label>
                      <input
                        type="date"
                        className="form-control form-control-sm border-info-subtle fs-12"
                        value={newOnboardingDate}
                        onChange={(e) => setNewOnboardingDate(e.target.value)}
                      />
                    </div>
                    <div className="col-sm-5 d-flex gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-info text-white flex-grow-1 fw-bold fs-11"
                        onClick={() => {
                          if (!newOnboardingDate) {
                            setError("Veuillez saisir une nouvelle date d'entrée.");
                            return;
                          }
                          setError("");
                          setForm(f => ({
                            ...f,
                            onboarding_date: newOnboardingDate,
                            offboarding_date: "",
                            is_active: true,
                            rh_status: "ACTIVE"
                          }));
                          setShowReonboard(false);
                        }}
                      >
                        Valider
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-light border flex-grow-1 fs-11"
                        onClick={() => setShowReonboard(false)}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 pt-1">
                  <button
                    type="button"
                    className="btn btn-xs btn-info text-white fw-bold px-3 py-1 shadow-sm fs-11 d-flex align-items-center gap-1"
                    onClick={() => {
                      setError("");
                      setShowReonboard(true);
                      setNewOnboardingDate(new Date().toISOString().split('T')[0]);
                    }}
                  >
                    <i className="ri-user-received-line fs-13"></i> Réactiver le collaborateur (Re-onboarding)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={`p-3 rounded-3 border ${!form.is_active ? "bg-danger-subtle border-danger" : "bg-success-subtle border-success"}`}>
              <div className="d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-2">
                  <i className={`${form.is_active ? "ri-checkbox-circle-line text-success" : "ri-indeterminate-circle-line text-danger"} fs-18`}></i>
                  <span className="fw-bold fs-13 text-dark">{form.is_active ? "PROFIL ACTIF" : "PROFIL DÉSACTIVÉ"}</span>
                </div>
                <div className="form-check form-switch mb-0">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    role="switch"
                    name="is_active"
                    checked={form.is_active}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm(f => ({
                        ...f,
                        is_active: checked,
                        mutation_date: checked !== (dev?.is_active ?? true) ? new Date().toISOString().split('T')[0] : ""
                      }));
                    }}
                    style={{ cursor: "pointer" }}
                  />
                </div>
              </div>
              <p className="mb-0 fs-11 text-muted mt-1">
                {form.is_active
                  ? "Le développeur est comptabilisé dans les ressources de l'entreprise (sous réserve des dates de mission)."
                  : "Désactivation manuelle : le développeur sera ignoré partout, même si ses dates de mission sont valides."}
              </p>

              {/* ── SÉLECTEUR DE DATE DE SUSPENSION/RÉACTIVATION ── */}
              {form.is_active !== (dev?.is_active ?? true) && dev?.id && (
                <div className="mt-3 p-3 rounded bg-white bg-opacity-75 border border-warning-subtle shadow-xs animate__animated animate__fadeIn">
                  <label className="form-label fw-bold fs-11 text-warning-emphasis mb-1">
                    <i className="ri-calendar-event-line me-1"></i>
                    {form.is_active ? "Date d'effet de la Réactivation" : "Date d'effet de la Suspension"}
                  </label>
                  <input
                    type="date"
                    name="mutation_date"
                    className="form-control form-control-sm border-warning-subtle"
                    value={form.mutation_date}
                    onChange={handle}
                    required
                  />
                  <div className="form-text fs-10 text-muted mt-1 lh-sm">
                    {form.is_active
                      ? "Les derniers segments de mission fermés lors de la suspension seront rouverts à partir de cette date d'effet."
                      : "Tous les segments de mission actifs seront fermés la veille de cette date d'effet (compté pour 0 à partir de ce jour)."}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TRACE DE SUSPENSION TEMPORELLE ── */}
          {form.suspended_since && form.rh_status !== "OUT" && (
            <div className="alert alert-warning border-warning d-flex align-items-start gap-2 py-2 px-3 mt-2 mb-0" style={{ fontSize: "12px" }}>
              <i className="ri-history-line fs-16 text-warning mt-1 flex-shrink-0"></i>
              <div>
                <span className="fw-semibold text-warning-emphasis">Historique de suspension :</span>
                <span className="text-dark ms-1">
                  Suspendu depuis le{" "}
                  <strong>
                    {new Date(form.suspended_since).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </strong>
                  {form.reactivated_since ? (
                    <>
                      {" "}→ Réactivé le{" "}
                      <strong>
                        {new Date(form.reactivated_since).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </strong>
                    </>
                  ) : (
                    <span className="text-danger ms-1">(toujours suspendu)</span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="col-md-6">
          <label className="form-label fw-medium fs-13 text-primary">
            <i className="ri-calendar-check-line me-1"></i>Date d'entrée (Onboarding)
          </label>
          <input
            type="date"
            name="onboarding_date"
            className="form-control border-primary-subtle"
            value={form.onboarding_date}
            onChange={handle}
            disabled={form.rh_status === "OUT"}
          />
          <div className="form-text fs-11">
            {form.rh_status === "OUT"
              ? "🔒 Verrouillé : Le profil est archivé."
              : "Utilisée pour filtrer les KPIs d'activité."}
          </div>
        </div>
        <div className="col-md-6">
          <label className="form-label fw-medium fs-13 text-danger">
            <i className="ri-calendar-close-line me-1"></i>Date de départ (Offboarding)
          </label>
          <input
            type="date"
            name="offboarding_date"
            className="form-control border-danger-subtle"
            value={form.offboarding_date}
            onChange={handle}
            disabled={form.rh_status === "OUT"}
          />
          <div className="form-text fs-11">
            {form.rh_status === "OUT"
              ? "🔒 Verrouillé : Le profil est archivé."
              : "Le développeur sera ignoré après cette date."}
          </div>
        </div>
      </div>
      )}
    </AdminModal>
  );
}

// ── GroupModal ────────────────────────────────────────────────────────────────
function GroupModal({ group, sites, onClose, onSave }) {
  const isEdit = !!group?.id;
  const [form, setForm] = useState({
    name:        group?.name        || "",
    site_ids:    group?.sites?.map(s => s.id) || (group?.site_id ? [group.site_id] : []),
    description: group?.description || "",
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Le nom du groupe est requis.");
    setLoading(true);
    try {
      const payload = {
        name:        form.name.trim(),
        site_ids:    form.site_ids,
        description: form.description.trim() || null,
      };
      if (isEdit) await developerService.updateGroup(group.id, payload);
      else        await developerService.createGroup(payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title={isEdit ? "Modifier le groupe" : "Nouveau groupe"}
      subtitle="Gestion des équipes et rattachement géographique"
      icon={isEdit ? "ri-edit-line" : "ri-group-line"}
      loading={loading}
      maxWidth={460}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
          <button className="btn btn-sm btn-primary px-4 fw-bold shadow-sm" onClick={submit} disabled={loading}>
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Sauvegarde...</>
              : <><i className="ri-save-line me-1"></i>Enregistrer</>
            }
          </button>
        </>
      }
    >
      {error && <div className="alert alert-danger py-2 fs-13 mb-3">{error}</div>}
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label fw-medium fs-13">Nom de l'équipe <span className="text-danger">*</span></label>
          <input
            type="text"
            className="form-control bg-light-subtle"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ex: Backend Tunis, Frontend Lyon…"
            autoFocus
          />
        </div>
        <div className="col-12 mt-3">
          <label className="form-label fw-medium fs-13 mb-2">Sites de rattachement</label>
          <div className="d-flex flex-wrap gap-2 p-2 rounded border bg-light-subtle">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, site_ids: [] }))}
              className={`btn btn-sm border-0 d-flex align-items-center gap-1 ${form.site_ids.length === 0 ? "bg-primary text-white" : "bg-white text-muted"}`}
              style={{ borderRadius: "8px", fontSize: "11px" }}
            >
              <i className={form.site_ids.length === 0 ? "ri-check-line" : "ri-global-line"}></i> Transverse
            </button>
            {sites.map(s => {
              const isSelected = form.site_ids.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setForm(f => {
                      const newIds = isSelected ? f.site_ids.filter(id => id !== s.id) : [...f.site_ids, s.id];
                      return { ...f, site_ids: newIds };
                    });
                  }}
                  className={`btn btn-sm border-0 d-flex align-items-center gap-1 ${isSelected ? "bg-primary text-white" : "bg-white text-muted"}`}
                  style={{ borderRadius: "8px", fontSize: "11px" }}
                >
                  <i className={isSelected ? "ri-check-line" : "ri-map-pin-line"}></i> {s.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="col-12">
          <label className="form-label fw-medium fs-13">Description</label>
          <textarea
            className="form-control"
            rows="2"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Missions ou périmètre de l'équipe..."
          ></textarea>
        </div>
      </div>
    </AdminModal>
  );
}

// ── DeleteGroupModal ──────────────────────────────────────────────────────────
function DeleteGroupModal({ group, loading, onClose, onConfirm }) {
  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Supprimer l'équipe"
      subtitle={group.name}
      icon="ri-delete-bin-line"
      iconBg="bg-danger-subtle"
      iconColor="text-danger"
      loading={loading}
      maxWidth={400}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
          <button className="btn btn-sm btn-danger px-4 fw-bold shadow-sm" onClick={onConfirm} disabled={loading}>
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Suppression...</>
              : <><i className="ri-delete-bin-line me-1"></i>Confirmer la suppression</>
            }
          </button>
        </>
      }
    >
      <p className="text-muted fs-13 mb-0 text-center py-2">
        Êtes-vous sûr de vouloir supprimer l'équipe <strong>{group.name}</strong> ?<br />
        <span className="text-danger small mt-2 d-block fw-medium">Cette action est irréversible.</span>
      </p>
    </AdminModal>
  );
}

// ── ArchiveModal ──────────────────────────────────────────────────────────────
function ArchiveModal({ dev, loading, onClose, onConfirm }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Archiver le développeur"
      subtitle={dev.name || dev.gitlab_username}
      icon="ri-archive-line"
      iconBg="bg-danger-subtle"
      iconColor="text-danger"
      loading={loading}
      maxWidth={400}
      footer={
        <>
          <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
          <button className="btn btn-sm btn-danger px-4 fw-bold shadow-sm" onClick={() => onConfirm(dev, date)} disabled={loading}>
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Archivage...</>
              : <><i className="ri-archive-line me-1"></i>Confirmer l'archivage</>
            }
          </button>
        </>
      }
    >
      <div className="py-2">
        <p className="text-muted fs-13 mb-3 text-center">
          Veuillez indiquer la date de sortie (Offboarding) de <strong>{dev.name || dev.gitlab_username}</strong>.<br />
          <span className="small mt-1 d-block">Il ne sera plus comptabilisé dans les KPIs après cette date.</span>
        </p>
        <div className="mb-2">
          <label className="form-label fw-medium fs-13 text-danger">
            <i className="ri-calendar-close-line me-1"></i>Date de sortie
          </label>
          <input 
            type="date" 
            className="form-control border-danger-subtle" 
            value={date} 
            onChange={(e) => setDate(e.target.value)} 
            required
          />
        </div>
      </div>
    </AdminModal>
  );
}

// ── TableView ─────────────────────────────────────────────────────────────────
function TableView({
  paginated, sites, groups, duplicateIds, developers,
  onValidate, onEdit, onMerge, onToggleActive, onArchive,
  calculateQuality, selectedIds, setSelectedIds,
  periodFilter, periods
}) {
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead style={{ background: "#fafbfc" }}>
          <tr>
            <th className="ps-3 py-3" style={{ width: 40 }}>
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={selectedIds.length === paginated.length && paginated.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(paginated.map(d => d.id));
                    else setSelectedIds([]);
                  }}
                />
              </div>
            </th>
            <th className="py-2 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Développeur / Contact</th>
            <th className="py-2 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Groupe</th>
            <th className="py-2 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Période</th>
            <th className="py-2 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Qualité</th>
            <th className="py-2 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Statut</th>
            <th className="pe-4 py-2 text-center text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map(dev => {
            const site      = sites.find(s => s.id === dev.primary_site_id);
            const isPending = dev.is_validated !== true && !dev.is_bot;
            const isDup     = duplicateIds.has(dev.id);
            const quality   = calculateQuality(dev);
            const isSelected = selectedIds.includes(dev.id);

            return (
              <tr key={dev.id} className={isSelected ? "table-active" : ""} style={isDup ? { background: "#fff7f7" } : {}}>
                <td className="ps-3">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={isSelected}
                      onChange={() => {
                        setSelectedIds(prev => isSelected ? prev.filter(id => id !== dev.id) : [...prev, dev.id]);
                      }}
                    />
                  </div>
                </td>
                <td className="py-2">
                  <div className="d-flex align-items-center gap-2">
                    <Avatar dev={dev} size={30} />
                    <div className="min-w-0">
                      <div className="d-flex align-items-center gap-1 flex-wrap">
                        <p className="fw-semibold mb-0 fs-13 text-truncate">{devDisplayName(dev)}</p>
                        {dev.rh_status === "OUT"    && <span className="badge bg-danger-subtle text-danger rounded-pill fs-9 px-1">OUT</span>}
                        {isDup                      && <span className="badge bg-warning-subtle text-warning fs-9 px-1">DBL</span>}
                      </div>
                      <div className="text-muted fs-11 text-truncate" style={{ maxWidth: 180 }}>{dev.email || devHandle(dev)}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-center">
                  {dev.group_ids && dev.group_ids.length > 0 ? (
                    <span className="badge bg-light text-primary border border-primary-subtle fs-10 fw-medium">
                      {groups.find(g => g.id === dev.group_ids[0])?.name || "Group"}
                    </span>
                  ) : (
                    <span className="text-muted fs-11 italic opacity-50">Aucun</span>
                  )}
                </td>
                <td className="py-2">
                  {dev.onboarding_date ? (() => {
                    const start      = new Date(dev.onboarding_date);
                    const end        = dev.offboarding_date ? new Date(dev.offboarding_date) : new Date();
                    const diffMonths = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));

                    return (
                      <div
                        className="d-flex flex-column"
                        style={{ minWidth: 130 }}
                        title={`Détails du Cycle RH :\n━━━━━━━━━━━━━━\n📅 Entrée : ${new Date(dev.onboarding_date).toLocaleDateString("fr-FR")}\n${dev.offboarding_date ? "🏁 Sortie : " + new Date(dev.offboarding_date).toLocaleDateString("fr-FR") : "🚀 Toujours en poste"}\n⏱️ Ancienneté : ${diffMonths} mois`}
                      >
                        <div className="d-flex align-items-center gap-2">
                          <div className="text-dark fs-12 fw-semibold d-flex align-items-center">
                            {start.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
                            <i className="ri-arrow-right-line mx-1 text-muted opacity-50" style={{ fontSize: 11 }}></i>
                            {dev.offboarding_date ? (
                              new Date(dev.offboarding_date).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })
                            ) : (
                              <span className="text-success opacity-75">Présent</span>
                            )}
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-1 mt-1">
                          <span className="badge bg-light text-primary border-0 fs-10 fw-medium px-0">
                            {diffMonths} mois d'activité
                          </span>
                        </div>
                      </div>
                    );
                  })() : (
                    <span className="badge bg-light text-muted fw-normal fs-11 border">Non définie</span>
                  )}
                </td>
                <td>
                  <div style={{ width: 100 }}>
                    <div className="d-flex justify-content-between mb-1" style={{ fontSize: 9 }}>
                      <span className="fw-bold" style={{ color: quality === 100 ? "#0ab39c" : quality >= 60 ? "#f7b84b" : "#f06548" }}>
                        {quality}%
                      </span>
                    </div>
                    <div className="progress" style={{ height: 4, borderRadius: 2 }}>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        style={{
                          width: `${quality}%`,
                          backgroundColor: quality === 100 ? "#0ab39c" : quality >= 60 ? "#f7b84b" : "#f06548",
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td>
                  {(() => {
                    if (dev.is_bot) return <span className="badge bg-warning-subtle text-warning fs-10"><i className="ri-robot-line me-1"></i>BOT</span>;
                    if (dev.is_validated !== true) {
                      return (
                        <span
                          className="badge bg-light text-muted fs-10 border border-dashed border-muted text-uppercase"
                          style={{ cursor: "pointer" }}
                          onClick={() => onValidate({ dev, action: "validate" })}
                        >
                          En attente
                        </span>
                      );
                    }

                    const status = dev.rh_status || "ACTIVE";
                    
                    switch (status) {
                      case "INACTIVE":
                        return <span className="badge bg-secondary-subtle text-secondary fs-10 border border-secondary-subtle"><i className="ri-moon-line me-1"></i>SABBAT</span>;
                      case "OUT":
                        return <span className="badge bg-danger-subtle text-danger fs-10"><i className="ri-logout-box-line me-1"></i>SORTIE</span>;
                      case "FUTURE":
                        return <span className="badge bg-info-subtle text-info fs-10"><i className="ri-time-line me-1"></i>FUTUR</span>;
                      default:
                        return <span className="badge bg-success-subtle text-success fs-10"><i className="ri-checkbox-circle-line me-1"></i>ACTIF</span>;
                    }
                  })()}
                </td>
                <td className="pe-4 text-center">
                  <div className="dropdown">
                    <button
                      className="btn btn-soft-primary btn-sm d-flex align-items-center gap-1 mx-auto"
                      type="button"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                      style={{ borderRadius: 8 }}
                    >
                      <i className="ri-settings-3-line"></i>
                      <span className="fs-11 fw-bold">Actions</span>
                      <i className="ri-arrow-down-s-line opacity-50"></i>
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 py-2" style={{ borderRadius: 12, minWidth: 160 }}>
                      <li>
                        <button className="dropdown-item py-2 d-flex align-items-center gap-2 fs-13" onClick={() => onEdit(dev)}>
                          <i className="ri-edit-line text-primary fs-15"></i> Modifier le profil
                        </button>
                      </li>
                      {isPending && (
                        <li>
                          <button className="dropdown-item py-2 d-flex align-items-center gap-2 fs-13" onClick={() => onValidate({ dev, action: "validate" })}>
                            <i className="ri-check-line text-success fs-15"></i> Valider maintenant
                          </button>
                        </li>
                      )}
                      {isDup && (
                        <li>
                          <button className="dropdown-item py-2 d-flex align-items-center gap-2 fs-13" onClick={() => onMerge(dev)}>
                            <i className="ri-merge-cells-horizontal text-warning fs-15"></i> Résoudre Doublon
                          </button>
                        </li>
                      )}
                      <li><hr className="dropdown-divider opacity-50 mx-2" /></li>
                      <li>
                        <button className="dropdown-item py-2 d-flex align-items-center gap-2 fs-13 text-danger" onClick={() => onArchive(dev)}>
                          <i className="ri-archive-line fs-15"></i> Archiver (Départ définitif)
                        </button>
                      </li>
                    </ul>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── CardView ──────────────────────────────────────────────────────────────────
function CardView({
  paginated, sites, groups, duplicateIds,
  onValidate, onEdit, onMerge, onToggleActive, onArchive,
  periodFilter, periods
}) {
  return (
    <div className="row g-3 p-4">
      {paginated.map(dev => {
        const site      = sites.find(s => s.id === dev.primary_site_id);
        const isPending = dev.is_validated !== true && !dev.is_bot;
        const isDup     = duplicateIds.has(dev.id);
        return (
          <div key={dev.id} className="col-xl-4 col-md-6">
            <div className="card border h-100" style={{ borderRadius: 12, outline: isDup ? "1px solid #fecaca" : "none" }}>
              <div className="card-body d-flex flex-column gap-2">
                <div className="d-flex align-items-start gap-3">
                  <Avatar dev={dev} size={44} />
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center gap-1 flex-wrap">
                      <p className="fw-semibold mb-0 fs-13 text-truncate">{devDisplayName(dev)}</p>
                      {dev.rh_status === "OUT"    && <span className="badge bg-danger-subtle text-danger rounded-pill fs-10 ms-1">OUT</span>}
                      {dev.rh_status === "FUTURE" && <span className="badge bg-info-subtle text-info rounded-pill fs-10 ms-1">FUTURE</span>}
                      {isDup && (
                        <span className="badge fs-10" style={{ background: "#fee2e2", color: "#b91c1c" }}>
                          <i className="ri-file-copy-line me-1"></i>Doublon
                        </span>
                      )}
                    </div>
                    <p className="text-muted fs-12 mb-2">{devHandle(dev)}</p>
                    <div className="d-flex flex-wrap gap-1">
                      {dev.is_bot
                        ? <span className="badge fs-10" style={{ background: "#fef9c3", color: "#a16207" }}><i className="ri-robot-line me-1"></i>Bot</span>
                        : dev.rh_status === "OUT"
                          ? <span className="badge fs-10" style={{ background: "#fee2e2", color: "#b91c1c" }}><i className="ri-logout-box-line me-1"></i>Sortie</span>
                          : dev.rh_status === "FUTURE"
                            ? <span className="badge fs-10" style={{ background: "#e0f2fe", color: "#0369a1" }}><i className="ri-time-line me-1"></i>Futur</span>
                            : isPending
                              ? <span className="badge fs-10" style={{ background: "#fef9c3", color: "#a16207" }}>En attente</span>
                              : <span className="badge fs-10" style={{ background: "#dcfce7", color: "#15803d" }}>Validé</span>
                      }
                      {dev.is_external && <span className="badge fs-10" style={{ background: "#f5f3ff", color: "#6f42c1" }}>Externe</span>}
                      {site && (
                        <span className="badge fs-10" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                          <i className="ri-map-pin-line me-1"></i>{site.name}
                        </span>
                      )}
                      {(dev.group_ids && dev.group_ids.length > 0) && (
                        <span className="badge fs-10" style={{ background: "#f5f3ff", color: "#6f42c1" }}>
                          <i className="ri-group-line me-1"></i>
                          {groups.find(g => g.id === dev.group_ids[0])?.name || "Grp."}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {dev.onboarding_date && (() => {
                  const start      = new Date(dev.onboarding_date);
                  const end        = dev.offboarding_date ? new Date(dev.offboarding_date) : new Date();
                  const diffMonths = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));

                  return (
                    <div className="rounded-3 p-2 mb-2" style={{ background: "#f8fafc", borderLeft: "3px solid #3577f1" }}>
                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <span className="text-muted fs-10 text-uppercase fw-bold ls-1" style={{ letterSpacing: "0.5px" }}>Cycle de vie</span>
                        <span className="badge bg-white text-primary border shadow-xs fs-9 fw-bold">{diffMonths} mois</span>
                      </div>
                      <div className="d-flex align-items-center gap-2 text-dark fs-11 fw-semibold">
                        <i className="ri-history-line text-primary opacity-50" style={{ fontSize: 12 }}></i>
                        {start.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
                        <i className="ri-arrow-right-line mx-1 opacity-25" style={{ fontSize: 10 }}></i>
                        {dev.offboarding_date ? (
                          new Date(dev.offboarding_date).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })
                        ) : (
                          <span className="text-success">Présent</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="d-flex align-items-center justify-content-between mt-1">
                  {dev.email ? (
                    <p className="text-muted fs-12 mb-0 text-truncate flex-grow-1">
                      <i className="ri-mail-line me-1"></i>{dev.email}
                    </p>
                  ) : <div className="flex-grow-1"></div>}

                  <div className="d-flex align-items-center gap-1 flex-shrink-0">
                    <span className="text-muted fs-11 fw-medium text-uppercase">Statut RH</span>
                    {(() => {
                      const isBot = dev.is_bot;
                      if (isBot) return <span className="badge bg-warning-subtle text-warning rounded-pill fs-10">BOT</span>;

                      const status = dev.rh_status || "ACTIVE";
                      
                      switch (status) {
                        case "INACTIVE":
                          return <span className="badge bg-secondary-subtle text-secondary rounded-pill fs-10 border border-secondary-subtle"><i className="ri-moon-line me-1"></i>SABBAT</span>;
                        case "OUT":
                          return <span className="badge bg-danger-subtle text-danger rounded-pill fs-10">SORTIE</span>;
                        case "FUTURE":
                          return <span className="badge bg-info-subtle text-info rounded-pill fs-10">FUTUR</span>;
                        default:
                          return <span className="badge bg-success-subtle text-success rounded-pill fs-10">ACTIF</span>;
                      }
                    })()}
                  </div>
                </div>

                <div className="mt-auto pt-2 border-top d-flex align-items-center justify-content-between">
                  <button className="btn btn-sm btn-soft-primary fw-bold flex-grow-1" onClick={() => onEdit(dev)} style={{ borderRadius: 8 }}>
                    <i className="ri-edit-line me-1"></i>Détails & Modif.
                  </button>
                  <div className="dropdown ms-2">
                    <button
                      className="btn btn-light btn-sm btn-icon border shadow-sm"
                      type="button"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                      style={{ borderRadius: 8, width: 32, height: 32 }}
                    >
                      <i className="ri-more-2-fill fs-14"></i>
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 py-2" style={{ borderRadius: 12, minWidth: 160 }}>
                      {isPending && (
                        <li>
                          <button className="dropdown-item py-2 d-flex align-items-center gap-2 fs-13" onClick={() => onValidate({ dev, action: "validate" })}>
                            <i className="ri-check-line text-success fs-15"></i> Valider maintenant
                          </button>
                        </li>
                      )}
                      {isDup && (
                        <li>
                          <button className="dropdown-item py-2 d-flex align-items-center gap-2 fs-13" onClick={() => onMerge(dev)}>
                            <i className="ri-merge-cells-horizontal text-warning fs-15"></i> Résoudre Doublon
                          </button>
                        </li>
                      )}
                      <li><hr className="dropdown-divider opacity-50 mx-2" /></li>
                      <li>
                        <button className="dropdown-item py-2 d-flex align-items-center gap-2 fs-13 text-danger" onClick={() => onArchive(dev)}>
                          <i className="ri-archive-line fs-15"></i> Archiver (Départ définitif)
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const DevelopersPage = () => {
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [developers,     setDevelopers]     = useState([]);
  const [allDevelopers,  setAllDevelopers]  = useState([]);
  const [groups,         setGroups]         = useState([]);
  const [sites,          setSites]          = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [summary,        setSummary]        = useState({ total: 0, validated: 0, pending: 0, bots: 0 });
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState("all");
  const [viewMode,       setViewMode]       = useState("table");
  const [search,         setSearch]         = useState("");
  const [siteFilter,     setSiteFilter]     = useState("all");
  const [projectFilter,  setProjectFilter]  = useState("all");
  const [periods,        setPeriods]        = useState([]);
  const [periodFilter,   setPeriodFilter]   = useState("all");
  const [rhStatusFilter, setRhStatusFilter] = useState("all"); // all | ACTIVE | OUT | FUTURE
  const [qualityFilter,  setQualityFilter]  = useState("all"); // all | incomplete | no_email | no_dates
  const [selectedIds,    setSelectedIds]    = useState([]);
  const [page,           setPage]           = useState(1);
  const perPage = 15;

  // Modals
  const [validateTarget,     setValidateTarget]     = useState(null);
  const [editDev,            setEditDev]            = useState(null);
  const [mergeTarget,        setMergeTarget]        = useState(null);
  const [editGroup,          setEditGroup]          = useState(null);
  const [deleteGroup,        setDeleteGroup]        = useState(null);
  const [deleteGroupLoading, setDeleteGroupLoading] = useState(false);
  const [archiveDev,         setArchiveDev]         = useState(null);
  const [archiveDevLoading,  setArchiveDevLoading]  = useState(false);
  const [showValidateAll,    setShowValidateAll]    = useState(false);
  const [toast,              setToast]              = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const duplicateIds = useMemo(() => detectDuplicates(allDevelopers), [allDevelopers]);

  // ── Helpers Entreprise ──────────────────────────────────────────────────────
  const isDevActiveInPeriod = useCallback((dev, periodId) => {
    if (!periodId || periodId === "all") return true;
    const p = periods.find(curr => String(curr.id) === String(periodId));
    if (!p || !dev.onboarding_date) return true;

    const pStart = new Date(p.year, p.month - 1, 1);
    const pEnd   = new Date(p.year, p.month, 0);
    const dStart = new Date(dev.onboarding_date);
    const dEnd   = dev.offboarding_date ? new Date(dev.offboarding_date) : null;

    // Un dev est actif s'il a commencé avant la fin du mois ET n'est pas parti avant le début du mois
    return dStart <= pEnd && (!dEnd || dEnd >= pStart);
  }, [periods]);

  // ── Chargement ─────────────────────────────────────────────────────────────
  const load = useCallback(async (projId, perId) => {
    setLoading(true);
    try {
      const selectedProjectId = projId !== undefined ? projId : (projectFilter !== "all" ? parseInt(projectFilter) : undefined);
      const selectedPeriodId  = perId  !== undefined ? perId  : (periodFilter  !== "all" ? parseInt(periodFilter)  : undefined);

      const [devsData, allDevsData, summaryData, groupsData, sitesData, projsData, periodsData] = await Promise.all([
        developerService.getByTab("all", selectedProjectId, false, selectedPeriodId),
        developerService.getByTab("all"),
        developerService.getSummary(selectedProjectId, null, false, selectedPeriodId),
        developerService.getGroups(undefined, false, selectedPeriodId),
        siteService.getAll(),
        projectService.getAll(),
        periodService.getAll(),
      ]);

      setDevelopers  (Array.isArray(devsData)    ? devsData    : (devsData?.items    || []));
      setAllDevelopers(Array.isArray(allDevsData) ? allDevsData : (allDevsData?.items || []));
      setSummary     (summaryData || { total: 0, validated: 0, pending: 0, bots: 0 });
      setGroups      (Array.isArray(groupsData)   ? groupsData  : []);
      setSites       (Array.isArray(sitesData)    ? sitesData   : []);
      setProjects    (Array.isArray(projsData)    ? projsData   : []);

      const sortedPeriods = Array.isArray(periodsData) ? [...periodsData].sort((a, b) => b.id - a.id) : [];
      setPeriods(sortedPeriods);

      // Retrait de l'auto-sélection forcée pour laisser l'utilisateur sur son choix (ex: Toutes périodes)

    } catch {
      showToast("Erreur lors du chargement des développeurs.", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast, projectFilter, periodFilter]);

  useEffect(() => {
    const init = async () => {
      try {
        const ps     = await periodService.getAll();
        const sorted = ps.sort((a, b) => b.id - a.id);
        const current = sorted.find(p => p.status === "open") || sorted[0];
        if (current) {
          setPeriodFilter(String(current.id));
          load(undefined, current.id);
        } else {
          load();
        }
      } catch {
        load();
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1); }, [search, siteFilter, activeTab, projectFilter, periodFilter, rhStatusFilter, qualityFilter]);

  const handleProjectChange = useCallback((newProjectId) => {
    setProjectFilter(newProjectId);
    setPage(1);
    const pid = newProjectId !== "all" ? parseInt(newProjectId) : undefined;
    load(pid, undefined);
  }, [load]);

  const handlePeriodChange = useCallback((newPeriodId) => {
    setPeriodFilter(newPeriodId);
    setPage(1);
    const perId = newPeriodId !== "all" ? parseInt(newPeriodId) : undefined;
    load(undefined, perId);
  }, [load]);

  // ── Qualité de donnée ──────────────────────────────────────────────────────
  const calculateQuality = useCallback((dev) => {
    let score = 0;
    if (dev.email)                            score += 30;
    if (dev.onboarding_date)                  score += 30;
    if (dev.primary_site_id)                  score += 20;
    if (dev.group_ids && dev.group_ids.length > 0) score += 20;
    return score;
  }, []);

  // ── Filtrage local ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return developers.filter(dev => {
      if (activeTab === "duplicates") return duplicateIds.has(dev.id);
      if (activeTab === "validated"  && (dev.is_validated !== true || dev.is_bot)) return false;
      if (activeTab === "pending"    && (dev.is_validated === true || dev.is_bot)) return false;
      if (activeTab === "bots"       && !dev.is_bot)  return false;
      if (activeTab === "all"        && dev.is_bot)   return false;

      if (rhStatusFilter !== "all" && dev.rh_status !== rhStatusFilter) return false;

      if (qualityFilter === "incomplete" && calculateQuality(dev) === 100) return false;
      if (qualityFilter === "no_email"   && dev.email)              return false;
      if (qualityFilter === "no_dates"   && dev.onboarding_date)    return false;

      const q = search.toLowerCase();
      if (q &&
        !(dev.gitlab_username || "").toLowerCase().includes(q) &&
        !(dev.name            || "").toLowerCase().includes(q) &&
        !(dev.email           || "").toLowerCase().includes(q)
      ) return false;

      if (siteFilter !== "all" && String(dev.primary_site_id) !== siteFilter) return false;

      return true;
    });
  }, [developers, activeTab, search, siteFilter, duplicateIds, rhStatusFilter, qualityFilter, calculateQuality]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  const selectedProject = useMemo(
    () => projects.find(p => String(p.id) === projectFilter),
    [projects, projectFilter]
  );

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleValidateAction = useCallback(async (devId, action) => {
    try {
      await developerService.validate(devId, { is_validated: action === "validate" });
      showToast(action === "validate" ? "Développeur validé avec succès." : "Développeur rejeté.");
      setValidateTarget(null);
      await load();
    } catch (err) {
      showToast(err.response?.data?.detail || err.message || "Erreur lors de l'action.", "danger");
    }
  }, [load, showToast]);

  const handleMergeConfirm = useCallback(async (duplicateId, canonicalId) => {
    if (!canonicalId || canonicalId === "?") {
      showToast("Impossible d'identifier le profil principal pour la fusion.", "danger");
      return;
    }
    try {
      await developerService.merge(canonicalId, duplicateId);
      showToast("Fusion réussie. L'historique entier a été transféré au profil principal.");
      setMergeTarget(null);
      await load();
    } catch (err) {
      showToast(err.response?.data?.detail || err.message || "Erreur lors de la fusion.", "danger");
    }
  }, [load, showToast]);

  const handleEditSave = useCallback(async (meta = {}) => {
    const { recalculationNeeded, changedFields } = meta;
    const isNew = !editDev?.id;
    setEditDev(null);
    
    if (recalculationNeeded) {
      const isExtractionRequired = changedFields.some(f => ["gitlab_username", "projects"].includes(f));
      const fieldList = changedFields.join(", ");
      
      setToast({
        type: isExtractionRequired ? "danger" : "warning",
        msg: (
          <div className="d-flex flex-column gap-1">
            <div className="fw-bold">
              <i className={`${isExtractionRequired ? "ri-error-warning-fill" : "ri-information-fill"} me-1`}></i>
              {isExtractionRequired ? "Extraction GitLab requise" : "Recalcul recommandé"}
            </div>
            <div className="fs-11 opacity-75">
              {isExtractionRequired 
                ? "Changements critiques détectés (identifiants/projets)."
                : "Impact détecté sur la répartition (sites/équipes/dates)."
              }
            </div>
            <Link to="/extraction" className={`btn btn-xs ${isExtractionRequired ? "btn-danger" : "btn-warning"} mt-1 fw-bold`} style={{ width: "fit-content" }}>
              {isExtractionRequired ? "Relancer l'extraction" : "Mettre à jour les KPIs"}
            </Link>
          </div>
        ),
        persistent: true
      });
      setTimeout(() => setToast(null), 12000);
    } else {
      showToast(isNew ? "Développeur ajouté avec succès." : "Développeur mis à jour.");
    }
    
    await load();
  }, [load, showToast, editDev]);

  const handleGroupSave = useCallback(async () => {
    const isNew = !editGroup?.id;
    setEditGroup(null);
    showToast(isNew ? "Groupe créé." : "Groupe mis à jour.");
    await load();
  }, [load, showToast, editGroup]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    setDeleteGroupLoading(true);
    try {
      await developerService.deleteGroup(groupId);
      showToast("Groupe supprimé.");
      setDeleteGroup(null);
      await load();
    } catch (err) {
      showToast(err.response?.data?.detail || err.message || "Erreur.", "danger");
      setDeleteGroup(null);
    } finally {
      setDeleteGroupLoading(false);
    }
  }, [load, showToast]);

  const getMergeCanonical = useCallback((dev) => {
    const dUser  = (dev.gitlab_username || "").toLowerCase().trim();
    const dEmail = (dev.email           || "").toLowerCase().trim();

    const matches = allDevelopers.filter(d => {
      if (d.id === dev.id) return false;
      const oUser  = (d.gitlab_username || "").toLowerCase().trim();
      const oEmail = (d.email           || "").toLowerCase().trim();
      return (dUser && oUser === dUser) || (dEmail && oEmail === dEmail);
    });

    if (matches.length > 0) {
      return matches.reduce((prev, curr) => (prev.id < curr.id ? prev : curr));
    }
    return null;
  }, [allDevelopers]);

  const exportCSV = useCallback(() => {
    const headers = ["ID", "Username GitLab", "Nom", "Email", "Site Principal", "Validé", "Bot", "Externe", "Doublon", "Créé le"];
    const rows    = filtered.map(dev => {
      const site = sites.find(s => s.id === dev.primary_site_id);
      return [
        dev.id,
        dev.gitlab_username || "",
        `"${(dev.name || "").replace(/"/g, '""')}"`,
        dev.email || "",
        site?.name || "",
        dev.is_validated ? "Oui" : "Non",
        dev.is_bot       ? "Oui" : "Non",
        dev.is_external  ? "Oui" : "Non",
        duplicateIds.has(dev.id) ? "Oui" : "Non",
        formatDate(dev.created_at),
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `developers_${selectedProject ? selectedProject.name + "_" : ""}${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, sites, duplicateIds, selectedProject]);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const displaySummary = useMemo(() => {
    if (periodFilter === "all") return summary;
    
    // ✅ Vision Entreprise : Recalcul des compteurs basés sur les actifs de la période
    const activeDevs = allDevelopers.filter(d => isDevActiveInPeriod(d, periodFilter));
    return {
      total:     activeDevs.length,
      validated: activeDevs.filter(d => d.is_validated && !d.is_bot).length,
      pending:   activeDevs.filter(d => !d.is_validated && !d.is_bot).length,
      bots:      activeDevs.filter(d => d.is_bot).length
    };
  }, [summary, allDevelopers, periodFilter, isDevActiveInPeriod]);

  const TABS = [
    { key: "all",       label: "Tous",       icon: "ri-team-line",            count: displaySummary.total + displaySummary.bots },
    { key: "validated", label: "Validés",    icon: "ri-checkbox-circle-line", count: displaySummary.validated            },
    { key: "pending",   label: "En attente", icon: "ri-time-line",            count: displaySummary.pending              },
    { key: "bots",      label: "Bots",       icon: "ri-robot-line",           count: displaySummary.bots                 },
    ...(duplicateIds.size > 0
      ? [{ key: "duplicates", label: "Doublons", icon: "ri-file-copy-line", count: duplicateIds.size, danger: true }]
      : []),
  ];

  const [validatingAll, setValidatingAll] = useState(false);
  const handleValidateAll = useCallback(async () => {
    setValidatingAll(true);
    try {
      const res = await developerService.validateAll();
      showToast(`${res.validated || 0} développeurs validés avec succès !`);
      setShowValidateAll(false);
      await load();
    } catch (err) {
      showToast(err.response?.data?.detail || err.message || "Erreur de validation globale.", "danger");
    } finally {
      setValidatingAll(false);
    }
  }, [load, showToast]);

  const [bulkLoading, setBulkLoading] = useState(false);
  const handleBulkValidate = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await developerService.validateSelected(selectedIds);
      showToast(`${res.count || selectedIds.length} profils validés avec succès !`);
      setSelectedIds([]);
      await load();
    } catch (err) {
      showToast(err.response?.data?.detail || err.message || "Erreur lors de la validation groupée.", "danger");
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, load, showToast]);

  const handleToggleActive = useCallback(async (dev) => {
    try {
      const willBeActive = !dev.is_active;
      const updateData   = { is_active: willBeActive };
      if (willBeActive) updateData.offboarding_date = null;
      await developerService.update(dev.id, updateData);
      showToast(`${devDisplayName(dev)} est maintenant ${willBeActive ? "Actif" : "Désactivé"}`);
      await load();
    } catch {
      showToast("Erreur lors du changement de statut", "danger");
    }
  }, [load, showToast]);

  const handleArchiveConfirm = useCallback(async (dev, date) => {
    setArchiveDevLoading(true);
    try {
      await developerService.update(dev.id, { offboarding_date: date, is_active: false });
      showToast(`${devDisplayName(dev)} a été archivé (Sortie fixée au ${new Date(date).toLocaleDateString("fr-FR")})`);
      setArchiveDev(null);
      await load();
    } catch {
      showToast("Erreur lors de l'archivage", "danger");
    } finally {
      setArchiveDevLoading(false);
    }
  }, [load, showToast]);

  const hasActiveFilters = search || siteFilter !== "all" || projectFilter !== "all";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── FIX : div.page-content ouvre et se ferme correctement ── */}
      <div className="page-content">
        <div className="container-fluid">
          <Toast toast={toast} />

          {/* Header */}
          <div className="row mt-3">
            <div className="col-12">
              <div className="page-title-box d-sm-flex align-items-center justify-content-between">
                <h4 className="mb-sm-0 d-flex align-items-center gap-3">
                  <i className="ri-team-line me-2 text-primary"></i>Gestion des Développeurs
                  {periodFilter !== "all" && (
                    <span className="badge bg-soft-primary text-primary fs-11 fw-medium border border-primary-subtle px-3 py-1 rounded-pill animate__animated animate__fadeIn">
                      <i className="ri-calendar-event-line me-1"></i>
                      {periods.find(p => String(p.id) === periodFilter)?.name || "Période active"}
                    </span>
                  )}
                </h4>
                <div className="d-flex gap-2">
                  <button className="btn btn-white border shadow-sm fs-13 fw-bold px-4" onClick={() => navigate("/admin/developers/import")}>
                    <i className="ri-upload-cloud-2-line me-1"></i> Importer
                  </button>
                  <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => setEditDev({})}>
                    <i className="ri-add-line me-1"></i> Nouveau Développeur
                  </button>
                </div>
              </div>
              <ol className="breadcrumb m-0 mb-4">
                <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
                <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Développeurs</li>
              </ol>
            </div>
          </div>
          {/* /Header */}

          {/* KPI Mini-Cards */}
          <div className="d-flex align-items-center gap-3 mb-4 flex-wrap">
            {[
              { label: "Effectif Actif", value: displaySummary.total + displaySummary.bots, color: "#3577f1", bg: "#eff6ff", icon: "ri-team-line",            tab: "all"       },
              { label: "Validés",    value: displaySummary.validated,                  color: "#0ab39c", bg: "#f0fdf4", icon: "ri-checkbox-circle-line", tab: "validated" },
              { label: "En attente", value: displaySummary.pending,                    color: "#f7b84b", bg: "#fffbeb", icon: "ri-time-line",            tab: "pending"   },
              { label: "Bots / CI",  value: displaySummary.bots,                       color: "#6f42c1", bg: "#f5f3ff", icon: "ri-robot-line",           tab: "bots"      },
            ].map((s, i) => (
              <div
                key={i}
                className="bg-white border-0 shadow-sm px-3 py-2 d-flex align-items-center gap-3 flex-grow-1"
                style={{
                  borderRadius: 12,
                  minWidth: 160,
                  cursor: "pointer",
                  borderBottom: activeTab === s.tab ? `3px solid ${s.color}` : "3px solid transparent",
                  transition: "all 0.2s ease",
                }}
                onClick={() => { setActiveTab(s.tab); setPage(1); }}
              >
                <div
                  className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                  style={{ width: 36, height: 36, background: s.bg }}
                >
                  <i className={`${s.icon} fs-18`} style={{ color: s.color }}></i>
                </div>
                <div>
                  <p className="text-muted fs-11 mb-0 text-uppercase fw-bold" style={{ letterSpacing: ".02em", opacity: 0.8 }}>{s.label}</p>
                  <h5 className="mb-0 fw-black" style={{ color: "#2d3748" }}>
                    {s.value}
                    {s.tab === "all" && periodFilter !== "all" && (
                      <span className="fs-10 text-muted fw-normal ms-1" style={{ textTransform: "none" }}>
                        / {allDevelopers.length} au total
                      </span>
                    )}
                  </h5>
                </div>
              </div>
            ))}

            {selectedProject && (
              <div className="ms-auto badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-2 rounded-pill d-flex align-items-center gap-2 shadow-sm">
                <i className="ri-filter-3-line"></i>
                <span className="fs-11 fw-bold">Vue Projet</span>
              </div>
            )}
          </div>
          {/* /KPI Mini-Cards */}

          {/* Alerte en attente */}
          {summary.pending > 0 && (
            <div
              className="alert d-flex align-items-center gap-3 mb-3"
              style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 12 }}
            >
              <i className="ri-time-line fs-3 flex-shrink-0 text-warning"></i>
              <div className="flex-grow-1">
                <strong className="text-warning-emphasis">
                  {summary.pending} développeur{summary.pending > 1 ? "s" : ""} en attente de validation
                </strong>
                <span className="text-muted fs-13 ms-2">— Validez-les pour les inclure dans les KPIs.</span>
              </div>
              <button className="btn btn-sm btn-warning flex-shrink-0 d-flex align-items-center" onClick={() => setShowValidateAll(true)} disabled={validatingAll}>
                {validatingAll ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="ri-check-double-line me-1"></i>}
                {validatingAll ? "Validation..." : "Tout Valider"}
              </button>
              <button className="btn btn-sm btn-outline-warning flex-shrink-0" onClick={() => setActiveTab("pending")} disabled={validatingAll}>
                <i className="ri-filter-line me-1"></i>Voir
              </button>
            </div>
          )}

          {/* Main row */}
          <div className="row">

            {/* ── Colonne principale ──────────────────────────────────────── */}
            <div className="col-xl-9">
              <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>

                {/* Tabs (card-header) */}
                <div className="card-header bg-white px-4 pt-3 pb-0" style={{ borderBottom: "1px solid #f0f2f5" }}>
                  <div className="d-flex align-items-center">
                    <ul className="nav nav-tabs-custom border-0 flex-grow-1" role="tablist">
                      {TABS.map(tab => (
                        <li key={tab.key} className="nav-item">
                          <button
                            className={`nav-link border-0 ${activeTab === tab.key ? "active fw-semibold" : "text-muted"} d-flex align-items-center gap-2 pb-3`}
                            onClick={() => { setActiveTab(tab.key); setPage(1); }}
                          >
                            <i className={tab.icon}></i>
                            {tab.label}
                            <span className={`badge rounded-pill fs-10 ${
                              tab.danger        ? "bg-danger text-white"
                              : activeTab === tab.key ? "bg-primary text-white"
                              : "bg-light text-dark"
                            }`}>
                              {tab.count}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="d-flex gap-1 ms-auto pb-2">
                      <button
                        className={`btn btn-sm btn-icon ${viewMode === "table" ? "btn-primary" : "btn-light"}`}
                        onClick={() => setViewMode("table")}
                        title="Vue tableau"
                      >
                        <i className="ri-list-check fs-15"></i>
                      </button>
                      <button
                        className={`btn btn-sm btn-icon ${viewMode === "cards" ? "btn-primary" : "btn-light"}`}
                        onClick={() => setViewMode("cards")}
                        title="Vue cartes"
                      >
                        <i className="ri-layout-grid-line fs-15"></i>
                      </button>
                    </div>
                  </div>
                </div>
                {/* /card-header Tabs */}

                {/* ── FIX : Barre de pilotage — UN SEUL bloc, tous les filtres dans le d-flex ── */}
                <div className="px-4 py-3" style={{ borderBottom: "1px solid #f0f2f5", background: "rgba(248,250,252,0.5)" }}>
                  <div className="d-flex gap-3 flex-wrap align-items-center">

                    {/* Recherche */}
                    <div className="search-box flex-grow-1" style={{ maxWidth: 300, position: "relative" }}>
                      <i className="ri-search-2-line position-absolute text-muted" style={{ left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}></i>
                      <input
                        type="text"
                        className="form-control form-control-sm ps-5 border-0 shadow-sm"
                        style={{ height: 38, borderRadius: 10, background: "#fff" }}
                        placeholder="Rechercher par nom, mail ou @tag…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                    </div>

                    <div className="h-divider mx-1" style={{ width: 1, height: 24, background: "#e2e8f0" }}></div>

                    {/* Filtre Période */}
                    <div className="dropdown">
                      <button
                        className={`btn btn-sm d-flex align-items-center gap-2 px-3 border-0 shadow-sm ${periodFilter !== "all" ? "btn-primary" : "btn-white"}`}
                        style={{ height: 38, borderRadius: 10, fontWeight: 500 }}
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <i className="ri-calendar-2-line"></i>
                        <span>{periodFilter === "all" ? "Toutes périodes" : (() => {
                          const p = periods.find(curr => String(curr.id) === periodFilter);
                          if (!p) return "Période";
                          return p.name || `${p.year} / ${p.month}` || `Période #${p.id}`;
                        })()}</span>
                        <i className="ri-arrow-down-s-line ms-1 opacity-50"></i>
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 py-2" style={{ borderRadius: 12, minWidth: 200 }}>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 ${periodFilter === "all" ? "active" : ""}`} onClick={() => handlePeriodChange("all")}>
                            Toutes périodes
                          </button>
                        </li>
                        <li><hr className="dropdown-divider opacity-50" /></li>
                        {periods.map(p => (
                          <li key={p.id}>
                            <button
                              className={`dropdown-item py-2 fs-13 d-flex align-items-center gap-2 ${periodFilter === String(p.id) ? "active" : ""}`}
                              onClick={() => handlePeriodChange(String(p.id))}
                            >
                              <i className={`ri-record-circle-fill fs-10 ${p.status === "open" ? "text-success" : "text-muted"}`}></i>
                              {p.name || `${p.year} / ${p.month}`}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* /Filtre Période */}

                    {/* Filtre Projet */}
                    <div className="dropdown">
                      <button
                        className={`btn btn-sm d-flex align-items-center gap-2 px-3 border-0 shadow-sm ${projectFilter !== "all" ? "btn-primary" : "btn-white"}`}
                        style={{ height: 38, borderRadius: 10, fontWeight: 500 }}
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <i className="ri-folder-6-line"></i>
                        <span>{projectFilter === "all" ? "Projets" : projects.find(p => String(p.id) === projectFilter)?.name}</span>
                        <i className="ri-arrow-down-s-line ms-1 opacity-50"></i>
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 py-2" style={{ borderRadius: 12, minWidth: 180 }}>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 ${projectFilter === "all" ? "active" : ""}`} onClick={() => handleProjectChange("all")}>
                            Tous les projets
                          </button>
                        </li>
                        <li><hr className="dropdown-divider opacity-50" /></li>
                        {projects.map(p => (
                          <li key={p.id}>
                            <button
                              className={`dropdown-item py-2 fs-13 ${projectFilter === String(p.id) ? "active" : ""}`}
                              onClick={() => handleProjectChange(String(p.id))}
                            >
                              {p.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* /Filtre Projet */}

                    {/* ── FIX : Filtre RH — une seule instance, valeurs correctes (ACTIVE | OUT | FUTURE) ── */}
                    <div className="dropdown">
                      <button
                        className={`btn btn-sm d-flex align-items-center gap-2 px-3 border-0 shadow-sm ${rhStatusFilter !== "all" ? "btn-primary" : "btn-white"}`}
                        style={{ height: 38, borderRadius: 10, fontWeight: 500 }}
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <i className="ri-user-follow-line"></i>
                        <span>
                          {rhStatusFilter === "all"    ? "Cycle RH"
                            : rhStatusFilter === "ACTIVE" ? "Actifs"
                            : rhStatusFilter === "OUT"    ? "Sorties"
                            : "Futurs"}
                        </span>
                        <i className="ri-arrow-down-s-line ms-1 opacity-50"></i>
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 py-2" style={{ borderRadius: 12, minWidth: 160 }}>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 ${rhStatusFilter === "all" ? "active" : ""}`} onClick={() => setRhStatusFilter("all")}>
                            Tout le cycle
                          </button>
                        </li>
                        <li><hr className="dropdown-divider opacity-50" /></li>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 d-flex align-items-center gap-2 ${rhStatusFilter === "ACTIVE" ? "active" : ""}`} onClick={() => setRhStatusFilter("ACTIVE")}>
                            <span className="rounded-circle bg-success" style={{ width: 8, height: 8, display: "inline-block" }}></span> Actifs
                          </button>
                        </li>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 d-flex align-items-center gap-2 ${rhStatusFilter === "OUT" ? "active" : ""}`} onClick={() => setRhStatusFilter("OUT")}>
                            <span className="rounded-circle bg-danger" style={{ width: 8, height: 8, display: "inline-block" }}></span> Sorties
                          </button>
                        </li>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 d-flex align-items-center gap-2 ${rhStatusFilter === "FUTURE" ? "active" : ""}`} onClick={() => setRhStatusFilter("FUTURE")}>
                            <span className="rounded-circle bg-info" style={{ width: 8, height: 8, display: "inline-block" }}></span> Futurs
                          </button>
                        </li>
                      </ul>
                    </div>
                    {/* /Filtre RH */}

                    {/* Filtre Qualité */}
                    <div className="dropdown">
                      <button
                        className={`btn btn-sm d-flex align-items-center gap-2 px-3 border-0 shadow-sm ${qualityFilter !== "all" ? "btn-warning text-dark" : "btn-white"}`}
                        style={{ height: 38, borderRadius: 10, fontWeight: 500 }}
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <i className="ri-shield-check-line"></i>
                        <span>Qualité</span>
                        {qualityFilter !== "all" && (
                          <span className="badge bg-dark text-white ms-1 rounded-pill" style={{ fontSize: 9 }}>1</span>
                        )}
                        <i className="ri-arrow-down-s-line ms-1 opacity-50"></i>
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 py-2" style={{ borderRadius: 12, minWidth: 180 }}>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 ${qualityFilter === "all" ? "active" : ""}`} onClick={() => setQualityFilter("all")}>
                            Toute qualité
                          </button>
                        </li>
                        <li><hr className="dropdown-divider opacity-50" /></li>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 ${qualityFilter === "incomplete" ? "active" : ""}`} onClick={() => setQualityFilter("incomplete")}>
                            Profils incomplets
                          </button>
                        </li>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 ${qualityFilter === "no_email" ? "active" : ""}`} onClick={() => setQualityFilter("no_email")}>
                            Sans email
                          </button>
                        </li>
                        <li>
                          <button className={`dropdown-item py-2 fs-13 ${qualityFilter === "no_dates" ? "active" : ""}`} onClick={() => setQualityFilter("no_dates")}>
                            Sans dates RH
                          </button>
                        </li>
                      </ul>
                    </div>
                    {/* /Filtre Qualité */}

                    {/* Actions finales */}
                    <div className="ms-auto d-flex gap-2">
                      {(hasActiveFilters || rhStatusFilter !== "all" || qualityFilter !== "all") && (
                        <button
                          className="btn btn-sm btn-soft-danger px-3 d-flex align-items-center gap-1"
                          style={{ height: 38, borderRadius: 10, fontWeight: 600 }}
                          onClick={() => {
                            setSearch("");
                            setSiteFilter("all");
                            handleProjectChange("all");
                            setRhStatusFilter("all");
                            setQualityFilter("all");
                          }}
                        >
                          <i className="ri-filter-off-line"></i> Effacer
                        </button>
                      )}
                      <button
                        className="btn btn-icon btn-white border-0 shadow-sm"
                        style={{ width: 38, height: 38, borderRadius: 10 }}
                        onClick={exportCSV}
                        title="Exporter CSV"
                      >
                        <i className="ri-download-2-line text-muted"></i>
                      </button>
                      <button
                        className="btn btn-icon btn-white border-0 shadow-sm text-primary"
                        style={{ width: 38, height: 38, borderRadius: 10 }}
                        onClick={() => load()}
                        title="Rafraîchir"
                      >
                        <i className="ri-refresh-line"></i>
                      </button>
                    </div>
                    {/* /Actions finales */}

                  </div>
                  {/* /d-flex filtres */}

                  {/* Info Bar */}
                  {!loading && (
                    <div className="mt-3 d-flex align-items-center gap-2 text-muted" style={{ fontSize: 12 }}>
                      <i className="ri-information-line"></i>
                      <span>
                        Affichage de <strong>{filtered.length}</strong> développeurs sur <strong>{allDevelopers.length}</strong>
                      </span>
                      {search && <span> • Résultat de recherche pour "<strong>{search}</strong>"</span>}
                    </div>
                  )}
                </div>
                {/* /Barre de pilotage */}

                {/* ── FIX : Bulk bar — une seule instance ── */}
                {selectedIds.length > 0 && (
                  <div
                    className="mx-4 my-3 p-2 rounded-3 d-flex align-items-center justify-content-between shadow-lg"
                    style={{ background: "linear-gradient(90deg, #3577f1, #299cdb)", border: "none" }}
                  >
                    <div className="d-flex align-items-center gap-3 ms-2">
                      <div
                        className="bg-white text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold"
                        style={{ width: 24, height: 24, fontSize: 12 }}
                      >
                        {selectedIds.length}
                      </div>
                      <span className="text-white fw-medium fs-13">Développeurs sélectionnés</span>
                    </div>
                    <div className="d-flex gap-2 me-2">
                      <button className="btn btn-sm btn-light fs-11 fw-bold" onClick={handleBulkValidate} disabled={bulkLoading}>
                        {bulkLoading
                          ? <span className="spinner-border spinner-border-sm me-1"></span>
                          : <i className="ri-checkbox-circle-line me-1 text-success"></i>
                        }
                        Valider la sélection
                      </button>
                      <button className="btn btn-sm btn-light fs-11 fw-bold" onClick={() => { /* TODO: Modal Bulk Group */ }}>
                        <i className="ri-group-line me-1 text-primary"></i>Assigner groupe
                      </button>
                      <button className="btn btn-sm text-white fs-11 fw-bold border-0 bg-transparent" onClick={() => setSelectedIds([])}>
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
                {/* /Bulk bar */}

                {/* Card body */}
                <div className="card-body p-0">
                  {loading ? (
                    <div className="py-5"><LoadingSpinner text="Chargement des développeurs…" /></div>
                  ) : filtered.length === 0 ? (
                    <EmptyState
                      icon={
                        activeTab === "pending"    ? "ri-time-line"      :
                        activeTab === "duplicates" ? "ri-file-copy-line" :
                        "ri-team-line"
                      }
                      title={
                        activeTab === "pending"    ? "Aucun développeur en attente"     :
                        activeTab === "bots"       ? "Aucun bot enregistré"             :
                        activeTab === "duplicates" ? "Aucun doublon détecté ✓"          :
                        selectedProject            ? `Aucun développeur dans "${selectedProject.name}"` :
                        search                     ? "Aucun résultat"                   :
                        "Aucun développeur"
                      }
                      description={
                        activeTab === "duplicates"
                          ? "Tous les développeurs ont un username et email uniques."
                          : selectedProject && !search
                            ? "Lancez une extraction pour associer des développeurs à ce projet."
                            : search
                              ? "Essayez avec d'autres critères de recherche."
                              : "Les développeurs sont créés lors des extractions GitLab ou via l'import CSV."
                      }
                      compact
                    />
                  ) : viewMode === "cards" ? (
                    <CardView
                      paginated={paginated}
                      sites={sites}
                      groups={groups}
                      duplicateIds={duplicateIds}
                      onValidate={setValidateTarget}
                      onEdit={setEditDev}
                      onMerge={dev => setMergeTarget({ dev, canonical: getMergeCanonical(dev) })}
                      onToggleActive={handleToggleActive}
                      onArchive={setArchiveDev}
                      periodFilter={periodFilter}
                      periods={periods}
                    />
                  ) : (
                    <TableView
                      paginated={paginated}
                      sites={sites}
                      groups={groups}
                      duplicateIds={duplicateIds}
                      developers={allDevelopers}
                      onValidate={setValidateTarget}
                      onEdit={setEditDev}
                      onMerge={dev => setMergeTarget({ dev, canonical: getMergeCanonical(dev) })}
                      onToggleActive={handleToggleActive}
                      onArchive={setArchiveDev}
                      selectedIds={selectedIds}
                      setSelectedIds={setSelectedIds}
                      calculateQuality={calculateQuality}
                      periodFilter={periodFilter}
                      periods={periods}
                    />
                  )}

                  <div className="px-4 py-2" style={{ borderTop: "1px solid #f0f2f5" }}>
                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      totalItems={filtered.length}
                      perPage={perPage}
                      onPageChange={setPage}
                    />
                  </div>
                </div>
                {/* /card-body */}

              </div>
              {/* /card */}
            </div>
            {/* /col-xl-9 */}

            {/* ── Colonne droite ──────────────────────────────────────────── */}
            <div className="col-xl-3">

              {/* Groupes */}
              <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                <div className="card-header bg-white d-flex align-items-center" style={{ borderBottom: "1px solid #f0f2f5" }}>
                  <h6 className="mb-0 fw-semibold flex-grow-1 fs-13">
                    <i className="ri-group-line me-2 text-primary"></i>Groupes ({groups.length})
                  </h6>
                  <button className="btn btn-sm btn-soft-primary" onClick={() => setEditGroup({})}>
                    <i className="ri-add-line"></i>
                  </button>
                </div>
                <div className="card-body p-0">
                  {groups.length === 0 ? (
                    <div className="text-center py-4 px-3">
                      <i className="ri-group-line fs-2 text-muted d-block mb-2 opacity-50"></i>
                      <p className="text-muted fs-13 mb-2">Aucun groupe</p>
                      <button className="btn btn-sm btn-soft-primary" onClick={() => setEditGroup({})}>
                        <i className="ri-add-line me-1"></i>Créer
                      </button>
                    </div>
                  ) : (
                    <ul className="list-group list-group-flush">
                      {groups.map(group => {
                        const site        = sites.find(s => s.id === group.site_id);
                        const memberCount = group.member_count || 0;
                        return (
                          <li key={group.id} className="list-group-item px-3 py-3">
                            <div className="d-flex align-items-start gap-2">
                              <div
                                className="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle flex-shrink-0"
                                style={{ width: 32, height: 32 }}
                              >
                                <i className="ri-group-line text-primary fs-14"></i>
                              </div>
                              <div className="flex-grow-1 min-w-0">
                                <p className="fw-semibold mb-1 fs-13 text-truncate">{group.name}</p>
                                <div className="d-flex flex-wrap gap-1">
                                  {site && (
                                    <span className="badge fs-10" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                                      {site.name}
                                    </span>
                                  )}
                                  <span className="badge fs-10 bg-light text-muted border">
                                    {memberCount} membre{memberCount !== 1 ? "s" : ""}
                                  </span>
                                </div>
                              </div>
                              <div className="d-flex gap-1 flex-shrink-0">
                                <button className="btn btn-xs btn-icon btn-soft-primary" onClick={() => setEditGroup(group)} title="Modifier">
                                  <i className="ri-pencil-fill fs-12"></i>
                                </button>
                                <button className="btn btn-xs btn-icon btn-soft-danger" onClick={() => setDeleteGroup(group)} title="Supprimer">
                                  <i className="ri-delete-bin-fill fs-12"></i>
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
              {/* /Groupes */}

              {/* Projets */}
              {projects.length > 0 && (
                <div className="card border-0 mt-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                  <div className="card-header bg-white" style={{ borderBottom: "1px solid #f0f2f5" }}>
                    <h6 className="mb-0 fw-semibold fs-13">
                      <i className="ri-folder-2-line me-2 text-muted"></i>Projets ({projects.length})
                    </h6>
                  </div>
                  <div className="card-body p-2">
                    <ul className="list-unstyled mb-0" style={{ maxHeight: 220, overflowY: "auto" }}>
                      {projects.map(proj => (
                        <li key={proj.id}>
                          <button
                            className="d-flex align-items-center gap-2 px-2 py-2 rounded-2 w-100 border-0 text-start"
                            style={{
                              background:  String(proj.id) === projectFilter ? "#eff6ff" : "transparent",
                              color:       String(proj.id) === projectFilter ? "#3577f1" : undefined,
                              cursor:      "pointer",
                              transition:  "background .15s",
                            }}
                            onClick={() => handleProjectChange(
                              String(proj.id) === projectFilter ? "all" : String(proj.id)
                            )}
                            title={`Filtrer par ${proj.name}`}
                          >
                            <i className={`ri-folder-2-line fs-14 ${String(proj.id) === projectFilter ? "text-primary" : "text-muted"}`}></i>
                            <span className="text-truncate fs-12" style={{ fontWeight: String(proj.id) === projectFilter ? 600 : 400 }}>
                              {proj.name}
                            </span>
                            {String(proj.id) === projectFilter && (
                              <i className="ri-check-line text-primary ms-auto flex-shrink-0 fs-13"></i>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {/* /Projets */}

              {/* Raccourci import */}
              <div
                className="card border-0 mt-3"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)", background: "linear-gradient(135deg, #eff6ff, #f0fdf4)" }}
              >
                <div className="card-body text-center py-4">
                  <i className="ri-upload-cloud-2-line fs-2 text-primary d-block mb-2"></i>
                  <p className="fw-semibold fs-13 mb-1">Import en masse</p>
                  <p className="text-muted fs-12 mb-3">Ajoutez plusieurs développeurs via un fichier CSV ou Excel</p>
                  <Link to="/admin/developers/import" className="btn btn-sm btn-primary w-100">
                    <i className="ri-upload-2-line me-1"></i>Importer un fichier
                  </Link>
                </div>
              </div>
              {/* /Raccourci import */}

            </div>
            {/* /col-xl-3 */}

          </div>
          {/* /row */}

        </div>
        {/* /container-fluid */}
      </div>
      {/* ── FIX : </div> page-content manquant — ajouté ── */}

      {/* ── Modals (hors page-content, dans le Fragment) ──────────────────── */}
      {validateTarget && (
        <ValidateModal
          dev={validateTarget.dev}
          action={validateTarget.action}
          onClose={() => setValidateTarget(null)}
          onConfirm={handleValidateAction}
        />
      )}
      {editDev && (
        <DevEditModal
          dev={editDev?.id ? editDev : null}
          sites={sites}
          groups={groups}
          projects={projects}
          period_id={periodFilter !== "all" ? parseInt(periodFilter) : null}
          periods={periods}
          onClose={() => setEditDev(null)}
          onSave={handleEditSave}
        />
      )}
      {mergeTarget && (
        <MergeModal
          dev={mergeTarget.dev}
          canonicalDev={mergeTarget.canonical || { id: "?", name: "Profil original", gitlab_username: "" }}
          onClose={() => setMergeTarget(null)}
          onConfirm={handleMergeConfirm}
        />
      )}
      {editGroup !== null && (
        <GroupModal
          group={editGroup?.id ? editGroup : null}
          sites={sites}
          onClose={() => setEditGroup(null)}
          onSave={handleGroupSave}
        />
      )}
      {deleteGroup && (
        <DeleteGroupModal
          group={deleteGroup}
          loading={deleteGroupLoading}
          onClose={() => setDeleteGroup(null)}
          onConfirm={() => handleDeleteGroup(deleteGroup.id)}
        />
      )}
      {showValidateAll && (
        <ValidateAllModal
          count={summary.pending}
          onClose={() => setShowValidateAll(false)}
          onConfirm={handleValidateAll}
        />
      )}
      {archiveDev && (
        <ArchiveModal
          dev={archiveDev}
          loading={archiveDevLoading}
          onClose={() => setArchiveDev(null)}
          onConfirm={handleArchiveConfirm}
        />
      )}
    </>
  );
};

export default DevelopersPage;