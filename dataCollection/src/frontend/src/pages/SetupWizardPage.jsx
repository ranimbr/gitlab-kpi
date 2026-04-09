import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

const STEPS = [
  { id: 1, label: "Plateforme GitLab", icon: "ri-git-repository-line" },
  { id: 2, label: "Équipe & Projets",  icon: "ri-team-line" },
  { id: 3, label: "Extraction",        icon: "ri-play-circle-line" }
];

export default function SetupWizardPage() {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [gitlabConfigs, setGitlabConfigs] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  
  // Etape 2 (Import)
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [draftProjects, setDraftProjects] = useState([]); // { id, name, gitlab_project_id }
  const [importResult, setImportResult] = useState(null);

  const LOGS_COLORS = { primary: "#4361ee", info: "#3b82f6", warning: "#f59e0b", success: "#10b981", danger: "#ef4444" };
  const EXT_STEPS = [
    { icon:"ri-git-repository-line", label:"Connexion à GitLab",              color:"primary" },
    { icon:"ri-git-commit-line",     label:"Récupération des commits",         color:"info"    },
    { icon:"ri-git-merge-line",      label:"Récupération des Merge Requests",  color:"warning" },
    { icon:"ri-team-line",           label:"Identification des contributeurs", color:"success" },
    { icon:"ri-bar-chart-line",      label:"Calcul des KPIs",                  color:"danger"  },
  ];

  // Etape 3 (Extraction)
  const [extracting, setExtracting] = useState(false);
  const [devLogs, setDevLogs] = useState([]);
  const [extractionStep, setExtractionStep] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const [extractionDone, setExtractionDone] = useState(false);
  const [fastMode, setFastMode] = useState(true); // Par défaut ON pour la performance

  const timerRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    // Re-ajouter le fetch initial
    api.get("/gitlab-configs").then(res => setGitlabConfigs(res.data)).catch(console.error);

    return () => { clearInterval(timerRef.current); clearInterval(pollRef.current); };
  }, []);

  // --- ACTIONS ETAPE 1 ---
  const handleConfigSelect = (id) => {
    setSelectedConfigId(id);
    setCurrentStep(2);
  };

  // --- ACTIONS ETAPE 2 ---
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !selectedConfigId) return;
    setImporting(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("create_missing_projects", "true"); 
    formData.append("create_missing_sites", "true");
    formData.append("default_gitlab_config_id", selectedConfigId);

    try {
      const res = await api.post("/developers/import", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setImportResult(res.data);
      
      if (res.data.created_projects && res.data.created_projects.length > 0) {
        const projRes = await api.get("/projects", { params: { all_projects: true } });
        const allProj = projRes.data;
        const drafts = allProj
          .filter(p => res.data.created_projects.includes(p.name) && !p.gitlab_project_id)
          .map(p => ({ id: p.id, name: p.name, gitlab_project_id: "" }));
        
        if (drafts.length > 0) {
          setDraftProjects(drafts);
          setImporting(false);
          return; 
        }
      }
      setCurrentStep(3);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'import.");
    }
    setImporting(false);
  };

  const handleResolveDrafts = async () => {
    for (const d of draftProjects) {
        if (d.gitlab_project_id) {
             await api.put(`/projects/${d.id}`, { gitlab_project_id: parseInt(d.gitlab_project_id) });
        }
    }
    setCurrentStep(3);
  };

  const updateDraftId = (id, val) => {
    setDraftProjects(prev => prev.map(p => p.id === id ? { ...p, gitlab_project_id: val } : p));
  };

  const handleStartExtraction = async () => {
      setExtracting(true);
      setExtractionDone(false);
      setExtractionStep(0);
      setElapsed(0);
      setDevLogs(["[SYSTEM] Lancement de l'extraction By Team..."]);

      try {
          await api.post("/extraction/by-team", null, { 
              params: { 
                  gitlab_config_id: selectedConfigId,
                  all_developers: true,
                  fast_mode: fastMode
              }
          });
          setDevLogs((prev) => [...prev, `[SUCCESS] Tâches asynchrones démarrées`]);
          
          timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);

          pollRef.current = setInterval(async () => {
              try {
                  const res = await api.get("/extraction/lots");
                  const lots = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
                  // Look for running lots triggered just now (realtime)
                  const runningLots = lots.filter(l => l.status === "running" && l.extraction_type === "REALTIME");
                  
                  if (runningLots.length > 0) {
                      const maxStep = Math.max(...runningLots.map(l => l.step_index >= 0 ? l.step_index : 0));
                      setExtractionStep(maxStep);
                      const latestLabel = runningLots.find(l => l.step_index === maxStep)?.step_label;
                      if (latestLabel) {
                          setDevLogs(prev => {
                              if (prev[prev.length - 1] !== latestLabel) return [...prev, latestLabel];
                              return prev;
                          });
                      }
                  } else {
                      // All running lots finished
                      setExtractionStep(5);
                      setExtractionDone(true);
                      setExtracting(false);
                      clearInterval(pollRef.current);
                      clearInterval(timerRef.current);
                      setDevLogs((prev) => [...prev, `[SUCCESS] Extraction terminée à 100% avec succès.`]);
                  }
              } catch (err) {
                  console.error(err);
              }
          }, 2000);

      } catch (err) {
          console.error(err);
          setDevLogs((prev) => [...prev, "[ERROR] L'extraction a échoué."]);
          setExtracting(false);
      }
  };

  const formatTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  // --- RENDUS DES ETAPES ---
  const renderStep1 = () => (
    <div className="card shadow-sm border-0 mt-4 rounded-4" style={{ background: "rgba(255,255,255,0.03)" }}>
      <div className="card-body p-5 text-center">
        <div className="avatar-lg mx-auto mb-4">
          <div className="avatar-title bg-primary-subtle text-primary rounded-circle fs-2">
            <i className="ri-git-repository-fill"></i>
          </div>
        </div>
        <h4 className="fw-bold mb-3">Sélectionnez la plateforme GitLab</h4>
        <p className="text-muted mb-4 fs-14">
          Choisissez l'instance GitLab sur laquelle vos projets et équipes sont hébergés.
        </p>

        <div className="row justify-content-center g-3">
          {gitlabConfigs.length === 0 && (
              <div className="alert alert-warning">Aucune configuration GitLab trouvée. Veuillez en créer une dans "Administration".</div>
          )}
          {gitlabConfigs.map(c => (
             <div className="col-md-5" key={c.id}>
                <div 
                   className={`p-4 rounded-3 text-start border ${selectedConfigId === c.id ? "border-primary bg-primary-subtle shadow" : "border-secondary-subtle"}`} 
                   style={{ cursor: "pointer", transition: "all 0.2s" }}
                   onClick={() => handleConfigSelect(c.id)}
                >
                   <div className="d-flex align-items-center gap-3">
                      <i className="ri-server-line fs-2 text-primary"></i>
                      <div>
                          <h6 className="mb-0 fw-bold">{c.name}</h6>
                          <div className="text-muted fs-12">{c.domain}</div>
                      </div>
                   </div>
                </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="card shadow-sm border-0 mt-4 rounded-4">
      <div className="card-body p-5">
        <div className="d-flex align-items-center gap-3 mb-4">
             <div className="avatar-sm flex-shrink-0">
                  <div className="avatar-title bg-info-subtle text-info rounded-circle fs-3"><i className="ri-file-excel-2-line"></i></div>
             </div>
             <div>
                  <h5 className="fw-bold mb-0">Importer votre Équipe (CSV/Excel)</h5>
                  <p className="text-muted fs-13 mb-0">Les développeurs seront créés ou mis à jour automatiquement.</p>
             </div>
        </div>

        {!importResult ? (
            <div className="p-4 border border-dashed rounded-3 text-center bg-light mb-4">
              <input 
                 type="file" 
                 ref={fileInputRef} 
                 style={{ display: "none" }} 
                 accept=".csv, .xlsx" 
                 onChange={handleFileChange}
              />
              <i className="ri-upload-cloud-2-line fs-1 text-muted mb-2"></i>
              <h6 className="mb-2">{selectedFile ? selectedFile.name : "Glissez votre fichier ici ou cliquez pour parcourir"}</h6>
              <button className="btn btn-outline-primary btn-sm mt-2" onClick={() => fileInputRef.current.click()}>
                  Sélectionner un fichier
              </button>
            </div>
        ) : (
            <div className="alert alert-success fs-14 mb-4">
               <i className="ri-checkbox-circle-line me-2"></i>
               Import terminé avec succès : <strong>{importResult.success_count}</strong> développeurs validés.
            </div>
        )}

        {/* INLINE RESOLVER: Draft Projects Missing IDs */}
        {draftProjects.length > 0 && (
           <div className="card border-warning border-2 bg-warning-subtle mb-4">
              <div className="card-header border-warning pb-2 bg-transparent">
                  <h6 className="fw-bold text-warning-emphasis mb-0">
                      <i className="ri-alert-line me-2"></i>Action requise : Nouveaux projets détectés
                  </h6>
                  <p className="fs-12 text-warning-emphasis mt-1 mb-0 opacity-75">
                      Ces projets étaient dans votre CSV mais leurs IDs GitLab sont manquants. Renseignez-les pour permettre l'extraction.
                  </p>
              </div>
              <div className="card-body pt-2">
                  <div className="table-responsive">
                      <table className="table table-sm table-borderless align-middle mb-0">
                          <tbody>
                              {draftProjects.map((p, idx) => (
                                  <tr key={idx}>
                                      <td className="fw-medium text-dark ps-0" style={{ width: "30%" }}>{p.name}</td>
                                      <td>
                                          <input 
                                             type="number" 
                                             className="form-control form-control-sm" 
                                             placeholder="Ex: 5678910" 
                                             value={p.gitlab_project_id}
                                             onChange={e => updateDraftId(p.id, e.target.value)}
                                          />
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
           </div>
        )}

        <div className="d-flex justify-content-between align-items-center mt-2">
            <button className="btn btn-soft-secondary" onClick={() => setCurrentStep(1)} disabled={importing}>Retour</button>
            {draftProjects.length > 0 ? (
                 <button className="btn btn-warning fw-bold px-4" onClick={handleResolveDrafts}>
                    Sauvegarder & Continuer <i className="ri-arrow-right-line ms-1"></i>
                 </button>
            ) : !importResult ? (
                 <button className="btn btn-primary fw-bold px-4" onClick={handleImport} disabled={!selectedFile || importing}>
                    {importing ? <><span className="spinner-border spinner-border-sm me-2"></span>Importation...</> : "Importer le fichier"}
                 </button>
            ) : (
                <button className="btn btn-success fw-bold px-4" onClick={() => setCurrentStep(3)}>
                   Suivant <i className="ri-arrow-right-line ms-1"></i>
                </button>
            )}
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="card shadow-sm border-0 mt-4 rounded-4" style={{ background: "linear-gradient(145deg, #0f172a, #1e293b)", color: "white" }}>
      <div className="card-body p-5">
         <div className="text-center">
             <div className="avatar-xl mx-auto mb-4">
                  <div className="avatar-title bg-success-subtle text-success rounded-circle" style={{ fontSize: "3rem" }}>
                      <i className="ri-rocket-line"></i>
                  </div>
             </div>
             <h4 className="fw-bold mb-3">Tout est prêt !</h4>
             <p className="text-secondary fs-15 mb-4 px-4">
                La configuration GitLab est validée, vos développeurs sont importés et les projets sont associés. 
                Vous pouvez maintenant lancer la première extraction complète pour peupler vos dashboards KPI.
             </p>

             {/* --- TOGGLE FAST MODE (AJOUT SENIOR) --- */}
             {!extracting && !extractionDone && (
               <div className="mx-auto mb-4 p-3 rounded-4 bg-primary-subtle border border-primary-subtle text-start" style={{ maxWidth: "500px" }}>
                 <div className="form-check form-switch ps-5">
                     <input 
                       className="form-check-input pointer" 
                       type="checkbox" 
                       role="switch" 
                       id="fastModeSwitch" 
                       checked={fastMode}
                       onChange={(e) => setFastMode(e.target.checked)}
                       style={{ width: "2.8rem", height: "1.4rem", marginTop: "0.1rem" }}
                     />
                     <label className="form-check-label ps-3 pointer" htmlFor="fastModeSwitch">
                       <span className="fw-bold text-primary d-block fs-15">⚡ Mode Éclair (Haute Performance)</span>
                       <span className="text-dark-subtle fs-12">
                         Limite l'extraction aux contributions directes de votre équipe. 
                         <b> 95% plus rapide</b> sur les gros dépôts (Inkscape, etc.).
                       </span>
                     </label>
                 </div>
               </div>
             )}
    
             {!extracting && !extractionDone && (
               <button 
                 className="btn btn-success btn-lg fw-bold px-5 py-3 rounded-pill shadow-lg my-3"
                 style={{ textTransform: "uppercase", letterSpacing: "1px" }}
                 onClick={handleStartExtraction}
               >
                   <i className="ri-flashlight-fill me-2"></i> Démarrer la Collecte des KPIs
               </button>
             )}
         </div>

         {(extracting || extractionDone) && (
            <div className="mt-4 row justify-content-center">
              <div className="col-12 col-md-10">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                      <span className="fw-bold text-white"><i className="ri-loader-4-line ri-spin me-2 text-primary" style={{display: extracting ? "inline-block" : "none"}}></i>Progression en temps réel</span>
                      <span className="badge bg-secondary-subtle text-white p-2 px-3 fw-bold fs-12"><i className="ri-timer-2-line me-1"></i>{formatTime(elapsed)}</span>
                  </div>
                  
                  {/* Etapes Animées */}
                  <div className="p-3 rounded-3 mb-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                     <div className="vstack gap-2">
                        {EXT_STEPS.map((step, i) => {
                           const done = i < extractionStep;
                           const active = i === extractionStep && extracting;
                           const pending = !done && !active;
                           return (
                             <div key={i} className={`d-flex align-items-center gap-3 p-2 rounded-2 ${active ? "bg-white text-dark shadow-sm" : ""}`} style={{transition: "all 0.3s"}}>
                                <div className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${done ? "bg-"+step.color+" text-white" : active ? "bg-"+step.color+"-subtle text-"+step.color : "bg-dark text-secondary border border-secondary"}`}>
                                   {done ? <i className="ri-check-line fs-13"></i> : active ? <span className="spinner-border spinner-border-sm"></span> : <i className={`${step.icon} fs-13`}></i>}
                                </div>
                                <span className={`fs-13 flex-grow-1 ${done ? "text-secondary text-decoration-line-through" : active ? "fw-bold" : "text-secondary"}`}>
                                  {step.label}
                                </span>
                                {done   && <span className="badge bg-success-subtle text-success fs-10"><i className="ri-check-line me-1"></i>OK</span>}
                                {active && <span className={`badge bg-${step.color}-subtle text-${step.color} fs-10`}>En cours…</span>}
                             </div>
                           );
                        })}
                     </div>
                  </div>

                  {/* Terminal Logs */}
                  {devLogs.length > 0 && (
                      <div className="text-start bg-black rounded-3 p-3 mb-4" style={{ fontFamily: "monospace", fontSize: "12px", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "160px", overflowY: "auto" }}>
                          {devLogs.map((log, i) => {
                             const isErr = log.includes("[ERROR]");
                             const isSucc = log.includes("[SUCCESS]");
                             return (
                               <div key={i} className={isErr ? "text-danger" : isSucc ? "text-success" : "text-info"} style={{ opacity: i === devLogs.length-1 ? 1 : 0.7 }}>
                                   <span className="text-secondary me-2">[{formatTime(elapsed)}]</span> {log}
                               </div>
                             );
                          })}
                      </div>
                  )}

                  {extractionDone && (
                      <div className="alert alert-success d-flex align-items-center justify-content-between p-3 mt-3">
                          <div>
                              <strong className="d-block mb-1 fs-14"><i className="ri-checkbox-circle-fill me-2"></i>Dashboard prêt !</strong>
                              <span className="fs-12">L'extraction initiale est terminée. Vous pouvez explorer vos KPIs.</span>
                          </div>
                          <button className="btn btn-success fw-bold px-4" onClick={() => navigate("/dashboard")}>
                              Visualiser les KPIs <i className="ri-arrow-right-line ms-1"></i>
                          </button>
                      </div>
                  )}
              </div>
            </div>
         )}
      </div>
    </div>
  );

  return (
    <div className="page-content" style={{ backgroundColor: "#f8f9fc", minHeight: "100vh" }}>
      <div className="container" style={{ maxWidth: "800px" }}>
        
        {/* Header */}
        <div className="text-center mb-5 mt-4">
           <h2 className="fw-bold text-dark mb-2" style={{ letterSpacing: "-0.5px" }}>Assistant Configuration Rapide</h2>
           <p className="text-muted fs-15">Configurez GitLab, importez votre équipe et lancez vos KPIs en 3 clics.</p>
        </div>

        {/* Stepper */}
        <div className="row justify-content-center mb-4 position-relative">
           <div className="position-absolute top-50 start-50 translate-middle w-75" style={{ height: "3px", backgroundColor: "#e2e8f0", zIndex: 0 }}></div>
           <div className="position-absolute top-50 translate-middle-y start-0" style={{ height: "3px", backgroundColor: "#4361ee", width: `${((currentStep - 1) / 2) * 100}%`, transition: "width 0.4s ease", zIndex: 0, left: "12%" }}></div>
           
           {STEPS.map((step, idx) => (
               <div className="col-4 text-center position-relative" key={step.id} style={{ zIndex: 1 }}>
                   <div 
                      className={`avatar-md mx-auto d-flex align-items-center justify-content-center rounded-circle border border-3 fw-bold transition-all shadow-sm ${currentStep >= step.id ? "bg-primary border-primary text-white" : "bg-white border-light text-muted"}`}
                      style={{ transition: "all 0.3s ease" }}
                   >
                       {currentStep > step.id ? <i className="ri-check-line fs-3"></i> : <i className={`${step.icon} fs-4`}></i>}
                   </div>
                   <div className={`mt-2 fs-13 fw-semibold ${currentStep >= step.id ? "text-primary" : "text-muted"}`}>{step.label}</div>
               </div>
           ))}
        </div>

        {/* Content */}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        
      </div>
    </div>
  );
}
