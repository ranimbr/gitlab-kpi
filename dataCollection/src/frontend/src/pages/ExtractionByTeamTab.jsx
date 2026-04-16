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

  // Polling logic
  useEffect(() => {
    const activeLotIds = Object.values(jobs)
      .filter(j => j.status === "pending" || j.status === "running" || !j.status)
      .map(j => j.lot_id);

    if (activeLotIds.length > 0) {
      setLoading(true);
      const poll = async () => {
        let allDone = true;
        for (const lotId of activeLotIds) {
          try {
            const res = await api.get(`/extraction/jobs/${lotId}`);
            setJobs(prev => ({
              ...prev,
              [lotId]: { ...prev[lotId], ...res.data }
            }));
            if (res.data.status !== "completed" && res.data.status !== "failed") {
              allDone = false;
            }
          } catch (e) {
            console.error("Polling error lot", lotId, e);
          }
        }
        if (allDone) {
          setLoading(false);
          clearInterval(pollTimerRef.current);
        }
      };

      pollTimerRef.current = setInterval(poll, 2000);
    } else if (Object.keys(jobs).length > 0 && loading) {
       setLoading(false);
    }

    return () => clearInterval(pollTimerRef.current);
  // [FIX-POLLING] `loading` retiré des deps : sa présence causait une recréation
  // de l'intervalle à chaque setLoading() appelé dans poll() → boucle infinie
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  const availablePeriods = isBackfill ? periods : periods.filter(p => p.status === "open");

  // Filtrer les projets par config
  const availableProjects = projects.filter(p => String(p.gitlab_config_id) === String(selectedConfig));

  const filteredDevelopers = developers.filter(d => {
    if (selectedSite) {
      return (d.sites || []).some(s => String(s.site_id) === String(selectedSite));
    }
    if (selectedGroup) {
      return String(d.group_id) === String(selectedGroup);
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

  // Intelligence Senior : Identifier les projets où l'équipe est officiellement active
  const teamProjectIds = useMemo(() => {
    const ids = new Set();
    filteredDevelopers.forEach(dev => {
      (dev?.projects || []).forEach(p => {
        if (p.is_active && p.gitlab_project_id) ids.add(String(p.gitlab_project_id));
      });
    });
    return ids;
  }, [filteredDevelopers]);

  // Trier les projets : les projets de l'équipe en premier
  const sortedProjects = useMemo(() => {
    return [...availableProjects].sort((a, b) => {
      const aIsTeam = teamProjectIds.has(a.gitlab_project_id);
      const bIsTeam = teamProjectIds.has(b.gitlab_project_id);
      if (aIsTeam && !bIsTeam) return -1;
      if (!aIsTeam && bIsTeam) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [availableProjects, teamProjectIds]);

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
          step_label: "Démarrage en arrière-plan..."
        };
      });
      setJobs(initialJobs);

    } catch (err) {
      let msg = "Impossible de lancer l'extraction.";
      if (err.response?.data?.detail) msg = err.response.data.detail;
      setError(msg);
      setLoading(false);
    }
  };

  const jobList = Object.values(jobs);
  const totalJobs = jobList.length;
  const completedJobs = jobList.filter(j => j.status === "completed").length;
  const failedJobs = jobList.filter(j => j.status === "failed").length;
  const inProgress = totalJobs - completedJobs - failedJobs;

  return (
    <div className="row">
      <div className="col-xl-4">
        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between py-2">
            <div className="d-flex align-items-center">
              <h5 className="card-title mb-0"><i className="ri-team-fill me-2 text-primary"></i>Ciblage Équipe</h5>
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
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Groupe (Option 2)</label>
              <select className="form-select" value={selectedGroup} onChange={e => { setSelectedGroup(e.target.value); setSelectedSite(""); setSelectedDeveloperIds([]); }}>
                <option value="">Tous les groupes</option>
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
              <label className="form-label fs-12 text-muted fw-semibold text-uppercase">Périmètre Projets (Optionnel)</label>
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
                      const isTeamProject = teamProjectIds.has(String(p.gitlab_project_id));
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
                          {isTeamProject && (
                            <span className="badge bg-success-subtle text-success border border-success border-opacity-10 fs-10" title="Projet où l'équipe est officiellement assignée">
                               <i className="ri-focus-3-line me-1"></i>🎯 Équipe
                            </span>
                          )}
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

            <button 
              className={`btn btn-lg w-100 mt-2 ${canRun ? "btn-primary" : "btn-secondary"}`} 
              onClick={handleRun} 
              disabled={!canRun}
            >
              {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>En cours...</> : <><i className="ri-play-fill me-2"></i>Lancer pour l'équipe</>}
            </button>
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
                               </div>
                               {job.status === "failed" ? (
                                  <div className="text-danger fs-11 text-wrap">{job.error_message}</div>
                               ) : (
                                  <div className="progress" style={{ height: 4 }}>
                                    <div 
                                      className={`progress-bar ${job.status === "completed" ? "bg-success" : "bg-primary progress-bar-striped progress-bar-animated"}`} 
                                      style={{ width: `${Math.min(((job.step_index + 1) / 5) * 100, 100)}%` }} 
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
           </div>
        </div>
      </div>
    </div>
  );
}
