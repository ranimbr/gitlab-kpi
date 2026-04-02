/**
 * components/common/ImportResolutionStep.jsx — Enterprise v5
 *
 * PRINCIPE :
 * ─────────────────────────────────────────────────────────────────────────────
 * Après un dry-run révélant des sites/projets inconnus, ce composant s'insère
 * entre le rapport et le bouton "Confirmer l'import".
 *
 * Pour chaque entité inconnue, l'admin choisit parmi 3 actions :
 *   CRÉER   → crée l'entité via l'API (siteService / projectService) AVANT
 *             de relancer l'import réel. Le nouvel ID est utilisé par le backend.
 *   MAPPER  → sélectionne une entité existante en base. Le nom du CSV sera
 *             ignoré et remplacé par l'entité choisie.
 *   IGNORER → développeur créé sans association. Réassignez manuellement.
 *
 * WORKFLOW :
 *   1. Dry-run → backend retourne unknown_sites / unknown_projects
 *   2. Admin résout chaque conflit dans ce composant
 *   3. Clic "Appliquer et confirmer" :
 *      a. Crée les entités en mode CREATE via l'API
 *      b. Appelle onResolved(resolutions) pour notifier le parent
 *      c. Appelle onConfirm() pour relancer l'import réel
 *      (Le backend recevra create_missing_sites=true pour les entités créées)
 *
 * INTÉGRATION dans DevelopersImportPage.jsx :
 *   {showResolutionStep && hasPendingResolutions && (
 *     <ImportResolutionStep
 *       unknownSites     = {result.unknown_sites    || []}
 *       unknownProjects  = {result.unknown_projects || []}
 *       existingSites    = {sites}
 *       existingProjects = {projects}
 *       onResolved       = {(res) => setResolutions(res)}
 *       onConfirm        = {handleConfirmRealImport}
 *       loading          = {loading}
 *     />
 *   )}
 *
 * PROPS :
 *   unknownSites     : string[]   noms de sites introuvables (du dry-run)
 *   unknownProjects  : string[]   noms de projets introuvables
 *   existingSites    : Site[]     sites existants en base (pour le mapping)
 *   existingProjects : Project[]  projets existants
 *   onResolved       : fn(res)    callback avec l'objet resolutions complet
 *   onConfirm        : fn()       lance l'import réel après résolution
 *   loading          : bool
 */

import { useState, useEffect, useCallback } from "react";
import siteService    from "../../services/siteService";
import projectService from "../../services/projectService";

// ─── Constantes ────────────────────────────────────────────────────────────────
const ACTION_CREATE = "create";
const ACTION_MAP    = "map";
const ACTION_IGNORE = "ignore";

const TIMEZONES = [
  "Africa/Tunis", "Africa/Casablanca",
  "Europe/Paris", "Europe/London", "Europe/Berlin",
  "America/New_York", "Asia/Dubai",
];

const COUNTRIES = [
  "Tunisie", "Maroc", "Algérie", "France", "Allemagne",
  "Royaume-Uni", "États-Unis", "Émirats arabes unis", "À définir",
];

// ─── CSS injecté une seule fois ────────────────────────────────────────────────
const STYLES = `
  .imp-res-step {
    border-radius: 16px;
    background: #FAFAFA;
    border: 1.5px solid #E2E8F0;
    overflow: hidden;
    margin-top: 20px;
  }
  .imp-res-header {
    background: linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%);
    border-bottom: 1px solid #FCD34D;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .imp-res-icon {
    width: 48px; height: 48px;
    background: #F59E0B;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    font-size: 22px; color: white;
  }
  .imp-res-title { font-size: 15px; font-weight: 700; color: #92400E; margin: 0 0 2px; }
  .imp-res-desc  { font-size: 12px; color: #78350F; margin: 0; }
  .imp-res-badge {
    margin-left: auto;
    background: #F59E0B; color: white;
    border-radius: 20px; padding: 4px 12px;
    font-size: 12px; font-weight: 600;
    white-space: nowrap;
  }
  .imp-res-body { padding: 20px 24px; }
  .imp-res-section-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .08em; color: #64748B;
    display: flex; align-items: center; gap: 8px;
    margin: 0 0 12px;
  }
  .imp-res-section-title::after {
    content: ""; flex: 1;
    height: 1px; background: #E2E8F0;
  }
  .imp-res-card {
    background: white;
    border: 1.5px solid #E2E8F0;
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
    transition: border-color .2s, box-shadow .2s;
  }
  .imp-res-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.06); }
  .imp-res-card[data-action="create"] { border-color: #6EE7B7; }
  .imp-res-card[data-action="map"]    { border-color: #93C5FD; }
  .imp-res-card[data-action="ignore"] { border-color: #E2E8F0; opacity: .8; }
  .imp-res-card-header {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px; flex-wrap: wrap;
    background: #F8FAFC;
    border-bottom: 1px solid #F1F5F9;
  }
  .imp-res-badge-unknown {
    display: inline-flex; align-items: center; gap: 4px;
    background: #FEF3C7; color: #92400E;
    font-size: 10px; font-weight: 600;
    padding: 3px 8px; border-radius: 6px;
    flex-shrink: 0;
  }
  .imp-res-entity-name {
    font-weight: 600; font-size: 13px; color: #1E293B;
  }
  .imp-res-actions { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }
  .imp-res-action-btn {
    display: flex; align-items: center; gap: 4px;
    border: 1.5px solid #E2E8F0;
    background: white; border-radius: 8px;
    padding: 5px 10px; font-size: 11px; font-weight: 600;
    cursor: pointer; transition: all .15s; color: #64748B;
    white-space: nowrap;
  }
  .imp-res-action-btn:hover { border-color: #CBD5E1; background: #F8FAFC; }
  .imp-res-action-btn.active[data-variant="create"] { background: #ECFDF5; border-color: #6EE7B7; color: #065F46; }
  .imp-res-action-btn.active[data-variant="map"]    { background: #EFF6FF; border-color: #93C5FD; color: #1E40AF; }
  .imp-res-action-btn.active[data-variant="ignore"] { background: #F8FAFC; border-color: #CBD5E1; color: #475569; }
  .imp-res-form { padding: 14px 16px; }
  .imp-res-form-hint {
    font-size: 11px; color: #64748B;
    background: #F8FAFC; border-radius: 8px;
    padding: 8px 12px; margin-bottom: 12px;
    display: flex; align-items: flex-start; gap: 6px;
    border: 1px solid #E2E8F0;
  }
  .imp-res-form-hint i { flex-shrink: 0; margin-top: 1px; }
  .imp-res-fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
  }
  .imp-res-field label {
    font-size: 11px; font-weight: 600; color: #374151;
    display: block; margin-bottom: 4px;
  }
  .imp-res-field-full { grid-column: 1 / -1; }
  .imp-res-input, .imp-res-select {
    width: 100%; border: 1.5px solid #E2E8F0;
    border-radius: 8px; padding: 7px 10px;
    font-size: 12px; color: #1E293B; background: white;
    transition: border-color .15s;
  }
  .imp-res-input:focus, .imp-res-select:focus {
    outline: none; border-color: #93C5FD;
    box-shadow: 0 0 0 3px #EFF6FF;
  }
  .imp-res-ignore-note {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 12px 16px; font-size: 12px; color: #64748B;
  }
  .imp-res-animate {
    animation: impResSlideDown .2s ease;
  }
  @keyframes impResSlideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .imp-res-progress {
    display: flex; align-items: center; gap: 10px;
    background: #F0FDF4; border: 1px solid #A7F3D0;
    border-radius: 10px; padding: 10px 16px;
    margin-bottom: 16px; font-size: 12px;
  }
  .imp-res-progress-bar-wrap {
    flex: 1; height: 6px; background: #D1FAE5; border-radius: 3px;
  }
  .imp-res-progress-bar {
    height: 100%; background: #059669; border-radius: 3px;
    transition: width .3s ease;
  }
  .imp-res-footer {
    padding: 16px 24px;
    border-top: 1px solid #E2E8F0;
    display: flex; align-items: center; justify-content: space-between;
    background: #F8FAFC; gap: 12px; flex-wrap: wrap;
  }
  .imp-res-footer-hint { font-size: 11px; color: #64748B; }
  .imp-res-confirm-btn {
    display: flex; align-items: center; gap: 8px;
    background: #059669; color: white;
    border: none; border-radius: 10px;
    padding: 10px 24px; font-size: 13px; font-weight: 700;
    cursor: pointer; transition: background .15s;
    white-space: nowrap;
  }
  .imp-res-confirm-btn:hover:not(:disabled) { background: #047857; }
  .imp-res-confirm-btn:disabled { opacity: .6; cursor: not-allowed; background: #9CA3AF; }
  .imp-res-applied-banner {
    background: #ECFDF5; border: 1px solid #6EE7B7;
    border-radius: 10px; padding: 12px 16px;
    font-size: 12px; color: #065F46;
    display: flex; align-items: flex-start; gap: 10px;
    margin-bottom: 12px;
  }
  .imp-res-error-banner {
    background: #FEF2F2; border: 1px solid #FCA5A5;
    border-radius: 8px; padding: 8px 14px;
    font-size: 12px; color: #991B1B;
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 12px;
  }
  .imp-res-validation-hint {
    background: #FFFBEB; border: 1px solid #FCD34D;
    border-radius: 8px; padding: 8px 14px;
    font-size: 12px; color: #92400E;
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 12px;
  }
`;

// ─── Card résolution — Site ────────────────────────────────────────────────────
function SiteResolutionCard({ name, existingSites, resolution, onChange }) {
  const action = resolution?.action || ACTION_CREATE;

  return (
    <div className="imp-res-card" data-action={action}>
      <div className="imp-res-card-header">
        <div className="imp-res-badge-unknown">
          <i className="ri-map-pin-line"></i>
          <span>Site introuvable</span>
        </div>
        <span className="imp-res-entity-name">"{name}"</span>
        <div className="imp-res-actions">
          {[
            { key: ACTION_CREATE, icon: "ri-add-circle-line", label: "Créer"   },
            { key: ACTION_MAP,    icon: "ri-links-line",      label: "Mapper"  },
            { key: ACTION_IGNORE, icon: "ri-eye-off-line",    label: "Ignorer" },
          ].map(a => (
            <button
              key={a.key}
              className={`imp-res-action-btn ${action === a.key ? "active" : ""}`}
              data-variant={a.key}
              onClick={() => onChange({ ...resolution, action: a.key })}
              type="button"
              title={
                a.key === ACTION_CREATE ? "Créer ce site en base immédiatement"      :
                a.key === ACTION_MAP    ? "Associer à un site existant en base"      :
                "Développeur créé sans site — réassignez manuellement"
              }
            >
              <i className={a.icon}></i> {a.label}
            </button>
          ))}
        </div>
      </div>

      {action === ACTION_CREATE && (
        <div className="imp-res-form imp-res-animate">
          <div className="imp-res-form-hint">
            <i className="ri-information-line"></i>
            Le site sera créé avant l'import. Complétez les détails dans{" "}
            <strong>Administration → Sites</strong> après.
          </div>
          <div className="imp-res-fields">
            <div className="imp-res-field">
              <label>Nom du site</label>
              <input
                type="text"
                className="imp-res-input"
                value={resolution?.siteName ?? name}
                onChange={e => onChange({ ...resolution, action: ACTION_CREATE, siteName: e.target.value })}
                placeholder="Nom affiché"
              />
            </div>
            <div className="imp-res-field">
              <label>Pays</label>
              <select
                className="imp-res-select"
                value={resolution?.country ?? "À définir"}
                onChange={e => onChange({ ...resolution, action: ACTION_CREATE, country: e.target.value })}
              >
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="imp-res-field">
              <label>Fuseau horaire</label>
              <select
                className="imp-res-select"
                value={resolution?.timezone ?? ""}
                onChange={e => onChange({ ...resolution, action: ACTION_CREATE, timezone: e.target.value })}
              >
                <option value="">-- Optionnel --</option>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {action === ACTION_MAP && (
        <div className="imp-res-form imp-res-animate">
          <div className="imp-res-form-hint">
            <i className="ri-links-line"></i>
            Associez "{name}" à un site existant. Tous les développeurs avec ce nom
            de site seront rattachés au site sélectionné.
          </div>
          <div className="imp-res-fields">
            <div className="imp-res-field imp-res-field-full">
              <label>Site existant à utiliser</label>
              <select
                className="imp-res-select"
                value={resolution?.mappedId ?? ""}
                onChange={e => onChange({ ...resolution, action: ACTION_MAP, mappedId: e.target.value })}
              >
                <option value="">-- Sélectionner un site --</option>
                {existingSites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.country ? ` (${s.country})` : ""}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {action === ACTION_IGNORE && (
        <div className="imp-res-ignore-note imp-res-animate">
          <i className="ri-information-line flex-shrink-0 mt-1"></i>
          <span>
            Les développeurs avec le site "{name}" seront créés <strong>sans site principal</strong>.
            Réassignez-les manuellement dans <strong>Gérer les développeurs</strong> après l'import.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Card résolution — Projet ──────────────────────────────────────────────────
function ProjectResolutionCard({ name, existingProjects, resolution, onChange }) {
  const action = resolution?.action || ACTION_CREATE;

  return (
    <div className="imp-res-card" data-action={action}>
      <div className="imp-res-card-header">
        <div className="imp-res-badge-unknown"
          style={{ background: "#EEF2FF", color: "#4F46E5" }}>
          <i className="ri-folder-2-line"></i>
          <span>Projet introuvable</span>
        </div>
        <span className="imp-res-entity-name">"{name}"</span>
        <div className="imp-res-actions">
          {[
            { key: ACTION_CREATE, icon: "ri-add-circle-line", label: "Créer"   },
            { key: ACTION_MAP,    icon: "ri-links-line",      label: "Mapper"  },
            { key: ACTION_IGNORE, icon: "ri-eye-off-line",    label: "Ignorer" },
          ].map(a => (
            <button
              key={a.key}
              className={`imp-res-action-btn ${action === a.key ? "active" : ""}`}
              data-variant={a.key}
              onClick={() => onChange({ ...resolution, action: a.key })}
              type="button"
            >
              <i className={a.icon}></i> {a.label}
            </button>
          ))}
        </div>
      </div>

      {action === ACTION_CREATE && (
        <div className="imp-res-form imp-res-animate">
          <div className="imp-res-form-hint">
            <i className="ri-information-line"></i>
            Le projet sera créé avec des valeurs minimales. Assignez un
            <strong> gitlab_project_id</strong> dans Administration → Projets après l'import.
          </div>
          <div className="imp-res-fields">
            <div className="imp-res-field imp-res-field-full">
              <label>Nom du projet</label>
              <input
                type="text"
                className="imp-res-input"
                value={resolution?.projectName ?? name}
                onChange={e => onChange({ ...resolution, action: ACTION_CREATE, projectName: e.target.value })}
                placeholder="Nom affiché"
              />
            </div>
          </div>
        </div>
      )}

      {action === ACTION_MAP && (
        <div className="imp-res-form imp-res-animate">
          <div className="imp-res-form-hint">
            <i className="ri-links-line"></i>
            Associez "{name}" à un projet existant en base.
          </div>
          <div className="imp-res-fields">
            <div className="imp-res-field imp-res-field-full">
              <label>Projet existant à utiliser</label>
              <select
                className="imp-res-select"
                value={resolution?.mappedId ?? ""}
                onChange={e => onChange({ ...resolution, action: ACTION_MAP, mappedId: e.target.value })}
              >
                <option value="">-- Sélectionner un projet --</option>
                {existingProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {action === ACTION_IGNORE && (
        <div className="imp-res-ignore-note imp-res-animate">
          <i className="ri-information-line flex-shrink-0 mt-1"></i>
          <span>
            Les développeurs avec le projet "{name}" seront créés <strong>sans ce projet</strong>.
            Réassignez manuellement après l'import.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function ImportResolutionStep({
  unknownSites     = [],
  unknownProjects  = [],
  existingSites    = [],
  existingProjects = [],
  onResolved,
  onConfirm,
  loading = false,
}) {
  const [siteResolutions,    setSiteResolutions]    = useState({});
  const [projectResolutions, setProjectResolutions] = useState({});
  const [submitting,         setSubmitting]         = useState(false);
  const [applyStatus,        setApplyStatus]        = useState(null);
  const [appliedSites,       setAppliedSites]       = useState([]);
  const [appliedProjects,    setAppliedProjects]    = useState([]);
  const [applyError,         setApplyError]         = useState("");

  // ── Initialisation avec action CREATE par défaut ────────────────────────────
  useEffect(() => {
    const sr = {};
    unknownSites.forEach(s => {
      sr[s] = { action: ACTION_CREATE, siteName: s, country: "À définir", timezone: "" };
    });
    setSiteResolutions(sr);

    const pr = {};
    unknownProjects.forEach(p => {
      pr[p] = { action: ACTION_CREATE, projectName: p };
    });
    setProjectResolutions(pr);
  }, [unknownSites, unknownProjects]);

  // ── Validation : chaque MAP doit avoir un ID sélectionné ───────────────────
  const isValid = useCallback(() => {
    for (const r of Object.values(siteResolutions)) {
      if (r.action === ACTION_MAP && !r.mappedId) return false;
    }
    for (const r of Object.values(projectResolutions)) {
      if (r.action === ACTION_MAP && !r.mappedId) return false;
    }
    return true;
  }, [siteResolutions, projectResolutions]);

  // ── Compte des résolutions configurées ─────────────────────────────────────
  const totalUnknown  = unknownSites.length + unknownProjects.length;
  const resolvedCount = [
    ...Object.values(siteResolutions),
    ...Object.values(projectResolutions),
  ].filter(r => r?.action).length;

  // ── Appliquer les résolutions CREATE puis lancer l'import ──────────────────
  const handleApplyAndImport = async () => {
    if (!isValid()) return;
    setSubmitting(true);
    setApplyStatus("applying");
    setApplyError("");

    const newSites    = [];
    const newProjects = [];

    try {
      // 1. Créer les sites en mode CREATE
      for (const [csvName, r] of Object.entries(siteResolutions)) {
        if (r.action === ACTION_CREATE) {
          const created = await siteService.create({
            name:      (r.siteName || csvName).trim(),
            country:   r.country  || "À définir",
            timezone:  r.timezone || null,
            is_active: true,
          });
          newSites.push({ csvName, created });
        }
      }

      // 2. Créer les projets en mode CREATE
      for (const [csvName, r] of Object.entries(projectResolutions)) {
        if (r.action === ACTION_CREATE) {
          const created = await projectService.create({
            name:        (r.projectName || csvName).trim(),
            description: "Créé depuis l'import CSV développeurs",
            is_active:   true,
          });
          newProjects.push({ csvName, created });
        }
      }

      setAppliedSites(newSites);
      setAppliedProjects(newProjects);
      setApplyStatus("done");

      // Notifier le parent avec le détail complet
      onResolved?.({
        sites: {
          ...siteResolutions,
          ...Object.fromEntries(newSites.map(s => [
            s.csvName, { action: "created", id: s.created.id, name: s.created.name }
          ])),
        },
        projects: {
          ...projectResolutions,
          ...Object.fromEntries(newProjects.map(p => [
            p.csvName, { action: "created", id: p.created.id, name: p.created.name }
          ])),
        },
      });

    } catch (err) {
      setApplyStatus("error");
      setApplyError(
        err?.response?.data?.detail ||
        err?.message ||
        "Erreur lors de la création des entités. Vérifiez votre connexion."
      );
      setSubmitting(false);
      return;
    }

    // 3. Lancer l'import réel
    setSubmitting(false);
    onConfirm?.();
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <div className="imp-res-step">

        {/* Header */}
        <div className="imp-res-header">
          <div className="imp-res-icon">
            <i className="ri-tools-line"></i>
          </div>
          <div>
            <p className="imp-res-title">Étape de résolution requise</p>
            <p className="imp-res-desc">
              {totalUnknown} entité{totalUnknown > 1 ? "s" : ""}{" "}
              non trouvée{totalUnknown > 1 ? "s" : ""} en base —
              résolvez chaque conflit avant de confirmer l'import.
            </p>
          </div>
          <span className="imp-res-badge">{resolvedCount}/{totalUnknown} résolus</span>
        </div>

        <div className="imp-res-body">

          {/* Barre de progression */}
          <div className="imp-res-progress">
            <i className="ri-checkbox-circle-line"
              style={{ color: "#059669", fontSize: 16, flexShrink: 0 }}></i>
            <span style={{ color: "#065F46", fontWeight: 600, whiteSpace: "nowrap" }}>
              {resolvedCount} / {totalUnknown} résolus
            </span>
            <div className="imp-res-progress-bar-wrap">
              <div className="imp-res-progress-bar"
                style={{ width: `${totalUnknown > 0 ? (resolvedCount / totalUnknown) * 100 : 0}%` }}>
              </div>
            </div>
          </div>

          {/* Avertissement validation MAP */}
          {!isValid() && (
            <div className="imp-res-validation-hint">
              <i className="ri-error-warning-line flex-shrink-0"></i>
              Sélectionnez un site ou projet existant pour chaque action "Mapper".
            </div>
          )}

          {/* Résolution des sites */}
          {unknownSites.length > 0 && (
            <div className="mb-4">
              <p className="imp-res-section-title">
                <i className="ri-map-pin-line" style={{ color: "#F59E0B" }}></i>
                Sites introuvables ({unknownSites.length})
              </p>
              {unknownSites.map(name => (
                <SiteResolutionCard
                  key={name}
                  name={name}
                  existingSites={existingSites}
                  resolution={siteResolutions[name]}
                  onChange={r => setSiteResolutions(prev => ({ ...prev, [name]: r }))}
                />
              ))}
            </div>
          )}

          {/* Résolution des projets */}
          {unknownProjects.length > 0 && (
            <div className="mb-2">
              <p className="imp-res-section-title">
                <i className="ri-folder-2-line" style={{ color: "#4F46E5" }}></i>
                Projets introuvables ({unknownProjects.length})
              </p>
              {unknownProjects.map(name => (
                <ProjectResolutionCard
                  key={name}
                  name={name}
                  existingProjects={existingProjects}
                  resolution={projectResolutions[name]}
                  onChange={r => setProjectResolutions(prev => ({ ...prev, [name]: r }))}
                />
              ))}
            </div>
          )}

          {/* Banneau entités créées */}
          {applyStatus === "done" && (appliedSites.length > 0 || appliedProjects.length > 0) && (
            <div className="imp-res-applied-banner">
              <i className="ri-checkbox-circle-line"
                style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}></i>
              <div>
                {appliedSites.length > 0 && (
                  <p className="mb-1">
                    <strong>{appliedSites.length} site{appliedSites.length > 1 ? "s" : ""} créé{appliedSites.length > 1 ? "s" : ""} :</strong>{" "}
                    {appliedSites.map(s => s.created.name).join(", ")}
                  </p>
                )}
                {appliedProjects.length > 0 && (
                  <p className="mb-0">
                    <strong>{appliedProjects.length} projet{appliedProjects.length > 1 ? "s" : ""} créé{appliedProjects.length > 1 ? "s" : ""} :</strong>{" "}
                    {appliedProjects.map(p => p.created.name).join(", ")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Erreur création */}
          {applyStatus === "error" && (
            <div className="imp-res-error-banner">
              <i className="ri-close-circle-line flex-shrink-0"></i>
              {applyError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="imp-res-footer">
          <p className="imp-res-footer-hint">
            <i className="ri-information-line me-1"></i>
            Les entités créées seront disponibles immédiatement dans Sites et Projets.
          </p>
          <button
            className="imp-res-confirm-btn"
            onClick={handleApplyAndImport}
            disabled={submitting || loading || !isValid()}
            type="button"
          >
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm"
                  style={{ width: 14, height: 14 }}></span>
                Résolution en cours…
              </>
            ) : (
              <>
                <i className="ri-shield-check-line"></i>
                Appliquer et confirmer l'import
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
