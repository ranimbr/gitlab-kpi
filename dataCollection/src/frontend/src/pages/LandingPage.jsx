/**
 * LandingPage.jsx — TELNET COMMAND · v3
 *
 * Améliorations vs v2 :
 *   · CSS Variables système — cohérence totale sur toute la page
 *   · Navbar : frosted glass plus raffiné + logo agrandi
 *   · Hero  : shimmer animé sur les lignes H1 (gradient clip text en mouvement)
 *             + badge "New" sur le bouton CTA
 *   · KPI Mockup : redesigné avec onglets actifs + barre de progression live
 *   · Feature cards : ligne de couleur en bas au hover (accent progressif)
 *                     + numéro de feature en superposition stylisée
 *   · World Map (présence internationale) : sidebar plus dense + dot animé HQ
 *   · Section stats : border-top accent bleu sur chaque stat block au hover
 *   · Scroll reveal amélioré (stagger sur les cards)
 *   · Architecture strip : nodes connectés par des arrows stylisées
 *   · Footer redesigné avec grid et liens
 *   · Three.js ThreeHeroNetwork : conservé, opacité ajustée
 *   · react-simple-maps world map : conservé
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";
import ThreeHeroNetwork from "../components/three/ThreeHeroNetwork";

const FONTS = "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap";

// ─── Custom Cursor ─────────────────────────────────────────────────────────────
function CustomCursor() {
  const dot = useRef(null), ring = useRef(null);
  const pos = useRef({ x: -100, y: -100 }), rp = useRef({ x: -100, y: -100 });
  useEffect(() => {
    const mv = e => { pos.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", mv);
    let raf;
    const anim = () => {
      rp.current.x += (pos.current.x - rp.current.x) * 0.12;
      rp.current.y += (pos.current.y - rp.current.y) * 0.12;
      if (dot.current) dot.current.style.transform = `translate(${pos.current.x - 4}px,${pos.current.y - 4}px)`;
      if (ring.current) ring.current.style.transform = `translate(${rp.current.x - 18}px,${rp.current.y - 18}px)`;
      raf = requestAnimationFrame(anim);
    };
    anim();
    const over = () => ring.current?.classList.add("c-hover");
    const out  = () => ring.current?.classList.remove("c-hover");
    document.querySelectorAll("a,button").forEach(el => { el.addEventListener("mouseenter", over); el.addEventListener("mouseleave", out); });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("mousemove", mv); };
  }, []);
  return (<><div ref={dot} className="c-dot" /><div ref={ring} className="c-ring" /></>);
}

// ─── Counter Hook ──────────────────────────────────────────────────────────────
function useCounter(target, dur = 1800) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; obs.disconnect();
      const s = performance.now();
      const tick = n => { const p = Math.min((n - s) / dur, 1); setVal(Math.round((1 - Math.pow(1 - p, 3)) * target)); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, dur]);
  return [ref, val];
}

// ─── Reveal Hook ───────────────────────────────────────────────────────────────
function useReveal(delay = 0) {
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setTimeout(() => { e.target.classList.add("visible"); }, delay);
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [delay]);
  return ref;
}

// ─── Tilt Card ────────────────────────────────────────────────────────────────
function TiltCard({ children, className = "" }) {
  const ref = useRef(null);
  const mv = useCallback(e => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 18;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -18;
    el.style.transform = `perspective(700px) rotateX(${y}deg) rotateY(${x}deg) scale(1.02)`;
    el.style.boxShadow = `${-x}px ${y}px 32px rgba(26,86,255,.14)`;
  }, []);
  const out = useCallback(() => { const el = ref.current; if (!el) return; el.style.transform = ""; el.style.boxShadow = ""; }, []);
  return <div ref={ref} className={`tilt ${className}`} onMouseMove={mv} onMouseLeave={out}>{children}</div>;
}

// ─── Live Ticker ──────────────────────────────────────────────────────────────
function Ticker() {
  const items = ["MR Rate Tunis ↑ 96.4%","Commit Rate Paris → 4.8/day","Review Time ↓ 10.2h","Merge Success Lyon 98.1%","Devs actifs 147","Alertes KPI 3","Extraction GitLab ✓ 2min","Projets actifs 23","Vélocité globale ↑ 12%","Sfax onboarding 11 devs"];
  return (
    <div className="ticker">
      <div className="ticker-tag">LIVE</div>
      <div className="ticker-track">
        <div className="ticker-inner">
          {[...items, ...items].map((t, i) => <span key={i} className="ticker-item"><span className="ticker-dot" />{t}</span>)}
        </div>
      </div>
    </div>
  );
}

// ─── KPI Mockup (improved) ────────────────────────────────────────────────────
function KpiMockup() {
  const [tick, setTick] = useState(0);
  const [tab, setTab]   = useState(0);

  useEffect(() => { const id = setInterval(() => setTick(t => (t + 1) % 3), 2400); return () => clearInterval(id); }, []);

  const metrics = [
    { l: "MR Rate",       v: ["94.2%","96.1%","93.8%"][tick], up: true,  c: "#10B981" },
    { l: "Review Time",   v: ["11.4h","10.9h","12.1h"][tick], up: false, c: "#F59E0B" },
    { l: "Merge Success", v: ["97.3%","98.0%","96.7%"][tick], up: true,  c: "#1A56FF" },
    { l: "Commit Rate",   v: ["4.2/d","4.6/d","3.9/d"][tick], up: true,  c: "#A78BFA" },
  ];

  const spark = seed => Array.from({ length: 12 }, (_, i) => {
    const x = i * (200 / 11);
    const y = 40 - (Math.sin(i * 0.9 + seed) * 14 + Math.cos(i * 0.5 + seed * 2) * 8);
    return `${x},${y}`;
  }).join(" ");

  const bars = [58, 72, 45, 88, 62, 95, 51, 80];

  return (
    <div className="mock">
      

      {/* Tabs */}
      <div className="mock-tabs">
        {["Aperçu","Commits","MR Flow"].map((t, i) => (
          <button key={i} className={`mock-tab ${tab === i ? "mock-tab-on" : ""}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="mock-cards">
        {metrics.map((m, i) => (
          <div key={i} className="mock-card">
            <div className="mock-card-lbl">{m.l}</div>
            <div className="mock-card-val" style={{ color: m.c }}>{m.v}</div>
            <svg viewBox="0 0 200 50" className="mock-spark" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`g${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={m.c} stopOpacity=".3" /><stop offset="100%" stopColor={m.c} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={spark(i + tick * 0.22) + " 200,50 0,50"} fill={`url(#g${i})`} />
              <polyline points={spark(i + tick * 0.22)} fill="none" stroke={m.c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="mock-delta" style={{ color: m.up ? "#10B981" : "#F59E0B" }}>
              <i className={`ri-arrow-${m.up ? "up" : "down"}-s-fill`} />{m.up ? "+2.4%" : "−1.1%"}
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="mock-chart">
        <div className="mock-chart-hd">
          <span className="mock-chart-lbl">Vélocité équipes · 8 semaines</span>
          <div className="mock-legend">
            {["Tunis","Lyon","Paris"].map((s,i) => <span key={i} className="mock-leg"><span style={{background:["#1A56FF","#10B981","#F59E0B"][i]}}/>{s}</span>)}
          </div>
        </div>
        <div className="mock-bars">
          {bars.map((h, i) => {
            const animated = h + Math.sin(tick * 0.8 + i * 0.7) * 6;
            const colors = ["#1A56FF","#1A56FF","#10B981","#10B981","#F59E0B","#F59E0B","#1A56FF","#10B981"];
            return (
              <div key={i} className="mock-bar-col">
                <div className="mock-bar-fill" style={{ height: `${Math.min(animated, 100)}%`, background: `linear-gradient(to top, ${colors[i]}, ${colors[i]}99)` }} />
                <span className="mock-bar-lbl">{["S1","S2","S3","S4","S5","S6","S7","S8"][i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mock-foot">
        {[["12","Sites actifs"],["147","Devs validés"],["2.4k","MRs/mois"],["3","Alertes"]].map(([v,l],i) => (
          <div key={i} className="mock-fs">
            <span className="mock-fv">{v}</span>
            <span className="mock-fl">{l}</span>
          </div>
        ))}
      </div>
      <div className="mock-scanline" />
    </div>
  );
}

// ─── World Map ────────────────────────────────────────────────────────────────
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const SITES = [
  { name: "Tunisie",         coords: [10.18, 36.81],  hq: true,  devs: 147, proj: 23, status: "Siège social" },
  { name: "France",          coords: [2.35,  48.86],  hq: false, devs: 42,  proj: 8,  status: "R&D Lyon · Paris" },
  { name: "Allemagne",       coords: [13.41, 52.52],  hq: false, devs: 18,  proj: 4,  status: "Engineering Hub" },
  { name: "Arabie Saoudite", coords: [46.68, 24.71],  hq: false, devs: 24,  proj: 5,  status: "Operations" },
  { name: "Oman",            coords: [58.41, 23.59],  hq: false, devs: 12,  proj: 3,  status: "Operations" },
  { name: "USA",             coords: [-77.04, 38.91], hq: false, devs: 8,   proj: 2,  status: "Business Dev" },
  { name: "Russie",          coords: [37.62, 55.75],  hq: false, devs: 6,   proj: 2,  status: "Partenaire" },
];

function PresenceSection() {
  const [active, setActive] = useState(0);
  const [pulse,  setPulse]  = useState(0);
  const ref = useReveal();

  useEffect(() => { const id = setInterval(() => setPulse(p => (p + 1) % 100), 60); return () => clearInterval(id); }, []);

  const site = SITES[active];
  const hq   = SITES[0];

  return (
    <section id="presence" className="lp-section lp-pres">
      <div className="lp-container">
        <div ref={ref} className="reveal lp-sh">
          <div className="lp-ey">/ Déploiement</div>
          <h2 className="lp-h2">Présence <span className="lp-accent">internationale</span></h2>
          <p className="lp-sub">TELNET Engineering Hub déployé sur l'ensemble des sites R&D — de Tunis à Paris, de Riyad à Washington.</p>
        </div>

        <div className="pres-grid">
          {/* Map */}
          <div className="pres-map">
            <div className="pres-map-glow" />
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 138, center: [20, 28] }} style={{ width: "100%", height: "100%" }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) => geographies.map(geo => (
                  <Geography key={geo.rsmKey} geography={geo}
                    fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.1)" strokeWidth={0.5}
                    style={{ default: { outline: "none" }, hover: { fill: "rgba(26,86,255,.18)", outline: "none" }, pressed: { outline: "none" } }}
                  />
                ))}
              </Geographies>
              {SITES.filter(s => !s.hq).map((s, i) => {
                const isAct = active === SITES.indexOf(s);
                return <Line key={i} from={hq.coords} to={s.coords} stroke={isAct ? "#1A56FF" : "rgba(26,86,255,.12)"} strokeWidth={isAct ? 1.5 : 0.8} strokeDasharray="4 4" style={{ transition: "all .4s" }} />;
              })}
              {SITES.map((s, i) => {
                const isHQ  = s.hq;
                const isAct = active === i;
                return (
                  <Marker key={i} coordinates={s.coords} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(0)} style={{ cursor: "pointer" }}>
                    {isHQ && (
                      <>
                        <circle r={4 + (pulse % 40) * 0.15} fill="none" stroke="#1A56FF" strokeWidth={0.6} opacity={1 - (pulse % 40) / 40} />
                        <circle r={2 + ((pulse + 20) % 40) * 0.12} fill="none" stroke="#1A56FF" strokeWidth={0.5} opacity={1 - ((pulse + 20) % 40) / 40} />
                      </>
                    )}
                    {isAct && !isHQ && <circle r={3 + (pulse % 30) * 0.12} fill="none" stroke="#10B981" strokeWidth={0.6} opacity={1 - (pulse % 30) / 30} />}
                    <circle r={isHQ ? 3.8 : isAct ? 2.8 : 2.2} fill={isHQ ? "#1A56FF" : isAct ? "#10B981" : "rgba(255,255,255,.55)"} style={{ transition: "all .3s" }} />
                    {isHQ && <circle r={1.1} fill="#fff" />}
                  </Marker>
                );
              })}
            </ComposableMap>
          </div>

          {/* Sidebar */}
          <div className="pres-side">
            <div className="pres-side-hd">
              <span className="pres-live"><span className="mock-dot" />Sites opérationnels</span>
              <span className="pres-count">{SITES.length} pays</span>
            </div>
            <ul className="pres-list">
              {SITES.map((s, i) => (
                <li key={i} className={`pres-item ${active === i ? "pres-act" : ""} ${s.hq ? "pres-hq" : ""}`}
                  onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(0)}>
                  <div className="pres-dot" style={{ background: s.hq ? "#1A56FF" : active === i ? "#10B981" : "rgba(255,255,255,.2)", boxShadow: (s.hq || active === i) ? `0 0 8px ${s.hq ? "#1A56FF" : "#10B981"}` : "none" }} />
                  <div className="pres-info">
                    <div className="pres-name">{s.name}{s.hq && <span className="pres-hq-tag">HQ</span>}</div>
                    <div className="pres-st">{s.status}</div>
                  </div>
                  <div className="pres-meta">
                    <span className="pres-dv">{s.devs}</span>
                    <span className="pres-dl">devs</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="pres-detail">
              <p className="pres-det-name">{site.name}</p>
              <div className="pres-det-grid">
                {[[site.devs,"Développeurs"],[site.proj,"Projets"],["●","En ligne"]].map(([v,l],i) => (
                  <div key={i} className="pres-kpi">
                    <div className="pres-kv" style={i === 2 ? {color:"#10B981",fontSize:18} : {}}>{v}</div>
                    <div className="pres-kl">{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom stats */}
        <div className="pres-bottom">
          {[["7","Pays couverts"],["257+","Développeurs"],["47","Projets GitLab"],["24/7","Synchro KPI"]].map(([v,l],i) => (
            <div key={i} className="pres-bs">
              <div className="pres-bv">{v}</div>
              <div className="pres-bl">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Stat Block ───────────────────────────────────────────────────────────────
function StatBlock({ target, suffix = "", label }) {
  const [ref, val] = useCounter(target);
  return (
    <div ref={ref} className="stat">
      <div className="stat-n">{val.toLocaleString("fr-FR")}<span className="stat-s">{suffix}</span></div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const secFeat  = useReveal();
  const secStats = useReveal();
  const secCta   = useReveal();

  useEffect(() => {
    if (!document.getElementById("lp3-fonts")) {
      const l = Object.assign(document.createElement("link"), { id: "lp3-fonts", rel: "stylesheet", href: FONTS });
      document.head.appendChild(l);
    }
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = id => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setMenuOpen(false); };

  const features = [
    { n:"01", icon:"ri-git-pull-request-line", title:"Extraction GitLab",      desc:"Pipeline async sécurisé — commits, MRs, approbations via l'API GitLab v4. Logs temps réel.",             tags:["REST API","OAuth2","Async"],     c:"#1A56FF" },
    { n:"02", icon:"ri-cpu-line",              title:"Moteur KPI",             desc:"7 indicateurs — MR Rate, Commit Rate, Review Time, Approved Rate — agrégés par site et développeur.",    tags:["Python","SQLAlchemy","Scheduler"],c:"#10B981" },
    { n:"03", icon:"ri-team-line",             title:"Multi-Sites M2M",        desc:"Un développeur sur plusieurs sites et projets. Import CSV/Excel avec résolution des conflits inline.",    tags:["Multi-sites","CSV","M2M"],       c:"#F59E0B" },
    { n:"04", icon:"ri-bar-chart-box-line",    title:"Dashboard Décisionnel",  desc:"Leaderboards, heatmaps, alertes de seuil, comparaisons inter-périodes et export MD5 vérifiable.",        tags:["React 18","Recharts","Alertes"], c:"#A78BFA" },
    { n:"05", icon:"ri-shield-check-line",     title:"Sécurité & Audit",       desc:"RBAC granulaire (Super Admin, Site Manager, Team Lead). Journal d'audit complet — chiffrement AES-256.", tags:["JWT","RBAC","Audit Log"],        c:"#EC4899" },
    { n:"06", icon:"ri-notification-3-line",   title:"Alertes Intelligentes",  desc:"Détection auto — inactivité dev, seuils KPI dépassés, doublons GitLab — avec notifications immédiates.", tags:["Thresholds","Scheduler","Notifs"],c:"#F97316" },
  ];

  const arch = [
    { icon:"ri-git-repository-line", name:"GitLab API",  sub:"v4 REST"    },
    { icon:"ri-arrow-right-line",    name:"",             sub:""           },
    { icon:"ri-server-line",         name:"FastAPI",      sub:"Python 3.11"},
    { icon:"ri-arrow-right-line",    name:"",             sub:""           },
    { icon:"ri-database-2-line",     name:"PostgreSQL",   sub:"SQLAlchemy" },
    { icon:"ri-arrow-right-line",    name:"",             sub:""           },
    { icon:"ri-reactjs-line",        name:"React 18",     sub:"Vite"       },
    { icon:"ri-arrow-right-line",    name:"",             sub:""           },
    { icon:"ri-dashboard-3-line",    name:"Dashboard",    sub:"KPI Live"   },
  ];

  return (
    <div className="lp-root">
      <style>{CSS}</style>
      <ThreeHeroNetwork />
      <CustomCursor />
      <div className="lp-noise" />

      {/* ── NAVBAR ── */}
      <nav className={`lp-nav ${scrolled ? "lp-nav-scrolled" : ""}`}>
        <div className="lp-nav-in">
          <div className="lp-brand">
            <img src="/assets/images/telnet.png" alt="Telnet" className="lp-logo" />
            
          </div>
          <div className="lp-links">
            <button onClick={() => scrollTo("features")} className="lp-nl">Modules</button>
            <button onClick={() => scrollTo("presence")} className="lp-nl">Présence</button>
            <button onClick={() => scrollTo("stats")}    className="lp-nl">Métriques</button>
            <button onClick={() => scrollTo("cta")}      className="lp-nl">Accès</button>
            <Link to={isAuthenticated ? "/dashboard" : "/login"} className="lp-cta-btn">
              {isAuthenticated ? "Ouvrir le Hub" : "Connexion"}<i className="ri-arrow-right-up-line" />
            </Link>
          </div>
          <button className="lp-ham" onClick={() => setMenuOpen(v => !v)}>
            <i className={menuOpen ? "ri-close-line" : "ri-menu-line"} />
          </button>
        </div>
        {menuOpen && (
          <div className="lp-mob">
            <button onClick={() => scrollTo("features")}>Modules</button>
            <button onClick={() => scrollTo("presence")}>Présence</button>
            <button onClick={() => scrollTo("stats")}>Métriques</button>
            <Link to={isAuthenticated ? "/dashboard" : "/login"}>{isAuthenticated ? "Ouvrir le Hub" : "Connexion"}</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero">
        <div className="lp-orb o1" /><div className="lp-orb o2" /><div className="lp-orb o3" />
        <div className="lp-hero-holo"><img src="/assets/images/telnet.png" alt="" /></div>
        <div className="lp-hero-in">
          <div className="lp-hero-txt">
            <div className="lp-ey"><span className="lp-ey-dot" />Plateforme Décisionnelle R&amp;D · GitLab KPI</div>
            <h1 className="lp-h1">
              <span className="lp-h1a">Pilotez</span>
              <span className="lp-h1b">la vélocité<span className="lp-h1c"> dev.</span></span>
              <span className="lp-h1d">En temps réel.</span>
            </h1>
            <p className="lp-desc">
              TELNET  transforme vos dépôts GitLab en intelligence décisionnelle — commits, merge requests, revues de code — agrégés sur l'ensemble de vos sites R&amp;D mondiaux.
            </p>
            <div className="lp-btns">
              <Link to={isAuthenticated ? "/dashboard" : "/login"} className="lp-btn-p">
                <i className="ri-rocket-2-line" /> Accéder au Dashboard
                <span className="lp-btn-new">LIVE</span>
              </Link>
              <button onClick={() => scrollTo("features")} className="lp-btn-g">Explorer les modules<i className="ri-arrow-down-line" /></button>
            </div>
            <div className="lp-trust">
              {["Multi-sites","RBAC sécurisé","API GitLab native","Import CSV/Excel","Alertes KPI"].map((t,i) => (
                <span key={i} className="lp-tag"><i className="ri-check-line" />{t}</span>
              ))}
            </div>
          </div>
          <div className="lp-hero-vis"><KpiMockup /></div>
        </div>
      </section>

      <Ticker />

      {/* ── FEATURES ── */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <div ref={secFeat} className="reveal lp-sh">
            <div className="lp-ey">/ 06 Modules</div>
            <h2 className="lp-h2">Six dimensions de<br /><span className="lp-accent">performance DevOps</span></h2>
            <p className="lp-sub">De l'extraction GitLab jusqu'à l'alerte intelligente, chaque module adresse un angle critique de la productivité de vos équipes R&D.</p>
          </div>
          <div className="feat-grid">
            {features.map((f, i) => (
              <TiltCard key={i}>
                <div className="feat-card" style={{ "--ac": f.c, animationDelay: `${i * 0.06}s` }}>
                  <div className="feat-n">{f.n}</div>
                  <div className="feat-ico" style={{ background: `${f.c}16`, color: f.c }}><i className={f.icon} /></div>
                  <h3 className="feat-title">{f.title}</h3>
                  <p className="feat-desc">{f.desc}</p>
                  <div className="feat-tags">{f.tags.map((t,j) => <span key={j} className="feat-tag" style={{ borderColor: `${f.c}35`, color: f.c }}>{t}</span>)}</div>
                  <div className="feat-accent-line" />
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRESENCE ── */}
      <PresenceSection />

      {/* ── STATS ── */}
      <section id="stats" className="lp-section lp-stats-sec">
        <div className="lp-container">
          <div ref={secStats} className="reveal stats-grid">
            <StatBlock target={147}  suffix="+" label="Développeurs gérés"  />
            <StatBlock target={12}   suffix=""  label="Sites R&D actifs"    />
            <StatBlock target={2400} suffix=""  label="MRs analysées/mois"  />
            <StatBlock target={7}    suffix=""  label="KPIs calculés"       />
            <StatBlock target={99}   suffix="%" label="Uptime extraction"   />
            <StatBlock target={23}   suffix=""  label="Projets GitLab"      />
          </div>
        </div>
      </section>

      {/* ── ARCHITECTURE ── */}
      <section className="lp-section lp-arch-sec">
        <div className="lp-container">
          <p className="arch-lbl">/ Stack technique</p>
          <div className="arch-flow">
            {arch.map((a, i) => a.name === "" ? (
              <div key={i} className="arch-arr"><i className={a.icon} /></div>
            ) : (
              <div key={i} className="arch-node">
                <div className="arch-ico"><i className={a.icon} /></div>
                <div className="arch-nm">{a.name}</div>
                <div className="arch-sb">{a.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="cta" className="lp-section lp-cta-sec">
        <div className="lp-container">
          <div ref={secCta} className="reveal cta-box">
            <div className="cta-orb" />
            <div className="cta-inner">
              <span className="cta-badge"><span className="cta-dot" />Plateforme opérationnelle</span>
              <h2 className="cta-title">Votre R&amp;D mérite<br />une visibilité totale.</h2>
              <p className="cta-desc">Connectez vos instances GitLab, importez vos équipes et obtenez vos premiers KPIs en moins de 15 minutes.</p>
              <Link to={isAuthenticated ? "/dashboard" : "/login"} className="cta-btn">
                {isAuthenticated ? "Ouvrir le Hub →" : "Demander l'accès →"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="foot-grid">
            <div>
              <div className="foot-brand">
                <img src="/assets/images/telnet.png" alt="Telnet" className="foot-logo" />
                
              </div>
              <p className="foot-copy">Dashboard KPI GitLab <br />Plateforme d'intelligence R&D</p>
            </div>
            <div>
              <p className="foot-h">Plateforme</p>
              {["Dashboard KPI","Analyse GitLab","Import Équipes","Alertes"].map((t,i) => <p key={i} className="foot-l">{t}</p>)}
            </div>
            <div>
              <p className="foot-h">Administration</p>
              {["Gestion Sites","Gestion Projets","Développeurs","Audit Log"].map((t,i) => <p key={i} className="foot-l">{t}</p>)}
            </div>
            <div>
              <p className="foot-h">Sécurité</p>
              {["JWT / RBAC","AES-256","Audit Trail","HTTPS"].map((t,i) => <p key={i} className="foot-l">{t}</p>)}
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 TELNET HOLDING</span><span className="foot-sep">·</span>
            <span>R&D Intranet</span><span className="foot-sep">·</span>
            <span>Chiffré AES-256</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  :root{
    --bl:#1A56FF;--cy:#00D4FF;--gn:#10B981;--am:#F59E0B;--pu:#A78BFA;
    --bg:#040912;--bg2:#07101F;--br:rgba(255,255,255,.06);
    --tx:#E2E8F0;--mt:rgba(255,255,255,.38);
    --fd:'Syne',sans-serif;--fm:'DM Mono',monospace;--fb:'Plus Jakarta Sans',sans-serif;
    --ease:cubic-bezier(.16,1,.3,1);
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:6px;} ::-webkit-scrollbar-track{background:var(--bg);} ::-webkit-scrollbar-thumb{background:var(--bl);border-radius:10px;}

  .lp-root{background:var(--bg);color:var(--tx);font-family:var(--fb);min-height:100vh;overflow-x:hidden;cursor:none;}

  /* Cursor */
  .c-dot{position:fixed;top:0;left:0;z-index:9999;width:8px;height:8px;background:var(--bl);border-radius:50%;pointer-events:none;}
  .c-ring{position:fixed;top:0;left:0;z-index:9998;width:36px;height:36px;border:1.5px solid rgba(26,86,255,.6);border-radius:50%;pointer-events:none;transition:width .2s,height .2s,border-color .2s;}
  .c-ring.c-hover{width:52px;height:52px;border-color:rgba(26,86,255,1);}

  .lp-noise{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.025;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:256px 256px;}
  .lp-container{max-width:1280px;margin:0 auto;padding:0 32px;}

  /* Orbs */
  .lp-orb{position:absolute;border-radius:50%;filter:blur(120px);pointer-events:none;z-index:0;}
  .o1{width:700px;height:700px;background:radial-gradient(circle,rgba(26,86,255,.12),transparent 65%);top:-200px;left:-200px;animation:orb 20s ease-in-out infinite alternate;}
  .o2{width:500px;height:500px;background:radial-gradient(circle,rgba(245,158,11,.07),transparent 65%);top:30%;right:-150px;animation:orb 24s ease-in-out infinite alternate-reverse;}
  .o3{width:400px;height:400px;background:radial-gradient(circle,rgba(16,185,129,.06),transparent 65%);bottom:0;left:40%;}
  @keyframes orb{0%{transform:translate(0,0);}100%{transform:translate(55px,38px);}}

  /* Navbar */
  .lp-nav{position:fixed;top:0;left:0;right:0;z-index:500;padding:18px 0;transition:background .4s var(--ease),backdrop-filter .4s,padding .4s,border-color .4s;border-bottom:1px solid transparent;}
  .lp-nav-scrolled{background:rgba(4,9,18,.75);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);padding:12px 0;border-color:rgba(26,86,255,.14);box-shadow:0 4px 28px rgba(0,0,0,.4),0 0 20px rgba(26,86,255,.04);}
  .lp-nav-in{max-width:1280px;margin:0 auto;padding:0 32px;display:flex;align-items:center;justify-content:space-between;}
  .lp-brand{display:flex;align-items:center;gap:12px;}
  .lp-logo{height:34px;width:auto;object-fit:contain;filter:drop-shadow(0 0 8px rgba(26,86,255,.4));transition:transform .3s;}
  .lp-brand:hover .lp-logo{transform:scale(1.08);}
  .lp-brand-n{font-family:var(--fd);font-weight:800;font-size:15px;color:#fff;letter-spacing:.1em;line-height:1.2;}
  .lp-brand-s{font-family:var(--fm);font-size:8px;color:rgba(255,255,255,.2);letter-spacing:.15em;text-transform:uppercase;margin-top:1px;}
  .lp-links{display:flex;align-items:center;gap:4px;}
  .lp-nl{background:none;border:none;cursor:none;font-family:var(--fb);font-size:14px;font-weight:500;color:var(--mt);padding:8px 14px;border-radius:6px;transition:color .2s,background .2s;}
  .lp-nl:hover{color:#fff;background:rgba(255,255,255,.04);}
  .lp-cta-btn{display:inline-flex;align-items:center;gap:6px;background:var(--bl);color:#fff;font-family:var(--fb);font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;margin-left:8px;transition:background .2s,transform .2s;box-shadow:0 4px 16px rgba(26,86,255,.3);}
  .lp-cta-btn:hover{background:#1446D4;transform:translateY(-1px);color:#fff;}
  .lp-ham{display:none;background:none;border:none;cursor:none;color:#fff;font-size:22px;padding:4px;}
  .lp-mob{display:flex;flex-direction:column;background:rgba(4,9,18,.98);border-top:1px solid var(--br);padding:14px 32px;}
  .lp-mob button,.lp-mob a{background:none;border:none;cursor:none;color:rgba(255,255,255,.7);font-size:15px;font-weight:500;padding:12px 0;border-bottom:1px solid var(--br);text-decoration:none;text-align:left;}

  /* Hero */
  .lp-hero{position:relative;min-height:100vh;display:flex;align-items:center;padding:120px 32px 80px;overflow:hidden;}
  .lp-hero-in{max-width:1280px;margin:0 auto;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;position:relative;z-index:10;}
  .lp-hero-holo{position:absolute;top:8%;right:-5%;width:520px;opacity:.04;pointer-events:none;z-index:0;filter:blur(3px) brightness(1.8);animation:holo 26s ease-in-out infinite;}
  .lp-hero-holo img{width:100%;height:auto;}
  @keyframes holo{0%,100%{transform:translate(0,0) scale(1) rotate(0deg);opacity:.04;}50%{transform:translate(-36px,28px) scale(1.07) rotate(2deg);opacity:.07;}}

  .lp-ey{display:inline-flex;align-items:center;gap:8px;font-family:var(--fm);font-size:10px;color:var(--mt);letter-spacing:.14em;text-transform:uppercase;margin-bottom:24px;}
  .lp-ey-dot{width:6px;height:6px;border-radius:50%;background:var(--bl);animation:pd 2s ease-in-out infinite;display:inline-block;}
  @keyframes pd{0%,100%{box-shadow:0 0 0 0 rgba(26,86,255,.6);}50%{box-shadow:0 0 0 6px rgba(26,86,255,0);}}

  .lp-h1{font-family:var(--fd);font-weight:800;font-size:clamp(3rem,5.5vw,5.2rem);line-height:1.02;letter-spacing:-.03em;color:#fff;margin-bottom:26px;display:flex;flex-direction:column;}
  .lp-h1a,.lp-h1b,.lp-h1d{display:block;opacity:0;transform:translateY(28px);animation:rv .8s var(--ease) forwards;}
  .lp-h1a{animation-delay:.1s;}
  .lp-h1b{animation-delay:.25s;background:linear-gradient(90deg,#fff 0%,rgba(26,86,255,.7) 50%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:rv .8s var(--ease) .25s forwards,shimmer 8s linear 1s infinite;}
  .lp-h1c{-webkit-text-fill-color:var(--bl);}
  .lp-h1d{animation-delay:.4s;color:rgba(255,255,255,.28);font-weight:400;-webkit-text-fill-color:rgba(255,255,255,.28);}
  @keyframes rv{to{opacity:1;transform:translateY(0);}}
  @keyframes shimmer{to{background-position:200% center;}}

  .lp-desc{font-size:16px;line-height:1.75;color:rgba(255,255,255,.45);max-width:480px;margin-bottom:32px;opacity:0;animation:rv .8s var(--ease) .52s forwards;}
  .lp-btns{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:28px;opacity:0;animation:rv .8s var(--ease) .62s forwards;}

  .lp-btn-p{display:inline-flex;align-items:center;gap:8px;background:var(--bl);color:#fff;font-family:var(--fb);font-size:15px;font-weight:700;padding:14px 26px;border-radius:10px;text-decoration:none;box-shadow:0 8px 30px rgba(26,86,255,.35);transition:all .22s;position:relative;overflow:hidden;}
  .lp-btn-p::before{content:'';position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,.18),transparent);transform:skewX(-20deg);animation:btn-shim 4s ease-in-out 1s infinite;}
  @keyframes btn-shim{0%,80%{left:-60%;}100%{left:160%;}}
  .lp-btn-p:hover{background:#1446D4;transform:translateY(-2px);color:#fff;box-shadow:0 14px 40px rgba(26,86,255,.45);}
  .lp-btn-new{display:inline-flex;align-items:center;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);color:#10B981;font-family:var(--fm);font-size:9px;font-weight:600;padding:2px 7px;border-radius:4px;letter-spacing:.1em;margin-left:4px;}

  .lp-btn-g{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);color:rgba(255,255,255,.65);font-family:var(--fb);font-size:15px;font-weight:500;padding:14px 22px;border-radius:10px;border:1px solid rgba(255,255,255,.07);cursor:none;transition:all .2s;}
  .lp-btn-g:hover{background:rgba(255,255,255,.07);color:#fff;}

  .lp-trust{display:flex;flex-wrap:wrap;gap:8px;opacity:0;animation:rv .8s var(--ease) .72s forwards;}
  .lp-tag{display:inline-flex;align-items:center;gap:4px;font-family:var(--fm);font-size:10px;color:var(--mt);letter-spacing:.05em;}
  .lp-tag i{color:var(--gn);font-size:11px;}

  .lp-hero-vis{opacity:0;transform:translateX(36px);animation:rv 1s var(--ease) .4s forwards;}

  /* KPI Mockup */
  .mock{background:rgba(6,12,26,.97);border:1px solid rgba(255,255,255,.07);border-radius:16px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.03);position:relative;}
  .mock-bar{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.3);}
  .mock-dots{display:flex;gap:5px;} .mock-dots span{width:10px;height:10px;border-radius:50%;display:block;}
  .mock-title{font-family:var(--fm);font-size:10px;color:rgba(255,255,255,.25);flex:1;text-align:center;letter-spacing:.08em;}
  .mock-live{display:flex;align-items:center;gap:5px;font-family:var(--fm);font-size:9px;color:var(--gn);letter-spacing:.1em;}
  .mock-dot{width:6px;height:6px;border-radius:50%;background:var(--gn);animation:pd 1.5s ease-in-out infinite;display:inline-block;}

  .mock-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.05);}
  .mock-tab{flex:1;background:none;border:none;cursor:pointer;font-family:var(--fm);font-size:10px;color:rgba(255,255,255,.28);padding:10px;letter-spacing:.06em;text-transform:uppercase;border-bottom:2px solid transparent;transition:all .2s;}
  .mock-tab-on{color:var(--bl);border-bottom-color:var(--bl);}

  .mock-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.05);}
  .mock-card{background:rgba(6,12,26,.97);padding:14px 12px 10px;position:relative;overflow:hidden;transition:background .2s;}
  .mock-card:hover{background:rgba(12,22,44,.98);}
  .mock-card-lbl{font-family:var(--fm);font-size:8px;color:rgba(255,255,255,.25);letter-spacing:.1em;text-transform:uppercase;margin-bottom:5px;}
  .mock-card-val{font-family:var(--fd);font-weight:700;font-size:20px;line-height:1;margin-bottom:8px;transition:all .4s;}
  .mock-spark{height:34px;display:block;margin-bottom:5px;}
  .mock-delta{font-family:var(--fm);font-size:9px;display:flex;align-items:center;}

  .mock-chart{padding:14px 18px;}
  .mock-chart-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
  .mock-chart-lbl{font-family:var(--fm);font-size:9px;color:rgba(255,255,255,.22);letter-spacing:.07em;text-transform:uppercase;}
  .mock-legend{display:flex;gap:10px;}
  .mock-leg{font-family:var(--fm);font-size:9px;color:rgba(255,255,255,.32);display:flex;align-items:center;gap:4px;}
  .mock-leg span{width:7px;height:7px;border-radius:50%;display:inline-block;}
  .mock-bars{display:flex;align-items:flex-end;gap:6px;height:80px;}
  .mock-bar-col{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;height:100%;justify-content:flex-end;}
  .mock-bar-fill{width:100%;border-radius:3px 3px 0 0;transition:height .5s var(--ease);min-height:4px;}
  .mock-bar-lbl{font-family:var(--fm);font-size:7px;color:rgba(255,255,255,.22);}

  .mock-foot{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.2);}
  .mock-fs{padding:10px 14px;border-right:1px solid rgba(255,255,255,.04);display:flex;flex-direction:column;gap:2px;}
  .mock-fs:last-child{border:none;}
  .mock-fv{font-family:var(--fd);font-weight:700;font-size:15px;color:#fff;}
  .mock-fl{font-family:var(--fm);font-size:8px;color:rgba(255,255,255,.25);letter-spacing:.07em;text-transform:uppercase;}
  .mock-scanline{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,.009) 3px,rgba(255,255,255,.009) 4px);}

  /* Ticker */
  .ticker{position:relative;z-index:10;background:rgba(26,86,255,.06);border-top:1px solid rgba(26,86,255,.14);border-bottom:1px solid rgba(26,86,255,.14);overflow:hidden;display:flex;align-items:center;height:40px;}
  .ticker-tag{font-family:var(--fm);font-size:9px;color:var(--bl);letter-spacing:.18em;padding:0 18px;border-right:1px solid rgba(26,86,255,.2);flex-shrink:0;z-index:2;background:rgba(4,9,18,.5);}
  .ticker-track{flex:1;overflow:hidden;}
  .ticker-inner{display:flex;align-items:center;white-space:nowrap;animation:tick 42s linear infinite;}
  @keyframes tick{to{transform:translateX(-50%);}}
  .ticker-item{display:inline-flex;align-items:center;gap:8px;font-family:var(--fm);font-size:10px;color:rgba(255,255,255,.32);padding:0 26px;letter-spacing:.04em;}
  .ticker-dot{width:3px;height:3px;border-radius:50%;background:rgba(26,86,255,.5);flex-shrink:0;}

  /* Sections */
  .lp-section{padding:96px 0;position:relative;z-index:10;}
  .lp-sh{text-align:center;max-width:620px;margin:0 auto 64px;}
  .lp-h2{font-family:var(--fd);font-weight:800;font-size:clamp(2.4rem,4vw,3.6rem);line-height:1.06;letter-spacing:-.02em;color:#fff;margin-bottom:18px;}
  .lp-accent{background:linear-gradient(135deg,var(--bl),var(--pu),var(--gn));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
  .lp-sub{font-size:15px;line-height:1.72;color:rgba(255,255,255,.36);}

  /* Reveal */
  .reveal{opacity:0;transform:translateY(24px);transition:opacity .8s var(--ease),transform .8s var(--ease);}
  .reveal.visible{opacity:1;transform:translateY(0);}

  /* Feature cards */
  .feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
  .tilt{transition:transform .4s ease,box-shadow .4s ease;}
  .feat-card{background:rgba(255,255,255,.02);border:1px solid var(--br);border-radius:14px;padding:28px;position:relative;overflow:hidden;cursor:none;transition:border-color .2s;height:100%;}
  .feat-card:hover{border-color:rgba(255,255,255,.1);}
  .feat-n{font-family:var(--fd);font-weight:800;font-size:58px;color:rgba(255,255,255,.025);position:absolute;top:10px;right:16px;line-height:1;}
  .feat-ico{width:46px;height:46px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:18px;}
  .feat-title{font-family:var(--fd);font-weight:700;font-size:17px;color:#fff;margin-bottom:9px;}
  .feat-desc{font-size:13px;line-height:1.7;color:rgba(255,255,255,.35);margin-bottom:18px;}
  .feat-tags{display:flex;flex-wrap:wrap;gap:5px;}
  .feat-tag{font-family:var(--fm);font-size:9px;padding:3px 9px;border-radius:4px;border:1px solid;letter-spacing:.04em;}
  .feat-accent-line{position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--ac,#1A56FF);transform:scaleX(0);transform-origin:left;transition:transform .3s var(--ease);opacity:.8;}
  .feat-card:hover .feat-accent-line{transform:scaleX(1);}

  /* Presence */
  .lp-pres{background:linear-gradient(180deg,transparent,rgba(26,86,255,.03),transparent);border-top:1px solid var(--br);}
  .pres-grid{display:grid;grid-template-columns:1fr 320px;gap:28px;align-items:start;margin-bottom:48px;}
  .pres-map{position:relative;background:rgba(6,12,26,.6);border:1px solid var(--br);border-radius:18px;overflow:hidden;padding:20px;min-height:320px;}
  .pres-map-glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(26,86,255,.06),transparent 70%);pointer-events:none;}

  .pres-side{background:rgba(6,12,26,.8);border:1px solid var(--br);border-radius:14px;overflow:hidden;}
  .pres-side-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--br);background:rgba(0,0,0,.2);}
  .pres-live{display:flex;align-items:center;gap:6px;font-family:var(--fm);font-size:9px;color:var(--gn);letter-spacing:.08em;}
  .pres-count{font-family:var(--fm);font-size:9px;color:var(--mt);letter-spacing:.08em;}
  .pres-list{padding:6px 0;list-style:none;}
  .pres-item{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;transition:background .2s;border-left:2px solid transparent;}
  .pres-item:hover{background:rgba(255,255,255,.025);}
  .pres-act{background:rgba(26,86,255,.06);border-left-color:var(--bl);}
  .pres-hq{background:rgba(26,86,255,.03);}
  .pres-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;transition:background .3s,box-shadow .3s;}
  .pres-info{flex:1;min-width:0;}
  .pres-name{font-family:var(--fb);font-size:12px;font-weight:500;color:#fff;display:flex;align-items:center;gap:6px;}
  .pres-hq-tag{font-family:var(--fm);font-size:8px;background:rgba(26,86,255,.2);color:var(--bl);padding:2px 6px;border-radius:3px;letter-spacing:.1em;}
  .pres-st{font-family:var(--fm);font-size:9px;color:var(--mt);letter-spacing:.03em;margin-top:1px;}
  .pres-meta{text-align:right;}
  .pres-dv{font-family:var(--fd);font-weight:700;font-size:15px;color:#fff;display:block;}
  .pres-dl{font-family:var(--fm);font-size:8px;color:var(--mt);}

  .pres-detail{border-top:1px solid var(--br);padding:14px 16px;background:rgba(26,86,255,.04);}
  .pres-det-name{font-family:var(--fd);font-weight:800;font-size:15px;color:#fff;margin-bottom:10px;}
  .pres-det-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
  .pres-kpi{text-align:center;}
  .pres-kv{font-family:var(--fd);font-weight:700;font-size:18px;color:#fff;line-height:1;}
  .pres-kl{font-family:var(--fm);font-size:8px;color:var(--mt);letter-spacing:.06em;text-transform:uppercase;margin-top:3px;}

  .pres-bottom{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:rgba(255,255,255,.04);border:1px solid var(--br);border-radius:14px;overflow:hidden;}
  .pres-bs{background:var(--bg);padding:28px 20px;text-align:center;transition:background .2s;}
  .pres-bs:hover{background:rgba(8,16,32,.98);}
  .pres-bv{font-family:var(--fd);font-weight:800;font-size:30px;color:#fff;line-height:1;margin-bottom:5px;}
  .pres-bl{font-family:var(--fm);font-size:9px;color:var(--mt);letter-spacing:.08em;text-transform:uppercase;}

  /* Stats */
  .lp-stats-sec{background:rgba(26,86,255,.025);border-top:1px solid var(--br);border-bottom:1px solid var(--br);}
  .stats-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;background:rgba(255,255,255,.04);border:1px solid var(--br);border-radius:14px;overflow:hidden;}
  .stat{background:var(--bg);padding:32px 20px;text-align:center;transition:background .2s,border-top-color .2s;border-top:2px solid transparent;}
  .stat:hover{background:rgba(8,16,32,.98);border-top-color:var(--bl);}
  .stat-n{font-family:var(--fd);font-weight:800;font-size:38px;color:#fff;line-height:1;margin-bottom:7px;}
  .stat-s{font-size:28px;color:var(--bl);}
  .stat-l{font-family:var(--fm);font-size:9px;color:var(--mt);letter-spacing:.08em;text-transform:uppercase;line-height:1.4;}

  /* Architecture */
  .lp-arch-sec{padding:56px 0;border-top:1px solid var(--br);border-bottom:1px solid var(--br);}
  .arch-lbl{font-family:var(--fm);font-size:10px;color:rgba(255,255,255,.2);letter-spacing:.18em;text-transform:uppercase;text-align:center;margin-bottom:24px;}
  .arch-flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;}
  .arch-node{display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(255,255,255,.02);border:1px solid var(--br);border-radius:10px;padding:14px 18px;min-width:90px;transition:border-color .2s,background .2s;}
  .arch-node:hover{border-color:rgba(26,86,255,.3);background:rgba(26,86,255,.04);}
  .arch-ico{font-size:20px;color:rgba(255,255,255,.4);margin-bottom:2px;}
  .arch-nm{font-family:var(--fd);font-weight:700;font-size:12px;color:#fff;}
  .arch-sb{font-family:var(--fm);font-size:9px;color:var(--mt);letter-spacing:.04em;}
  .arch-arr{color:rgba(255,255,255,.14);font-size:16px;padding:0 2px;}

  /* CTA */
  .lp-cta-sec{padding:96px 0 72px;}
  .cta-box{background:rgba(26,86,255,.05);border:1px solid rgba(26,86,255,.16);border-radius:20px;padding:72px 52px;text-align:center;position:relative;overflow:hidden;}
  .cta-orb{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(26,86,255,.09),transparent 65%);pointer-events:none;animation:orb 18s ease-in-out infinite alternate;}
  .cta-inner{position:relative;z-index:1;}
  .cta-badge{display:inline-flex;align-items:center;gap:7px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.18);padding:5px 13px;border-radius:20px;font-family:var(--fm);font-size:10px;color:var(--gn);letter-spacing:.1em;margin-bottom:22px;}
  .cta-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--gn);animation:pd 1.5s ease-in-out infinite;}
  .cta-title{font-family:var(--fd);font-weight:800;font-size:clamp(2rem,3.5vw,3rem);line-height:1.08;letter-spacing:-.02em;color:#fff;margin-bottom:18px;}
  .cta-desc{font-size:15px;color:rgba(255,255,255,.36);line-height:1.72;max-width:460px;margin:0 auto 36px;}
  .cta-btn{display:inline-flex;align-items:center;background:#fff;color:var(--bg);font-family:var(--fd);font-size:16px;font-weight:800;padding:15px 38px;border-radius:10px;text-decoration:none;transition:all .22s;box-shadow:0 8px 28px rgba(255,255,255,.08);letter-spacing:.01em;}
  .cta-btn:hover{background:#E2E8F0;transform:translateY(-2px);color:var(--bg);box-shadow:0 14px 38px rgba(255,255,255,.14);}

  /* Footer */
  .lp-footer{border-top:1px solid var(--br);padding:48px 0 32px;position:relative;z-index:10;}
  .foot-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:40px;margin-bottom:40px;}
  .foot-brand{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
  .foot-logo{height:24px;width:auto;opacity:.55;filter:grayscale(1) brightness(2);}
  .foot-bname{font-family:var(--fd);font-weight:800;font-size:16px;color:#fff;letter-spacing:.08em;}
  .foot-copy{font-family:var(--fm);font-size:10px;color:rgba(255,255,255,.2);letter-spacing:.04em;line-height:1.7;}
  .foot-h{font-family:var(--fm);font-size:9px;color:rgba(255,255,255,.2);letter-spacing:.14em;text-transform:uppercase;margin-bottom:14px;font-weight:600;}
  .foot-l{font-family:var(--fb);font-size:13px;color:var(--mt);margin-bottom:8px;transition:color .2s;cursor:default;}
  .foot-l:hover{color:#fff;}
  .foot-bottom{display:flex;align-items:center;gap:10px;border-top:1px solid var(--br);padding-top:24px;font-family:var(--fm);font-size:10px;color:rgba(255,255,255,.2);}
  .foot-sep{opacity:.3;}

  /* Responsive */
  @media(max-width:1100px){.lp-hero-in{grid-template-columns:1fr;gap:48px;}.lp-hero-vis{display:none;}.feat-grid{grid-template-columns:repeat(2,1fr);}.stats-grid{grid-template-columns:repeat(3,1fr);}.pres-grid{grid-template-columns:1fr;}.foot-grid{grid-template-columns:1fr 1fr;gap:28px;}}
  @media(max-width:768px){.lp-hero{padding:100px 20px 60px;}.feat-grid{grid-template-columns:1fr;}.stats-grid{grid-template-columns:repeat(2,1fr);}.lp-links{display:none;}.lp-ham{display:flex;}.lp-container{padding:0 20px;}.cta-box{padding:48px 24px;}.foot-grid{grid-template-columns:1fr;}.lp-footer{padding:32px 0 24px;}.arch-arr{display:none;}.pres-bottom{grid-template-columns:repeat(2,1fr);}.c-dot,.c-ring{display:none;}.lp-root{cursor:auto;}}
`;