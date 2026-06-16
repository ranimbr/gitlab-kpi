/**
 * pages/admin/ExtractionLotsPage.jsx
 *
 * SENIOR++++ ELITE OVERHAUL (v3):
 *   1. Full visual parity with AuditLogPage (Atlassian/GitLab/Slack style).
 *   2. Shared UserAvatar logic for 100% consistency.
 *   3. Modern Dashboard-style Statistics Hub with Trends.
 *   4. Improved Table layout with high-density information.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate }     from "react-router-dom";
import AdminModal      from "../../components/common/AdminModal";
import projectService       from "../../services/projectService";
import { extractionService, extractionLotService } from "../../services";
import periodService        from "../../services/periodService";
import developerService     from "../../services/developerService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState     from "../../components/common/EmptyState";
import StatusBadge    from "../../components/common/StatusBadge";
import Pagination     from "../../components/common/Pagination";
import api            from "../../services/api";
import UserAvatar     from "../../components/common/UserAvatar";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

// ── Formatters ─────────────────────────────────────────────────────────────
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

// ── Shared UI Components (Elite Style) ──────────────────────────────────────

/* ── Cellule Projet ── */
function ProjectCell({ lot, projectName }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <div className="avatar-xs rounded bg-primary-subtle text-primary d-flex align-items-center justify-content-center" style={{ width: 28, height: 28 }}>
         <i className="ri-gitlab-line fs-14"></i>
      </div>
      <div>
        <div className="fw-bold fs-13 text-dark">{projectName}</div>
        <div className="fs-10 text-muted text-uppercase fw-bold ls-1">Project ID: #{lot.project_id}</div>
        {lot.source_filename && (
          <div className="d-flex align-items-center gap-1 mt-1">
            <i className="ri-file-zip-line text-warning" style={{ fontSize: 10 }}></i>
            <span className="badge bg-warning-subtle text-warning border-0 px-1 py-0" style={{ fontSize: 9, fontFamily: 'monospace', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }} title={lot.source_filename}>
              {lot.source_filename}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function DevCell({ lot }) {
  const dev     = lot.developer;
  const devName = dev?.name || dev?.gitlab_username;

  // Si c'est un lot projet (Mission), on affiche le Facepile
  if (!devName) {
    // ✅ SENIOR: La liste est désormais fournie directement par le backend !
    const rawMembers = lot.project_members || [];
    const projectMembers = Array.isArray(rawMembers) ? rawMembers : (rawMembers?.items || []);
    
    const displayMembers = projectMembers.slice(0, 6);
    const remaining      = projectMembers.length - displayMembers.length;

    return (
      <div className="d-flex align-items-center gap-3">
        <div className="avatar-group d-flex align-items-center">
          {displayMembers.map((m, i) => (
            <div key={i} className="avatar-group-item" style={{ marginLeft: i === 0 ? 0 : -12, zIndex: 10 - i }}>
               <UserAvatar 
                 name={m.name || m.gitlab_username} 
                 size={28} 
                 border={true}
                 title={m.name || m.gitlab_username} // Hover effect
               />
            </div>
          ))}
          {remaining > 0 && (
            <div className="avatar-group-item" style={{ marginLeft: -12, zIndex: 0 }}>
               <div className="avatar-xs rounded-circle bg-light text-muted border border-2 border-white d-flex align-items-center justify-content-center shadow-sm fw-bold" 
                    style={{ width: 28, height: 28, fontSize: 10 }}>
                  +{remaining}
               </div>
            </div>
          )}
          {projectMembers.length === 0 && (
            <div className="avatar-xs rounded-circle bg-secondary-subtle text-secondary d-flex align-items-center justify-content-center" style={{ width: 28, height: 28 }}>
               <i className="ri-group-line fs-12"></i>
            </div>
          )}
        </div>

        <div>
          <div className="fs-13 fw-bold text-dark ls-sm" style={{ lineHeight: 1.2 }}>Team Mission</div>
          <div className="d-flex align-items-center gap-1">
             <span className="badge bg-soft-info text-info border-0 p-0 fs-10 fw-medium">
               {projectMembers.length} Contributors
             </span>
             <i className="ri-checkbox-circle-fill text-success" style={{ fontSize: 10 }}></i>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex align-items-center gap-2">
      <UserAvatar name={devName} size={32} />
      <div>
        <div className="fs-13 fw-bold text-dark">{devName}</div>
        {dev?.gitlab_username && (
          <div className="fs-10 text-muted opacity-75">@{dev.gitlab_username}</div>
        )}
      </div>
    </div>
  );
}

/* ── Cellule Déclenché par ── */
function TriggeredByCell({ lot }) {
  const user = lot.triggered_by_user;
  const isSystem = !lot.triggered_by && !user;
  
  // Amélioration: essayer name, puis email, puis login, puis ID
  let displayName = isSystem ? "Scheduler" : (
    user?.name || 
    user?.email || 
    user?.login || 
    `Utilisateur #${lot.triggered_by}`
  );

  return (
    <div className="d-flex align-items-center gap-2">
      <UserAvatar name={displayName} isSystem={isSystem} size={28} />
      <span className="fs-13 fw-semibold text-dark">{displayName}</span>
    </div>
  );
}

/* ── MD5 Cell ── */
function Md5Cell({ lot }) {
  const [copied, setCopied] = useState(false);
  if (!lot.md5sum) return <span className="text-muted fs-12 opacity-50">—</span>;
  
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(lot.md5sum);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div 
      className={`d-inline-flex align-items-center gap-1 badge ${copied ? "bg-success" : "bg-light text-muted border"} px-2 py-1 cursor-pointer transition-all`}
      onClick={copy}
      title={lot.md5sum}
      style={{ fontSize: 10, fontFamily: "monospace" }}
    >
      <i className={copied ? "ri-check-line" : "ri-shield-check-line text-success"}></i>
      {copied ? "COPIÉ" : lot.md5sum.slice(0, 8)}
    </div>
  );
}

// ── Modale de Détails Inspecteur ───────────────────────────────────────────
function LotDetailModal({ lot, onClose, onRetry, retrying }) {
  if (!lot) return null;

  const isRunning = lot.status === "running";
  const isFailed  = lot.status === "failed";
  const progress  = lot.step_progress || 0;
  const statusColor = isFailed ? "danger" : (isRunning ? "info" : "success");
  const isLoadingMembers = lot.isLoadingMembers; // Passé via parent

  // ✅ RECHERCHE DE L'ÉQUIPE (SENIOR INSPECTION)
  const rawMembers = lot.project_id ? (lot.project_members || []) : [];
  const projectMembers = Array.isArray(rawMembers) ? rawMembers : (rawMembers?.items || []);
  
  // ✅ SENIOR FALLBACK: Si items_count est à 0, on additionne commits + MRs (calculés par l'API)
  const totalItems = lot.items_count || ((lot.commit_count || 0) + (lot.mr_count || 0)) || 0;
  
  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title="Inspection de Flux"
      subtitle={`Lot ID: #${lot.id} · Collecte GitLab`}
      icon="ri-pulse-line"
      iconBg={`bg-${statusColor}-subtle`}
      iconColor={`text-${statusColor}`}
      maxWidth={600}
      footer={
        <div className="d-flex gap-2 w-100 justify-content-end">
          <button className="btn btn-light px-4 border fs-13 fw-bold" onClick={onClose}>Fermer</button>
          {(isFailed || isRunning) && (
            <button className="btn btn-primary px-4 shadow-sm fs-13 fw-bold" onClick={() => onRetry(lot)} disabled={retrying}>
              {retrying ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="ri-refresh-line me-1"></i>}
              Relancer le Job
            </button>
          )}
        </div>
      }
    >
      <div className="vstack gap-4">
        {/* Statut Card */}
        <div className="card border-0 bg-light-subtle rounded-4">
           <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                 <div className="d-flex align-items-center gap-2">
                    <StatusBadge type="lot" value={lot.status} />
                    <span className="text-muted fs-11 fw-bold text-uppercase ls-1">Initié le {formatDate(lot.created_at)}</span>
                 </div>
                 {isRunning && <span className="badge bg-primary rounded-pill px-2">{progress}%</span>}
              </div>
              
              {isRunning && (
                <div className="progress mb-3" style={{ height: 6, borderRadius: 10 }}>
                  <div className="progress-bar progress-bar-striped progress-bar-animated bg-primary" style={{ width: `${progress}%` }}></div>
                </div>
              )}

              <div className="d-flex align-items-center gap-3 mt-3">
                 <div className={`avatar-sm rounded-circle d-flex align-items-center justify-content-center bg-${statusColor}-subtle`} style={{ width: 40, height: 40 }}>
                    <i className={`${isRunning ? 'ri-loader-4-line ri-spin' : 'ri-map-pin-user-line'} fs-18 text-${statusColor}`}></i>
                 </div>
                 <div>
                    <div className="fw-bold text-dark fs-14">{lot.current_action || "Vérification du registre"}</div>
                    <div className="fs-11 text-muted">Étape active du processus de synchronisation</div>
                 </div>
              </div>
              {lot.source_filename && (
                <div className="d-flex align-items-center gap-2 mt-3 p-2 rounded-3 bg-warning-subtle border border-warning-subtle">
                  <i className="ri-file-zip-line text-warning fs-16"></i>
                  <div>
                    <div className="fs-10 text-uppercase fw-bold text-muted ls-1">Fichier source importé</div>
                    <div className="fs-12 fw-bold text-dark" style={{ fontFamily: 'monospace' }}>{lot.source_filename}</div>
                  </div>
                </div>
              )}
           </div>
        </div>

        {/* ÉQUIPE DE MISSION (NEW SENIOR GALLERY) */}
        {!lot.developer_id && (
          <div className="p-4 border rounded-4 bg-white shadow-sm">
             <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2">
                   <i className="ri-group-line text-primary fs-18"></i>
                   <span className="fw-bold fs-14 text-dark">Équipe de Mission</span>
                </div>
                {isLoadingMembers ? (
                   <span className="spinner-border spinner-border-sm text-primary"></span>
                ) : (
                   <span className="badge bg-primary-subtle text-primary rounded-pill px-3">{projectMembers.length} Membres</span>
                )}
             </div>
             
             {isLoadingMembers ? (
               <div className="py-4 text-center">
                  <div className="spinner-grow text-primary" role="status"></div>
                  <div className="fs-11 text-muted mt-2">Récupération de la cohorte...</div>
               </div>
             ) : projectMembers.length > 0 ? (
               <div className="row g-3">
                  {projectMembers.map((m, idx) => (
                    <div key={idx} className="col-md-6">
                       <div className="d-flex align-items-center gap-2 p-2 border rounded-3 bg-light-subtle hover-scale transition-all" title={m.name}>
                          <UserAvatar name={m.name || m.gitlab_username} size={32} />
                          <div className="overflow-hidden">
                             <div className="fs-12 fw-bold text-dark text-truncate">{m.name || m.gitlab_username}</div>
                             <div className="fs-10 text-muted text-truncate">@{m.gitlab_username || "dev"}</div>
                          </div>
                       </div>
                    </div>
                  ))}
               </div>
             ) : (
               <div className="alert alert-light border text-center fs-12 py-3 mb-0">
                  Aucun membre de mission détecté pour cette période.
               </div>
             )}
          </div>
        )}

        {/* Métriques */}
        <div className="row g-3">
           {[
             { label: "Items Extraits", value: totalItems, icon: "ri-database-2-line", color: "primary" },
             { label: "Appels API",     value: lot.api_calls_count || 0, icon: "ri-global-line", color: "info" },
             { label: "Tentatives",     value: lot.retry_count || 0, icon: "ri-refresh-line", color: "warning" },
           ].map((m, i) => (
             <div className="col-4" key={i}>
                <div className="p-3 border rounded-4 text-center bg-white shadow-sm h-100">
                   <div className="avatar-xs mx-auto mb-2 bg-light rounded-circle d-flex align-items-center justify-content-center" style={{ width: 30, height: 30 }}>
                      <i className={`${m.icon} fs-14 text-${m.color}`}></i>
                   </div>
                   <div className="fs-20 fw-bold text-dark">{m.value}</div>
                   <div className="fs-10 text-uppercase fw-bold text-muted ls-1">{m.label}</div>
                </div>
             </div>
           ))}
        </div>

        {/* Erreur */}
        {isFailed && (
          <div className="alert alert-danger-soft border-0 d-flex gap-3 p-3 rounded-4">
             <i className="ri-error-warning-fill fs-24 text-danger"></i>
             <div>
                <div className="fw-bold fs-14 mb-1">Rapport d'anomalie technique</div>
                <div className="fs-12 opacity-75">{lot.error_message}</div>
             </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
}

// ── ActionsMenu (Dropdown Elite) ───────────────────────────────────────────
function ActionsMenu({ lot, navigate }) {
  const [open, setOpen] = useState(false);
  const [isDropup, setIsDropup] = useState(false);
  const ref = useRef(null);
  const disabled = lot.status !== "completed";

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) {
      document.addEventListener("mousedown", handler);
      // Smart Positioning logic
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setIsDropup(spaceBelow < 250); // Si moins de 250px d'espace en bas, on monte
      }
    }
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleDownload = async () => {
    try {
      const response = await api.get(`/extraction/lots/${lot.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `lot_${lot.id}_dump.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Erreur: Le fichier dump n'est pas disponible pour ce lot.");
    }
  };

  const actions = [
    { label: "Merge Requests",     icon: "ri-git-merge-line",  color: "primary", count: lot.mr_count,     path: `/merge?project_id=${lot.project_id}&developer_id=${lot.developer_id}&period_id=${lot.period_id}&lot_id=${lot.id}` },
    { label: "Commits Libres",     icon: "ri-git-commit-line", color: "info",    count: lot.commit_count, path: `/commits?project_id=${lot.project_id}&developer_id=${lot.developer_id}&period_id=${lot.period_id}&lot_id=${lot.id}` },
    { label: "Dashboard Analytique", icon: "ri-dashboard-line", color: "success", path: `/dashboard?project_id=${lot.project_id}&period_id=${lot.period_id}&lot_id=${lot.id}&developer_id=${lot.developer_id}` },
  ];

  if (lot.generated_file) {
    actions.push({ label: "Télécharger le Dump", icon: "ri-download-2-line", color: "warning", onClick: handleDownload });
  }

  return (
    <div ref={ref} className="dropdown d-inline-block">
      <button className={`btn btn-icon btn-sm rounded-circle ${open ? "btn-primary shadow" : "btn-light border"}`} 
              onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(!open); }}>
        <i className={open ? "ri-close-line" : "ri-more-fill"}></i>
      </button>
      {open && (
        <div className={`dropdown-menu show shadow-lg border-0 animate__animated ${isDropup ? "animate__fadeInUp" : "animate__fadeInDown"}`} 
             style={{ 
               position: "absolute", 
               right: 0, 
               [isDropup ? "bottom" : "top"]: "100%",
               marginBottom: isDropup ? "8px" : "0",
               marginTop: isDropup ? "0" : "8px",
               zIndex: 1000, 
               minWidth: 200, 
               borderRadius: 12 
             }}>
          <div className="px-3 py-2 border-bottom bg-light-subtle rounded-top d-flex align-items-center justify-content-between">
             <span className="fs-10 fw-bold text-uppercase text-muted ls-1">Exploration</span>
             <span className="badge bg-soft-primary text-primary fs-9"># {lot.id}</span>
          </div>
          {actions.map((a, i) => (
            <button key={i} className="dropdown-item d-flex align-items-center gap-2 py-2 px-3 fs-13 fw-medium" 
                    onClick={() => { 
                      setOpen(false); 
                      if (a.onClick) a.onClick();
                      else navigate(a.path); 
                    }}>
              <i className={`${a.icon} text-${a.color} fs-16`}></i> {a.label}
              {a.count !== undefined && <span className="badge bg-light text-muted ms-auto">{a.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════
export default function ExtractionLotsPage() {
  const navigate = useNavigate();
  const [lots,         setLots]         = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [periods,      setPeriods]      = useState([]);
  const [allDevelopers, setAllDevelopers] = useState([]); // ✅ AJOUT SENIOR : Pour l'inspection d'équipe
  const [loading,      setLoading]      = useState(true);
  const [projFilter,   setProjFilter]   = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lotDetail,    setLotDetail]    = useState(null);
  const [loadingMembers, setLoadingMembers] = useState(false); // ✅ AJOUT SENIOR
  const [retrying,     setRetrying]     = useState(null);
  const [page,         setPage]         = useState(1);
  const [refreshTick,  setRefreshTick]  = useState(0);
  const isQuietRef = useRef(false);
  const perPage = 12;

  const refreshData = () => { setLoading(true); setRefreshTick(r => r + 1); };
  
  const handleGlobalDump = async () => {
    if (!periodFilter) return;
    try {
      setLoading(true);
      const data = await extractionLotService.getGlobalDump(periodFilter);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const p = periods.find(per => String(per.id) === String(periodFilter));
      const pLabel = p ? `${p.year}-${String(p.month).padStart(2, '0')}` : "global";
      link.href = url;
      link.setAttribute("download", `audit-global-${pLabel}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // On pourrait ajouter une notification ici si un système de toast était présent
    } catch (err) {
      console.error("Global dump error:", err);
      alert("Erreur lors de la génération du dump global");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      projectService.getAll(),
      periodService.getAll(),
      developerService.getAll(false) // ✅ FALSE pour inclure l'historique (ex: Martin Owens)
    ])
      .then(([projs, pers, devs]) => {
        setProjects(Array.isArray(projs) ? projs : []);
        setPeriods(Array.isArray(pers) ? pers : []);
        setAllDevelopers(Array.isArray(devs) ? devs : []); // ✅ STOCKAGE
      })
      .catch((err) => console.error("Error loading registry dependencies:", err));
  }, []);

  // Reset to page 1 when filters change to avoid 'empty page' syndrome
  useEffect(() => {
    setPage(1);
  }, [projFilter, periodFilter, statusFilter]);

  useEffect(() => {
    let mounted = true;
    let pollInterval = null;

    const fetchLots = () => {
      if (!isQuietRef.current && mounted) setLoading(true);
      extractionLotService.getAll(projFilter ? parseInt(projFilter) : null, periodFilter ? parseInt(periodFilter) : null)
        .then(data => {
          if (!mounted) return;
          const newLots = Array.isArray(data) ? data : (data?.items ?? []);
          setLots(newLots);
          
          const hasRunning = newLots.some(l => l.status === "running");
          if (hasRunning && !pollInterval) pollInterval = setInterval(() => { isQuietRef.current = true; setRefreshTick(r => r + 1); }, 3000);
          else if (!hasRunning && pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        })
        .finally(() => { if (mounted) setLoading(false); isQuietRef.current = false; });
    };

    fetchLots();
    return () => { mounted = false; if (pollInterval) clearInterval(pollInterval); };
  }, [projFilter, periodFilter, refreshTick]);

  const filtered = lots.filter(l => statusFilter === "all" || l.status === statusFilter);
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  const stats = [
    { label: "Jobs Totaux", value: lots.length,  icon: "ri-stack-line", color: "primary" },
    { label: "Succès",      value: lots.filter(l => l.status === "completed").length, icon: "ri-checkbox-circle-line", color: "success" },
    { label: "Échecs",       value: lots.filter(l => l.status === "failed").length, icon: "ri-error-warning-line", color: "danger" },
    { label: "En Cours",    value: lots.filter(l => l.status === "running").length, icon: "ri-loader-4-line", color: "info" },
  ];

  const handleRetry = async (lot) => {
    setRetrying(lot.id);
    try {
      await extractionService.run({
        extraction_type: lot.extraction_type,
        project_id: lot.project_id,
        period_id: lot.period_id,
        developer_ids: lot.developer_id ? [lot.developer_id] : null,
        is_backfill: true
      });
      setLotDetail(null);
      refreshData();
    } catch (err) { alert("Erreur lors de la relance"); }
    finally { setRetrying(null); }
  };

  // ✅ RÉCUPÉRATION DYNAMIQUE DE LA COHORTE (SENIOR v6)
  const handleOpenLotDetail = async (lot) => {
    setLoadingMembers(true);
    setLotDetail(lot); // On ouvre déjà la modale
    try {
      // On demande exactement qui était dans cette mission (Projet + Période)
      const members = await developerService.getByTab("validated", lot.project_id, false, lot.period_id);
      setLotDetail(prev => ({ ...prev, project_members: members }));
    } catch (err) {
      console.error("Erreur cohort fetch:", err);
      setLotDetail(prev => ({ ...prev, project_members: [] }));
    } finally {
      setLoadingMembers(false);
    }
  };

  return (
    <div className="page-content">
      <div className="container-fluid">
        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-database-2-line me-2 text-primary"></i>Journal d'Extractions
              </h4>
              <div className="d-flex gap-2">
                <button className="btn btn-white border shadow-sm fs-13 fw-bold px-4" onClick={refreshData}>
                  <i className={`ri-refresh-line me-2 ${loading && isQuietRef.current ? "ri-spin" : ""}`}></i> Actualiser
                </button>
                <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => navigate("/admin/extract")}>
                  <i className="ri-add-line me-1"></i> Nouveau Job
                </button>
              </div>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Journal des Lots</li>
            </ol>
          </div>
        </div>

        {/* ── Stats Hub ── */}
        <div className="row g-4 mb-5">
          {stats.map((s, i) => (
            <div className="col-xl-3 col-sm-6" key={i} onClick={() => setStatusFilter(s.color === "primary" ? "all" : (s.color === "success" ? "completed" : (s.color === "danger" ? "failed" : "running")))} style={{ cursor: "pointer" }}>
              <div className="card border-0 shadow-sm rounded-4 h-100 transition-all hover-scale">
                 <div className="card-body p-4 d-flex align-items-center gap-3">
                    <div className={`avatar-md rounded-circle d-flex align-items-center justify-content-center bg-${s.color}-subtle`} style={{ width: 48, height: 48 }}>
                       <i className={`${s.icon} fs-22 text-${s.color}`}></i>
                    </div>
                    <div>
                       <h4 className="fw-bold mb-0 fs-24">{s.value}</h4>
                       <p className="text-muted fs-12 fw-bold text-uppercase ls-1 mb-0">{s.label}</p>
                    </div>
                 </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main Table Card ── */}
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-5">
           <div className="card-header bg-white border-bottom-light p-4">
              <div className="row g-3">
                 <div className="col-md-4">
                    <select className="form-select border-0 bg-light fs-13 rounded-3 py-2" value={projFilter} onChange={e => setProjFilter(e.target.value)}>
                       <option value="">Tous les projets</option>
                       {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                 </div>
                 <div className="col-md-4">
                    <select className="form-select border-0 bg-light fs-13 rounded-3 py-2" value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}>
                       <option value="">Toutes les périodes</option>
                       {periods.map(p => <option key={p.id} value={p.id}>{p.year}/{String(p.month).padStart(2, '0')}</option>)}
                    </select>
                 </div>
                 <div className="col-md-4 text-end d-flex gap-2 justify-content-end">
                    {periodFilter && (
                      <button className="btn btn-warning shadow-sm fs-13 fw-bold" onClick={handleGlobalDump} disabled={loading}>
                        <i className="ri-file-download-line me-1"></i> Export Global
                      </button>
                    )}
                    <button className="btn btn-soft-secondary fs-13 fw-bold" onClick={() => { setProjFilter(""); setPeriodFilter(""); setStatusFilter("all"); }}>
                       Réinitialiser
                    </button>
                 </div>
              </div>
           </div>

           <div className="card-body p-0">
              <div className="table-responsive">
                 <table className="table table-hover align-middle mb-0 custom-table">
                    <thead className="bg-light-subtle">
                       <tr>
                          <th className="ps-4 py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">ID / Projet</th>
                          <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Cible / Développeur</th>
                           <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Période</th>
                          <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Statut</th>
                          <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Intégrité MD5</th>
                          <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Audit</th>
                          <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Auteur</th>
                          <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Délai</th>
                          <th className="pe-4 py-3 text-end fs-11 text-uppercase text-muted ls-1 fw-bold">Actions</th>
                       </tr>
                    </thead>
                    <tbody>
                       {loading && !lots.length ? (
                          <tr><td colSpan="9" className="py-5 text-center"><LoadingSpinner /></td></tr>
                       ) : paginated.length > 0 ? (
                          paginated.map(l => (
                             <tr key={l.id} className={l.status === 'failed' ? 'bg-danger-subtle' : ''} onClick={() => handleOpenLotDetail(l)} style={{ cursor: 'pointer' }}>
                                <td className="ps-4">
                                  <ProjectCell 
                                    lot={l} 
                                    projectName={projects.find(p => String(p.id) === String(l.project_id))?.name || "Global"} 
                                  />
                                </td>
                                 <td>
                                   <DevCell 
                                      lot={l} 
                                   />
                                </td>
                                <td>
                                  <span className="badge bg-info-subtle text-info px-2 py-1 rounded-pill fw-bold fs-11">
                                    {l.period ? `${l.period.year}/${String(l.period.month).padStart(2, '0')}` : "—"}
                                  </span>
                                </td>
                                <td><StatusBadge type="lot" value={l.status} /></td>
                                <td><Md5Cell lot={l} /></td>
                                <td>
                                    {l.generated_file ? (
                                      <button 
                                        className="btn btn-soft-warning btn-sm d-flex align-items-center gap-1 fw-bold fs-10 px-2 py-1 rounded-pill"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const handler = async () => {
                                            try {
                                              const response = await api.get(`/extraction/lots/${l.id}/download`, { responseType: 'blob' });
                                              const url = window.URL.createObjectURL(new Blob([response.data]));
                                              const a = document.createElement('a');
                                              a.href = url;
                                              a.setAttribute('download', `audit_lot_${l.id}.json`);
                                              document.body.appendChild(a);
                                              a.click();
                                              a.remove();
                                            } catch (err) { alert("Dump non disponible."); }
                                          };
                                          handler();
                                        }}
                                      >
                                        <i className="ri-download-cloud-2-line"></i> DUMP
                                      </button>
                                    ) : <span className="text-muted opacity-25">—</span>}
                                 </td>
                                <td><TriggeredByCell lot={l} /></td>
                                <td>
                                   <div className="d-flex flex-column">
                                      <span className="fs-13 fw-bold text-dark">{timeAgo(l.created_at)}</span>
                                      <span className="fs-11 text-muted">{formatDate(l.created_at).split(' ').slice(0, 3).join(' ')}</span>
                                   </div>
                                </td>
                                <td className="pe-4 text-end">
                                   <ActionsMenu lot={l} navigate={navigate} />
                                </td>
                             </tr>
                          ))
                       ) : (
                          <tr>
                             <td colSpan="9" className="py-5 text-center">
                                <EmptyState 
                                   icon="ri-database-2-line"
                                   title={lots.length === 0 ? "Aucun lot d'extraction" : "Aucun résultat pour ces filtres"} 
                                   description={lots.length === 0 
                                      ? "Commencez par lancer une extraction de données pour voir l'historique ici." 
                                      : "Essayez de modifier vos critères de recherche ou de réinitialiser les filtres."
                                   }
                                   actionLabel={lots.length === 0 ? "Lancer une extraction" : "Réinitialiser les filtres"}
                                   onAction={() => {
                                      if (lots.length === 0) navigate("/admin/extract");
                                      else { setProjFilter(""); setPeriodFilter(""); setStatusFilter("all"); }
                                   }}
                                />
                             </td>
                          </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
           {totalPages > 1 && (
              <div className="card-footer bg-white border-top-light py-3 px-4">
                 <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />
              </div>
           )}
        </div>

        {lotDetail && (
           <LotDetailModal 
              lot={{
                ...lotDetail,
                isLoadingMembers: loadingMembers // ✅ PASSAGE DU STATE
              }} 
              onClose={() => setLotDetail(null)} 
              onRetry={handleRetry} 
              retrying={retrying === lotDetail.id} 
           />
        )}

        <style>{`
          .hover-scale:hover { transform: translateY(-3px); box-shadow: 0 10px 20px rgba(0,0,0,0.05) !important; }
          .custom-table tbody tr { transition: all 0.2s ease; border-bottom: 1px solid #f1f3f5; }
          .custom-table tbody tr:hover { background-color: #f8faff !important; }
          .ls-sm { letter-spacing: -0.01em; }
          .ls-1 { letter-spacing: 0.05em; }
          .transition-all { transition: all 0.2s ease; }
          .bg-danger-subtle { background-color: rgba(220, 38, 38, 0.05) !important; }
          .bg-info-subtle { background-color: rgba(13, 202, 240, 0.08) !important; }
          .bg-soft-info { background-color: transparent !important; }
        `}</style>
      </div>
    </div>
  );
}
