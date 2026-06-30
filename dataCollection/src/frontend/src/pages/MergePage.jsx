/**
 * MergePage.jsx — Tableau de bord Merge Requests
 *
 * CORRECTIONS v2 :
 *   [FIX] exportCSV → URL.revokeObjectURL(url) ajouté après a.click() (anti memory-leak)
 *   [FIX] useCallback sur `load` (stabilité ref + évite boucle useEffect) — déjà correct ✅
 *   [FIX] Fermeture modal MR par touche Escape + aria-modal/role — déjà correct ✅
 *   [NEW] Bouton Rafraîchir avec état spinning
 *   [NEW] Badge total MRs dans le header de la table
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import ReactApexChart from "react-apexcharts";
import api from "../services/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const timeSince = (d) => {
  if(!d)return"—";
  const s=Math.floor((Date.now()-new Date(d))/1000);
  if(s<60)    return`${s}s ago`;
  if(s<3600)  return`${Math.floor(s/60)}m ago`;
  if(s<86400) return`${Math.floor(s/3600)}h ago`;
  return`${Math.floor(s/86400)}d ago`;
};
const fmtDate=(d)=>d?new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"—";
const getInitials=(name="")=>(name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

/**
 * Calcule le "temps de revue" d'une MR selon la disponibilité des données :
 *  1. Si time_to_approve est renseigné et >= 0 → valeur exacte ✅
 *  2. Si MR merged et dates valides et Lead Time > 0 → proxy DORA ✅
 *  3. Sinon → null (donnée absente ou incohérente → afficher "—")
 *
 * Robustesse :
 *  - NaN sécurisé via isNaN()
 *  - Lead Time négatif = incohérence de données → on retourne null (jamais de valeur absurde)
 */
function reviewTime(mr) {
  // Cas 1 : donnée exacte du backend (time_to_approve calculé lors de l'extraction)
  if (mr.time_to_approve != null && !isNaN(mr.time_to_approve) && mr.time_to_approve >= 0) {
    return { hours: mr.time_to_approve, isExact: true };
  }
  // Cas 2 : proxy Lead Time DORA — uniquement si MR mergée avec les 2 dates valides
  if (mr.state === "merged" && mr.merged_at && mr.created_at_gitlab) {
    const created = new Date(mr.created_at_gitlab);
    const merged  = new Date(mr.merged_at);
    // Sécurité : si l'une des dates est invalide ou le résultat est incohérent → on abandonne
    if (isNaN(created.getTime()) || isNaN(merged.getTime())) return null;
    const hours = Math.max(0, (merged - created) / 3_600_000);
    // Lead Time négatif = problème de qualité de données (fuseau horaire, import incorrect)
    // → On affiche "—", jamais une valeur négative ou absurde
    if (hours < 0) return null;
    return { hours: parseFloat(hours.toFixed(1)), isExact: false };
  }
  return null;
}

const AVATAR_PALETTE=[
  {bg:"#e8ecf8",text:"#405189"},{bg:"#d4f5f0",text:"#0a7a6a"},{bg:"#d7edf9",text:"#1a6fa3"},
  {bg:"#fef3dc",text:"#b78a1e"},{bg:"#fde8e8",text:"#9b1c1c"},{bg:"#ede9fb",text:"#5b21b6"},
];
const avatarColor=(str="")=>{ let h=0; for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h); return AVATAR_PALETTE[Math.abs(h)%AVATAR_PALETTE.length]; };

const CHART_COLORS=["#405189","#0ab39c","#299cdb","#f7b84b","#f06548","#3577f1"];

const LOT_COLORS = [
  { bg: "#dce9ff", text: "#1a56db" },
  { bg: "#d4f5f0", text: "#0a7a6a" },
  { bg: "#ede9fb", text: "#5b21b6" },
  { bg: "#fef3dc", text: "#92400e" },
  { bg: "#fde8e8", text: "#9b1c1c" },
  { bg: "#e8ecf8", text: "#405189" },
];
function getLotColor(lotId) {
  return LOT_COLORS[(lotId || 0) % LOT_COLORS.length];
}

// ─── MR State Config ──────────────────────────────────────────────────────────
const STATE_CFG = {
  opened: { label: "Open",   icon: "ri-git-pull-request-line", bg: "#e8ecf8", color: "#405189" },
  merged: { label: "Merged", icon: "ri-git-merge-line",        bg: "#d4f5f0", color: "#0a7a6a" },
  closed: { label: "Closed", icon: "ri-close-circle-line",     bg: "#fde8e8", color: "#9b1c1c" },
};

// ─── MR Detail Modal ──────────────────────────────────────────────────────────
function MRDetailModal({ mr, onClose }) {
  useEffect(()=>{
    const handler=(e)=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",handler);
    return()=>document.removeEventListener("keydown",handler);
  },[onClose]);

  if(!mr)return null;
  const cfg=STATE_CFG[mr.state]||STATE_CFG.opened;
  const aCol=avatarColor(mr.author||"");
  const isApproved=mr.approved===true||mr.approved===1;

  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-label="Détail Merge Request"
      style={{backgroundColor:"rgba(30,34,45,0.6)",backdropFilter:"blur(3px)"}} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
        <div className="modal-content border-0" style={{borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,0.18)"}}>
          <div className="px-4 pt-4 pb-3" style={{borderBottom:"1px solid #f1f3f7"}}>
            <div className="d-flex align-items-start gap-3">
              <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14"
                style={{width:44,height:44,background:"linear-gradient(135deg,#405189,#3577f1)"}}>
                {getInitials(mr.author)}
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-1" style={{fontSize:14,lineHeight:1.45,wordBreak:"break-word"}}>{mr.title}</h5>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <span style={{background:cfg.bg,color:cfg.color,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}><i className={`${cfg.icon} me-1`}></i>{cfg.label}</span>
                  {isApproved&&<span style={{background:"#d7edf9",color:"#1a6fa3",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}><i className="ri-shield-check-line me-1"></i>Approved</span>}
                  {mr.is_draft&&<span style={{background:"#f0f0f0",color:"#6c757d",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>Draft</span>}
                </div>
              </div>
              <button className="btn-close flex-shrink-0" style={{opacity:0.5}} onClick={onClose} aria-label="Fermer"></button>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="row g-3 mb-4">
              {[
                {icon:"ri-hashtag",            label:"MR ID",   value:`!${mr.gitlab_mr_id}`},
                {icon:"ri-user-line",          label:"Auteur",  value:mr.author||"Unknown"},
                {icon:"ri-folder-2-line",      label:"Projet",  value:mr.project||"Unknown"},
                {icon:"ri-calendar-event-line",label:"Créée",   value:fmtDate(mr.created_at_gitlab)},
                {icon:"ri-history-line",       label:"Activité",value:fmtDate(mr.updated_at_gitlab)},
                {icon: "ri-git-commit-line",   label: "Commits",  value: mr.commits_count || 0},
                {icon:"ri-time-line",          label:"Délai",   value:timeSince(mr.created_at_gitlab)},
                {icon:"ri-check-double-line",  label:"Temps revue", value: (() => {
                    const rt = reviewTime(mr);
                    if (!rt) return "—";
                    const label = rt.hours === 0 ? "Instant" : `${rt.hours.toFixed(1)}h`;
                    return rt.isExact ? label : `~${label} (Lead Time)`;
                  })()},
              ].map((item,i)=>(
                <div key={i} className={item.label === "Commits" ? "col-3" : "col-6"}>
                  <div className="rounded-3 p-3" style={{background:"#f8f9fc",border:"1px solid #e9ecef"}}>
                    <div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",fontWeight:600,letterSpacing:0.8,marginBottom:4}}><i className={`${item.icon} me-1`}></i>{item.label}</div>
                    <div className="fw-semibold text-dark fs-13">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
            {mr.merged_at&&(
              <div className="rounded-3 p-3 mb-0" style={{background:"#f0fdf4",border:"1px solid #d1fae5"}}>
                <div className="d-flex align-items-center gap-2">
                  <i className="ri-git-merge-line text-success fs-16"></i>
                  <div><div style={{fontSize:10,color:"#15803d",textTransform:"uppercase",fontWeight:600,letterSpacing:0.8}}>Merged le</div><div className="fw-semibold text-dark fs-13">{fmtDate(mr.merged_at)}</div></div>
                </div>
              </div>
            )}
          </div>
          <div className="px-4 py-3 d-flex align-items-center justify-content-between" style={{borderTop:"1px solid #f1f3f7",background:"#fafbfc",borderRadius:"0 0 16px 16px"}}>
            <span style={{fontSize:12,color:"#9ca3af"}}><i className="ri-git-pull-request-line me-1"></i>Merge Request #{mr.gitlab_mr_id}</span>
            <button className="btn btn-sm" onClick={onClose} style={{fontSize:12,padding:"5px 20px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",color:"#374151",fontWeight:500}}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, bg, color, sub, onClick, active }) {
  // Déterminer la couleur d'ombre et d'accentuation en fonction de la couleur active
  const rgbColor = color === "#405189" ? "64, 81, 137" :
                   color === "#0a7a6a" ? "10, 122, 106" :
                   color === "#1a6fa3" ? "26, 111, 163" :
                   color === "#b78a1e" ? "183, 138, 30" :
                   color === "#5b21b6" ? "91, 33, 182" : "64, 81, 137";

  return (
    <div className="kpi-card-wrapper">
      <div className={`kpi-card-premium ${active ? 'kpi-card-active' : ''}`}
        onClick={onClick}
        style={{
          cursor: onClick ? "pointer" : "default",
          '--kpi-accent': color,
          '--kpi-accent-rgb': rgbColor,
        }}>
        {/* Subtle dynamic background gradient glowing effect */}
        <div className="kpi-card-glow-bg" style={{background: `radial-gradient(circle at top right, rgba(${rgbColor}, 0.08), transparent 70%)`}}></div>
        
        {/* Background blob */}
        <div className="kpi-card-blob" style={{opacity: 0.04}}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="180" height="110">
            <path fill={color} d="m189.5-25.8c0 0 20.1 46.2-26.7 71.4 0 0-60 15.4-62.3 65.3-2.2 49.8-50.6 59.3-57.8 61.5-7.2 2.3-60.8 0-60.8 0l-11.9-199.4z"/>
          </svg>
        </div>
        
        <div className="kpi-card-inner">
          <div className="kpi-icon-wrap" style={{background: `${color}12`, color: color, boxShadow: `0 4px 14px rgba(${rgbColor}, 0.15)`}}>
            <i className={icon}></i>
          </div>
          <div className="kpi-text">
            <p className="kpi-label">{label}</p>
            <h4 className="kpi-value" style={{color: "#1e293b"}}>{value}</h4>
            {sub && <p className="kpi-sub"><span className="kpi-sub-badge" style={{background: `${color}10`, color: color}}>{sub}</span></p>}
          </div>
        </div>
        
        {/* Beautiful indicator bar at the bottom */}
        <div className="kpi-active-bar" style={{background: `linear-gradient(90deg, ${color}, rgba(${rgbColor}, 0.4))`}}></div>
      </div>
    </div>
  );
}

// ─── FilterTag ────────────────────────────────────────────────────────────────
function FilterTag({ label, onRemove, color="#e2e8f0", textColor="#475569" }) {
  return (
    <span className="premium-filter-tag" style={{background: color, color: textColor, border: `1px solid ${textColor}20`}}>
      <i className="ri-price-tag-3-line fs-11 me-1 opacity-75"></i>
      {typeof label === 'object' && label !== null ? JSON.stringify(label) : String(label || "")}
      <button onClick={onRemove} aria-label="Supprimer ce filtre" className="premium-filter-tag-close">×</button>
    </span>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({ filters, onChange, projects, authors, activeCount, onReset, availableLots = [], availablePeriods = [] }) { // eslint-disable-line no-unused-vars
  return (
    <div className="card filter-card-premium mb-4">
      <div className="card-body p-4">
        {/* ─── Premium Périmètre Switch ───────────────────────────────── */}
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 pb-3 mb-4" style={{borderBottom: "1.5px solid #f1f5f9"}}>
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <span style={{fontSize: 12, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: ".08em", display: "inline-flex", alignItems: "center", gap: 8}}>
              <span className="p-1 rounded-circle bg-primary-subtle d-inline-flex"><i className="ri-database-2-line text-primary fs-14"></i></span> Périmètre d'analyse
            </span>
            <div className="premium-segmented-control">
              <button 
                onClick={() => onChange("dataScope", "kpi")}
                className={`segmented-btn ${filters.dataScope === "kpi" ? "active-kpi" : ""}`}
              >
                <i className="ri-shield-check-line me-1"></i> Périmètre KPI (Lot d'extraction)
              </button>
              <button 
                onClick={() => onChange("dataScope", "activity")}
                className={`segmented-btn ${filters.dataScope === "activity" ? "active-activity" : ""}`}
              >
                <i className="ri-calendar-line me-1"></i> Activité Générale (Mois civil)
              </button>
            </div>
          </div>

          {/* Dynamic Context Card/Alert describing the active mode */}
          <div className={`scope-badge-alert ${filters.dataScope === "kpi" ? "scope-kpi" : "scope-activity"}`}>
            {filters.dataScope === "kpi" ? (
              <>
                <i className="ri-information-line fs-14 icon-kpi"></i>
                <span><strong>Mode KPI (Défaut) :</strong> Uniquement les MRs validées & non-draft du lot d'extraction. <em>Recommandé pour la cohérence.</em></span>
              </>
            ) : (
              <>
                <i className="ri-alert-line fs-14 icon-activity"></i>
                <span><strong>Mode Activité Générale :</strong> Toutes les MRs du mois civil (reviews, assignations & brouillons compris).</span>
              </>
            )}
          </div>
        </div>

        <div className="filter-grid-premium">
          {/* Search */}
          <div className="filter-item filter-item-search">
            <label className="filter-label"><i className="ri-search-line me-1 text-primary"></i>Recherche</label>
            <div className="filter-search-wrap">
              <i className="ri-search-line filter-search-icon"></i>
              <input
                type="text"
                className="form-control filter-input-premium"
                placeholder="Titre, développeur, projet…"
                value={filters.search}
                onChange={e=>onChange("search",e.target.value)}
              />
            </div>
          </div>

          {/* Période */}
          <div className="filter-item">
            <label className="filter-label"><i className="ri-calendar-check-line me-1 text-primary"></i>Période</label>
            <div className="filter-select-wrap">
              <select className="filter-select-premium" value={filters.period} onChange={e=>onChange("period",e.target.value)}>
                <option value="all">Toutes les périodes</option>
                {availablePeriods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <i className="ri-arrow-down-s-line filter-select-icon"></i>
            </div>
          </div>

          {/* Project */}
          <div className="filter-item">
            <label className="filter-label"><i className="ri-folder-2-line me-1 text-primary"></i>Projet</label>
            <div className="filter-select-wrap">
              <select className="filter-select-premium" value={filters.project} onChange={e=>onChange("project",e.target.value)}>
                <option value="all">Tous les projets</option>
                {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <i className="ri-arrow-down-s-line filter-select-icon"></i>
            </div>
          </div>

          {/* Développeur */}
          <div className="filter-item">
            <label className="filter-label"><i className="ri-user-line me-1 text-primary"></i>Développeur</label>
            <div className="filter-select-wrap">
              <select className="filter-select-premium" value={filters.developerId} onChange={e=>onChange("developerId",e.target.value)}>
                <option value="all">Tous les développeurs</option>
                {authors.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <i className="ri-arrow-down-s-line filter-select-icon"></i>
            </div>
          </div>

          {/* Reset */}
          <div className="filter-item filter-item-reset">
            <button onClick={onReset} className={`filter-reset-btn ${activeCount > 0 ? 'filter-reset-active' : ''}`}>
              {activeCount > 0 ? <><i className="ri-close-circle-line me-1"></i>Reset ({activeCount})</> : <><i className="ri-filter-off-line me-1"></i>Réinitialiser</>}
            </button>
          </div>
        </div>

        {/* ─── Vue par Rôle ─────────────────────────────────────────────── */}
        <div className="d-flex align-items-center gap-2 mt-4 pt-3 flex-wrap" style={{borderTop:"1.5px solid #f1f5f9"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".08em",whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:6}}>
            <span className="p-1 rounded-circle bg-light d-inline-flex"><i className="ri-user-settings-line text-muted"></i></span> Rôle de contribution :
          </span>
          <div className="premium-segmented-control-small">
            {[
              {value:"all",      icon:"ri-apps-line",       label:"Tous les rôles"},
              {value:"authored", icon:"ri-quill-pen-line",   label:"Auteur"},
              {value:"reviewed", icon:"ri-eye-line",         label:"Reviewer"},
            ].map(r=>(
              <button key={r.value} onClick={()=>onChange("role",r.value)}
                className={`segmented-btn-small ${filters.role===r.value?"active":""}`}
              >
                <i className={`${r.icon} me-1`}></i>{r.label}
              </button>
            ))}
          </div>
        </div>

        {activeCount>0&&(
          <div className="d-flex flex-wrap gap-2 mt-3 pt-2">
            {filters.search&&<FilterTag label={`"${filters.search}"`} onRemove={()=>onChange("search","")}/>}
            {filters.period!=="all"&&<FilterTag label={`Période: ${availablePeriods.find(p=>String(p.id)===String(filters.period))?.name||filters.period}`} onRemove={()=>onChange("period","all")} color="#eff6ff" textColor="#1e40af"/>}
            {filters.state!=="all"&&<FilterTag label={`Status: ${STATE_CFG[filters.state]?.label}`} onRemove={()=>onChange("state","all")} color="#eff6ff" textColor="#1e40af"/>}
            {filters.project!=="all"&&<FilterTag label={`Projet: ${filters.project}`} onRemove={()=>onChange("project","all")} color="#e0e7ff" textColor="#3730a3"/>}
            {filters.developerId!=="all"&&<FilterTag label={`Développeur: ${(authors||[]).find(d=>String(d.id)===filters.developerId)?.name||filters.developerId}`} onRemove={()=>onChange("developerId","all")} color="#f3e8ff" textColor="#6b21a8"/>}
            {filters.role!=="all"&&filters.developerId!=="all"&&<FilterTag label={`Rôle: ${filters.role}`} onRemove={()=>onChange("role","all")} color="#ecfdf5" textColor="#065f46"/>}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Status Donut ─────────────────────────────────────────────────────────────
function StatusDonut({ opened, merged, closed }) {
  const total=opened+merged+closed||1;
  const mergeRate=Math.round((merged/total)*100);
  return (
    <div className="card h-100">
      <div className="card-header"><h5 className="card-title mb-0"><i className="ri-pie-chart-2-line me-2 text-primary"></i>Status Distribution</h5><p className="text-muted fs-12 mb-0">Based on current filters</p></div>
      <div className="card-body d-flex flex-column justify-content-center">
        <ReactApexChart type="donut" height={230} series={[opened,merged,closed]}
          options={{chart:{type:"donut",toolbar:{show:false},fontFamily:"Poppins, sans-serif"},labels:["Open","Merged","Closed"],colors:["#405189","#0ab39c","#f06548"],legend:{position:"bottom",fontSize:"12px"},dataLabels:{enabled:false},plotOptions:{pie:{donut:{size:"70%",labels:{show:true,total:{show:true,label:"Merge Rate",color:"#495057",formatter:()=>`${mergeRate}%`}}}}},tooltip:{y:{formatter:v=>`${v} MRs (${Math.round(v/total*100)}%)`}}}}/>
        <div className="row g-2 mt-2 text-center">
          {[{label:"Open",value:opened,bg:"#e8ecf8",color:"#405189"},{label:"Merged",value:merged,bg:"#d4f5f0",color:"#0a7a6a"},{label:"Closed",value:closed,bg:"#fde8e8",color:"#9b1c1c"}].map((s,i)=>(
            <div key={i} className="col-4"><div style={{background:s.bg,borderRadius:8,padding:"8px 4px"}}><div style={{fontWeight:700,fontSize:18,color:s.color}}>{s.value}</div><div style={{fontSize:11,color:"#878a99"}}>{s.label}</div><div style={{fontSize:10,color:s.color,fontWeight:600}}>{Math.round(s.value/total*100)}%</div></div></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Top Contributors (Contextual Breakdown) ──────────────────────────────────
function TopContributors({ mrs, selectedAuthor, developers, assignedDevs, filters }) {
  // Mode Individuel : Si un auteur est sélectionné (Vue Axel)
  if (selectedAuthor && selectedAuthor !== "all") {
    let authored = 0, reviewed = 0, assigned = 0;
    let authMerged = 0, revMerged = 0;
    
    // ✅ LOGIQUE ROBUSTE : Comparaison insensible à la casse pour le graphique
    const target = selectedAuthor.toLowerCase().trim();

    mrs.forEach(mr => {
      const aut = (mr.author || "").toLowerCase();
      const rev = (mr.reviewer || "").toLowerCase();
      const ass = (mr.assignee || "").toLowerCase();

      if (aut.includes(target)) {
        authored++;
        if (mr.state === "merged") authMerged++;
      }
      if (rev.includes(target)) {
        reviewed++;
        if (mr.state === "merged") revMerged++;
      }
      if (ass.includes(target) && !aut.includes(target)) {
        assigned++;
      }
    });

    const categories = ["Creation (Author)", "Quality (Reviewer)", "Support (Assignee)"];
    const seriesData = [
      { name: "Merged", data: [authMerged, revMerged, 0] },
      { name: "Pending/Other", data: [authored - authMerged, reviewed - revMerged, assigned] }
    ];

    return (
      <div className="card h-100">
        <div className="card-header d-flex align-items-center">
          <h5 className="card-title mb-0 flex-grow-1">
            <i className="ri-user-star-line me-2 text-primary"></i>Contribution Analysis
          </h5>
          <span className="badge bg-success-subtle text-success">{String(selectedAuthor || "")}</span>
        </div>
        <div className="card-body">
          <ReactApexChart type="bar" height={210} series={seriesData}
            options={{
              chart: { type: "bar", stacked: true, toolbar: { show: false }, fontFamily: "Poppins, sans-serif" },
              plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 4 } },
              colors: ["#0ab39c", "#405189"],
              xaxis: { categories, labels: { style: { fontSize: "11px" } } },
              legend: { position: "top", fontSize: "12px" },
              tooltip: { y: { formatter: v => `${v} MRs` } }
            }} />
          <div className="mt-3 p-2 bg-light rounded">
            <div className="row text-center">
              <div className="col-4">
                <div className="fw-bold text-primary">{authored}</div>
                <div className="text-muted fs-10">Authored</div>
              </div>
              <div className="col-4">
                <div className="fw-bold text-success">{reviewed}</div>
                <div className="text-muted fs-10">Reviewed</div>
              </div>
              <div className="col-4">
                <div className="fw-bold text-warning">{assigned}</div>
                <div className="text-muted fs-10">Assigned</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mode Global : La liste des meilleurs contributeurs (Vue Manager)
  // [FIX MISSION-STRICT] On utilise assignedDevs (développeurs affectés au projet)
  // au lieu de developers (tous les développeurs de l'entreprise).
  // Ceci évite d'afficher Vaibhav Malik (mission gitlab-shell) comme auteur sur inkscape.
  const validDevs = useMemo(() => {
    const map = new Map();
    const devSource = assignedDevs && assignedDevs.length > 0 ? assignedDevs : (developers || []);
    devSource.forEach(d => {
      const siteMatch = !filters?.site || filters.site === "all" || d.site === filters.site;
      const groupMatch = !filters?.group || filters.group === "all" || (d.group_ids || []).map(Number).includes(parseInt(filters.group));
      
      if (siteMatch && groupMatch) {
        if (d.name) map.set(d.name.toLowerCase(), d);
        if (d.gitlab_username) map.set(d.gitlab_username.toLowerCase(), d);
      }
    });
    return map;
  }, [assignedDevs, developers, filters?.site, filters?.group]);

  const map={};
  mrs.forEach(mr=>{
    const roles = [
      { name: mr.author,   type: "auth" },
      { name: mr.reviewer, type: "rev"  },
      { name: mr.assignee, type: "assig"}
    ];
    roles.forEach(r => {
      if (!r.name || r.name === "Unknown") return;
      
      const lowerName = r.name.toLowerCase();
      // ✅ FUZZY MATCHING : On cherche si le nom contient ou est contenu dans un dev valide
      let matchedDev = validDevs.get(lowerName);
      if (!matchedDev) {
        // Fallback : recherche par inclusion si le Set.has() échoue
        for (const [key, dev] of validDevs.entries()) {
          if (lowerName.includes(key) || key.includes(lowerName)) {
            matchedDev = dev;
            break;
          }
        }
      }

      if (!matchedDev) return;
      
      const displayName = matchedDev.name || r.name;
      if(!map[displayName]) map[displayName]={total:0, merged:0, opened:0, auth:0, rev:0, assig:0};
      map[displayName].total++;
      map[displayName][r.type]++;
      if(mr.state==="merged") map[displayName].merged++;
      if(mr.state==="opened") map[displayName].opened++;
    });
  });

  const top=Object.entries(map).sort((a,b)=>b[1].total-a[1].total).slice(0,7);
  return (
    <div className="card h-100">
      <div className="card-header d-flex align-items-center">
        <h5 className="card-title mb-0 flex-grow-1">
          <i className="ri-user-star-line me-2 text-primary"></i>Top Contributors (All Roles)
        </h5>
        <span className="badge bg-primary-subtle text-primary">Top {top.length}</span>
      </div>
      <div className="card-body">
        {!top.length?<div className="text-center text-muted py-4">No contributor data</div>:(
          <>
            <ReactApexChart type="bar" height={230}
              series={[
                {name:"Authored", data:top.map(([,v])=>v.auth)},
                {name:"Reviewed", data:top.map(([,v])=>v.rev)},
                {name:"Assigned", data:top.map(([,v])=>v.assig)}
              ]}
              options={{
                chart:{type:"bar",stacked:true,toolbar:{show:false},fontFamily:"Poppins, sans-serif"},
                plotOptions:{bar:{horizontal:true,borderRadius:4}},
                colors:["#405189","#0ab39c","#f7b84b"],
                xaxis:{categories:top.map(([name])=>name.length>14?name.substring(0,12)+"...":name),labels:{style:{fontSize:"11px"}}},
                legend:{position:"top",fontSize:"12px"},
                tooltip:{y:{formatter:v=>`${v} MRs`}}
              }}/>
            <div className="mt-2">
              {top.map(([name,v],i)=>{
                const rate=Math.round((v.merged/v.total)*100);
                const col=avatarColor(name);
                return (
                  <div key={i} className="d-flex align-items-center gap-2 mb-2">
                    <span style={{width:26,height:26,borderRadius:"50%",background:col.bg,color:col.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0}}>{String(getInitials(name) || "")}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="d-flex justify-content-between mb-1"><span style={{fontSize:12,fontWeight:600,color:"#212529"}}>{name}</span><span style={{fontSize:11,color:"#878a99"}}>{v.total} MRs · {rate}%</span></div>
                      <div style={{height:4,background:"#f0f0f0",borderRadius:4}}><div style={{height:"100%",width:`${rate}%`,background:rate>=70?"#0ab39c":rate>=40?"#f7b84b":"#f06548",borderRadius:4,transition:"width .8s"}}/></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Projects Breakdown ───────────────────────────────────────────────────────
function ProjectsBreakdown({ mrs }) {
  const map={};
  mrs.forEach(mr=>{ 
    const rawP = mr.project || "Unknown";
    const p = typeof rawP === "object" ? (rawP.name || "Unknown") : String(rawP);
    if(!map[p])map[p]={total:0,merged:0,opened:0,closed:0}; 
    map[p].total++; 
    if(map[p][mr.state]!==undefined)map[p][mr.state]++; 
  });
  const top=Object.entries(map).sort((a,b)=>b[1].total-a[1].total).slice(0,6);
  const max=Math.max(...top.map(([,v])=>v.total),1);
  return (
    <div className="card">
      <div className="card-header"><h5 className="card-title mb-0"><i className="ri-folder-chart-line me-2 text-primary"></i>MRs by Project<span className="text-muted fs-12 fw-normal ms-2">(based on active filters)</span></h5></div>
      <div className="card-body">
        {!top.length?<p className="text-muted text-center py-3 mb-0">No data matching current filters.</p>:(
          <div className="row">
            {top.map(([name,v],i)=>{
              const rate=Math.round((v.merged/v.total)*100);
              const color=CHART_COLORS[i%CHART_COLORS.length];
              return (
                <div key={i} className="col-md-6 mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span style={{fontSize:13,fontWeight:600,color:"#212529",maxWidth:"60%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><i className="ri-folder-2-line me-1" style={{color}}></i>{String(name || "")}</span>
                    <div className="d-flex align-items-center gap-2">
                      <span style={{fontSize:12,color:"#878a99"}}>{v.total} MRs</span>
                      <span style={{fontSize:10,fontWeight:700,borderRadius:20,padding:"2px 8px",background:rate>=70?"#d1f3e0":rate>=40?"#fef3dc":"#fde8e8",color:rate>=70?"#0f6848":rate>=40?"#b78a1e":"#9b1c1c"}}>{rate}% merged</span>
                    </div>
                  </div>
                  <div style={{height:6,background:"#f0f0f0",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.round((v.total/max)*100)}%`,background:color,borderRadius:4,transition:"width .8s"}}/></div>
                  <div className="d-flex gap-3 mt-1">
                    <span style={{fontSize:11,color:"#0ab39c"}}><i className="ri-check-line me-1"></i>{v.merged} merged</span>
                    <span style={{fontSize:11,color:"#405189"}}><i className="ri-git-pull-request-line me-1"></i>{v.opened} open</span>
                    {v.closed>0&&<span style={{fontSize:11,color:"#f06548"}}><i className="ri-close-line me-1"></i>{v.closed} closed</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MR Table ─────────────────────────────────────────────────────────────────
function MRTable({ mrs, onDetail, lots = [], filters = {}, developers = [], selectedPeriodObj }) {
  const [page,   setPage]   = useState(1);
  const [sortKey,setSortKey]= useState("created_at_gitlab");
  const [sortDir,setSortDir]= useState("desc");
  const perPage=10;
  useEffect(()=>setPage(1),[mrs]);

  const selectedDev = filters.developerId && filters.developerId !== "all" 
    ? developers.find(d => String(d.id) === String(filters.developerId)) 
    : null;
  const selectedDevName = selectedDev ? (selectedDev.name || selectedDev.gitlab_username || "").toLowerCase() : "";

  const sorted=useMemo(()=>[...mrs].sort((a,b)=>{
    let va=a[sortKey]??"", vb=b[sortKey]??"";
    if(sortKey==="created_at_gitlab"){va=new Date(va);vb=new Date(vb);}
    if(va<vb)return sortDir==="asc"?-1:1;
    if(va>vb)return sortDir==="asc"?1:-1;
    return 0;
  }),[mrs,sortKey,sortDir]);

  const totalPages=Math.ceil(sorted.length/perPage);
  const paginated=sorted.slice((page-1)*perPage,page*perPage);
  const handleSort=(key)=>{ if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortKey(key);setSortDir("asc");} };

  // ✅ FIX : URL.revokeObjectURL(url) ajouté après a.click() — anti memory-leak
  const exportCSV={exportCSV:()=>{
    const headers=["ID","Title","Author","Project","Status","Approved","Draft","Created","Time to approve (h)"];
    const rows=sorted.map(mr=>[`!${mr.gitlab_mr_id}`,`"${(mr.title||"").replace(/"/g,'""')}"`,mr.author||"",mr.project||"",mr.state||"",mr.approved?"Yes":"No",mr.is_draft?"Yes":"No",mr.created_at_gitlab?new Date(mr.created_at_gitlab).toLocaleDateString("fr-FR"):"",mr.time_to_approve!=null?mr.time_to_approve.toFixed(1):""]);
    const csv=[headers,...rows].map(r=>r.join(",")).join("\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
    const a=document.createElement("a");
    a.href=url; a.download="merge_requests.csv"; a.click();
    URL.revokeObjectURL(url); // ✅ FIX
  }}.exportCSV;

  // État de survol par ligne
  const [hoveredRow, setHoveredRow] = useState(null);

  const STATE_ACCENT = {
    merged:  { line: "#0ab39c", bg: "rgba(10,179,156,0.06)",  badge: { bg: "#d4f5f0", color: "#0a7a6a" } },
    opened:  { line: "#405189", bg: "rgba(64,81,137,0.05)",   badge: { bg: "#e8ecf8", color: "#405189" } },
    closed:  { line: "#f06548", bg: "rgba(240,101,72,0.05)",  badge: { bg: "#fde8e8", color: "#9b1c1c" } },
  };

  const COLS=[
    {key:"gitlab_mr_id",     label:"ID",           sortable:true },
    {key:"title",            label:"Titre",         sortable:true },
    {key:"author",           label:"Contributeurs", sortable:true, tooltip:"Auteur, reviewer(s) et assignee(s)" },
    {key:"project",          label:"Projet",        sortable:true },
    {key:"state",            label:"Statut",        sortable:true },
    {key:"approved",         label:"Approuvé",      sortable:false},
    {key:"commits_count",    label:"Commits",       sortable:true, tooltip:"Commits dans la MR" },
    {key:"time_to_approve",  label:"Revue",         sortable:true, tooltip:"Délai d'approbation (h) ou Lead Time DORA" },
    {key:"created_at_gitlab",label:"Créée",         sortable:true },
    {key:"_actions",         label:"",              sortable:false},
  ];

  return (
    <div className="mr-table-premium-card">
      {/* ── En-tête de la carte ── */}
      <div className="mr-table-header">
        <div className="mr-table-header-left">
          <div className="mr-table-header-icon">
            <i className="ri-git-pull-request-line"></i>
          </div>
          <div>
            <h5 className="mr-table-title">Merge Requests</h5>
            <p className="mr-table-subtitle">Liste complète des MRs correspondant aux filtres actifs</p>
          </div>
          <span className="mr-count-badge">{mrs.length} MRs</span>
        </div>
        <button onClick={exportCSV} className="mr-export-btn">
          <i className="ri-download-2-line"></i>
          <span>Export CSV</span>
        </button>
      </div>

      {/* ── Corps du tableau ── */}
      <div className="mr-table-body">
        <div className="table-responsive">
          <table className="mr-table">
            <thead>
              <tr className="mr-table-head-row">
                {COLS.map(col => (
                  <th key={col.key}
                    className={`mr-th ${col.sortable ? 'mr-th-sortable' : ''} ${sortKey === col.key ? 'mr-th-active' : ''}`}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    title={col.tooltip}
                  >
                    <span className="mr-th-inner">
                      {col.label}
                      {col.tooltip && <span className="mr-th-info">ⓘ</span>}
                      {col.sortable && (
                        <span className="mr-sort-icon">
                          {sortKey === col.key
                            ? (sortDir === "asc" ? <i className="ri-arrow-up-line"></i> : <i className="ri-arrow-down-line"></i>)
                            : <i className="ri-arrow-up-down-line opacity-25"></i>
                          }
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} className="mr-empty-state">
                    <div className="mr-empty-icon"><i className="ri-git-merge-line"></i></div>
                    <p className="mr-empty-title">Aucun résultat</p>
                    <p className="mr-empty-sub">Essayez d'ajuster vos filtres</p>
                  </td>
                </tr>
              ) : paginated.map((mr, i) => {
                const accent = STATE_ACCENT[mr.state] || STATE_ACCENT.opened;
                const stateCfg = STATE_CFG[mr.state] || STATE_CFG.opened;
                const aCol = avatarColor(mr.author || "");
                const isApproved = mr.approved === true || mr.approved === 1;
                const isAuthorSelected = selectedDev && (mr.developer_id === parseInt(filters.developerId) || (mr.author || "").toLowerCase().includes(selectedDevName));
                const isReviewerSelected = selectedDev && (mr.reviewer || "").toLowerCase().includes(selectedDevName);
                const isAssigneeSelected = selectedDev && (mr.assignee || "").toLowerCase().includes(selectedDevName);
                const isHovered = hoveredRow === i;

                return (
                  <tr
                    key={i}
                    className="mr-table-row"
                    style={{
                      background: isHovered ? accent.bg : 'transparent',
                      borderLeft: `3px solid ${isHovered ? accent.line : 'transparent'}`,
                    }}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* ── ID & Lot ── */}
                    <td className="mr-td">
                      <div className="mr-id-cell">
                        <span className="mr-id-chip">!{mr.gitlab_mr_id}</span>
                        {mr.extraction_lot_id && (
                          <span
                            className="mr-lot-chip"
                            title={`Lot d'extraction #${mr.extraction_lot_id}`}
                            style={{
                              background: getLotColor(mr.extraction_lot_id).bg,
                              color: getLotColor(mr.extraction_lot_id).text,
                              border: `1px solid ${getLotColor(mr.extraction_lot_id).text}33`,
                            }}
                          >
                            #{String(mr.extraction_lot_id || "")}
                          </span>
                        )}
                        {mr.is_draft && <span className="mr-draft-chip">Draft</span>}
                      </div>
                    </td>

                    {/* ── Titre ── */}
                    <td className="mr-td" style={{ maxWidth: 280 }}>
                      <div
                        className="mr-title-text"
                        title={String(mr.title || "")}
                        onClick={() => onDetail(mr)}
                      >
                        {String(mr.title || "")}
                      </div>
                    </td>

                    {/* ── Contributeurs ── */}
                    <td className="mr-td">
                      <div className="mr-contrib-cell">
                        <div
                          className="mr-avatar"
                          style={{ background: aCol.bg, color: aCol.text }}
                        >
                          {String(getInitials(mr.author) || "")}
                        </div>
                        <div className="mr-contrib-info">
                          <div className="mr-contrib-author-row">
                            <span className="mr-contrib-name">{String(mr.author || "Unknown")}</span>
                            <span
                              className="mr-role-badge mr-role-author"
                              style={{ boxShadow: isAuthorSelected ? "0 0 0 2px #405189" : "none" }}
                            >
                              <i className="ri-quill-pen-line"></i> Auteur
                            </span>
                          </div>
                          <div className="mr-contrib-roles">
                            {mr.reviewer && (
                              <span
                                className="mr-role-badge mr-role-reviewer"
                                style={{ boxShadow: isReviewerSelected ? "0 0 0 2px #0a7a6a" : "none" }}
                              >
                                <i className="ri-eye-line"></i> {String(mr.reviewer || "")}
                              </span>
                            )}
                            {mr.assignee && mr.assignee !== mr.reviewer && (
                              <span
                                className="mr-role-badge mr-role-assignee"
                                style={{ boxShadow: isAssigneeSelected ? "0 0 0 2px #5b21b6" : "none" }}
                              >
                                <i className="ri-task-line"></i> {String(mr.assignee || "")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* ── Projet ── */}
                    <td className="mr-td">
                      <div className="mr-project-cell">
                        <i className="ri-folder-3-line mr-project-icon"></i>
                        <span className="mr-project-name">{String(mr.project || "Unknown")}</span>
                      </div>
                    </td>

                    {/* ── Statut ── */}
                    <td className="mr-td">
                      <span
                        className="mr-status-badge"
                        style={{
                          background: stateCfg.bg,
                          color: stateCfg.color,
                          boxShadow: `0 2px 8px ${accent.line}30`,
                        }}
                      >
                        <i className={stateCfg.icon}></i>
                        {stateCfg.label}
                      </span>
                    </td>

                    {/* ── Approuvé ── */}
                    <td className="mr-td">
                      {isApproved ? (
                        <span className="mr-approved-badge">
                          <i className="ri-shield-check-line"></i> Yes
                        </span>
                      ) : (
                        <span className="mr-null-dash">—</span>
                      )}
                    </td>

                    {/* ── Commentaires ── */}
                    <td className="mr-td">
                      <div className="mr-counter-cell">
                        <i className="ri-chat-1-line mr-counter-icon"></i>
                        <span className="mr-counter-val">{String(mr.user_notes_count || 0)}</span>
                      </div>
                    </td>

                    {/* ── Commits ── */}
                    <td className="mr-td">
                      <div className="mr-counter-cell">
                        <i className="ri-git-commit-line mr-counter-icon"></i>
                        <span className="mr-counter-val">{String(mr.commits_count || 0)}</span>
                      </div>
                    </td>

                    {/* ── Revue ── */}
                    {(() => {
                      const rt = reviewTime(mr);
                      if (!rt) return <td className="mr-td"><span className="mr-null-dash">—</span></td>;
                      const reviewColor = rt.hours === 0 ? "#0ab39c" : rt.hours < 2 ? "#0ab39c" : rt.hours < 24 ? "#f7b84b" : "#f06548";
                      const reviewBg   = rt.hours === 0 ? "#ecfdf5" : rt.hours < 2 ? "#ecfdf5" : rt.hours < 24 ? "#fffbeb" : "#fef2f2";
                      return (
                        <td className="mr-td">
                          <span
                            className="mr-review-badge"
                            style={{ background: reviewBg, color: reviewColor }}
                            title={rt.isExact ? "Temps d'approbation exact" : "Lead Time DORA : merged_at − created_at"}
                          >
                            <i className="ri-timer-flash-line"></i>
                            {rt.isExact ? "" : "~"}{rt.hours === 0 ? "Instant" : `${rt.hours.toFixed(1)}h`}
                            {!rt.isExact && <span style={{ opacity: 0.55, fontSize: 9, marginLeft: 2 }}>ⓘ</span>}
                          </span>
                        </td>
                      );
                    })()}

                    {/* ── Créée ── */}
                    <td className="mr-td">
                      <div className="mr-date-cell">
                        <span className="mr-date-main">
                          <i className="ri-calendar-line mr-date-icon"></i>
                          {fmtDate(mr.created_at_gitlab)}
                        </span>
                        {mr.updated_at_gitlab && (
                          <span className="mr-date-sub" title="Dernière activité">
                            <i className="ri-history-line"></i> {fmtDate(mr.updated_at_gitlab)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* ── Action ── */}
                    <td className="mr-td">
                      <button
                        onClick={() => onDetail(mr)}
                        className="mr-detail-btn"
                        title="Voir le détail"
                      >
                        <i className="ri-eye-line"></i>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="mr-pagination">
          <p className="mr-pagination-info">
            Affichage <strong>{Math.min((page - 1) * perPage + 1, sorted.length)}–{Math.min(page * perPage, sorted.length)}</strong> sur <strong>{sorted.length}</strong> résultats
          </p>
          <div className="mr-pagination-controls">
            <button
              className="mr-page-btn"
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
            >
              <i className="ri-arrow-left-s-line"></i>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => Math.abs(p - page) <= 2)
              .map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`mr-page-btn ${p === page ? 'mr-page-active' : ''}`}
                >
                  {p}
                </button>
              ))}
            <button
              className="mr-page-btn"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
            >
              <i className="ri-arrow-right-s-line"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const INITIAL_FILTERS = {
  search: "",
  lot: "all",
  period: "all",
  state: "all",
  project: "all",
  developerId: "all",
  role: "all",
  approved: "all",
  dataScope: "kpi"
};
// [SENIOR UTILS] Extraction unique des projets pour la liste déroulante
const extractProjects = (mrs) => {
  if (!mrs || !Array.isArray(mrs)) return [];
  // On s'assure d'extraire des chaînes de caractères (noms de projets)
  const names = [...new Set(mrs.map(m => {
    if (typeof m.project === "object" && m.project !== null) return m.project.name || m.project.id;
    return m.project;
  }).filter(Boolean))];
  
  return names
    .map(n => ({ id: String(n), name: String(n) }))
    .sort((a,b) => String(a.name).localeCompare(String(b.name)));
};

export default function MergePage() {
  const [allMrs,   setAllMrs]   = useState([]);
  const [projects, setProjects]  = useState([]);
  const [lots,     setLots]      = useState([]);    
  const [periods,  setPeriods]   = useState([]);
  const [developers, setDevelopers] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    ...INITIAL_FILTERS,
    project: searchParams.get("project_id") || searchParams.get("project") || "all",
    lot: searchParams.get("lot_id") || "all",
    period: searchParams.get("period_id") || "all",
    developerId: searchParams.get("developer_id") || "all"
  });
  const [error,    setError]    = useState(null);
  const [detailMr, setDetailMr] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState(null);

  const selectedPeriodObj = useMemo(() => {
    if (filters.period === "all" || !periods || periods.length === 0) return null;
    return periods.find(p => String(p.id) === String(filters.period));
  }, [periods, filters.period]);

  useEffect(() => {
    // Phase 1 : Load configuration metadata (Projects and Periods)
    const initData = async () => {
      try {
        const [projRes, perRes, currRes] = await Promise.all([
          api.get("/projects"),
          api.get("/periods"),
          api.get("/periods/current").catch(() => ({ data: null }))
        ]);
        const projsData = Array.isArray(projRes.data) ? projRes.data : (projRes.data?.items ?? []);
        const periodsData = Array.isArray(perRes.data) ? perRes.data : (perRes.data?.items ?? []);
        const cur = currRes.data;

        setProjects(projsData);
        setPeriods(periodsData);
        setCurrentPeriod(cur);

        // Default period logic: Only if NOT coming from a specific lot/context
        if (cur && filters.period === "all" && !searchParams.get("period_id") && !searchParams.get("lot_id")) {
          setFilters(prev => ({ ...prev, period: cur.id }));
        }
      } catch (err) {
        console.error("Erreur lors de l'initialisation des filtres:", err);
      }
    };
    initData();
  }, []); // eslint-disable-line

  // [SENIOR] URL Context Hydration (Responsive to URL changes)
  useEffect(() => {
    if (projects.length === 0 || periods.length === 0) return;

    const urlDevId = searchParams.get("developer_id");
    const urlLotId = searchParams.get("lot_id");
    const urlProjectId = searchParams.get("project_id");
    const urlPeriodId = searchParams.get("period_id");

    setFilters(prev => {
      let next = { ...prev };
      
      if (urlDevId) next.developerId = urlDevId;
      if (urlLotId) next.lot = urlLotId;
      if (urlProjectId) next.project = urlProjectId;
      if (urlPeriodId) next.period = urlPeriodId;

      // Auto-select current period ONLY if no period is in URL and no lot context
      if (currentPeriod && next.period === "all" && !urlPeriodId && !urlLotId) {
        next.period = String(currentPeriod.id);
      }
      
      return next;
    });
  }, [searchParams, projects, periods, currentPeriod]);

  useEffect(() => {
    const fetchLots = async () => {
      try {
        let url = "/extraction-lots";
        if (filters.project !== "all") {
          const proj = projects.find(p => String(p.id) === String(filters.project)) || projects.find(p => p.name === filters.project);
          if (proj) url += `?project_id=${proj.id}`;
        }
        const response = await api.get(url);
        const fetchedLots = Array.isArray(response.data) ? response.data : (response.data?.items ?? []);
        setLots(fetchedLots);
      } catch (err) {
        console.error("Erreur lors du chargement des lots:", err);
        setLots([]);
      }
    };
    
    // Only fetch lots when projects are loaded if a project filter is active
    if (filters.project !== "all" && projects.length === 0) return;
    
    fetchLots();
  }, [filters.project, projects]);

  const load = useCallback(async()=>{
    setLoading(true); setSpinning(true);
    try {
      // 1. Fetch contextual metadata
      let devs = [];
      try {
        const periodParam = filters.period !== "all" ? `?active_only=true&period_id=${filters.period}` : "?active_only=true";
        const dRes = await api.get(`/developers${periodParam}`);
        const rawDevs = Array.isArray(dRes.data)?dRes.data:(dRes.data?.items??[]);
        // SENIOR: Strict Data Parity - Only use validated (HR/CSV) developers in filters
        devs = rawDevs.filter(d => d.is_validated === true && d.is_bot === false);
        setDevelopers(devs);
      } catch (e) {
        console.error("Metadata fetch error", e);
      }

      
      // 2. Fetch Data (Optimized Strategy)
      let data = [];
      const isGlobal = filters.project === "all";
      // Resolve project: could be a name (e.g. "fdroid-client") or a numeric ID string (e.g. "1")
      const targetProjectId = isGlobal
        ? "all"
        : projects.find(p => String(p.id) === String(filters.project))?.id
          ?? projects.find(p => p.name === filters.project)?.id;

      if (targetProjectId !== undefined) {
        const params = { 
          exclude_draft: false,
          author_only: filters.dataScope === "kpi"
        };
        // ── PRIORITÉ : lot_id prend le dessus sur period_id (drill-down depuis ExtractionLotsPage)
        if (filters.lot !== "all") {
          params.lot_id = parseInt(filters.lot);
          // Quand lot_id est fourni, on ramène TOUTES les MRs du lot (auteur + reviewer)
          // Le filtre developer_id est appliqué côté frontend via le filtre "Développeur + Rôle"
          // Cela garantit la cohérence avec le compteur "21 MRs" affiché dans le popup ExtractionLots
        } else {
          if (filters.period !== "all") params.period_id = parseInt(filters.period);
          // Hors contexte lot : filtre backend par auteur possible
          if (filters.developerId !== "all") params.developer_id = parseInt(filters.developerId);
        }

        const response = await api.get(`/projects/${targetProjectId}/merge-requests`, { params });
        const items = Array.isArray(response.data) ? response.data : (response.data?.items ?? []);
        
        data = items.map(mr => {
          const devInfo = devs.find(d => d.id === mr.developer_id);
          
          const rawRev = mr.reviewer || mr.reviewer_name;
          const revName = typeof rawRev === 'object' && rawRev !== null 
            ? (rawRev.name || rawRev.gitlab_username || "") 
            : String(rawRev || "");
            
          const rawAssig = mr.assignee || mr.assignee_name;
          const assName = typeof rawAssig === 'object' && rawAssig !== null 
            ? (rawAssig.name || rawAssig.gitlab_username || "") 
            : String(rawAssig || "");

          const rawProject = mr.project_name || projects.find(p => String(p.id) === String(mr.project_id))?.name || "Project";
          const project = typeof rawProject === "object" && rawProject !== null ? (rawProject.name || "Project") : String(rawProject);

          const rawAuthor = mr.developer || mr.author || mr.author_name;
          const authorStr = typeof rawAuthor === 'object' && rawAuthor !== null
            ? (rawAuthor.name || rawAuthor.gitlab_username || "Unknown")
            : String(rawAuthor || "Unknown");

          return {
            ...mr,
            project: project,
            author: authorStr,
            // [SENIOR ENRICHMENT] On injecte les métadonnées de site/groupe pour le filtrage
            developer: devInfo || mr.developer,
            site_id: devInfo?.primary_site_id || mr.developer?.primary_site_id || mr.site_id,
            group_ids: devInfo?.group_ids || mr.developer?.group_ids || [],
            updated_at_gitlab: mr.updated_at_gitlab,
            reviewer: revName || null,
            assignee: assName || null
          };
        });
      }

      setAllMrs(data);
      setError(null);
    } catch (err) {
      console.error("Load error", err);
      setError("Impossible de charger les merge requests.");
    } finally {
      setLoading(false); setSpinning(false);
    }
  }, [filters.project, filters.lot, filters.period, filters.developerId, projects]);


  useEffect(()=>{ load(); },[load]);

  //  SENIOR INTENT-BASED FILTERING
  // Identification des développeurs ciblés par l'extraction (Intention)
  const trackedDevIds = useMemo(() => {
    if (!lots || lots.length === 0) return [];
    if (filters.lot !== "all") {
      const selected = lots.find(l => String(l.id) === filters.lot);
      return selected?.developer_id ? [selected.developer_id] : [];
    }
    return [...new Set(lots.map(l => l.developer_id).filter(Boolean))];
  }, [lots, filters.lot]);

  // SENIOR: STATIC CONTEXTUAL FILTERING (Based on RH Assignment)
  // We first determine which developers belong to the selected project.
  const assignedDevs = useMemo(() => {
    if (!developers || developers.length === 0) return [];
    if (filters.project === "all") return developers;
    
    return developers.filter(d => 
      d.projects && d.projects.some(p => String(p.project_id) === filters.project)
    );
  }, [developers, filters.project]);

  const authorList = useMemo(() => {
    return assignedDevs
      .filter(d => d.id)
      .map(d => ({ 
        id: String(d.id), 
        name: String(d.name || d.gitlab_username || "Unknown") 
      }))
      .sort((a,b) => a.name.localeCompare(b.name));
  }, [assignedDevs]);

  const projectList = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    return projects.map(p => {
      // Robustesse : p peut être un objet {id, name} ou une simple string
      const id = p.id ?? p;
      const name = p.name ?? p;
      return {
        id: String(id),
        name: String(name)
      };
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [projects]);

  //  SENIOR AUTO-RESET : Désactivé pour permettre la navigation multi-contexte

  const activeFilterCount=useMemo(()=>Object.entries(filters).filter(([,v])=>v!==""&&v!=="all").length,[filters]);

  const activeLotIds = useMemo(() => {
    return lots
      .filter(lot => {
        const matchesPeriod = filters.period === "all" || String(lot.period_id) === String(filters.period);
        const matchesProject = filters.project === "all" || String(lot.project_id) === String(filters.project);
        return matchesPeriod && matchesProject;
      })
      .map(lot => lot.id);
  }, [lots, filters.period, filters.project]);

  const filtered = useMemo(() => {
    return allMrs.filter(mr=>{
      // ─── FILTRE PAR PÉRIMÈTRE DE DONNÉES (KPI VS ACTIVITÉ) ───────────────────
      if (filters.dataScope === "kpi") {
        // En mode KPI : on exclut les brouillons (Drafts)
        if (mr.is_draft) return false;
        
        // On restreint au lot d'extraction de la période/projet active si lot === 'all'
        if (filters.lot !== "all") {
          if (String(mr.extraction_lot_id) !== String(filters.lot)) return false;
        } else {
          if (filters.period !== "all") {
            if (!activeLotIds.includes(mr.extraction_lot_id)) return false;
          }
        }

        // Alignement strict temporel
        if (selectedPeriodObj) {
          const createdDate = new Date(mr.created_at_gitlab);
          if (createdDate.getFullYear() !== selectedPeriodObj.year || createdDate.getMonth() !== (selectedPeriodObj.month - 1)) {
            return false;
          }
        }

        // ✅ [FIX MISSION-STRICT] Filtre auteur uniquement par mission
        // En mode KPI, une MR est comptée UNIQUEMENT si son AUTEUR (developer_id)
        // a une mission sur le projet sélectionné.
        // Raison : le reviewer/assignee peut être un dev d'un autre projet (ex: Vaibhav Malik
        // qui a mission gitlab-shell peut reviewer une MR inkscape, mais cette MR ne doit PAS
        // être comptée dans les KPIs inkscape s'il en est l'auteur sans mission inkscape).
        if (filters.project !== "all" && assignedDevs.length > 0) {
          const certifiedAuthorIds = assignedDevs.map(d => d.id).filter(Boolean);
          
          // STRICT : seul l'auteur doit avoir une mission sur le projet
          const isAuthorCertified = certifiedAuthorIds.includes(mr.developer_id);
          
          if (!isAuthorCertified) return false;
        }
      }

      if (filters.dataScope === "activity" && selectedPeriodObj) {
        const createdDate = new Date(mr.created_at_gitlab);
        if (createdDate.getFullYear() !== selectedPeriodObj.year || createdDate.getMonth() !== (selectedPeriodObj.month - 1)) {
          return false;
        }
      }

      if(filters.state!=="all"&&mr.state!==filters.state)return false;
      if(filters.project!=="all"){const isNum=/^\d+$/.test(String(filters.project));const okById=isNum&&String(mr.project_id)===String(filters.project);const okByName=mr.project===filters.project;if(!okById&&!okByName)return false;}
      
      //  FILTRE PAR DÉVELOPPEUR + RÔLE — Vue 360° de la contribution
      if (filters.developerId !== "all") {
        const targetId = parseInt(filters.developerId);
        const isAuthor = mr.developer_id === targetId;
        
        if (filters.dataScope === "kpi") {
          // En mode KPI, seul le rôle d'auteur principal est retenu
          if (!isAuthor) return false;
        } else {
          // Mode Activité standard
          if (filters.role === "authored") { if (!isAuthor) return false; }
          else if (filters.role === "reviewed") { 
            // Reviewer/Assignee matching fallback to names if ID not available in MR object
            const dev = developers.find(d => d.id === targetId);
            const targetName = (dev?.name || dev?.gitlab_username || "").toLowerCase();
            const rev = (mr.reviewer || "").toLowerCase();
            if (!rev.includes(targetName)) return false; 
          }
          else if (filters.role === "assigned") {
            const dev = developers.find(d => d.id === targetId);
            const targetName = (dev?.name || dev?.gitlab_username || "").toLowerCase();
            const ass = (mr.assignee || "").toLowerCase();
            if (!ass.includes(targetName)) return false;
          }
          else {
            // "all" roles — vue inclusive
            const dev = developers.find(d => d.id === targetId);
            const targetName = (dev?.name || dev?.gitlab_username || "").toLowerCase();
            const rev = (mr.reviewer || "").toLowerCase();
            const ass = (mr.assignee || "").toLowerCase();
            if (!isAuthor && !rev.includes(targetName) && !ass.includes(targetName)) return false;
          }
        }
      } else {
        // Mode global : filtre par rôle sans sélection de développeur spécifique
        if (filters.role !== "all") {
          const authorLower = (mr.author || "").toLowerCase();
          const reviewerLower = (mr.reviewer || "").toLowerCase();
          
          // Vérifier si l'auteur est un développeur tracked
          const isTrackedAuthor = developers.some(d => 
            (d.name || "").toLowerCase() === authorLower || 
            (d.gitlab_username || "").toLowerCase() === authorLower
          );
          
          // Vérifier si le reviewer est un développeur tracked
          const isTrackedReviewer = reviewerLower && developers.some(d => 
            (d.name || "").toLowerCase() === reviewerLower || 
            (d.gitlab_username || "").toLowerCase() === reviewerLower
          );
          
          if (filters.role === "authored") {
            if (!isTrackedAuthor) return false;
          } else if (filters.role === "reviewed") {
            if (!isTrackedReviewer) return false;
          }
        }
      }

      if(filters.approved==="yes"&&!(mr.approved===true||mr.approved===1))return false;
      if(filters.approved==="no"&&(mr.approved===true||mr.approved===1))return false;
      if(filters.search){const q=filters.search.toLowerCase();if(!mr.title?.toLowerCase().includes(q)&&!mr.author?.toLowerCase().includes(q)&&!mr.project?.toLowerCase().includes(q))return false;}
      return true;
    });
  }, [allMrs, filters, activeLotIds, developers, assignedDevs, selectedPeriodObj]);

  const kpis=useMemo(()=>{
    const total=filtered.length, merged=filtered.filter(m=>m.state==="merged").length, opened=filtered.filter(m=>m.state==="opened").length, closed=filtered.filter(m=>m.state==="closed").length, approved=filtered.filter(m=>m.approved===true||m.approved===1).length;
    const mergeRate=total>0?Math.round((merged/total)*100):0;
    const withTime = filtered
      .map(m => reviewTime(m))
      .filter(rt => rt !== null && rt.hours > 0);
    const avgReview=withTime.length?(withTime.reduce((s,rt)=>s+rt.hours,0)/withTime.length).toFixed(1):null;
    return{total,merged,opened,closed,approved,mergeRate,avgReview};
  },[filtered]);

  const setFilter=(key,value)=>setFilters(prev=>({...prev,[key]:value}));

  if(loading)return(
    <div className="page-content"><div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:400,gap:16}}><div className="spinner-border text-primary" style={{width:"3rem",height:"3rem"}}></div><p style={{color:"#878a99",margin:0}}>Loading merge requests…</p></div></div>
  );
  if(error)return(
    <div className="page-content"><div className="container-fluid"><div style={{background:"#fde8e8",border:"1px solid #f98080",borderRadius:8,padding:"16px 20px",color:"#9b1c1c",display:"flex",alignItems:"center",gap:12}}><i className="ri-error-warning-line" style={{fontSize:22}}></i><div><strong>Unable to load data</strong><p style={{margin:"4px 0 8px"}}>{error}</p><button onClick={load} style={{background:"#9b1c1c",color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,cursor:"pointer"}}><i className="ri-refresh-line me-1"></i>Retry</button></div></div></div></div>
  );

  return (
    <div className="page-content"><div className="container-fluid">
      {detailMr&&<MRDetailModal mr={detailMr} onClose={()=>setDetailMr(null)}/>}

      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <h4 style={{margin:0,fontWeight:700,fontSize:18,color:"#212529"}}>
              <i className="ri-git-merge-line me-2 text-primary"></i>Merge Requests
              <span className="ms-2 badge bg-success-subtle text-success" style={{fontSize:10, verticalAlign:"middle"}}>
                <i className="ri-shield-user-line me-1"></i>Tracked Human Only
              </span>
            </h4>
            <ol className="breadcrumb" style={{margin:"4px 0 0",fontSize:13}}><li className="breadcrumb-item"><a href="#" onClick={e=>e.preventDefault()} style={{color:"#878a99",textDecoration:"none"}}>Analytics</a></li><li className="breadcrumb-item active">Merge Requests Logic</li></ol>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {activeFilterCount>0&&(
              <div style={{background:"#fef3dc",border:"1px solid #f7b84b",borderRadius:8,padding:"8px 14px",fontSize:13,color:"#b78a1e",display:"flex",alignItems:"center",gap:8}}>
                <i className="ri-filter-3-line"></i><strong>{activeFilterCount}</strong> filtre{activeFilterCount>1?"s":""} actif{activeFilterCount>1?"s":""} — <strong>{filtered.length}</strong> / <strong>{allMrs.length}</strong> MRs
              </div>
            )}
            <button className="btn btn-sm btn-soft-primary" onClick={load} disabled={spinning}>
              <i className={`ri-refresh-line me-1 ${spinning?"rotate-animation":""}`}></i>{spinning?"Chargement…":"Rafraîchir"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Bandeau de contexte Lot (visible uniquement depuis ExtractionLotsPage) */}
      {filters.lot !== "all" && (() => {
        const activeLot = lots.find(l => String(l.id) === String(filters.lot));
        const activeDev = developers.find(d => String(d.id) === String(filters.developerId));
        return (
          <div className="row mb-3">
            <div className="col-12">
              <div className="alert alert-info border-0 d-flex align-items-center gap-3 py-2 px-4" 
                style={{ borderRadius: 10, background: "linear-gradient(90deg, #eff6ff, #f0fdf4)", borderLeft: "4px solid #3b82f6 !important" }}>
                <i className="ri-stack-line fs-18 text-primary"></i>
                <div className="flex-grow-1">
                  <span className="fw-bold text-primary me-2">Extraction Lot #{String(filters.lot || "")}</span>
                  {activeDev && <span className="text-dark me-2">- {String(activeDev.name || activeDev.gitlab_username || "")}</span>}
                  {activeLot && <span className="text-muted fs-12">| Capturé le {new Date(activeLot.created_at || activeLot.started_at).toLocaleDateString("fr-FR")}</span>}
                  <span className="badge bg-primary-subtle text-primary ms-2 fs-11">
                    {filtered.length} MR{filtered.length !== 1 ? "s" : ""} dans ce lot
                  </span>
                </div>
                <a href="/extraction-lots" className="btn btn-sm btn-soft-primary d-flex align-items-center gap-1" style={{ whiteSpace: "nowrap" }}>
                  <i className="ri-arrow-left-line"></i> Retour aux lots
                </a>
              </div>
            </div>
          </div>
        );
      })()}

      <FilterBar filters={filters} onChange={setFilter} projects={projectList} authors={authorList} activeCount={activeFilterCount} onReset={()=>setFilters(INITIAL_FILTERS)} availableLots={lots} availablePeriods={periods}/>

      <div className="kpi-grid-row">
        <KPICard icon="ri-git-pull-request-line" label="Total MRs"   value={kpis.total}  bg="#e8ecf8" color="#405189" sub={`${kpis.mergeRate}% merge rate`}/>
        <KPICard icon="ri-git-merge-line"        label="Merged"       value={kpis.merged} bg="#d4f5f0" color="#0a7a6a" sub="Cliquer pour filtrer" onClick={()=>setFilter("state",filters.state==="merged"?"all":"merged")} active={filters.state==="merged"}/>
        <KPICard icon="ri-git-pull-request-fill" label="Open"         value={kpis.opened} bg="#d7edf9" color="#1a6fa3" sub="Cliquer pour filtrer" onClick={()=>setFilter("state",filters.state==="opened"?"all":"opened")} active={filters.state==="opened"}/>
        <KPICard icon="ri-shield-check-line"     label="Approved"     value={kpis.approved} bg="#fef3dc" color="#b78a1e" sub="Prêt à merger"/>
        {kpis.avgReview&&<KPICard icon="ri-timer-line" label="Moy. Revue" value={`${kpis.avgReview}h`} bg="#ede9fb" color="#5b21b6" sub="Temps d'approbation"/>}
      </div>

      {/* ── Dashboard Content : data is available and matches filters ──────── */}
      {!loading && !error && allMrs.length > 0 && filtered.length > 0 && (
        <>
          <div className="row">
            <div className="col-xl-4"><StatusDonut opened={kpis.opened} merged={kpis.merged} closed={kpis.closed}/></div>
            <div className="col-xl-8">
              <TopContributors mrs={filtered} selectedAuthor={filters.author} developers={developers} assignedDevs={assignedDevs} filters={filters} />
            </div>
          </div>
          <div className="row">
            <div className="col-12"><MRTable mrs={filtered} onDetail={setDetailMr} lots={lots} filters={filters} developers={developers} selectedPeriodObj={selectedPeriodObj}/></div>
          </div>
          <div className="row">
            <div className="col-12"><ProjectsBreakdown mrs={filtered}/></div>
          </div>
        </>
      )}

      {/* ── Empty state : filtre actif mais 0 résultat de recherche ──────── */}
      {!loading && !error && allMrs.length > 0 && filtered.length === 0 && (
        <div className="card shadow-none border-0 py-5 text-center" style={{background: "transparent"}}>
          <div className="card-body">
            <div className="mb-4">
              <i className="ri-search-line display-4 text-muted opacity-25"></i>
            </div>
            <h4 className="fw-bold">Aucune MR ne correspond</h4>
            <p className="text-muted mx-auto mb-4" style={{maxWidth: 450}}>
              Aucune Merge Request n'a été trouvée avec les filtres actuels. 
              Réessayez avec d'autres critères ou réinitialisez les filtres.
            </p>
            <button className="btn btn-soft-primary" onClick={() => setFilters(INITIAL_FILTERS)}>
              <i className="ri-refresh-line me-1"></i>Réinitialiser les filtres
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state : Aucune donnée extraite pour cette période/projet ── */}
      {!loading && !error && allMrs.length === 0 && (
        <div className="card border-0" style={{borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.05)"}}>
          <div className="card-body py-5 text-center">
            <div className="mb-4" style={{width: 80, height: 80, borderRadius: "50%", background: "#f0f4ff", display: "flex", alignItems: "center", justifyCenter: "center", margin: "0 auto 20px", justifyContent: "center"}}>
              <i className="ri-git-merge-line" style={{fontSize: 36, color: "#405189"}}></i>
            </div>
            <h4 className="fw-bold mb-3" style={{color: "#212529"}}>Données non disponibles</h4>
            <p className="text-muted mx-auto mb-4" style={{maxWidth: 480, fontSize: 15, lineHeight: 1.6}}>
              Il semble qu'aucune donnée de Merge Request n'ait encore été extraite pour cette période ou ce projet. 
              Veuillez lancer une extraction automatisée pour synchroniser les données GitLab.
            </p>
            <div className="d-flex justify-content-center gap-3">
              <button className="btn btn-primary px-4 py-2 fw-semibold" style={{borderRadius: 10}} onClick={() => window.location.href='/extraction'}>
                <i className="ri-rocket-2-line me-2"></i>Lancer une extraction
              </button>
              <button className="btn btn-soft-secondary px-4 py-2 fw-semibold" style={{borderRadius: 10}} onClick={load}>
                <i className="ri-refresh-line me-1"></i>Réessayer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    <style>{`
      @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      .rotate-animation{animation:spin 1s linear infinite;display:inline-block}

      /* ═══════════════════════════════════════════════════
         PREMIUM MR TABLE STYLES
      ═══════════════════════════════════════════════════ */

      /* ── Carte principale ── */
      .mr-table-premium-card {
        background: #ffffff;
        border: 1.5px solid #e2e8f0;
        border-radius: 20px;
        box-shadow: 0 4px 24px -4px rgba(15, 23, 42, 0.06), 0 1px 4px rgba(15, 23, 42, 0.04);
        overflow: hidden;
        margin-bottom: 24px;
        transition: box-shadow 0.3s ease;
      }
      .mr-table-premium-card:hover {
        box-shadow: 0 8px 32px -6px rgba(15, 23, 42, 0.1), 0 2px 8px rgba(15, 23, 42, 0.05);
      }

      /* ── En-tête de la carte ── */
      .mr-table-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1.5px solid #f1f5f9;
        background: linear-gradient(135deg, #fafbff 0%, #f8fafc 100%);
        flex-wrap: wrap;
        gap: 12px;
      }
      .mr-table-header-left {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }
      .mr-table-header-icon {
        width: 42px; height: 42px;
        background: linear-gradient(135deg, #405189, #3577f1);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 20px;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(64, 81, 137, 0.3);
      }
      .mr-table-title {
        font-size: 15px;
        font-weight: 700;
        color: #1e293b;
        margin: 0 0 2px;
      }
      .mr-table-subtitle {
        font-size: 11.5px;
        color: #94a3b8;
        margin: 0;
      }
      .mr-count-badge {
        background: linear-gradient(135deg, #e8ecf8, #dce5f7);
        color: #405189;
        font-size: 11px;
        font-weight: 700;
        padding: 4px 12px;
        border-radius: 20px;
        border: 1px solid #c7d2f0;
        letter-spacing: 0.02em;
      }
      .mr-export-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 9px 18px;
        background: linear-gradient(135deg, #d1fae5, #a7f3d0);
        border: 1.5px solid #6ee7b7;
        border-radius: 10px;
        color: #065f46;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.22s ease;
      }
      .mr-export-btn:hover {
        background: linear-gradient(135deg, #10b981, #059669);
        color: #fff;
        border-color: #059669;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        transform: translateY(-1px);
      }

      /* ── Corps du tableau ── */
      .mr-table-body { overflow: auto; }
      .mr-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      /* ── Entêtes ── */
      .mr-table-head-row {
        background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      }
      .mr-th {
        padding: 13px 16px;
        text-align: left;
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .07em;
        color: #94a3b8;
        border-bottom: 1.5px solid #e2e8f0;
        white-space: nowrap;
        user-select: none;
        position: relative;
      }
      .mr-th-sortable { cursor: pointer; transition: color 0.2s; }
      .mr-th-sortable:hover { color: #475569; }
      .mr-th-active { color: #405189; }
      .mr-th-inner {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .mr-th-info {
        font-size: 9.5px;
        color: #cbd5e1;
        cursor: help;
      }
      .mr-sort-icon { font-size: 11px; }

      /* ── Lignes du tableau ── */
      .mr-table-row {
        border-bottom: 1px solid #f0f4f8;
        transition: background 0.18s ease, border-left 0.18s ease;
        border-left: 3px solid transparent;
      }
      .mr-td {
        padding: 13px 16px;
        vertical-align: middle;
      }

      /* ── Cellule ID ── */
      .mr-id-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .mr-id-chip {
        background: linear-gradient(135deg, #e8ecf8, #dce5f7);
        color: #405189;
        border-radius: 7px;
        padding: 4px 9px;
        font-weight: 700;
        font-size: 12px;
        font-family: 'Courier New', monospace;
        border: 1px solid #c7d2f0;
        letter-spacing: -0.02em;
      }
      .mr-lot-chip {
        border-radius: 20px;
        padding: 2px 7px;
        font-size: 10px;
        font-weight: 700;
      }
      .mr-draft-chip {
        background: #f1f5f9;
        color: #64748b;
        border-radius: 6px;
        padding: 2px 7px;
        font-size: 10px;
        font-weight: 600;
        border: 1px solid #e2e8f0;
      }

      /* ── Titre MR ── */
      .mr-title-text {
        font-weight: 600;
        color: #1e293b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 260px;
        cursor: pointer;
        transition: color 0.18s;
        font-size: 13px;
      }
      .mr-title-text:hover { color: #405189; text-decoration: underline; }

      /* ── Contributeurs ── */
      .mr-contrib-cell { display: flex; align-items: flex-start; gap: 10px; }
      .mr-avatar {
        width: 32px; height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }
      .mr-contrib-info { display: flex; flex-direction: column; gap: 4px; }
      .mr-contrib-author-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .mr-contrib-name { font-size: 13px; font-weight: 600; color: #334155; white-space: nowrap; }
      .mr-contrib-roles { display: flex; gap: 4px; flex-wrap: wrap; }

      /* ── Badges de rôle ── */
      .mr-role-badge {
        font-size: 9.5px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
        transition: box-shadow 0.2s;
      }
      .mr-role-author   { background: #e8ecf8; color: #405189; }
      .mr-role-reviewer { background: #d4f5f0; color: #0a7a6a; }
      .mr-role-assignee { background: #ede9fb; color: #5b21b6; }

      /* ── Projet ── */
      .mr-project-cell { display: flex; align-items: center; gap: 6px; }
      .mr-project-icon { color: #94a3b8; font-size: 14px; }
      .mr-project-name { font-size: 12.5px; color: #475569; white-space: nowrap; }

      /* ── Badge Statut ── */
      .mr-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: 20px;
        font-size: 11.5px;
        font-weight: 700;
        white-space: nowrap;
        transition: box-shadow 0.2s;
      }

      /* ── Badge Approuvé ── */
      .mr-approved-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: 20px;
        background: linear-gradient(135deg, #d7edf9, #bfe5f8);
        color: #1a6fa3;
        font-size: 11.5px;
        font-weight: 700;
        border: 1px solid #93c5fd;
      }
      .mr-null-dash { color: #cbd5e1; font-size: 17px; }

      /* ── Compteurs ── */
      .mr-counter-cell {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .mr-counter-icon { color: #94a3b8; font-size: 14px; }
      .mr-counter-val { font-size: 13px; font-weight: 600; color: #475569; }

      /* ── Badge de Revue ── */
      .mr-review-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        border: 1px solid currentColor;
        border-opacity: 0.2;
      }

      /* ── Date ── */
      .mr-date-cell { display: flex; flex-direction: column; gap: 2px; }
      .mr-date-main {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 12.5px;
        font-weight: 600;
        color: #334155;
      }
      .mr-date-icon { color: #94a3b8; }
      .mr-date-sub {
        font-size: 11px;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      /* ── Bouton de détail ── */
      .mr-detail-btn {
        width: 32px; height: 32px;
        border-radius: 50%;
        border: 1.5px solid #e2e8f0;
        background: #f8fafc;
        color: #405189;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 15px;
        transition: all 0.2s ease;
      }
      .mr-detail-btn:hover {
        background: #405189;
        color: #fff;
        border-color: #405189;
        box-shadow: 0 4px 12px rgba(64, 81, 137, 0.3);
        transform: scale(1.1);
      }

      /* ── État vide ── */
      .mr-empty-state {
        text-align: center;
        padding: 60px 16px;
        color: #94a3b8;
      }
      .mr-empty-icon {
        font-size: 48px;
        opacity: 0.25;
        margin-bottom: 12px;
      }
      .mr-empty-title {
        font-size: 15px;
        font-weight: 700;
        color: #64748b;
        margin: 0 0 4px;
      }
      .mr-empty-sub {
        font-size: 13px;
        color: #94a3b8;
        margin: 0;
      }

      /* ── Pagination ── */
      .mr-pagination {
        padding: 16px 24px;
        border-top: 1.5px solid #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        background: #fafbfc;
      }
      .mr-pagination-info {
        margin: 0;
        font-size: 13px;
        color: #64748b;
      }
      .mr-pagination-info strong { color: #1e293b; }
      .mr-pagination-controls { display: flex; gap: 6px; align-items: center; }
      .mr-page-btn {
        min-width: 34px; height: 34px;
        padding: 0 8px;
        border-radius: 8px;
        border: 1.5px solid #e2e8f0;
        background: #ffffff;
        color: #475569;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }
      .mr-page-btn:hover:not(:disabled) {
        border-color: #405189;
        color: #405189;
        background: #f0f4ff;
      }
      .mr-page-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .mr-page-btn.mr-page-active {
        background: linear-gradient(135deg, #405189, #3577f1);
        border-color: #405189;
        color: #ffffff;
        font-weight: 700;
        box-shadow: 0 4px 12px rgba(64, 81, 137, 0.3);
      }

      /* ── KPI Grid ─────────────────────────────────────────── */
      .kpi-grid-row {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 18px;
        margin-bottom: 28px;
      }
      @media (max-width: 1200px) { .kpi-grid-row { grid-template-columns: repeat(3, 1fr); } }
      @media (max-width: 768px)  { .kpi-grid-row { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 480px)  { .kpi-grid-row { grid-template-columns: 1fr; } }

      .kpi-card-wrapper { display: flex; flex-direction: column; }

      .kpi-card-premium {
        position: relative;
        overflow: hidden;
        background: #ffffff;
        border: 1.5px solid #e2e8f0;
        border-radius: 20px;
        padding: 24px 20px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      
      /* Hover glow corresponding to matching accents */
      .kpi-card-premium:hover {
        transform: translateY(-5px);
        border-color: var(--kpi-accent);
        box-shadow: 0 20px 30px -8px rgba(var(--kpi-accent-rgb), 0.18);
      }
      
      .kpi-card-premium.kpi-card-active {
        border-color: var(--kpi-accent);
        background: #fafcff;
        box-shadow: 0 10px 25px -5px rgba(var(--kpi-accent-rgb), 0.2);
      }
      
      .kpi-card-glow-bg {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
        opacity: 0.5;
      }
      .kpi-card-premium:hover .kpi-card-glow-bg {
        opacity: 1;
      }
      
      .kpi-card-blob {
        position: absolute;
        top: -12px; right: -12px;
        pointer-events: none;
        transition: transform 0.4s ease;
      }
      .kpi-card-premium:hover .kpi-card-blob {
        transform: scale(1.15) rotate(5deg);
      }
      
      .kpi-card-inner {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 16px;
      }
      
      .kpi-icon-wrap {
        width: 52px; height: 52px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        flex-shrink: 0;
        transition: all 0.3s ease;
      }
      .kpi-card-premium:hover .kpi-icon-wrap { 
        transform: scale(1.1) rotate(-8deg); 
      }
      
      .kpi-text { flex: 1; }
      
      .kpi-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: #64748b;
        margin-bottom: 6px;
      }
      
      .kpi-value {
        font-size: 28px;
        font-weight: 800;
        margin-bottom: 0;
        line-height: 1.1;
        letter-spacing: -1px;
      }
      
      .kpi-sub {
        font-size: 11px;
        margin-top: 8px;
        margin-bottom: 0;
      }
      
      .kpi-sub-badge {
        padding: 3px 8px;
        border-radius: 12px;
        font-weight: 600;
        font-size: 10px;
        display: inline-block;
      }
      
      .kpi-active-bar {
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 4px;
        border-radius: 0 0 20px 20px;
        opacity: 0.3;
        transition: opacity 0.3s ease;
      }
      .kpi-card-premium:hover .kpi-active-bar,
      .kpi-card-premium.kpi-card-active .kpi-active-bar {
        opacity: 1;
      }

      /* ── Premium Filter Card ──────────────────────────────── */
      .filter-card-premium {
        border: 1.5px solid #e2e8f0;
        border-radius: 20px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
        background: #ffffff;
      }

      .filter-grid-premium {
        display: grid;
        grid-template-columns: 2.2fr 1.3fr 1.3fr 1.5fr auto;
        gap: 16px;
        align-items: end;
        margin-top: 0;
      }
      @media (max-width: 1200px) { 
        .filter-grid-premium { grid-template-columns: 1fr 1fr; } 
        .filter-item-search { grid-column: 1 / -1; } 
      }
      @media (max-width: 640px)  { 
        .filter-grid-premium { grid-template-columns: 1fr; } 
      }

      .filter-item { display: flex; flex-direction: column; }
      .filter-label {
        font-size: 11px;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: .08em;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      /* Search Input */
      .filter-search-wrap { position: relative; }
      .filter-search-icon {
        position: absolute;
        left: 14px; top: 50%; transform: translateY(-50%);
        color: #64748b;
        font-size: 15px;
        pointer-events: none;
        z-index: 1;
      }
      .filter-input-premium {
        width: 100%;
        padding: 10px 14px 10px 40px;
        background: #f8fafc;
        border: 1.5px solid #cbd5e1;
        border-radius: 12px;
        font-size: 13.5px;
        color: #1e293b;
        transition: all 0.2s ease;
        outline: none;
      }
      .filter-input-premium::placeholder { color: #94a3b8; }
      .filter-input-premium:focus {
        border-color: #405189;
        background: #ffffff;
        box-shadow: 0 0 0 4px rgba(64, 81, 137, 0.12);
      }

      /* Select Inputs */
      .filter-select-wrap { position: relative; }
      .filter-select-icon {
        position: absolute;
        right: 12px; top: 50%; transform: translateY(-50%);
        color: #64748b;
        font-size: 16px;
        pointer-events: none;
      }
      .filter-select-premium {
        width: 100%;
        padding: 10px 36px 10px 14px;
        background: #f8fafc;
        border: 1.5px solid #cbd5e1;
        border-radius: 12px;
        font-size: 13.5px;
        color: #1e293b;
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
        transition: all 0.2s ease;
        outline: none;
      }
      .filter-select-premium:focus {
        border-color: #405189;
        background: #ffffff;
        box-shadow: 0 0 0 4px rgba(64, 81, 137, 0.12);
      }
      .filter-select-premium option { color: #1e293b; background: #ffffff; }

      /* Reset Button */
      .filter-item-reset { justify-content: flex-end; }
      .filter-reset-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 11px 20px;
        border-radius: 12px;
        border: 1.5px solid #cbd5e1;
        background: #f8fafc;
        color: #64748b;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.25s ease;
        white-space: nowrap;
        width: 100%;
        justify-content: center;
      }
      .filter-reset-btn:hover { 
        border-color: #94a3b8; 
        background: #f1f5f9; 
        color: #334155;
      }
      .filter-reset-btn.filter-reset-active {
        background: #fef2f2;
        border-color: #fca5a5;
        color: #dc2626;
      }
      .filter-reset-btn.filter-reset-active:hover { 
        background: #dc2626; 
        color: #ffffff; 
        border-color: #dc2626;
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
      }

      /* Premium Segmented Control */
      .premium-segmented-control {
        background: #f1f5f9; 
        padding: 4px; 
        border-radius: 14px; 
        display: inline-flex; 
        gap: 2px; 
        border: 1px solid #e2e8f0;
      }
      .segmented-btn {
        padding: 8px 18px; 
        border-radius: 10px; 
        font-size: 12px; 
        font-weight: 600; 
        cursor: pointer; 
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
        border: none;
        background: transparent;
        color: #475569;
        display: flex;
        align-items: center;
      }
      .segmented-btn.active-kpi {
        background: linear-gradient(135deg, #10b981, #059669);
        color: #ffffff;
        box-shadow: 0 4px 10px rgba(16, 185, 129, 0.25);
      }
      .segmented-btn.active-activity {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: #ffffff;
        box-shadow: 0 4px 10px rgba(245, 158, 11, 0.25);
      }

      /* Premium Small Segmented Control */
      .premium-segmented-control-small {
        background: #f1f5f9; 
        padding: 3px; 
        border-radius: 12px; 
        display: inline-flex; 
        gap: 2px; 
        border: 1px solid #e2e8f0;
      }
      .segmented-btn-small {
        padding: 6px 14px; 
        border-radius: 9px; 
        font-size: 11.5px; 
        font-weight: 600; 
        cursor: pointer; 
        transition: all 0.2s ease; 
        border: none;
        background: transparent;
        color: #475569;
      }
      .segmented-btn-small.active {
        background: #405189;
        color: #ffffff;
        box-shadow: 0 2px 6px rgba(64, 81, 137, 0.2);
      }

      /* Alert badging */
      .scope-badge-alert {
        padding: 8px 16px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s ease;
        border: 1px solid;
      }
      .scope-badge-alert.scope-kpi {
        background: #ecfdf5;
        color: #065f46;
        border-color: #a7f3d0;
      }
      .scope-badge-alert.scope-activity {
        background: #fffbeb;
        color: #92400e;
        border-color: #fde68a;
      }
      .icon-kpi { color: #10b981; }
      .icon-activity { color: #f59e0b; }

      .role-warning-badge {
        font-size: 11px;
        color: #b45309;
        background: #fffbeb;
        padding: 4px 10px;
        border-radius: 8px;
        border: 1px solid #fde68a;
        display: inline-flex;
        align-items: center;
      }

      /* Premium Tags */
      .premium-filter-tag {
        border-radius: 10px;
        padding: 5px 12px;
        font-size: 11.5px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.01);
      }
      .premium-filter-tag-close {
        background: none;
        border: none;
        padding: 0 0 0 4px;
        cursor: pointer;
        color: inherit;
        line-height: 1;
        font-size: 13px;
        font-weight: 700;
        opacity: 0.6;
        transition: opacity 0.2s;
      }
      .premium-filter-tag-close:hover { opacity: 1; }
    `}</style>
    </div>
  );
}
