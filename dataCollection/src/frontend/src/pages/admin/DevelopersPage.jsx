/**
 * pages/admin/DevelopersPage.jsx
 *
 * AMÉLIORATIONS v3 (qualité entreprise) :
 * ─────────────────────────────────────────
 * [NEW-PROJ-FILTER] Filtre par projet :
 *   - Dropdown projet ajouté dans la barre de filtres
 *   - project_id passé à developerService.getByTab() → GET /developers?project_id=X
 *   - Le filtre projet est réinitialisé quand on change d'onglet
 *   - Affichage du nombre de devs dans le projet sélectionné
 *
 * [FIX-DUPL-LOAD] Chargement des doublons côté backend :
 *   - Pour la détection des doublons, on charge TOUS les devs (tab=all)
 *     sans filtre projet (pour voir les doublons globaux)
 *   - Pour l'affichage, on filtre par projet si sélectionné
 *
 * [FIX-FILTERS-SYNC] Synchronisation des filtres :
 *   - Quand project_id change → reload depuis backend
 *   - Stats cards recalculées selon le projet sélectionné
 *
 * [KEEP] Tout le reste est conservé à l'identique (groups, sites, modals, CSV, etc.)
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import developerService from "../../services/developerService";
import siteService      from "../../services/siteService";
import projectService   from "../../services/projectService";
import LoadingSpinner   from "../../components/common/LoadingSpinner";
import EmptyState       from "../../components/common/EmptyState";
import Pagination       from "../../components/common/Pagination";

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
  const byUsername  = {};
  const byEmail     = {};
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
  const isSuccess = toast.type === "success";
  return (
    <div
      className={`alert alert-${toast.type} d-flex align-items-center gap-2 position-fixed`}
      style={{
        zIndex: 9999, minWidth: 320, top: 80, right: 24,
        borderRadius: 12, border: "none",
        boxShadow: "0 8px 32px rgba(0,0,0,.15)",
        animation: "slideInRight .25s ease",
      }}
    >
      <i className={`${isSuccess ? "ri-checkbox-circle-line" : "ri-error-warning-line"} fs-16`}></i>
      <span className="fs-13 fw-medium">{toast.msg}</span>
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
      <div className="d-flex align-items-center justify-content-center rounded-circle bg-warning-subtle flex-shrink-0"
        style={{ width: size, height: size }}>
        <i className="ri-robot-line text-warning" style={{ fontSize: size * 0.4 }}></i>
      </div>
    );
  }
  return (
    <div className="d-flex align-items-center justify-content-center rounded-circle text-white fw-bold flex-shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.32 }}>
      {getInitials(dev.name || dev.gitlab_username)}
    </div>
  );
}

// ── ValidateModal ─────────────────────────────────────────────────────────────
function ValidateModal({ dev, action, onClose, onConfirm }) {
  const isReject = action === "reject";
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose, !loading);
  if (!dev) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(dev.id, action); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>
          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className={`d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 ${isReject ? "bg-danger-subtle" : "bg-success-subtle"}`}
              style={{ width: 48, height: 48 }}>
              <i className={`${isReject ? "ri-close-circle-line text-danger" : "ri-checkbox-circle-line text-success"} fs-22`}></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="fw-semibold mb-0 fs-15">{isReject ? "Rejeter ce développeur" : "Valider ce développeur"}</h5>
              <p className="text-muted fs-12 mb-0">{devHandle(dev)}{dev.email ? ` · ${dev.email}` : ""}</p>
            </div>
            <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>
          <div className="px-4 py-4">
            {isReject ? (
              <div className="alert alert-danger d-flex gap-2 py-2 fs-13 mb-0">
                <i className="ri-alert-line flex-shrink-0 mt-1"></i>
                Ce développeur sera <strong>exclu</strong> des calculs KPI et des extractions.
              </div>
            ) : (
              <div className="alert alert-success d-flex gap-2 py-2 fs-13 mb-0">
                <i className="ri-checkbox-circle-line flex-shrink-0 mt-1 text-success"></i>
                Ce développeur sera <strong>inclus</strong> dans les métriques KPI de l'équipe.
              </div>
            )}
          </div>
          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className={`btn btn-sm px-4 ${isReject ? "btn-danger" : "btn-success"}`}
              onClick={handleConfirm} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>En cours…</>
                : <><i className={`${isReject ? "ri-close-line" : "ri-check-line"} me-1`}></i>{isReject ? "Rejeter" : "Valider"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ValidateAllModal ──────────────────────────────────────────────────────────
function ValidateAllModal({ count, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose, !loading);

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>
          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 bg-warning-subtle"
              style={{ width: 48, height: 48 }}>
              <i className="ri-check-double-fill fs-22 text-warning"></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="fw-semibold mb-0 fs-15">Valider tous les développeurs ?</h5>
              <p className="text-muted fs-12 mb-0">Validation en masse</p>
            </div>
            <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>
          <div className="px-4 py-4">
            <div className="alert alert-warning d-flex gap-2 py-3 fs-13 mb-0" style={{ border: "1px solid #fcd34d", borderRadius: 12 }}>
              <i className="ri-information-line flex-shrink-0 mt-1 fs-5"></i>
              <div>
                Vous êtes sur le point de valider <strong>{count} développeur{count > 1 ? "s" : ""}</strong> en attente.
                <br />
                <span className="text-muted d-block mt-2">
                  Ces développeurs seront automatiquement inclus dans toutes les statistiques de l'organisation. Les robots (bots) détectés seront ignorés.
                </span>
              </div>
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-warning px-4 fw-medium"
              onClick={handleConfirm} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Validation en cours…</>
                : <><i className="ri-check-double-line me-1"></i>Tout Valider ({count})</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MergeModal ────────────────────────────────────────────────────────────────
function MergeModal({ dev, canonicalDev, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose, !loading);
  if (!dev) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(dev.id, canonicalDev?.id); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>
          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className="d-flex align-items-center justify-content-center rounded-circle bg-warning-subtle flex-shrink-0"
              style={{ width: 48, height: 48 }}>
              <i className="ri-file-copy-line text-warning fs-22"></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="fw-semibold mb-0 fs-15">Fusionner les développeurs</h5>
              <p className="text-muted fs-12 mb-0">Transfert de l'historique et suppression du doublon</p>
            </div>
            <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>
          <div className="px-4 py-4">
            <div className="alert alert-warning d-flex gap-2 py-3 fs-13 mb-3">
              <i className="ri-alert-line flex-shrink-0 mt-1"></i>
              <div>
                <strong>{devDisplayName(dev)}</strong> ({devHandle(dev)}) sera
                fusionné vers le profil :
                <br />
                <strong className="text-success">{devDisplayName(canonicalDev)} ({devHandle(canonicalDev)})</strong>
              </div>
            </div>
            <p className="text-muted fs-12 mb-0">
              <i className="ri-information-line me-1"></i>
              Tous les commits, KPIs et Merge Requests seront transférés automatiquement avant la suppression du doublon.
            </p>
          </div>
          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm px-4 text-white" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none" }} onClick={handleConfirm} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Fusion en cours…</>
                : <><i className="ri-merge-cells-horizontal-line me-1"></i>Fusionner les historiques</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DevEditModal ──────────────────────────────────────────────────────────────
function DevEditModal({ dev, sites, groups, onClose, onSave }) {
  const [form, setForm] = useState({
    name:            dev?.name            || "",
    email:           dev?.email           || "",
    gitlab_username: dev?.gitlab_username || "",
    primary_site_id: dev?.primary_site_id || "",
    group_id:        dev?.group_id        || "",
    is_bot:          dev?.is_bot          || false,
    is_external:     dev?.is_external     || false,
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  useEscapeKey(onClose, !loading);

  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Le nom est requis.");
    setLoading(true);
    try {
      const payload = {
        name:            form.name.trim()            || null,
        email:           form.email.trim()           || null,
        gitlab_username: form.gitlab_username.trim() || null,
        group_id:        form.group_id ? parseInt(form.group_id) : null,
        is_bot:          form.is_bot,
        is_external:     form.is_external,
      };
      if (form.primary_site_id) {
        payload.sites = [{ site_id: parseInt(form.primary_site_id), is_primary: true }];
      } else {
        payload.sites = [];
      }
      if (dev?.id) {
        await developerService.update(dev.id, payload);
      } else {
        await developerService.create(payload);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>
          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            {dev?.id ? (
              <Avatar dev={dev} size={44} />
            ) : (
              <div className="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle flex-shrink-0" style={{ width: 44, height: 44 }}>
                <i className="ri-user-add-line text-primary fs-20"></i>
              </div>
            )}
            <div className="flex-grow-1">
              <h5 className="fw-semibold mb-0 fs-15">{dev?.id ? "Modifier le développeur" : "Nouveau développeur"}</h5>
              <p className="text-muted fs-12 mb-0">{dev?.id ? devHandle(dev) : "Création manuelle"}</p>
            </div>
            <button className="btn-close" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>
          <div className="px-4 py-4">
            {error && (
              <div className="alert alert-danger d-flex gap-2 py-2 fs-13 mb-3">
                <i className="ri-error-warning-line flex-shrink-0"></i>{error}
              </div>
            )}
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Nom complet <span className="text-danger">*</span></label>
                <input type="text" name="name" className="form-control" value={form.name}
                  onChange={handle} placeholder="Prénom Nom" autoFocus />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">GitLab username</label>
                <div className="input-group">
                  <span className="input-group-text text-muted fs-13">@</span>
                  <input type="text" name="gitlab_username" className="form-control" value={form.gitlab_username}
                    onChange={handle} placeholder="handle.gitlab" />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Email</label>
                <input type="email" name="email" className="form-control" value={form.email}
                  onChange={handle} placeholder="dev@example.com" />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Site principal</label>
                <select name="primary_site_id" className="form-select" value={form.primary_site_id} onChange={handle}>
                  <option value="">— Aucun site —</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.country ? ` (${s.country})` : ""}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-12">
                <label className="form-label fw-medium fs-13">Groupe / Équipe</label>
                <select name="group_id" className="form-select" value={form.group_id} onChange={handle}>
                  <option value="">— Aucun groupe —</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-12">
                <div className="d-flex align-items-center justify-content-between rounded-3 p-3"
                  style={{ background: form.is_bot ? "#fffbeb" : "#f8fafc", border: `1px solid ${form.is_bot ? "#fcd34d" : "#e9ecef"}` }}>
                  <div>
                    <div className={`fw-medium fs-13 ${form.is_bot ? "text-warning" : ""}`}>
                      <i className={`${form.is_bot ? "ri-robot-line text-warning" : "ri-user-line text-muted"} me-1`}></i>
                      {form.is_bot ? "Compte bot / CI" : "Compte développeur humain"}
                    </div>
                    <div className="text-muted fs-12">
                      {form.is_bot ? "Exclu des calculs KPI" : "Inclus dans les métriques d'équipe"}
                    </div>
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input type="checkbox" className="form-check-input" role="switch"
                      name="is_bot" checked={form.is_bot} onChange={handle}
                      style={{ width: "2.5em", height: "1.4em", cursor: "pointer" }} />
                  </div>
                </div>
              </div>
              <div className="col-12">
                <div className="form-check">
                  <input type="checkbox" className="form-check-input" id="is_external"
                    name="is_external" checked={form.is_external} onChange={handle} />
                  <label className="form-check-label fs-13" htmlFor="is_external">
                    Prestataire externe{" "}
                    <span className="text-muted fw-normal">(exclu de certains KPIs internes)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement…</>
                : <><i className="ri-save-line me-1"></i>Enregistrer</>}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  useEscapeKey(onClose, !loading);

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
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,.22)" }}>
          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className="d-flex align-items-center justify-content-center rounded-circle text-white flex-shrink-0"
              style={{ width: 44, height: 44, background: "linear-gradient(135deg, #405189, #3577f1)" }}>
              <i className={isEdit ? "ri-edit-line" : "ri-group-line"}></i>
            </div>
            <div>
              <h5 className="fw-semibold mb-0 fs-15">{isEdit ? "Modifier le groupe" : "Nouveau groupe"}</h5>
              <p className="text-muted fs-12 mb-0">Équipe rattachée à un site</p>
            </div>
            <button className="btn-close ms-auto" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>
          <div className="px-4 py-4">
            {error && <div className="alert alert-danger py-2 fs-13 mb-3">{error}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Nom du groupe <span className="text-danger">*</span></label>
                <input type="text" className="form-control" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ex: Backend Tunis, Frontend Lyon…" autoFocus />
              </div>
              <div className="col-12">
                <label className="form-label fw-medium fs-13 mb-2">Sites associés</label>
                <div className="d-flex flex-wrap gap-2">
                  <div 
                    onClick={() => setForm(f => ({ ...f, site_ids: [] }))}
                    className={`badge border p-2 pe-3 cursor-pointer ${form.site_ids.length === 0 ? "bg-primary text-white border-primary" : "bg-light text-dark border-light"} d-flex align-items-center gap-1`}
                    style={{ cursor: "pointer", fontSize: "12px", borderRadius: "8px", transition: "all 0.2s" }}
                  >
                    <i className={form.site_ids.length === 0 ? "ri-check-line" : "ri-global-line"}></i> Tous les sites (Transverse)
                  </div>
                  {sites.map(s => {
                    const isSelected = form.site_ids.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          setForm(f => {
                            const newIds = isSelected 
                              ? f.site_ids.filter(id => id !== s.id) 
                              : [...f.site_ids, s.id];
                            return { ...f, site_ids: newIds };
                          });
                        }}
                        className={`badge border p-2 pe-3 cursor-pointer ${isSelected ? "bg-primary border-primary text-white" : "bg-white text-dark"} d-flex align-items-center gap-1`}
                        style={{ cursor: "pointer", fontSize: "12px", borderRadius: "8px", transition: "all 0.2s" }}
                      >
                        <i className={isSelected ? "ri-check-line" : "ri-map-pin-line"}></i> {s.name}
                      </div>
                    );
                  })}
                </div>
                <div className="form-text mt-2" style={{ fontSize: "11px" }}>
                  Sélectionnez un ou plusieurs sites. Laissez sur "Tous les sites" pour une équipe transverse.
                </div>
              </div>
              <div className="col-12">
                <label className="form-label fw-medium fs-13">
                  Description <span className="text-muted fw-normal">(optionnel)</span>
                </label>
                <input type="text" className="form-control" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="ex: Équipe backend du site Tunis" />
              </div>
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>
              {loading ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
              <i className="ri-save-line me-1"></i>{isEdit ? "Mettre à jour" : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DeleteGroupModal ──────────────────────────────────────────────────────────
function DeleteGroupModal({ group, loading, onClose, onConfirm }) {
  useEscapeKey(onClose, !loading);
  return (
    <div className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15,20,35,0.65)", backdropFilter: "blur(4px)", zIndex: 1055 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0" style={{ borderRadius: 20 }}>
          <div className="d-flex align-items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
            <div className="d-flex align-items-center justify-content-center rounded-circle bg-danger-subtle flex-shrink-0"
              style={{ width: 48, height: 48 }}>
              <i className="ri-delete-bin-line text-danger fs-22"></i>
            </div>
            <div>
              <h5 className="fw-semibold mb-0 fs-15">Supprimer ce groupe ?</h5>
              <p className="text-muted fs-12 mb-0">{group.name}</p>
            </div>
            <button className="btn-close ms-auto" onClick={onClose} disabled={loading} style={{ opacity: .4 }}></button>
          </div>
          <div className="px-4 py-4">
            <p className="text-muted fs-13 mb-0">
              La suppression est <strong>irréversible</strong>. Les développeurs du groupe ne seront pas supprimés.
            </p>
          </div>
          <div className="d-flex justify-content-end gap-2 px-4 py-3"
            style={{ borderTop: "1px solid #f0f2f5", background: "#fafbfc", borderRadius: "0 0 20px 20px" }}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Annuler</button>
            <button className="btn btn-sm btn-danger px-4" onClick={onConfirm} disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Suppression…</>
                : <><i className="ri-delete-bin-line me-1"></i>Supprimer</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TableView ─────────────────────────────────────────────────────────────────
function TableView({ paginated, sites, groups, duplicateIds, developers, onValidate, onEdit, onMerge }) {
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead style={{ background: "#fafbfc" }}>
          <tr>
            <th className="ps-4 py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Développeur</th>
            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Email</th>
            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Site principal</th>
            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Groupe</th>
            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Statut</th>
            <th className="py-3 text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Créé le</th>
            <th className="pe-4 py-3 text-center text-muted fs-11 fw-semibold text-uppercase" style={{ letterSpacing: ".05em" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map(dev => {
            const site      = sites.find(s => s.id === dev.primary_site_id);
            const isPending = dev.is_validated !== true && !dev.is_bot;
            const isDup     = duplicateIds.has(dev.id);
            return (
              <tr key={dev.id} style={isDup ? { background: "#fff7f7" } : {}}>
                <td className="ps-4 py-3">
                  <div className="d-flex align-items-center gap-3">
                    <Avatar dev={dev} size={36} />
                    <div>
                      <div className="d-flex align-items-center gap-1 flex-wrap">
                        <p className="fw-semibold mb-0 fs-13">{devDisplayName(dev)}</p>
                        {isDup && (
                          <span className="badge fs-10" style={{ background: "#fee2e2", color: "#b91c1c" }}
                            title="Username ou email déjà utilisé par un autre développeur">
                            <i className="ri-file-copy-line me-1"></i>Doublon
                          </span>
                        )}
                      </div>
                      <p className="text-muted mb-0 fs-11">{devHandle(dev)}</p>
                    </div>
                  </div>
                </td>
                <td className="text-muted fs-12">{dev.email || "—"}</td>
                <td>
                  {site
                    ? <span className="badge fs-11" style={{ background: "#e0f2fe", color: "#0369a1" }}><i className="ri-map-pin-line me-1"></i>{site.name}</span>
                    : <span className="text-muted fs-12">—</span>}
                </td>
                <td>
                  {dev.group_id 
                    ? <span className="badge fs-11" style={{ background: "#f5f3ff", color: "#6f42c1" }}><i className="ri-group-line me-1"></i>{groups.find(g => g.id === dev.group_id)?.name || "Groupe #"+dev.group_id}</span>
                    : <span className="text-muted fs-12">—</span>}
                </td>
                <td>
                  {dev.is_bot
                    ? <span className="badge fs-11" style={{ background: "#fef9c3", color: "#a16207" }}><i className="ri-robot-line me-1"></i>Bot</span>
                    : isPending
                      ? <span className="badge fs-11" style={{ background: "#fef9c3", color: "#a16207" }}>En attente</span>
                      : <span className="badge fs-11" style={{ background: "#dcfce7", color: "#15803d" }}>Validé</span>}
                </td>
                <td className="text-muted fs-12">{formatDate(dev.created_at)}</td>
                <td className="pe-4 text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    {isPending && (
                      <>
                        <button className="btn btn-sm btn-icon btn-soft-success" title="Valider"
                          onClick={() => onValidate({ dev, action: "validate" })}>
                          <i className="ri-check-line fs-14"></i>
                        </button>
                        <button className="btn btn-sm btn-icon btn-soft-danger" title="Rejeter"
                          onClick={() => onValidate({ dev, action: "reject" })}>
                          <i className="ri-close-line fs-14"></i>
                        </button>
                      </>
                    )}
                    <button className="btn btn-sm btn-icon btn-soft-primary" title="Modifier"
                      onClick={() => onEdit(dev)}>
                      <i className="ri-pencil-fill fs-14"></i>
                    </button>
                    {isDup && (
                      <button className="btn btn-sm btn-icon text-white" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none" }} title="Fusionner les historiques"
                        onClick={() => onMerge(dev)}>
                        <i className="ri-merge-cells-horizontal-line fs-14"></i>
                      </button>
                    )}
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
function CardView({ paginated, sites, groups, duplicateIds, onValidate, onEdit, onMerge }) {
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
                        : isPending
                          ? <span className="badge fs-10" style={{ background: "#fef9c3", color: "#a16207" }}>En attente</span>
                          : <span className="badge fs-10" style={{ background: "#dcfce7", color: "#15803d" }}>Validé</span>}
                      {dev.is_external && <span className="badge fs-10" style={{ background: "#f5f3ff", color: "#6f42c1" }}>Externe</span>}
                      {site && <span className="badge fs-10" style={{ background: "#e0f2fe", color: "#0369a1" }}><i className="ri-map-pin-line me-1"></i>{site.name}</span>}
                      {dev.group_id && <span className="badge fs-10" style={{ background: "#f5f3ff", color: "#6f42c1" }}><i className="ri-group-line me-1"></i>{groups.find(g => g.id === dev.group_id)?.name || "Grp."}</span>}
                    </div>
                  </div>
                </div>
                {dev.email && (
                  <p className="text-muted fs-12 mb-0 text-truncate">
                    <i className="ri-mail-line me-1"></i>{dev.email}
                  </p>
                )}
                <div className="mt-auto pt-2 border-top d-flex gap-1">
                  {isPending && (
                    <>
                      <button className="btn btn-sm btn-soft-success flex-fill"
                        onClick={() => onValidate({ dev, action: "validate" })}>
                        <i className="ri-check-line me-1"></i>Valider
                      </button>
                      <button className="btn btn-sm btn-soft-danger" onClick={() => onValidate({ dev, action: "reject" })}>
                        <i className="ri-close-line"></i>
                      </button>
                    </>
                  )}
                  <button className="btn btn-sm btn-soft-primary" onClick={() => onEdit(dev)}>
                    <i className="ri-pencil-line"></i>
                  </button>
                  {isDup && (
                    <button className="btn btn-sm text-white" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none" }} title="Fusionner les historiques" onClick={() => onMerge(dev)}>
                      <i className="ri-merge-cells-horizontal-line"></i>
                    </button>
                  )}
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
export default function DevelopersPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [developers,     setDevelopers]     = useState([]);
  const [allDevelopers,  setAllDevelopers]  = useState([]); // tous les devs pour la dédup globale
  const [groups,         setGroups]         = useState([]);
  const [sites,          setSites]          = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [summary,        setSummary]        = useState({ total: 0, validated: 0, pending: 0, bots: 0 });
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState("all");
  const [viewMode,       setViewMode]       = useState("table");
  const [search,         setSearch]         = useState("");
  const [siteFilter,     setSiteFilter]     = useState("all");
  // ── [NEW-PROJ-FILTER] Filtre projet ────────────────────────────────────────
  const [projectFilter,  setProjectFilter]  = useState("all");
  const [page,           setPage]           = useState(1);
  const perPage = 15;

  // Modals
  const [validateTarget,     setValidateTarget]     = useState(null);
  const [editDev,            setEditDev]            = useState(null);
  const [mergeTarget,        setMergeTarget]        = useState(null);
  const [editGroup,          setEditGroup]          = useState(null);
  const [deleteGroup,        setDeleteGroup]        = useState(null);
  const [deleteGroupLoading, setDeleteGroupLoading] = useState(false);
  const [showValidateAll,    setShowValidateAll]    = useState(false);
  const [toast,              setToast]              = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── [FIX-DUPL-LOAD] Doublons calculés sur la liste GLOBALE (sans filtre projet)
  const duplicateIds = useMemo(() => detectDuplicates(allDevelopers), [allDevelopers]);

  // ── Chargement ─────────────────────────────────────────────────────────────
  const load = useCallback(async (projId) => {
    setLoading(true);
    try {
      // [NEW-PROJ-FILTER] Si un projet est sélectionné → filtrer côté backend
      const selectedProjectId = projId !== undefined ? projId : (projectFilter !== "all" ? parseInt(projectFilter) : undefined);

      const [devsData, allDevsData, summaryData, groupsData, sitesData, projsData] = await Promise.all([
        // Liste filtrée par projet (pour l'affichage)
        developerService.getByTab("all", selectedProjectId),
        // Liste GLOBALE pour la détection des doublons (toujours sans filtre projet)
        developerService.getByTab("all"),
        // Summary filtré par projet
        developerService.getSummary(selectedProjectId),
        developerService.getGroups(),
        siteService.getAll(),
        projectService.getAll(),
      ]);

      setDevelopers  (Array.isArray(devsData)    ? devsData    : []);
      setAllDevelopers(Array.isArray(allDevsData) ? allDevsData : []);
      setSummary     (summaryData || { total: 0, validated: 0, pending: 0, bots: 0 });
      setGroups      (Array.isArray(groupsData)   ? groupsData  : []);
      setSites       (Array.isArray(sitesData)    ? sitesData   : []);
      setProjects    (Array.isArray(projsData)    ? projsData   : []);
    } catch {
      showToast("Erreur lors du chargement des développeurs.", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast, projectFilter]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [search, siteFilter, activeTab, projectFilter]);

  // ── [NEW-PROJ-FILTER] Rechargement quand le projet change ─────────────────
  const handleProjectChange = useCallback((newProjectId) => {
    setProjectFilter(newProjectId);
    setPage(1);
    const pid = newProjectId !== "all" ? parseInt(newProjectId) : undefined;
    load(pid);
  }, [load]);

  // ── Filtrage local (search + site + tab) ──────────────────────────────────
  const filtered = useMemo(() => {
    return developers.filter(dev => {
      if (activeTab === "duplicates") return duplicateIds.has(dev.id);
      if (activeTab === "validated"  && (dev.is_validated !== true || dev.is_bot)) return false;
      if (activeTab === "pending"    && (dev.is_validated === true || dev.is_bot))  return false;
      if (activeTab === "bots"       && !dev.is_bot)  return false;
      if (activeTab === "all"        && dev.is_bot)   return false;

      const q = search.toLowerCase();
      if (q && !(dev.gitlab_username || "").toLowerCase().includes(q) &&
               !(dev.name            || "").toLowerCase().includes(q) &&
               !(dev.email           || "").toLowerCase().includes(q)) return false;

      if (siteFilter !== "all" && String(dev.primary_site_id) !== siteFilter) return false;

      return true;
    });
  }, [developers, activeTab, search, siteFilter, duplicateIds]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  // Projet sélectionné (pour l'affichage du nom dans les filtres actifs)
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

  const handleEditSave   = useCallback(async () => {
    const isNew = !editDev?.id;
    setEditDev(null);
    showToast(isNew ? "Développeur ajouté avec succès." : "Développeur mis à jour.");
    await load();
  }, [load, showToast, editDev]);
  const handleGroupSave  = useCallback(async () => { const isNew = !editGroup?.id; setEditGroup(null); showToast(isNew ? "Groupe créé." : "Groupe mis à jour."); await load(); }, [load, showToast, editGroup]);

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
    const dEmail = (dev.email || "").toLowerCase().trim();

    const matches = allDevelopers.filter(d => {
      if (d.id === dev.id) return false;
      const oUser  = (d.gitlab_username || "").toLowerCase().trim();
      const oEmail = (d.email || "").toLowerCase().trim();
      return (dUser && oUser === dUser) || (dEmail && oEmail === dEmail);
    });

    if (matches.length > 0) {
      // Le profil canonique est toujours celui avec le plus petit ID (le plus ancien)
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
  const TABS = [
    { key: "all",       label: "Tous",       icon: "ri-team-line",            count: summary.total + summary.bots },
    { key: "validated", label: "Validés",    icon: "ri-checkbox-circle-line", count: summary.validated            },
    { key: "pending",   label: "En attente", icon: "ri-time-line",            count: summary.pending              },
    { key: "bots",      label: "Bots",       icon: "ri-robot-line",           count: summary.bots                 },
    ...(duplicateIds.size > 0
      ? [{ key: "duplicates", label: "Doublons", icon: "ri-file-copy-line", count: duplicateIds.size, danger: true }]
      : []),
  ];

  // ── [NEW] Handler Valider Tout ─────────────────────────────────────────────
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

  const hasActiveFilters = search || siteFilter !== "all" || projectFilter !== "all";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      <div className="container-fluid">
        <Toast toast={toast} />

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <div>
                <h4 className="mb-1 fw-semibold">
                  <i className="ri-team-line me-2 text-primary"></i>Gestion Développeurs
                </h4>
                <p className="text-muted fs-13 mb-0">
                  {/* [NEW-PROJ-FILTER] Afficher le projet filtré dans le sous-titre */}
                  {selectedProject ? (
                    <span>
                      <span className="badge me-2" style={{ background: "#eff6ff", color: "#3577f1", border: "1px solid #bfdbfe" }}>
                        <i className="ri-folder-2-line me-1"></i>{selectedProject.name}
                      </span>
                      {summary.total} développeur{summary.total !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span>{summary.total} développeurs</span>
                  )}
                  {" · "}
                  {summary.pending > 0
                    ? <span className="text-warning fw-medium">{summary.pending} en attente</span>
                    : <span className="text-success">Tous validés</span>}
                  {duplicateIds.size > 0 && (
                    <> · <span className="text-danger fw-medium">{duplicateIds.size} doublon{duplicateIds.size > 1 ? "s" : ""}</span></>
                  )}
                </p>
              </div>
              <div className="d-flex gap-2 align-items-center">
                <ol className="breadcrumb m-0 me-3">
                  <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                  <li className="breadcrumb-item">Administration</li>
                  <li className="breadcrumb-item active">Développeurs</li>
                </ol>
                <button className="btn btn-sm btn-primary" onClick={() => setEditDev({})}>
                  <i className="ri-user-add-line me-1"></i>Nouveau développeur
                </button>
                <Link to="/admin/developers/import" className="btn btn-sm btn-soft-info">
                  <i className="ri-upload-2-line me-1"></i>Importation CSV
                </Link>
                <button className="btn btn-sm btn-outline-primary" onClick={() => setEditGroup({})}>
                  <i className="ri-group-line me-1"></i>Nouveau groupe
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats cards ─────────────────────────────────────────────────── */}
        <div className="row g-3 mb-4">
          {[
            { label: "Total devs", value: summary.total,     color: "#3577f1", bg: "#eff6ff", icon: "ri-team-line",            tab: "all"       },
            { label: "Validés",    value: summary.validated, color: "#0ab39c", bg: "#f0fdf4", icon: "ri-checkbox-circle-line", tab: "validated" },
            { label: "En attente", value: summary.pending,   color: "#f7b84b", bg: "#fffbeb", icon: "ri-time-line",            tab: "pending"   },
            { label: "Bots / CI",  value: summary.bots,      color: "#6f42c1", bg: "#f5f3ff", icon: "ri-robot-line",           tab: "bots"      },
          ].map((s, i) => (
            <div key={i} className="col-xl-3 col-sm-6">
              <div className="card border-0 h-100"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)", cursor: "pointer",
                  outline: activeTab === s.tab ? `2px solid ${s.color}` : "none", transition: "outline .15s" }}
                onClick={() => { setActiveTab(s.tab); setPage(1); }}>
                <div className="card-body d-flex align-items-center gap-3">
                  <div className="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
                    style={{ width: 48, height: 48, background: s.bg }}>
                    <i className={`${s.icon} fs-22`} style={{ color: s.color }}></i>
                  </div>
                  <div>
                    <p className="text-muted fs-11 fw-semibold text-uppercase mb-1" style={{ letterSpacing: ".05em" }}>
                      {s.label}
                      {/* [NEW-PROJ-FILTER] Indicateur "filtré" sur les cards */}
                      {selectedProject && (
                        <span className="ms-1 fs-10 text-primary fw-normal">(projet)</span>
                      )}
                    </p>
                    <h3 className="fw-bold mb-0" style={{ color: s.color }}>{s.value}</h3>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Alertes contextuelles ───────────────────────────────────────── */}
        {summary.pending > 0 && (
          <div className="alert d-flex align-items-center gap-3 mb-3"
            style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 12 }}>
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

        {duplicateIds.size > 0 && (
          <div className="alert d-flex align-items-center gap-3 mb-3"
            style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12 }}>
            <i className="ri-file-copy-line fs-3 flex-shrink-0 text-danger"></i>
            <div className="flex-grow-1">
              <strong className="text-danger">
                {duplicateIds.size} doublon{duplicateIds.size > 1 ? "s" : ""} détecté{duplicateIds.size > 1 ? "s" : ""}
              </strong>
              <span className="text-muted fs-13 ms-2">
                — Même username ou email GitLab. Ces entrées peuvent fausser les KPIs.
              </span>
            </div>
            <button className="btn btn-sm btn-danger flex-shrink-0" onClick={() => setActiveTab("duplicates")}>
              <i className="ri-filter-line me-1"></i>Gérer les doublons
            </button>
          </div>
        )}

        <div className="row">
          {/* ── Colonne principale ─────────────────────────────────────────── */}
          <div className="col-xl-9">
            <div className="card border-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>

              {/* Tabs */}
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
                            tab.danger ? "bg-danger text-white"
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
                    <button className={`btn btn-sm btn-icon ${viewMode === "table" ? "btn-primary" : "btn-light"}`}
                      onClick={() => setViewMode("table")} title="Vue tableau">
                      <i className="ri-list-check fs-15"></i>
                    </button>
                    <button className={`btn btn-sm btn-icon ${viewMode === "cards" ? "btn-primary" : "btn-light"}`}
                      onClick={() => setViewMode("cards")} title="Vue cartes">
                      <i className="ri-layout-grid-line fs-15"></i>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── [NEW-PROJ-FILTER] Barre de filtres ──────────────────── */}
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #f0f2f5" }}>
                <div className="d-flex gap-2 flex-wrap align-items-center">

                  {/* Recherche */}
                  <div className="search-box" style={{ maxWidth: 260, position: "relative", flex: "1 1 200px" }}>
                    <input type="text" className="form-control form-control-sm ps-4"
                      placeholder="Rechercher @username, nom, email…"
                      value={search} onChange={e => setSearch(e.target.value)} />
                    <i className="ri-search-line position-absolute text-muted"
                      style={{ left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}></i>
                  </div>

                  {/* [NEW-PROJ-FILTER] Filtre projet */}
                  <select
                    className="form-select form-select-sm"
                    style={{
                      width: "auto", minWidth: 160,
                      // Highlight visuel si filtre actif
                      borderColor: projectFilter !== "all" ? "#3577f1" : undefined,
                      boxShadow:   projectFilter !== "all" ? "0 0 0 2px rgba(53,119,241,.15)" : undefined,
                    }}
                    value={projectFilter}
                    onChange={e => handleProjectChange(e.target.value)}
                  >
                    <option value="all">
                      {loading ? "Chargement…" : `Tous les projets (${projects.length})`}
                    </option>
                    {projects.map(p => (
                      <option key={p.id} value={String(p.id)}>{p.name}</option>
                    ))}
                  </select>

                  {/* Filtre site */}
                  <select className="form-select form-select-sm" style={{ width: "auto", minWidth: 140 }}
                    value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
                    <option value="all">Tous les sites</option>
                    {sites.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>

                  {/* Reset — visible si un filtre est actif */}
                  {hasActiveFilters && (
                    <button className="btn btn-sm btn-soft-secondary"
                      onClick={() => { setSearch(""); setSiteFilter("all"); handleProjectChange("all"); }}>
                      <i className="ri-close-line me-1"></i>Reset
                    </button>
                  )}

                  <div className="ms-auto d-flex gap-2">
                    {filtered.length > 0 && (
                      <button className="btn btn-sm btn-soft-success" onClick={exportCSV} title="Exporter CSV">
                        <i className="ri-download-2-line me-1"></i>CSV
                      </button>
                    )}
                    <button className="btn btn-sm btn-soft-primary" onClick={() => load()} title="Rafraîchir">
                      <i className="ri-refresh-line"></i>
                    </button>
                  </div>
                </div>

                {/* Filtres actifs — chips sous la barre */}
                {(projectFilter !== "all" || siteFilter !== "all") && (
                  <div className="d-flex gap-2 mt-2 flex-wrap">
                    {projectFilter !== "all" && selectedProject && (
                      <span className="badge d-flex align-items-center gap-1"
                        style={{ background: "#eff6ff", color: "#3577f1", border: "1px solid #bfdbfe", borderRadius: 20, padding: "4px 10px", fontSize: 11 }}>
                        <i className="ri-folder-2-line"></i>
                        {selectedProject.name}
                        <button className="btn-close" style={{ fontSize: 9, marginLeft: 2 }}
                          onClick={() => handleProjectChange("all")} aria-label="Retirer filtre projet"></button>
                      </span>
                    )}
                    {siteFilter !== "all" && (
                      <span className="badge d-flex align-items-center gap-1"
                        style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 20, padding: "4px 10px", fontSize: 11 }}>
                        <i className="ri-map-pin-line"></i>
                        {sites.find(s => String(s.id) === siteFilter)?.name || siteFilter}
                        <button className="btn-close" style={{ fontSize: 9, marginLeft: 2 }}
                          onClick={() => setSiteFilter("all")} aria-label="Retirer filtre site"></button>
                      </span>
                    )}
                  </div>
                )}

                {!loading && (
                  <p className="text-muted fs-11 mb-0 mt-2">
                    {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
                    {search && <> pour "<strong>{search}</strong>"</>}
                    {activeTab === "duplicates" && <> — <span className="text-danger">Doublons à traiter</span></>}
                  </p>
                )}
              </div>

              {/* Contenu */}
              <div className="card-body p-0">
                {loading ? (
                  <div className="py-5"><LoadingSpinner text="Chargement des développeurs…" /></div>
                ) : filtered.length === 0 ? (
                  <EmptyState
                    icon={activeTab === "pending" ? "ri-time-line" : activeTab === "duplicates" ? "ri-file-copy-line" : "ri-team-line"}
                    title={
                      activeTab === "pending"    ? "Aucun développeur en attente" :
                      activeTab === "bots"       ? "Aucun bot enregistré"         :
                      activeTab === "duplicates" ? "Aucun doublon détecté ✓"      :
                      selectedProject            ? `Aucun développeur dans "${selectedProject.name}"` :
                      search                     ? "Aucun résultat"               :
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
                    paginated={paginated} sites={sites} groups={groups} duplicateIds={duplicateIds}
                    onValidate={setValidateTarget}
                    onEdit={setEditDev}
                    onMerge={dev => setMergeTarget({ dev, canonical: getMergeCanonical(dev) })}
                  />
                ) : (
                  <TableView
                    paginated={paginated} sites={sites} groups={groups} duplicateIds={duplicateIds}
                    developers={allDevelopers}
                    onValidate={setValidateTarget}
                    onEdit={setEditDev}
                    onMerge={dev => setMergeTarget({ dev, canonical: getMergeCanonical(dev) })}
                  />
                )}
                <div className="px-4 py-2" style={{ borderTop: "1px solid #f0f2f5" }}>
                  <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Colonne droite ─────────────────────────────────────────────── */}
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
                      const memberCount = allDevelopers.filter(d => d.group_id === group.id).length;
                      return (
                        <li key={group.id} className="list-group-item px-3 py-3">
                          <div className="d-flex align-items-start gap-2">
                            <div className="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle flex-shrink-0"
                              style={{ width: 32, height: 32 }}>
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
                              <button className="btn btn-xs btn-icon btn-soft-primary"
                                onClick={() => setEditGroup(group)} title="Modifier">
                                <i className="ri-pencil-fill fs-12"></i>
                              </button>
                              <button className="btn btn-xs btn-icon btn-soft-danger"
                                onClick={() => setDeleteGroup(group)} title="Supprimer">
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
                        {/* [NEW-PROJ-FILTER] Clic sur un projet dans la sidebar → filtre */}
                        <button
                          className="d-flex align-items-center gap-2 px-2 py-2 rounded-2 w-100 border-0 text-start"
                          style={{
                            background: String(proj.id) === projectFilter ? "#eff6ff" : "transparent",
                            color:      String(proj.id) === projectFilter ? "#3577f1" : undefined,
                            cursor: "pointer",
                            transition: "background .15s",
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

            {/* Raccourci import */}
            <div className="card border-0 mt-3"
              style={{ boxShadow: "0 2px 8px rgba(0,0,0,.06)", background: "linear-gradient(135deg, #eff6ff, #f0fdf4)" }}>
              <div className="card-body text-center py-4">
                <i className="ri-upload-cloud-2-line fs-2 text-primary d-block mb-2"></i>
                <p className="fw-semibold fs-13 mb-1">Import en masse</p>
                <p className="text-muted fs-12 mb-3">Ajoutez plusieurs développeurs via un fichier CSV ou Excel</p>
                <Link to="/admin/developers/import" className="btn btn-sm btn-primary w-100">
                  <i className="ri-upload-2-line me-1"></i>Importer un fichier
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {validateTarget && (
        <ValidateModal
          dev={validateTarget.dev} action={validateTarget.action}
          onClose={() => setValidateTarget(null)}
          onConfirm={handleValidateAction}
        />
      )}
      {editDev && (
        <DevEditModal
          dev={editDev?.id ? editDev : null}
          sites={sites}
          groups={groups}
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
          group={editGroup?.id ? editGroup : null} sites={sites}
          onClose={() => setEditGroup(null)} onSave={handleGroupSave}
        />
      )}
      {deleteGroup && (
        <DeleteGroupModal
          group={deleteGroup} loading={deleteGroupLoading}
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
    </div>
  );
}
