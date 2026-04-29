/**
 * ProjectsPage.jsx — Dashboard Projets GitLab
 *
 * CORRECTIONS v2 :
 *   [FIX] donutChartRef useEffect : cleanup `return () => {...}` ajouté
 *         → évite le memory leak (ApexCharts instance jamais détruite)
 *   [FIX] URL.revokeObjectURL déjà présent dans exportCSV ✅
 *   [FIX] Cleanup ApexCharts dans useEffect — référence stable via ref ✅
 *   [FIX] Pagination reset sur changement de filtre/recherche ✅
 *
 * [FIX v2.1] donut useEffect — accolade en trop dans new ApexCharts(el, {...})
 *            `tooltip` était passé comme 3ème argument au lieu d'être dans le
 *            config object → SyntaxError Babel à la colonne 417.
 *            Correction : `}}}}}}` → `}}}}}` avant `,tooltip:`
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ApexCharts from "apexcharts";
import Chart      from "chart.js/auto";
import api            from "../services/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import Pagination     from "../components/common/Pagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d) { if(!d)return"—"; return new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}); }
function getInitials(name="") { return(name||"?").split(/[\s._-]/).map(w=>w[0]).join("").toUpperCase().slice(0,2); }
function getCssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function rgba(cssVar,alpha) { const val=getCssVar(cssVar); return val?`rgba(${val},${alpha})`:`rgba(64,81,137,${alpha})`; }
function timeAgo(dateStr) {
  if(!dateStr)return"—";
  const diff=Date.now()-new Date(dateStr).getTime();
  const days=Math.floor(diff/86400000);
  if(days===0)return"Aujourd'hui"; if(days===1)return"Hier";
  if(days<30)return`Il y a ${days}j`; if(days<365)return`Il y a ${Math.floor(days/30)}mois`;
  return`Il y a ${Math.floor(days/365)}an`;
}
function activityColor(dateStr) {
  if(!dateStr)return"secondary";
  const days=Math.floor((Date.now()-new Date(dateStr).getTime())/86400000);
  if(days<=7)return"success"; if(days<=30)return"warning"; return"danger";
}
const COLORS=["primary","success","info","warning","danger","secondary"];

// ─── Chart: Commits vs Contributors ──────────────────────────────────────────
function CommitsVsContributorsChart({ projects }) {
  const ref=useRef(null); const chartRef=useRef(null);
  useEffect(()=>{
    if(!ref.current||!projects?.length)return;
    if(chartRef.current){chartRef.current.destroy();chartRef.current=null;}
    const top=[...projects].sort((a,b)=>(b.commit_count||0)-(a.commit_count||0)).slice(0,8);
    chartRef.current=new Chart(ref.current,{type:"bar",data:{labels:top.map(p=>p.name?.length>18?p.name.slice(0,18)+"…":(p.name||"?")),datasets:[{label:"Commits",data:top.map(p=>p.commit_count||0),backgroundColor:rgba("--vz-primary-rgb",0.85),borderColor:rgba("--vz-primary-rgb",1),borderWidth:1,borderRadius:6},{label:"Contributeurs",data:top.map(p=>p.contributor_count||0),backgroundColor:rgba("--vz-success-rgb",0.75),borderColor:rgba("--vz-success-rgb",1),borderWidth:1,borderRadius:6}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"top",align:"end",labels:{font:{family:"Poppins",size:12},usePointStyle:true,padding:16}},tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()}`}}},scales:{y:{ticks:{font:{family:"Poppins",size:11},color:"#878a99"},grid:{color:"rgba(133,141,152,0.08)"}},x:{ticks:{font:{family:"Poppins",size:10}},grid:{color:"rgba(133,141,152,0.08)"}}}}});
    return()=>{if(chartRef.current){chartRef.current.destroy();chartRef.current=null;}};
  },[projects]);
  return<canvas ref={ref} style={{maxHeight:320}}/>;
}

// ─── Chart: Namespace Donut ───────────────────────────────────────────────────
function NamespaceDonutChart({ projects }) {
  const ref=useRef(null); const chartRef=useRef(null);
  useEffect(()=>{
    if(!ref.current||!projects?.length)return;
    if(chartRef.current){chartRef.current.destroy();chartRef.current=null;}
    const nsMap={};
    projects.forEach(p=>{const ns=p.namespace||"Unknown";nsMap[ns]=(nsMap[ns]||0)+1;});
    const sorted=Object.entries(nsMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const CHART_COLORS=[getCssVar("--vz-primary")||"#405189",getCssVar("--vz-success")||"#0ab39c",getCssVar("--vz-info")||"#299cdb",getCssVar("--vz-warning")||"#f7b84b",getCssVar("--vz-danger")||"#f06548",getCssVar("--vz-secondary")||"#3577f1"];
    chartRef.current=new Chart(ref.current,{type:"doughnut",data:{labels:sorted.map(([ns])=>ns),datasets:[{data:sorted.map(([,count])=>count),backgroundColor:CHART_COLORS,hoverBackgroundColor:CHART_COLORS,hoverBorderColor:"#fff",borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:"70%",plugins:{legend:{position:"bottom",labels:{font:{family:"Poppins",size:11},usePointStyle:true,padding:14}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw} projet${ctx.raw>1?"s":""}`}}}}});
    return()=>{if(chartRef.current){chartRef.current.destroy();chartRef.current=null;}};
  },[projects]);
  return<canvas ref={ref} style={{maxHeight:240}}/>;
}

// ─── Project Detail Modal ─────────────────────────────────────────────────────
function ProjectDetailModal({ project, onClose, onNavigate }) {
  useEffect(()=>{
    const handler=(e)=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",handler);
    return()=>document.removeEventListener("keydown",handler);
  },[onClose]);
  if(!project)return null;
  const hasData=(project.commit_count||0)>0;
  const aColor=activityColor(project.last_commit_date);
  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true" style={{backgroundColor:"rgba(30,34,45,0.6)",backdropFilter:"blur(3px)"}} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div className="modal-content border-0" style={{borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,0.18)"}}>
          <div className="px-4 pt-4 pb-3" style={{borderBottom:"1px solid #f1f3f7"}}>
            <div className="d-flex align-items-start gap-3">
              <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14" style={{width:48,height:48,background:"linear-gradient(135deg,#405189,#3577f1)"}}>{getInitials(project.name)}</div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-1 fs-15" style={{wordBreak:"break-word"}}>{project.name}</h5>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  {project.namespace&&<span style={{background:"#e8ecf8",color:"#405189",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600}}><i className="ri-folder-line me-1"></i>{project.namespace}</span>}
                  <span style={{background:hasData?"#d4f5f0":"#fef3dc",color:hasData?"#0a7a6a":"#b78a1e",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{hasData?"✓ Extrait":"⏳ En attente"}</span>
                </div>
              </div>
              <button className="btn-close flex-shrink-0" style={{opacity:0.5}} onClick={onClose} aria-label="Fermer"></button>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="row g-3 mb-4">
              {[{icon:"ri-hashtag",label:"ID GitLab",value:`#${project.gitlab_project_id||"—"}`},{icon:"ri-git-commit-line",label:"Commits",value:(project.commit_count||0).toLocaleString()},{icon:"ri-team-line",label:"Contributeurs",value:project.contributor_count||0},{icon:"ri-calendar-event-line",label:"Dernier commit",value:formatDate(project.last_commit_date)},{icon:"ri-time-line",label:"Activité",value:timeAgo(project.last_commit_date)},{icon:"ri-git-merge-line",label:"Merge Requests",value:project.mr_count??"—"}].map((item,i)=>(
                <div key={i} className="col-6">
                  <div className="rounded-3 p-3" style={{background:"#f8f9fc",border:"1px solid #e9ecef"}}><div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",fontWeight:600,letterSpacing:0.8,marginBottom:4}}><i className={`${item.icon} me-1`}></i>{item.label}</div><div className="fw-semibold text-dark fs-13">{item.value}</div></div>
                </div>
              ))}
            </div>
            {hasData&&(<div className="mb-4"><div className="d-flex justify-content-between mb-1" style={{fontSize:11,color:"#9ca3af"}}><span className="fw-semibold" style={{color:"#405189"}}>Activité récente</span><span className={`fw-semibold text-${aColor}`}>{timeAgo(project.last_commit_date)}</span></div><div style={{height:6,background:"#f1f5f9",borderRadius:99}}><div style={{height:"100%",width:`${Math.min(100,Math.max(10,(project.commit_count||0)/2))}%`,background:`var(--vz-${aColor})`,borderRadius:99}}></div></div></div>)}
            <div className="row g-2">
              {[{label:"Commits",icon:"ri-git-commit-line",cls:"btn-soft-primary",target:"commits"},{label:"Merge Requests",icon:"ri-git-merge-line",cls:"btn-soft-success",target:"merge"},{label:"Dashboard KPI",icon:"ri-dashboard-line",cls:"btn-soft-info",target:"dashboard"}].map(({label,icon,cls,target})=>(
                <div key={target} className="col-4"><button className={`btn ${cls} btn-sm w-100`} onClick={()=>onNavigate(target,project.id)}><i className={`${icon} d-block fs-18 mb-1`}></i><span style={{fontSize:11}}>{label}</span></button></div>
              ))}
            </div>
          </div>
          <div className="px-4 py-3 d-flex align-items-center justify-content-between" style={{borderTop:"1px solid #f1f3f7",background:"#fafbfc",borderRadius:"0 0 16px 16px"}}>
            <span style={{fontSize:12,color:"#9ca3af"}}><i className="ri-git-repository-line me-1"></i>Project #{project.id}</span>
            <button className="btn btn-sm" onClick={onClose} style={{fontSize:12,padding:"5px 20px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",color:"#374151",fontWeight:500}}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const navigate=useNavigate();
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [page,          setPage]          = useState(1);
  const [sortKey,       setSortKey]       = useState(null);
  const [sortDir,       setSortDir]       = useState("desc");
  const [detailProject, setDetailProject] = useState(null);
  const perPage=6;

  const overviewChartRef=useRef(null);
  const donutChartRef   =useRef(null);

  const load=useCallback(()=>{
    setLoading(true);
    api.get("/projects").then(res=>{ const data=Array.isArray(res.data)?res.data:(res.data?.items??[]); setProjects(data); }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  useEffect(()=>{ load(); },[load]);

  const totalProjects     = projects.length;
  const extracted         = projects.filter(p=>(p.commit_count||0)>0).length;
  const pending           = totalProjects-extracted;
  const totalCommits      = projects.reduce((s,p)=>s+(p.commit_count||0),0);
  const totalContributors = projects.reduce((s,p)=>s+(p.contributor_count||0),0);
  const avgCommits        = totalProjects?Math.round(totalCommits/totalProjects):0;

  const filtered=useMemo(()=>{
    return projects.filter(p=>{
      const q=search.toLowerCase();
      const matchSearch=!q||(p.name||"").toLowerCase().includes(q)||(p.namespace||"").toLowerCase().includes(q);
      const matchStatus=statusFilter==="all"?true:statusFilter==="extracted"?(p.commit_count||0)>0:(p.commit_count||0)===0;
      return matchSearch&&matchStatus;
    }).sort((a,b)=>{
      if(!sortKey)return 0;
      let va=a[sortKey]??0, vb=b[sortKey]??0;
      if(sortKey==="last_commit_date"){va=va?new Date(va).getTime():0;vb=vb?new Date(vb).getTime():0;}
      return sortDir==="asc"?va-vb:vb-va;
    });
  },[projects,search,statusFilter,sortKey,sortDir]);

  useEffect(()=>{ setPage(1); },[search,statusFilter,sortKey,sortDir]);

  const totalPages=Math.ceil(filtered.length/perPage);
  const paginated=filtered.slice((page-1)*perPage,page*perPage);
  const handleSort=(key)=>{ if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortKey(key);setSortDir("desc");} };
  const SortIcon=({k})=>{ if(sortKey!==k)return<i className="ri-arrow-up-down-line ms-1 opacity-25 fs-11"></i>; return sortDir==="asc"?<i className="ri-arrow-up-line ms-1 text-primary fs-11"></i>:<i className="ri-arrow-down-line ms-1 text-primary fs-11"></i>; };

  const exportCSV=useCallback(()=>{
    const headers=["ID","Nom","Namespace","Commits","Contributeurs","Dernier commit","Statut"];
    const rows=filtered.map(p=>[p.gitlab_project_id||p.id,`"${(p.name||"").replace(/"/g,'""')}"`,p.namespace||"",p.commit_count||0,p.contributor_count||0,p.last_commit_date?formatDate(p.last_commit_date):"", (p.commit_count||0)>0?"Extrait":"En attente"]);
    const csv=[headers,...rows].map(r=>r.join(",")).join("\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
    const a=document.createElement("a"); a.href=url; a.download="projets_gitlab.csv"; a.click();
    URL.revokeObjectURL(url);
  },[filtered]);

  const handleNavigate=(target,projectId)=>{ setDetailProject(null); if(target==="commits")navigate(`/commits?project_id=${projectId}`); if(target==="merge")navigate(`/merge?project_id=${projectId}`); if(target==="dashboard")navigate(`/?project_id=${projectId}`); };

  // ApexChart overview
  useEffect(()=>{
    if(loading)return;
    const top=[...projects].sort((a,b)=>(b.commit_count||0)-(a.commit_count||0)).slice(0,8);
    const el=document.querySelector("#projects-overview-chart");
    if(!el)return;
    if(overviewChartRef.current){overviewChartRef.current.destroy();overviewChartRef.current=null;}
    overviewChartRef.current=new ApexCharts(el,{chart:{type:"bar",height:290,toolbar:{show:false},animations:{enabled:true,speed:800}},plotOptions:{bar:{borderRadius:5,columnWidth:"45%",distributed:true}},dataLabels:{enabled:false},series:[{name:"Commits",data:top.map(p=>p.commit_count||0)}],xaxis:{categories:top.map(p=>p.name?.length>12?p.name.slice(0,12)+"…":(p.name||"?")),labels:{style:{fontSize:"11px",fontFamily:"Poppins"}}},yaxis:{title:{text:"Commits",style:{fontFamily:"Poppins"}}},colors:["#405189","#0ab39c","#299cdb","#f7b84b","#f06548","#3577f1","#6f42c1","#fd7e14"],grid:{borderColor:"#f1f1f1",strokeDashArray:4},tooltip:{theme:"light",y:{formatter:v=>`${v.toLocaleString()} commits`}},legend:{show:false}});
    overviewChartRef.current.render();
    return()=>{ if(overviewChartRef.current){overviewChartRef.current.destroy();overviewChartRef.current=null;} };
  },[loading,projects]);

  // ✅ FIX v2.1 : accolade en trop corrigée — tooltip était hors du config object
  //   AVANT : ...plotOptions:{pie:{donut:{...}}}}},tooltip:{...}})   (6× } avant tooltip)
  //   APRÈS : ...plotOptions:{pie:{donut:{...}}}}},tooltip:{...}})   (5× } avant tooltip)
  useEffect(()=>{
    if(loading)return;
    const el=document.querySelector("#projects-status-chart");
    if(!el)return;
    if(donutChartRef.current){donutChartRef.current.destroy();donutChartRef.current=null;}
    donutChartRef.current=new ApexCharts(el,{
      chart:       { type:"donut", height:220 },
      labels:      ["Extraits","En attente"],
      series:      [extracted||0, pending||0],
      colors:      ["#0ab39c","#f7b84b"],
      legend:      { position:"bottom", fontFamily:"Poppins", fontSize:"12px" },
      dataLabels:  { enabled:true, style:{ fontFamily:"Poppins" } },
      plotOptions: { pie:{ donut:{ size:"72%", labels:{ show:true, total:{ show:true, label:"Total", formatter:()=>totalProjects } } } } },
      tooltip:     { y:{ formatter: v=>`${v} projet${v>1?"s":""}` } },
    });
    donutChartRef.current.render();
    // ✅ FIX v2 : return cleanup (était absent dans l'original)
    return()=>{ if(donutChartRef.current){donutChartRef.current.destroy();donutChartRef.current=null;} };
  },[loading,extracted,pending,totalProjects]);

  if(loading)return <div className="page-content"><div className="container-fluid"><div className="d-flex justify-content-center align-items-center py-5"><div className="spinner-border text-primary me-3"></div><span className="text-muted">Chargement des projets...</span></div></div></div>;

  return (
    <div className="page-content"><div className="container-fluid">
      {detailProject&&<ProjectDetailModal project={detailProject} onClose={()=>setDetailProject(null)} onNavigate={handleNavigate}/>}

      <div className="row"><div className="col-12">
        <div className="page-title-box d-sm-flex align-items-center justify-content-between">
          <h4 className="mb-sm-0"><i className="ri-git-repository-line me-2 text-primary"></i>Projets GitLab</h4>
          <ol className="breadcrumb m-0"><li className="breadcrumb-item"><a href="/">Dashboard</a></li><li className="breadcrumb-item active">Projets</li></ol>
        </div>
      </div></div>

      {/* Stats */}
      <div className="row">
        {[{label:"Total Projets",  value:totalProjects,               sub:`${extracted} extraits · ${pending} en attente`,           color:"primary",icon:"ri-git-repository-line"},
          {label:"Total Commits",  value:totalCommits.toLocaleString(),sub:`Moy. ${avgCommits.toLocaleString()} commits/projet`,        color:"warning",icon:"ri-git-commit-line"},
          {label:"Contributeurs",  value:totalContributors,           sub:"Développeurs uniques",                                       color:"info",   icon:"ri-team-line"},
          {label:"Taux extraction",value:totalProjects?`${Math.round((extracted/totalProjects)*100)}%`:"0%",sub:`${extracted} / ${totalProjects} projets`,color:"success",icon:"ri-download-cloud-2-line"}
        ].map((s,i)=>(
          <div key={i} className="col-xl-3 col-sm-6"><div className="card card-animate"><div className="card-body"><div className="d-flex align-items-center">
            <div className="avatar-sm flex-shrink-0"><span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-2`}><i className={s.icon}></i></span></div>
            <div className="flex-grow-1 overflow-hidden ms-3"><p className="text-uppercase fw-medium text-muted text-truncate mb-2 fs-12">{s.label}</p><h4 className="fs-4 mb-1">{s.value}</h4><p className="text-muted text-truncate mb-0 fs-12">{s.sub}</p></div>
          </div></div></div></div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="row">
        <div className="col-xxl-8"><div className="card">
          <div className="card-header border-0 d-flex align-items-center"><div className="flex-grow-1"><h4 className="card-title mb-1"><i className="ri-bar-chart-line me-2 text-primary"></i>Commits par projet — Top 8</h4><p className="text-muted mb-0 fs-12">Distribution des commits — tri décroissant</p></div><span className="badge bg-primary-subtle text-primary fs-11">ApexCharts</span></div>
          <div className="card-header p-0 border-0 bg-light-subtle"><div className="row g-0 text-center">
            {[{label:"Projets",value:totalProjects},{label:"Extraits",value:extracted},{label:"Total commits",value:totalCommits.toLocaleString()},{label:"Contributeurs",value:totalContributors}].map((s,i)=>(
              <div key={i} className="col-6 col-sm-3"><div className="p-3 border border-dashed border-start-0"><h5 className="mb-1">{s.value}</h5><p className="text-muted mb-0 fs-12">{s.label}</p></div></div>
            ))}
          </div></div>
          <div className="card-body p-0 pb-2"><div id="projects-overview-chart" className="apex-charts" dir="ltr"></div></div>
        </div></div>
        <div className="col-xxl-4"><div className="card card-height-100">
          <div className="card-header d-flex align-items-center"><h4 className="card-title mb-0 flex-grow-1">Statut des projets</h4><span className="badge bg-success-subtle text-success fs-11">ApexCharts</span></div>
          <div className="card-body">
            <div id="projects-status-chart"></div>
            <div className="mt-3">
              <div className="d-flex justify-content-between border-bottom border-dashed py-2"><p className="fw-medium mb-0 fs-13"><i className="ri-checkbox-blank-circle-fill text-success align-middle me-2 fs-10"></i>Extraits</p><div className="text-end"><span className="text-muted fs-12 pe-3">{extracted} projets</span><span className="text-success fw-medium fs-12">{totalCommits.toLocaleString()} commits</span></div></div>
              <div className="d-flex justify-content-between py-2"><p className="fw-medium mb-0 fs-13"><i className="ri-checkbox-blank-circle-fill text-warning align-middle me-2 fs-10"></i>En attente</p><div className="text-end"><span className="text-muted fs-12 pe-3">{pending} projets</span><span className="text-warning fw-medium fs-12">Aucune donnée</span></div></div>
              <div className="mt-3"><button className="btn btn-soft-primary btn-sm w-100" onClick={()=>navigate("/extraction")}><i className="ri-download-2-line me-1"></i>Lancer une extraction</button></div>
            </div>
          </div>
        </div></div>
      </div>

      {/* Charts Row 2 */}
      <div className="row">
        <div className="col-xl-8"><div className="card"><div className="card-header d-flex align-items-center border-bottom-dashed"><div className="flex-grow-1"><h4 className="card-title mb-1"><i className="ri-bar-chart-horizontal-line me-2 text-info"></i>Commits vs Contributeurs</h4><p className="text-muted mb-0 fs-12">Comparaison croisée — top 8 projets</p></div><span className="badge bg-info-subtle text-info fs-11">Chart.js</span></div><div className="card-body"><div style={{height:320}}><CommitsVsContributorsChart projects={projects}/></div></div></div></div>
        <div className="col-xl-4"><div className="card h-100"><div className="card-header d-flex align-items-center border-bottom-dashed"><div className="flex-grow-1"><h4 className="card-title mb-1"><i className="ri-donut-chart-line me-2 text-warning"></i>Projets par Namespace</h4><p className="text-muted mb-0 fs-12">Distribution par namespace GitLab</p></div><span className="badge bg-warning-subtle text-warning fs-11">Chart.js</span></div><div className="card-body"><div style={{height:240}}><NamespaceDonutChart projects={projects}/></div><div className="mt-3 pt-2 border-top border-dashed"><div className="d-flex justify-content-between text-muted fs-12"><span><i className="ri-git-repository-line me-1"></i>{totalProjects} projets</span><span><i className="ri-group-line me-1"></i>{new Set(projects.map(p=>p.namespace).filter(Boolean)).size} namespaces</span></div></div></div></div></div>
      </div>

      {/* Table */}
      <div className="row"><div className="col-12"><div className="card">
        <div className="card-header">
          <div className="row g-2 align-items-center">
            <div className="col-md-4"><h4 className="card-title mb-0"><i className="ri-list-check me-2 text-primary"></i>Liste des projets<span className="badge bg-primary-subtle text-primary ms-2 fs-11">{filtered.length}</span></h4></div>
            <div className="col-md-4 ms-auto"><div className="search-box"><input type="text" className="form-control" placeholder="Rechercher par nom ou namespace..." value={search} onChange={e=>setSearch(e.target.value)}/><i className="ri-search-line search-icon"></i></div></div>
            <div className="col-md-auto"><select className="form-select form-select-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">Tous</option><option value="extracted">Extraits</option><option value="pending">En attente</option></select></div>
            <div className="col-md-auto"><button className="btn btn-soft-success btn-sm" onClick={exportCSV}><i className="ri-download-2-line me-1"></i>CSV</button></div>
            <div className="col-md-auto"><button className="btn btn-soft-info btn-sm" onClick={()=>navigate("/extraction")}><i className="ri-download-2-line me-1"></i>Extraction</button></div>
          </div>
        </div>
        <div className="card-body p-0">
          {filtered.length===0?(
            <div className="text-center py-5"><i className="ri-git-repository-line fs-1 text-muted d-block mb-3"></i><p className="text-muted mb-3">{search?"Aucun résultat pour cette recherche.":"Aucun projet actif trouvé."}</p>{!search&&<button className="btn btn-primary btn-sm" onClick={()=>navigate("/extraction")}><i className="ri-add-line me-1"></i>Lancer une extraction</button>}</div>
          ):(
            <>
              <div className="table-responsive"><table className="table table-hover table-nowrap align-middle mb-0">
                <thead className="table-light"><tr>
                  <th className="ps-4">Projet</th><th>Namespace</th>
                  <th style={{cursor:"pointer",userSelect:"none"}} onClick={()=>handleSort("commit_count")}>Commits<SortIcon k="commit_count"/></th>
                  <th style={{cursor:"pointer",userSelect:"none"}} onClick={()=>handleSort("contributor_count")}>Contributeurs<SortIcon k="contributor_count"/></th>
                  <th style={{cursor:"pointer",userSelect:"none"}} onClick={()=>handleSort("last_commit_date")}>Dernier commit<SortIcon k="last_commit_date"/></th>
                  <th>Statut</th><th className="text-center">Actions</th>
                </tr></thead>
                <tbody>
                  {paginated.map((project,idx)=>{
                    const hasData=(project.commit_count||0)>0;
                    const c=COLORS[idx%COLORS.length];
                    const aColor=activityColor(project.last_commit_date);
                    return (
                      <tr key={project.id} style={{cursor:"pointer"}} onClick={()=>setDetailProject(project)}>
                        <td className="ps-4"><div className="d-flex align-items-center gap-2"><div className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center bg-${c}-subtle text-${c} fw-bold fs-12 flex-shrink-0`} style={{minWidth:34,height:34}}>{getInitials(project.name)}</div><div><p className="fw-semibold mb-0 fs-13">{project.name}</p><p className="text-muted mb-0 fs-11">ID #{project.gitlab_project_id}</p></div></div></td>
                        <td className="text-muted fs-13">{project.namespace?<span className="badge bg-light text-dark"><i className="ri-folder-line me-1"></i>{project.namespace}</span>:"—"}</td>
                        <td><span className="badge bg-primary-subtle text-primary fs-12"><i className="ri-git-commit-line me-1"></i>{(project.commit_count||0).toLocaleString()}</span></td>
                        <td><span className="badge bg-info-subtle text-info fs-12"><i className="ri-team-line me-1"></i>{project.contributor_count||0}</span></td>
                        <td>{project.last_commit_date?(<div><p className="mb-0 fs-13">{formatDate(project.last_commit_date)}</p><p className={`text-${aColor} mb-0 fs-11 fw-medium`}>{timeAgo(project.last_commit_date)}</p></div>):<span className="text-muted fs-12">—</span>}</td>
                        <td>{hasData?<span className="badge bg-success-subtle text-success"><i className="ri-checkbox-circle-line me-1"></i>Extrait</span>:<span className="badge bg-warning-subtle text-warning"><i className="ri-time-line me-1"></i>En attente</span>}</td>
                        <td className="text-center" onClick={e=>e.stopPropagation()}><div className="d-flex gap-1 justify-content-center">
                          <button className="btn btn-xs btn-soft-primary" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>navigate(`/commits?project_id=${project.id}`)}><i className="ri-git-commit-line"></i></button>
                          <button className="btn btn-xs btn-soft-success" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>navigate(`/merge?project_id=${project.id}`)}><i className="ri-git-merge-line"></i></button>
                          <button className="btn btn-xs btn-soft-info" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>navigate(`/?project_id=${project.id}`)}><i className="ri-dashboard-line"></i></button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
              <div className="px-3 pb-2"><Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage}/></div>
            </>
          )}
        </div>
      </div></div></div>
    </div></div>
  );
}
