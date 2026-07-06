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
import { Envelope, Globe, MapPin } from "@phosphor-icons/react";
import authService from "../services/authService";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
} from "react-simple-maps";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@1,500;1,600;1,700&display=swap";

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
  const delay = (animNum - 1) * 0.18;
  const itemStyle = {
    opacity: triggered ? 1 : 0,
    transform: triggered ? "translateY(0px)" : "translateY(32px)",
    transition: `opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
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
  const titleRef = useRef(null);

  useEffect(() => {
    if (triggered && titleRef.current) {
      gsap.fromTo(titleRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }
      );
    }
  }, [triggered]);

  return (
    <section id="presence" className="lp-section lp-pres" ref={containerRef}>
      <div className="lp-container">
        <TimelineItem as="div" animNum={1} triggered={triggered} className="lp-sh">
          <h2 className="lp-h2" ref={titleRef}>Présence <span className="lp-accent">internationale</span></h2>
          <p className="lp-sub">TELNET Engineering Hub déployé sur l'ensemble des sites R&D — de Tunis à Paris, de Riyad à Washington</p>
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
                  stroke={active === SITES.indexOf(s) ? "#1A56FF" : "rgba(26,86,255,.15)"}
                  strokeWidth={active === SITES.indexOf(s) ? 2 : 0.9}
                  strokeDasharray="4 4"
                  style={{ transition: "all .4s" }} />
              ))}
              {SITES.map((s, i) => (
                <Marker key={i} coordinates={s.coords} onMouseEnter={() => setActive(i)} style={{ cursor: "pointer" }}>
                  {s.hq && (
                    <>
                      <circle r={5 + (pulse % 40) * 0.18} fill="none" stroke="#1A56FF" strokeWidth={0.8} opacity={1 - (pulse % 40) / 40} />
                      <circle r={3 + ((pulse + 20) % 40) * 0.13} fill="none" stroke="#6366F1" strokeWidth={0.6} opacity={1 - ((pulse + 20) % 40) / 40} />
                    </>
                  )}
                  {active === i && !s.hq && <circle r={3.5 + (pulse % 30) * 0.13} fill="none" stroke="#6366F1" strokeWidth={0.7} opacity={1 - (pulse % 30) / 30} />}
                  <circle r={s.hq ? 4.2 : active === i ? 3.2 : 2.4}
                    fill={s.hq ? "#1A56FF" : active === i ? "#6366F1" : "rgba(100,140,255,.65)"}
                    style={{ transition: "all .3s", filter: s.hq ? "drop-shadow(0 0 4px #1A56FF)" : active === i ? "drop-shadow(0 0 4px #6366F1)" : "none" }} />
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
                    background: s.hq ? "#1A56FF" : active === i ? "#6366F1" : "rgba(99,102,241,.3)",
                    boxShadow: (s.hq || active === i) ? `0 0 10px ${s.hq ? "#1A56FF" : "#6366F1"}` : "none"
                  }} />
                  <div className="pres-info">
                    <div className="pres-name">{s.name}{s.hq && <span className="pres-hq-tag">HQ</span>}</div>
                    <div className="pres-st">{s.status}</div>
                  </div>
                  <div className="pres-meta"><span className="pres-dv" style={{ color: s.hq ? "#1A56FF" : active === i ? "#6366F1" : "#fff" }}>{s.devs}</span><span className="pres-dl">devs</span></div>
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
            ["7", "Pays couverts", "#1A56FF"],
            ["257+", "Développeurs", "#6366F1"],
            ["47", "Projets GitLab", "#1A56FF"],
            ["24/7", "Synchro KPI", "#6366F1"],
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
      Vos dépôts transformés<br />
      <span className="hero-title-accent">
        {displayed}
        <span className={`hero-cursor${done ? " done" : ""}`} aria-hidden="true" />
      </span>
    </h1>
  );
}

// ── Contact Section ────────────────────────────────────────────────────────
function ContactSection() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | null
  const containerRef = useRef(null);
  const triggered = useTimelineReveal(containerRef);
  const titleRef = useRef(null);

  useEffect(() => {
    if (triggered && titleRef.current) {
      gsap.fromTo(titleRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", delay: 0.2 }
      );
    }
  }, [triggered]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      await authService.sendContact(
        formData.name,
        formData.email,
        formData.subject,
        formData.message
      );
      setSubmitStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact" className="lp-section lp-contact" ref={containerRef}>
      <div className="lp-container">
        <TimelineItem as="div" animNum={1} triggered={triggered} className="lp-sh">
          <h2 className="lp-h2" ref={titleRef}>Contactez <span className="lp-accent">TELNET</span></h2>
          <p className="lp-sub">Une question sur nos solutions KPI GitLab ? Notre équipe est à votre écoute</p>
        </TimelineItem>

        <TimelineItem as="div" animNum={2} triggered={triggered} className="contact-grid">
          <div className="contact-info">
            <div className="contact-info-item">
              <div className="contact-icon">
                <Envelope size={24} weight="thin" />
              </div>
              <div>
                <div className="contact-label">Email</div>
                <div className="contact-value">contact@telnet.com</div>
              </div>
            </div>
            <div className="contact-info-item">
              <div className="contact-icon">
                <Globe size={24} weight="thin" />
              </div>
              <div>
                <div className="contact-label">Site Web</div>
                <div className="contact-value">www.telnet.com</div>
              </div>
            </div>
            <div className="contact-info-item">
              <div className="contact-icon">
                <MapPin size={24} weight="thin" />
              </div>
              <div>
                <div className="contact-label">Siège Social</div>
                <div className="contact-value">Tunisie</div>
              </div>
            </div>
          </div>

          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <input
                type="text"
                name="name"
                placeholder="Votre nom"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="form-input"
              />
            </div>
            <div className="form-group">
              <input
                type="email"
                name="email"
                placeholder="Votre email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="form-input"
              />
            </div>
            <div className="form-group">
              <input
                type="text"
                name="subject"
                placeholder="Sujet"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
                className="form-input"
              />
            </div>
            <div className="form-group">
              <textarea
                name="message"
                placeholder="Votre message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                required
                className="form-textarea"
                rows={5}
              />
            </div>

            <button
              type="submit"
              className="contact-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Envoi en cours...' : 'Envoyer le message →'}
            </button>

            {submitStatus === 'success' && (
              <div className="contact-message contact-success">
                ✓ Votre message a été envoyé avec succès. Notre équipe vous contactera dans les plus brefs délais.
              </div>
            )}
            {submitStatus === 'error' && (
              <div className="contact-message contact-error">
                ✗ Erreur lors de l'envoi. Veuillez réessayer.
              </div>
            )}
          </form>
        </TimelineItem>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HeroParticles — connected floating network (Linear / Stripe style)
// ══════════════════════════════════════════════════════════════════════════════
function HeroParticles() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const timeRef = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
    };

    const mkPt = (initial = false) => {
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        speed: Math.random() * 0.7 + 0.7, // slow, elegant fluid drift
        size: Math.random() * 0.4 + 1.2, // perfectly visible 1.2px - 1.6px thickness
        life: Math.random() * 300 + 200,
        op: Math.random() * 0.22 + 0.22, // crisp opacity (0.22 to 0.44) for visibility
      };
    };

    resize();
    let pts = Array.from({ length: 130 }, () => mkPt(true));

    const draw = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      timeRef.current += 1.2;

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      pts.forEach(p => {
        // 1. Organic Vector Flow Field (flowing wind wave)
        const flowAngle = (p.x * 0.0015) + (p.y * 0.0015) + (timeRef.current * 0.004);
        let tx = Math.cos(flowAngle);
        let ty = Math.sin(flowAngle);

        // Add a gentle general drift direction (top-left to bottom-right)
        tx += 0.3;
        ty += 0.2;

        // 2. Interactive Mouse Swirl (Gravity vortex around the cursor)
        if (mx > 0 && my > 0) {
          const mdx = p.x - mx;
          const mdy = p.y - my;
          const md = Math.sqrt(mdx * mdx + mdy * mdy);
          if (md < 240) {
            const force = (240 - md) / 240;
            // Swirl around the mouse
            tx += (-mdy / (md || 1)) * force * 2.2;
            ty += (mdx / (md || 1)) * force * 2.2;
            
            // Gentle pull towards the mouse path
            tx += (mdx / (md || 1)) * force * -0.3;
            ty += (mdy / (md || 1)) * force * -0.3;
          }
        }

        // Normalize flow vector
        const targetLen = Math.sqrt(tx * tx + ty * ty);
        const targetVx = (tx / (targetLen || 1)) * p.speed;
        const targetVy = (ty / (targetLen || 1)) * p.speed;

        // Interpolate velocity
        p.vx += (targetVx - p.vx) * 0.04;
        p.vy += (targetVy - p.vy) * 0.04;

        p.x += p.vx;
        p.y += p.vy;

        p.life--;

        // Wrap around screen boundaries
        if (p.x < -20) p.x = window.innerWidth + 20;
        if (p.x > window.innerWidth + 20) p.x = -20;
        if (p.y < -20) p.y = window.innerHeight + 20;
        if (p.y > window.innerHeight + 20) p.y = -20;

        if (p.life <= 0) {
          Object.assign(p, mkPt(false));
        }

        // 3. Color Mapping: Sky Blue -> Indigo -> Telnet Royal Blue based on screen width
        const t = p.x / window.innerWidth;
        let r_val, g_val, b_val;
        
        if (t < 0.5) {
          const k = t / 0.5;
          r_val = 14 + (99 - 14) * k;
          g_val = 165 + (102 - 165) * k;
          b_val = 233 + (241 - 233) * k;
        } else {
          const k = (t - 0.5) / 0.5;
          r_val = 99 + (26 - 99) * k;
          g_val = 102 + (86 - 102) * k;
          b_val = 241 + (255 - 241) * k;
        }

        // Draw oriented crisp dash/tick
        const angle = Math.atan2(p.vy, p.vx);
        const len = Math.max(6, Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 6.5); // length of dash (6px to 13px)

        ctx.beginPath();
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${Math.floor(r_val)}, ${Math.floor(g_val)}, ${Math.floor(b_val)}, ${p.op})`;
        ctx.moveTo(p.x - Math.cos(angle) * len * 0.5, p.y - Math.sin(angle) * len * 0.5);
        ctx.lineTo(p.x + Math.cos(angle) * len * 0.5, p.y + Math.sin(angle) * len * 0.5);
        ctx.stroke();
      });

      animId = requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE — 100% CLEAR VIDEO BACKGROUND WITH COMPACT LOGIC
// ══════════════════════════════════════════════════════════════════════════════
export default function LandingPage() {

  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mouse, setMouse] = useState({ x: 0.65, y: 0.5 });
  const heroContentRef = useRef(null);
  const heroRef = useRef(null);
  /* Commented video state and refs for simplification
  const videoRef = useRef(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  */

  useEffect(() => {
    if (!document.getElementById("lp6-fonts")) {
      const l = Object.assign(document.createElement("link"), { id: "lp6-fonts", rel: "stylesheet", href: FONTS });
      document.head.appendChild(l);
    }
    const onScroll = () => {
      setScrolled(window.scrollY > 60);
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docH > 0 ? (window.scrollY / docH) * 100 : 0);

      /* Commented video restart logic for simplification
      // Restart video when returning to hero section
      const heroSection = document.querySelector('.lp-hero');
      if (heroSection && videoRef.current) {
        const heroRect = heroSection.getBoundingClientRect();
        const isVisible = heroRect.top < window.innerHeight && heroRect.bottom > 0;
        
        if (isVisible && videoEnded) {
          videoRef.current.currentTime = 0;
          videoRef.current.play();
          setVideoEnded(false);
        }
      }
      */
    };
    window.addEventListener("scroll", onScroll);

    // Hero content entrance animation - Premium version
    if (heroContentRef.current) {
      const els = heroContentRef.current.querySelectorAll(".hero-anim");
      gsap.fromTo(els,
        { opacity: 0, y: 50, filter: "blur(16px)", scale: 0.95 },
        { opacity: 1, y: 0, filter: "blur(0px)", scale: 1, duration: 1.4, stagger: 0.22, ease: "power3.out", delay: 0.5 }
      );

      // Premium floating animation for hero elements
      gsap.to(els, {
        y: -3,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.3,
        delay: 2
      });
    }

    return () => window.removeEventListener("scroll", onScroll);
  }, [/* videoEnded */]);

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
      {/* Enterprise global background particles */}
      <HeroParticles />
      {/* Scroll progress bar */}
      <div className="lp-progress" style={{ width: `${scrollProgress}%` }} />
      <div className="lp-noise" />
      <nav className={`lp-nav ${scrolled ? "lp-nav-scrolled" : ""}`}>
        <div className="lp-nav-in">
          {/* Brand */}
          <div className="lp-brand">
            <ImageWithLoading src="/assets/images/telnet.png" alt="Telnet" className="lp-logo" />

          </div>

          {/* Links */}
          <div className="lp-links">
            <div className="lp-nav-sep" />
            <button onClick={() => scrollTo("presence")} className="lp-nl">Présence</button>
            <button onClick={() => scrollTo("contact")} className="lp-nl">Contact</button>
            <Link to={isAuthenticated ? "/developers" : "/login"} className="lp-cta-btn">
              {isAuthenticated ? "Ouvrir le Hub" : "Accès Plateforme"}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          </div>
          <button className="lp-ham" onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? "✕" : "☰"}</button>
        </div>
        {menuOpen && (
          <div className="lp-mob">
            <button onClick={() => scrollTo("presence")}>Présence</button>
            <button onClick={() => scrollTo("contact")}>Contact</button>
            <Link to={isAuthenticated ? "/developers" : "/login"}>{isAuthenticated ? "Ouvrir le Hub" : "Connexion"}</Link>
          </div>
        )}
      </nav>

      <section
        className="lp-hero"
        ref={heroRef}
        onMouseMove={(e) => {
          const r = heroRef.current?.getBoundingClientRect();
          if (!r) return;
          setMouse({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
        }}
      >
        {/* Luminous mouse-reactive gradient orbs */}
        <div className="hero-orb hero-orb-1" style={{ transform: `translate(${(mouse.x - 0.5) * 60}px, ${(mouse.y - 0.5) * 40}px)` }} />
        <div className="hero-orb hero-orb-2" style={{ transform: `translate(${(mouse.x - 0.5) * -45}px, ${(mouse.y - 0.5) * -30}px)` }} />
        <div className="hero-orb hero-orb-3" />
        <div className="hero-inner" ref={heroContentRef}>
          {/* LEFT — Text content */}
          <div className="hero-left">

            <HeroTitle />
            <p className="hero-desc hero-anim">
              Suivez la performance de vos équipes en temps réel avec des KPIs unifiés et des analyses de vélocité précises.
            </p>
            <div className="hero-actions hero-anim">
              <Link
                to={isAuthenticated ? "/analytics/comparison" : "/login"}
                className="hero-cta-primary"
              >
                {isAuthenticated ? "Ouvrir le Hub" : "Accéder au Hub"} →
              </Link>
              <button onClick={() => document.getElementById("presence")?.scrollIntoView({ behavior: "smooth" })} className="hero-cta-secondary">
                Voir notre présence
              </button>
            </div>

          </div>

          {/* RIGHT — Custom image */}
          <div className="hero-right hero-anim">
            <div
              className="hero-img-scene"
              style={{
                transform: `perspective(900px) rotateY(${(mouse.x - 0.5) * -10}deg) rotateX(${(mouse.y - 0.5) * 7}deg)`,
                transition: 'transform 0.12s ease-out',
              }}
            >
              <div className="hero-img-wrap">
                <img
                  src="/assets/images/hero-dashboard.png"
                  alt="Dashboard TELNET KPI"
                  className="hero-img"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <PresenceSection />

      <ContactSection />

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="foot-inner">
            <div className="foot-left">
              <p className="foot-copy">Dashboard KPI GitLab</p>
            </div>
            <div className="foot-right">
              <p className="foot-legal">© 2026 TELNET HOLDING </p>
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
    --cy: #6366F1;
    --gn: #10B981;
    --am: #1A56FF;
    --gold: #6366F1;
    --pu: #A78BFA;
    --bg: #030810;
    --br: rgba(255, 255, 255, 0.06);
    --tx: #E2E8F0;
    --mt: rgba(255, 255, 255, 0.38);
    --fd: 'Syne', sans-serif;
    --fm: 'DM Mono', monospace;
    --fb: 'Plus Jakarta Sans', sans-serif;
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    /* Signature accent gradient — Enterprise blue palette */
    --grad-accent: linear-gradient(110deg, #1A56FF 0%, #6366F1 50%, #0EA5E9 100%);
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
    background: #f0f4ff;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(26, 86, 255, 0.4);
    border-radius: 10px;
  }

  .lp-root {
    background: linear-gradient(180deg, #fafbff 0%, #f0f4ff 35%, #f6f8ff 70%, #fafbff 100%);
    color: #030810;
    font-family: var(--fb);
    min-height: 100vh;
    overflow-x: hidden;
    position: relative;
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

  /* ── Scroll Progress Bar ── */
  .lp-progress {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    background: linear-gradient(90deg, #1A56FF, #6366F1, #0EA5E9);
    z-index: 1000;
    transition: width 0.1s linear;
    border-radius: 0 2px 2px 0;
    box-shadow: 0 0 10px rgba(26, 86, 255, 0.5);
  }


  /* ── Navbar ── */
  .lp-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 500;
    padding: 20px 0;
    transition: background 0.4s var(--ease), padding 0.4s, border-color 0.4s, box-shadow 0.4s;
    border-bottom: 1px solid transparent;
    background: rgba(255, 255, 255, 0.0);
  }
  .lp-nav-scrolled {
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    padding: 13px 0;
    border-color: rgba(0, 0, 0, 0.08);
    box-shadow: 0 2px 24px rgba(0, 0, 0, 0.08);
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
    gap: 10px;
    text-decoration: none;
  }
  .lp-logo {
    height: 32px;
    width: auto;
    object-fit: contain;
    filter: none;
    transition: transform 0.3s;
  }
  .lp-brand:hover .lp-logo {
    transform: scale(1.04);
  }

  .lp-brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1;
    gap: 1px;
  }
  .lp-brand-name {
    font-family: var(--fd);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #030810;
  }
  .lp-brand-sub {
    font-family: var(--fm);
    font-size: 8.5px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(3,8,16,0.35);
  }

  .lp-nav-sep {
    width: 1px;
    height: 18px;
    background: rgba(3,8,16,0.10);
    margin-right: 6px;
    flex-shrink: 0;
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
    color: rgba(3, 8, 16, 0.7);
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
    background: #1A56FF;
    transition: all 0.3s var(--ease);
    transform: translateX(-50%);
  }
  .lp-nl:hover {
    color: #030810;
    background: rgba(26, 86, 255, 0.06);
  }
  .lp-nl:hover::after {
    width: 60%;
  }
  .lp-cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #030810;
    color: #fff;
    font-family: var(--fb);
    font-size: 13px;
    font-weight: 600;
    padding: 9px 20px;
    border-radius: 8px;
    text-decoration: none;
    transition: all 0.3s var(--ease);
    letter-spacing: 0.01em;
    border: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  }
  .lp-cta-btn:hover {
    background: #1A56FF;
    box-shadow: 0 4px 20px rgba(26,86,255,0.3);
    transform: translateY(-1px);
    color: #fff;
  }
  .lp-cta-btn svg {
    transition: transform 0.3s var(--ease);
  }
  .lp-cta-btn:hover svg {
    transform: translateX(3px);
  }
  .lp-ham {
    display: none;
    background: none;
    border: none;
    color: #030810;
    font-size: 20px;
    padding: 4px;
    cursor: pointer;
  }
  .lp-mob {
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.98);
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    padding: 14px 32px;
  }
  .lp-mob button, .lp-mob a {
    background: none;
    border: none;
    color: rgba(3, 8, 16, 0.7);
    font-size: 15px;
    font-weight: 500;
    padding: 12px 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    text-decoration: none;
    text-align: left;
    cursor: pointer;
  }

  /* ── Base Section ── */
  .lp-section {
    padding: 100px 0;
  }

  /* ── Hero Section ── */
  .lp-hero {
    position: relative;
    width: 100%;
    min-height: 100vh;
    background: transparent;
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  /* ── Hero luminous orbs — mouse-reactive gradient blobs ── */
  .hero-orb {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    z-index: 2;
    transition: transform 0.14s ease-out;
    will-change: transform;
  }
  .hero-orb-1 {
    width: 680px; height: 680px;
    background: radial-gradient(circle, rgba(26,86,255,0.13) 0%, transparent 68%);
    top: -200px; right: -100px;
    filter: blur(90px);
  }
  .hero-orb-2 {
    width: 560px; height: 560px;
    background: radial-gradient(circle, rgba(99,102,241,0.11) 0%, transparent 68%);
    bottom: -140px; left: -100px;
    filter: blur(80px);
  }
  .hero-orb-3 {
    width: 440px; height: 440px;
    background: radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%);
    top: 50%; left: 48%;
    transform: translate(-50%, -50%);
    filter: blur(100px);
  }

  /* ── Hero Inner Grid ── */
  .hero-inner {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    padding: 100px 0 80px 80px;
    display: grid;
    /* balanced grid for professional enterprise look */
    grid-template-columns: 50% 50%;
    gap: 40px;
    align-items: center;
    min-height: 100vh;
  }

  /* ── Hero Left — Text ── */
  .hero-left {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }

  .hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--fm);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #1A56FF;
    background: rgba(26, 86, 255, 0.07);
    border: 1px solid rgba(26, 86, 255, 0.15);
    padding: 6px 14px;
    border-radius: 100px;
    margin-bottom: 28px;
  }

  .hero-eyebrow::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #1A56FF;
    animation: eyebrow-pulse 2s ease-in-out infinite;
  }

  @keyframes eyebrow-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.7); }
  }

  /* ── Hero Right — image panel ── */
  .hero-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    position: relative;
    z-index: 10;
    overflow: visible;
    /* bleed aggressively to the right edge */
    margin-right: -80px;
    /* stretch to full hero height so the image fills vertically */
    align-self: stretch;
    padding-top: 60px;
    padding-bottom: 60px;
  }

  /* ── Hero custom image ── */
  .hero-img-scene {
    position: relative;
    /* smaller size to prevent cutoff on right side */
    width: 55%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    /* Rich float: vertical + subtle rotation + slight scale breathe */
    animation: dash-float 6s cubic-bezier(0.37, 0, 0.63, 1) infinite;
    /* 3D context for the perspective tilt */
    transform-style: preserve-3d;
  }

  .hero-img-glow {
    display: none;
  }

  .hero-img-wrap {
    position: relative;
    z-index: 1;
    width: 100%;
    /* Remove mask to prevent background blending issues */
  }

  .hero-img {
    width: 100%;
    height: auto;
    display: block;
    /* stronger shadow for depth and lift */
    filter: drop-shadow(0 32px 72px rgba(99,92,200,0.32))
            drop-shadow(0 8px 24px rgba(0,0,0,0.15));
  }

  @keyframes dash-float {
    0%        { transform: translateY(0px)    rotate(0deg)    scale(1); }
    25%       { transform: translateY(-10px)  rotate(0.4deg)  scale(1.008); }
    50%       { transform: translateY(-22px)  rotate(0deg)    scale(1.012); }
    75%       { transform: translateY(-10px)  rotate(-0.4deg) scale(1.008); }
    100%      { transform: translateY(0px)    rotate(0deg)    scale(1); }
  }

  /* ── Hero Content (legacy — kept for HeroTitle/desc/actions alignment) ── */
  .hero-content {
    display: contents;
  }

  .hero-title {
    font-family: var(--fb); /* Plus Jakarta Sans — premium B2B sans-serif */
    font-weight: 800;
    font-size: clamp(2.4rem, 4.5vw, 3.8rem);
    line-height: 1.1;
    letter-spacing: -0.04em;
    color: #020710;
    margin-bottom: 24px;
    text-shadow: none;
    text-align: left;
  }

  .hero-title-accent {
    font-family: 'Playfair Display', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    letter-spacing: -0.01em;
    text-transform: none;
    /* Soft premium B2B blue-indigo gradient */
    background: linear-gradient(110deg, #1A56FF 0%, #6366F1 45%, #0EA5E9 85%, #1A56FF 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 15px rgba(26, 86, 255, 0.15));
    animation: shimmer-accent 4s linear infinite;
  }

  .lp-hero:hover .hero-title-accent {
    filter: drop-shadow(0 0 20px rgba(99, 102, 241, 0.25));
  }

  /* Typing cursor */
  .hero-cursor {
    display: inline-block;
    width: 3px;
    height: 0.85em;
    background: #6366F1;
    border-radius: 2px;
    margin-left: 4px;
    vertical-align: middle;
    animation: cursor-blink 1s step-end infinite;
    position: relative;
    top: -2px;
    box-shadow: 0 0 10px rgba(99, 102, 241, 0.6);
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
    font-size: clamp(15px, 1.6vw, 17px);
    line-height: 1.75;
    color: rgba(2, 7, 16, 0.6);
    max-width: 480px;
    margin: 0 0 36px;
    text-shadow: none;
    text-align: left;
  }

  .hero-actions {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 14px;
    flex-wrap: wrap;
  }

  /* ── Hero stat counters ── */
  .hero-stats {
    display: flex;
    align-items: center;
    gap: 0;
    margin-top: 44px;
    padding-top: 32px;
    border-top: 1px solid rgba(26,86,255,0.10);
  }

  .hero-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 28px 0 0;
    margin-right: 28px;
    /* thin divider between stats */
    border-right: 1px solid rgba(26,86,255,0.10);
  }
  .hero-stat:last-child {
    border-right: none;
    margin-right: 0;
    padding-right: 0;
  }

  .hero-stat-value {
    font-family: var(--fd);
    font-size: 2.2rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
    /* gradient matching the title accent */
    background: linear-gradient(120deg, #1A56FF 0%, #6366F1 60%, #0EA5E9 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: stat-in 0.7s cubic-bezier(0.16,1,0.3,1) both;
  }
  .hero-stat:nth-child(1) .hero-stat-value { animation-delay: 0.3s; }
  .hero-stat:nth-child(2) .hero-stat-value { animation-delay: 0.45s; }
  .hero-stat:nth-child(3) .hero-stat-value { animation-delay: 0.6s; }

  @keyframes stat-in {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .hero-stat-suffix {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .hero-stat-label {
    font-family: var(--fm);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(2,7,16,0.42);
    font-weight: 500;
  }

  .hero-cta-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #1A56FF 0%, #6366F1 100%);
    color: #fff;
    font-family: var(--fb);
    font-size: 14.5px;
    font-weight: 700;
    padding: 14px 32px;
    border-radius: 10px;
    text-decoration: none;
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 6px 28px rgba(26, 86, 255, 0.35), 0 0 0 1px rgba(26, 86, 255, 0.15);
    letter-spacing: 0.01em;
    position: relative;
    overflow: hidden;
  }

  .hero-cta-primary::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 60%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
    transition: left 0s;
    animation: cta-shimmer 2.8s ease-in-out infinite;
  }

  @keyframes cta-shimmer {
    0%   { left: -100%; }
    40%  { left: 130%; }
    100% { left: 130%; }
  }

  .hero-cta-primary:hover {
    background: linear-gradient(135deg, #1446D4 0%, #4f52d8 100%);
    transform: translateY(-3px) scale(1.03);
    box-shadow: 0 12px 40px rgba(26, 86, 255, 0.45), 0 0 0 1px rgba(99, 102, 241, 0.3);
    color: #fff;
  }

  .hero-cta-primary:hover::before {
    opacity: 1;
  }

  .hero-cta-primary:active {
    transform: translateY(0) scale(0.98);
  }

  .hero-cta-secondary {
    background: transparent;
    border: 1.5px solid rgba(26, 86, 255, 0.25);
    color: #1A56FF;
    font-family: var(--fb);
    font-size: 14px;
    font-weight: 600;
    padding: 14px 28px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.3s var(--ease);
    position: relative;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .hero-cta-secondary:hover {
    background: rgba(26, 86, 255, 0.06);
    border-color: rgba(26, 86, 255, 0.5);
    transform: translateY(-2px);
    color: #1A56FF;
    box-shadow: 0 4px 16px rgba(26, 86, 255, 0.12);
  }

  .hero-cta-secondary:active {
    transform: translateY(0) scale(0.98);
  }

  /* Commented Premium Audio Controller Toggle CSS for simplification
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
    padding: 12px 18px;
    border-radius: 30px;
    color: #fff;
    cursor: pointer;
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(26, 86, 255, 0.08);
  }
  
  .hero-audio-toggle.audio-active {
    background: rgba(26, 86, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.4);
    box-shadow: 0 8px 32px rgba(0, 212, 255, 0.25), inset 0 1px 0 rgba(0, 212, 255, 0.15), 0 0 20px rgba(0, 212, 255, 0.1);
  }
  
  .hero-audio-toggle:hover {
    background: rgba(3, 8, 16, 0.85);
    border-color: var(--cy);
    box-shadow: 0 12px 32px rgba(0, 212, 255, 0.25), 0 0 0 1px rgba(0, 212, 255, 0.15);
    transform: translateY(-2px);
  }

  .hero-audio-toggle:active {
    transform: translateY(0);
  }

  .audio-toggle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .hero-audio-toggle.audio-active .audio-toggle-icon {
    background: linear-gradient(135deg, #1A56FF 0%, #00D4FF 100%);
    box-shadow: 0 0 16px rgba(0, 212, 255, 0.4);
  }

  .hero-audio-toggle:hover .audio-toggle-icon {
    background: rgba(255, 255, 255, 0.12);
  }

  .hero-audio-toggle.audio-active:hover .audio-toggle-icon {
    background: linear-gradient(135deg, #1A56FF 0%, #00D4FF 100%);
    box-shadow: 0 0 20px rgba(0, 212, 255, 0.6);
  }

  .audio-toggle-txt {
    font-family: var(--fb);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.5);
    transition: color 0.3s;
  }

  .hero-audio-toggle.audio-active .audio-toggle-txt {
    color: var(--cy);
    text-shadow: 0 0 12px rgba(0, 212, 255, 0.5);
  }

  .hero-audio-toggle:hover .audio-toggle-txt {
    color: #fff;
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
    /* Transparent to let particles show through */
    background: transparent;
    border-top: 1px solid rgba(26, 86, 255, 0.12);
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  }
  .lp-pres::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(26, 86, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(26, 86, 255, 0.03) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
    mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%);
  }

  .lp-pres .lp-h2 {
    color: #030810;
    text-shadow: none;
  }

  .lp-pres .lp-accent {
    background: linear-gradient(110deg, #1A56FF 0%, #6366F1 50%, #0EA5E9 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 16px rgba(26, 86, 255, 0.2));
  }

  .lp-pres .lp-accent::after {
    display: none;
  }

  .lp-pres .lp-sub {
    color: #475569;
  }

  .lp-sh {
    text-align: center;
    max-width: 640px;
    margin: 0 auto 64px;
  }

  .lp-h2 {
    font-family: var(--fb); /* Plus Jakarta Sans — premium B2B sans-serif */
    font-weight: 800;
    font-size: clamp(2.2rem, 3.8vw, 3rem);
    line-height: 1.15;
    letter-spacing: -0.04em;
    color: #fff;
    margin-bottom: 24px;
    text-shadow: 0 0 40px rgba(26, 86, 255, 0.15);
  }

  @keyframes h2-reveal {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .lp-accent {
    font-family: 'Playfair Display', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    letter-spacing: -0.01em;
    text-transform: none;
    /* Enterprise blue → indigo → sky — palette pro */
    background: var(--grad-accent);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 20px rgba(26, 86, 255, 0.35));
    position: relative;
  }

  .lp-accent::after {
    content: '';
    position: absolute;
    inset: -4px;
    background: var(--grad-accent);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: blur(12px);
    opacity: 0.4;
    z-index: -1;
    animation: glow-pulse 3s ease-in-out infinite;
  }

  @keyframes glow-pulse {
    0%, 100% {
      opacity: 0.3;
      filter: blur(12px);
    }
    50% {
      opacity: 0.5;
      filter: blur(16px);
    }
  }

  .lp-sub {
    font-size: 15.5px;
    line-height: 1.75;
    color: rgba(2, 7, 16, 0.7);
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
    background: #040a1c;
    border: 1px solid rgba(26,86,255,0.20);
    border-radius: 20px;
    overflow: hidden;
    padding: 20px;
    min-height: 340px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255,255,255,0.05);
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
    background: #040a1c;
    border: 1px solid rgba(26,86,255,0.18);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
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
    background: #040a1c;
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

  /* ── Contact Section ── */
  .lp-contact {
    position: relative;
    z-index: 10;
    padding: 110px 0 120px;
    /* Transparent to let particles show through */
    background: transparent;
    border-top: 1px solid rgba(26, 86, 255, 0.12);
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  }
  .lp-contact::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(26, 86, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(26, 86, 255, 0.03) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
    mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%);
  }

  .lp-contact .lp-h2 {
    color: #030810;
    text-shadow: none;
  }

  .lp-contact .lp-accent {
    background: linear-gradient(110deg, #1A56FF 0%, #6366F1 50%, #0EA5E9 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 16px rgba(26, 86, 255, 0.2));
  }

  .lp-contact .lp-accent::after {
    display: none;
  }

  .lp-contact .lp-sub {
    color: #475569;
  }

  .contact-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    margin-top: 48px;
  }

  .contact-info {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .contact-info-item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: #040a1c;
    border: 1px solid rgba(0,212,255,0.18);
    border-radius: 16px;
    transition: all 0.3s var(--ease);
  }

  .contact-info-item:hover {
    border-color: rgba(0,212,255,0.4);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,212,255,0.15);
  }

  .contact-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(0,212,255,0.15), rgba(26,86,255,0.1));
    border-radius: 12px;
    color: var(--cy);
  }

  .contact-icon svg {
    width: 24px;
    height: 24px;
  }

  .contact-label {
    font-family: var(--fm);
    font-size: 10px;
    color: var(--mt);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .contact-value {
    font-family: var(--fb);
    font-size: 15px;
    font-weight: 500;
    color: #fff;
  }

  .contact-form {
    background: #040a1c;
    border: 1px solid rgba(0,212,255,0.18);
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-input,
  .form-textarea {
    width: 100%;
    background: #030810;
    border: 1px solid rgba(0,212,255,0.2);
    border-radius: 10px;
    padding: 14px 18px;
    color: #fff;
    font-family: var(--fb);
    font-size: 14px;
    transition: all 0.3s var(--ease);
    outline: none;
  }

  .form-input::placeholder,
  .form-textarea::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .form-input:focus,
  .form-textarea:focus {
    border-color: var(--cy);
    box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
    background: rgba(3, 8, 16, 0.95);
  }

  .form-textarea {
    resize: vertical;
    min-height: 120px;
    line-height: 1.6;
  }

  .contact-submit {
    width: 100%;
    background: linear-gradient(135deg, #1A56FF 0%, #00D4FF 100%);
    color: #fff;
    font-family: var(--fb);
    font-size: 15px;
    font-weight: 600;
    padding: 16px 32px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 6px 28px rgba(0, 212, 255, 0.3), 0 0 0 1px rgba(0, 212, 255, 0.15);
    letter-spacing: 0.01em;
  }

  .contact-submit:hover:not(:disabled) {
    background: linear-gradient(135deg, #1446D4 0%, #00B4D8 100%);
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0, 212, 255, 0.45), 0 0 0 1px rgba(0, 212, 255, 0.2);
  }

  .contact-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .contact-message {
    margin-top: 24px;
    padding: 16px 24px;
    border-radius: 12px;
    font-family: var(--fb);
    font-size: 15px;
    text-align: center;
    animation: message-in 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    backdrop-filter: blur(10px);
  }

  .contact-success {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.1));
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #10B981;
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.2);
  }

  .contact-error {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1));
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #EF4444;
    box-shadow: 0 4px 20px rgba(239, 68, 68, 0.2);
  }

  @keyframes message-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Footer ── */
  .lp-footer {
    background: transparent;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
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
    opacity: 0.85;
    filter: none;
    transition: opacity 0.3s, filter 0.3s;
  }
  .foot-logo:hover {
    opacity: 1;
    filter: drop-shadow(0 0 10px rgba(26, 86, 255, 0.3));
  }

  .foot-copy {
    font-family: var(--fm);
    font-size: 10px;
    color: rgba(3, 8, 16, 0.4);
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
    color: rgba(3, 8, 16, 0.45);
    padding: 6px 14px;
    border-radius: 6px;
    transition: color 0.2s, background 0.2s;
    cursor: pointer;
  }

  .foot-link:hover {
    color: #1A56FF;
    background: rgba(26, 86, 255, 0.06);
  }

  .foot-legal {
    font-family: var(--fm);
    font-size: 10px;
    color: rgba(3, 8, 16, 0.3);
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