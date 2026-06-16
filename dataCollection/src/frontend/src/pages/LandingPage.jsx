/**
 * LandingPage.jsx — TELNET CINEMATIC DIRECT VIDEO PORTAL
 *
 * A simplified, state-of-the-art cinematic B2B portal landing page featuring:
 *   1. Full-Clarity Cinematic Video: Full-bleed Kling AI looping background at 100% opacity.
 *   2. Soft Top Vignette: Ensures navbar contrast while keeping the rest of the video perfectly bright.
 *   3. Focused Navigation: Seamless login gate accessible via the top navbar.
 *   4. Presence Section: Responsive SVG world map displaying international R&D hubs.
 *
 * Stack: React 18 + Vite · react-router-dom · react-simple-maps · gsap
 */
import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { gsap } from "gsap";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
} from "react-simple-maps";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap";

// ══════════════════════════════════════════════════════════════════════════════
// useTypingEffect — letter-by-letter typing with optional cursor
// ══════════════════════════════════════════════════════════════════════════════
function useTypingEffect(text, { speed = 55, startDelay = 1300 } = {}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    let timeout;
    let i = 0;
    setDisplayed("");
    setDone(false);
    timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(interval);
    }, startDelay);
    return () => clearTimeout(timeout);
  }, [text, speed, startDelay]);
  return { displayed, done };
}

// ══════════════════════════════════════════════════════════════════════════════
// useTimelineReveal — IntersectionObserver staggered reveal
// ══════════════════════════════════════════════════════════════════════════════
function useTimelineReveal(containerRef) {
  const [triggered, setTriggered] = useState(false);
  useEffect(() => {
    if (!containerRef?.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setTriggered(true); obs.disconnect(); }
      },
      { threshold: 0.08 }
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [containerRef]);
  return triggered;
}

function TimelineItem({ as: Tag = "div", animNum = 1, triggered, children, className = "", style = {}, ...rest }) {
  const delay = (animNum - 1) * 0.25;
  const itemStyle = {
    opacity: triggered ? 1 : 0,
    filter: triggered ? "blur(0px)" : "blur(10px)",
    transform: triggered ? "translateY(0)" : "translateY(-18px)",
    transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, filter 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
    ...style,
  };
  return <Tag className={className} style={itemStyle} {...rest}>{children}</Tag>;
}

// ── World Map / Présence ──────────────────────────────────────────────────────
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const SITES = [
  { name: "Tunisie", coords: [10.18, 36.81], hq: true, devs: 147, proj: 23, status: "Siège social" },
  { name: "France", coords: [2.35, 48.86], hq: false, devs: 42, proj: 8, status: "R&D Lyon · Paris" },
  { name: "Allemagne", coords: [13.41, 52.52], hq: false, devs: 18, proj: 4, status: "Engineering Hub" },
  { name: "Arabie Saoudite", coords: [46.68, 24.71], hq: false, devs: 24, proj: 5, status: "Operations" },
  { name: "Oman", coords: [58.41, 23.59], hq: false, devs: 12, proj: 3, status: "Operations" },
  { name: "USA", coords: [-77.04, 38.91], hq: false, devs: 8, proj: 2, status: "Business Dev" },
  { name: "Russie", coords: [37.62, 55.75], hq: false, devs: 6, proj: 2, status: "Partenaire" },
];

// ── Counter Component ────────────────────────────────────────────────────────
function Counter({ target, duration = 1200, triggered }) {
  const [count, setCount] = useState("0");

  useEffect(() => {
    if (!triggered) return;

    const match = target.match(/^(\d+)(\+)?$/);
    if (!match) {
      setCount(target);
      return;
    }

    const endValue = parseInt(match[1], 10);
    const suffix = match[2] || "";
    let startTimestamp = null;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const currentCount = Math.floor(progress * endValue);
      setCount(`${currentCount}${suffix}`);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [target, triggered, duration]);

  return <span>{count}</span>;
}

function PresenceSection() {
  const [active, setActive] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const containerRef = useRef(null);
  const triggered = useTimelineReveal(containerRef);

  useEffect(() => {
    const id = setInterval(() => setPulse((p) => (p + 1) % 100), 60);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const cycle = setInterval(() => {
      setActive((prev) => (prev + 1) % SITES.length);
    }, 4500);
    return () => clearInterval(cycle);
  }, [isAutoPlaying]);

  const site = SITES[active];
  const hq = SITES[0];

  return (
    <section id="presence" className="lp-section lp-pres" ref={containerRef}>
      <div className="lp-container">
        <TimelineItem as="div" animNum={1} triggered={triggered} className="lp-sh">
          <h2 className="lp-h2">Présence <span className="lp-accent">internationale</span></h2>
          <p className="lp-sub">TELNET Engineering Hub déployé sur l'ensemble des sites R&D — de Tunis à Paris, de Riyad à Washington.</p>
        </TimelineItem>
        <TimelineItem as="div" animNum={2} triggered={triggered} className="pres-grid">
          <div 
            className="pres-map"
            onMouseEnter={() => setIsAutoPlaying(false)}
            onMouseLeave={() => setIsAutoPlaying(true)}
          >
            <div className="pres-map-glow" />
            <div className="map-scanline" />
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 138, center: [20, 28] }} style={{ width: "100%", height: "100%" }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) => geographies.map((geo) => (
                  <Geography key={geo.rsmKey} geography={geo}
                    fill="rgba(26,100,255,0.06)"
                    stroke="rgba(80,160,255,0.25)"
                    strokeWidth={0.6}
                    style={{ default: { outline: "none" }, hover: { fill: "rgba(26,86,255,.20)", stroke: "rgba(0,212,255,0.5)", outline: "none" }, pressed: { outline: "none" } }} />
                ))}
              </Geographies>
              {SITES.filter((s) => !s.hq).map((s, i) => (
                <Line key={i} from={hq.coords} to={s.coords}
                  stroke={active === SITES.indexOf(s) ? "#FFB830" : "rgba(26,86,255,.20)"}
                  strokeWidth={active === SITES.indexOf(s) ? 2 : 0.9}
                  strokeDasharray="4 4"
                  style={{ transition: "all .4s" }} />
              ))}
              {SITES.map((s, i) => (
                <Marker key={i} coordinates={s.coords} onMouseEnter={() => setActive(i)} style={{ cursor: "pointer" }}>
                  {s.hq && (
                    <>
                      <circle r={5 + (pulse % 40) * 0.18} fill="none" stroke="#FFB830" strokeWidth={0.8} opacity={1 - (pulse % 40) / 40} />
                      <circle r={3 + ((pulse + 20) % 40) * 0.13} fill="none" stroke="#FFD060" strokeWidth={0.6} opacity={1 - ((pulse + 20) % 40) / 40} />
                    </>
                  )}
                  {active === i && !s.hq && <circle r={3.5 + (pulse % 30) * 0.13} fill="none" stroke="#00D4FF" strokeWidth={0.7} opacity={1 - (pulse % 30) / 30} />}
                  <circle r={s.hq ? 4.2 : active === i ? 3.2 : 2.4}
                    fill={s.hq ? "#FFB830" : active === i ? "#00D4FF" : "rgba(100,160,255,.65)"}
                    style={{ transition: "all .3s", filter: s.hq ? "drop-shadow(0 0 4px #FFB830)" : active === i ? "drop-shadow(0 0 4px #00D4FF)" : "none" }} />
                  {s.hq && <circle r={1.4} fill="#fff" />}
                </Marker>
              ))}
            </ComposableMap>
          </div>
          <div 
            className="pres-side"
            onMouseEnter={() => setIsAutoPlaying(false)}
            onMouseLeave={() => setIsAutoPlaying(true)}
          >
            <div className="pres-side-hd">
              <span className="pres-live"><span className="mock-dot" />Sites opérationnels</span>
              <span className="pres-count">{SITES.length} pays</span>
            </div>
            <ul className="pres-list">
              {SITES.map((s, i) => (
                <li key={i} className={`pres-item ${active === i ? "pres-act" : ""} ${s.hq ? "pres-hq" : ""}`} onMouseEnter={() => setActive(i)}>
                  <div className="pres-dot" style={{
                    background: s.hq ? "#FFB830" : active === i ? "#00D4FF" : "rgba(100,160,255,.3)",
                    boxShadow: (s.hq || active === i) ? `0 0 10px ${s.hq ? "#FFB830" : "#00D4FF"}` : "none"
                  }} />
                  <div className="pres-info">
                    <div className="pres-name">{s.name}{s.hq && <span className="pres-hq-tag">HQ</span>}</div>
                    <div className="pres-st">{s.status}</div>
                  </div>
                  <div className="pres-meta"><span className="pres-dv" style={{ color: s.hq ? "#FFB830" : active === i ? "#00D4FF" : "#fff" }}>{s.devs}</span><span className="pres-dl">devs</span></div>
                </li>
              ))}
            </ul>
            <div className="pres-detail" key={active}>
              <p className="pres-det-name">{site.name}</p>
              <div className="pres-det-grid">
                <div className="pres-kpi">
                  <div className="pres-kv">
                    <Counter target={String(site.devs)} duration={600} triggered={true} />
                  </div>
                  <div className="pres-kl">Développeurs</div>
                </div>
                <div className="pres-kpi">
                  <div className="pres-kv">
                    <Counter target={String(site.proj)} duration={600} triggered={true} />
                  </div>
                  <div className="pres-kl">Projets</div>
                </div>
                <div className="pres-kpi">
                  <div className="pres-kv" style={{ color: "#10B981", fontSize: 18 }}>●</div>
                  <div className="pres-kl">En ligne</div>
                </div>
              </div>
            </div>
          </div>
        </TimelineItem>
        <TimelineItem as="div" animNum={3} triggered={triggered} className="pres-bottom">
          {[
            ["7",    "Pays couverts",    "#FFB830"],
            ["257+", "Développeurs",    "#00D4FF"],
            ["47",   "Projets GitLab",  "#FFB830"],
            ["24/7", "Synchro KPI",     "#00D4FF"],
          ].map(([v, l, c], i) => (
            <div key={i} className="pres-bs" style={{ "--card-accent": c }}>
              <div className="pres-bv" style={{ color: c }}>
                <Counter target={v} triggered={triggered} />
              </div>
              <div className="pres-bl">{l}</div>
            </div>
          ))}
        </TimelineItem>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ImageWithLoading — image component with loading state
// ══════════════════════════════════════════════════════════════════════════════
function ImageWithLoading({ src, alt, className, ...props }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`image-wrapper ${className || ""}`} {...props}>
      {!loaded && <div className="image-skeleton" />}
      <img
        src={src}
        alt={alt}
        className={`image-content ${loaded ? "loaded" : ""}`}
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HeroTitle — animated typing + shimmer accent for the hero section
// ══════════════════════════════════════════════════════════════════════════════
function HeroTitle() {
  const accentText = "en intelligence décisionnelle";
  const { displayed, done } = useTypingEffect(accentText, { speed: 52, startDelay: 1200 });
  return (
    <h1 className="hero-title hero-anim">
      Vos dépôts, transformés<br />
      <span className="hero-title-accent">
        {displayed}
        <span className={`hero-cursor${done ? " done" : ""}`} aria-hidden="true" />
      </span>
    </h1>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE — 100% CLEAR VIDEO BACKGROUND WITH COMPACT LOGIC
// ══════════════════════════════════════════════════════════════════════════════
export default function LandingPage() {

  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const heroContentRef = useRef(null);

  useEffect(() => {
    if (!document.getElementById("lp6-fonts")) {
      const l = Object.assign(document.createElement("link"), { id: "lp6-fonts", rel: "stylesheet", href: FONTS });
      document.head.appendChild(l);
    }
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll);

    // Hero content entrance animation
    if (heroContentRef.current) {
      const els = heroContentRef.current.querySelectorAll(".hero-anim");
      gsap.fromTo(els,
        { opacity: 0, y: 40, filter: "blur(12px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.1, stagger: 0.18, ease: "power3.out", delay: 0.4 }
      );
    }

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
    setMenuOpen(false);
  };

  return (
    <div className="lp-root">
      <style>{CSS}</style>
      <div className="lp-noise" />
      <nav className={`lp-nav ${scrolled ? "lp-nav-scrolled" : ""}`}>
        <div className="lp-nav-in">
          <div className="lp-brand"><ImageWithLoading src="/assets/images/telnet.png" alt="Telnet" className="lp-logo" /></div>
          <div className="lp-links">
            <button onClick={() => scrollTo("presence")} className="lp-nl">Présence</button>
            <Link to={isAuthenticated ? "/developers" : "/login"} className="lp-cta-btn">{isAuthenticated ? "Ouvrir le Hub" : "Connexion"} →</Link>
          </div>
          <button className="lp-ham" onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? "✕" : "☰"}</button>
        </div>
        {menuOpen && (
          <div className="lp-mob">
            <button onClick={() => scrollTo("presence")}>Présence</button>
            <Link to={isAuthenticated ? "/developers" : "/login"}>{isAuthenticated ? "Ouvrir le Hub" : "Connexion"}</Link>
          </div>
        )}
      </nav>

      <section className="lp-hero">
        {/* Premium Background Image */}
        <img
          className="hero-bg-video"
          src="/assets/images/hero-bg.png"
          alt="Hero Background"
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
        />
        {/* Soft elegant top vignette overlay so that the navigation remains 100% readable */}
        <div className="hero-video-vignette" />

        {/* Hero Content Overlay */}
        <div className="hero-content" ref={heroContentRef}>

          <HeroTitle />
          <p className="hero-desc hero-anim">
            Suivez la performance de vos équipes en temps réel avec des KPIs unifiés et des analyses de vélocité précises.
          </p>
          <div className="hero-actions hero-anim">
            <Link
              to={isAuthenticated ? "/developers" : "/login"}
              className="hero-cta-primary"
            >
              {isAuthenticated ? "Ouvrir le Hub" : "Accéder au Hub"} →
            </Link>
            <button onClick={() => document.getElementById("presence")?.scrollIntoView({ behavior: "smooth" })} className="hero-cta-secondary">
              Voir notre présence
            </button>
          </div>
        </div>
      </section>

      <PresenceSection />

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="foot-inner">
            <div className="foot-left">
              <ImageWithLoading src="/assets/images/telnet.png" alt="Telnet" className="foot-logo" />
              <p className="foot-copy">Dashboard KPI GitLab<br />Plateforme d'intelligence R&D mondiale</p>
            </div>
            <div className="foot-right">
              <div className="foot-links"><button onClick={() => scrollTo("presence")} className="foot-link">Présence internationale</button></div>
              <p className="foot-legal">© 2026 TELNET HOLDING · Intranet R&D Sécurisé · Chiffré AES-256</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

const CSS = `
  :root {
    --bl: #1A56FF;
    --cy: #00D4FF;
    --gn: #10B981;
    --am: #FFB830;
    --gold: #FFD060;
    --pu: #A78BFA;
    --bg: #030810;
    --br: rgba(255, 255, 255, 0.06);
    --tx: #E2E8F0;
    --mt: rgba(255, 255, 255, 0.38);
    --fd: 'Syne', sans-serif;
    --fm: 'DM Mono', monospace;
    --fb: 'Plus Jakarta Sans', sans-serif;
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    /* Signature accent gradient — extrait de la vidéo (chaleur ambre → techno cyan) */
    --grad-accent: linear-gradient(110deg, #FFB830 0%, #FFD060 38%, #00D4FF 100%);
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  ::-webkit-scrollbar {
    width: 5px;
  }
  ::-webkit-scrollbar-track {
    background: var(--bg);
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(26, 86, 255, 0.5);
    border-radius: 10px;
  }

  .lp-root {
    background: var(--bg);
    color: var(--tx);
    font-family: var(--fb);
    min-height: 100vh;
    overflow-x: hidden;
  }

  .lp-noise {
    position: fixed;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    opacity: 0.02;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 256px 256px;
  }

  .lp-container {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 32px;
  }

  /* ── Navbar ── */
  .lp-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 500;
    padding: 20px 0;
    transition: background 0.4s var(--ease), padding 0.4s, border-color 0.4s;
    border-bottom: 1px solid transparent;
  }
  .lp-nav-scrolled {
    background: rgba(3, 8, 16, 0.85);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    padding: 13px 0;
    border-color: rgba(26, 86, 255, 0.12);
    box-shadow: 0 4px 32px rgba(0, 0, 0, 0.5);
  }
  .lp-nav-in {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .lp-brand {
    display: flex;
    align-items: center;
  }
  .lp-logo {
    height: 36px;
    width: auto;
    object-fit: contain;
    filter: drop-shadow(0 0 10px rgba(26, 86, 255, 0.45));
    transition: transform 0.3s;
  }

  .image-wrapper.lp-logo {
    height: 36px;
    width: auto;
    display: inline-block;
  }

  .image-wrapper.foot-logo {
    height: 40px;
    width: auto;
    display: inline-block;
  }

  .image-skeleton {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(26, 86, 255, 0.1) 25%, rgba(26, 86, 255, 0.2) 50%, rgba(26, 86, 255, 0.1) 75%);
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s ease-in-out infinite;
    border-radius: inherit;
  }

  .image-content {
    transition: opacity 0.3s ease;
    display: block;
    height: inherit;
    width: inherit;
  }

  @keyframes skeleton-loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .lp-brand:hover .lp-logo {
    transform: scale(1.07);
  }
  .lp-links {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .lp-nl {
    background: none;
    border: none;
    font-family: var(--fb);
    font-size: 13.5px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
    padding: 8px 14px;
    border-radius: 7px;
    transition: all 0.3s var(--ease);
    letter-spacing: 0.01em;
    cursor: pointer;
    position: relative;
  }
  .lp-nl::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 50%;
    width: 0;
    height: 1.5px;
    background: var(--cy);
    transition: all 0.3s var(--ease);
    transform: translateX(-50%);
  }
  .lp-nl:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.03);
  }
  .lp-nl:hover::after {
    width: 60%;
  }
  .lp-cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #1A56FF 0%, #00D4FF 100%);
    color: #fff;
    font-family: var(--fb);
    font-size: 13.5px;
    font-weight: 600;
    padding: 10px 20px;
    border-radius: 8px;
    text-decoration: none;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 4px 20px rgba(0, 212, 255, 0.25);
  }
  .lp-cta-btn:hover {
    background: linear-gradient(135deg, #1446D4 0%, #00B4D8 100%);
    transform: translateY(-2px) scale(1.03);
    box-shadow: 0 8px 30px rgba(0, 212, 255, 0.45);
    color: #fff;
  }
  .lp-ham {
    display: none;
    background: none;
    border: none;
    color: #fff;
    font-size: 20px;
    padding: 4px;
    cursor: pointer;
  }
  .lp-mob {
    display: flex;
    flex-direction: column;
    background: rgba(3, 8, 16, 0.98);
    border-top: 1px solid var(--br);
    padding: 14px 32px;
  }
  .lp-mob button, .lp-mob a {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: 15px;
    font-weight: 500;
    padding: 12px 0;
    border-bottom: 1px solid var(--br);
    text-decoration: none;
    text-align: left;
    cursor: pointer;
  }

  /* ── Base Section ── */
  .lp-section {
    padding: 100px 0;
  }

  /* ── Hero Video Section ── */
  .lp-hero {
    position: relative;
    width: 100%;
    height: 100vh;
    overflow: hidden;
    background: #020710;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hero-bg-video {
    position: absolute;
    top: 50%;
    left: 50%;
    /* scale(1.08) → covers full width edge-to-edge AND crops the Kling AI watermark at the bottom */
    width: 100%;
    height: 100%;
    transform: translate(-50%, -50%) scale(1.08);
    object-fit: cover;
    z-index: 0;
    opacity: 1;
    transform-origin: center center;
  }

  /* Soft Vignette Overlay */
  .hero-video-vignette {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(3, 8, 16, 0.85) 0%,
      rgba(3, 8, 16, 0.20) 25%,
      rgba(3, 8, 16, 0.10) 60%,
      rgba(3, 8, 16, 0.40) 80%,
      rgba(3, 8, 16, 0.90) 100%
    );
    z-index: 1;
    pointer-events: none;
  }

  /* ── Hero Content ── */
  .hero-content {
    position: relative;
    z-index: 10;
    text-align: center;
    max-width: 780px;
    padding: 0 32px;
    margin-top: 60px;
  }

  .hero-title {
    font-family: var(--fd);
    font-weight: 700;
    font-size: clamp(1.8rem, 3.8vw, 3rem);
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: #fff;
    margin-bottom: 24px;
    text-shadow: 0 2px 24px rgba(0,0,0,0.6);
  }

  .hero-title-accent {
    /* Ambre doré → or → cyan — les couleurs exactes de la vidéo (fusee+coucher soleil → dashboards) */
    background: linear-gradient(110deg, #FFB830 0%, #FFD060 30%, #00D4FF 70%, #FFB830 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    /* Lueur subtile pour lire sur fond chargé */
    filter: drop-shadow(0 0 24px rgba(255, 184, 48, 0.35));
    animation: shimmer-accent 3.5s linear infinite;
  }

  /* Typing cursor */
  .hero-cursor {
    display: inline-block;
    width: 3px;
    height: 0.85em;
    background: #FFD060;
    border-radius: 2px;
    margin-left: 4px;
    vertical-align: middle;
    animation: cursor-blink 1s step-end infinite;
    position: relative;
    top: -2px;
    box-shadow: 0 0 10px rgba(255, 208, 96, 0.7);
  }

  .hero-cursor.done {
    animation: cursor-fade 0.6s ease forwards;
  }

  @keyframes shimmer-accent {
    0%   { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  @keyframes cursor-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }

  @keyframes cursor-fade {
    0%   { opacity: 1; }
    100% { opacity: 0; width: 0; margin-left: 0; }
  }

  .hero-desc {
    font-size: clamp(15px, 2vw, 17.5px);
    line-height: 1.75;
    color: rgba(255, 255, 255, 0.58);
    max-width: 580px;
    margin: 0 auto 36px;
    text-shadow: 0 1px 12px rgba(0,0,0,0.8);
  }

  .hero-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .hero-cta-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #1A56FF 0%, #00D4FF 100%);
    color: #fff;
    font-family: var(--fb);
    font-size: 14.5px;
    font-weight: 700;
    padding: 14px 32px;
    border-radius: 10px;
    text-decoration: none;
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 6px 28px rgba(0, 212, 255, 0.3);
    letter-spacing: 0.01em;
    position: relative;
    overflow: hidden;
  }

  .hero-cta-primary::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%);
    opacity: 0;
    transition: opacity 0.4s;
  }

  .hero-cta-primary:hover {
    background: linear-gradient(135deg, #1446D4 0%, #00B4D8 100%);
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0, 212, 255, 0.45);
    color: #fff;
  }

  .hero-cta-primary:hover::before {
    opacity: 1;
  }

  .hero-cta-primary:active {
    transform: translateY(0);
  }

  .hero-cta-secondary {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.10);
    color: rgba(255, 255, 255, 0.8);
    font-family: var(--fb);
    font-size: 14px;
    font-weight: 500;
    padding: 14px 28px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.4s var(--ease);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    position: relative;
    overflow: hidden;
  }

  .hero-cta-secondary::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.08);
    opacity: 0;
    transition: opacity 0.4s;
  }

  .hero-cta-secondary:hover {
    background: rgba(255, 255, 255, 0.10);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-1px);
    color: #fff;
  }

  .hero-cta-secondary:hover::before {
    opacity: 1;
  }

  .hero-cta-secondary:active {
    transform: translateY(0);
  }

  /* ── Premium Audio Controller Toggle ── */
  .hero-audio-toggle {
    position: absolute;
    bottom: 40px;
    right: 40px;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(3, 8, 16, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    padding: 10px 18px;
    border-radius: 30px;
    color: #fff;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  
  .hero-audio-toggle:hover {
    background: rgba(3, 8, 16, 0.85);
    border-color: var(--cy);
    box-shadow: 0 12px 32px rgba(0, 212, 255, 0.25);
    transform: translateY(-2px);
  }

  .hero-audio-toggle:active {
    transform: translateY(0);
  }

  .audio-toggle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--cy);
    transition: color 0.3s;
  }

  .audio-icon-svg {
    width: 20px;
    height: 20px;
    stroke-width: 1.5;
  }

  .hero-audio-toggle.audio-playing .audio-toggle-icon {
    color: var(--am);
  }

  .audio-icon-playing .audio-wave-1 {
    animation: wave-pulse-1 1.2s ease-in-out infinite;
  }

  .audio-icon-playing .audio-wave-2 {
    animation: wave-pulse-2 1.2s ease-in-out infinite;
  }

  @keyframes wave-pulse-1 {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  @keyframes wave-pulse-2 {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  .audio-toggle-txt {
    font-family: var(--fb);
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: rgba(255, 255, 255, 0.85);
    transition: color 0.3s;
  }

  .hero-audio-toggle:hover .audio-toggle-txt {
    color: #fff;
  }

  /* Audio Wave Animation */
  .audio-wave-anim {
    display: flex;
    align-items: flex-end;
    gap: 2.5px;
    width: 16px;
    height: 14px;
  }

  .wave-bar {
    width: 2px;
    height: 100%;
    background: var(--am);
    border-radius: 2px;
    transform-origin: bottom;
    animation: wave-bounce 1s ease-in-out infinite alternate;
  }

  .wave-bar-1 { animation-delay: 0.1s; height: 30%; }
  .wave-bar-2 { animation-delay: 0.4s; height: 90%; }
  .wave-bar-3 { animation-delay: 0.2s; height: 60%; }
  .wave-bar-4 { animation-delay: 0.6s; height: 100%; }

  @keyframes wave-bounce {
    0% { transform: scaleY(0.2); }
    100% { transform: scaleY(1); }
  }

  @media(max-width: 768px) {
    .hero-audio-toggle {
      bottom: 24px;
      right: 24px;
      padding: 8px 14px;
    }
  }

  /* ── Presence Section ── */
  .lp-pres {
    position: relative;
    z-index: 10;
    padding: 110px 0 120px;
    /* Deep space background */
    background:
      radial-gradient(ellipse 80% 60% at 20% 80%, rgba(255,184,48,0.04) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 80% 20%, rgba(26,86,255,0.06) 0%, transparent 60%),
      linear-gradient(180deg, rgba(2,6,18,0.0) 0%, rgba(4,10,28,1) 15%, rgba(4,10,28,1) 85%, rgba(2,6,18,0.0) 100%);
    border-top: 1px solid rgba(255,184,48,0.12);
    /* Perspective grid lines */
    background-size: auto, auto, auto;
  }
  .lp-pres::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(26,86,255,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(26,86,255,0.04) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
    mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%);
  }

  .lp-sh {
    text-align: center;
    max-width: 640px;
    margin: 0 auto 64px;
  }

  .lp-h2 {
    font-family: var(--fd);
    font-weight: 800;
    font-size: clamp(2.4rem, 4vw, 3.6rem);
    line-height: 1.06;
    letter-spacing: -0.02em;
    color: #fff;
    margin-bottom: 18px;
  }

  .lp-accent {
    /* Même palette signature ambre → cyan pour la cohérence entre sections */
    background: var(--grad-accent);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 18px rgba(255, 184, 48, 0.28));
  }

  .lp-sub {
    font-size: 15.5px;
    line-height: 1.75;
    color: rgba(255, 255, 255, 0.35);
  }

  .pres-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 28px;
    align-items: start;
    margin-bottom: 48px;
  }

  .pres-map {
    position: relative;
    background: rgba(4, 10, 28, 0.8);
    border: 1px solid rgba(26,86,255,0.20);
    border-radius: 20px;
    overflow: hidden;
    padding: 20px;
    min-height: 340px;
    box-shadow: 0 0 60px rgba(26,86,255,0.08), inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .map-scanline {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(26, 86, 255, 0.03) 45%,
      rgba(0, 212, 255, 0.15) 50%,
      rgba(26, 86, 255, 0.03) 55%,
      transparent 100%
    );
    background-size: 100% 200%;
    animation: radar-sweep 8s linear infinite;
    pointer-events: none;
    z-index: 2;
  }

  @keyframes radar-sweep {
    0% {
      background-position: 0% -200%;
    }
    100% {
      background-position: 0% 200%;
    }
  }

  .pres-map-glow {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 50% at 30% 60%, rgba(255,184,48,0.07), transparent 70%),
      radial-gradient(ellipse 50% 50% at 70% 40%, rgba(26,86,255,0.10), transparent 70%);
    pointer-events: none;
  }

  .pres-side {
    background: rgba(4, 10, 28, 0.90);
    border: 1px solid rgba(26,86,255,0.18);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 0 40px rgba(26,86,255,0.08);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .pres-side-hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(26,86,255,0.12);
    background: linear-gradient(135deg, rgba(26,86,255,0.10), rgba(255,184,48,0.04));
  }

  .pres-live {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--fm);
    font-size: 9px;
    color: var(--gn);
    letter-spacing: 0.08em;
  }

  .mock-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gn);
    animation: pd 1.5s ease-in-out infinite;
    display: inline-block;
  }

  @keyframes pd {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
    50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  }

  .pres-count {
    font-family: var(--fm);
    font-size: 9px;
    color: var(--mt);
    letter-spacing: 0.08em;
  }

  .pres-list {
    padding: 6px 0;
    list-style: none;
  }

  .pres-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 16px;
    cursor: pointer;
    transition: background 0.2s;
    border-left: 2px solid transparent;
  }

  .pres-item:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .pres-act {
    background: rgba(0,212,255,0.05);
    border-left-color: var(--cy);
  }

  .pres-hq {
    background: rgba(255,184,48,0.04);
    border-left-color: #FFB830 !important;
  }

  .pres-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: background 0.3s, box-shadow 0.3s;
  }

  .pres-info {
    flex: 1;
    min-width: 0;
  }

  .pres-name {
    font-family: var(--fb);
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pres-hq-tag {
    font-family: var(--fm);
    font-size: 8px;
    background: rgba(26, 86, 255, 0.2);
    color: var(--cy);
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.1em;
  }

  .pres-st {
    font-family: var(--fm);
    font-size: 9px;
    color: var(--mt);
    letter-spacing: 0.03em;
    margin-top: 1px;
  }

  .pres-meta {
    text-align: right;
  }

  .pres-dv {
    font-family: var(--fd);
    font-weight: 700;
    font-size: 15px;
    color: #fff;
    display: block;
  }

  .pres-dl {
    font-family: var(--fm);
    font-size: 8px;
    color: var(--mt);
  }

  .pres-detail {
    border-top: 1px solid rgba(255,184,48,0.12);
    padding: 16px 18px;
    background: linear-gradient(135deg, rgba(255,184,48,0.06), rgba(26,86,255,0.04));
    animation: detail-in 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes detail-in {
    from {
      opacity: 0;
      transform: translateY(10px);
      filter: blur(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
  }

  .pres-det-name {
    font-family: var(--fd);
    font-weight: 800;
    font-size: 16px;
    background: var(--grad-accent);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 12px;
    animation: detail-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .pres-det-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .pres-kpi {
    text-align: center;
  }

  .pres-kv {
    font-family: var(--fd);
    font-weight: 700;
    font-size: 18px;
    color: #fff;
    line-height: 1;
  }

  .pres-kl {
    font-family: var(--fm);
    font-size: 8px;
    color: var(--mt);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-top: 3px;
  }

  .pres-bottom {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-top: 16px;
  }

  .pres-bs {
    background: rgba(4, 10, 28, 0.75);
    border: 1px solid rgba(26,86,255,0.12);
    border-top: 2px solid var(--card-accent, #FFB830);
    border-radius: 14px;
    padding: 32px 20px 28px;
    text-align: center;
    transition: all 0.3s var(--ease);
    position: relative;
    overflow: hidden;
    background-image: 
      linear-gradient(rgba(26, 86, 255, 0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(26, 86, 255, 0.02) 1px, transparent 1px);
    background-size: 8px 8px;
  }
  .pres-bs::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--card-accent, #FFB830) 8%, transparent), transparent);
    pointer-events: none;
  }

  .pres-bs:hover {
    transform: translateY(-6px);
    border-color: var(--card-accent);
    box-shadow: 
      0 16px 36px rgba(0, 0, 0, 0.5), 
      0 0 25px color-mix(in srgb, var(--card-accent, #FFB830) 25%, transparent);
  }

  .pres-bv {
    font-family: var(--fd);
    font-weight: 800;
    font-size: 38px;
    line-height: 1;
    margin-bottom: 8px;
  }

  .pres-bl {
    font-family: var(--fm);
    font-size: 9px;
    color: var(--mt);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* ── Footer ── */
  .lp-footer {
    border-top: 1px solid var(--br);
    padding: 48px 0 36px;
    position: relative;
    z-index: 10;
  }

  .foot-inner {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 48px;
  }

  .foot-left {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .foot-logo {
    height: 28px;
    width: auto;
    opacity: 0.75;
    filter: drop-shadow(0 0 8px rgba(0, 212, 255, 0.35));
    transition: opacity 0.3s, filter 0.3s;
  }
  .foot-logo:hover {
    opacity: 1;
    filter: drop-shadow(0 0 14px rgba(0, 212, 255, 0.6));
  }

  .foot-copy {
    font-family: var(--fm);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.18);
    letter-spacing: 0.04em;
    line-height: 1.8;
  }

  .foot-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 18px;
  }

  .foot-links {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .foot-link {
    background: none;
    border: none;
    font-family: var(--fb);
    font-size: 13px;
    color: rgba(255, 255, 255, 0.3);
    padding: 6px 14px;
    border-radius: 6px;
    transition: color 0.2s, background 0.2s;
    cursor: pointer;
  }

  .foot-link:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.04);
  }

  .foot-legal {
    font-family: var(--fm);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.15);
    letter-spacing: 0.06em;
  }

  /* ── Responsive ── */
  @media(max-width: 1100px) {
    .lp-hero {
      height: 100svh;
      min-height: 600px;
    }
    .hero-content {
      max-width: 90%;
    }
    .pres-grid {
      grid-template-columns: 1fr;
    }
    .foot-inner {
      flex-direction: column;
    }
    .foot-right {
      align-items: flex-start;
    }
  }

  @media(max-width: 768px) {
    .lp-links {
      display: none;
    }
    .lp-ham {
      display: flex;
    }
    .lp-container {
      padding: 0 20px;
    }
    .pres-bottom {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;