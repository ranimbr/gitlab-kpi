/**
 * DeveloperPerformancePage.jsx — Analyse de Performance 360°
 *
 * Page d'analyse approfondie d'un développeur :
 *  - KPIs Enterprise : Bus Factor, Sprint Velocity, Code Churn Rate
 *  - Comparaison percentile vis-à-vis de l'équipe (Team Ranking)
 *  - Recommandations automatiques basées sur les données réelles
 *  - Pattern d'activité hebdomadaire (commits par jour de semaine)
 *
 * Route : /developers/:id/performance?project_id=X
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import ReactApexChart from "react-apexcharts";
import api from "../services/api";
import developerService from "../services/developerService";
import analyticsService from "../services/analyticsService";
import projectService from "../services/projectService";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt    = (n, d = 1) => (n == null || isNaN(+n)) ? "—" : (+n).toFixed(d);
const fmtPct = (n)        => (n == null || isNaN(+n)) ? "—" : `${(+n).toFixed(1)}%`;
const getInitials = (name = "") => (name || "?").split(/[\s._-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2);

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const CHART_FONT = "Poppins, 'Helvetica Neue', sans-serif";

// ─── Bus Factor Gauge ────────────────────────────────────────────────────────
function BusFactorCard({ value }) {
  const level =
    value === 0 ? "nd" :
    value === 1 ? "critical" :
    value === 2 ? "warning" :
    value <= 4  ? "ok" : "excellent";

  const cfg = {
    nd:        { color:"#878a99", bg:"#f0f0f0",  icon:"ri-question-line",       label:"N/D",       text:"Données insuffisantes." },
    critical:  { color:"#f06548", bg:"#fde8e8",  icon:"ri-alarm-warning-fill",  label:"CRITIQUE",  text:"Un seul dev détient 50% du code. Risque majeur." },
    warning:   { color:"#f7b84b", bg:"#fef3dc",  icon:"ri-error-warning-fill",  label:"À RISQUE",  text:"2 devs couvrent 50% du code. Fragile." },
    ok:        { color:"#0ab39c", bg:"#d4f5f0",  icon:"ri-check-double-fill",   label:"SAIN",      text:"Connaissance du code bien distribuée." },
    excellent: { color:"#405189", bg:"#e8ecf8",  icon:"ri-shield-check-fill",   label:"RÉSILIENT", text:"5+ devs maîtrisent 50% du code. Optimal." },
  };
  const c = cfg[level];

  return (
    <div className="card h-100 border-0 shadow-sm">
      <div className="card-body text-center p-4">
        <div style={{width:60,height:60,borderRadius:"50%",background:c.bg,color:c.color,fontSize:26,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}>
          <i className={c.icon}></i>
        </div>
        <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"#878a99",marginBottom:4}}>Bus Factor (Projet)</p>
        <h2 style={{fontSize:46,fontWeight:900,color:c.color,lineHeight:1,marginBottom:8}}>{value || "—"}</h2>
        <span style={{display:"inline-block",padding:"3px 14px",borderRadius:20,background:c.bg,color:c.color,fontSize:11,fontWeight:700,marginBottom:12}}>{c.label}</span>
        <p style={{color:"#878a99",fontSize:11,marginBottom:0,lineHeight:1.5}}>{c.text}</p>
        <div style={{marginTop:12,padding:"8px",background:"#f8f9fc",borderRadius:8,fontSize:10,color:"#6c757d"}}>
          <i className="ri-information-line me-1"></i>
          Min. devs pour couvrir 50% des commits
        </div>
      </div>
    </div>
  );
}

// ─── Sprint Velocity Card ────────────────────────────────────────────────────
function VelocityCard({ value, totalCommits, activeDays }) {
  const level = !value || value === 0 ? "nd" : value < 1 ? "low" : value < 2.5 ? "ok" : "high";
  const colors = { nd:"#878a99", low:"#f7b84b", ok:"#0ab39c", high:"#405189" };
  const labels = {
    nd:   "Aucune activité",
    low:  "Velocity faible",
    ok:   "Velocity saine",
    high: "Très actif 🚀",
  };
  const clr = colors[level];

  return (
    <div className="card h-100 border-0 shadow-sm">
      <div className="card-body p-4">
        <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"#878a99",marginBottom:10}}>
          <i className="ri-speed-up-line me-1"></i>Sprint Velocity
        </p>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:6}}>
          <span style={{fontSize:44,fontWeight:900,color:clr,lineHeight:1}}>{value > 0 ? fmt(value) : "—"}</span>
          <span style={{fontSize:13,color:"#878a99"}}>commits / jour actif</span>
        </div>
        <span style={{display:"inline-block",padding:"2px 12px",borderRadius:20,background:clr+"22",color:clr,fontSize:11,fontWeight:700,marginBottom:14}}>
          {labels[level]}
        </span>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1,background:"#f8f9fc",borderRadius:8,padding:"10px",textAlign:"center"}}>
            <div style={{fontWeight:800,color:"#212529",fontSize:18}}>{totalCommits || 0}</div>
            <div style={{fontSize:9,color:"#878a99",textTransform:"uppercase",letterSpacing:".05em"}}>Total Commits</div>
          </div>
          <div style={{flex:1,background:"#f8f9fc",borderRadius:8,padding:"10px",textAlign:"center"}}>
            <div style={{fontWeight:800,color:"#212529",fontSize:18}}>{activeDays || 0}</div>
            <div style={{fontSize:9,color:"#878a99",textTransform:"uppercase",letterSpacing:".05em"}}>Jours Actifs</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Code Churn Rate Card ────────────────────────────────────────────────────
function ChurnCard({ value }) {
  const level = !value ? "nd" : value < 20 ? "excellent" : value < 40 ? "ok" : value < 60 ? "warning" : "critical";
  const cfg = {
    nd:        { color:"#878a99", label:"N/D",       bar:"#e9ecef", text:"Aucune donnée." },
    excellent: { color:"#0ab39c", label:"EXCELLENT",  bar:"#0ab39c", text:"Code stable — planification optimale." },
    ok:        { color:"#0ab39c", label:"NORMAL",     bar:"#0ab39c", text:"Refactoring sain, dans les standards agile." },
    warning:   { color:"#f7b84b", label:"ATTENTION",  bar:"#f7b84b", text:"Retravail notable — revue du processus conseillée." },
    critical:  { color:"#f06548", label:"CRITIQUE",   bar:"#f06548", text:"Instabilité du code. Risque de livraison." },
  };
  const c = cfg[level];
  const pct = Math.min(value || 0, 100);

  return (
    <div className="card h-100 border-0 shadow-sm">
      <div className="card-body p-4">
        <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"#878a99",marginBottom:10}}>
          <i className="ri-refresh-line me-1"></i>Code Churn Rate
        </p>
        <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:8}}>
          <span style={{fontSize:44,fontWeight:900,color:c.color,lineHeight:1}}>{value > 0 ? `${value}` : "—"}</span>
          {value > 0 && <span style={{fontSize:18,color:c.color,fontWeight:700}}>%</span>}
        </div>
        <span style={{display:"inline-block",padding:"2px 12px",borderRadius:20,background:c.color+"22",color:c.color,fontSize:11,fontWeight:700,marginBottom:14}}>
          {c.label}
        </span>
        {/* Progress bar */}
        <div style={{height:8,background:"#f0f0f0",borderRadius:20,overflow:"hidden",marginBottom:8}}>
          <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg, #0ab39c, ${c.bar})`,borderRadius:20,transition:"width 1.2s ease"}}/>
        </div>
        {/* Scale */}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#c8cbcf",marginBottom:8}}>
          <span>0%</span><span>20%</span><span>40%</span><span>60%</span><span>100%</span>
        </div>
        <p style={{fontSize:11,color:"#6c757d",marginBottom:0,lineHeight:1.5}}>{c.text}</p>
      </div>
    </div>
  );
}

// ─── Team Percentile ─────────────────────────────────────────────────────────
function TeamPercentile({ devScore, allScores, devName }) {
  if (!allScores || allScores.length < 2) return null;

  const sorted = [...allScores].sort((a, b) => a - b);
  const below  = sorted.filter(s => s < devScore).length;
  const percentile = Math.round((below / sorted.length) * 100);
  const rank   = sorted.length - below;

  const color  = percentile >= 75 ? "#0ab39c" : percentile >= 50 ? "#f7b84b" : "#f06548";
  const trophy = percentile >= 75 ? "🏆 Top Performer" : percentile >= 50 ? "📊 Au-dessus de la moyenne" : "📈 En dessous de la moyenne";

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header" style={{background:"#fff",borderBottom:"1px solid #f1f3f7",padding:"14px 20px"}}>
        <h5 className="card-title mb-0 fs-14">
          <i className="ri-bar-chart-grouped-line me-2 text-primary"></i>
          Positionnement dans l'Équipe
        </h5>
      </div>
      <div className="card-body p-4">
        <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:20}}>
          <div style={{textAlign:"center",minWidth:90}}>
            <div style={{fontSize:52,fontWeight:900,color,lineHeight:1}}>{percentile}</div>
            <div style={{fontSize:11,color:"#878a99",textTransform:"uppercase",letterSpacing:".05em"}}>Percentile</div>
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
              <span style={{fontSize:13,color:"#6c757d"}}>
                Rang <strong style={{color:"#212529"}}>#{rank}</strong> sur <strong style={{color:"#212529"}}>{sorted.length}</strong> développeurs
              </span>
              <span style={{fontSize:12,fontWeight:700,color}}>{trophy}</span>
            </div>
            <div style={{height:12,background:"#f0f0f0",borderRadius:20,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${percentile}%`,background:`linear-gradient(90deg, #405189, ${color})`,borderRadius:20,transition:"width 1.5s ease"}}/>
            </div>
          </div>
        </div>

        {/* Team bubbles */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:"#878a99",marginRight:4}}>Équipe :</span>
          {sorted.map((s, i) => {
            const isCurrent = Math.abs(s - devScore) < 0.0001;
            return (
              <div key={i}
                title={isCurrent ? `${devName}: ${Math.round(s*100)} pts` : `Dev: ${Math.round(s*100)} pts`}
                style={{
                  width: isCurrent ? 36 : 30,
                  height: isCurrent ? 36 : 30,
                  borderRadius:"50%",
                  background: isCurrent ? color : "#e9ecef",
                  border: `2px solid ${isCurrent ? color : "#dee2e6"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize: isCurrent ? 12 : 9,
                  fontWeight:700,
                  color: isCurrent ? "#fff" : "#878a99",
                  cursor:"default",
                  boxShadow: isCurrent ? `0 0 12px ${color}66` : "none",
                  transition:"all .3s",
                  flexShrink:0,
                }}>
                {isCurrent ? "★" : Math.round(s*100)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Auto Recommendations ────────────────────────────────────────────────────
function buildRecommendations(snap, devName) {
  const recs = [];
  if (!snap) return recs;
  const name       = (devName || "Ce développeur").split(" ")[0];
  const score      = snap.developer_score   || 0;
  const mrs        = snap.total_mrs_created || 0;
  const reviews    = snap.total_reviews     || 0;
  const commits    = snap.total_commits     || 0;
  const approved   = snap.approved_mr_rate  || 0;
  const churn      = snap.code_churn_rate   || 0;
  const velocity   = snap.sprint_velocity   || 0;
  const busF       = snap.bus_factor;
  const avgReview  = snap.avg_review_time_hours || 0;

  if (score >= 0.75)
    recs.push({ type:"success", icon:"ri-trophy-line",         title:"Excellente performance globale",
      text:`${name} affiche un score de ${Math.round(score*100)} pts — dans le top tier de l'équipe.`});

  if (commits > 5 && mrs === 0)
    recs.push({ type:"warning", icon:"ri-git-pull-request-line", title:"Commits sans MR associée",
      text:`${name} a ${commits} commits mais n'a soumis aucune MR. Le travail est peut-être en cours dans une branche longue.`});

  if (mrs > 2 && reviews === 0)
    recs.push({ type:"info",    icon:"ri-eye-line",              title:"Faible implication dans les revues",
      text:`${name} crée des MRs mais ne participe pas aux revues de code. La collaboration peut être renforcée.`});

  if (mrs > 0 && approved < 0.5)
    recs.push({ type:"warning", icon:"ri-shield-check-line",    title:"Taux d'approbation à améliorer",
      text:`Moins de 50% des MRs sont approuvées. Vérifier la qualité du code avant soumission ou clarifier les critères de review.`});

  if (churn > 40)
    recs.push({ type:"danger",  icon:"ri-refresh-line",         title:`Code Churn élevé (${Math.round(churn)}%)`,
      text:`Un pourcentage élevé de code est réécrit/supprimé. Envisagez une phase de conception plus solide avant le développement.`});

  if (velocity > 0 && velocity < 0.8)
    recs.push({ type:"warning", icon:"ri-speed-up-line",        title:"Sprint Velocity en dessous de la norme",
      text:`${name} publie moins de 1 commit par jour actif. Vérifiez s'il y a des blocages techniques ou organisationnels.`});

  if (avgReview > 48)
    recs.push({ type:"danger",  icon:"ri-time-line",            title:`Délai de revue long (${Math.round(avgReview)}h)`,
      text:`Le temps moyen de review est supérieur à 48h. Cela peut bloquer les autres développeurs. Envisagez des revues plus fréquentes.`});

  if (busF === 1)
    recs.push({ type:"danger",  icon:"ri-alarm-warning-line",   title:"Bus Factor Critique sur le projet",
      text:`Un seul développeur couvre 50% du code. Organisez des sessions de knowledge transfer pour réduire ce risque.`});

  if (reviews >= 3 && approved >= 0.7)
    recs.push({ type:"success", icon:"ri-medal-line",           title:"Excellent pair reviewer",
      text:`${name} est un reviewer actif avec un fort taux d'approbation. C'est un atout majeur pour la qualité d'équipe.`});

  if (recs.length === 0)
    recs.push({ type:"success", icon:"ri-check-double-line",    title:"Bilan équilibré, aucune anomalie",
      text:`${name} affiche une activité saine et équilibrée. Continuez sur cette lancée !`});

  return recs;
}

function RecommendationsPanel({ snapshot, devName }) {
  const recs   = useMemo(() => buildRecommendations(snapshot, devName), [snapshot, devName]);
  const colors = { success:"#0ab39c", warning:"#f7b84b", info:"#299cdb", danger:"#f06548" };
  const bgs    = { success:"#d4f5f0", warning:"#fef3dc", info:"#d7edf9", danger:"#fde8e8" };

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header" style={{background:"#fff",borderBottom:"1px solid #f1f3f7",padding:"14px 20px"}}>
        <h5 className="card-title mb-0 fs-14">
          <i className="ri-robot-line me-2 text-primary"></i>
          Recommandations Automatiques
          <span style={{fontSize:11,color:"#878a99",fontWeight:400,marginLeft:8}}>— basées sur vos données</span>
        </h5>
      </div>
      <div className="card-body p-4">
        <div className="d-flex flex-column gap-3">
          {recs.map((r, i) => (
            <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"12px 14px",
              borderRadius:10,background:bgs[r.type]||"#f8f9fc",border:`1px solid ${colors[r.type]}33`,
              animation:`slideIn .3s ease ${i*0.08}s both`}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:`${colors[r.type]}22`,
                color:colors[r.type],fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className={r.icon}></i>
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:"#212529",marginBottom:3}}>{r.title}</div>
                <div style={{fontSize:12,color:"#6c757d",lineHeight:1.6}}>{r.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Activity by Day of Week ──────────────────────────────────────────────────
function WeekdayActivityChart({ heatmap }) {
  const dayTotals = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0, 0]; // Mon→Sun
    (heatmap || []).forEach(d => {
      if (!d.date || !d.count) return;
      const dow = new Date(d.date).getDay(); // 0=Sun, 1=Mon...
      const idx = dow === 0 ? 6 : dow - 1;  // Remap to Mon=0...Sun=6
      totals[idx] += d.count;
    });
    return totals;
  }, [heatmap]);

  const max = Math.max(...dayTotals, 1);

  const options = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: CHART_FONT, background: "transparent" },
    plotOptions: { bar: { borderRadius: 6, columnWidth: "55%", distributed: true } },
    colors: dayTotals.map((v, i) =>
      i <= 4 ? (v === max ? "#405189" : "#8ba7e8") : "#d4d8f0"  // Weekdays vs weekend
    ),
    dataLabels: { enabled: false },
    xaxis: { categories: JOURS_SEMAINE, labels: { style: { fontSize: "12px", fontFamily: CHART_FONT } } },
    yaxis: { labels: { style: { fontSize: "11px", fontFamily: CHART_FONT } }, title: { text: "Commits" } },
    legend: { show: false },
    grid: { borderColor: "rgba(133,141,152,0.1)", strokeDashArray: 4 },
    tooltip: { y: { formatter: v => `${v} commits` }, theme: "light" },
  };

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header" style={{background:"#fff",borderBottom:"1px solid #f1f3f7",padding:"14px 20px"}}>
        <h5 className="card-title mb-0 fs-14">
          <i className="ri-calendar-2-line me-2 text-primary"></i>
          Pattern d'Activité Hebdomadaire
          <span style={{fontSize:11,color:"#878a99",fontWeight:400,marginLeft:8}}>— commits par jour de semaine</span>
        </h5>
      </div>
      <div className="card-body">
        {dayTotals.every(v => v === 0) ? (
          <div className="text-center py-5 text-muted">
            <i className="ri-bar-chart-2-line fs-1 opacity-25 d-block mb-2"></i>
            Aucune activité sur la période sélectionnée
          </div>
        ) : (
          <>
            <ReactApexChart type="bar" height={220} series={[{ name: "Commits", data: dayTotals }]} options={options} />
            <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:4}}>
              <span style={{fontSize:11,color:"#878a99"}}><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"#405189",marginRight:4}}></span>Jour le plus actif</span>
              <span style={{fontSize:11,color:"#878a99"}}><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"#8ba7e8",marginRight:4}}></span>Jours ouvrés</span>
              <span style={{fontSize:11,color:"#878a99"}}><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"#d4d8f0",marginRight:4}}></span>Week-end</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Score Gauge ─────────────────────────────────────────────────────────────
function ScoreGaugeCard({ score, devName }) {
  const pct   = Math.round((score || 0) * 100);
  const color = pct >= 75 ? "#0ab39c" : pct >= 50 ? "#f7b84b" : pct >= 25 ? "#f06548" : "#878a99";
  const label = pct >= 75 ? "Excellent" : pct >= 50 ? "Bon" : pct >= 25 ? "À améliorer" : "Faible";

  const options = {
    chart: { type: "radialBar", fontFamily: CHART_FONT, background:"transparent" },
    plotOptions: {
      radialBar: {
        startAngle: -135, endAngle: 135,
        hollow: { size: "60%", background: "transparent" },
        track: { background: "#f0f0f0", strokeWidth: "97%" },
        dataLabels: {
          name: { show: true, fontSize: "13px", offsetY: -10, color: "#878a99" },
          value: { show: true, fontSize: "32px", fontWeight: 800, color, offsetY: 5,
            formatter: v => `${v}` },
        },
      },
    },
    colors: [color],
    labels: [label],
    stroke: { lineCap: "round" },
  };

  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body d-flex flex-column align-items-center justify-content-center p-4">
        <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"#878a99",marginBottom:0}}>
          Score de Performance
        </p>
        <ReactApexChart type="radialBar" height={200} series={[pct]} options={options} />
        <div style={{textAlign:"center",marginTop:-8}}>
          <div style={{fontSize:12,color:"#6c757d"}}>sur 100 points</div>
          <div style={{fontSize:11,color:"#878a99",marginTop:4}}>
            Formule pondérée DORA : commits + MRs + review + approbation
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeveloperPerformancePage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectIdParam = searchParams.get("project_id");
  const periodIdParam = searchParams.get("period_id");
  const lotIdParam    = searchParams.get("lot_id");

  const [developer,   setDeveloper]   = useState(null);
  const [snapshot,    setSnapshot]    = useState(null);
  const [summary,     setSummary]     = useState(null);
  const [heatmap,     setHeatmap]     = useState([]);
  const [projects,    setProjects]    = useState([]);
  const [selectedPid, setSelectedPid]= useState(projectIdParam || localStorage.getItem("last_project_id") || "");
  const [selectedPeriodId, setSelectedPeriodId] = useState(periodIdParam || "");
  const [selectedLotId,    setSelectedLotId]    = useState(lotIdParam || "");
  const [allDevScores,setAllDevScores]= useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  // [SENIOR] Sync project_id & period_id to URL
  useEffect(() => {
    const params = {};
    if (selectedPid) {
      params.project_id = selectedPid;
      localStorage.setItem("last_project_id", selectedPid);
    }
    if (selectedPeriodId) {
      params.period_id = selectedPeriodId;
    }
    if (selectedLotId) {
      params.lot_id = selectedLotId;
    }
    const currentParams = Object.fromEntries(searchParams.entries());
    if (JSON.stringify(currentParams) !== JSON.stringify(params)) {
      setSearchParams(params, { replace: true });
    }
  }, [selectedPid, selectedPeriodId, selectedLotId, setSearchParams]);

  // ── Data Loading ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      // 1. Fetch developer + projects in parallel
      const [devData, projData] = await Promise.all([
        developerService.getById(id),
        projectService.getAll(),
      ]);
      setDeveloper(devData);
      const projList = Array.isArray(projData) ? projData : [];
      setProjects(projList);

      const isAll = selectedPid === "all";
      // ✅ [FIX] Si selectedPid est vide, utiliser le premier projet disponible
      const pid = isAll ? null : (parseInt(selectedPid) || (projList.length > 0 ? projList[0].id : null));
      
      // If no valid PID and not "all", we can't load project-specific stats
      if (!pid && !isAll && projList.length > 0) { 
        // Auto-select first project instead of returning early
        setSelectedPid(String(projList[0].id));
        setLoading(false); 
        return; 
      }
      if (!pid && !isAll) { setLoading(false); return; }

      // 2. Fetch snapshot + heatmap + all-team stats in parallel
      // Pass selectedPeriodId if available to get historical performance
      const [snapData, heatData, summaryData] = await Promise.all([
        analyticsService.getLatest(pid || "all", { 
          developerId: parseInt(id), 
          lotId: selectedLotId, 
          periodId: selectedPeriodId 
        }).catch(() => null),
        developerService.getHeatmap(id, 6).catch(() => null),
        analyticsService.getDeveloperSummary(pid, parseInt(id), { lot_id: selectedLotId, periodId: selectedPeriodId }).catch(() => null),
      ]);

      setSnapshot(snapData);
      setSummary(summaryData);
      setHeatmap(heatData?.activity || []);

      // 3. All developers in project → scores for percentile (Only if PID is valid)
      if (pid) {
        try {
          const allDevsRes = await api.get("/developers", { params: { project_id: pid, page_size: 100 } }).catch(() => null);
          if (allDevsRes) {
            const allDevs = allDevsRes.data?.items || allDevsRes.data || [];
            const allSnapshots = await Promise.allSettled(
              allDevs
                .filter(d => d.id !== parseInt(id))
                .slice(0, 15)
                .map(d => analyticsService.getLatest(pid, { developerId: d.id, lotId: selectedLotId, periodId: selectedPeriodId }))
            );
            const scores = allSnapshots
              .filter(r => r.status === "fulfilled" && r.value?.developer_score != null)
              .map(r => r.value.developer_score);

            if (snapData?.developer_score != null) scores.push(snapData.developer_score);
            setAllDevScores(scores);
          }
        } catch {
          if (snapData?.developer_score != null) setAllDevScores([snapData.developer_score]);
        }
      } else {
        // Mode Global: score unique
        if (snapData?.developer_score != null) setAllDevScores([snapData.developer_score]);
      }

    } catch (err) {
      setError("Impossible de charger les données de performance.");
    } finally {
      setLoading(false);
    }
  }, [id, selectedPid, selectedLotId, selectedPeriodId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived Metrics ─────────────────────────────────────────────────────────
  const activeDays   = useMemo(() => heatmap.filter(d => d.count > 0).length, [heatmap]);
  const totalCommits = useMemo(() => heatmap.reduce((s, d) => s + (d.count || 0), 0), [heatmap]);

  // Sprint Velocity : computed from heatmap for accuracy (last 6 months)
  const sprintVelocity = useMemo(
    () => activeDays > 0 ? Math.round((totalCommits / activeDays) * 100) / 100 : 0,
    [totalCommits, activeDays]
  );

  // Pull enterprise KPIs from snapshot (populated by kpi_calculator after re-run)
  // Fallback to 0 gracefully for older snapshots
  const busFactorVal = (snapshot?.bus_factor)      || 0;
  const churnVal     = (snapshot?.code_churn_rate) || 0;
  const devScore     = summary?.developer_score    || snapshot?.developer_score || 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="page-content">
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:400,gap:16}}>
        <div className="spinner-border text-primary" style={{width:"3rem",height:"3rem"}}></div>
        <p style={{color:"#878a99",margin:0}}>Calcul des métriques de performance…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="page-content"><div className="container-fluid">
      <div style={{background:"#fde8e8",border:"1px solid #f98080",borderRadius:8,padding:"16px 20px",color:"#9b1c1c",display:"flex",alignItems:"center",gap:12}}>
        <i className="ri-error-warning-line fs-4"></i>
        <div><strong>Erreur</strong><p style={{margin:"4px 0 8px"}}>{error}</p>
          <button onClick={loadData} className="btn btn-sm btn-danger">
            <i className="ri-refresh-line me-1"></i>Réessayer
          </button>
        </div>
      </div>
    </div></div>
  );

  if (!developer) return (
    <div className="page-content"><div className="container-fluid">
      <div className="text-center py-5 text-muted"><i className="ri-user-unfollow-line fs-1 d-block mb-2"></i>Développeur introuvable</div>
    </div></div>
  );

  const devDisplayName = developer.name || developer.gitlab_username || "Développeur";
  const pid = parseInt(selectedPid) || projects[0]?.id;

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* ─── Lot Context Banner ─── */}
        {selectedLotId && (
          <div className="alert alert-info border-0 shadow-sm mb-4 d-flex align-items-center gap-3 py-2 px-4" 
            style={{ borderRadius: 12, background: "linear-gradient(90deg, #eff6ff, #f0fdf4)", borderLeft: "4px solid #3b82f6 !important" }}>
            <i className="ri-stack-line fs-20 text-primary"></i>
            <div className="flex-grow-1">
              <span className="fw-bold text-primary me-2">Mode Exploration : Session #{selectedLotId}</span>
              <span className="text-muted fs-12">| Les scores sont calculés sur ce périmètre d'extraction uniquement</span>
              <span className="badge bg-primary-subtle text-primary ms-2 fs-11">Isolation Totale</span>
            </div>
            <Link to="/extraction-lots" className="btn btn-sm btn-soft-primary d-flex align-items-center gap-1">
              <i className="ri-arrow-left-line"></i> Retour aux lots
            </Link>
          </div>
        )}

        {/* ─── Header ─── */}
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div>
              <h4 style={{margin:0,fontWeight:700,fontSize:18,color:"#212529"}}>
                <i className="ri-bar-chart-2-line me-2 text-primary"></i>
                Analyse de Performance 360°
              </h4>
              <ol className="breadcrumb" style={{margin:"4px 0 0",fontSize:13}}>
                <li className="breadcrumb-item">
                  <Link to="/developers" style={{color:"#878a99",textDecoration:"none"}}>Hub Développeurs</Link>
                </li>
                <li className="breadcrumb-item">
                  <Link to={`/developers/${id}${pid ? `?project_id=${pid}` : ""}${selectedLotId ? `&lot_id=${selectedLotId}` : ""}`} style={{color:"#878a99",textDecoration:"none"}}>
                    {devDisplayName}
                  </Link>
                </li>
                <li className="breadcrumb-item active">Performance</li>
              </ol>
            </div>
            <div className="d-flex align-items-center gap-2">
              {projects.length > 0 && (
                <select className="form-select form-select-sm" style={{width:200}} value={selectedPid}
                  onChange={e => setSelectedPid(e.target.value)}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <Link to={`/developers/${id}${pid ? `?project_id=${pid}` : ""}${selectedLotId ? `&lot_id=${selectedLotId}` : ""}`}
                className="btn btn-sm btn-soft-secondary">
                <i className="ri-user-line me-1"></i>Profil
              </Link>
            </div>
          </div>
        </div>

        {/* ─── Developer Hero Card ─── */}
        <div className="card border-0 shadow-sm mb-4" style={{background:"linear-gradient(135deg, #405189 0%, #3577f1 100%)"}}>
          <div className="card-body p-4">
            <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
              {/* Avatar */}
              <div style={{width:72,height:72,borderRadius:"50%",background:"rgba(255,255,255,0.2)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:28,fontWeight:800,color:"#fff",flexShrink:0,
                border:"3px solid rgba(255,255,255,0.4)"}}>
                {getInitials(devDisplayName)}
              </div>
              {/* Info */}
              <div style={{flex:1}}>
                <h3 style={{color:"#fff",fontWeight:800,margin:0,fontSize:22}}>{devDisplayName}</h3>
                <div style={{display:"flex",gap:12,marginTop:4,flexWrap:"wrap"}}>
                  <span style={{color:"rgba(255,255,255,0.7)",fontSize:13}}>
                    <i className="ri-at-line me-1"></i>@{developer.gitlab_username}
                  </span>
                  {developer.email && (
                    <span style={{color:"rgba(255,255,255,0.7)",fontSize:13}}>
                      <i className="ri-mail-line me-1"></i>{developer.email}
                    </span>
                  )}
                  {developer.group?.name && (
                    <span style={{background:"rgba(255,255,255,0.2)",color:"#fff",borderRadius:20,
                      padding:"2px 12px",fontSize:12,fontWeight:600}}>
                      <i className="ri-team-line me-1"></i>{developer.group.name}
                    </span>
                  )}
                  {developer.sites?.length > 0 && (() => {
                    const siteNames = developer.sites
                      .map(s => typeof s === "string" ? s : (s.name || s.site_name || s.label || s.code || null))
                      .filter(Boolean);
                    return siteNames.length > 0 ? (
                      <span style={{background:"rgba(255,255,255,0.15)",color:"#fff",borderRadius:20,
                        padding:"2px 12px",fontSize:12,fontWeight:600}}>
                        <i className="ri-map-pin-line me-1"></i>
                        {siteNames.join(", ")}
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
              {/* Overall score */}
              <div style={{textAlign:"center",background:"rgba(255,255,255,0.15)",borderRadius:12,
                padding:"12px 20px",minWidth:100}}>
                <div style={{fontSize:42,fontWeight:900,color:"#fff",lineHeight:1}}>
                  {Math.round(devScore * 100)}
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:".05em"}}>
                  Score / 100
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Row 1: Enterprise KPIs ─── */}
        <div className="row g-3 mb-4">
          <div className="col-xl-3 col-md-6">
            <ScoreGaugeCard score={devScore} devName={devDisplayName} />
          </div>
          <div className="col-xl-3 col-md-6">
            <BusFactorCard value={busFactorVal} />
          </div>
          <div className="col-xl-3 col-md-6">
            <VelocityCard value={sprintVelocity} totalCommits={totalCommits} activeDays={activeDays} />
          </div>
          <div className="col-xl-3 col-md-6">
            <ChurnCard value={churnVal} />
          </div>
        </div>

        {/* ─── Row 2: Team Percentile + Weekday Activity ─── */}
        <div className="row g-3 mb-4">
          <div className="col-xl-6">
            <TeamPercentile
              devScore={devScore}
              allScores={allDevScores}
              devName={devDisplayName}
            />
          </div>
          <div className="col-xl-6">
            <WeekdayActivityChart heatmap={heatmap} />
          </div>
        </div>

        {/* ─── Row 3: Recommendations ─── */}
        <div className="row g-3 mb-4">
          <div className="col-12">
            <RecommendationsPanel
              snapshot={{ ...(summary || {}), ...(snapshot || {}), sprint_velocity: sprintVelocity }}
              devName={devDisplayName}
            />
          </div>
        </div>

        {/* ─── Footer Actions ─── */}
        <div className="d-flex gap-2 justify-content-end mb-4 d-print-none">
          <button className="btn btn-soft-success" onClick={() => {
            const originalTitle = document.title;
            document.title = `Perf_${devDisplayName.replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}`;
            window.print();
            document.title = originalTitle;
          }}>
            <i className="ri-file-pdf-line me-1"></i>Exporter PDF
          </button>
          <Link to={`/developers/${id}${pid ? `?project_id=${pid}` : ""}`} className="btn btn-soft-primary">
            <i className="ri-arrow-left-line me-1"></i>Retour au Profil
          </Link>
        </div>

      </div>

      {/* ─── Styles ─── */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media print {
          .d-print-none, nav, .sidebar, #topnav, .topnav, .btn, .footer { display: none !important; }
          .page-content { padding: 0 !important; }
          .main-content  { margin-left: 0 !important; }
          .card { break-inside: avoid; box-shadow: none !important; border: 1px solid #e9ecef !important; }
          body  { background: white !important; -webkit-print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}
