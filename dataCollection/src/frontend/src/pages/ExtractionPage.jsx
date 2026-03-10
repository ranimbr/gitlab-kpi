import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

// ─── Étapes d'animation ───────────────────────────────────────────────────────
const STEPS = [
  { icon: "ri-git-repository-line", label: "Connexion à GitLab",              color: "primary" },
  { icon: "ri-git-commit-line",      label: "Récupération des commits",         color: "info"    },
  { icon: "ri-git-merge-line",       label: "Récupération des Merge Requests",  color: "warning" },
  { icon: "ri-team-line",            label: "Identification des contributeurs", color: "success" },
  { icon: "ri-bar-chart-line",       label: "Calcul des KPIs",                  color: "danger"  },
];

function getInitials(name = "") {
  return (name || "?").split(/[\s._-]/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── StepIndicator ────────────────────────────────────────────────────────────
function StepIndicator({ currentStep, loading }) {
  return (
    <div className="p-3 rounded-3 border bg-light mb-4">
      <div className="d-flex align-items-center gap-2 mb-3">
        <i className="ri-loader-4-line text-primary"></i>
        <span className="fw-semibold fs-13 text-primary">Progression de l'extraction</span>
      </div>
      <div className="vstack gap-2">
        {STEPS.map((step, i) => {
          const done    = i < currentStep;
          const active  = i === currentStep && loading;
          const pending = !done && !active;
          return (
            <div
              key={i}
              className={`d-flex align-items-center gap-3 p-2 rounded-2 transition ${
                active  ? "bg-white shadow-sm border" :
                done    ? "bg-white"                  : ""
              }`}
            >
              {/* Icône état */}
              <div
                className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${
                  done    ? `bg-${step.color} text-white`                 :
                  active  ? `bg-${step.color}-subtle text-${step.color}` :
                  pending ? "bg-light border text-muted"                  : ""
                }`}
              >
                {done ? (
                  <i className="ri-check-line fs-13"></i>
                ) : active ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <i className={`${step.icon} fs-13`}></i>
                )}
              </div>

              {/* Label */}
              <span className={`fs-13 flex-grow-1 ${
                done    ? "text-muted text-decoration-line-through" :
                active  ? "fw-semibold text-dark"                   :
                pending ? "text-muted"                               : ""
              }`}>
                {step.label}
              </span>

              {/* Badge */}
              {done && (
                <span className="badge bg-success-subtle text-success fs-10">
                  <i className="ri-check-line me-1"></i>OK
                </span>
              )}
              {active && (
                <span className={`badge bg-${step.color}-subtle text-${step.color} fs-10`}>
                  En cours…
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────
function ResultCard({ result, elapsed, navigate }) {
  const [copied, setCopied] = useState(false);

  const copyMd5 = () => {
    if (!result.md5sum) return;
    navigator.clipboard.writeText(result.md5sum);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="card border-success border-opacity-50 shadow-sm mb-0">
      <div className="card-header bg-success-subtle border-success border-opacity-25">
        <div className="d-flex align-items-center gap-2">
          <div className="avatar-sm rounded-circle bg-success d-flex align-items-center justify-content-center flex-shrink-0">
            <i className="ri-checkbox-circle-line text-white fs-18"></i>
          </div>
          <div>
            <h5 className="mb-0 text-success fw-bold">Extraction terminée</h5>
            <p className="text-muted mb-0 fs-12">
              Durée totale : <strong>{formatTime(elapsed)}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="card-body">
        {/* Message */}
        {result.message && (
          <p className="text-muted fs-13 mb-3">{result.message}</p>
        )}

        {/* Badges résumé */}
        <div className="row g-2 mb-3">
          {[
            { label: "Lot ID",     value: `#${result.lot_id}`,   color: "primary", icon: "ri-hashtag"          },
            { label: "Type",       value: result.type,            color: "warning", icon: "ri-play-circle-line" },
            { label: "Projet ID",  value: `#${result.project_id}`,color: "info",    icon: "ri-folder-2-line"    },
            { label: "Période",    value: result.period_id ? `#${result.period_id}` : "—",
                                                                   color: "success", icon: "ri-calendar-2-line"  },
          ].map((b, i) => (
            <div key={i} className="col-6">
              <div className={`rounded-3 p-2 bg-${b.color}-subtle border border-${b.color} border-opacity-25`}>
                <div className="d-flex align-items-center gap-2">
                  <i className={`${b.icon} text-${b.color} fs-16`}></i>
                  <div>
                    <p className={`text-${b.color} fs-10 fw-bold text-uppercase mb-0`}>{b.label}</p>
                    <p className={`text-${b.color} fw-bold fs-13 mb-0`}>{b.value}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* MD5 Checksum */}
        {result.md5sum && (
          <div className="rounded-3 p-3 bg-light border mb-3">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="fs-12 fw-semibold text-muted text-uppercase">
                <i className="ri-shield-check-line me-1 text-success"></i>
                MD5 Checksum — RG-04
              </span>
              <button
                className={`btn btn-sm ${copied ? "btn-success" : "btn-soft-secondary"} py-0 px-2 fs-11`}
                onClick={copyMd5}
              >
                <i className={`${copied ? "ri-check-line" : "ri-file-copy-line"} me-1`}></i>
                {copied ? "Copié !" : "Copier"}
              </button>
            </div>
            <code className="fs-11 text-break text-secondary">{result.md5sum}</code>
          </div>
        )}

        {/* Info MONTHLY */}
        {result.type === "MONTHLY" && (
          <div className="alert alert-info py-2 fs-12 mb-3">
            <i className="ri-information-line me-1"></i>
            Fichier dump et MD5 disponibles dans{" "}
            <strong>Admin → Extraction Lots</strong>.
          </div>
        )}

        {/* Boutons navigation */}
        <div className="d-flex gap-2 flex-wrap">
          <button
            className="btn btn-success btn-sm flex-fill"
            onClick={() => navigate("/projects")}
          >
            <i className="ri-folder-2-line me-1"></i>Projets
          </button>
          <button
            className="btn btn-soft-primary btn-sm flex-fill"
            onClick={() => navigate("/")}
          >
            <i className="ri-dashboard-2-line me-1"></i>Dashboard
          </button>
          {result.type === "MONTHLY" && (
            <button
              className="btn btn-soft-info btn-sm flex-fill"
              onClick={() => navigate("/extraction-lots")}
            >
              <i className="ri-list-check me-1"></i>Lots
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExtractionPage() {
  const navigate = useNavigate();

  const [gitlabConfigs,   setGitlabConfigs]   = useState([]);
  const [projects,        setProjects]        = useState([]);
  const [developers,      setDevelopers]      = useState([]);
  const [periods,         setPeriods]         = useState([]);

  const [selectedConfig,  setSelectedConfig]  = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedPeriod,  setSelectedPeriod]  = useState("");
  const [extractionType,  setExtractionType]  = useState("REALTIME");

  const [loading,         setLoading]         = useState(false);
  const [loadingDevs,     setLoadingDevs]     = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [result,          setResult]          = useState(null);
  const [error,           setError]           = useState(null);
  const [currentStep,     setCurrentStep]     = useState(-1);
  const [elapsed,         setElapsed]         = useState(0);

  const timerRef     = useRef(null);
  const stepTimerRef = useRef(null);

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const [configsRes, periodsRes] = await Promise.all([
          api.get("/gitlab-configs"),
          api.get("/periods"),
        ]);
        setGitlabConfigs(Array.isArray(configsRes.data) ? configsRes.data : []);
        const open = (Array.isArray(periodsRes.data) ? periodsRes.data : [])
          .filter((p) => p.status === "open");
        setPeriods(open);
      } catch {
        setError("Impossible de charger les configurations GitLab ou les périodes.");
      }
    };
    fetchInitial();
  }, []);

  // ── Chargement projets ────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedConfig) { setProjects([]); setSelectedProject(""); setDevelopers([]); return; }
    const fetch = async () => {
      setLoadingProjects(true);
      setSelectedProject("");
      setDevelopers([]);
      try {
        const res = await api.get("/projects");
        const all = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
        setProjects(all.filter((p) => String(p.gitlab_config_id) === String(selectedConfig)));
      } catch {
        setError("Impossible de charger les projets.");
      } finally {
        setLoadingProjects(false);
      }
    };
    fetch();
  }, [selectedConfig]);

  // ── Chargement développeurs ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedProject) { setDevelopers([]); return; }
    const fetch = async () => {
      setLoadingDevs(true);
      try {
        const res = await api.get("/developers", { params: { project_id: selectedProject } });
        setDevelopers(Array.isArray(res.data) ? res.data : (res.data?.items ?? []));
      } catch {
        setDevelopers([]);
      } finally {
        setLoadingDevs(false);
      }
    };
    fetch();
  }, [selectedProject]);

  // ── Chrono ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [loading]);

  // ── Animation étapes ──────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) {
      setCurrentStep(0);
      let step = 0;
      stepTimerRef.current = setInterval(() => {
        step++;
        if (step < STEPS.length) setCurrentStep(step);
        else clearInterval(stepTimerRef.current);
      }, 2500);
    } else {
      clearInterval(stepTimerRef.current);
    }
    return () => clearInterval(stepTimerRef.current);
  }, [loading]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Run extraction ────────────────────────────────────────────────────────
  const handleRunExtraction = useCallback(async () => {
    if (!selectedProject) { setError("Veuillez sélectionner un projet."); return; }
    if (extractionType === "MONTHLY" && !selectedPeriod) {
      setError("Une période est requise pour une extraction MONTHLY.");
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const payload = {
        project_id:      Number(selectedProject),
        extraction_type: extractionType,
        ...(selectedPeriod && { period_id: Number(selectedPeriod) }),
      };
      const res = await api.post("/extraction/run", payload);
      setResult(res.data);
      setCurrentStep(STEPS.length);
    } catch (err) {
      let msg = "L'extraction a échoué. Vérifiez la configuration GitLab.";
      if (typeof err.response?.data?.detail === "string")       msg = err.response.data.detail;
      else if (Array.isArray(err.response?.data?.detail))       msg = err.response.data.detail[0]?.msg || msg;
      setError(msg);
      setCurrentStep(-1);
    } finally {
      setLoading(false);
    }
  }, [selectedProject, selectedPeriod, extractionType]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const selectedConfigObj  = gitlabConfigs.find((c) => String(c.id) === String(selectedConfig));
  const selectedProjectObj = projects.find((p) => String(p.id) === String(selectedProject));
  const selectedPeriodObj  = periods.find((p) => String(p.id) === String(selectedPeriod));
  const canRun = selectedProject && (extractionType === "REALTIME" || selectedPeriod) && !loading;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* ── Page Title ── */}
        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-download-cloud-2-line me-2 text-primary"></i>
                GitLab Extraction
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
                <li className="breadcrumb-item active">Extraction</li>
              </ol>
            </div>
          </div>
        </div>

        {/* ── Stats rapides ── */}
        <div className="row mb-2">
          {[
            { label: "Configs GitLab",   value: gitlabConfigs.length, color: "primary", icon: "ri-settings-4-line"         },
            { label: "Projets dispo",    value: projects.length,      color: "info",    icon: "ri-folder-2-line"            },
            { label: "Périodes ouvertes",value: periods.length,       color: "success", icon: "ri-calendar-check-line"      },
            { label: "Développeurs",     value: developers.length,    color: "warning", icon: "ri-team-line"                },
          ].map((s, i) => (
            <div key={i} className="col-xl-3 col-sm-6">
              <div className="card card-animate mb-3">
                <div className="card-body py-3">
                  <div className="d-flex align-items-center">
                    <div className="avatar-sm flex-shrink-0">
                      <span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-3`}>
                        <i className={s.icon}></i>
                      </span>
                    </div>
                    <div className="flex-grow-1 ms-3">
                      <p className="text-uppercase fw-medium text-muted mb-1 fs-11">{s.label}</p>
                      <h4 className="mb-0">{s.value}</h4>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="row">

          {/* ══════════════════════════════════════════════════════════════
              COLONNE GAUCHE — Formulaire + Progression + Résultat
          ══════════════════════════════════════════════════════════════ */}
          <div className="col-xl-8">
            <div className="card">

              <div className="card-header d-flex align-items-center">
                <div className="flex-grow-1">
                  <h5 className="card-title mb-0">
                    <i className="ri-settings-3-line me-2 text-primary"></i>
                    Paramètres d'extraction
                  </h5>
                </div>
                {/* Badge type actif */}
                <span className={`badge ${extractionType === "MONTHLY" ? "bg-warning-subtle text-warning" : "bg-primary-subtle text-primary"} fs-12`}>
                  <i className={`${extractionType === "MONTHLY" ? "ri-calendar-2-line" : "ri-play-circle-line"} me-1`}></i>
                  {extractionType}
                </span>
              </div>

              <div className="card-body">

                {/* ── Sélecteurs en grille ── */}
                <div className="row g-3 mb-4">

                  {/* 1. GitLab Domain */}
                  <div className="col-md-6">
                    <label className="form-label fw-medium">
                      <i className="ri-git-repository-line me-1 text-muted"></i>
                      Domaine GitLab
                    </label>
                    <select
                      className="form-select"
                      value={selectedConfig}
                      onChange={(e) => {
                        setSelectedConfig(e.target.value);
                        setResult(null);
                        setError(null);
                      }}
                    >
                      <option value="">— Sélectionner un domaine —</option>
                      {gitlabConfigs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.domain})
                        </option>
                      ))}
                    </select>
                    {gitlabConfigs.length === 0 && (
                      <div className="text-muted fs-12 mt-1">
                        <i className="ri-information-line me-1"></i>
                        Aucune configuration GitLab disponible.
                      </div>
                    )}
                  </div>

                  {/* 2. Projet */}
                  <div className="col-md-6">
                    <label className="form-label fw-medium">
                      <i className="ri-folder-2-line me-1 text-muted"></i>
                      Projet <span className="text-danger">*</span>
                    </label>
                    {loadingProjects ? (
                      <div className="form-select d-flex align-items-center gap-2 text-muted">
                        <span className="spinner-border spinner-border-sm"></span>
                        Chargement des projets…
                      </div>
                    ) : (
                      <select
                        className="form-select"
                        value={selectedProject}
                        disabled={!selectedConfig}
                        onChange={(e) => {
                          setSelectedProject(e.target.value);
                          setResult(null);
                          setError(null);
                        }}
                      >
                        <option value="">— Sélectionner un projet —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.namespace ? ` (${p.namespace})` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedConfig && !loadingProjects && projects.length === 0 && (
                      <div className="text-warning fs-12 mt-1">
                        <i className="ri-alert-line me-1"></i>
                        Aucun projet pour ce domaine GitLab.
                      </div>
                    )}
                  </div>

                  {/* 3. Période */}
                  <div className="col-md-6">
                    <label className="form-label fw-medium">
                      <i className="ri-calendar-2-line me-1 text-muted"></i>
                      Période
                      {extractionType === "MONTHLY"
                        ? <span className="text-danger"> *</span>
                        : <span className="badge bg-secondary-subtle text-secondary ms-2 fw-normal fs-11">Optionnel</span>
                      }
                    </label>
                    <select
                      className="form-select"
                      value={selectedPeriod}
                      onChange={(e) => { setSelectedPeriod(e.target.value); setResult(null); }}
                    >
                      <option value="">— Sélectionner une période ouverte —</option>
                      {periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.year}/{String(p.month).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                    {periods.length === 0 && (
                      <div className="text-warning fs-12 mt-1">
                        <i className="ri-alert-line me-1"></i>
                        Aucune période ouverte.{" "}
                        <a href="/admin/periods" className="text-warning fw-medium">Créer une période</a>
                      </div>
                    )}
                  </div>

                  {/* 4. Type */}
                  <div className="col-md-6">
                    <label className="form-label fw-medium">
                      <i className="ri-play-circle-line me-1 text-muted"></i>
                      Type d'extraction
                    </label>
                    <div className="d-flex gap-2">
                      {["REALTIME", "MONTHLY"].map((type) => (
                        <div
                          key={type}
                          className={`flex-fill p-2 rounded-3 border cursor-pointer text-center ${
                            extractionType === type
                              ? type === "MONTHLY"
                                ? "border-warning bg-warning-subtle"
                                : "border-primary bg-primary-subtle"
                              : "border bg-white"
                          }`}
                          style={{ cursor: "pointer" }}
                          onClick={() => { setExtractionType(type); setSelectedPeriod(""); setResult(null); }}
                        >
                          <i className={`${type === "MONTHLY" ? "ri-calendar-2-line" : "ri-play-circle-line"} d-block fs-18 mb-1 ${
                            extractionType === type
                              ? type === "MONTHLY" ? "text-warning" : "text-primary"
                              : "text-muted"
                          }`}></i>
                          <span className={`fs-12 fw-semibold ${
                            extractionType === type
                              ? type === "MONTHLY" ? "text-warning" : "text-primary"
                              : "text-muted"
                          }`}>{type}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-muted fs-12 mt-2 mb-0">
                      {extractionType === "REALTIME"
                        ? <><i className="ri-information-line me-1"></i>Extraction manuelle — la période doit être ouverte (RG-01)</>
                        : <><i className="ri-information-line me-1"></i>Clôture la période et génère les snapshots KPI</>
                      }
                    </p>
                  </div>
                </div>

                {/* ── Séparateur ── */}
                <hr className="border-dashed my-3" />

                {/* ── Bouton Run ── */}
                <div className="d-flex align-items-center justify-content-between">
                  <div className="text-muted fs-13">
                    {!selectedProject && (
                      <span><i className="ri-error-warning-line me-1 text-warning"></i>Sélectionnez un projet pour continuer</span>
                    )}
                    {selectedProject && extractionType === "MONTHLY" && !selectedPeriod && (
                      <span><i className="ri-error-warning-line me-1 text-warning"></i>Sélectionnez une période pour MONTHLY</span>
                    )}
                    {canRun && (
                      <span className="text-success">
                        <i className="ri-checkbox-circle-line me-1"></i>Prêt à lancer l'extraction
                      </span>
                    )}
                  </div>
                  <button
                    className={`btn btn-lg px-5 ${canRun ? "btn-primary" : "btn-secondary"}`}
                    onClick={handleRunExtraction}
                    disabled={!canRun}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        {formatTime(elapsed)}
                      </>
                    ) : (
                      <>
                        <i className="ri-play-fill me-2"></i>
                        Run Extraction
                      </>
                    )}
                  </button>
                </div>

                {/* ── Barre de progression temps ── */}
                {loading && (
                  <div className="mt-3">
                    <div className="progress" style={{ height: 4 }}>
                      <div
                        className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                        style={{ width: `${Math.min(((currentStep + 1) / STEPS.length) * 100, 95)}%` }}
                      ></div>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* ── Étapes progression ── */}
            {(loading || (currentStep >= 0 && !result)) && (
              <StepIndicator currentStep={currentStep} loading={loading} />
            )}

            {/* ── Résultat ── */}
            {result && !loading && (
              <ResultCard result={result} elapsed={elapsed} navigate={navigate} />
            )}

            {/* ── Erreur ── */}
            {error && !loading && (
              <div className="alert alert-danger d-flex align-items-start gap-2 mt-3">
                <i className="ri-error-warning-line fs-18 flex-shrink-0 mt-1"></i>
                <div className="flex-grow-1">
                  <p className="fw-semibold mb-1">Erreur d'extraction</p>
                  <p className="fs-13 mb-0">{error}</p>
                </div>
                <button className="btn-close" onClick={() => setError(null)}></button>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════
              COLONNE DROITE — Développeurs + Récap + Guide
          ══════════════════════════════════════════════════════════════ */}
          <div className="col-xl-4">

            {/* ── Développeurs du projet ── */}
            <div className="card mb-3">
              <div className="card-header d-flex align-items-center">
                <h5 className="card-title mb-0 flex-grow-1">
                  <i className="ri-team-line me-2 text-primary"></i>
                  Développeurs
                </h5>
                {developers.length > 0 && (
                  <span className="badge bg-primary-subtle text-primary">{developers.length}</span>
                )}
              </div>

              <div className="card-body p-2">
                {!selectedProject ? (
                  <div className="text-center py-4">
                    <i className="ri-cursor-line fs-2 text-muted d-block mb-2"></i>
                    <p className="text-muted fs-13 mb-0">Sélectionnez un projet</p>
                  </div>
                ) : loadingDevs ? (
                  <div className="text-center py-4">
                    <span className="spinner-border spinner-border-sm text-primary d-block mx-auto mb-2"></span>
                    <p className="text-muted fs-13 mb-0">Chargement…</p>
                  </div>
                ) : developers.length === 0 ? (
                  <div className="text-center py-4">
                    <i className="ri-user-unfollow-line fs-2 text-muted d-block mb-2"></i>
                    <p className="text-muted fs-13 mb-0">Aucun développeur enregistré</p>
                    <p className="text-muted fs-11 mb-0">Lancez une première extraction</p>
                  </div>
                ) : (
                  <ul className="list-unstyled mb-0" style={{ maxHeight: 280, overflowY: "auto" }}>
                    {developers.map((dev, i) => {
                      const colors = ["primary","success","info","warning","danger","secondary"];
                      const c = colors[i % colors.length];
                      return (
                        <li
                          key={dev.id}
                          className="d-flex align-items-center gap-2 px-2 py-2 rounded-2 hover-bg"
                        >
                          <div
                            className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center
                              bg-${c}-subtle text-${c} fw-bold fs-12 flex-shrink-0`}
                            style={{ minWidth: 32, height: 32 }}
                          >
                            {getInitials(dev.name || dev.username)}
                          </div>
                          <div className="min-w-0 flex-grow-1">
                            <p className="fw-medium fs-13 mb-0 text-truncate">
                              {dev.name || dev.username}
                            </p>
                            <p className="text-muted fs-11 mb-0 text-truncate">
                              @{dev.username}
                              {dev.site && (
                                <span className={`badge bg-${c}-subtle text-${c} ms-1 fs-10`}>
                                  {dev.site}
                                </span>
                              )}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* ── Récapitulatif sélection ── */}
            {(selectedConfigObj || selectedProjectObj || selectedPeriodObj) && (
              <div className="card mb-3">
                <div className="card-header">
                  <h5 className="card-title mb-0 fs-13">
                    <i className="ri-file-list-3-line me-2 text-muted"></i>
                    Récapitulatif
                  </h5>
                </div>
                <div className="card-body py-2 px-3">
                  <div className="vstack gap-2">
                    {[
                      selectedConfigObj  && { label: "Domaine",  value: selectedConfigObj.domain,  icon: "ri-git-repository-line", color: "primary" },
                      selectedProjectObj && { label: "Projet",   value: selectedProjectObj.name,   icon: "ri-folder-2-line",       color: "info"    },
                      selectedPeriodObj  && { label: "Période",  value: `${selectedPeriodObj.year}/${String(selectedPeriodObj.month).padStart(2, "0")}`, icon: "ri-calendar-2-line", color: "success" },
                      { label: "Type", value: extractionType, icon: "ri-play-circle-line", color: extractionType === "MONTHLY" ? "warning" : "primary" },
                    ].filter(Boolean).map((row, i) => (
                      <div key={i} className="d-flex align-items-center justify-content-between py-1 border-bottom border-dashed last-border-0">
                        <span className="text-muted fs-12 d-flex align-items-center gap-1">
                          <i className={`${row.icon} text-${row.color}`}></i>
                          {row.label}
                        </span>
                        <span className={`badge bg-${row.color}-subtle text-${row.color} fs-11 text-truncate`}
                          style={{ maxWidth: 140 }}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Guide ── */}
            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0 fs-13">
                  <i className="ri-information-line me-2 text-info"></i>
                  Guide d'extraction
                </h5>
              </div>
              <div className="card-body py-3">

                <div className="rounded-3 p-3 bg-primary-subtle mb-3">
                  <p className="fw-semibold fs-13 text-primary mb-1">
                    <i className="ri-play-circle-line me-1"></i>REALTIME
                  </p>
                  <p className="fs-12 text-muted mb-0">
                    Extraction manuelle à la demande. La période doit être <strong>ouverte</strong> (RG-01).
                  </p>
                </div>

                <div className="rounded-3 p-3 bg-warning-subtle mb-3">
                  <p className="fw-semibold fs-13 text-warning mb-1">
                    <i className="ri-calendar-2-line me-1"></i>MONTHLY
                  </p>
                  <p className="fs-12 text-muted mb-0">
                    Clôture la période, archive les lots REALTIME et génère les <strong>snapshots KPI</strong>.
                  </p>
                </div>

                <div className="vstack gap-2">
                  {[
                    { icon: "ri-git-commit-line",    color: "primary", text: "Commits + stats lignes +/-"       },
                    { icon: "ri-git-merge-line",     color: "info",    text: "Merge Requests + approbations"    },
                    { icon: "ri-team-line",           color: "success", text: "Développeurs créés auto"          },
                    { icon: "ri-shield-check-line",   color: "warning", text: "Fichier dump + MD5 (RG-04)"       },
                  ].map((item, i) => (
                    <div key={i} className="d-flex align-items-center gap-2 fs-12 text-muted">
                      <i className={`${item.icon} text-${item.color} fs-14 flex-shrink-0`}></i>
                      {item.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}