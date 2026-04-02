/**
 * pages/LandingPage.jsx — Enterprise Edition + Présence Internationale
 *
 * Design direction : "Orbital Command" — dark-space premium,
 * canvas particle network, animated KPI mockup, kinetic typography,
 * 3D tilt cards, custom cursor, live data ticker, world map section.
 *
 * Fonts : Syne (display) + DM Mono (data) + Plus Jakarta Sans (body)
 * Color  : #040912 base · #1A56FF primary · #F59E0B gold · #10B981 green
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line
} from "react-simple-maps";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap";

// ─────────────────────────────────────────────────────────────────────────────
//  CANVAS PARTICLE NETWORK
// ─────────────────────────────────────────────────────────────────────────────
function ParticleCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let mouse = { x: null, y: null };
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    const N = Math.min(70, Math.floor(window.innerWidth / 22));
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.8 + 0.6,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (mouse.x) {
        nodes.forEach(n => {
          const dx = mouse.x - n.x, dy = mouse.y - n.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 180) { n.vx += (dx / d) * 0.012; n.vy += (dy / d) * 0.012; }
        });
      }
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        n.vx *= 0.992; n.vy *= 0.992;
        if (n.x < 0) n.x = canvas.width; if (n.x > canvas.width) n.x = 0;
        if (n.y < 0) n.y = canvas.height; if (n.y > canvas.height) n.y = 0;
      });
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 160) {
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(26,86,255,${0.18 * (1 - d / 160)})`; ctx.lineWidth = 0.7; ctx.stroke();
          }
        }
      }
      nodes.forEach(n => { ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(26,86,255,0.55)"; ctx.fill(); });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.85 }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CUSTOM CURSOR
// ─────────────────────────────────────────────────────────────────────────────
function CustomCursor() {
  const dot = useRef(null), ring = useRef(null);
  const pos = useRef({ x: -100, y: -100 }), ring_pos = useRef({ x: -100, y: -100 });
  useEffect(() => {
    const move = e => { pos.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", move);
    let raf;
    const animate = () => {
      ring_pos.current.x += (pos.current.x - ring_pos.current.x) * 0.12;
      ring_pos.current.y += (pos.current.y - ring_pos.current.y) * 0.12;
      if (dot.current) dot.current.style.transform = `translate(${pos.current.x - 4}px, ${pos.current.y - 4}px)`;
      if (ring.current) ring.current.style.transform = `translate(${ring_pos.current.x - 18}px, ${ring_pos.current.y - 18}px)`;
      raf = requestAnimationFrame(animate);
    };
    animate();
    const over = () => ring.current && ring.current.classList.add("cursor-hover");
    const out = () => ring.current && ring.current.classList.remove("cursor-hover");
    document.querySelectorAll("a, button").forEach(el => { el.addEventListener("mouseenter", over); el.addEventListener("mouseleave", out); });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("mousemove", move); };
  }, []);
  return (<><div ref={dot} className="cursor-dot" /><div ref={ring} className="cursor-ring" /></>);
}

// ─────────────────────────────────────────────────────────────────────────────
//  COUNTER ANIMATION HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useCounter(target, duration = 1800) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const tick = now => {
        const p = Math.min((now - start) / duration, 1);
        setValue(Math.round((1 - Math.pow(1 - p, 3)) * target));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, duration]);
  return [ref, value];
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATED KPI MOCKUP
// ─────────────────────────────────────────────────────────────────────────────
function KpiMockup() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 2200); return () => clearInterval(id); }, []);
  const metrics = [
    { label: "MR Rate", value: ["94.2%", "96.1%", "93.8%"][tick % 3], up: true, color: "#10B981" },
    { label: "Review Time", value: ["11.4h", "10.9h", "12.1h"][tick % 3], up: false, color: "#F59E0B" },
    { label: "Merge Success", value: ["97.3%", "98.0%", "96.7%"][tick % 3], up: true, color: "#1A56FF" },
    { label: "Commit Rate", value: ["4.2/d", "4.6/d", "3.9/d"][tick % 3], up: true, color: "#A78BFA" },
  ];
  const sparkPoints = (seed) => Array.from({ length: 12 }, (_, i) => {
    const x = i * (200 / 11);
    const y = 40 - (Math.sin(i * 0.9 + seed) * 14 + Math.cos(i * 0.5 + seed * 2) * 8);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="kpi-mockup-shell">
      <div className="km-topbar">
        <div className="km-dots"><span className="km-dot" style={{ background: "#FF5F57" }} /><span className="km-dot" style={{ background: "#FFBD2E" }} /><span className="km-dot" style={{ background: "#28CA41" }} /></div>
        <div className="km-title">Dashboard KPI · GitLab</div>
        <div className="km-live"><span className="km-live-dot" />LIVE</div>
      </div>
      <div className="km-cards">
        {metrics.map((m, i) => (
          <div key={i} className="km-card" style={{ "--accent": m.color }}>
            <div className="km-card-label">{m.label}</div>
            <div className="km-card-value" style={{ color: m.color }}>{m.value}</div>
            <svg viewBox="0 0 200 50" className="km-spark" preserveAspectRatio="none">
              <defs><linearGradient id={`sg${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={m.color} stopOpacity="0.3" /><stop offset="100%" stopColor={m.color} stopOpacity="0" /></linearGradient></defs>
              <polygon points={sparkPoints(i + tick * 0.2) + " 200,50 0,50"} fill={`url(#sg${i})`} />
              <polyline points={sparkPoints(i + tick * 0.2)} fill="none" stroke={m.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="km-card-delta" style={{ color: m.up ? "#10B981" : "#F59E0B" }}>
              <i className={`ri-arrow-${m.up ? "up" : "down"}-s-fill`} />{m.up ? "+2.4%" : "-1.1%"}
            </div>
          </div>
        ))}
      </div>
      <div className="km-chart-area">
        <div className="km-chart-header">
          <span className="km-chart-title">Vélocité Multi-Sites · 30 jours</span>
          <div style={{ display: "flex", gap: 12 }}>
            {["Tunis", "Lyon", "Paris"].map((s, i) => (
              <span key={i} className="km-legend">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: ["#1A56FF", "#10B981", "#F59E0B"][i], display: "inline-block", marginRight: 4 }} />{s}
              </span>
            ))}
          </div>
        </div>
        <svg viewBox="0 0 600 140" className="km-main-chart" preserveAspectRatio="none">
          {[0, 35, 70, 105, 140].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />)}
          {[
            { d: "M0,90 C60,70 120,40 180,55 S300,30 360,45 S480,20 600,35", c: "#1A56FF" },
            { d: "M0,110 C60,90 120,75 180,80 S300,60 360,70 S480,50 600,55", c: "#10B981" },
            { d: "M0,120 C60,105 120,95 180,100 S300,80 360,90 S480,70 600,75", c: "#F59E0B" },
          ].map((l, i) => (
            <g key={i}><path d={l.d} fill="none" stroke={l.c} strokeWidth="2" strokeLinecap="round" className="chart-draw" style={{ animationDelay: `${i * 0.3}s` }} /></g>
          ))}
        </svg>
      </div>
      <div className="km-footer-row">
        {["Sites actifs", "Devs validés", "MRs ce mois", "Alertes"].map((lbl, i) => (
          <div key={i} className="km-footer-stat">
            <span className="km-fs-val">{["12", "147", "2.4k", "3"][i]}</span>
            <span className="km-fs-lbl">{lbl}</span>
          </div>
        ))}
      </div>
      <div className="km-scanline" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LIVE DATA TICKER
// ─────────────────────────────────────────────────────────────────────────────
function DataTicker() {
  const items = ["MR Rate Tunis ↑ 96.4%", "Commit Rate Paris → 4.8/day", "Code Review Time ↓ 10.2h", "Merge Success Lyon 98.1%", "Active Devs 147", "Alertes KPI 3", "Extraction GitLab ✓ 2min ago", "Projets actifs 23", "Vélocité globale ↑ 12%"];
  return (
    <div className="ticker-wrap">
      <div className="ticker-label">LIVE</div>
      <div className="ticker-track">
        <div className="ticker-inner">
          {[...items, ...items].map((it, i) => <span key={i} className="ticker-item"><span className="ticker-dot" />{it}</span>)}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  3D TILT CARD
// ─────────────────────────────────────────────────────────────────────────────
function TiltCard({ children, className = "" }) {
  const ref = useRef(null);
  const onMove = useCallback(e => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 22;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -22;
    el.style.transform = `perspective(700px) rotateX(${y}deg) rotateY(${x}deg) scale(1.03)`;
    el.style.boxShadow = `${-x * 1.2}px ${y * 1.2}px 40px rgba(26,86,255,0.18)`;
  }, []);
  const onLeave = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.style.transform = "perspective(700px) rotateX(0) rotateY(0) scale(1)";
    el.style.boxShadow = "";
  }, []);
  return <div ref={ref} className={`tilt-card ${className}`} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  STAT BLOCK
// ─────────────────────────────────────────────────────────────────────────────
function StatBlock({ target, suffix = "", label }) {
  const [ref, value] = useCounter(target);
  return (
    <div ref={ref} className="stat-block">
      <div className="stat-number">{value.toLocaleString("fr-FR")}<span className="stat-suffix">{suffix}</span></div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  REVEAL SECTION HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { e.target.classList.add("revealed"); obs.disconnect(); }
    }, { threshold: 0.12 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return ref;
}

// ─────────────────────────────────────────────────────────────────────────────
//  WORLD MAP — PRÉSENCE INTERNATIONALE
// ─────────────────────────────────────────────────────────────────────────────
const PRESENCE_SITES = [
  { name: "Tunisie",        coordinates: [10.18, 36.81],  hq: true,  devs: 147, projects: 23, status: "Siège social" },
  { name: "France",         coordinates: [2.35, 48.86],   hq: false, devs: 42,  projects: 8,  status: "R&D Lyon · Paris" },
  { name: "Allemagne",      coordinates: [13.41, 52.52],  hq: false, devs: 18,  projects: 4,  status: "Engineering Hub" },
  { name: "Arabie Saoudite",coordinates: [46.68, 24.71],  hq: false, devs: 24,  projects: 5,  status: "Operations" },
  { name: "Oman",           coordinates: [58.41, 23.59],  hq: false, devs: 12,  projects: 3,  status: "Operations" },
  { name: "USA",            coordinates: [-77.04, 38.91], hq: false, devs: 8,   projects: 2,  status: "Business Dev" },
  { name: "Russie",         coordinates: [37.62, 55.75],  hq: false, devs: 6,   projects: 2,  status: "Partenaire" },
];

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function WorldMapSVG({ activeIdx, onHover }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulse(p => (p + 1) % 100), 50);
    return () => clearInterval(id);
  }, []);

  const hq = PRESENCE_SITES[0];

  return (
    <div className="world-map-container" style={{ width: "100%", height: "450px", position: "relative" }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140, center: [20, 30] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="rgba(255, 255, 255, 0.03)"
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth={0.5}
                style={{
                  default: { outline: "none", transition: "all 0.3s" },
                  hover: { fill: "rgba(26, 86, 255, 0.2)", outline: "none" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {/* Lines from HQ to sites */}
        {PRESENCE_SITES.filter(s => !s.hq).map((site, i) => {
          const isActive = activeIdx === PRESENCE_SITES.findIndex(s => s.name === site.name);
          return (
            <Line
              key={i}
              from={hq.coordinates}
              to={site.coordinates}
              stroke={isActive ? "#1A56FF" : "rgba(26, 86, 255, 0.15)"}
              strokeWidth={isActive ? 1.5 : 0.8}
              strokeDasharray="4 4"
              style={{ transition: "all 0.4s" }}
            />
          );
        })}

        {/* Markers */}
        {PRESENCE_SITES.map((site, i) => {
          const isHQ = site.hq;
          const isActive = activeIdx === i;
          return (
            <Marker
              key={i}
              coordinates={site.coordinates}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Pulse effect */}
              {isHQ && (
                <g>
                  <circle r={4 + (pulse % 40) * 0.15} fill="none" stroke="#1A56FF" strokeWidth="0.5" opacity={1 - (pulse % 40) / 40} />
                  <circle r={2 + ((pulse + 20) % 40) * 0.12} fill="none" stroke="#1A56FF" strokeWidth="0.4" opacity={1 - ((pulse + 20) % 40) / 40} />
                </g>
              )}
              {isActive && !isHQ && (
                <circle r={3 + (pulse % 30) * 0.12} fill="none" stroke="#10B981" strokeWidth="0.5" opacity={1 - (pulse % 30) / 30} />
              )}
              
              <circle
                r={isHQ ? 3.5 : isActive ? 2.8 : 2}
                fill={isHQ ? "#1A56FF" : isActive ? "#10B981" : "rgba(255, 255, 255, 0.6)"}
                style={{ transition: "all 0.3s" }}
              />
              
              {isHQ && <circle r={1} fill="#fff" />}

              {/* Tooltip anchor helper (the map-tooltip uses coordinates, but we need screen pos. 
                  Actually, we'll keep the sidebar interaction and maybe refine the tooltip later.) */}
            </Marker>
          );
        })}
      </ComposableMap>
    </div>
  );
}

function PresenceSection() {
  const [activeIdx, setActiveIdx] = useState(0);
  const revealRef = useReveal();
  const activeSite = PRESENCE_SITES[activeIdx ?? 0];

  return (
    <section id="presence" className="lp-section lp-section--presence">
      <div className="lp-container">
        <div ref={revealRef} className="lp-section-header scroll-reveal-up">
          <div className="lp-section-eyebrow">/ Déploiement</div>
          <h2 className="lp-h2">
            Présence<br />
            <span className="lp-gradient-text">internationale</span>
          </h2>
          <p className="lp-section-sub">
            TELNET Engineering Hub est déployé sur l'ensemble des sites R&D
            du groupe — de Tunis à Paris, de Riyad à Moscou.
          </p>
        </div>

        <div className="presence-layout">
          {/* Map */}
          <div className="presence-map-wrap">
            <div className="presence-map-bg" />
            <WorldMapSVG activeIdx={activeIdx} onHover={setActiveIdx} />

            {/* Tooltip overlay — We'll disable the floating tooltip for now as markers in ComposableMap 
                don't easily provide percentage coordinates for absolute positioning without extra work.
                The info is already visible in the Sidebar and detailed stats below. */}
          </div>

          {/* Sites list */}
          <div className="presence-sidebar">
            <div className="ps-header">
              <span className="ps-live"><span className="km-live-dot" />Sites opérationnels</span>
              <span className="ps-count">{PRESENCE_SITES.length} pays</span>
            </div>
            <div className="ps-list">
              {PRESENCE_SITES.map((site, i) => (
                <div
                  key={i}
                  className={`ps-item ${activeIdx === i ? "ps-item--active" : ""} ${site.hq ? "ps-item--hq" : ""}`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx(0)}
                >
                  <div className="ps-dot" style={{ background: site.hq ? "#1A56FF" : activeIdx === i ? "#10B981" : "rgba(255,255,255,0.25)" }} />
                  <div className="ps-info">
                    <div className="ps-name">
                      {site.name}
                      {site.hq && <span className="ps-hq-badge">HQ</span>}
                    </div>
                    <div className="ps-sub">{site.status}</div>
                  </div>
                  <div className="ps-meta">
                    <span className="ps-devs">{site.devs}</span>
                    <span className="ps-devs-lbl">devs</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Active site detail */}
            <div className="ps-detail">
              <div className="ps-detail-name">{activeSite.name}</div>
              <div className="ps-detail-grid">
                <div className="ps-detail-kpi">
                  <div className="ps-kpi-val">{activeSite.devs}</div>
                  <div className="ps-kpi-lbl">Développeurs</div>
                </div>
                <div className="ps-detail-kpi">
                  <div className="ps-kpi-val">{activeSite.projects}</div>
                  <div className="ps-kpi-lbl">Projets actifs</div>
                </div>
                <div className="ps-detail-kpi">
                  <div className="ps-kpi-val" style={{ color: "#10B981", fontSize: 14 }}>●</div>
                  <div className="ps-kpi-lbl">En ligne</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom stats */}
        <div className="presence-bottom-stats">
          {[
            { val: "7", lbl: "Pays couverts" },
            { val: "257+", lbl: "Développeurs connectés" },
            { val: "47", lbl: "Projets GitLab actifs" },
            { val: "24/7", lbl: "Synchronisation KPI" },
          ].map((s, i) => (
            <div key={i} className="pbs-item">
              <div className="pbs-val">{s.val}</div>
              <div className="pbs-lbl">{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const featRef  = useReveal();
  const statsRef = useReveal();
  const ctaRef   = useReveal();

  useEffect(() => {
    if (!document.getElementById("lp-fonts")) {
      const link = document.createElement("link");
      link.id = "lp-fonts"; link.rel = "stylesheet"; link.href = FONT_HREF;
      document.head.appendChild(link);
    }
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = id => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setMenuOpen(false); };

  const features = [
    { num: "01", icon: "ri-git-pull-request-line", title: "Extraction GitLab", desc: "Pipeline asynchrone sécurisé qui collecte commits, MRs et approbations en temps réel via l'API native GitLab v4.", tags: ["REST API", "OAuth2", "Webhook"], color: "#1A56FF" },
    { num: "02", icon: "ri-cpu-line", title: "Moteur KPI", desc: "7 indicateurs calculés — MR Rate, Commit Rate, Review Time, Approved MR Rate et plus — agrégés par site, projet et développeur.", tags: ["Python", "SQLAlchemy", "Scheduler"], color: "#10B981" },
    { num: "03", icon: "ri-team-line", title: "Gestion Équipes", desc: "Modèle multi-sites M2M. Un développeur peut appartenir à plusieurs projets et sites. Import CSV/Excel avec résolution des conflits.", tags: ["Multi-sites", "Import CSV", "Validation"], color: "#F59E0B" },
    { num: "04", icon: "ri-bar-chart-box-line", title: "Dashboard Décisionnel", desc: "Visualisation React temps-réel avec leaderboards, heatmaps d'activité, alertes de seuil et comparaisons inter-périodes.", tags: ["React", "Recharts", "Alertes"], color: "#A78BFA" },
    { num: "05", icon: "ri-shield-check-line", title: "Sécurité & Audit", desc: "Contrôle d'accès granulaire (Super Admin, Site Manager, Team Lead, Viewer). Audit log complet de chaque action.", tags: ["JWT", "RBAC", "Audit Log"], color: "#EC4899" },
    { num: "06", icon: "ri-notification-3-line", title: "Alertes Intelligentes", desc: "Détection automatique des anomalies — inactivité développeur, seuils KPI dépassés, doublons GitLab — avec notifications.", tags: ["Scheduler", "Thresholds", "Notifications"], color: "#F97316" },
  ];

  return (
    <div className="lp-root">
      <style>{CSS}</style>
      <ParticleCanvas />
      <CustomCursor />
      <div className="lp-noise" />

      {/* NAVBAR */}
      <nav className={`lp-nav ${scrolled ? "lp-nav--scrolled" : ""}`}>
        <div className="lp-nav-inner">
          <div className="lp-brand">
            <div className="lp-brand-mark">
              <img src="/assets/images/telnet.png" alt="Telnet Logo" className="lp-brand-logo" />
            </div>
          </div>
          <div className="lp-nav-links">
            <button onClick={() => scrollTo("features")} className="lp-navlink">Modules</button>
            <button onClick={() => scrollTo("presence")} className="lp-navlink">Présence</button>
            <button onClick={() => scrollTo("stats")} className="lp-navlink">Métriques</button>
            <button onClick={() => scrollTo("cta")} className="lp-navlink">Accès</button>
            <Link to={isAuthenticated ? "/dashboard" : "/login"} className="lp-nav-cta">
              {isAuthenticated ? "Ouvrir le Hub" : "Connexion"}<i className="ri-arrow-right-up-line" />
            </Link>
          </div>
          <button className="lp-hamburger" onClick={() => setMenuOpen(v => !v)}>
            <i className={menuOpen ? "ri-close-line" : "ri-menu-line"} />
          </button>
        </div>
        {menuOpen && (
          <div className="lp-mobile-menu">
            <button onClick={() => scrollTo("features")}>Modules</button>
            <button onClick={() => scrollTo("presence")}>Présence</button>
            <button onClick={() => scrollTo("stats")}>Métriques</button>
            <Link to={isAuthenticated ? "/dashboard" : "/login"}>{isAuthenticated ? "Ouvrir le Hub" : "Connexion"}</Link>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-hologram"><img src="/assets/images/telnet.png" alt="" /></div>
        <div className="lp-orb lp-orb-1" /><div className="lp-orb lp-orb-2" /><div className="lp-orb lp-orb-3" />
        <div className="lp-hero-inner">
          <div className="lp-hero-text">
            <div className="lp-eyebrow"><span className="lp-eyebrow-dot" />Plateforme Décisionnelle R&amp;D · GitLab KPI</div>
            <h1 className="lp-h1">
              <span className="lp-h1-line lp-h1-line--1">Pilotez</span>
              <span className="lp-h1-line lp-h1-line--2">la vélocité<span className="lp-h1-accent"> dev.</span></span>
              <span className="lp-h1-line lp-h1-line--3">En temps réel.</span>
            </h1>
            <p className="lp-hero-desc">
              TELNET Engineering Hub transforme vos dépôts GitLab en intelligence décisionnelle — commits, merge requests, revues de code — agrégés sur l'ensemble de vos sites R&amp;D.
            </p>
            <div className="lp-hero-actions">
              <Link to={isAuthenticated ? "/dashboard" : "/login"} className="lp-btn-primary"><i className="ri-rocket-2-line" />Accéder au Dashboard</Link>
              <button onClick={() => scrollTo("features")} className="lp-btn-ghost">Explorer les modules<i className="ri-arrow-down-line" /></button>
            </div>
            <div className="lp-trust">
              {["Multi-sites", "RBAC sécurisé", "API GitLab native", "Import CSV"].map((t, i) => (
                <span key={i} className="lp-trust-tag"><i className="ri-check-line" /> {t}</span>
              ))}
            </div>
          </div>
          <div className="lp-hero-visual"><KpiMockup /></div>
        </div>
      </section>

      <DataTicker />

      {/* FEATURES */}
      <section id="features" className="lp-section lp-section--features">
        <div className="lp-container">
          <div ref={featRef} className="lp-section-header scroll-reveal-up">
            <div className="lp-section-eyebrow">/ Modules</div>
            <h2 className="lp-h2">Six dimensions de<br /><span className="lp-gradient-text">performance DevOps</span></h2>
            <p className="lp-section-sub">Chaque module adresse un angle critique de la productivité équipe, de l'extraction Git jusqu'à l'alerte intelligente.</p>
          </div>
          <div className="lp-features-grid">
            {features.map((f, i) => (
              <TiltCard key={i} className="lp-feat-card">
                <div className="lp-feat-num">{f.num}</div>
                <div className="lp-feat-icon" style={{ color: f.color, background: `${f.color}14` }}><i className={f.icon} /></div>
                <h3 className="lp-feat-title">{f.title}</h3>
                <p className="lp-feat-desc">{f.desc}</p>
                <div className="lp-feat-tags">{f.tags.map((t, j) => <span key={j} className="lp-feat-tag" style={{ borderColor: `${f.color}40`, color: f.color }}>{t}</span>)}</div>
                <div className="lp-feat-glow" style={{ background: `radial-gradient(circle at 50% 100%, ${f.color}18, transparent 70%)` }} />
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* PRESENCE INTERNATIONALE */}
      <PresenceSection />

      {/* STATS */}
      <section id="stats" className="lp-section lp-section--stats">
        <div className="lp-container">
          <div ref={statsRef} className="lp-stats-grid scroll-reveal-up">
            <StatBlock target={147} suffix="+" label="Développeurs gérés" />
            <StatBlock target={12} suffix="" label="Sites R&D actifs" />
            <StatBlock target={2400} suffix="" label="MRs analysées/mois" />
            <StatBlock target={7} suffix="" label="KPIs calculés" />
            <StatBlock target={99} suffix="%" label="Uptime extraction" />
            <StatBlock target={23} suffix="" label="Projets GitLab" />
          </div>
        </div>
      </section>

      {/* ARCHITECTURE STRIP */}
      <section className="lp-section lp-section--arch">
        <div className="lp-container">
          <div className="lp-arch-strip">
            <div className="lp-arch-label">Stack technique</div>
            <div className="lp-arch-flow">
              {[
                { icon: "ri-git-repository-line", name: "GitLab API", sub: "Extraction" },
                { icon: "ri-arrow-right-line", name: "", sub: "" },
                { icon: "ri-server-line", name: "FastAPI", sub: "Python 3.11" },
                { icon: "ri-arrow-right-line", name: "", sub: "" },
                { icon: "ri-database-2-line", name: "PostgreSQL", sub: "SQLAlchemy" },
                { icon: "ri-arrow-right-line", name: "", sub: "" },
                { icon: "ri-reactjs-line", name: "React 18", sub: "Vite" },
                { icon: "ri-arrow-right-line", name: "", sub: "" },
                { icon: "ri-dashboard-3-line", name: "Dashboard", sub: "KPI Live" },
              ].map((item, i) => item.name === "" ? (
                <div key={i} className="lp-arch-arrow"><i className={item.icon} /></div>
              ) : (
                <div key={i} className="lp-arch-node">
                  <div className="lp-arch-icon"><i className={item.icon} /></div>
                  <div className="lp-arch-name">{item.name}</div>
                  <div className="lp-arch-sub">{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="lp-section lp-section--cta">
        <div className="lp-container">
          <div ref={ctaRef} className="lp-cta-box scroll-reveal-up">
            <div className="lp-cta-orb" />
            <div className="lp-cta-content">
              <div className="lp-cta-eyebrow">
                <span className="lp-live-badge"><span className="lp-live-pulse" />Plateforme opérationnelle</span>
              </div>
              <h2 className="lp-cta-title">Votre R&amp;D mérite<br />une visibilité totale.</h2>
              <p className="lp-cta-desc">Connectez vos instances GitLab, importez vos équipes et obtenez vos premiers KPIs en moins de 15 minutes.</p>
              <Link to={isAuthenticated ? "/dashboard" : "/login"} className="lp-btn-cta">
                {isAuthenticated ? "Ouvrir le Hub →" : "Demander l'accès →"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-inner">
            <div className="lp-footer-brand">
              <div className="lp-footer-brand-top">
                <img src="/assets/images/telnet.png" alt="Telnet" className="lp-footer-logo" />
                <div className="lp-brand-name" style={{ fontSize: 18 }}>TELNET</div>
              </div>
              <div className="lp-footer-copy">Dashboard KPI GitLab · v5.0</div>
            </div>
            <div className="lp-footer-meta">
              <span>© 2026 Telnet Holding</span><span className="lp-footer-sep">·</span>
              <span>R&amp;D Intranet</span><span className="lp-footer-sep">·</span>
              <span>Chiffré AES-256</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CSS
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .lp-root { background: #040912; color: #E2E8F0; font-family: 'Plus Jakarta Sans', sans-serif; min-height: 100vh; overflow-x: hidden; cursor: none; }
  
  /* Modern Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #040912; }
  ::-webkit-scrollbar-thumb { background: #1A56FF; border-radius: 10px; box-shadow: inset 0 0 6px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); }
  ::-webkit-scrollbar-thumb:hover { background: #1446D4; }


  /* Cursor */
  .cursor-dot { position: fixed; top: 0; left: 0; z-index: 9999; width: 8px; height: 8px; background: #1A56FF; border-radius: 50%; pointer-events: none; transition: opacity .2s; }
  .cursor-ring { position: fixed; top: 0; left: 0; z-index: 9998; width: 36px; height: 36px; border: 1.5px solid rgba(26,86,255,0.6); border-radius: 50%; pointer-events: none; transition: width .2s, height .2s, border-color .2s; }
  .cursor-ring.cursor-hover { width: 54px; height: 54px; border-color: rgba(26,86,255,1); }

  /* Noise */
  .lp-noise { position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: 0.025; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); background-size: 256px 256px; }

  .lp-container { max-width: 1280px; margin: 0 auto; padding: 0 32px; }

  /* Orbs */
  .lp-orb { position: absolute; border-radius: 50%; filter: blur(120px); pointer-events: none; z-index: 0; }
  .lp-orb-1 { width: 700px; height: 700px; background: radial-gradient(circle, rgba(26,86,255,0.12), transparent 65%); top: -200px; left: -200px; animation: orb-drift 18s ease-in-out infinite alternate; }
  .lp-orb-2 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(245,158,11,0.08), transparent 65%); top: 30%; right: -150px; animation: orb-drift 22s ease-in-out infinite alternate-reverse; }
  .lp-orb-3 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(16,185,129,0.07), transparent 65%); bottom: 0; left: 40%; }
  @keyframes orb-drift { 0% { transform: translate(0, 0); } 100% { transform: translate(60px, 40px); } }

  /* Navbar */
  .lp-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 500; padding: 20px 0; transition: background .4s cubic-bezier(0.16,1,0.3,1), backdrop-filter .4s, padding .4s, border-color .4s; border-bottom: 1px solid transparent; }
  .lp-nav--scrolled { background: rgba(4,9,18,0.7); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); padding: 12px 0; border-color: rgba(26,86,255,0.15); box-shadow: 0 4px 30px rgba(0,0,0,0.4), 0 0 20px rgba(26,86,255,0.05); }
  .lp-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 32px; display: flex; align-items: center; justify-content: space-between; }
  .lp-brand { display: flex; align-items: center; gap: 12px; cursor: default; }
  .lp-brand-mark svg { width: 32px; height: 32px; }
  .lp-brand-name { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 20px; color: #fff; letter-spacing: 0.06em; }
  .lp-brand-sub { font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.35); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 1px; }
  .lp-nav-links { display: flex; align-items: center; gap: 8px; }
  .lp-navlink { background: none; border: none; cursor: none; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.55); padding: 8px 16px; border-radius: 6px; transition: color .2s, background .2s; }
  .lp-navlink:hover { color: #fff; background: rgba(255,255,255,0.05); }
  .lp-nav-cta { display: inline-flex; align-items: center; gap: 6px; background: #1A56FF; color: #fff; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 600; padding: 10px 22px; border-radius: 8px; text-decoration: none; margin-left: 8px; transition: background .2s, transform .2s; }
  .lp-nav-cta:hover { background: #1446D4; transform: translateY(-1px); color: #fff; }
  .lp-hamburger { display: none; background: none; border: none; cursor: none; color: #fff; font-size: 22px; padding: 4px; }
  .lp-mobile-menu { display: flex; flex-direction: column; background: rgba(4,9,18,0.98); border-top: 1px solid rgba(255,255,255,0.07); padding: 16px 32px; }
  .lp-mobile-menu button, .lp-mobile-menu a { background: none; border: none; cursor: none; color: #fff; font-size: 15px; font-weight: 500; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06); text-decoration: none; text-align: left; }

  /* Hero */
  .lp-hero { position: relative; min-height: 100vh; display: flex; align-items: center; padding: 120px 32px 80px; overflow: hidden; }
  .lp-hero-inner { max-width: 1280px; margin: 0 auto; width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; position: relative; z-index: 10; }
  .lp-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.45); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 28px; }
  .lp-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: #1A56FF; animation: pulse-dot 2s ease-in-out infinite; }
  @keyframes pulse-dot { 0%, 100% { box-shadow: 0 0 0 0 rgba(26,86,255,0.6); } 50% { box-shadow: 0 0 0 6px rgba(26,86,255,0); } }
  .lp-h1 { font-family: 'Syne', sans-serif; font-weight: 800; font-size: clamp(3.2rem, 5.5vw, 5.2rem); line-height: 1.02; letter-spacing: -0.03em; color: #fff; margin-bottom: 28px; display: flex; flex-direction: column; }
  .lp-h1-line { 
    display: block; opacity: 0; transform: translateY(30px); 
    background: linear-gradient(90deg, #fff, rgba(26,86,255,0.5), #fff);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: h1-shimmer 8s linear infinite, h1-reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards; 
  }
  .lp-h1-line--1 { animation-delay: 0.1s; } 
  .lp-h1-line--2 { animation-delay: 0.25s; filter: drop-shadow(0 0 15px rgba(26,86,255,0.15)); } 
  .lp-h1-line--3 { animation-delay: 0.4s; color: rgba(255,255,255,0.35); font-weight: 400; -webkit-text-fill-color: rgba(255,255,255,0.35); }
  .lp-h1-accent { color: #1A56FF; position: relative; -webkit-text-fill-color: #1A56FF; }
  .lp-h1-accent::after { content: ''; position: absolute; bottom: 4px; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #1A56FF, #A78BFA); border-radius: 2px; }
  @keyframes h1-reveal { to { opacity: 1; transform: translateY(0); } }
  @keyframes h1-shimmer { to { background-position: 200% center; } }
  .lp-hero-desc { font-size: 16px; line-height: 1.75; color: rgba(255,255,255,0.5); max-width: 480px; margin-bottom: 36px; opacity: 0; animation: h1-reveal 0.8s 0.55s forwards; }
  .lp-hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 32px; opacity: 0; animation: h1-reveal 0.8s 0.65s forwards; }
  .lp-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: #1A56FF; color: #fff; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 700; padding: 14px 28px; border-radius: 10px; text-decoration: none; box-shadow: 0 8px 32px rgba(26,86,255,0.35); transition: all .25s; }
  .lp-btn-primary:hover { background: #1446D4; transform: translateY(-2px); color: #fff; box-shadow: 0 12px 40px rgba(26,86,255,0.45); }
  .lp-btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.7); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 500; padding: 14px 24px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); cursor: none; transition: all .2s; }
  .lp-btn-ghost:hover { background: rgba(255,255,255,0.08); color: #fff; }
  .lp-trust { display: flex; flex-wrap: wrap; gap: 8px; opacity: 0; animation: h1-reveal 0.8s 0.75s forwards; }
  .lp-trust-tag { display: inline-flex; align-items: center; gap: 5px; font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 0.05em; }
  .lp-trust-tag i { color: #10B981; font-size: 12px; }
  .lp-hero-visual { opacity: 0; transform: translateX(40px); animation: h1-reveal 1s 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }

  /* KPI Mockup */
  .kpi-mockup-shell { background: rgba(8,14,30,0.95); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03); position: relative; backdrop-filter: blur(20px); }
  .km-topbar { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.3); }
  .km-dots { display: flex; gap: 6px; }
  .km-dot { width: 10px; height: 10px; border-radius: 50%; }
  .km-title { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.3); flex: 1; text-align: center; letter-spacing: 0.08em; }
  .km-live { display: flex; align-items: center; gap: 5px; font-family: 'DM Mono', monospace; font-size: 10px; color: #10B981; letter-spacing: 0.1em; }
  .km-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #10B981; animation: pulse-dot 1.5s ease-in-out infinite; }
  .km-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.05); }
  .km-card { background: rgba(8,14,30,0.95); padding: 16px 14px 12px; position: relative; overflow: hidden; transition: background .2s; }
  .km-card:hover { background: rgba(12,20,40,0.98); }
  .km-card-label { font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.3); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; }
  .km-card-value { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 20px; line-height: 1; margin-bottom: 10px; transition: all .4s; }
  .km-spark { height: 36px; display: block; margin-bottom: 6px; }
  .km-card-delta { font-family: 'DM Mono', monospace; font-size: 10px; display: flex; align-items: center; }
  .km-chart-area { padding: 16px 20px; }
  .km-chart-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .km-chart-title { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.3); letter-spacing: 0.06em; }
  .km-legend { font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.35); display: flex; align-items: center; }
  .km-main-chart { height: 130px; display: block; }
  .chart-draw { stroke-dasharray: 1500; stroke-dashoffset: 1500; animation: draw 2.5s cubic-bezier(0.4,0,0.2,1) forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .km-footer-row { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2); }
  .km-footer-stat { padding: 12px 16px; border-right: 1px solid rgba(255,255,255,0.04); display: flex; flex-direction: column; gap: 2px; }
  .km-footer-stat:last-child { border: none; }
  .km-fs-val { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; color: #fff; }
  .km-fs-lbl { font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.28); letter-spacing: 0.07em; text-transform: uppercase; }
  .km-scanline { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px); }

  /* Ticker */
  .ticker-wrap { position: relative; z-index: 10; background: rgba(26,86,255,0.06); border-top: 1px solid rgba(26,86,255,0.15); border-bottom: 1px solid rgba(26,86,255,0.15); overflow: hidden; display: flex; align-items: center; height: 44px; }
  .ticker-label { font-family: 'DM Mono', monospace; font-size: 9px; color: #1A56FF; letter-spacing: 0.15em; padding: 0 20px; border-right: 1px solid rgba(26,86,255,0.2); flex-shrink: 0; z-index: 2; background: rgba(4,9,18,0.5); }
  .ticker-track { flex: 1; overflow: hidden; }
  .ticker-inner { display: flex; align-items: center; white-space: nowrap; animation: ticker-scroll 40s linear infinite; }
  @keyframes ticker-scroll { to { transform: translateX(-50%); } }
  .ticker-item { display: inline-flex; align-items: center; gap: 8px; font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.4); padding: 0 32px; letter-spacing: 0.05em; }
  .ticker-dot { width: 3px; height: 3px; border-radius: 50%; background: rgba(26,86,255,0.5); flex-shrink: 0; }

  /* Sections */
  .lp-section { padding: 100px 0; position: relative; z-index: 10; }
  .lp-section--features { background: transparent; }
  .lp-section--stats { background: linear-gradient(180deg, transparent, rgba(26,86,255,0.04), transparent); }
  .lp-section--arch { padding: 60px 0; border-top: 1px solid rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.04); }
  .lp-section--cta { padding: 100px 0 80px; }
  .lp-section-header { text-align: center; max-width: 640px; margin: 0 auto 72px; }
  .lp-section-eyebrow { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.3); letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 16px; }
  .lp-h2 { font-family: 'Syne', sans-serif; font-weight: 800; font-size: clamp(2.4rem, 4vw, 3.6rem); line-height: 1.08; letter-spacing: -0.02em; color: #fff; margin-bottom: 20px; }
  .lp-gradient-text { background: linear-gradient(135deg, #1A56FF, #A78BFA, #10B981); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .lp-section-sub { font-size: 15px; line-height: 1.7; color: rgba(255,255,255,0.4); }

  /* Feature Cards */
  .lp-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .lp-feat-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 32px; position: relative; overflow: hidden; cursor: none; transition: border-color .2s, transform .2s, box-shadow .2s; }
  .lp-feat-card:hover { border-color: rgba(255,255,255,0.12); }
  .lp-feat-num { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 56px; color: rgba(255,255,255,0.03); position: absolute; top: 12px; right: 20px; line-height: 1; }
  .lp-feat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 20px; }
  .lp-feat-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 18px; color: #fff; margin-bottom: 10px; }
  .lp-feat-desc { font-size: 13.5px; line-height: 1.7; color: rgba(255,255,255,0.4); margin-bottom: 20px; }
  .lp-feat-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .lp-feat-tag { font-family: 'DM Mono', monospace; font-size: 10px; padding: 4px 10px; border-radius: 4px; border: 1px solid; letter-spacing: 0.05em; }
  .lp-feat-glow { position: absolute; bottom: 0; left: 0; right: 0; height: 100%; pointer-events: none; opacity: 0; transition: opacity .3s; }
  .lp-feat-card:hover .lp-feat-glow { opacity: 1; }
  .tilt-card { transition: transform .4s ease, box-shadow .4s ease; }

  /* ── PRESENCE INTERNATIONALE ── */
  .lp-section--presence {
    background: linear-gradient(180deg, transparent, rgba(26,86,255,0.03) 30%, rgba(16,185,129,0.02) 70%, transparent);
    border-top: 1px solid rgba(255,255,255,0.04);
  }
  .presence-layout {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 32px;
    align-items: start;
    margin-bottom: 64px;
  }
  .presence-map-wrap {
    position: relative;
    background: rgba(8,16,36,0.6);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 20px;
    overflow: hidden;
    padding: 24px;
    min-height: 340px;
  }
  .presence-map-bg {
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 50% 50%, rgba(26,86,255,0.06), transparent 70%);
    pointer-events: none;
  }
  .world-map-container { position: relative; z-index: 1; }
  .world-svg { width: 100%; height: auto; display: block; }

  /* Tooltip */
  .map-tooltip {
    position: absolute;
    transform: translate(-50%, -140%);
    pointer-events: none;
    z-index: 20;
    animation: tooltip-in 0.2s ease;
  }
  @keyframes tooltip-in { from { opacity: 0; transform: translate(-50%, -120%); } to { opacity: 1; transform: translate(-50%, -140%); } }
  .map-tooltip-inner {
    background: rgba(8,14,30,0.97);
    border: 1px solid rgba(26,86,255,0.3);
    border-radius: 10px;
    padding: 10px 14px;
    min-width: 160px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    backdrop-filter: blur(20px);
  }
  .map-tt-name { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 14px; color: #fff; margin-bottom: 3px; }
  .map-tt-status { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 0.06em; margin-bottom: 8px; }
  .map-tt-row { display: flex; gap: 14px; font-family: 'DM Mono', monospace; font-size: 11px; color: #10B981; }
  .map-tt-row i { margin-right: 4px; }

  /* Sidebar */
  .presence-sidebar {
    background: rgba(8,14,30,0.8);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    overflow: hidden;
  }
  .ps-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(0,0,0,0.2);
  }
  .ps-live { display: flex; align-items: center; gap: 6px; font-family: 'DM Mono', monospace; font-size: 10px; color: #10B981; letter-spacing: 0.08em; }
  .ps-count { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.3); letter-spacing: 0.08em; }
  .ps-list { padding: 8px 0; }
  .ps-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 18px;
    cursor: pointer;
    transition: background 0.2s;
    border-left: 2px solid transparent;
  }
  .ps-item:hover { background: rgba(255,255,255,0.03); }
  .ps-item--active { background: rgba(26,86,255,0.06); border-left-color: #1A56FF; }
  .ps-item--hq { background: rgba(26,86,255,0.04); }
  .ps-item--hq.ps-item--active { border-left-color: #1A56FF; }
  .ps-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; transition: background 0.3s; }
  .ps-info { flex: 1; min-width: 0; }
  .ps-name { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; font-weight: 500; color: #fff; display: flex; align-items: center; gap: 8px; }
  .ps-hq-badge { font-family: 'DM Mono', monospace; font-size: 8px; background: rgba(26,86,255,0.2); color: #1A56FF; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.1em; }
  .ps-sub { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.3); letter-spacing: 0.04em; margin-top: 2px; }
  .ps-meta { text-align: right; }
  .ps-devs { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; color: #fff; display: block; }
  .ps-devs-lbl { font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.25); }

  .ps-detail {
    border-top: 1px solid rgba(255,255,255,0.05);
    padding: 16px 18px;
    background: rgba(26,86,255,0.04);
  }
  .ps-detail-name { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 16px; color: #fff; margin-bottom: 12px; }
  .ps-detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .ps-detail-kpi { text-align: center; }
  .ps-kpi-val { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 20px; color: #fff; line-height: 1; }
  .ps-kpi-lbl { font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.3); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 4px; }

  /* Bottom stats */
  .presence-bottom-stats {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 2px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px; overflow: hidden;
  }
  .pbs-item { background: rgba(4,9,18,0.9); padding: 28px 24px; text-align: center; transition: background 0.2s; }
  .pbs-item:hover { background: rgba(8,16,32,0.98); }
  .pbs-val { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 32px; color: #fff; line-height: 1; margin-bottom: 6px; }
  .pbs-lbl { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.3); letter-spacing: 0.08em; text-transform: uppercase; }

  /* Stats */
  .lp-stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; }
  .stat-block { background: rgba(4,9,18,0.9); padding: 36px 24px; text-align: center; transition: background .2s; }
  .stat-block:hover { background: rgba(8,16,32,0.98); }
  .stat-number { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 40px; color: #fff; line-height: 1; margin-bottom: 8px; }
  .stat-suffix { font-size: 28px; color: #1A56FF; }
  .stat-label { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.3); letter-spacing: 0.08em; text-transform: uppercase; line-height: 1.4; }

  /* Architecture Strip */
  .lp-arch-strip { display: flex; flex-direction: column; gap: 24px; align-items: center; }
  .lp-arch-label { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.2); letter-spacing: 0.15em; text-transform: uppercase; }
  .lp-arch-flow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .lp-arch-node { display: flex; flex-direction: column; align-items: center; gap: 4px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px 20px; min-width: 100px; transition: border-color .2s, background .2s; }
  .lp-arch-node:hover { border-color: rgba(26,86,255,0.3); background: rgba(26,86,255,0.04); }
  .lp-arch-icon { font-size: 22px; color: rgba(255,255,255,0.5); margin-bottom: 2px; }
  .lp-arch-name { font-family: 'Syne', sans-serif; font-weight: 600; font-size: 13px; color: #fff; }
  .lp-arch-sub { font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.25); letter-spacing: 0.05em; }
  .lp-arch-arrow { color: rgba(255,255,255,0.15); font-size: 18px; padding: 0 4px; }

  /* CTA */
  .lp-cta-box { background: rgba(26,86,255,0.04); border: 1px solid rgba(26,86,255,0.15); border-radius: 24px; padding: 80px 60px; text-align: center; position: relative; overflow: hidden; }
  .lp-cta-orb { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, rgba(26,86,255,0.08), transparent 65%); pointer-events: none; }
  .lp-cta-content { position: relative; z-index: 1; }
  .lp-cta-eyebrow { margin-bottom: 24px; }
  .lp-live-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); padding: 6px 14px; border-radius: 20px; font-family: 'DM Mono', monospace; font-size: 11px; color: #10B981; letter-spacing: 0.1em; }
  .lp-live-pulse { width: 6px; height: 6px; border-radius: 50%; background: #10B981; animation: pulse-dot 1.5s ease-in-out infinite; }
  .lp-cta-title { font-family: 'Syne', sans-serif; font-weight: 800; font-size: clamp(2rem, 3.5vw, 3rem); line-height: 1.1; letter-spacing: -0.02em; color: #fff; margin-bottom: 20px; }
  .lp-cta-desc { font-size: 16px; color: rgba(255,255,255,0.4); line-height: 1.7; max-width: 480px; margin: 0 auto 40px; }
  .lp-btn-cta { display: inline-flex; align-items: center; background: #fff; color: #040912; font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; padding: 16px 40px; border-radius: 10px; text-decoration: none; transition: all .25s; box-shadow: 0 8px 32px rgba(255,255,255,0.1); }
  .lp-btn-cta:hover { background: #E2E8F0; transform: translateY(-2px); color: #040912; box-shadow: 0 12px 40px rgba(255,255,255,0.15); }

  /* Footer */
  .lp-footer { border-top: 1px solid rgba(255,255,255,0.05); padding: 32px 0; position: relative; z-index: 10; }
  .lp-footer-inner { display: flex; align-items: center; justify-content: space-between; }
  .lp-footer-copy { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.2); margin-top: 2px; letter-spacing: 0.08em; }
  .lp-footer-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.2); display: flex; gap: 10px; align-items: center; }
  .lp-footer-sep { opacity: 0.3; }

  /* Scroll reveals */
  .scroll-reveal-up { opacity: 0; transform: translateY(28px); transition: opacity .8s cubic-bezier(0.16,1,0.3,1), transform .8s cubic-bezier(0.16,1,0.3,1); }
  .revealed .scroll-reveal-up, .scroll-reveal-up.revealed { opacity: 1; transform: translateY(0); }

  /* Responsive */
  @media (max-width: 1024px) {
    .lp-hero-inner { grid-template-columns: 1fr; gap: 48px; }
    .lp-hero-visual { display: none; }
    .lp-features-grid { grid-template-columns: repeat(2, 1fr); }
    .lp-stats-grid { grid-template-columns: repeat(3, 1fr); }
    .presence-layout { grid-template-columns: 1fr; }
    .presence-bottom-stats { grid-template-columns: repeat(2, 1fr); }
    .lp-arch-arrow { display: none; }
  }
  @media (max-width: 768px) {
    .lp-hero { padding: 100px 20px 60px; }
    .lp-features-grid { grid-template-columns: 1fr; }
    .lp-stats-grid { grid-template-columns: repeat(2, 1fr); }
    .lp-nav-links { display: none; }
    .lp-hamburger { display: flex; }
    .lp-cta-box { padding: 48px 24px; }
    .lp-container { padding: 0 20px; }
    .lp-footer-inner { flex-direction: column; gap: 12px; text-align: center; }
    .km-cards { grid-template-columns: repeat(2, 1fr); }
    .km-footer-row { grid-template-columns: repeat(2, 1fr); }
    .cursor-dot, .cursor-ring { display: none; }
    .lp-root { cursor: auto; }
    .presence-bottom-stats { grid-template-columns: repeat(2, 1fr); }
    .ps-detail-grid { grid-template-columns: repeat(3, 1fr); }
  }

  /* Brand Logo Styles */
  .lp-brand-logo { width: 100px; height: auto; display: block; filter: drop-shadow(0 0 8px rgba(26,86,255,0.4)); transition: transform 0.3s ease; }
  .lp-brand:hover .lp-brand-logo { transform: scale(1.1) rotate(5deg); }
  
  .lp-hero-hologram { position: absolute; top: 8%; right: -5%; width: 550px; opacity: 0.04; pointer-events: none; z-index: 0; filter: blur(3px) brightness(1.8) contrast(1.1); animation: holo-float 25s ease-in-out infinite; }
  .lp-hero-hologram img { width: 100%; height: auto; }
  
  @keyframes holo-float { 
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 0.04; }
    50% { transform: translate(-40px, 30px) scale(1.08) rotate(2deg); opacity: 0.07; }
  }

  .lp-footer-brand-top { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .lp-footer-logo { width: 24px; height: auto; opacity: 0.5; filter: grayscale(1) brightness(2); }
`;
