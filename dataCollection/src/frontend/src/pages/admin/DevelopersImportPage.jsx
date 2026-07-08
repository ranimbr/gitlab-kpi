/**
 * pages/admin/DevelopersImportPage.jsx — Enterprise v5
 *
 * WORKFLOW COMPLET pour le cas "Leila Mansour — site Paris inexistant" :
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ÉTAPE 1 — Dry-run (prévisualisation)
 *   L'admin charge le CSV et clique "Prévisualiser".
 *   Le backend détecte que "Paris" n'existe pas en base.
 *   La réponse contient :
 *     unknown_sites: ["Paris"]
 *     rows[3].warnings: ["Site 'Paris' introuvable — développeur créé sans ce site."]
 *
 * ÉTAPE 2 — Résolution (ImportResolutionStep)
 *   Le composant s'affiche automatiquement.
 *   Pour "Paris", l'admin choisit parmi :
 *     CRÉER  → crée le site Paris (country=France, timezone=Europe/Paris) via siteService.create()
 *              PUIS relance l'import avec createMissingSites=true
 *     MAPPER → sélectionne un site existant (ex: "Tunis" si Paris = erreur de frappe)
 *              PUIS relance sans create (le nom est maintenant connu)
 *     IGNORER → import sans site pour Leila, réassignez manuellement après
 *
 * ÉTAPE 3 — Import réel
 *   handleConfirmRealImport() est appelé après résolution.
 *   Leila est créée correctement avec son site.
 *
 * CORRECTIONS v5 :
 *   [FIX-RUNIMPORT]   runImport() transmet createMissingSites/createMissingProjects
 *   [FIX-DRYFLAG]     dry_run=false lors de handleConfirmRealImport
 *   [FIX-IMPORTLOGS]  getImportLogs(10, 0) — 2 args
 *   [FIX-RESOLUTION]  handleConfirmRealImport utilise createMissingSites=true
 *                     si des entités ont été créées côté frontend (résolution CRÉER)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import developerService from "../../services/developerService";
import siteService      from "../../services/siteService";
import projectService   from "../../services/projectService";
import gitlabConfigService from "../../services/gitlabConfigService";
import periodService from "../../services/periodService";
import ImportResolutionStep from "../../components/common/ImportResolutionStep";

const ACCEPTED_EXTS = [".csv", ".xlsx", ".xls"];

// ─── Badge statut ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const MAP = {
    success:    { bg: "#dcfce7", color: "#15803d", label: "Succès",     icon: "ri-checkbox-circle-line" },
    error:      { bg: "#fee2e2", color: "#b91c1c", label: "Erreur",     icon: "ri-close-circle-line"    },
    duplicate:  { bg: "#fef9c3", color: "#a16207", label: "Doublon",    icon: "ri-file-copy-line"        },
    completed:  { bg: "#dcfce7", color: "#15803d", label: "Terminé",    icon: "ri-checkbox-circle-line" },
    failed:     { bg: "#fee2e2", color: "#b91c1c", label: "Échoué",     icon: "ri-close-circle-line"    },
    pending:    { bg: "#e0f2fe", color: "#0369a1", label: "En attente", icon: "ri-time-line"            },
    processing: { bg: "#f3e8ff", color: "#6d28d9", label: "En cours",   icon: "ri-loader-4-line"        },
  };
  const s = MAP[status] || MAP.pending;
  return (
    <span className="badge fs-11 fw-medium" style={{ background: s.bg, color: s.color }}>
      <i className={`${s.icon} me-1`}></i>{s.label}
    </span>
  );
}

// ─── Toggle enterprise ─────────────────────────────────────────────────────────
function EnterpriseToggle({ checked, onChange, labelOn, labelOff, descOn, descOff, colorOn = "#059669" }) {
  return (
    <div
      className="d-flex align-items-center justify-content-between rounded-3 p-3"
      style={{
        background: checked ? `${colorOn}10` : "#F8FAFC",
        border: `1px solid ${checked ? colorOn : "#E2E8F0"}`,
        transition: "all .2s",
      }}
    >
      <div>
        <p className="fw-medium fs-13 mb-0" style={{ color: checked ? colorOn : "#374151" }}>
          <i className={`${checked ? "ri-magic-line" : "ri-close-circle-line"} me-1`}
             style={{ color: checked ? colorOn : "#9CA3AF" }}></i>
          {checked ? labelOn : labelOff}
        </p>
        <p className="text-muted fs-12 mb-0">{checked ? descOn : descOff}</p>
      </div>
      <div className="form-check form-switch mb-0 ms-3">
        <input
          type="checkbox"
          className="form-check-input"
          role="switch"
          checked={checked}
          onChange={onChange}
          style={{ width: "2.5em", height: "1.4em", cursor: "pointer" }}
        />
      </div>
    </div>
  );
}

// ─── Bandeaux résultats (sites/projets créés ou inconnus) ──────────────────────
function ImportResultBanners({ result }) {
  if (!result) return null;
  const hasCreatedSites    = result.created_sites?.length    > 0;
  const hasCreatedProjects = result.created_projects?.length > 0;
  const hasUnknownSites    = result.unknown_sites?.length    > 0;
  const hasUnknownProjects = result.unknown_projects?.length > 0;
  const hasDeactivations   = result.deactivated_count > 0;

  if (!hasCreatedSites && !hasCreatedProjects && !hasUnknownSites && !hasUnknownProjects && !hasDeactivations) return null;

  return (
    <div className="d-flex flex-column gap-2 mt-3">
      {(hasCreatedSites || hasCreatedProjects) && (
        <div className="d-flex align-items-start gap-3 p-3 rounded-3"
          style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
          <i className="ri-magic-line text-success fs-20 flex-shrink-0 mt-1"></i>
          <div className="flex-grow-1">
            <p className="fw-semibold fs-13 mb-1 text-success">Entités créées automatiquement</p>
            {hasCreatedSites && (
              <p className="fs-12 text-muted mb-1">
                <strong>Sites créés :</strong>{" "}
                {result.created_sites.map((s, i) => (
                  <span key={i} className="badge me-1 fs-10"
                    style={{ background: "#D1FAE5", color: "#065F46" }}>{s}</span>
                ))}
                <span className="ms-1 text-muted">— country «À définir», à compléter dans{" "}
                  <Link to="/admin/sites" className="ms-1 text-success fw-medium">
                    Gestion des Sites <i className="ri-arrow-right-s-line"></i>
                  </Link>
                </span>
              </p>
            )}
            {hasCreatedProjects && (
              <p className="fs-12 text-muted mb-0">
                <strong>Projets créés :</strong>{" "}
                {result.created_projects.map((p, i) => (
                  <span key={i} className="badge me-1 fs-10"
                    style={{ background: "#D1FAE5", color: "#065F46" }}>{p}</span>
                ))}
                <span className="ms-1 text-muted">— à configurer dans{" "}
                  <Link to="/admin/projects" className="ms-1 text-success fw-medium">
                    Gestion des Projets <i className="ri-arrow-right-s-line"></i>
                  </Link>
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {hasDeactivations && (
        <div className="d-flex align-items-start gap-3 p-3 rounded-3"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <i className="ri-user-unfollow-line text-danger fs-20 flex-shrink-0 mt-1"></i>
          <div className="flex-grow-1">
            <p className="fw-semibold fs-13 mb-1 text-danger">Synchronisation Totale : Turnover détecté</p>
            <p className="fs-12 text-muted mb-0">
              <strong>{result.deactivated_count} développeur(s)</strong> ont été marqués comme <strong>Inactifs</strong> car ils ne figurent plus dans votre liste mensuelle.
              Leurs données historiques sont conservées mais ils n'apparaissent plus dans les KPIs actifs.
            </p>
          </div>
        </div>
      )}

      {(hasUnknownSites || hasUnknownProjects || result.unknown_groups?.length > 0) && (
        <div className="d-flex align-items-start gap-3 p-3 rounded-3"
          style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
          <i className="ri-alert-line text-warning fs-20 flex-shrink-0 mt-1"></i>
          <div className="flex-grow-1">
            <p className="fw-semibold fs-13 mb-1" style={{ color: "#92400E" }}>
              Entités introuvables — développeurs créés sans association
            </p>
            {hasUnknownSites && (
              <p className="fs-12 text-muted mb-1">
                <strong>Sites introuvables :</strong>{" "}
                {result.unknown_sites.map((s, i) => (
                  <span key={i} className="badge me-1 fs-10"
                    style={{ background: "#FEF3C7", color: "#92400E" }}>{s}</span>
                ))}
                <Link to="/admin/sites" className="ms-2 btn btn-xs btn-warning py-0 px-2 fs-11"
                  style={{ borderRadius: 6 }}>
                  <i className="ri-add-line me-1"></i>Créer ces sites
                </Link>
              </p>
            )}
            {hasUnknownProjects && (
              <p className="fs-12 text-muted mb-1">
                <strong>Projets introuvables :</strong>{" "}
                {result.unknown_projects.map((p, i) => (
                  <span key={i} className="badge me-1 fs-10"
                    style={{ background: "#FEF3C7", color: "#92400E" }}>{p}</span>
                ))}
                <Link to="/admin/projects" className="ms-2 btn btn-xs btn-warning py-0 px-2 fs-11"
                  style={{ borderRadius: 6 }}>
                  <i className="ri-add-line me-1"></i>Créer ces projets
                </Link>
              </p>
            )}
            {result.unknown_groups?.length > 0 && (
              <p className="fs-12 text-muted mb-1">
                <strong>Groupes introuvables :</strong>{" "}
                {result.unknown_groups.map((g, i) => (
                  <span key={i} className="badge me-1 fs-10"
                    style={{ background: "#FEF3C7", color: "#92400E" }}>{g}</span>
                ))}
              </p>
            )}
            <p className="fs-12 mb-0" style={{ color: "#78350F" }}>
              <i className="ri-information-line me-1"></i>
              Utilisez l'étape de résolution ci-dessous pour résoudre les conflits avant l'import réel.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Bandeau info : email unique / multi-affectation ──────────────────────────
function CsvFormatInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 rounded-3 overflow-hidden"
      style={{ border: "1px solid #BFDBFE", background: "#EFF6FF" }}>
      <button
        className="w-100 d-flex align-items-center gap-2 p-3 border-0 bg-transparent text-start"
        onClick={() => setOpen(v => !v)}
        type="button"
        style={{ cursor: "pointer" }}
      >
        <i className="ri-information-line text-primary fs-16 flex-shrink-0"></i>
        <span className="fw-semibold fs-13" style={{ color: "#1E40AF" }}>
          Règle email &amp; multi-affectation — Lire avant import
        </span>
        <i className={`ms-auto ri-arrow-${open ? "up" : "down"}-s-line text-primary`}></i>
      </button>
      {open && (
        <div className="px-3 pb-3 fs-12" style={{ color: "#1E40AF", borderTop: "1px solid #BFDBFE" }}>
          <div className="pt-3 d-flex flex-column gap-2">
            <div className="d-flex align-items-start gap-2">
              <i className="ri-mail-line flex-shrink-0 mt-1"></i>
              <div>
                <strong>Un email = un développeur unique.</strong> L'email est la clé de déduplication.
                Si un email apparaît deux fois dans le CSV, la 2ème ligne est traitée comme doublon.
              </div>
            </div>
            <div className="d-flex align-items-start gap-2">
              <i className="ri-links-line flex-shrink-0 mt-1"></i>
              <div>
                <strong>Multi-affectation via virgules dans la même ligne.</strong>
                <br />
                Un développeur peut appartenir à plusieurs sites et projets :{" "}
                <code className="ms-1 px-2 py-1 rounded"
                  style={{ background: "#DBEAFE", color: "#1E40AF", fontSize: 11 }}>
                  sites: "Paris,Tunis"
                </code>{" "}
                <code className="ms-1 px-2 py-1 rounded"
                  style={{ background: "#DBEAFE", color: "#1E40AF", fontSize: 11 }}>
                  projects: "backend-api,frontend"
                </code>
              </div>
            </div>
            <div className="d-flex align-items-start gap-2">
              <i className="ri-map-pin-line flex-shrink-0 mt-1"></i>
              <div>
                <strong>Site principal</strong> = le premier site listé dans la colonne <code>sites</code>.
              </div>
            </div>
            <div className="d-flex align-items-start gap-2">
              <i className="ri-calendar-event-line flex-shrink-0 mt-1"></i>
              <div>
                <strong>Simulation Historique :</strong> utilisez <code>onboarding_date</code> (format AAAA-MM-JJ) pour importer des données du passé. Le système calculera les KPIs rétroactivement pour ces périodes.
              </div>
            </div>
            <div className="d-flex align-items-start gap-2">
              <i className="ri-alert-line flex-shrink-0 mt-1 text-warning"></i>
              <div>
                <strong>Cas "site/projet inconnu" (ex: Paris non créé) :</strong> lancez d'abord le
                dry-run — l'étape de résolution vous permettra de Créer, Mapper ou Ignorer
                chaque entité inconnue avant l'import réel.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════

export default function DevelopersImportPage() {
  const [file,                  setFile]                  = useState(null);
  const [sites,                 setSites]                 = useState([]);
  const [projects,              setProjects]              = useState([]);
  const [groups,                setGroups]                = useState([]);
  const [siteId,                setSiteId]                = useState("");
  const [groupId,               setGroupId]              = useState("");
  const [dryRun,                setDryRun]                = useState(true);
  const [createMissingSites,    setCreateMissingSites]    = useState(false);
  const [createMissingProjects, setCreateMissingProjects] = useState(false);
  const [createMissingGroups,  setCreateMissingGroups]   = useState(false);
  const [fullSync,              setFullSync]             = useState(false);
  const [periods,               setPeriods]              = useState([]);
  const [periodId,              setPeriodId]             = useState("");
  const [loading,               setLoading]              = useState(false);
  const [gitlabConfigs,         setGitlabConfigs]        = useState([]);
  const [defaultGitlabConfigId, setDefaultGitlabConfigId] = useState("");
  const [result,                setResult]               = useState(null);
  const [error,                 setError]                = useState("");
  const [importLogs,            setImportLogs]           = useState([]);
  const [dragging,              setDragging]             = useState(false);
  const [activeTab,             setActiveTab]            = useState("success");
  const [resolutions,           setResolutions]          = useState(null);
  const [showResolutionStep,    setShowResolutionStep]   = useState(false);
  const fileInputRef = useRef();
  const resultsRef   = useRef(null);
  const actionRef    = useRef(null);

  // ── Indique si le dry-run a des entités à résoudre ──────────────────────────

  // ── Indique si le dry-run a des entités à résoudre ──────────────────────────
  const hasPendingResolutions = Boolean(
    result?.dry_run &&
    ((result?.unknown_sites?.length > 0) || (result?.unknown_projects?.length > 0) || (result?.unknown_groups?.length > 0))
  );

  const refreshLogs = useCallback(() => {
    developerService.getImportLogs(10, 0)
      .then(logs => setImportLogs(Array.isArray(logs) ? logs : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshData = async () => {
      try {
        const [sitesData, projectsData, groupsData, configsData, periodsData, logsData] = await Promise.allSettled([
          siteService.getAll(false),
          projectService.getAll?.() || Promise.resolve([]),
          developerService.getGroups(),
          gitlabConfigService.getAll(),
          periodService.getAll(),
          developerService.getImportLogs(10, 0),
        ]);

        if (cancelled) return;

        setSites(sitesData.status === 'fulfilled' ? sitesData.value : []);
        setProjects(projectsData.status === 'fulfilled' ? projectsData.value : []);
        setGroups(groupsData.status === 'fulfilled' ? groupsData.value : []);
        setGitlabConfigs(configsData.status === 'fulfilled' ? configsData.value : []);
        
        if (logsData.status === 'fulfilled') {
          setImportLogs(logsData.value);
        }

        if (periodsData.status === 'fulfilled') {
          const sortedPeriods = [...periodsData.value].sort((a, b) => b.id - a.id);
          setPeriods(sortedPeriods);
          // Auto-select current period if open
          const current = sortedPeriods.find(p => p.status === "open") || sortedPeriods[0];
          if (current) setPeriodId(current.id);
        }

        if (configsData.status === 'rejected') {
          console.error("Erreur chargement configs GitLab:", configsData.reason);
        }
      } catch (err) {
        console.error("Erreur critique chargement données:", err);
      }
    };

    refreshData();
    return () => { cancelled = true; };
  }, []);

  // ── Auto-scroll vers les résultats ──────────────────────────────────────────
  useEffect(() => {
    if ((result || error) && resultsRef.current) {
      setTimeout(() => {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [result, error]);

  // ── Auto-scroll vers la résolution si elle apparaît ─────────────────────────
  useEffect(() => {
    if (showResolutionStep && actionRef.current) {
      setTimeout(() => {
        actionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [showResolutionStep]);

  const handleFile = (f) => {
    if (!f) return;
    const ext = "." + f.name.split(".").pop().toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      setError("Format non supporté. Utilisez .csv, .xlsx ou .xls");
      return;
    }
    setFile(f);
    setResult(null);
    setError("");
    setResolutions(null);
    setShowResolutionStep(false);
  };

  const handleFileChange = (e) => handleFile(e.target.files[0]);
  const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); };

  // ── Import / Dry-run ─────────────────────────────────────────────────────────
  const handleImport = useCallback(async (forceDryRun = dryRun) => {
    if (!file) { setError("Veuillez sélectionner un fichier."); return; }
    setLoading(true);
    setError("");
    setResult(null);
    setResolutions(null);
    setShowResolutionStep(false);

    try {
      const res = await developerService.importFile(file, {
        defaultSiteId:         siteId  || null,
        defaultGroupId:        groupId || null,
        defaultGitlabConfigId: defaultGitlabConfigId || null,
        dryRun:                forceDryRun,
        createMissingSites:    forceDryRun ? false : createMissingSites,
        createMissingProjects: forceDryRun ? false : createMissingProjects,
        createMissingGroups:   forceDryRun ? false : createMissingGroups,
        fullSync:               forceDryRun ? false : fullSync,
        periodId:               periodId || null,
      });

      setResult(res);
      setActiveTab(res.error_count > 0 ? "error" : "success");

      // Afficher l'étape de résolution si dry-run avec entités inconnues
      if (forceDryRun && (res.unknown_sites?.length > 0 || res.unknown_projects?.length > 0 || res.unknown_groups?.length > 0)) {
        setShowResolutionStep(true);
      }

      refreshLogs();
    } catch (err) {
      setError(err.message || "Erreur lors de l'import.");
    } finally {
      setLoading(false);
    }
  }, [file, siteId, groupId, defaultGitlabConfigId, dryRun, createMissingSites, createMissingProjects, createMissingGroups, fullSync, refreshLogs]);

  /**
   * Appelé par ImportResolutionStep après que l'admin a :
   *   1. Créé les entités manquantes via l'API (action CRÉER)
   *   2. Sélectionné les entités existantes (action MAPPER)
   *   3. Cliqué "Appliquer et confirmer"
   *
   * À ce stade, les sites/projets "CRÉER" existent en base.
   * On relance l'import réel avec create_missing=true pour que le backend
   * retrouve ces entités par nom et les associe correctement.
   *
   * Les entités "MAPPER" ont été créées avant par ImportResolutionStep
   * (via siteService.create avec le bon nom), donc le backend les trouvera aussi.
   *
   * Les entités "IGNORER" seront ignorées (create_missing=false ne les crée pas).
   */
  const handleConfirmRealImport = useCallback(async (directResolutions = null) => {
    if (!file) return;
    setLoading(true);
    setError("");

    // Utiliser les résolutions directes si fournies, sinon le state (sécurité)
    const effectiveResolutions = directResolutions || resolutions;

    // Détecter si des entités ont été créées côté frontend (action CRÉER dans la résolution)
    const hadSiteCreations = effectiveResolutions && Object.values(effectiveResolutions.sites || {}).some(r => r.action === "created");
    const hadProjCreations = effectiveResolutions && Object.values(effectiveResolutions.projects || {}).some(r => r.action === "created");
    const hadGroupCreations = effectiveResolutions && Object.values(effectiveResolutions.groups || {}).some(r => r.action === "created");

    try {
      const res = await developerService.importFile(file, {
        defaultSiteId:         siteId  || null,
        defaultGroupId:        groupId || null,
        defaultGitlabConfigId: defaultGitlabConfigId || null,
        dryRun:                false,
        // ✅ FIX : si des entités ont été créées côté frontend, le backend doit
        // aussi chercher par nom pour les trouvers → create_missing=true en sécurité
        createMissingSites:    hadSiteCreations || createMissingSites,
        createMissingProjects: hadProjCreations || createMissingProjects,
        createMissingGroups:   hadGroupCreations || createMissingGroups,
        fullSync:               fullSync,
        periodId:               periodId || null,
      });

      setResult(res);
      setShowResolutionStep(false);
      setResolutions(null);
      setActiveTab((res.error_count > 0 || res.unknown_sites || res.unknown_projects) ? "error" : "success");
      refreshLogs();
    } catch (err) {
      setError(err.message || "Erreur lors de l'import réel.");
    } finally {
      setLoading(false);
    }
  }, [file, siteId, groupId, defaultGitlabConfigId, resolutions, createMissingSites, createMissingProjects, createMissingGroups, fullSync, refreshLogs]);

  const hasAnyWarnings  = result?.rows?.some(r => r.warnings?.length > 0);
  const fileSize        = file ? (file.size / 1024).toFixed(1) + " Ko" : null;

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* Header */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <h4 className="fw-semibold mb-1">
                  <i className="ri-upload-2-line me-2 text-primary"></i>
                  Import en masse — Développeurs
                </h4>
                <p className="text-muted fs-13 mb-0">
                  Créez plusieurs développeurs à la fois depuis un fichier CSV ou Excel
                </p>
              </div>
              <Link to="/admin/developers" className="btn btn-sm btn-soft-secondary">
                <i className="ri-arrow-left-line me-1"></i>Retour aux développeurs
              </Link>
            </div>
          </div>
        </div>

        <div className="row g-4">
          {/* Colonne principale */}
          <div className="col-xl-8">

            <CsvFormatInfo />

            {/* Format du fichier */}
            <div className="card border-0 mb-4"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)", borderRadius: 16 }}>
              <div className="card-header bg-white px-4 pt-4 pb-3"
                style={{ borderBottom: "1px solid #F1F5F9", borderRadius: "16px 16px 0 0" }}>
                <div className="d-flex align-items-center justify-content-between">
                  <h6 className="fw-bold mb-0">
                    <i className="ri-file-list-3-line me-2 text-primary"></i>Format du fichier
                  </h6>
                  <a href="/api/v1/developers/import/template"
                    className="btn btn-sm btn-soft-primary py-1 px-3 fs-12"
                    style={{ borderRadius: 8 }}>
                    <i className="ri-download-line me-1"></i>Télécharger le template
                  </a>
                </div>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12 }}>
                    <thead style={{ background: "#F8FAFC" }}>
                      <tr>
                        <th className="py-2 ps-3">Colonne</th>
                        <th className="py-2">Type</th>
                        <th className="py-2">Exemple</th>
                        <th className="py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { col: "name *",            type: "Texte", ex: "Ahmed Ben Ali",        desc: "Nom complet"                                          },
                        { col: "email *",           type: "Email", ex: "ahmed@corp.tn",         desc: "Email unique — clé de déduplication (1 dev = 1 email)" },
                        { col: "gitlab_username *", type: "Texte", ex: "ahmed.benali",          desc: "Handle GitLab sans le @"                             },
                        { col: "sites",             type: "Texte", ex: "Paris,Tunis",           desc: "Noms séparés par virgule — 1er = site principal"      },
                        { col: "projects",          type: "Texte", ex: "backend-api,frontend",  desc: "Noms séparés par virgule"                            },
                        { col: "group",             type: "Texte", ex: "Backend Tunis",         desc: "Nom du groupe d'équipe"                              },
                        { col: "onboarding_date",   type: "Date",  ex: "2024-01-01",            desc: "Date d'entrée (Optionnel - pour historique)"         },
                        { col: "offboarding_date",  type: "Date",  ex: "2024-12-31",            desc: "Date de départ (Optionnel)"                          },
                      ].map((row, i) => (
                        <tr key={i}>
                          <td className="py-2 ps-3 fw-medium">{row.col}</td>
                          <td className="py-2 text-muted">{row.type}</td>
                          <td className="py-2"><code className="fs-11">{row.ex}</code></td>
                          <td className="py-2 text-muted">{row.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-muted fs-12 mb-0 mt-2">* Colonnes obligatoires</p>
              </div>
            </div>

            {/* Zone de drop */}
            <div className="card border-0 mb-4"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)", borderRadius: 16 }}>
              <div className="card-header bg-white px-4 pt-4 pb-3"
                style={{ borderBottom: "1px solid #F1F5F9", borderRadius: "16px 16px 0 0" }}>
                <h6 className="fw-bold mb-0">
                  <i className="ri-upload-cloud-2-line me-2 text-primary"></i>Fichier à importer
                </h6>
              </div>
              <div className="card-body">
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? "#4F46E5" : file ? "#059669" : "#CBD5E1"}`,
                    borderRadius: 12,
                    background: dragging ? "#EEF2FF" : file ? "#F0FDF4" : "#F8FAFC",
                    cursor: "pointer",
                    transition: "all .2s",
                    padding: "32px 24px",
                    textAlign: "center",
                  }}>
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange} style={{ display: "none" }} />
                  {file ? (
                    <div>
                      <i className="ri-file-excel-2-line fs-2 mb-2"
                        style={{ color: "#059669", display: "block" }}></i>
                      <p className="fw-semibold mb-1 fs-14" style={{ color: "#059669" }}>{file.name}</p>
                      <p className="text-muted fs-12 mb-2">{fileSize}</p>
                      <button className="btn btn-sm btn-soft-danger"
                        onClick={e => {
                          e.stopPropagation();
                          setFile(null); setResult(null); setError("");
                          setResolutions(null); setShowResolutionStep(false);
                        }}>
                        <i className="ri-close-line me-1"></i>Supprimer
                      </button>
                    </div>
                  ) : (
                    <div>
                      <i className="ri-upload-cloud-2-line fs-2 mb-2 text-muted d-block"></i>
                      <p className="fw-medium fs-14 mb-1">Glissez-déposez votre fichier ici</p>
                      <p className="text-muted fs-13 mb-2">ou cliquez pour sélectionner</p>
                      <span className="badge bg-light text-muted border fs-11">CSV · XLSX · XLS</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="card border-0 mb-4"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)", borderRadius: 16 }}>
              <div className="card-header bg-white px-4 pt-4 pb-3"
                style={{ borderBottom: "1px solid #F1F5F9", borderRadius: "16px 16px 0 0" }}>
                <h6 className="fw-bold mb-0">
                  <i className="ri-settings-3-line me-2 text-primary"></i>Options d'import
                </h6>
              </div>
              <div className="card-body">
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <label className="form-label fw-medium fs-13">
                      Site par défaut{" "}
                      <span className="text-muted fw-normal">(si colonne "sites" absente)</span>
                    </label>
                    <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                      <option value="">-- Aucun --</option>
                    </select>
                  </div>

                  <div className="col-md-12">
                    <div className="p-3 rounded-3 mb-2" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                      <label className="form-label fw-bold fs-13 mb-2">
                        <i className="ri-calendar-event-line me-1"></i> Période de Mission (Optionnel)
                      </label>
                      <div className="d-flex align-items-center gap-3">
                        <select 
                          className="form-select flex-grow-1" 
                          value={periodId} 
                          onChange={e => setPeriodId(e.target.value)}
                        >
                          <option value="">-- Optionnel (pour Full Sync uniquement) --</option>
                          {periods.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.month}/{p.year} {p.status === 'open' ? '(Ouverte)' : '(Close)'}
                            </option>
                          ))}
                        </select>
                        <div className="flex-shrink-0">
                          <span className="badge bg-secondary px-3 py-2">Scope Temporel</span>
                        </div>
                      </div>
                      <p className="text-muted fs-11 mt-2 mb-0">
                        <i className="ri-information-line me-1"></i>
                        <strong>Optionnel</strong> : Laissez vide pour l'import initial ou les corrections. 
                        Sélectionnez une période uniquement pour le <strong>Full Sync</strong> (désactivation des devs absents d'un projet pour ce mois).
                      </p>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-medium fs-13">
                      Groupe par défaut{" "}
                      <span className="text-muted fw-normal">(si colonne "group" absente)</span>
                    </label>
                    <select className="form-select" value={groupId} onChange={e => setGroupId(e.target.value)}>
                      <option value="">-- Aucun --</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>

                  <div className="col-md-12">
                    <label className="form-label fw-medium fs-13">
                      Instance GitLab par défaut{" "}
                      <span className="text-muted fw-normal">(recommandé si vous créez de nouveaux projets)</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light"><i className="ri-git-merge-line"></i></span>
                      <select 
                        className="form-select" 
                        value={defaultGitlabConfigId} 
                        onChange={e => setDefaultGitlabConfigId(e.target.value)}
                        style={{ borderLeft: "none" }}
                      >
                        <option value="">-- Sélectionner l'instance GitLab destination --</option>
                        {gitlabConfigs.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.domain})
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-muted fs-11 mt-1 mb-0">
                      <i className="ri-information-line me-1"></i>
                      Tous les nouveaux projets créés par cet import seront liés à cette instance pour l'extraction automatique des KPIs.
                    </p>
                  </div>
                </div>

                <div className="mb-3">
                  <EnterpriseToggle
                    checked={dryRun}
                    onChange={() => { setDryRun(v => !v); setShowResolutionStep(false); }}
                    labelOn="Mode prévisualisation (dry run) — recommandé"
                    labelOff="Mode création réelle"
                    descOn="Détecte les conflits (sites/projets inconnus) sans créer de données — étape de résolution disponible"
                    descOff="Crée réellement les développeurs en base de données"
                    colorOn="#1D4ED8"
                  />
                </div>

                {!dryRun && (
                  <>
                    <div className="d-flex align-items-center gap-2 my-3">
                      <hr className="flex-grow-1 m-0" style={{ borderColor: "#E2E8F0" }} />
                      <span className="text-muted fs-11 fw-semibold text-uppercase px-2"
                        style={{ letterSpacing: ".06em", whiteSpace: "nowrap" }}>
                        Options avancées
                      </span>
                      <hr className="flex-grow-1 m-0" style={{ borderColor: "#E2E8F0" }} />
                    </div>

                    <div className="p-3 rounded-3 mb-3"
                      style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                      <p className="fs-12 mb-0" style={{ color: "#1E40AF" }}>
                        <i className="ri-information-line me-1"></i>
                        <strong>Recommandation :</strong> utilisez d'abord le dry-run pour détecter
                        les entités inconnues et les résoudre via l'étape de résolution.
                        Ces options sont pour les imports de confiance où vous êtes sûr que les
                        noms correspondent exactement aux entités en base.
                      </p>
                    </div>

                    <div className="mb-3">
                      <EnterpriseToggle
                        checked={createMissingSites}
                        onChange={() => setCreateMissingSites(v => !v)}
                        labelOn="Créer automatiquement les sites manquants"
                        labelOff="Sites manquants ignorés (listés dans le rapport)"
                        descOn="Les sites du CSV absents en base seront créés (country='À définir')"
                        descOff="Les développeurs seront créés sans site — réassignez manuellement"
                        colorOn="#059669"
                      />
                    </div>
                    <div className="mb-0">
                      <EnterpriseToggle
                        checked={createMissingProjects}
                        onChange={() => setCreateMissingProjects(v => !v)}
                        labelOn="Créer automatiquement les projets manquants"
                        labelOff="Projets manquants ignorés (listés dans le rapport)"
                        descOn="Les projets du CSV absents en base seront créés automatiquement"
                        descOff="Les développeurs seront créés sans projet — réassignez manuellement"
                        colorOn="#059669"
                      />
                    </div>
                    <div className="mb-0">
                      <EnterpriseToggle
                        checked={createMissingGroups}
                        onChange={() => setCreateMissingGroups(v => !v)}
                        labelOn="Créer automatiquement les groupes manquants"
                        labelOff="Groupes manquants ignorés (listés dans le rapport)"
                        descOn="Les groupes du CSV absents en base seront créés automatiquement"
                        descOff="Les développeurs seront créés sans groupe — réassignez manuellement"
                        colorOn="#059669"
                      />
                    </div>
                    <div className="mb-0 mt-3">
                      <EnterpriseToggle
                        checked={fullSync}
                        onChange={() => setFullSync(v => !v)}
                        labelOn="Mode Synchronisation Totale (Full Sync) — ACTIF"
                        labelOff="Mode Mise à jour simple (Append/Update)"
                        descOn="Désactive les développeurs absents du CSV pour synchroniser avec l'effectif actuel."
                        descOff="Ajoute les nouveaux et met à jour les existants sans toucher aux autres."
                        colorOn="#DC2626"
                      />
                    </div>
                    {(createMissingSites || createMissingProjects || createMissingGroups) && (
                      <div className="mt-3 d-flex align-items-start gap-2 p-3 rounded-3"
                        style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                        <i className="ri-shield-check-line text-warning flex-shrink-0 fs-16 mt-1"></i>
                        <p className="fs-12 text-muted mb-0">
                          <strong style={{ color: "#92400E" }}>Vérifiez votre fichier source.</strong>{" "}
                          L'auto-création génère des entités avec des données minimales.
                          Complétez-les après l'import dans{" "}
                          <Link to="/admin/sites" className="text-warning fw-medium">Sites</Link>{" "},{" "}
                          <Link to="/admin/projects" className="text-warning fw-medium">Projets</Link>{" "}et{" "}
                          <Link to="/admin/developers" className="text-warning fw-medium">Groupes</Link>.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Bouton lancement / Confirmation Dynamique */}
            {result?.dry_run && result?.success_count > 0 && result?.error_count === 0 && !hasPendingResolutions ? (
              <div className="p-1 rounded-3 mb-4" style={{ background: "#DCFCE7", border: "2px solid #22C55E" }}>
                <button
                  className="btn btn-success btn-lg w-100 animate-pulse"
                  onClick={handleConfirmRealImport}
                  disabled={loading}
                  style={{ 
                    borderRadius: 10, 
                    fontWeight: 700, 
                    boxShadow: "0 4px 12px rgba(34, 197, 94, 0.3)",
                    animation: "pulse-green 2s infinite"
                  }}>
                  {loading ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>Enregistrement...</>
                  ) : (
                    <><i className="ri-checkbox-circle-fill me-2"></i>CONFIRMER & ENREGISTRER L'IMPORTATION RÉELLE</>
                  )}
                </button>
                <p className="text-center text-success fs-12 fw-bold mt-2 mb-1">
                  <i className="ri-arrow-up-line me-1"></i> Étape 1/2 terminée : Vérification OK. Cliquez pour finaliser.
                </p>
                <style>{`
                  @keyframes pulse-green {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); }
                  }
                  .animate-pulse { animation: pulse-green 2s infinite; }
                `}</style>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-lg w-100 mb-4"
                onClick={() => handleImport(dryRun)}
                disabled={loading || !file}
                style={{ borderRadius: 12, fontWeight: 600 }}>
                {loading ? (
                  <><span className="spinner-border spinner-border-sm me-2"></span>Import en cours…</>
                ) : (
                  <><i className={`${dryRun ? "ri-eye-line" : "ri-upload-2-line"} me-2`}></i>
                    {dryRun ? "Lancer la prévisualisation" : "Lancer l'importation réelle"}</>
                )}
              </button>
            )}

            {/* Erreur */}
            <div ref={resultsRef}>
              {error && (
                <div className="alert d-flex align-items-center gap-2 mb-4"
                  style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12 }}>
                  <i className="ri-error-warning-line text-danger fs-20 flex-shrink-0"></i>
                  <span className="fs-13 flex-grow-1">{error}</span>
                  <button className="btn-close btn-sm" onClick={() => setError("")}></button>
                </div>
              )}
            </div>

            {/* Résultat */}
            {result && (
              <div className="card border-0"
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)", borderRadius: 16 }}>
                <div className="card-header bg-white px-4 pt-4 pb-3"
                  style={{ borderBottom: "1px solid #F1F5F9", borderRadius: "16px 16px 0 0" }}>
                  <div className="d-flex align-items-center justify-content-between">
                    <h6 className="fw-bold mb-0">
                      <i className="ri-bar-chart-2-line me-2 text-primary"></i>
                      Résultat {result.dry_run ? "(prévisualisation)" : "de l'import"}
                    </h6>
                    {result.dry_run && (
                      <span className="badge" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
                        <i className="ri-eye-line me-1"></i>Dry run — aucune donnée créée
                      </span>
                    )}
                  </div>
                </div>
                <div className="card-body">
                  {/* Stats */}
                  <div className="row g-3 mb-4">
                    {[
                      { label: "Total lignes", value: result.total_rows,      color: "#4F46E5", bg: "#EEF2FF", icon: "ri-file-list-line"      },
                      { label: "Succès",        value: result.success_count,   color: "#059669", bg: "#ECFDF5", icon: "ri-checkbox-circle-line" },
                      { label: "Erreurs",       value: result.error_count,     color: "#DC2626", bg: "#FEF2F2", icon: "ri-close-circle-line"    },
                      { label: "Désactivés",    value: result.deactivated_count, color: "#DC2626", bg: "#FEF2F2", icon: "ri-user-unfollow-line" },
                    ].map((s, i) => (
                      <div key={i} className="col-sm-3">
                        <div className="text-center p-3 rounded-3" style={{ background: s.bg }}>
                          <i className={`${s.icon} fs-22 d-block mb-1`} style={{ color: s.color }}></i>
                          <p className="fw-bold fs-20 mb-0" style={{ color: s.color }}>{s.value ?? 0}</p>
                          <p className="text-muted fs-11 mb-0">{s.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bandeaux entités */}
                  <ImportResultBanners result={result} />

                  {/* Tableau résultats */}
                  {result.rows?.length > 0 && (
                    <>
                      <div className="d-flex gap-1 mb-3 flex-wrap mt-3">
                        {[
                          { key: "success",   label: `Succès (${result.rows.filter(r => r.status === "success").length})`,    show: result.success_count > 0   },
                          { key: "error",     label: `Erreurs (${result.rows.filter(r => r.status === "error").length})`,      show: result.error_count > 0     },
                          { key: "duplicate", label: `Doublons (${result.rows.filter(r => r.status === "duplicate").length})`, show: result.duplicate_count > 0 },
                          { key: "deactivated", label: `Désactivés (${result.deactivated_count})`, show: result.deactivated_count > 0 },
                        ].filter(t => t.show).map(tab => (
                          <button key={tab.key}
                            className={`btn btn-sm ${activeTab === tab.key ? "btn-primary" : "btn-light"}`}
                            style={{ borderRadius: 8 }}
                            onClick={() => setActiveTab(tab.key)}>
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <div className="table-responsive">
                        <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
                          <thead style={{ background: "#F8FAFC" }}>
                            <tr>
                              <th className="py-2 ps-3">Ligne</th>
                              <th className="py-2">Statut</th>
                              <th className="py-2">Nom</th>
                              <th className="py-2">Email</th>
                              <th className="py-2">Motif / Raison</th>
                              {hasAnyWarnings && activeTab === "success" && (
                                <th className="py-2 text-warning">
                                  <i className="ri-alert-line me-1"></i>Avertissements
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {activeTab === "deactivated" ? (
                              result.deactivated_list?.map((row, i) => (
                                <tr key={i} style={{ background: "#FEF2F2" }}>
                                  <td className="py-2 ps-3 text-muted">Offboard</td>
                                  <td className="py-2"><StatusBadge status="failed" /></td>
                                  <td className="py-2 fw-medium">{row.name}</td>
                                  <td className="py-2 text-muted">{row.email}</td>
                                  <td className="py-2 text-danger">Désactivé (Full Sync)</td>
                                </tr>
                              ))
                            ) : (
                              result.rows
                                .filter(r => r.status === activeTab)
                                .slice(0, 50)
                                .map((row, i) => (
                                  <tr key={i}
                                    style={row.warnings?.length > 0 ? { background: "#FFFBEB" } : {}}>
                                    <td className="py-2 ps-3 text-muted">#{row.row}</td>
                                    <td className="py-2"><StatusBadge status={row.status} /></td>
                                    <td className="py-2 fw-medium">{row.name  || "—"}</td>
                                    <td className="py-2 text-muted">{row.email || "—"}</td>
                                    <td className="py-2 text-muted">{row.reason || "—"}</td>
                                    {hasAnyWarnings && activeTab === "success" && (
                                      <td className="py-2">
                                        {row.warnings?.length > 0 ? (
                                          <div className="d-flex flex-column gap-1">
                                            {row.warnings.map((w, wi) => (
                                              <span key={wi} className="fs-11 d-flex align-items-start gap-1"
                                                style={{ color: "#92400E" }}>
                                                <i className="ri-alert-line flex-shrink-0 mt-1 text-warning"></i>
                                                {w}
                                              </span>
                                            ))}
                                          </div>
                                        ) : <span className="text-muted fs-11">—</span>}
                                      </td>
                                    )}
                                  </tr>
                                ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {/* ── ÉTAPE DE RÉSOLUTION (dry-run + entités inconnues) ── */}
                  <div ref={actionRef}>
                    {showResolutionStep && hasPendingResolutions && (
                      <ImportResolutionStep
                        unknownSites     = {result.unknown_sites    || []}
                        unknownProjects  = {result.unknown_projects || []}
                        unknownGroups    = {result.unknown_groups   || []}
                        existingSites    = {sites}
                        existingProjects = {projects}
                        existingGroups   = {groups}
                        onResolved       = {(res) => setResolutions(res)}
                        onConfirm        = {handleConfirmRealImport}
                        loading          = {loading}
                        defaultGitlabConfigId = {defaultGitlabConfigId}
                        defaultSiteId         = {siteId}
                      />
                    )}
                  </div>

                  {/* CTA dry-run propre (aucune entité inconnue) */}
                  {result.dry_run && result.success_count > 0
                    && result.error_count === 0
                    && !hasPendingResolutions && (
                    <div className="mt-3 p-3 rounded-3 d-flex align-items-center gap-3"
                      style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
                      <i className="ri-checkbox-circle-line text-success fs-22 flex-shrink-0"></i>
                      <div className="flex-grow-1">
                        <p className="fw-semibold fs-13 mb-0 text-success">
                          Prévisualisation réussie — aucun conflit détecté
                        </p>
                        <p className="text-muted fs-12 mb-0">
                          {result.success_count} développeur{result.success_count > 1 ? "s" : ""} prêts
                          à être créés. Toutes les associations (sites, projets, groupes) sont connues en base.
                        </p>
                      </div>
                      <button
                        className="btn btn-sm btn-success flex-shrink-0"
                        onClick={handleConfirmRealImport}
                        disabled={loading}>
                        {loading
                          ? <span className="spinner-border spinner-border-sm"></span>
                          : <><i className="ri-upload-2-line me-1"></i>Confirmer l'import</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Colonne historique */}
          <div className="col-xl-4">
            <div className="card border-0 sticky-top"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)", borderRadius: 16, top: 80 }}>
              <div className="card-header bg-white px-4 pt-4 pb-3"
                style={{ borderBottom: "1px solid #F1F5F9", borderRadius: "16px 16px 0 0" }}>
                <div className="d-flex align-items-center justify-content-between">
                  <h6 className="fw-bold mb-0">
                    <i className="ri-history-line me-2 text-primary"></i>Historique des imports
                  </h6>
                  <button className="btn btn-sm btn-soft-secondary py-0 px-2" onClick={refreshLogs}>
                    <i className="ri-refresh-line fs-12"></i>
                  </button>
                </div>
              </div>
              <div className="card-body p-0">
                {importLogs.length === 0 ? (
                  <div className="text-center py-5">
                    <i className="ri-file-upload-line fs-2 text-muted d-block mb-2 opacity-50"></i>
                    <p className="text-muted fs-13 mb-0">Aucun import précédent</p>
                  </div>
                ) : (
                  <ul className="list-group list-group-flush">
                    {importLogs.map((log, i) => (
                      <li key={log.id ?? i} className="list-group-item px-4 py-3"
                        style={{ borderBottom: i < importLogs.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                        <div className="d-flex align-items-start gap-2">
                          <i className="ri-file-excel-2-line text-success fs-18 flex-shrink-0 mt-1"></i>
                          <div className="flex-grow-1 min-w-0">
                            <p className="fw-semibold mb-1 fs-12 text-truncate">{log.file_name || "fichier"}</p>
                            <div className="d-flex flex-wrap gap-1 mb-1">
                              <StatusBadge status={log.status} />
                              <span className="badge fs-10"
                                style={{ background: "#E0E7FF", color: "#3730A3" }}>
                                {log.target_database || "unknown"}
                              </span>
                              {log.success_count > 0 && (
                                <span className="badge fs-10"
                                  style={{ background: "#ECFDF5", color: "#059669" }}>
                                  {log.success_count} créés
                                </span>
                              )}
                              {log.error_count > 0 && (
                                <span className="badge fs-10"
                                  style={{ background: "#FEF2F2", color: "#DC2626" }}>
                                  {log.error_count} erreurs
                                </span>
                              )}
                              {log.duplicate_count > 0 && (
                                <span className="badge fs-10"
                                  style={{ background: "#FFFBEB", color: "#D97706" }}>
                                  {log.duplicate_count} doublons
                                </span>
                              )}
                            </div>
                            <p className="text-muted fs-11 mb-0">
                              {log.created_at
                                ? new Date(log.created_at).toLocaleDateString("fr-FR", {
                                    day: "2-digit", month: "short",
                                    hour: "2-digit", minute: "2-digit",
                                  })
                                : "—"}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
