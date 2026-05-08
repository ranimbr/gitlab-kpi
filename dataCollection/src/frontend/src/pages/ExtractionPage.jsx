/**
 * ExtractionPage.jsx — Lancement d'extractions GitLab
 *
 * AJOUT v3 — Feature "Backfill historique" (senior-grade) :
 *
 *   Contexte : En production, les données GitLab peuvent être historiques
 *   (commits antérieurs à la période courante). Le système ne permettait
 *   que des extractions sur la période ouverte (RG-01).
 *
 *   Solution : Mode "Backfill" — toggle qui déverrouille la sélection
 *   de n'importe quelle période (open ou closed) pour recalculer les KPIs
 *   sur des données historiques. C'est une pratique standard dans les
 *   systèmes de data pipeline (Airflow, dbt, GitLab CI --backfill).
 *
 *   Implémentation :
 *     - Toggle "Backfill historique" visible uniquement en mode MONTHLY
 *     - Si activé : charge TOUTES les périodes (open + closed)
 *     - Badge "BACKFILL" distinctif dans Extraction Lots
 *     - Modal de confirmation renforcée pour backfill
 *     - Log [BACKFILL] dans le journal temps réel
 *     - Payload identique au backend existant (period_id déjà supporté)
 *
 * Corrections conservées de v2 :
 *   [FIX] handleRunExtraction — doExtract dans les deps (stale closure)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import ExtractionByTeamTab from "./ExtractionByTeamTab";

// ─── Étapes d'animation ───────────────────────────────────────────────────────
const STEPS = [
  { icon:"ri-git-repository-line", label:"Connexion à GitLab",              color:"primary" },
  { icon:"ri-git-commit-line",     label:"Récupération des commits",         color:"info"    },
  { icon:"ri-git-merge-line",      label:"Récupération des Merge Requests",  color:"warning" },
  { icon:"ri-team-line",           label:"Identification des contributeurs", color:"success" },
  { icon:"ri-bar-chart-line",      label:"Calcul des KPIs",                  color:"danger"  },
];

function getInitials(name="") {
  return (name||"?").split(/[\s._-]/).map(w=>w[0]).join("").toUpperCase().slice(0,2);
}
function formatTime(s) {
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
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
        {STEPS.map((step,i)=>{
          const done    = i < currentStep;
          const active  = i === currentStep && loading;
          const pending = !done && !active;
          return (
            <div key={i} className={`d-flex align-items-center gap-3 p-2 rounded-2 ${active?"bg-white shadow-sm border":done?"bg-white":""}`}>
              <div className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${done?`bg-${step.color} text-white`:active?`bg-${step.color}-subtle text-${step.color}`:pending?"bg-light border text-muted":""}`}>
                {done    ? <i className="ri-check-line fs-13"></i>
                : active ? <span className="spinner-border spinner-border-sm"></span>
                :          <i className={`${step.icon} fs-13`}></i>}
              </div>
              <span className={`fs-13 flex-grow-1 ${done?"text-muted text-decoration-line-through":active?"fw-semibold text-dark":pending?"text-muted":""}`}>
                {step.label}
              </span>
              {done   && <span className="badge bg-success-subtle text-success fs-10"><i className="ri-check-line me-1"></i>OK</span>}
              {active && <span className={`badge bg-${step.color}-subtle text-${step.color} fs-10`}>En cours…</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Journal de logs temps réel ───────────────────────────────────────────────
function ExtractionLogs({ logs }) {
  const bottomRef = useRef(null);
  useEffect(()=>{ if(bottomRef.current) bottomRef.current.scrollIntoView({behavior:"smooth"}); },[logs]);
  if (!logs?.length) return null;
  return (
    <div className="card mb-3">
      <div className="card-header py-2"><h6 className="card-title mb-0 fs-13"><i className="ri-terminal-line me-2 text-muted"></i>Journal d'extraction</h6></div>
      <div className="card-body p-0">
        <div style={{background:"#0d1117",borderRadius:"0 0 8px 8px",maxHeight:200,overflowY:"auto",padding:"12px 16px",fontFamily:"'SFMono-Regular','Consolas',monospace"}}>
          {logs.map((log,i)=>(
            <div key={i} className="d-flex gap-3" style={{fontSize:11,lineHeight:1.7}}>
              <span style={{color:"#6e7681",flexShrink:0}}>{log.time}</span>
              <span style={{color:log.type==="error"?"#f85149":log.type==="success"?"#3fb950":log.type==="warn"?"#d29922":log.type==="backfill"?"#79c0ff":"#8b949e"}}>{log.message}</span>
            </div>
          ))}
          <div ref={bottomRef}></div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal confirmation MONTHLY / BACKFILL ────────────────────────────────────
function ConfirmMonthlyModal({ onConfirm, onCancel, projectName, periodLabel, isBackfill }) {
  useEffect(()=>{
    const handler=(e)=>{ if(e.key==="Escape") onCancel(); };
    document.addEventListener("keydown",handler);
    return ()=>document.removeEventListener("keydown",handler);
  },[onCancel]);

  return (
    <div className="modal fade show d-block" style={{backgroundColor:"rgba(30,34,45,0.7)",backdropFilter:"blur(4px)"}}
      onClick={onCancel} role="dialog" aria-modal="true"
      aria-label={isBackfill?"Confirmation backfill historique":"Confirmation extraction MONTHLY"}>
      <div className="modal-dialog modal-dialog-centered" style={{maxWidth:500}} onClick={e=>e.stopPropagation()}>
        <div className="modal-content border-0" style={{borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,0.2)"}}>
          <div className="modal-header border-0 px-4 pt-4 pb-2">
            <div className="d-flex align-items-center gap-3">
              <div className={`avatar-md rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${isBackfill?"bg-info-subtle":"bg-warning-subtle"}`}>
                <i className={`${isBackfill?"ri-history-line text-info":"ri-alert-line text-warning"} fs-2`}></i>
              </div>
              <div>
                <h5 className="fw-bold mb-1">
                  {isBackfill ? "Confirmer le Backfill historique" : "Confirmer l'extraction MONTHLY"}
                </h5>
                <p className="text-muted mb-0 fs-13">
                  {isBackfill
                    ? "Recalcul des KPIs sur une période passée"
                    : "Cette action est irréversible"}
                </p>
              </div>
            </div>
          </div>
          <div className="modal-body px-4 py-3">
            {isBackfill ? (
              <div className="rounded-3 p-3 bg-info-subtle border border-info border-opacity-25 mb-3">
                <div className="vstack gap-2 fs-13">
                  <div className="d-flex align-items-center gap-2">
                    <i className="ri-history-line text-info flex-shrink-0"></i>
                    <span>Les KPIs de la période <strong>{periodLabel}</strong> seront <strong>recalculés</strong> depuis les données GitLab</span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <i className="ri-database-2-line text-info flex-shrink-0"></i>
                    <span>Les snapshots existants pour cette période seront <strong>mis à jour</strong></span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <i className="ri-bar-chart-line text-info flex-shrink-0"></i>
                    <span>Un nouveau fichier dump sera généré avec le suffixe <code>_backfill</code></span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3 p-3 bg-warning-subtle border border-warning border-opacity-25 mb-3">
                <div className="vstack gap-2 fs-13">
                  <div className="d-flex align-items-center gap-2"><i className="ri-close-circle-line text-warning flex-shrink-0"></i><span>La période <strong>{periodLabel}</strong> sera <strong>clôturée définitivement</strong></span></div>
                  <div className="d-flex align-items-center gap-2"><i className="ri-archive-line text-warning flex-shrink-0"></i><span>Tous les lots REALTIME en cours seront <strong>archivés</strong></span></div>
                  <div className="d-flex align-items-center gap-2"><i className="ri-bar-chart-line text-warning flex-shrink-0"></i><span>Un <strong>snapshot KPI</strong> sera généré et un fichier dump créé (RG-04)</span></div>
                </div>
              </div>
            )}
            {projectName&&<p className="text-muted fs-13 mb-0"><i className="ri-folder-2-line me-1"></i>Projet concerné : <strong>{projectName}</strong></p>}
          </div>
          <div className="modal-footer border-0 px-4 pb-4 pt-2 gap-2">
            <button className="btn btn-light flex-fill" onClick={onCancel}><i className="ri-close-line me-1"></i>Annuler</button>
            <button
              className={`btn flex-fill fw-semibold ${isBackfill?"btn-info":"btn-warning"}`}
              onClick={onConfirm}
            >
              <i className={`${isBackfill?"ri-history-line":"ri-play-fill"} me-1`}></i>
              {isBackfill ? "Confirmer le Backfill" : "Confirmer l'extraction MONTHLY"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────
function ResultCard({ result, elapsed, navigate }) {
  const [copied,setCopied]=useState(false);
  const copyMd5=()=>{ if(!result.md5sum)return; navigator.clipboard.writeText(result.md5sum); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  return (
    <div className="card border-success border-opacity-50 shadow-sm mb-0">
      <div className="card-header bg-success-subtle border-success border-opacity-25">
        <div className="d-flex align-items-center gap-2">
          <div className="avatar-sm rounded-circle bg-success d-flex align-items-center justify-content-center flex-shrink-0"><i className="ri-checkbox-circle-line text-white fs-18"></i></div>
          <div><h5 className="mb-0 text-success fw-bold">Extraction terminée</h5><p className="text-muted mb-0 fs-12">Durée totale : <strong>{formatTime(elapsed)}</strong></p></div>
        </div>
      </div>
      <div className="card-body">
        {result.message&&<p className="text-muted fs-13 mb-3">{result.message}</p>}
        <div className="row g-2 mb-3">
          {[
            {label:"Lot ID",    value:`#${result.lot_id}`,    color:"primary",icon:"ri-hashtag"          },
            {label:"Type",      value:result.extraction_type, color:"warning",icon:"ri-play-circle-line" },
            {label:"Projet ID", value:`#${result.project_id}`,color:"info",   icon:"ri-folder-2-line"   },
            {label:"Période",   value:result.period_id?`#${result.period_id}`:"—",color:"success",icon:"ri-calendar-2-line"},
          ].map((b,i)=>(
            <div key={i} className="col-6">
              <div className={`rounded-3 p-2 bg-${b.color}-subtle border border-${b.color} border-opacity-25`}>
                <div className="d-flex align-items-center gap-2">
                  <i className={`${b.icon} text-${b.color} fs-16`}></i>
                  <div><p className={`text-${b.color} fs-10 fw-bold text-uppercase mb-0`}>{b.label}</p><p className={`text-${b.color} fw-bold fs-13 mb-0`}>{b.value}</p></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {result.md5sum&&(
          <div className="rounded-3 p-3 bg-light border mb-3">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="fs-12 fw-semibold text-muted text-uppercase"><i className="ri-shield-check-line me-1 text-success"></i>MD5 Checksum — RG-04</span>
              <button className={`btn btn-sm ${copied?"btn-success":"btn-soft-secondary"} py-0 px-2 fs-11`} onClick={copyMd5}><i className={`${copied?"ri-check-line":"ri-file-copy-line"} me-1`}></i>{copied?"Copié !":"Copier"}</button>
            </div>
            <code className="fs-11 text-break text-secondary">{result.md5sum}</code>
          </div>
        )}
        {result.extraction_type==="MONTHLY"&&<div className="alert alert-info py-2 fs-12 mb-3"><i className="ri-information-line me-1"></i>Fichier dump et MD5 disponibles dans <strong>Admin → Extraction Lots</strong>.</div>}
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-success btn-sm flex-fill" onClick={()=>navigate("/projects")}><i className="ri-folder-2-line me-1"></i>Projets</button>
          <button className="btn btn-soft-primary btn-sm flex-fill" onClick={()=>navigate("/")}><i className="ri-dashboard-2-line me-1"></i>Dashboard</button>
          {result.extraction_type==="MONTHLY"&&<button className="btn btn-soft-info btn-sm flex-fill" onClick={()=>navigate("/extraction-lots")}><i className="ri-list-check me-1"></i>Lots</button>}
          <button className="btn btn-soft-success btn-sm flex-fill" onClick={()=>navigate("/kpi-analysis")}><i className="ri-bar-chart-grouped-line me-1"></i>Analyse KPI</button>
        </div>
      </div>
    </div>
  );
}

// ─── BackfillBanner ───────────────────────────────────────────────────────────
function BackfillBanner() {
  return (
    <div className="alert alert-info d-flex align-items-start gap-3 py-2 mb-0 mt-3" style={{borderRadius:8}}>
      <i className="ri-information-line fs-18 flex-shrink-0 text-info mt-1"></i>
      <div className="fs-12">
        <strong className="d-block mb-1">Mode Backfill activé</strong>
        <span className="text-muted">
          Le backfill permet de recalculer les KPIs sur des périodes historiques dont les données
          GitLab ont déjà été collectées. Toutes les périodes sont disponibles, y compris les périodes clôturées.
          Cette fonctionnalité est équivalente au <code>--backfill</code> d'Apache Airflow ou au
          <code>dbt run --full-refresh</code>.
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExtractionPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState("project");

  const [gitlabConfigs,   setGitlabConfigs]   = useState([]);
  const [allProjects,     setAllProjects]      = useState([]);      // Liste complète pour les sous-composants
  const [projects,        setProjects]         = useState([]);      // Liste filtrée pour l'onglet "Par Projet"
  const [developers,      setDevelopers]       = useState([]);
  const [periods,         setPeriods]          = useState([]);      // périodes open seulement
  const [allPeriods,      setAllPeriods]       = useState([]);      // toutes les périodes (backfill)

  const [selectedConfig,  setSelectedConfig]   = useState("");
  const [selectedProject, setSelectedProject]  = useState("");
  const [selectedDeveloperIds, setSelectedDeveloperIds] = useState([]); // ← CHANGÉ : Multi-sélection
  const [selectedPeriod,    setSelectedPeriod]    = useState("");
  const [extractionType,  setExtractionType]   = useState("REALTIME");
  const [isBackfill,      setIsBackfill]       = useState(false);
  const [isSmartSync,     setIsSmartSync]      = useState(false);   // ✅ AJOUT SENIOR

  const [loading,         setLoading]          = useState(false);
  const [loadingDevs,     setLoadingDevs]       = useState(false);
  const [loadingProjects, setLoadingProjects]   = useState(false);
  const [result,          setResult]           = useState(null);
  const [error,           setError]            = useState(null);
  const [currentStep,     setCurrentStep]      = useState(-1);
  const [elapsed,         setElapsed]          = useState(0);
  const [showConfirm,     setShowConfirm]      = useState(false);
  const [logs,            setLogs]             = useState([]);
  const [validated,       setValidated]        = useState(false);

  const timerRef     = useRef(null);
  const stepTimerRef = useRef(null);

  const addLog = useCallback((message, type="info")=>{
    const time = new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    setLogs(prev=>[...prev,{time, message, type}]);
  },[]);

  // Périodes disponibles selon le mode
  const availablePeriods = isBackfill ? allPeriods : periods;

  // Chargement initial
  useEffect(()=>{
    const fetchInitial = async () => {
      try {
        const [configsRes, periodsRes] = await Promise.all([
          api.get("/gitlab-configs"),
          api.get("/periods"),
        ]);
        setGitlabConfigs(Array.isArray(configsRes.data) ? configsRes.data : []);
        
        const all  = Array.isArray(periodsRes.data) ? periodsRes.data : [];
        const open = all.filter(p => p.status === "open");
        setPeriods(open);
        setAllPeriods(all);
      } catch {
        setError("Impossible de charger les configurations GitLab ou les périodes.");
      }
    };
    fetchInitial();
  },[]);

  // ✅ SENIOR FIX : Re-charger les projets quand la période change pour mettre à jour les badges (dev_count)
  useEffect(() => {
    const fetchProjectsWithPeriod = async () => {
      setLoadingProjects(true);
      try {
        const res = await api.get("/projects", { 
          params: { 
            period_id: selectedPeriod || undefined 
          } 
        });
        const data = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
        setAllProjects(data);
      } catch (err) {
        console.error("Failed to fetch projects with period filter", err);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjectsWithPeriod();
  }, [selectedPeriod]);

  // Pré-sélection depuis URL
  useEffect(()=>{
    const urlProjectId = searchParams.get("project_id");
    if (urlProjectId && projects.length) {
      const found = projects.find(p => String(p.id) === urlProjectId);
      if (found) setSelectedProject(urlProjectId);
    }
  },[searchParams, projects]);

  // Filtrage local des projets pour l'onglet "Par Projet"
  useEffect(()=>{
    if (!selectedConfig) { setProjects([]); setSelectedProject(""); setDevelopers([]); return; }
    setSelectedProject(""); setDevelopers([]);
    setProjects(allProjects.filter(p => String(p.gitlab_config_id) === String(selectedConfig)));
  },[selectedConfig, allProjects]);

  // Chargement développeurs
  useEffect(()=>{
    if (!selectedProject) { setDevelopers([]); return; }
    const fetch = async () => {
      setLoadingDevs(true);
      try {
        const res = await api.get("/developers", {params:{
          project_id:selectedProject,
          period_id: selectedPeriod || undefined // ✅ AJOUT SENIOR : Cohort Awareness
        }});
        setDevelopers(Array.isArray(res.data) ? res.data : (res.data?.items ?? []));
      } catch { setDevelopers([]); }
      finally  { setLoadingDevs(false); }
    };
    fetch();
  },[selectedProject, selectedPeriod]);

  // Reset période quand le mode backfill change
  useEffect(()=>{
    setSelectedPeriod("");
  },[isBackfill]);

  // Smart-Sync reset
  useEffect(() => {
    if (isSmartSync) {
      setSelectedDeveloperIds([]);
    }
  }, [isSmartSync]);

  // Chrono
  useEffect(()=>{
    if (loading) { setElapsed(0); timerRef.current = setInterval(()=>setElapsed(s=>s+1), 1000); }
    else         { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  },[loading]);

  // Animation étapes + logs (DÉSORMAIS PASSÉ EN POLLING RÉEL)
  useEffect(()=>{
    if (loading && result?.lot_id) {
      // Démarrage du polling
      const poll = async () => {
        try {
          const res = await api.get(`/extraction/jobs/${result.lot_id}`);
          const job = res.data;
          
          if (job.step_label) {
            addLog(job.step_label, isBackfill ? "backfill" : "info");
          }
          
          if (job.step_index !== undefined) {
            setCurrentStep(job.step_index);
          }

          if (job.status === "completed") {
            addLog("Extraction terminée avec succès ✓", "success");
            setResult(job);
            setLoading(false);
            clearInterval(stepTimerRef.current);
          } else if (job.status === "failed") {
            const msg = job.error_message || "L'extraction a échoué.";
            setError(msg);
            addLog(`Erreur : ${msg}`, "error");
            setLoading(false);
            clearInterval(stepTimerRef.current);
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      };

      stepTimerRef.current = setInterval(poll, 2000);
      poll(); // Premier appel immédiat
    }
    return () => clearInterval(stepTimerRef.current);
  }, [loading, result?.lot_id, addLog, isBackfill]);

  const isProjectValid = !!selectedProject;
  const isPeriodValid  = extractionType !== "MONTHLY" || !!selectedPeriod;
  const canRun         = isProjectValid && isPeriodValid && !loading;

  const doExtract = useCallback(async () => {
    setShowConfirm(false); setLoading(true); setResult(null); setError(null); setValidated(false);
    try {
      const payload = {
        project_id:     selectedProject ? Number(selectedProject) : null,
        gitlab_config_id: selectedConfig ? Number(selectedConfig) : null,
        developer_ids:   selectedDeveloperIds.length > 0 ? selectedDeveloperIds.map(Number) : undefined,
        extraction_type: extractionType,
        ...(selectedPeriod && { period_id: Number(selectedPeriod) }),
        is_backfill:     isBackfill,
        auto_target_by_period: isSmartSync,
      };

      if (isBackfill) {
        addLog("[BACKFILL] Démarrage du recalcul KPI historique…", "backfill");
        addLog(`[BACKFILL] Période cible : #${selectedPeriod}`, "backfill");
      } else {
        addLog("Démarrage de l'extraction (Arrière-plan)…", "info");
      }

      // Le backend répond 202 avec le lot_id immédiatement
      const res = await api.post("/extraction/run", payload);
      setResult(res.data); // Contient le lot_id pour le useEffect de polling
      
    } catch(err) {
      let msg = "Impossible de lancer l'extraction. Vérifiez la connexion au serveur.";
      if (typeof err.response?.data?.detail === "string")   msg = err.response.data.detail;
      else if (Array.isArray(err.response?.data?.detail))   msg = err.response.data.detail[0]?.msg || msg;
      setError(msg);
      addLog(`Erreur au lancement : ${msg}`, "error");
      setLoading(false);
    }
  }, [selectedProject, selectedPeriod, extractionType, isBackfill, addLog]);

  // ✅ FIX CRITIQUE : doExtract dans les deps → stale closure corrigée
  const handleRunExtraction = useCallback(async () => {
    setValidated(true);
    if (!isProjectValid || !isPeriodValid) return;
    if (extractionType === "MONTHLY") { setShowConfirm(true); return; }
    await doExtract();
  },[isProjectValid, isPeriodValid, extractionType, doExtract]);

  const selectedConfigObj  = gitlabConfigs.find(c => String(c.id) === String(selectedConfig));
  const selectedProjectObj = projects.find(p => String(p.id) === String(selectedProject));
  const selectedPeriodObj  = availablePeriods.find(p => String(p.id) === String(selectedPeriod));

  const resetForm = () => {
    setSelectedConfig(""); setSelectedProject(""); setSelectedDeveloperIds([]); setSelectedPeriod("");
    setExtractionType("REALTIME"); setIsBackfill(false);
    setResult(null); setError(null); setValidated(false); setLogs([]); setCurrentStep(-1);
  };

  return (
    <div className="page-content"><div className="container-fluid">

      {showConfirm && (
        <ConfirmMonthlyModal
          onConfirm   = {doExtract}
          onCancel    = {()=>setShowConfirm(false)}
          projectName = {selectedProjectObj?.name}
          periodLabel = {selectedPeriodObj
            ? `${selectedPeriodObj.year}/${String(selectedPeriodObj.month).padStart(2,"0")}`
            : "—"}
          isBackfill  = {isBackfill}
        />
      )}

      <div className="row"><div className="col-12">
        <div className="page-title-box d-sm-flex align-items-center justify-content-between">
          <h4 className="mb-sm-0"><i className="ri-download-cloud-2-line me-2 text-primary"></i>GitLab Extraction</h4>
          <ol className="breadcrumb m-0">
            <li className="breadcrumb-item"><a href="/">Dashboard</a></li>
            <li className="breadcrumb-item active">Extraction</li>
          </ol>
        </div>
      </div></div>

      <div className="row mb-3">
        <div className="col-12">
          <ul className="nav nav-tabs nav-tabs-custom nav-success nav-justified" role="tablist">
            <li className="nav-item">
               <a className={`nav-link ${activeTab === "project" ? "active" : ""}`} onClick={() => setActiveTab("project")} style={{cursor: "pointer", fontWeight: 700}}>
                  <i className="ri-folder-2-line me-2"></i>Par Projet
               </a>
            </li>
            <li className="nav-item">
               <a className={`nav-link ${activeTab === "team" ? "active" : ""}`} onClick={() => setActiveTab("team")} style={{cursor: "pointer", fontWeight: 700}}>
                  <i className="ri-building-2-line me-2"></i>Par Business Unit
               </a>
            </li>
          </ul>
        </div>
      </div>

      {activeTab === "team" ? (
          <ExtractionByTeamTab 
            gitlabConfigs={gitlabConfigs} 
            periods={allPeriods} 
            projects={allProjects} 
            selectedPeriod={selectedPeriod} 
            isSmartSync={isSmartSync}
          />
      ) : (
      <>
      {/* Stats rapides */}
      <div className="row mb-2">
        {[
          {label:"Configs GitLab",    value:gitlabConfigs.length, color:"primary",icon:"ri-settings-4-line"   },
          {label:"Projets dispo",     value:projects.length,      color:"info",   icon:"ri-folder-2-line"      },
          {label:"Périodes ouvertes", value:periods.length,       color:"success",icon:"ri-calendar-check-line"},
          {label:"Développeurs",      value:developers.length,    color:"warning",icon:"ri-team-line"          },
        ].map((s,i)=>(
          <div key={i} className="col-xl-3 col-sm-6">
            <div className="card card-animate mb-3">
              <div className="card-body py-3">
                <div className="d-flex align-items-center">
                  <div className="avatar-sm flex-shrink-0">
                    <span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-3`}><i className={s.icon}></i></span>
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
        {/* Colonne gauche */}
        <div className="col-xl-8">
          <div className="card">
            <div className="card-header d-flex align-items-center">
              <div className="flex-grow-1">
                <h5 className="card-title mb-0">
                  <i className="ri-settings-3-line me-2 text-primary"></i>
                  Paramètres d'extraction
                </h5>
              </div>
              <div className="d-flex gap-2 align-items-center">
                {isBackfill && (
                  <span className="badge bg-info-subtle text-info fs-12 d-flex align-items-center gap-1">
                    <i className="ri-history-line"></i>BACKFILL
                  </span>
                )}
                <span className={`badge ${extractionType==="MONTHLY"?"bg-warning-subtle text-warning":"bg-primary-subtle text-primary"} fs-12`}>
                  <i className={`${extractionType==="MONTHLY"?"ri-calendar-2-line":"ri-play-circle-line"} me-1`}></i>{extractionType}
                </span>
                {isSmartSync && (
                  <span className="badge bg-success-subtle text-success fs-12 d-flex align-items-center gap-1">
                    <i className="ri-shield-check-line"></i>SMART-SYNC ACTIVE
                  </span>
                )}
                {(selectedConfig||result||error) && !loading && (
                  <button className="btn btn-soft-secondary btn-sm" onClick={resetForm}>
                    <i className="ri-refresh-line me-1"></i>Reset
                  </button>
                )}
              </div>
            </div>

            <div className="card-body">
              <div className="row g-3 mb-4">
                {/* 1. GitLab Domain */}
                <div className="col-md-6">
                  <label className="form-label fw-medium">
                    <i className="ri-git-repository-line me-1 text-muted"></i>Domaine GitLab
                  </label>
                  <select className="form-select" value={selectedConfig}
                    onChange={e=>{setSelectedConfig(e.target.value);setResult(null);setError(null);setValidated(false);}}>
                    <option value="">— Sélectionner un domaine —</option>
                    {gitlabConfigs.map(c=><option key={c.id} value={c.id}>{c.name} ({c.domain})</option>)}
                  </select>
                  {gitlabConfigs.length===0&&<div className="text-muted fs-12 mt-1"><i className="ri-information-line me-1"></i>Aucune configuration GitLab disponible.</div>}
                </div>

                {/* 2. Projet */}
                <div className="col-md-6">
                  <label className="form-label fw-medium">
                    <i className="ri-folder-2-line me-1 text-muted"></i>Projet <span className="text-danger">*</span>
                  </label>
                  {loadingProjects ? (
                    <div className="form-select d-flex align-items-center gap-2 text-muted">
                      <span className="spinner-border spinner-border-sm"></span>Chargement…
                    </div>
                  ) : (
                    <select className={`form-select ${validated&&!isProjectValid?"is-invalid":""}`}
                      value={selectedProject} disabled={!selectedConfig}
                      onChange={e=>{setSelectedProject(e.target.value);setResult(null);setError(null);}}>
                      <option value="">— Sélectionner un projet —</option>
                      {projects.map(p=><option key={p.id} value={p.id}>{p.name}{p.namespace?` (${p.namespace})`:""}</option>)}
                    </select>
                  )}
                  {validated && !isProjectValid && selectedDeveloperIds.length === 0 && <div className="invalid-feedback d-block">Veuillez sélectionner un projet ou un développeur.</div>}
                  {selectedConfig&&!loadingProjects&&projects.length===0&&<div className="text-warning fs-12 mt-1"><i className="ri-alert-line me-1"></i>Aucun projet pour ce domaine.</div>}
                </div>

                {/* 2bis. Développeurs technique (Multi-sélection) */}
                <div className="col-12 mt-3">
                  <label className="form-label fw-medium d-flex justify-content-between align-items-center">
                    <span className={isSmartSync ? "text-success fw-bold" : ""}>
                      <i className={`ri-user-star-line me-1 ${isSmartSync ? "text-success" : "text-muted"}`}></i>
                      Effectif Ciblé {isSmartSync ? "(Ciblage RH Intelligent)" : "(Membres des Business Units)"}
                    </span>
                    
                    <div className="d-flex align-items-center gap-3">
                       {/* ✅ AJOUT SENIOR : Toggle Smart-Sync */}
                       <div className="form-check form-switch mb-0 bg-success-subtle px-2 py-1 rounded-2 d-flex align-items-center gap-2 border border-success border-opacity-10">
                         <label className="form-check-label fs-11 text-success fw-semibold mb-0" htmlFor="smart-sync-toggle" style={{cursor:"pointer"}}>
                            Mode Smart-Sync
                         </label>
                         <input
                           className="form-check-input ms-0"
                           type="checkbox"
                           id="smart-sync-toggle"
                           checked={isSmartSync}
                           onChange={e => setIsSmartSync(e.target.checked)}
                           style={{cursor:"pointer"}}
                         />
                       </div>

                       {!isSmartSync && (
                         <div className="d-flex gap-2 border-start ps-3">
                            <button className="btn btn-link py-0 fs-11 p-0" onClick={() => setSelectedDeveloperIds(developers.filter(d => d.rh_status !== "FUTURE_JOINER" && d.rh_status !== "OFFBOARDED").map(d => String(d.id)))}>Tout cocher</button>
                            <button className="btn btn-link py-0 fs-11 p-0 text-danger" onClick={() => setSelectedDeveloperIds([])}>Vider</button>
                         </div>
                       )}
                    </div>
                  </label>
                  
                  <div className={`border rounded-3 p-3 transition-all ${isSmartSync ? "bg-success-subtle bg-opacity-10 border-success border-opacity-25" : "bg-light-subtle"}`} 
                       style={{maxHeight: "200px", overflowY: "auto", opacity: isSmartSync ? 0.8 : 1, filter: isSmartSync ? "grayscale(0.5)" : "none"}}>
                    {loadingDevs ? (
                      <div className="text-center py-2 text-muted fs-12"><span className="spinner-border spinner-border-sm me-2"></span>Chargement des membres...</div>
                    ) : developers.length === 0 ? (
                      <div className="text-center py-2 text-muted fs-12">Aucun développeur trouvé pour ce projet.</div>
                    ) : (
                      <div className="row g-2">
                        {developers.map(dev => (
                          <div key={dev.id} className="col-md-4 col-sm-6">
                            <div className="form-check card-radio p-0 h-100">
                              <input 
                                className="form-check-input d-none" 
                                type="checkbox" 
                                id={`dev-${dev.id}`}
                                checked={selectedDeveloperIds.includes(String(dev.id))}
                                disabled={isSmartSync || dev.rh_status === "FUTURE_JOINER" || dev.rh_status === "OFFBOARDED"}
                                onChange={e => {
                                  const id = String(dev.id);
                                  setSelectedDeveloperIds(prev => 
                                    e.target.checked ? [...prev, id] : prev.filter(x => x !== id)
                                  );
                                }}
                              />
                              <label className={`form-check-label p-2 rounded-2 border h-100 d-flex align-items-center gap-2 ${selectedDeveloperIds.includes(String(dev.id)) ? "border-primary bg-primary-subtle bg-opacity-10" : "bg-white"} ${(dev.rh_status === "FUTURE_JOINER" || dev.rh_status === "OFFBOARDED") ? "opacity-50 grayscale" : ""}`} 
                                     htmlFor={`dev-${dev.id}`} 
                                     style={{cursor: (dev.rh_status === "FUTURE_JOINER" || dev.rh_status === "OFFBOARDED" || isSmartSync) ? "not-allowed" : "pointer"}}>
                                <div className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${selectedDeveloperIds.includes(String(dev.id)) ? "bg-primary text-white" : "bg-light text-muted"}`} style={{width: 24, height: 24, fontSize: 10}}>
                                  {getInitials(dev.name || dev.gitlab_username)}
                                </div>
                                <div className="text-truncate flex-grow-1">
                                  <div className="d-flex align-items-center justify-content-between gap-1">
                                    <div className={`fs-12 fw-medium text-truncate ${selectedDeveloperIds.includes(String(dev.id)) ? "text-primary" : "text-dark"}`}>{dev.name || dev.gitlab_username}</div>
                                    
                                    {/* ✅ BADGES RH SENIOR */}
                                    {dev.rh_status === "ACTIVE" && <i className="ri-checkbox-circle-line text-success fs-12" title="Effectif Actif"></i>}
                                    {dev.rh_status === "ONBOARDING" && <i className="ri-seedling-line text-info fs-12" title="Nouveau (Onboarding)"></i>}
                                    {dev.rh_status === "FUTURE_JOINER" && <i className="ri-time-line text-muted fs-12" title="Futur arrivant"></i>}
                                    {dev.rh_status === "OFFBOARDED" && <i className="ri-door-open-line text-danger fs-12" title="Départ / Inactif"></i>}
                                  </div>
                                  <div className="d-flex align-items-center justify-content-between">
                                    <div className="text-muted fs-10 text-truncate">@{dev.gitlab_username}</div>
                                    <span className={`badge fs-8 p-1 ${
                                      dev.rh_status === "ACTIVE" ? "bg-success-subtle text-success" :
                                      dev.rh_status === "ONBOARDING" ? "bg-info-subtle text-info" :
                                      dev.rh_status === "FUTURE_JOINER" ? "bg-light text-muted" : "bg-danger-subtle text-danger"
                                    }`}>
                                      {dev.rh_status === "ACTIVE" ? "ACTIVE" :
                                       dev.rh_status === "FUTURE_JOINER" ? "FUTUR" :
                                       dev.rh_status === "OFFBOARDED" ? "INACTIF" : "NEW"}
                                    </span>
                                  </div>
                                </div>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`fs-11 mt-2 ${isSmartSync ? "text-success fw-medium" : "text-muted"}`}>
                    <i className={`ri-information-line me-1 ${isSmartSync ? "text-success" : ""}`}></i>
                    {isSmartSync 
                      ? "Le système calculera automatiquement la liste des développeurs actifs pour la période choisie (onboarding/offboarding)." 
                      : (selectedDeveloperIds.length > 0 
                        ? `Extraction limitée à ${selectedDeveloperIds.length} développeur(s).` 
                        : "Si aucun n'est sélectionné, l'extraction portera sur TOUS les membres du projet.")}
                  </div>
                </div>

                {/* 3. Type d'extraction */}
                <div className="col-md-6">
                  <label className="form-label fw-medium">
                    <i className="ri-play-circle-line me-1 text-muted"></i>Type d'extraction
                  </label>
                  <div className="d-flex gap-2">
                    {["REALTIME","MONTHLY"].map(type=>(
                      <div key={type}
                        className={`flex-fill p-2 rounded-3 border text-center ${extractionType===type?(type==="MONTHLY"?"border-warning bg-warning-subtle":"border-primary bg-primary-subtle"):"border bg-white"}`}
                        style={{cursor:"pointer"}}
                        onClick={()=>{setExtractionType(type);setSelectedPeriod("");setResult(null);setValidated(false);if(type==="REALTIME")setIsBackfill(false);}}>
                        <i className={`${type==="MONTHLY"?"ri-calendar-2-line":"ri-play-circle-line"} d-block fs-18 mb-1 ${extractionType===type?(type==="MONTHLY"?"text-warning":"text-primary"):"text-muted"}`}></i>
                        <span className={`fs-12 fw-semibold ${extractionType===type?(type==="MONTHLY"?"text-warning":"text-primary"):"text-muted"}`}>{type}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-muted fs-12 mt-2 mb-0">
                    {extractionType==="REALTIME"
                      ? <><i className="ri-information-line me-1"></i>Extraction manuelle — la période doit être ouverte (RG-01)</>
                      : <><i className="ri-alert-line me-1 text-warning"></i><strong className="text-warning">Irréversible</strong> — Clôture la période et génère les snapshots KPI</>}
                  </p>
                </div>

                {/* 4. Période + toggle Backfill */}
                <div className="col-md-6">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <label className="form-label fw-medium mb-0">
                      <i className="ri-calendar-2-line me-1 text-muted"></i>Période
                      {extractionType==="MONTHLY"
                        ? <span className="text-danger"> *</span>
                        : <span className="badge bg-secondary-subtle text-secondary ms-2 fw-normal fs-11">Optionnel</span>}
                    </label>

                    {/* ── Toggle Backfill — visible uniquement en mode MONTHLY ── */}
                    {extractionType === "MONTHLY" && (
                      <div className="d-flex align-items-center gap-2">
                        <label className="form-check-label fs-11 text-muted" htmlFor="backfill-toggle">
                          <i className="ri-history-line me-1"></i>Backfill historique
                        </label>
                        <div className="form-check form-switch mb-0">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="backfill-toggle"
                            checked={isBackfill}
                            onChange={e => { setIsBackfill(e.target.checked); setSelectedPeriod(""); }}
                            style={{cursor:"pointer"}}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <select
                    className={`form-select ${validated&&!isPeriodValid?"is-invalid":""}`}
                    value={selectedPeriod}
                    onChange={e=>{setSelectedPeriod(e.target.value);setResult(null);}}>
                    <option value="">
                      {isBackfill
                        ? "— Sélectionner une période (toutes) —"
                        : "— Sélectionner une période ouverte —"}
                    </option>
                    {availablePeriods
                      .slice()
                      .sort((a,b) => b.year - a.year || b.month - a.month)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.year}/{String(p.month).padStart(2,"0")}
                          {p.status === "closed" ? " ✓ clôturée" : " (ouverte)"}
                        </option>
                      ))}
                  </select>

                  {validated&&!isPeriodValid&&<div className="invalid-feedback d-block">Une période est requise pour une extraction MONTHLY.</div>}

                  {!isBackfill && periods.length===0 && (
                    <div className="text-warning fs-12 mt-1">
                      <i className="ri-alert-line me-1"></i>Aucune période ouverte.{" "}
                      <a href="/admin/periods" className="text-warning fw-medium">Créer une période</a>
                      {" "}ou activer le <strong>Backfill</strong> pour utiliser une période clôturée.
                    </div>
                  )}

                  {isBackfill && <BackfillBanner />}
                </div>
              </div>

              <hr className="my-3" style={{ borderTop: "1px solid #F1F5F9" }}/>
              <div className="d-flex align-items-center justify-content-between gap-3">
                <div className="text-muted fs-13">
                  {!selectedProject&&validated&&<span className="text-danger"><i className="ri-error-warning-line me-1"></i>Sélectionnez un projet</span>}
                  {!selectedProject&&!validated&&<span><i className="ri-error-warning-line me-1 text-warning"></i>Sélectionnez un projet pour continuer</span>}
                  {selectedProject&&extractionType==="MONTHLY"&&!selectedPeriod&&<span className={validated?"text-danger":""}><i className="ri-error-warning-line me-1 text-warning"></i>Sélectionnez une période pour MONTHLY</span>}
                  {canRun&&!loading&&!isBackfill&&<span className="text-success"><i className="ri-checkbox-circle-line me-1"></i>Prêt à lancer l'extraction</span>}
                  {canRun&&!loading&&isBackfill&&<span className="text-info"><i className="ri-history-line me-1"></i>Prêt à lancer le backfill historique</span>}
                </div>
                <button
                  className={`btn btn-lg px-5 ${canRun
                    ? isBackfill
                      ? "btn-info"
                      : extractionType==="MONTHLY"
                        ? "btn-warning"
                        : "btn-primary"
                    : "btn-secondary"}`}
                  onClick={handleRunExtraction}
                  disabled={loading}
                >
                  {loading ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>{formatTime(elapsed)}</>
                  ) : isSmartSync ? (
                    <><i className="ri-shield-check-line me-2"></i>Run Smart Extraction</>
                  ) : isBackfill ? (
                    <><i className="ri-history-line me-2"></i>Run Backfill</>
                  ) : (
                    <><i className="ri-play-fill me-2"></i>Run Extraction</>
                  )}
                </button>
              </div>
              {loading && (
                <div className="mt-3">
                  <div className="progress" style={{height:4}}>
                    <div
                      className={`progress-bar progress-bar-striped progress-bar-animated ${isBackfill?"bg-info":"bg-primary"}`}
                      style={{width:`${Math.min(((currentStep+1)/STEPS.length)*100,95)}%`}}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(loading||(currentStep>=0&&!result))&&<StepIndicator currentStep={currentStep} loading={loading}/>}
          {logs.length>0&&<ExtractionLogs logs={logs}/>}
          {result&&!loading&&<ResultCard result={result} elapsed={elapsed} navigate={navigate}/>}
          {error&&!loading&&(
            <div className="alert alert-danger d-flex align-items-start gap-2 mt-3">
              <i className="ri-error-warning-line fs-18 flex-shrink-0 mt-1"></i>
              <div className="flex-grow-1"><p className="fw-semibold mb-1">Erreur d'extraction</p><p className="fs-13 mb-0">{error}</p></div>
              <button className="btn-close" onClick={()=>setError(null)}></button>
            </div>
          )}
        </div>

        {/* Colonne droite */}
        <div className="col-xl-4">
          {/* Développeurs */}
          <div className="card mb-3">
            <div className="card-header d-flex align-items-center">
              <h5 className="card-title mb-0 flex-grow-1"><i className="ri-team-line me-2 text-primary"></i>Développeurs</h5>
              {developers.length>0&&<span className="badge bg-primary-subtle text-primary">{developers.length}</span>}
            </div>
            <div className="card-body p-2">
              {!selectedProject ? (
                <div className="text-center py-4"><i className="ri-cursor-line fs-2 text-muted d-block mb-2"></i><p className="text-muted fs-13 mb-0">Sélectionnez un projet</p></div>
              ) : loadingDevs ? (
                <div className="text-center py-4"><span className="spinner-border spinner-border-sm text-primary d-block mx-auto mb-2"></span><p className="text-muted fs-13 mb-0">Chargement…</p></div>
              ) : developers.length===0 ? (
                <div className="text-center py-4"><i className="ri-user-unfollow-line fs-2 text-muted d-block mb-2"></i><p className="text-muted fs-13 mb-0">Aucun développeur enregistré</p><p className="text-muted fs-11 mb-0">Lancez une première extraction</p></div>
              ) : (
                <ul className="list-unstyled mb-0" style={{maxHeight:280,overflowY:"auto"}}>
                  {developers.map((dev,i)=>{
                    const colors=["primary","success","info","warning","danger","secondary"];
                    const c=colors[i%colors.length];
                    return (
                      <li key={dev.id} className="d-flex align-items-center gap-2 px-2 py-2 rounded-2">
                        <div className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center bg-${c}-subtle text-${c} fw-bold fs-12 flex-shrink-0`} style={{minWidth:32,height:32}}>
                          {getInitials(dev.name||dev.username)}
                        </div>
                        <div className="min-w-0 flex-grow-1">
                          <p className="fw-medium fs-13 mb-0 text-truncate">{dev.name||dev.username}</p>
                          <p className="text-muted fs-11 mb-0 text-truncate">@{dev.username}{dev.site&&<span className={`badge bg-${c}-subtle text-${c} ms-1 fs-10`}>{dev.site}</span>}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Récapitulatif */}
          {(selectedConfigObj||selectedProjectObj||selectedPeriodObj) && (
            <div className="card mb-3">
              <div className="card-header"><h5 className="card-title mb-0 fs-13"><i className="ri-file-list-3-line me-2 text-muted"></i>Récapitulatif</h5></div>
              <div className="card-body py-2 px-3">
                <div className="vstack gap-2">
                  {Object.values([
                    selectedConfigObj  && {label:"Domaine", value:selectedConfigObj.domain,  icon:"ri-git-repository-line", color:"primary"},
                    selectedProjectObj && {label:"Projet",  value:selectedProjectObj.name,   icon:"ri-folder-2-line",       color:"info"   },
                    selectedPeriodObj  && {label:"Période", value:`${selectedPeriodObj.year}/${String(selectedPeriodObj.month).padStart(2,"0")}${selectedPeriodObj.status==="closed"?" ✓":""}`, icon:"ri-calendar-2-line", color:"success"},
                    {label:"Type",  value:extractionType, icon:"ri-play-circle-line", color:extractionType==="MONTHLY"?"warning":"primary"},
                    isBackfill && {label:"Mode", value:"Backfill historique", icon:"ri-history-line", color:"info"},
                  ].filter(Boolean)).map((row, i, arr)=>(
                    <div key={i} className="d-flex align-items-center justify-content-between py-2"
                      style={{ borderBottom: i < arr.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                      <span className="text-muted fs-12 d-flex align-items-center gap-1"><i className={`${row.icon} text-${row.color}`}></i>{row.label}</span>
                      <span className={`badge bg-${row.color}-subtle text-${row.color} fs-11 text-truncate`} style={{maxWidth:140}}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Guide */}
          <div className="card">
            <div className="card-header"><h5 className="card-title mb-0 fs-13"><i className="ri-information-line me-2 text-info"></i>Guide d'extraction</h5></div>
            <div className="card-body py-3">
              <div className="rounded-3 p-3 bg-primary-subtle mb-3">
                <p className="fw-semibold fs-13 text-primary mb-1"><i className="ri-play-circle-line me-1"></i>REALTIME</p>
                <p className="fs-12 text-muted mb-0">Extraction manuelle à la demande. La période doit être <strong>ouverte</strong> (RG-01).</p>
              </div>
              <div className="rounded-3 p-3 bg-warning-subtle mb-3">
                <p className="fw-semibold fs-13 text-warning mb-1"><i className="ri-calendar-2-line me-1"></i>MONTHLY <span className="badge bg-warning text-dark fs-10 ms-1">Irréversible</span></p>
                <p className="fs-12 text-muted mb-0">Clôture la période, archive les lots REALTIME et génère les <strong>snapshots KPI</strong>.</p>
              </div>
              {/* ── Section Backfill ── */}
              <div className="rounded-3 p-3 bg-info-subtle mb-3">
                <p className="fw-semibold fs-13 text-info mb-1">
                  <i className="ri-history-line me-1"></i>BACKFILL
                  <span className="badge bg-info text-white fs-10 ms-1">Avancé</span>
                </p>
                <p className="fs-12 text-muted mb-0">
                  Recalcule les KPIs sur une <strong>période historique</strong> (open ou closed).
                  Équivalent au <code>--backfill</code> d'Airflow ou au <code>dbt run --full-refresh</code>.
                  Activer via le toggle dans le sélecteur de période (mode MONTHLY uniquement).
                </p>
              </div>
              <div className="vstack gap-2">
                {[
                  {icon:"ri-git-commit-line",  color:"primary", text:"Commits + stats lignes +/-"},
                  {icon:"ri-git-merge-line",   color:"info",    text:"Merge Requests + approbations"},
                  {icon:"ri-team-line",        color:"success", text:"Développeurs créés auto"},
                  {icon:"ri-shield-check-line",color:"warning", text:"Fichier dump + MD5 (RG-04)"},
                ].map((item,i)=>(
                  <div key={i} className="d-flex align-items-center gap-2 fs-12 text-muted">
                    <i className={`${item.icon} text-${item.color} fs-14 flex-shrink-0`}></i>{item.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div></div>
  );
}
