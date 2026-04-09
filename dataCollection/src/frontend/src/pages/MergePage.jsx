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

const STATE_CFG={
  merged:{label:"Merged",icon:"ri-git-merge-line",       bg:"#d1f3e0",color:"#0f6848"},
  opened:{label:"Open",  icon:"ri-git-pull-request-line",bg:"#dce9ff",color:"#1a56db"},
  closed:{label:"Closed",icon:"ri-close-circle-line",    bg:"#fde8e8",color:"#9b1c1c"},
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
                {icon: "ri-chat-1-line",       label: "Comm.",    value: mr.user_notes_count || 0},
                {icon: "ri-git-commit-line",   label: "Commits",  value: mr.commits_count || 0},
                {icon:"ri-time-line",          label:"Délai",   value:timeSince(mr.created_at_gitlab)},
                {icon:"ri-check-double-line",  label:"Temps revue", value: (() => {
                    const rt = reviewTime(mr);
                    if (!rt) return "—";
                    const label = rt.hours === 0 ? "Instant" : `${rt.hours.toFixed(1)}h`;
                    return rt.isExact ? label : `~${label} (Lead Time)`;
                  })()},
              ].map((item,i)=>(
                <div key={i} className={item.label === "Comm." || item.label === "Commits" ? "col-3" : "col-6"}>
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
  return (
    <div className="col-xl-3 col-md-6">
      <div className="card card-animate overflow-hidden" onClick={onClick}
        style={{cursor:onClick?"pointer":"default",border:active?`2px solid ${color}`:"1px solid #e9ebec",transition:"all .2s"}}>
        <div className="position-absolute start-0" style={{zIndex:0}}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200" height="120">
            <path style={{opacity:0.06,fill:color}} d="m189.5-25.8c0 0 20.1 46.2-26.7 71.4 0 0-60 15.4-62.3 65.3-2.2 49.8-50.6 59.3-57.8 61.5-7.2 2.3-60.8 0-60.8 0l-11.9-199.4z"/>
          </svg>
        </div>
        <div className="card-body" style={{zIndex:1}}>
          <div className="d-flex align-items-center gap-3">
            <div style={{width:52,height:52,borderRadius:"50%",background:bg,color,fontSize:24,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className={icon}></i></div>
            <div><p style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",color:"#878a99",marginBottom:4}}>{label}</p><h4 style={{fontSize:26,fontWeight:700,color,marginBottom:0}}>{value}</h4>{sub&&<p style={{fontSize:11,color:"#878a99",marginTop:4,marginBottom:0}}>{sub}</p>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FilterTag ────────────────────────────────────────────────────────────────
function FilterTag({ label, onRemove, color="#f0f0f0", textColor="#495057" }) {
  return (
    <span style={{background:color,color:textColor,borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:600,display:"inline-flex",alignItems:"center",gap:6}}>
      {label}
      <button onClick={onRemove} style={{background:"none",border:"none",padding:0,cursor:"pointer",color:textColor,lineHeight:1,fontSize:14}}>×</button>
    </span>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({ filters, onChange, projects, authors, activeCount, onReset, availableLots = [] }) {
  return (
    <div className="card mb-3"><div className="card-body pb-2">
      <div className="row g-2 align-items-end">
        <div className="col-xl-2 col-md-6"><label className="form-label fs-12 text-muted fw-semibold mb-1"><i className="ri-search-line me-1"></i>Search</label><div className="search-box"><input type="text" className="form-control form-control-sm" placeholder="Title, author, project…" value={filters.search} onChange={e=>onChange("search",e.target.value)}/><i className="ri-search-line search-icon"></i></div></div>
        
        <div className="col-xl-2 col-md-3">
          <label className="form-label fs-12 text-muted fw-semibold mb-1"><i className="ri-stack-line me-1"></i>Session (Lot)</label>
          <select className="form-select form-select-sm" value={filters.lot} onChange={e=>onChange("lot",e.target.value)}>
            <option value="all">Toutes les extractions</option>
            {availableLots.map(l => (
              <option key={l.id} value={l.id}>
                {l.extraction_type} - {l.period?.name || `Lot #${l.id}`} ({new Date(l.created_at).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        <div className="col-xl-1 col-md-3"><label className="form-label fs-12 text-muted fw-semibold mb-1"><i className="ri-git-branch-line me-1"></i>Status</label><select className="form-select form-select-sm" value={filters.state} onChange={e=>onChange("state",e.target.value)}><option value="all">All statuses</option><option value="opened">Open</option><option value="merged">Merged</option><option value="closed">Closed</option></select></div>
        <div className="col-xl-2 col-md-3"><label className="form-label fs-12 text-muted fw-semibold mb-1"><i className="ri-folder-2-line me-1"></i>Project</label><select className="form-select form-select-sm" value={filters.project} onChange={e=>onChange("project",e.target.value)}><option value="all">All projects</option>{projects.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
        <div className="col-xl-1 col-md-3"><label className="form-label fs-12 text-muted fw-semibold mb-1"><i className="ri-user-line me-1"></i>Author</label><select className="form-select form-select-sm" value={filters.author} onChange={e=>onChange("author",e.target.value)}><option value="all">All</option>{authors.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
        <div className="col-xl-1 col-md-3"><label className="form-label fs-12 text-muted fw-semibold mb-1"><i className="ri-shield-check-line me-1"></i>Approved</label><select className="form-select form-select-sm" value={filters.approved} onChange={e=>onChange("approved",e.target.value)}><option value="all">All</option><option value="yes">Yes</option><option value="no">No</option></select></div>
        <div className="col-xl-1 col-md-3"><label className="form-label fs-12 text-muted fw-semibold mb-1"><i className="ri-calendar-line me-1"></i>From</label><input type="date" className="form-control form-control-sm" value={filters.dateFrom} onChange={e=>onChange("dateFrom",e.target.value)}/></div>
        <div className="col-xl-1 col-md-3"><label className="form-label fs-12 mb-1 d-block">To</label><input type="date" className="form-control form-control-sm" value={filters.dateTo} onChange={e=>onChange("dateTo",e.target.value)}/></div>
        <div className="col-xl-1 col-md-3"><label className="form-label fs-12 mb-1 d-block">&nbsp;</label><button onClick={onReset} className="btn btn-sm w-100" style={{background:activeCount>0?"#f06548":"#f0f0f0",color:activeCount>0?"#fff":"#878a99",border:"none",fontWeight:600,transition:"all .2s"}}>{activeCount>0?<><i className="ri-close-line me-1"></i>{activeCount}</>:<i className="ri-filter-off-line"></i>}</button></div>
      </div>
      {activeCount>0&&(
        <div className="d-flex flex-wrap gap-2 mt-2">
          {filters.search&&<FilterTag label={`"${filters.search}"`} onRemove={()=>onChange("search","")}/>}
          {filters.lot!=="all"&&<FilterTag label={`Session: #${filters.lot}`} onRemove={()=>onChange("lot","all")} color="#ede9fb" textColor="#5b21b6"/>}
          {filters.state!=="all"&&<FilterTag label={`Status: ${STATE_CFG[filters.state]?.label}`} onRemove={()=>onChange("state","all")} color="#dce9ff" textColor="#1a56db"/>}
          {filters.project!=="all"&&<FilterTag label={`Project: ${filters.project}`} onRemove={()=>onChange("project","all")} color="#e8ecf8" textColor="#405189"/>}
          {filters.author!=="all"&&<FilterTag label={`Author: ${filters.author}`} onRemove={()=>onChange("author","all")} color="#ede9fb" textColor="#5b21b6"/>}
          {filters.approved!=="all"&&<FilterTag label={`Approved: ${filters.approved}`} onRemove={()=>onChange("approved","all")} color="#d7edf9" textColor="#1a6fa3"/>}
        </div>
      )}
    </div></div>
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
function TopContributors({ mrs, selectedAuthor }) {
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
          <span className="badge bg-success-subtle text-success">{selectedAuthor}</span>
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
  const map={};
  mrs.forEach(mr=>{ const a=mr.author||"Unknown"; if(!map[a])map[a]={total:0,merged:0,opened:0}; map[a].total++; if(mr.state==="merged")map[a].merged++; if(mr.state==="opened")map[a].opened++; });
  const top=Object.entries(map).sort((a,b)=>b[1].total-a[1].total).slice(0,7);
  return (
    <div className="card h-100">
      <div className="card-header d-flex align-items-center"><h5 className="card-title mb-0 flex-grow-1"><i className="ri-user-star-line me-2 text-primary"></i>Top Contributors</h5><span className="badge bg-primary-subtle text-primary">Top {top.length}</span></div>
      <div className="card-body">
        {!top.length?<div className="text-center text-muted py-4">No contributor data</div>:(
          <>
            <ReactApexChart type="bar" height={210}
              series={[{name:"Merged",data:top.map(([,v])=>v.merged)},{name:"Open",data:top.map(([,v])=>v.opened)}]}
              options={{chart:{type:"bar",stacked:true,toolbar:{show:false},fontFamily:"Poppins, sans-serif"},plotOptions:{bar:{horizontal:true,borderRadius:4,borderRadiusApplication:"end"}},colors:["#0ab39c","#405189"],xaxis:{categories:top.map(([name])=>name.split(" ")[0]),labels:{style:{fontFamily:"Poppins, sans-serif",fontSize:"11px"}}},yaxis:{labels:{style:{fontFamily:"Poppins, sans-serif",fontSize:"11px"}}},legend:{position:"top",fontFamily:"Poppins, sans-serif",fontSize:"12px"},grid:{borderColor:"rgba(133,141,152,0.1)"},tooltip:{y:{formatter:v=>`${v} MRs`},shared:true,intersect:false},dataLabels:{enabled:false}}}/>
            <div className="mt-2">
              {top.map(([name,v],i)=>{
                const rate=Math.round((v.merged/v.total)*100);
                const col=avatarColor(name);
                return (
                  <div key={i} className="d-flex align-items-center gap-2 mb-2">
                    <span style={{width:26,height:26,borderRadius:"50%",background:col.bg,color:col.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0}}>{getInitials(name)}</span>
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
  mrs.forEach(mr=>{ const p=mr.project||"Unknown"; if(!map[p])map[p]={total:0,merged:0,opened:0,closed:0}; map[p].total++; if(map[p][mr.state]!==undefined)map[p][mr.state]++; });
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
                    <span style={{fontSize:13,fontWeight:600,color:"#212529",maxWidth:"60%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><i className="ri-folder-2-line me-1" style={{color}}></i>{name}</span>
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
function MRTable({ mrs, onDetail }) {
  const [page,   setPage]   = useState(1);
  const [sortKey,setSortKey]= useState("created_at_gitlab");
  const [sortDir,setSortDir]= useState("desc");
  const perPage=10;
  useEffect(()=>setPage(1),[mrs]);

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
  const SortIcon=({k})=>{ if(sortKey!==k)return<i className="ri-arrow-up-down-line ms-1 opacity-25"></i>; return sortDir==="asc"?<i className="ri-arrow-up-line ms-1 text-primary"></i>:<i className="ri-arrow-down-line ms-1 text-primary"></i>; };

  // ✅ FIX : URL.revokeObjectURL(url) ajouté après a.click() — anti memory-leak
  const exportCSV=()=>{
    const headers=["ID","Title","Author","Project","Status","Approved","Draft","Created","Time to approve (h)"];
    const rows=sorted.map(mr=>[`!${mr.gitlab_mr_id}`,`"${(mr.title||"").replace(/"/g,'""')}"`,mr.author||"",mr.project||"",mr.state||"",mr.approved?"Yes":"No",mr.is_draft?"Yes":"No",mr.created_at_gitlab?new Date(mr.created_at_gitlab).toLocaleDateString("fr-FR"):"",mr.time_to_approve!=null?mr.time_to_approve.toFixed(1):""]);
    const csv=[headers,...rows].map(r=>r.join(",")).join("\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
    const a=document.createElement("a");
    a.href=url; a.download="merge_requests.csv"; a.click();
    URL.revokeObjectURL(url); // ✅ FIX
  };

  const COLS=[
    {key:"gitlab_mr_id",     label:"ID",      sortable:true },
    {key:"title",            label:"Title",   sortable:true },
    {key:"author",           label:"Author",  sortable:true },
    {key:"project",          label:"Project", sortable:true },
    {key:"state",            label:"Status",  sortable:true },
    {key:"approved",         label:"Approved",sortable:false},
    {key:"user_notes_count", label:"Comms",   sortable:true },
    {key:"commits_count",    label:"Commits", sortable:true },
    {key:"time_to_approve",  label:"Revue",   sortable:true },
    {key:"created_at_gitlab",label:"Created", sortable:true },
    {key:"_actions",         label:"",        sortable:false},
  ];

  return (
    <div className="card">
      <div className="card-header d-flex align-items-center gap-3">
        <h5 className="card-title mb-0 flex-grow-1">
          <i className="ri-git-pull-request-line me-2 text-primary"></i>Merge Requests
          <span style={{marginLeft:10,background:"#e8ecf8",color:"#405189",fontSize:11,fontWeight:700,borderRadius:20,padding:"2px 10px"}}>{mrs.length}</span>
        </h5>
        <button onClick={exportCSV} className="btn btn-sm btn-soft-success"><i className="ri-download-2-line me-1"></i>Export CSV</button>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13.5px"}}>
            <thead><tr style={{background:"#f8f9fa"}}>
              {COLS.map(col=>(
                <th key={col.key} onClick={col.sortable?()=>handleSort(col.key):undefined}
                  style={{padding:"12px 16px",textAlign:"left",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:"#878a99",borderBottom:"1px solid #e9ebec",whiteSpace:"nowrap",cursor:col.sortable?"pointer":"default",userSelect:"none"}}>
                  {col.label}{col.sortable&&<SortIcon k={col.key}/>}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {paginated.length===0?(
                <tr><td colSpan={COLS.length} style={{textAlign:"center",padding:"52px 16px",color:"#878a99"}}><div style={{fontSize:40,marginBottom:10,opacity:.3}}><i className="ri-git-merge-line"></i></div><p style={{margin:0,fontSize:14,fontWeight:600}}>No results found</p><p style={{margin:"4px 0 0",fontSize:12}}>Try adjusting your filters</p></td></tr>
              ):paginated.map((mr,i)=>{
                const cfg=STATE_CFG[mr.state]||STATE_CFG.opened;
                const aCol=avatarColor(mr.author||"");
                const isApproved=mr.approved===true||mr.approved===1;
                return (
                  <tr key={i} style={{borderBottom:"1px solid #f0f0f0",transition:"background .12s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f8f9fc"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"14px 16px"}}><code style={{background:"#e8ecf8",color:"#405189",borderRadius:4,padding:"3px 8px",fontWeight:700,fontSize:12}}>!{mr.gitlab_mr_id}</code>{mr.is_draft&&<span style={{marginLeft:4,background:"#f0f0f0",color:"#6c757d",borderRadius:4,padding:"2px 6px",fontSize:10,fontWeight:600}}>Draft</span>}</td>
                    <td style={{padding:"14px 16px",maxWidth:260}}><div style={{fontWeight:600,color:"#212529",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:240,cursor:"pointer"}} title={mr.title} onClick={()=>onDetail(mr)}>{mr.title}</div></td>
                    <td style={{padding:"14px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{width:30,height:30,borderRadius:"50%",background:aCol.bg,color:aCol.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{getInitials(mr.author)}</span>
                        <div style={{display:"flex",flexDirection:"column"}}>
                          <span style={{color:"#495057",fontSize:13,whiteSpace:"nowrap",fontWeight:600}}>{mr.author||"Unknown"}</span>
                          <div style={{display: "flex", gap: "4px", marginTop: "2px", flexWrap: "wrap"}}>
                            {mr.reviewer && <span style={{fontSize:10,color:"#e8ecf8",background:"#405189",padding:"1px 6px",borderRadius:4,whiteSpace:"nowrap",fontWeight:600}}>Rev: {mr.reviewer}</span>}
                            {mr.assignee && mr.assignee !== mr.reviewer && <span style={{fontSize:10,color:"#1a6fa3",background:"#d7edf9",padding:"1px 6px",borderRadius:4,whiteSpace:"nowrap",fontWeight:600}}>Assig: {mr.assignee}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{padding:"14px 16px"}}><span style={{color:"#6c757d",fontSize:13,whiteSpace:"nowrap"}}><i className="ri-folder-3-line me-1" style={{color:"#878a99"}}></i>{mr.project||"Unknown"}</span></td>
                    <td style={{padding:"14px 16px"}}><span style={{background:cfg.bg,color:cfg.color,borderRadius:20,padding:"4px 12px",fontSize:11.5,fontWeight:700,display:"inline-flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}><i className={cfg.icon}></i>{cfg.label}</span></td>
                    <td style={{padding:"14px 16px"}}>{isApproved?<span style={{background:"#d7edf9",color:"#1a6fa3",borderRadius:20,padding:"4px 12px",fontSize:11.5,fontWeight:700,display:"inline-flex",alignItems:"center",gap:5}}><i className="ri-shield-check-line"></i>Yes</span>:<span style={{color:"#c8cbcf",fontSize:18}}>—</span>}</td>
                    
                    {/* Colonne COMMS (Commentaires) */}
                    <td style={{padding:"14px 16px"}}>
                      <div className="d-flex align-items-center gap-1">
                        <i className="ri-chat-1-line text-muted"></i>
                        <span style={{fontWeight: 600, color: (mr.user_notes_count > 0 ? "#405189" : "#adb5bd")}}>
                          {mr.user_notes_count || 0}
                        </span>
                      </div>
                    </td>

                    {/* Colonne COMMITS */}
                    <td style={{padding:"14px 16px"}}>
                      <div className="d-flex align-items-center gap-1">
                        <i className="ri-git-commit-line text-muted"></i>
                        <span style={{fontWeight: 600, color: (mr.commits_count > 0 ? "#212529" : "#adb5bd")}}>
                          {mr.commits_count || 0}
                        </span>
                      </div>
                    </td>
                    {/* Colonne REVUE — exact ou proxy Lead Time (DORA) */}
                    {(() => {
                      const rt = reviewTime(mr);
                      if (!rt) return <td style={{padding:"14px 16px"}}><span style={{color:"#c8cbcf"}}>—</span></td>;
                      const color = rt.hours === 0 ? "#0ab39c" : rt.hours < 2 ? "#0ab39c" : rt.hours < 24 ? "#f7b84b" : "#f06548";
                      return (
                        <td style={{padding:"14px 16px"}}>
                          <span style={{fontSize:12,fontWeight:600,color}} title={rt.isExact ? "Temps d'approbation exact" : "Lead Time (proxy DORA) : merged_at − created_at"}>
                            {rt.isExact ? "" : "~"}{rt.hours === 0 ? "Instant" : `${rt.hours.toFixed(1)}h`}
                          </span>
                          {!rt.isExact && (
                            <span style={{marginLeft:4,fontSize:10,color:"#adb5bd"}} title="Lead Time approximé">ⓘ</span>
                          )}
                        </td>
                      );
                    })()}
                    <td style={{padding:"14px 16px",whiteSpace:"nowrap"}}>
                      <div className="d-flex flex-column">
                        <span style={{color:"#495057",fontSize:12.5,fontWeight:600}}><i className="ri-calendar-line me-1 text-muted"></i>{fmtDate(mr.created_at_gitlab)}</span>
                        {mr.updated_at_gitlab && (
                          <span style={{color:"#878a99",fontSize:11,marginTop:2}} title="Dernière activité détectée">
                            <i className="ri-history-line me-1"></i>Actif: {fmtDate(mr.updated_at_gitlab)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{padding:"14px 16px"}}><button onClick={()=>onDetail(mr)} className="btn btn-sm btn-soft-primary" style={{fontSize:11,padding:"3px 10px"}}><i className="ri-eye-line"></i></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages>1&&(
          <div style={{padding:"14px 20px",borderTop:"1px solid #e9ebec",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <p style={{margin:0,fontSize:13,color:"#878a99"}}>Showing <strong style={{color:"#495057"}}>{Math.min((page-1)*perPage+1,sorted.length)}–{Math.min(page*perPage,sorted.length)}</strong> of <strong style={{color:"#495057"}}>{sorted.length}</strong></p>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>setPage(p=>p-1)} disabled={page===1} style={{width:32,height:32,borderRadius:6,border:"1px solid #dee2e6",background:"transparent",cursor:page===1?"not-allowed":"pointer",color:page===1?"#c8cbcf":"#495057"}}>←</button>
              {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>Math.abs(p-page)<=2).map(p=>(
                <button key={p} onClick={()=>setPage(p)} style={{width:32,height:32,borderRadius:6,fontSize:13,fontWeight:p===page?700:400,cursor:"pointer",border:`1px solid ${p===page?"#405189":"#dee2e6"}`,background:p===page?"#405189":"transparent",color:p===page?"#fff":"#495057"}}>{p}</button>
              ))}
              <button onClick={()=>setPage(p=>p+1)} disabled={page>=totalPages} style={{width:32,height:32,borderRadius:6,border:"1px solid #dee2e6",background:"transparent",cursor:page>=totalPages?"not-allowed":"pointer",color:page>=totalPages?"#c8cbcf":"#495057"}}>→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const INITIAL_FILTERS={search:"", lot: "all", state:"all",project:"all",author:"all",approved:"all",dateFrom:"",dateTo:""};

export default function MergePage() {
  const [allMrs,   setAllMrs]   = useState([]);
  const [projects, setProjects]  = useState([]); 
  const [lots,     setLots]      = useState([]);    
  const [loading,  setLoading]  = useState(true);
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    ...INITIAL_FILTERS,
    project: searchParams.get("project_id") || searchParams.get("project") || "all",
    lot: searchParams.get("lot_id") || "all"
  });
  const [error,    setError]    = useState(null);
  const [detailMr, setDetailMr] = useState(null);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    api.get("/projects/").then(res => {
      const p = Array.isArray(res.data)?res.data:(res.data?.items??[]);
      setProjects(p);
    });
  }, []);

  useEffect(() => {
    const fetchLots = async () => {
      try {
        let url = "/extraction-lots";
        if (filters.project !== "all") {
          const proj = projects.find(p => p.name === filters.project);
          if (proj) url += `?project_id=${proj.id}`;
        }
        const res = await api.get(url);
        setLots(res.data || []);
      } catch (err) {
        console.error("Erreur lors du chargement des lots:", err);
        setLots([]);
      }
    };
    fetchLots();
  }, [filters.project, projects]);

  const load = useCallback(async()=>{
    setLoading(true); setSpinning(true);
    try {
      const res = await api.get("/projects/");
      const projs = Array.isArray(res.data)?res.data:(res.data?.items??[]);
      setProjects(projs);
      
      const collected=[];
      for(const project of projs){
        // Isolation par projet
        if (filters.project !== "all" && project.name !== filters.project) continue;

        try {
          const params = { exclude_draft: false };
          // Isolation par lot
          if (filters.lot !== "all") params.lot_id = filters.lot;

          const mrRes=await api.get(`/projects/${project.id}/merge-requests`, { params });
          const data=Array.isArray(mrRes.data)?mrRes.data:(mrRes.data?.items??[]);
          
          data.forEach(mr=>collected.push({
            ...mr,
            project:project.name,
            author:mr.developer?.name||mr.developer?.gitlab_username||mr.author_name||"Unknown",
            updated_at_gitlab: mr.updated_at_gitlab,
            reviewer:mr.reviewer?.name||mr.reviewer?.gitlab_username||null,
            assignee:mr.assignee?.name||mr.assignee?.gitlab_username||null
          }));
        } catch { /* projet sans MRs */ }
      }
      setAllMrs(collected); setError(null);
    } catch { setError("Impossible de charger les merge requests."); }
    finally { setLoading(false); setSpinning(false); }
  }, [filters.project, filters.lot]);


  useEffect(()=>{ load(); },[load]);

  const projectList=useMemo(()=>[...new Set(allMrs.map(m=>m.project).filter(Boolean))].sort(),[allMrs]);
  const authorList = useMemo(() => {
    const symbols = new Set();
    allMrs.forEach(m => {
      if (m.author) symbols.add(m.author);
      if (m.reviewer) symbols.add(m.reviewer);
      if (m.assignee) symbols.add(m.assignee);
    });
    return Array.from(symbols).filter(Boolean).sort();
  }, [allMrs]);

  const activeFilterCount=useMemo(()=>Object.entries(filters).filter(([,v])=>v!==""&&v!=="all").length,[filters]);

  const filtered=useMemo(()=>{
    return allMrs.filter(mr=>{
      if(filters.state!=="all"&&mr.state!==filters.state)return false;
      if(filters.project!=="all"&&mr.project!==filters.project)return false;
      
      // ✅ FILTRE INCLUSIF (Auteur OR Reviewer OR Assignee)
      if (filters.author !== "all") {
        const target = filters.author.toLowerCase().trim();
        const aut = (mr.author || "").toLowerCase();
        const rev = (mr.reviewer || "").toLowerCase();
        const ass = (mr.assignee || "").toLowerCase();
        
        if (!aut.includes(target) && !rev.includes(target) && !ass.includes(target)) return false;
      }

      if(filters.approved==="yes"&&!(mr.approved===true||mr.approved===1))return false;
      if(filters.approved==="no"&&(mr.approved===true||mr.approved===1))return false;
      if(filters.search){const q=filters.search.toLowerCase();if(!mr.title?.toLowerCase().includes(q)&&!mr.author?.toLowerCase().includes(q)&&!mr.project?.toLowerCase().includes(q))return false;}
      if(filters.dateFrom&&new Date(mr.created_at_gitlab)<new Date(filters.dateFrom))return false;
      if(filters.dateTo){const to=new Date(filters.dateTo);to.setHours(23,59,59);if(new Date(mr.created_at_gitlab)>to)return false;}
      return true;
    });
  },[allMrs,filters]);

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
            <h4 style={{margin:0,fontWeight:700,fontSize:18,color:"#212529"}}><i className="ri-git-merge-line me-2 text-primary"></i>Merge Requests</h4>
            <ol className="breadcrumb" style={{margin:"4px 0 0",fontSize:13}}><li className="breadcrumb-item"><a href="#" style={{color:"#878a99",textDecoration:"none"}}>Projects</a></li><li className="breadcrumb-item active">Merge Requests</li></ol>
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

      <FilterBar filters={filters} onChange={setFilter} projects={projectList} authors={authorList} activeCount={activeFilterCount} onReset={()=>setFilters(INITIAL_FILTERS)} availableLots={lots}/>

      <div className="row">
        <KPICard icon="ri-git-pull-request-line" label="Total MRs"   value={kpis.total}  bg="#e8ecf8" color="#405189" sub={`${kpis.mergeRate}% merge rate`}/>
        <KPICard icon="ri-git-merge-line"        label="Merged"       value={kpis.merged} bg="#d4f5f0" color="#0a7a6a" sub="Click to filter" onClick={()=>setFilter("state",filters.state==="merged"?"all":"merged")} active={filters.state==="merged"}/>
        <KPICard icon="ri-git-pull-request-fill" label="Open"         value={kpis.opened} bg="#d7edf9" color="#1a6fa3" sub="Click to filter" onClick={()=>setFilter("state",filters.state==="opened"?"all":"opened")} active={filters.state==="opened"}/>
        <KPICard icon="ri-shield-check-line"     label="Approved"     value={kpis.approved} bg="#fef3dc" color="#b78a1e" sub="Ready to merge"/>
        {kpis.avgReview&&<KPICard icon="ri-timer-line" label="Moy. Revue" value={`${kpis.avgReview}h`} bg="#ede9fb" color="#5b21b6" sub="Temps d'approbation"/>}
      </div>

      <div className="row">
        <div className="col-xl-4"><StatusDonut opened={kpis.opened} merged={kpis.merged} closed={kpis.closed}/></div>
        <div className="col-xl-8">
          <TopContributors mrs={filtered} selectedAuthor={filters.author} />
        </div>
      </div>
      <div className="row"><div className="col-12"><MRTable mrs={filtered} onDetail={setDetailMr}/></div></div>
      <div className="row"><div className="col-12"><ProjectsBreakdown mrs={filtered}/></div></div>
    </div>
    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.rotate-animation{animation:spin 1s linear infinite;display:inline-block}`}</style>
    </div>
  );
}
