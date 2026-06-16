/**
 * ImportJsonTab.jsx — Onglet "Import JSON" (mode hors-ligne / air-gapped)
 *
 * Permet d'importer des données GitLab (MRs ou commits) directement
 * depuis un fichier JSON fourni par le responsable, sans accès réseau
 * au serveur GitLab. Le fichier doit être au format GitLab REST API v4.
 *
 * Architecture :
 *   - Upload multipart → POST /api/extraction/upload-json
 *   - Polling toutes les 2 s → GET /api/extraction/jobs/{lot_id}
 *   - Recalcul KPI déclenché côté backend à la fin du job
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import extractionLotService from "../services/extractionLotService";
import StatusBadge from "../components/common/StatusBadge";

// ─── Étapes de progression ────────────────────────────────────────────────────
const JSON_STEPS = [
  { icon: "ri-file-code-line",    label: "Lecture du fichier JSON",         color: "primary"  },
  { icon: "ri-git-merge-line",    label: "Import des Merge Requests",       color: "info"     },
  { icon: "ri-git-commit-line",   label: "Import des commits",              color: "warning"  },
  { icon: "ri-shield-check-line", label: "Certification des données",       color: "success"  },
  { icon: "ri-bar-chart-line",    label: "Recalcul des KPIs",               color: "danger"   },
];

const ZIP_STEPS = [
  { icon: "ri-file-zip-line",     label: "Lecture de l'archive ZIP",        color: "primary"  },
  { icon: "ri-git-merge-line",    label: "Traitement des Merge Requests",   color: "info"     },
  { icon: "ri-git-commit-line",   label: "Traitement des commits",          color: "warning"  },
  { icon: "ri-shield-check-line", label: "Certification globale",           color: "success"  },
  { icon: "ri-bar-chart-line",    label: "Recalcul de masse des KPIs",      color: "danger"   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(d) {
  if (!d) return "";
  const seconds = Math.floor((new Date() - new Date(d)) / 1000);
  if (seconds < 60) return "À l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return new Date(d).toLocaleDateString("fr-FR");
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────
function JsonDropZone({ file, setFile, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const dropped = e.dataTransfer.files[0];
      if (dropped && (dropped.name.endsWith(".json") || dropped.name.endsWith(".zip"))) setFile(dropped);
      else alert("Veuillez fournir un fichier .json ou .zip");
    },
    [disabled, setFile]
  );

  const handleChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      if (f.name.endsWith(".json") || f.name.endsWith(".zip")) {
        setFile(f);
      } else {
        alert("Veuillez fournir un fichier .json ou .zip");
      }
    }
  };

  const isZip = file?.name?.endsWith(".zip");

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragging ? "#4361ee" : file ? "#0ab39c" : "#ced4da"}`,
        borderRadius: 12,
        padding: "36px 24px",
        textAlign: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        background: dragging ? "#eef1fb" : file ? "#f0faf8" : "#f8f9fa",
        transition: "all .2s ease",
      }}
    >
      <input ref={inputRef} type="file" accept=".json,.zip" style={{ display: "none" }} onChange={handleChange} disabled={disabled} />
      {file ? (
        <>
          <div className="avatar-md rounded-circle bg-success d-flex align-items-center justify-content-center mx-auto mb-3">
            <i className={isZip ? "ri-file-zip-line text-white fs-2" : "ri-file-code-line text-white fs-2"} />
          </div>
          <h6 className="fw-bold text-success mb-1">{file.name}</h6>
          <p className="text-muted mb-2 fs-13">{(file.size / 1024).toFixed(1)} Ko</p>
          {!disabled && (
            <button
              className="btn btn-soft-danger btn-sm"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
            >
              <i className="ri-delete-bin-line me-1" />Supprimer
            </button>
          )}
        </>
      ) : (
        <>
          <div className="avatar-md rounded-circle bg-primary-subtle d-flex align-items-center justify-content-center mx-auto mb-3">
            <i className="ri-upload-cloud-2-line text-primary fs-2" />
          </div>
          <h6 className="fw-semibold mb-1">Deposez votre fichier JSON ou ZIP ici</h6>
          <p className="text-muted fs-13 mb-2">ou cliquez pour parcourir vos fichiers</p>
          <span className="badge bg-primary-subtle text-primary fs-11">.json, .zip — max 100 Mo</span>
        </>
      )}
    </div>
  );
}

// ─── Barre de progression (timeline) ────────────────────────────────────────────
function ImportStepBar({ currentStep, loading, steps = JSON_STEPS, elapsed }) {
  const total   = steps.length;
  const done    = Math.max(0, Math.min(currentStep, total));
  const pct     = Math.round((done / total) * 100);

  return (
    <div className="card shadow-sm mb-4 border-0" style={{ background: "#f8f9ff", border: "1px solid #e8ecff" }}>
      {/* En-tête */}
      <div className="card-header border-0 pb-0" style={{ background: "transparent" }}>
        <div className="d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <div className="avatar-xs rounded-circle bg-primary d-flex align-items-center justify-content-center">
              <i className="ri-loader-4-line text-white fs-14 ri-spin" />
            </div>
            <span className="fw-bold fs-13 text-primary">Progression de l'import</span>
          </div>
          <span className="badge bg-primary text-white fs-11 px-2 py-1">{pct}%</span>
        </div>

        {/* Barre globale */}
        <div className="mt-2 mb-1" style={{ height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "linear-gradient(90deg, #4361ee, #7209b7)",
              borderRadius: 4,
              transition: "width 0.5s ease",
            }}
          />
        </div>
        {elapsed !== undefined && (
          <p className="text-muted fs-11 mb-0 text-end">Temps ecoule : {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</p>
        )}
      </div>

      {/* Timeline des etapes */}
      <div className="card-body pt-3 pb-3">
        <div style={{ position: "relative" }}>
          {steps.map((step, i) => {
            const isDone   = i < currentStep;
            const isActive = i === currentStep && loading;
            const isPending = !isDone && !isActive;
            const isLast   = i === steps.length - 1;

            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: isLast ? 0 : 0 }}>
                {/* Colonne icone + ligne */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 28 }}>
                  {/* Bulle */}
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, transition: "all 0.3s ease",
                      background: isDone ? "#0ab39c" : isActive ? "#4361ee" : "#e2e8f0",
                      color: isDone || isActive ? "#fff" : "#94a3b8",
                      boxShadow: isActive ? "0 0 0 4px rgba(67,97,238,0.18)" : "none",
                    }}
                  >
                    {isDone ? (
                      <i className="ri-check-line" style={{ fontSize: 13 }} />
                    ) : isActive ? (
                      <span className="spinner-border" style={{ width: 13, height: 13, borderWidth: 2 }} />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  {/* Ligne connectrice */}
                  {!isLast && (
                    <div
                      style={{
                        width: 2, flexGrow: 1, minHeight: 24,
                        background: isDone ? "#0ab39c" : "#e2e8f0",
                        transition: "background 0.4s ease",
                        marginTop: 2, marginBottom: 2,
                      }}
                    />
                  )}
                </div>

                {/* Texte */}
                <div style={{ paddingBottom: isLast ? 0 : 16, paddingTop: 3 }}>
                  <p
                    className="mb-0"
                    style={{
                      fontSize: 12, fontWeight: isActive ? 700 : 500,
                      color: isDone ? "#94a3b8" : isActive ? "#1e293b" : "#94a3b8",
                      textDecoration: isDone ? "line-through" : "none",
                      transition: "all 0.3s ease",
                    }}
                  >
                    {step.label}
                  </p>
                  {isDone && (
                    <span style={{ fontSize: 10, color: "#0ab39c", fontWeight: 600 }}>Termine</span>
                  )}
                  {isActive && (
                    <span style={{ fontSize: 10, color: "#4361ee", fontWeight: 600 }}>En cours...</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ─── Logs temps réel ──────────────────────────────────────────────────────────
function ImportLogs({ logs }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  if (!logs?.length) return null;
  return (
    <div className="card mb-3">
      <div className="card-header py-2">
        <h6 className="card-title mb-0 fs-13"><i className="ri-terminal-line me-2 text-muted" />Journal d'import</h6>
      </div>
      <div className="card-body p-0">
        <div style={{ background: "#0d1117", borderRadius: "0 0 8px 8px", maxHeight: 180, overflowY: "auto", padding: "12px 16px", fontFamily: "'SFMono-Regular','Consolas',monospace" }}>
          {logs.map((log, i) => (
            <div key={i} className="d-flex gap-3" style={{ fontSize: 11, lineHeight: 1.7 }}>
              <span style={{ color: "#6e7681", flexShrink: 0 }}>{log.time}</span>
              <span style={{ color: log.type === "error" ? "#f85149" : log.type === "success" ? "#3fb950" : "#8b949e" }}>
                {log.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// ─── Carte de résultat ────────────────────────────────────────────────────────
function ImportResultCard({ result, elapsed, navigate }) {
  const isZip = result.extraction_type === "IMPORT_ZIP";
  return (
    <div className="card border-success border-opacity-50 shadow-sm mb-0">
      <div className="card-header bg-success-subtle border-success border-opacity-25">
        <div className="d-flex align-items-center gap-2">
          <div className="avatar-sm rounded-circle bg-success d-flex align-items-center justify-content-center flex-shrink-0">
            <i className="ri-checkbox-circle-line text-white fs-18" />
          </div>
          <div>
            <h5 className="mb-0 text-success fw-bold">{isZip ? "Import ZIP terminé" : "Import JSON terminé"}</h5>
            <p className="text-muted mb-0 fs-12">Durée : <strong>{formatTime(elapsed)}</strong></p>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="row g-2 mb-3">
          {[
            { label: "Lot ID",   value: `#${result.lot_id}`,    color: "primary", icon: "ri-hashtag" },
            { label: "Projet",   value: isZip ? "Multi-projets" : `#${result.project_id}`, color: "info",    icon: "ri-folder-2-line" },
            { label: "Période",  value: result.period_id ? `#${result.period_id}` : "Multi-périodes",  color: "success", icon: "ri-calendar-2-line" },
            { label: "Type",     value: isZip ? "IMPORT ZIP DE MASSE" : "IMPORT JSON UNIQUE",           color: "warning", icon: isZip ? "ri-file-zip-line" : "ri-file-json-line" },
          ].map((b, i) => (
            <div key={i} className="col-6">
              <div className={`rounded-3 p-2 bg-${b.color}-subtle border border-${b.color} border-opacity-25`}>
                <div className="d-flex align-items-center gap-2">
                  <i className={`${b.icon} text-${b.color} fs-16`} />
                  <div>
                    <p className={`text-${b.color} fs-10 fw-bold text-uppercase mb-0`}>{b.label}</p>
                    <p className={`text-${b.color} fw-bold fs-12 mb-0`} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.value}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {result.step_label && (
          <div className="alert alert-success py-2 fs-12 mb-3">
            <i className="ri-information-line me-1" />{result.step_label}
          </div>
        )}
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-success btn-sm flex-fill" onClick={() => navigate("/extraction-lots")}>
            <i className="ri-list-check me-1" />Voir les Lots
          </button>
          {/* ✅ [REMOVED] Analyse KPI - Non fonctionnelle */}
          {/* <button className="btn btn-soft-primary btn-sm flex-fill" onClick={() => navigate("/kpi-analysis")}>
            <i className="ri-bar-chart-grouped-line me-1" />Analyse KPI
          </button> */}
          <button className="btn btn-soft-secondary btn-sm flex-fill" onClick={() => navigate("/")}>
            <i className="ri-dashboard-2-line me-1" />Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ImportJsonTab({ allProjects = [], allPeriods = [] }) {
  const navigate = useNavigate();

  // Formulaire
  const [file,          setFile]          = useState(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedPeriod,  setSelectedPeriod]  = useState("");
  const [dataType,      setDataType]      = useState("merge_requests");

  // État
  const [loading,       setLoading]       = useState(false);
  const [result,        setResult]        = useState(null);
  const [error,         setError]         = useState(null);
  const [currentStep,   setCurrentStep]   = useState(-1);
  const [elapsed,       setElapsed]       = useState(0);
  const [logs,          setLogs]          = useState([]);
  const [validated,     setValidated]     = useState(false);

  // Historique des importations récentes
  const [recentJobs,   setRecentJobs]   = useState([]);
  const [totalLots,    setTotalLots]    = useState(0);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const PREVIEW_LIMIT = 10; // aperçu rapide — le Registre des Lots gère le reste

  const loadRecentJobs = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const data = await extractionLotService.getAll();
      const allJobs = Array.isArray(data) ? data : (data?.items ?? []);
      setTotalLots(allJobs.length);
      setRecentJobs(allJobs.slice(0, PREVIEW_LIMIT));
    } catch (err) {
      console.error("Error loading recent jobs:", err);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  const timerRef     = useRef(null);
  const stepTimerRef = useRef(null);

  const addLog = useCallback((message, type = "info") => {
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { time, message, type }]);
  }, []);

  // Auto-détection sur sélection de ZIP
  const isZip = file?.name?.endsWith(".zip");

  useEffect(() => {
    if (isZip) {
      setSelectedProject("auto");
      setSelectedPeriod("");
      setDataType("both");  // ZIP = mode mixte MRs+Commits obligatoire
    } else if (file) {
      if (selectedProject === "auto") {
        setSelectedProject("");
      }
      setDataType("merge_requests"); // JSON simple = MRs par défaut
    }
  }, [file, isZip]);

  // Chrono
  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [loading]);

  // Chargement initial des imports récents
  useEffect(() => {
    loadRecentJobs();
  }, [loadRecentJobs]);

  // Polling progression
  useEffect(() => {
    if (loading && result?.lot_id) {
      const poll = async () => {
        try {
          const res = await api.get(`/extraction/jobs/${result.lot_id}`);
          const job = res.data;
          if (job.step_label) addLog(job.step_label, "info");
          if (job.step_index !== undefined) setCurrentStep(job.step_index);
          if (job.status === "completed") {
            addLog("Import termine avec succes", "success");
            setResult(job);
            setLoading(false);
            clearInterval(stepTimerRef.current);
            loadRecentJobs();
          } else if (job.status === "failed") {
            const msg = job.error_message || "L'import a échoué.";
            setError(msg);
            addLog(`Erreur : ${msg}`, "error");
            setLoading(false);
            clearInterval(stepTimerRef.current);
            loadRecentJobs();
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      };
      stepTimerRef.current = setInterval(poll, 2000);
      poll();
    }
    return () => clearInterval(stepTimerRef.current);
  }, [loading, result?.lot_id, addLog, loadRecentJobs]);

  // Validation — période optionnelle (auto-détection si vide)
  const canSubmit = !!file && (isZip || !!selectedProject) && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidated(true);
    if (!canSubmit) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setLogs([]);
    setCurrentStep(0);

    addLog(`Envoi du fichier "${file.name}" (${(file.size / 1024).toFixed(1)} Ko)…`, "info");

    try {
      const formData = new FormData();
      formData.append("file",       file);
      if (!isZip) {
        formData.append("project_id", selectedProject);
      }
      // period_id est optionnel : si vide, le backend auto-détecte depuis created_at
      if (selectedPeriod) formData.append("period_id", selectedPeriod);
      formData.append("data_type",  dataType);

      const res = await api.post("/extraction/upload-json", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      addLog(`Job démarré — Lot #${res.data.lot_id}`, "info");
      setResult(res.data);
      loadRecentJobs();
    } catch (err) {
      let msg = "Impossible de lancer l'import. Vérifiez votre connexion.";
      if (typeof err.response?.data?.detail === "string") msg = err.response.data.detail;
      else if (Array.isArray(err.response?.data?.detail)) msg = err.response.data.detail[0]?.msg || msg;
      setError(msg);
      addLog(`Erreur au lancement : ${msg}`, "error");
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null); setSelectedProject(""); setSelectedPeriod(""); setDataType("merge_requests");
    setResult(null); setError(null); setValidated(false); setLogs([]); setCurrentStep(-1);
  };

  // Grouper les projets par config pour le select
  const projectOptions = allProjects.filter((p) => p.is_active && !p.archived);

  // Résultat final (après polling terminé)
  const isFinished = result && (result.status === "completed" || result.step_index === 5);

  return (
    <>
      <div className="row">
      {/* ─── Formulaire ──────────────────────────────────────────────────────── */}
      <div className="col-xl-8">
        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between">
            <h5 className="card-title mb-0">
              <i className="ri-file-upload-line me-2 text-warning" />
              Import Manuel — Fichier JSON ou ZIP (Masse)
            </h5>
            <div className="d-flex gap-2 align-items-center">
              <span className="badge bg-warning-subtle text-warning fs-12">
                <i className="ri-wifi-off-line me-1" />MODE AIR-GAPPED
              </span>
              {(result || error) && !loading && (
                <button className="btn btn-soft-secondary btn-sm" onClick={resetForm}>
                  <i className="ri-refresh-line me-1" />Reset
                </button>
              )}
            </div>
          </div>

          <div className="card-body">
            {/* Bandeau explicatif */}
            <div className="alert alert-info d-flex align-items-start gap-3 py-3 mb-4" style={{ borderRadius: 10 }}>
              <i className="ri-information-line fs-20 flex-shrink-0 text-info mt-1" />
              <div className="fs-13">
                <strong className="d-block mb-1">Quand utiliser ce mode ?</strong>
                <span className="text-muted">
                  Lorsque votre instance GitLab n'est pas accessible depuis ce serveur (réseau isolé, VPN, air-gapped),
                  un responsable peut exporter les données via l'API GitLab et fournir le fichier JSON or l'archive ZIP contenant les JSON de multiples développeurs.
                </span>
                <div className="mt-2 p-2 rounded-2 bg-white border border-info border-opacity-25 fs-12">
                  <i className="ri-magic-line me-1 text-info" />
                  <strong>Détection automatique :</strong>{" "}
                  En important une archive ZIP, le système associe automatiquement chaque fichier JSON à son développeur et à son projet cible en base, tout en auto-détectant les périodes mensuelles.
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="row g-3 mb-4">
                {/* Projet */}
                <div className="col-md-6">
                  <label className="form-label fw-semibold">
                    <i className="ri-folder-2-line me-1 text-primary" />Projet cible
                    <span className="text-danger ms-1">*</span>
                  </label>
                  <select
                    className={`form-select ${validated && !selectedProject && !isZip ? "is-invalid" : ""}`}
                    value={isZip ? "auto" : selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    disabled={loading || isZip}
                  >
                    {isZip ? (
                      <option value="auto">[Automatique] Detection par developpeur</option>
                    ) : (
                      <>
                        <option value="">— Sélectionner un projet —</option>
                        {projectOptions.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </>
                    )}
                  </select>
                  {validated && !selectedProject && !isZip && (
                    <div className="invalid-feedback">Veuillez sélectionner un projet</div>
                  )}
                </div>

                {/* Période (optionnelle — auto-détection depuis created_at) */}
                <div className="col-md-6">
                  <label className="form-label fw-semibold">
                    <i className="ri-calendar-2-line me-1 text-success" />Période de rattachement
                    <span className="badge bg-secondary-subtle text-secondary ms-2 fs-10">Optionnel</span>
                  </label>
                  <select
                    className="form-select"
                    value={isZip ? "" : selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    disabled={loading || isZip}
                  >
                    {isZip ? (
                      <option value="">[Automatique] Detection depuis created_at</option>
                    ) : (
                      <>
                        <option value="">[Auto] Detection depuis created_at</option>
                        {allPeriods.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.year}/{String(p.month).padStart(2, "0")}
                            {p.status === "open" ? " (ouverte)" : " (clôturée)"}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  <div className="form-text fs-11">
                    <i className="ri-information-line me-1" />
                    Laissez vide pour que le système détecte automatiquement les mois depuis les données.
                  </div>
                </div>

                {/* Type de données */}
                <div className="col-12">
                  <label className="form-label fw-semibold">
                    <i className="ri-database-2-line me-1 text-info" />Type de données à importer
                  </label>
                  <div className="d-flex gap-3 flex-wrap">
                    {[
                      { val: "merge_requests", label: "Merge Requests uniquement",     icon: "ri-git-merge-line",   color: "primary" },
                      { val: "commits",        label: "Commits uniquement",             icon: "ri-git-commit-line",  color: "success" },
                      { val: "both",           label: "MRs et Commits (fichier mixte)", icon: "ri-database-2-line",  color: "warning" },
                    ].map((opt) => {
                      const isSelected = dataType === opt.val;
                      const isDisabled = loading || (isZip && opt.val !== "both");
                      return (
                        <div
                          key={opt.val}
                          onClick={() => !isDisabled && setDataType(opt.val)}
                          className={`flex-fill rounded-3 border p-3 cursor-pointer ${
                            isSelected
                              ? `border-${opt.color} bg-${opt.color}-subtle`
                              : "border-light bg-light"
                          }`}
                          style={{
                            cursor: isDisabled ? "not-allowed" : "pointer",
                            minWidth: 180,
                            opacity: isDisabled && !isSelected ? 0.5 : 1
                          }}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <div className={`avatar-sm rounded-circle bg-${opt.color}-subtle d-flex align-items-center justify-content-center flex-shrink-0`}>
                              <i className={`${opt.icon} text-${opt.color} fs-18`} />
                            </div>
                            <div>
                              <p className="fw-semibold fs-13 mb-0">{opt.label}</p>
                            </div>
                            {isSelected && (
                              <i className={`ri-check-line text-${opt.color} ms-auto fs-16`} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Zone de dépôt du fichier */}
              <div className="mb-4">
                <label className="form-label fw-semibold">
                  <i className="ri-file-json-line me-1 text-warning" />Fichier JSON ou ZIP à importer
                  <span className="text-danger ms-1">*</span>
                </label>
                <JsonDropZone file={file} setFile={setFile} disabled={loading} />
                {validated && !file && (
                  <div className="text-danger fs-12 mt-1">
                    <i className="ri-error-warning-line me-1" />Veuillez fournir un fichier JSON ou ZIP
                  </div>
                )}
              </div>

              {/* Erreur */}
              {error && (
                <div className="alert alert-danger d-flex align-items-start gap-3 py-2 mb-3">
                  <i className="ri-error-warning-line fs-18 flex-shrink-0" />
                  <div className="fs-13">{error}</div>
                </div>
              )}

              {/* Bouton */}
              {!isFinished && (
                <button
                  type="submit"
                  className="btn btn-warning btn-lg w-100 fw-semibold"
                  disabled={!canSubmit}
                >
                  {loading ? (
                    <><span className="spinner-border spinner-border-sm me-2" />Import en cours… ({formatTime(elapsed)})</>
                  ) : (
                    <><i className="ri-upload-cloud-2-line me-2" />Lancer l'importation</>
                  )}
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* ─── Panneau de droite ────────────────────────────────────────────────── */}
      <div className="col-xl-4">
        {/* Progression */}
        {loading && (
          <ImportStepBar currentStep={currentStep} loading={loading} steps={isZip ? ZIP_STEPS : JSON_STEPS} elapsed={elapsed} />
        )}

        {/* Logs */}
        <ImportLogs logs={logs} />

        {/* Résultat final */}
        {isFinished && (
          <ImportResultCard result={result} elapsed={elapsed} navigate={navigate} />
        )}

        {/* Card guide contextuel (quand pas de résultat) */}
        {!loading && !isFinished && (
          <div className="card">
            <div className="card-header py-2">
              <h6 className="card-title mb-0 fs-13">
                <i className={`${isZip ? "ri-file-zip-line" : "ri-file-code-line"} me-2 text-muted`} />
                {isZip ? "Guide import ZIP de masse" : "Format JSON attendu"}
              </h6>
            </div>
            <div className="card-body p-3">
              {isZip ? (
                <>
                  <div className="alert alert-success py-2 fs-12 mb-3">
                    <i className="ri-magic-line me-1" />
                    <strong>Mode Bulk activé</strong> — Le système va traiter chaque fichier JSON
                    de l'archive automatiquement.
                  </div>
                  <p className="fw-semibold fs-12 mb-2 text-dark">
                    <i className="ri-folder-zip-line me-1 text-warning" />Structure recommandée du ZIP
                  </p>
                  <code style={{ fontSize: 10, display: "block", background: "#0d1117", color: "#8b949e", padding: "10px", borderRadius: 6, whiteSpace: "pre-wrap", marginBottom: 12 }}>
{`dumpMRTelnet.zip
├── merge_requests_safa.json
├── merge_requests_anis.json
├── commits_yahya.json
└── ...`}
                  </code>
                  <hr className="my-3" />
                  <p className="fw-semibold fs-12 mb-2 text-dark">Règles d'auto-détection</p>
                  <div className="vstack gap-2">
                    {[
                      { icon: "ri-user-search-line",  color: "primary", text: "Développeur détecté par username GitLab dans les données JSON" },
                      { icon: "ri-folder-2-line",      color: "info",    text: "Projet (REP, KPN…) résolu depuis la table developer_project en BDD" },
                      { icon: "ri-calendar-check-line",color: "success", text: "Période groupée par mois depuis created_at / authored_date" },
                      { icon: "ri-file-warning-line",  color: "warning", text: "Fichiers non reconnus ignorés avec avertissement dans les logs" },
                      { icon: "ri-bar-chart-line",     color: "danger",  text: "KPIs recalculés pour chaque mois impacté à la fin" },
                    ].map((item, i) => (
                      <div key={i} className="d-flex align-items-start gap-2 fs-12">
                        <i className={`${item.icon} text-${item.color} flex-shrink-0 mt-1`} />
                        <span className="text-muted">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted fs-12 mb-3">
                    Le fichier JSON doit contenir un tableau d'objets au format GitLab API v4.
                  </p>
                  <div className="mb-3">
                    <p className="fw-semibold fs-12 mb-1 text-primary">
                      <i className="ri-git-merge-line me-1" />Merge Requests
                    </p>
                    <code style={{ fontSize: 10, display: "block", background: "#f8f9fa", padding: "8px", borderRadius: 6, whiteSpace: "pre-wrap" }}>
{`GET /projects/:id/merge_requests
?state=all&updated_after=...

→ Champs requis : iid, title,
  author, state, created_at`}
                    </code>
                  </div>
                  <div>
                    <p className="fw-semibold fs-12 mb-1 text-success">
                      <i className="ri-git-commit-line me-1" />Commits
                    </p>
                    <code style={{ fontSize: 10, display: "block", background: "#f8f9fa", padding: "8px", borderRadius: 6, whiteSpace: "pre-wrap" }}>
{`GET /projects/:id/repository
        /commits?since=...&until=...

→ Champs requis : id (sha),
  authored_date, author_email`}
                    </code>
                  </div>
                  <hr className="my-3" />
                  <div className="vstack gap-1">
                    {[
                      { icon: "ri-check-circle-line", color: "success", text: "Dédupliqué par SHA / iid" },
                      { icon: "ri-check-circle-line", color: "success", text: "Résolution dev par username" },
                      { icon: "ri-magic-line",         color: "info",    text: "Multi-périodes auto-détectées" },
                      { icon: "ri-check-circle-line", color: "success", text: "KPI recalculés pour chaque mois" },
                      { icon: "ri-shield-check-line", color: "primary", text: "Isolation mission respectée" },
                    ].map((item, i) => (
                      <div key={i} className="d-flex align-items-center gap-2 fs-12">
                        <i className={`${item.icon} text-${item.color} flex-shrink-0`} />
                        <span className="text-muted">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ─── Importations Récentes ────────────────────────────────────────────── */}
    <div className="row mt-4 mb-3">
      <div className="col-12">
        <div className="card border-0 shadow-sm rounded-4">
          <div className="card-header bg-white border-bottom-light p-3 d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-3">
              <h5 className="card-title mb-0 fs-14">
                <i className="ri-history-line me-2 text-primary" />
                Importations Récentes
                {totalLots > 0 && (
                  <span className="badge bg-primary-subtle text-primary ms-2 fw-bold fs-11">
                    {recentJobs.length < totalLots
                      ? `${recentJobs.length} / ${totalLots}`
                      : totalLots}
                  </span>
                )}
              </h5>
              {totalLots > recentJobs.length && (
                <span className="text-muted fs-11">
                  <i className="ri-information-line me-1" />
                  {totalLots - recentJobs.length} lots supplémentaires dans le registre
                </span>
              )}
            </div>
            <div className="d-flex align-items-center gap-2">
              {totalLots > recentJobs.length && (
                <button
                  type="button"
                  className="btn btn-soft-primary btn-sm fw-semibold"
                  onClick={() => navigate("/extraction-lots")}
                >
                  <i className="ri-list-check-3 me-1" />
                  Registre complet ({totalLots} lots)
                </button>
              )}
              <button 
                type="button"
                className="btn btn-soft-secondary btn-sm"
                onClick={loadRecentJobs}
                disabled={loadingRecent}
              >
                <i className={`ri-refresh-line me-1 ${loadingRecent ? "ri-spin" : ""}`} />
                Actualiser
              </button>
            </div>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 custom-table">
                <thead className="bg-light-subtle">
                  <tr>
                    <th className="ps-4 py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Lot ID</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Date d'import</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Projet cible / Cible</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Période</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Type</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Volumes</th>
                    <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Statut</th>
                    <th className="pe-4 py-3 text-end fs-11 text-uppercase text-muted ls-1 fw-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.length > 0 ? (
                    recentJobs.map((lot) => {
                      const isZipLot = !lot.project_id;
                      let targetName = "";
                      if (lot.project) {
                        targetName = lot.project.name;
                      } else {
                        targetName = "Multi-projets";
                      }
                      if (lot.developer) {
                        targetName += ` (${lot.developer.name})`;
                      }

                      return (
                        <tr key={lot.id}>
                          <td className="ps-4 fw-bold text-primary">#{lot.id}</td>
                          <td>
                            <div className="d-flex flex-column">
                              <span className="fs-13 fw-bold text-dark">{timeAgo(lot.created_at)}</span>
                              <span className="fs-11 text-muted">{formatDate(lot.created_at)}</span>
                            </div>
                          </td>
                          <td>
                            {isZipLot && lot.source_filename ? (
                              /* ── Lot ZIP : fichier source = info principale ── */
                              <div className="d-flex align-items-start gap-2">
                                <div
                                  className="d-flex align-items-center justify-content-center flex-shrink-0 rounded"
                                  style={{ width: 32, height: 32, background: "rgba(255,167,38,.12)" }}
                                >
                                  <i className="ri-file-zip-line text-warning fs-15" />
                                </div>
                                <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                                  <span
                                    className="fw-bold text-dark fs-13"
                                    title={lot.source_filename}
                                    style={{ wordBreak: "break-word" }}
                                  >
                                    {lot.source_filename}
                                  </span>
                                  <span className="text-muted fs-11 mt-1">
                                    <i className="ri-folders-line me-1" />
                                    Multi-projets
                                  </span>
                                </div>
                              </div>
                            ) : (
                              /* ── Lot JSON : projet = info principale, fichier en secondaire ── */
                              <div className="d-flex align-items-start gap-2">
                                <div
                                  className="d-flex align-items-center justify-content-center flex-shrink-0 rounded"
                                  style={{ width: 32, height: 32, background: "rgba(67,97,238,.10)" }}
                                >
                                  <i className="ri-file-code-line text-primary fs-15" />
                                </div>
                                <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                                  <span className="fw-semibold text-dark fs-13">{targetName}</span>
                                  {lot.source_filename && (
                                    <span
                                      className="text-muted fs-11 mt-1"
                                      title={lot.source_filename}
                                      style={{ wordBreak: "break-word" }}
                                    >
                                      <i className="ri-file-text-line me-1 text-success" />
                                      {lot.source_filename}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="badge bg-info-subtle text-info px-2 py-1 rounded-pill fw-bold fs-11">
                              {lot.period ? `${lot.period.year}/${String(lot.period.month).padStart(2, '0')}` : "Automatique"}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${isZipLot ? "bg-warning-subtle text-warning" : "bg-primary-subtle text-primary"} px-2 py-1 rounded-pill fw-bold fs-11`}>
                              {isZipLot ? "ZIP (Masse)" : "JSON Unique"}
                            </span>
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              {lot.mr_count > 0 && (
                                <span className="badge bg-primary-subtle text-primary fw-medium fs-11">
                                  <i className="ri-git-merge-line me-1" />
                                  {lot.mr_count} MRs
                                </span>
                              )}
                              {lot.commit_count > 0 && (
                                <span className="badge bg-success-subtle text-success fw-medium fs-11">
                                  <i className="ri-git-commit-line me-1" />
                                  {lot.commit_count} Commits
                                </span>
                              )}
                              {lot.mr_count === 0 && lot.commit_count === 0 && (
                                <span className="text-muted fs-12">—</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <StatusBadge type="lot" value={lot.status} />
                          </td>
                          <td className="pe-4 text-end">
                            <button
                              type="button"
                              className="btn btn-soft-secondary btn-sm rounded-pill fw-bold fs-11 px-3"
                              onClick={() => navigate(`/extraction-lots`)}
                            >
                              Inspecter
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="py-4 text-center text-muted fs-13">
                        <i className="ri-information-line me-1" />
                        Aucun lot récent d'extraction ou d'import.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Footer — CTA vers le Registre complet */}
            {totalLots > 0 && (
              <div className="card-footer bg-light-subtle border-top d-flex align-items-center justify-content-between px-4 py-3">
                <span className="text-muted fs-12">
                  <i className="ri-list-ordered me-1" />
                  Affichage <strong>{recentJobs.length}</strong> lot{recentJobs.length > 1 ? "s" : ""} sur <strong>{totalLots}</strong> au total
                </span>
                {totalLots > recentJobs.length ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm fw-semibold px-4 rounded-pill"
                    onClick={() => navigate("/extraction-lots")}
                  >
                    <i className="ri-arrow-right-line me-1" />
                    Voir le registre complet ({totalLots} lots)
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-soft-secondary btn-sm fw-semibold px-4 rounded-pill"
                    onClick={() => navigate("/extraction-lots")}
                  >
                    <i className="ri-external-link-line me-1" />
                    Ouvrir le registre des lots
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </>
  );
}
