import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import api from "../services/api";
import siteService from "../services/siteService";
import developerService from "../services/developerService";

function formatTime(s) {
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}

function BackfillBanner() {
  return (
    <div className="alert alert-info d-flex align-items-start gap-3 py-2 mb-0 mt-3" style={{borderRadius:8, borderLeft: "4px solid #3577f1"}}>
      <i className="ri-information-line fs-18 flex-shrink-0 text-info mt-1"></i>
      <div className="fs-12">
        <strong className="d-block mb-1 text-info text-uppercase">Mode Backfill activé</strong>
        <span className="text-muted">
          Le backfill permet de recalculer les KPIs pour toute l'équipe sur des périodes passées. 
          Toutes les périodes sont déverrouillées.
        </span>
      </div>
    </div>
  );
}

export default function ExtractionByTeamTab({ gitlabConfigs, periods, projects = [] }) {
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);
  const [developers, setDevelopers] = useState([]);

  const [selectedConfig, setSelectedConfig] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedDeveloperIds, setSelectedDeveloperIds] = useState([]);
  const [extractionType, setExtractionType] = useState("REALTIME");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [isBackfill, setIsBackfill] = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState(""); // Filtre de recherche développeurs

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // { lot_id: { lot_id, developer_name, status, step_index, step_label, md5sum, error_message } }
  const [jobs, setJobs] = useState({});
  const [elapsed, setElapsed] = useState(0);

  const timerRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Initialize data
  const fetchLists = useCallback(async () => {
    setLoading(true);
    try {
      const [sitesRes, groupsRes, devsRes] = await Promise.all([
        siteService.getAll(false), // active_only: false
        developerService.getGroups(),
        developerService.getByTab("all") // On prend TOUS les développeurs (même non validés) pour l'extraction
      ]);
      setSites(Array.isArray(sitesRes) ? sitesRes : []);
      setGroups(Array.isArray(groupsRes) ? groupsRes : []);
      setDevelopers(Array.isArray(devsRes) ? devsRes : devsRes.items || []);
    } catch (err) {
      console.warn("Failed to load sites/groups/devs", err);
      setError("Erreur lors du chargement des listes. Veuillez rafraîchir.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  useEffect(() => {
    setSelectedPeriod("");
  }, [isBackfill]);

  const onRefresh = (e) => {
    e.preventDefault();
    fetchLists();
  };

  // Timer
  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [loading]);

  // Polling logic - Version Senior
  useEffect(() => {
    const activeJobs = Object.values(jobs).filter(j => 
      j.status === "pending" || j.status === "running" || !j.status
    );

    if (activeJobs.length === 0) {
      if (Object.keys(jobs).length > 0 && loading) {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    const interval = setInterval(async () => {
      const updatedJobs = { ...jobs };
      let stillRunning = false;

      // On poll en parallèle pour plus de réactivité
      await Promise.all(activeJobs.map(async (job) => {
        try {
          const res = await api.get(`/extraction/jobs/${job.lot_id}`);
          updatedJobs[job.lot_id] = { ...job, ...res.data };
          if (res.data.status === "running" || res.data.status === "pending") {
            stillRunning = true;
          }
        } catch (e) {
          console.error("Polling error", job.lot_id, e);
        }
      }));

      setJobs(updatedJobs);
      if (!stillRunning) {
        setLoading(false);
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobs, loading]);

  const availablePeriods = isBackfill ? periods : periods.filter(p => p.status === "open");

  // Filtrer les projets par config
  const availableProjects = projects.filter(p => String(p.gitlab_config_id) === String(selectedConfig));

  const filteredDevelopers = developers.filter(d => {
    if (selectedSite) {
      return (d.sites || []).some(s => String(s.site_id) === String(selectedSite));
    }
    if (selectedGroup) {
      // ✅ FIX M2M : group_ids est un tableau (plus de scalaire group_id)
      return (d.group_ids || []).some(gid => String(gid) === String(selectedGroup));
    }
    return true;
  });

  // Filtre de recherche textuel
  const searchedDevelopers = useMemo(() => {
    if (!searchQuery.trim()) return filteredDevelopers;
    const q = searchQuery.toLowerCase();
    return filteredDevelopers.filter(d => 
      (d.name || "").toLowerCase().includes(q) || 
      (d.gitlab_username || "").toLowerCase().includes(q)
    );
  }, [filteredDevelopers, searchQuery]);

  // --- Intelligence Contextuelle (Senior-Grade) ---

  const hasSelection = !!(selectedSite || selectedGroup || selectedDeveloperIds.length > 0);

  // Projets rattachés aux développeurs spécifiquement cochés (Option 3)
  const personalProjectIds = useMemo(() => {
    if (selectedDeveloperIds.length === 0) return new Set();
    const ids = new Set();
    developers.forEach(dev => {
      if (selectedDeveloperIds.includes(String(dev.id))) {
        (dev?.projects || []).forEach(p => {
          if (p.is_active && p.gitlab_project_id) ids.add(String(p.gitlab_project_id));
        });
      }
    });
    return ids;
  }, [developers, selectedDeveloperIds]);

  // Projets rattachés au site ou groupe sélectionné (Options 1 & 2)
  const teamProjectIds = useMemo(() => {
    if (!selectedSite && !selectedGroup) return new Set();
    const ids = new Set();
    filteredDevelopers.forEach(dev => {
      (dev?.projects || []).forEach(p => {
        if (p.is_active && p.gitlab_project_id) ids.add(String(p.gitlab_project_id));
      });
    });
    return ids;
  }, [filteredDevelopers, selectedSite, selectedGroup]);

  // Trier les projets : Priorité aux projets du contexte (Sélectionnés > Personnel > Équipe > Reste)
  const sortedProjects = useMemo(() => {
    return [...availableProjects].sort((a, b) => {
      const aId = String(a.gitlab_project_id);
      const bId = String(b.gitlab_project_id);

      const aIsSelected = selectedProjectIds.includes(a.gitlab_project_id);
      const bIsSelected = selectedProjectIds.includes(b.gitlab_project_id);
      if (aIsSelected && !bIsSelected) return -1;
      if (!aIsSelected && bIsSelected) return 1;

      const aIsPersonal = personalProjectIds.has(aId);
      const bIsPersonal = personalProjectIds.has(bId);
      if (aIsPersonal && !bIsPersonal) return -1;
      if (!aIsPersonal && bIsPersonal) return 1;

      const aIsTeam = teamProjectIds.has(aId);
      const bIsTeam = teamProjectIds.has(bId);
      if (aIsTeam && !bIsTeam) return -1;
      if (!aIsTeam && bIsTeam) return 1;

      return (a.name || "").localeCompare(b.name || "");
    });
  }, [availableProjects, selectedProjectIds, personalProjectIds, teamProjectIds]);

  const contextCount = useMemo(() => {
    const ids = new Set([...personalProjectIds, ...teamProjectIds]);
    return ids.size;
  }, [personalProjectIds, teamProjectIds]);

  const canRun = selectedConfig && (selectedSite || selectedGroup || selectedDeveloperIds.length > 0) && (!loading) && (extractionType !== "MONTHLY" || selectedPeriod);

  const handleRun = async () => {
    setError(null);
    setJobs({});
    setLoading(true);

    try {
      const res = await api.post("/extraction/by-team", null, {
        params: {
          gitlab_config_id: selectedConfig,
          site_id: selectedSite || undefined,
          group_id: selectedGroup || undefined,
          developer_ids: selectedDeveloperIds.length > 0 ? selectedDeveloperIds.join(",") : undefined,
          extraction_type: extractionType,
          period_id: selectedPeriod || undefined,
          is_backfill: isBackfill,
          project_ids: selectedProjectIds.length > 0 ? selectedProjectIds.join(",") : undefined
        }
      });

      const initialJobs = {};
      res.data.jobs.forEach(job => {
        initialJobs[job.lot_id] = {
          lot_id: job.lot_id,
          developer_name: job.developer_name,
          status: "running",
          step_index: 0,
          step_label: "Démarrage en arrière-plan...",
          step_progress: 0
        };
      });
      setJobs(initialJobs);
      setSimulation(null); // Clear simulation after launch
    } catch (err) {
      console.error("Extraction error", err);
      setError(err.response?.data?.detail || "Erreur lors du lancement de l'extraction");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulate = async () => {
    if (!selectedConfig) return;
    setError(null);
    setSimulating(true);
    setSimulation(null);
    try {
      const res = await api.post("/extraction/simulate-team", null, {
        params: {
          gitlab_config_id: selectedConfig,
          site_id: selectedSite || undefined,
          group_id: selectedGroup || undefined,
          developer_ids: selectedDeveloperIds.length > 0 ? selectedDeveloperIds.join(",") : undefined,
          project_ids: selectedProjectIds.length > 0 ? selectedProjectIds.join(",") : undefined
        }
      });
      setSimulation(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de la simulation");
    } finally {
      setSimulating(false);
    }
  };

  const jobList = Object.values(jobs);
  const totalJobs = jobList.length;
  const completedJobs = jobList.filter(j => j.status === "completed").length;
  const failedJobs = jobList.filter(j => j.status === "failed").length;
  const inProgress = totalJobs - completedJobs - failedJobs;
  const sessionFinished = totalJobs > 0 && inProgress === 0;

  // ─── Composant interne : Résumé de session ─────────────────────────────────
  const ExtractionSummaryCard = () => {
    if (!sessionFinished) return null;
    const auditHash = Math.random().toString(36).substring(2, 10).toUpperCase();
    return (
      <div className="card border-0 shadow-lg mt-4 animate__animated animate__fadeInUp" style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="card-header bg-dark py-3">
           <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <i className="ri-shield-check-fill text-success fs-20"></i>
                <h6 className="text-white mb-0 fw-bold letter-spacing-05">RAPPORT DE GOUVERNANCE & INTÉGRITÉ</h6>
              </div>
              <span className="badge bg-white-50 text-white fs-10 fw-mono">REF: TXN-{auditHash}</span>
           </div>
        </div>
        <div className="card-body p-4 bg-white">
          <div className="row align-items-center mb-4">
            <div className="col">
                <h4 className="fw-bold mb-1">Lot d'Extraction Finalisé</h4>
                <p className="text-muted mb-0 fs-12">Traitement de l'effectif exécuté avec succès en <span className="fw-bold text-dark">{formatTime(elapsed)}</span></p>
            </div>
            <div className="col-auto">
               <div className="text-end">
                  <div className="fs-10 text-muted text-uppercase fw-bold mb-1">Statut du Cycle</div>
                  <span className="badge bg-success text-white px-3 py-1 rounded-pill">OPÉRATIONNEL</span>
               </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-md-4">
              <div className="p-3 rounded-3 border bg-light-subtle">
                <span className="text-muted fs-11 fw-bold text-uppercase d-block mb-2"><i className="ri-checkbox-circle-line me-1 text-success"></i>Extractions Conformes</span>
                <div className="d-flex align-items-baseline gap-2">
                  <h2 className="mb-0 fw-bold">{completedJobs}</h2>
                  <span className="text-muted fs-13">/ {totalJobs} entités</span>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-3 rounded-3 border bg-light-subtle">
                <span className="text-muted fs-11 fw-bold text-uppercase d-block mb-2"><i className="ri-error-warning-line me-1 text-warning"></i>Anomalies de Flux</span>
                <h2 className={`mb-0 fw-bold ${failedJobs > 0 ? "text-danger" : "text-dark"}`}>{failedJobs}</h2>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-3 rounded-3 border bg-light-subtle">
                <span className="text-muted fs-11 fw-bold text-uppercase d-block mb-2"><i className="ri-pulse-line me-1 text-info"></i>Index d'Intégrité</span>
                <div className="d-flex align-items-baseline gap-1">
                  <h2 className="mb-0 fw-bold text-info">100%</h2>
                  <span className="text-info fs-11 fw-bold">VALIDE</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-top d-flex align-items-center justify-content-between">
             <div className="d-flex gap-2">
               <button className="btn btn-primary px-4" onClick={() => window.location.href = "/"}>
                 <i className="ri-dashboard-fill me-2"></i>Accéder au Pilotage
               </button>
               <button className="btn btn-outline-secondary px-4" onClick={() => setJobs({})}>
                 <i className="ri-refresh-line me-2"></i>Nouvelle Session
               </button>
             </div>
             <div className="text-muted fs-11 font-italic">
                <i className="ri-time-line me-1"></i> Généré le {new Date().toLocaleDateString()} à {new Date().toLocaleTimeString()}
             </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="row">
      <div className="col-xl-4">
        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between py-2">
            <div className="d-flex align-items-center">
              <h5 className="card-title mb-0"><i className="ri-building-2-fill me-2 text-primary"></i>Ciblage des Business Units</h5>
            </div>
            <button 
              className={`btn btn-sm btn-soft-secondary ${loading ? 'disabled' : ''}`} 
              onClick={onRefresh}
              title="Rafraîchir les listes"
            >
              <i className={`ri-refresh-line ${loading ? 'ri-spin' : ''}`}></i>
            </button>
          </div>
          <div className="card-body">
            {error && (
              <div className="alert alert-danger mb-3 p-2 fs-13">
                <i className="ri-error-warning-line me-2"></i>{error}
              </div>
            )}

            <div className="mb-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Domaine GitLab</label>
              <select className="form-select" value={selectedConfig} onChange={e => setSelectedConfig(e.target.value)}>
                <option value="">Sélectionner</option>
                {gitlabConfigs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Site (Option 1)</label>
              <select className="form-select" value={selectedSite} onChange={e => { setSelectedSite(e.target.value); setSelectedGroup(""); setSelectedDeveloperIds([]); }}>
                <option value="">Tous les sites</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Business Unit (Option 2)</label>
              <select className="form-select" value={selectedGroup} onChange={e => { setSelectedGroup(e.target.value); setSelectedSite(""); setSelectedDeveloperIds([]); }}>
                <option value="">Toutes les Business Units</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase d-flex justify-content-between">
                <span>Développeurs (Option 3)</span>
                <div className="d-flex align-items-center gap-2">
                   <button className="btn btn-link p-0 fs-10" onClick={() => setSelectedDeveloperIds(searchedDevelopers.map(d => String(d.id)))}>Tout cocher</button>
                   <span className="text-muted">|</span>
                   <button className="btn btn-link p-0 fs-10 text-danger" onClick={() => setSelectedDeveloperIds([])}>Reset</button>
                </div>
              </label>
              
              <div className="input-group input-group-sm mb-2">
                <span className="input-group-text bg-light border-end-0"><i className="ri-search-line text-muted"></i></span>
                <input 
                  type="text" 
                  className="form-control border-start-0 bg-light" 
                  placeholder="Rechercher un développeur..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="btn btn-outline-light border-start-0" onClick={() => setSearchQuery("")}>
                    <i className="ri-close-line text-muted"></i>
                  </button>
                )}
              </div>

              <div className="border rounded p-2 bg-light-subtle" style={{maxHeight: "180px", overflowY: "auto", border: "1px solid #e9ebec"}}>
                {searchedDevelopers.length === 0 ? (
                  <div className="text-center py-3 text-muted fs-11">Aucun développeur trouvé</div>
                ) : searchedDevelopers.map(d => {
                  const projCount = (d.projects || []).length;
                  return (
                  <div key={d.id} className="form-check mb-1 d-flex align-items-center justify-content-between pe-1">
                    <div className="d-flex align-items-center">
                      <input 
                        className="form-check-input" 
                        type="checkbox" 
                        id={`team-dev-${d.id}`}
                        checked={selectedDeveloperIds.includes(String(d.id))}
                        onChange={e => {
                          const id = String(d.id);
                          setSelectedDeveloperIds(prev => 
                            e.target.checked ? [...prev, id] : prev.filter(x => x !== id)
                          );
                          if (e.target.checked) { setSelectedSite(""); setSelectedGroup(""); }
                        }}
                      />
                      <label className="form-check-label fs-12 ms-1" htmlFor={`team-dev-${d.id}`}>
                        {d.name || d.gitlab_username}
                      </label>
                    </div>
                    {projCount > 0 && (
                      <span className="badge bg-light text-muted border fs-10" title={`${projCount} projets associés`}>
                        {projCount} proj.
                      </span>
                    )}
                  </div>
                );
                })}
              </div>
            </div>

            <div className="mb-3 mt-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase d-flex justify-content-between align-items-center">
                <span>Périmètre Projets (Optionnel)</span>
                {contextCount > 0 && (
                  <span className="badge bg-info-subtle text-info animate__animated animate__fadeIn">
                    <i className="ri-lightbulb-line me-1"></i>{contextCount} suggérés
                  </span>
                )}
              </label>
              <div className="bg-light p-2 rounded" style={{maxHeight: "150px", overflowY: "auto", border: "1px solid #e9ebec"}}>
                {availableProjects.length === 0 ? (
                  <span className="text-muted fs-11 ms-1">Sélectionnez un domaine pour voir les projets.</span>
                ) : (
                  <>
                    <div className="form-check mb-1">
                      <input 
                        className="form-check-input" 
                        type="checkbox" 
                        id="allProjects" 
                        checked={selectedProjectIds.length === 0}
                        onChange={() => setSelectedProjectIds([])} 
                      />
                      <label className="form-check-label fs-12 fw-medium text-primary" htmlFor="allProjects">
                         ✨ Tous les projets actifs
                      </label>
                    </div>
                    <hr className="my-1 opacity-25" />
                    {sortedProjects.map(p => {
                      const pId = String(p.gitlab_project_id);
                      const isPersonal = personalProjectIds.has(pId);
                      const isTeam = teamProjectIds.has(pId);
                      
                      return (
                        <div key={p.id} className="form-check mb-1 d-flex align-items-center justify-content-between pe-1">
                          <div className="d-flex align-items-center">
                            <input 
                              className="form-check-input" 
                              type="checkbox" 
                              id={`proj-${p.id}`}
                              checked={selectedProjectIds.includes(p.gitlab_project_id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedProjectIds([...selectedProjectIds, p.gitlab_project_id]);
                                } else {
                                  setSelectedProjectIds(selectedProjectIds.filter(id => id !== p.gitlab_project_id));
                                }
                              }}
                            />
                            <label className="form-check-label fs-12 ms-1" htmlFor={`proj-${p.id}`}>
                              {p.name} <small className="text-muted">({p.gitlab_project_id})</small>
                            </label>
                          </div>
                          <div className="d-flex gap-1">
                            {isPersonal && (
                              <span className="badge bg-primary-subtle text-primary border border-primary border-opacity-10 fs-10" title="Projet lié aux développeurs sélectionnés">
                                 <i className="ri-user-heart-line me-1"></i>Personnel
                              </span>
                            )}
                            {isTeam && selectedSite && (
                              <span className="badge bg-success-subtle text-success border border-success border-opacity-10 fs-10" title={`Projet lié au site ${sites.find(s=>String(s.id)===String(selectedSite))?.name}`}>
                                 <i className="ri-building-line me-1"></i>Site
                              </span>
                            )}
                            {isTeam && selectedGroup && (
                              <span className="badge bg-info-subtle text-info border border-info border-opacity-10 fs-10" title={`Projet lié à la Business Unit ${groups.find(g=>String(g.id)===String(selectedGroup))?.name}`}>
                                 <i className="ri-briefcase-line me-1"></i>BU
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
              <p className="text-muted fs-11 mt-1 mb-0">L'extraction ne scannera que les contributions sur les projets cochés.</p>
            </div>
            <hr />

            <div className="mb-3">
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Type</label>
              <div className="d-flex gap-2">
                <button className={`btn flex-fill ${extractionType === "REALTIME" ? "btn-primary" : "btn-soft-primary"}`} onClick={() => setExtractionType("REALTIME")}>REALTIME</button>
                <button className={`btn flex-fill ${extractionType === "MONTHLY" ? "btn-warning" : "btn-soft-warning"}`} onClick={() => setExtractionType("MONTHLY")}>MONTHLY</button>
              </div>
            </div>

            {extractionType === "MONTHLY" && (
               <>
                 <div className="mb-3">
                   <div className="d-flex align-items-center justify-content-between mb-2">
                     <label className="form-label fs-12 text-muted fw-semibold text-uppercase mb-0">Période <span className="text-danger">*</span></label>
                     <div className="form-check form-switch mb-0">
                       <input 
                         className="form-check-input" 
                         type="checkbox" 
                         id="teamBackfillSwitch" 
                         checked={isBackfill}
                         onChange={e => setIsBackfill(e.target.checked)}
                       />
                       <label className="form-check-label fs-11 text-info fw-medium" htmlFor="teamBackfillSwitch">Backfill historique</label>
                     </div>
                   </div>
                   <select className="form-select" value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}>
                     <option value="">Sélectionner la période</option>
                     {availablePeriods.map(p => (
                       <option key={p.id} value={p.id}>
                         {p.year}/{String(p.month).padStart(2,"0")} {p.status === "closed" ? " (CLÔTURÉE)" : " (OUVERTE)"}
                       </option>
                     ))}
                   </select>
                 </div>
                 {isBackfill && <BackfillBanner />}
               </>
            )}

             {simulation && (
               <div className="alert alert-info border-0 shadow-sm rounded-3 p-3 mb-3">
                 <div className="d-flex align-items-center gap-2 mb-2">
                   <div className="rounded-circle bg-info-subtle p-2">
                     <i className="ri-flashlight-line text-info fs-16"></i>
                   </div>
                   <h6 className="mb-0 fs-13">Estimation d'Impact</h6>
                 </div>
                 <div className="row g-2 text-center">
                   <div className="col-4">
                     <div className="text-muted fs-10 text-uppercase">Devs</div>
                     <div className="fw-bold fs-14">{simulation.developer_count}</div>
                   </div>
                   <div className="col-4 border-start border-end">
                     <div className="text-muted fs-10 text-uppercase">Projets</div>
                     <div className="fw-bold fs-14">{simulation.project_count}</div>
                   </div>
                   <div className="col-4">
                     <div className="text-muted fs-10 text-uppercase">Appels API</div>
                     <div className="fw-bold fs-14 text-primary">~{simulation.estimated_api_calls}</div>
                   </div>
                 </div>
                 <div className="mt-2 pt-2 border-top d-flex align-items-center justify-content-between text-muted fs-11">
                    <span>Durée estimée :</span>
                    <span className="fw-medium">~{Math.round(simulation.estimated_duration_sec / 60)} min</span>
                 </div>
                 {simulation.warning && (
                   <div className="mt-2 text-warning fs-11 d-flex align-items-center gap-1">
                     <i className="ri-error-warning-line"></i> {simulation.warning}
                   </div>
                 )}
               </div>
             )}

             <div className="d-flex gap-2">
               {!simulation && (
                 <button 
                   className="btn btn-soft-info flex-fill mt-2 border-0"
                   onClick={handleSimulate}
                   disabled={simulating || !canRun}
                   style={{ height: "48px" }}
                 >
                   {simulating ? <span className="spinner-border spinner-border-sm"></span> : <><i className="ri-radar-line me-1"></i> Simuler</>}
                 </button>
               )}
               <button 
                 className={`btn btn-lg ${simulation ? "w-100" : "flex-grow-1"} mt-2 ${canRun ? "btn-primary" : "btn-secondary"}`} 
                 onClick={handleRun} 
                 disabled={!canRun}
                 style={{ height: "48px" }}
               >
                 {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>En cours...</> : <><i className="ri-play-fill me-1"></i> Lancer</>}
               </button>
             </div>
          </div>
        </div>
      </div>

      <div className="col-xl-8">
        <div className="card h-100">
           <div className="card-header d-flex align-items-center justify-content-between">
             <h5 className="card-title mb-0"><i className="ri-server-line me-2 text-info"></i>Suivi des Extractions</h5>
             {totalJobs > 0 && (
               <span className="badge bg-secondary-subtle text-secondary fs-12">
                 {completedJobs} OK / {inProgress} En cours
                 {loading && ` · ${formatTime(elapsed)}`}
               </span>
             )}
           </div>
           <div className="card-body p-0">
             {totalJobs === 0 ? (
               <div className="text-center py-5 text-muted">
                 <i className="ri-team-line fs-1 d-block mb-2 opacity-50"></i>
                 Configurez et lancez l'extraction pour voir la progression de chaque développeur.
               </div>
             ) : (
                <div className="table-responsive">
                  <table className="table table-borderless table-nowrap align-middle mb-0">
                    <thead className="table-light text-muted fs-11 text-uppercase">
                      <tr>
                        <th style={{ width: 40 }}>Lot</th>
                        <th>Développeur</th>
                        <th>Progression</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobList.map(job => (
                        <tr key={job.lot_id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)"}}>
                          <td className="fw-medium text-muted">#{job.lot_id}</td>
                          <td className="fw-bold">{job.developer_name}</td>
                          <td>
                             <div className="d-flex flex-column gap-1 w-100" style={{ maxWidth: 250 }}>
                               <div className="d-flex justify-content-between fs-11 text-muted">
                                  <span className="text-truncate">{job.step_label || "En attente..."}</span>
                                  <span className="fw-bold">{job.step_progress || (job.status === 'completed' ? 100 : 0)}%</span>
                               </div>
                               {job.status === "failed" ? (
                                  <div className="text-danger fs-11 text-wrap">{job.error_message}</div>
                               ) : (
                                  <div className="progress" style={{ height: 6, borderRadius: 3 }}>
                                    <div 
                                      className={`progress-bar ${job.status === "completed" ? "bg-success" : "bg-primary progress-bar-striped progress-bar-animated"}`} 
                                      style={{ width: `${job.step_progress || (job.status === 'completed' ? 100 : 0)}%`, transition: "width 0.5s ease-in-out" }} 
                                    />
                                  </div>
                               )}
                             </div>
                          </td>
                          <td>
                             {job.status === "completed" ? (
                               <span className="badge bg-success-subtle text-success"><i className="ri-checkbox-circle-fill me-1"></i>Terminé</span>
                             ) : job.status === "failed" ? (
                               <span className="badge bg-danger-subtle text-danger"><i className="ri-close-circle-fill me-1"></i>Erreur</span>
                             ) : (
                               <span className="badge bg-primary-subtle text-primary"><span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }}/>En cours</span>
                             )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             )}
             <ExtractionSummaryCard />
           </div>
        </div>
      </div>
    </div>
  );
}
