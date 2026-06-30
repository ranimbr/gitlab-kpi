/**
 * Login.jsx — TELNET COMMAND · v3 (fix titre tronqué)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Swal from "sweetalert2";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SEC = 30;
const REMEMBER_KEY = "kpi_remember_identifier";
const FONTS_URL = "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";

let _sw = false;
function injectSwal() {
  if (_sw) return; _sw = true;
  const s = document.createElement("style");
  s.textContent = `
    .sw-p  { background:rgba(6,12,24,.97)!important;backdrop-filter:blur(28px)!important;border-radius:22px!important;box-shadow:0 40px 100px rgba(0,0,0,.85),0 0 0 1px rgba(26,86,255,.18) inset!important;border:1px solid rgba(255,255,255,.04)!important;color:#fff!important;font-family:'Plus Jakarta Sans',sans-serif!important; }
    .sw-ok { background:#1A56FF!important; }
    .sw-b  { border-radius:12px!important;font-weight:700!important;padding:12px 32px!important;background:#1A56FF!important;border:none!important;color:#fff!important; }
  `;
  document.head.appendChild(s);
}

const toastOk = id => Swal.fire({
  html: `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:8px 0"><div style="width:76px;height:76px;border-radius:50%;background:rgba(26,86,255,.08);display:flex;align-items:center;justify-content:center;border:1px solid rgba(26,86,255,.25);box-shadow:0 0 32px rgba(26,86,255,.2)"><i class="ri-shield-check-line" style="font-size:2.2rem;color:#1A56FF"></i></div><div style="text-align:center"><p style="margin:0 0 4px;font-size:1.05rem;font-weight:700;color:#fff">Accès autorisé</p><p style="margin:0;color:rgba(255,255,255,.4);font-size:.875rem">Bienvenue, <strong style="color:#fff">${id}</strong></p></div></div>`,
  showConfirmButton: false, timer: 1800, timerProgressBar: true, width: 380, padding: "2rem",
  customClass: { popup: "sw-p", timerProgressBar: "sw-ok" }, didOpen: injectSwal,
});

const toastErr = (msg = "Identifiant ou mot de passe incorrect.") => Swal.fire({
  html: `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:8px 0"><div style="width:76px;height:76px;border-radius:50%;background:rgba(239,68,68,.08);display:flex;align-items:center;justify-content:center;border:1px solid rgba(239,68,68,.25)"><i class="ri-close-circle-line" style="font-size:2.2rem;color:#ef4444"></i></div><div style="text-align:center"><p style="margin:0 0 6px;font-size:1.05rem;font-weight:700;color:#fff">Identification échouée</p><p style="margin:0;color:rgba(255,255,255,.4);font-size:.875rem">${msg}</p></div></div>`,
  confirmButtonText: "Réessayer", width: 380, padding: "2rem", buttonsStyling: false,
  customClass: { popup: "sw-p", confirmButton: "sw-b" }, didOpen: injectSwal,
});

const isEmail = v => v.includes("@");
const validId = v => v && v.trim().length >= 3;
const validPwd = v => v && v.length >= 6;

function FloatInput({ label, icon, type = "text", value, onChange, onBlur, error, isValid, disabled, right, autoComplete }) {
  const [focused, setFocused] = useState(false);
  const up = focused || value.length > 0;
  return (
    <div className={`fi ${error ? "fi-err" : ""} ${isValid ? "fi-ok" : ""} ${disabled ? "fi-off" : ""}`}>
      <i className={`${icon} fi-ico`} />
      <label className={`fi-lbl ${up ? "fi-lbl-up" : ""}`}>{label}</label>
      <input
        className="fi-inp"
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        disabled={disabled}
        autoComplete={autoComplete}
        style={{ paddingRight: right ? 48 : 16 }}
      />
      {right}
      <div className="fi-line" />
    </div>
  );
}

function PwdStrength({ pwd }) {
  if (!pwd) return null;
  const score = [pwd.length >= 8, /[A-Z]/.test(pwd), /[a-z]/.test(pwd), /\d/.test(pwd), /[^a-zA-Z0-9]/.test(pwd)].filter(Boolean).length;
  const colors = ["#ef4444", "#f97316", "#f59e0b", "#1A56FF", "#10B981"];
  const labels = ["Critique", "Faible", "Moyen", "Sécurisé", "Excellent"];
  const c = colors[score - 1] || colors[0];
  return (
    <div className="ps-wrap">
      <div className="ps-bars">{[1, 2, 3, 4, 5].map(i => <div key={i} className="ps-bar" style={{ background: i <= score ? c : "rgba(255,255,255,.06)", boxShadow: i <= score ? `0 0 7px ${c}55` : "none" }} />)}</div>
      <span className="ps-lbl" style={{ color: c }}><i className="ri-lock-fill" /> {labels[score - 1] || labels[0]}</span>
    </div>
  );
}

function LockoutOverlay({ remain }) {
  const R = 34, C = 2 * Math.PI * R;
  const dash = C * (1 - remain / LOCKOUT_SEC);
  return (
    <div className="lo">
      <div className="lo-inner">
        <div className="lo-ring">
          <svg viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(239,68,68,.1)" strokeWidth="4" />
            <circle cx="40" cy="40" r={R} fill="none" stroke="#ef4444" strokeWidth="4"
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={dash}
              transform="rotate(-90 40 40)"
              style={{ transition: "stroke-dashoffset 1s linear", filter: "drop-shadow(0 0 6px #ef4444)" }} />
          </svg>
          <span className="lo-count">{remain}</span>
        </div>
        <p className="lo-title">Terminal verrouillé</p>
        <p className="lo-sub">Sécurité activée — réessayez dans <b>{remain}s</b></p>
      </div>
    </div>
  );
}

function AttemptsBar({ attempts }) {
  if (attempts < 2) return null;
  return (
    <div className="att">
      <div className="att-dots">{Array.from({ length: MAX_ATTEMPTS }).map((_, i) => <div key={i} className={`att-dot ${i < attempts ? "att-on" : ""}`} />)}</div>
      <span className="att-txt"><i className="ri-alert-line" /> {MAX_ATTEMPTS - attempts} tentative{MAX_ATTEMPTS - attempts > 1 ? "s" : ""} restante{MAX_ATTEMPTS - attempts > 1 ? "s" : ""}</span>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const saved = localStorage.getItem(REMEMBER_KEY) || "";

  const [showPwd, setShowPwd] = useState(false);
  const [identifier, setId] = useState(saved);
  const [password, setPwd] = useState("");
  const [remember, setRemember] = useState(!!saved);
  const [touched, setTouched] = useState({ id: false, pwd: false });
  const [attempts, setAttempts] = useState(0);
  const [lockout, setLockout] = useState(false);
  const [lockRemain, setLockRemain] = useState(0);
  const [scanning, setScanning] = useState(false);

  const idRef = useRef(null);
  const cntRef = useRef(null);
  const particlesRef = useRef(null);

  useEffect(() => {
    if (!document.getElementById("lg3-fonts")) {
      const l = Object.assign(document.createElement("link"), { id: "lg3-fonts", rel: "stylesheet", href: FONTS_URL });
      document.head.appendChild(l);
    }
    setTimeout(() => idRef.current?.focus(), 150);

    // Initialize particles
    if (particlesRef.current) {
      const canvas = particlesRef.current;
      const ctx = canvas.getContext('2d');
      let particles = [];
      let animationId;

      const resizeCanvas = () => {
        canvas.width = window.innerWidth;
        canvas.height = 380;
      };

      const createParticle = () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speedX: Math.random() * 0.5 - 0.25,
        speedY: Math.random() * 0.5 - 0.25,
        opacity: Math.random() * 0.5 + 0.2
      });

      const initParticles = () => {
        particles = [];
        const particleCount = Math.floor((canvas.width * canvas.height) / 15000);
        for (let i = 0; i < particleCount; i++) {
          particles.push(createParticle());
        }
      };

      const animateParticles = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(particle => {
          particle.x += particle.speedX;
          particle.y += particle.speedY;

          if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1;
          if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1;

          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
          ctx.fill();
        });

        animationId = requestAnimationFrame(animateParticles);
      };

      resizeCanvas();
      initParticles();
      animateParticles();

      window.addEventListener('resize', () => {
        resizeCanvas();
        initParticles();
      });

      return () => {
        window.removeEventListener('resize', resizeCanvas);
        cancelAnimationFrame(animationId);
      };
    }

    return () => clearInterval(cntRef.current);
  }, []);

  const triggerLockout = useCallback(() => {
    setLockout(true); setLockRemain(LOCKOUT_SEC);
    clearInterval(cntRef.current);
    cntRef.current = setInterval(() => {
      setLockRemain(p => {
        if (p <= 1) { clearInterval(cntRef.current); setLockout(false); setAttempts(0); setTimeout(() => idRef.current?.focus(), 100); return 0; }
        return p - 1;
      });
    }, 1000);
  }, []);

  const idOk = validId(identifier), pwdOk = validPwd(password), formOk = idOk && pwdOk;

  const handleSubmit = useCallback(async e => {
    e?.preventDefault();
    setTouched({ id: true, pwd: true });
    if (!formOk || lockout || loading) return;
    setScanning(true);
    await new Promise(r => setTimeout(r, 620));
    setScanning(false);
    const res = await login(identifier, password);
    if (res.success) {
      remember ? localStorage.setItem(REMEMBER_KEY, identifier) : localStorage.removeItem(REMEMBER_KEY);
      await toastOk(identifier);
      navigate("/analytics/comparison");
    } else {
      const n = attempts + 1; setAttempts(n); setPwd(""); idRef.current?.focus();
      n >= MAX_ATTEMPTS ? triggerLockout() : toastErr(res.message);
    }
  }, [formOk, lockout, loading, identifier, password, remember, attempts, login, navigate, triggerLockout]);

  const onKey = e => { if (e.key === "Enter" && formOk && !loading && !lockout) handleSubmit(); };

  return (
    <div className="lg-root">
      <style>{CSS}</style>

      {/* Background with overlay, shape and particles inspired by Velzon */}
      <div className="auth-one-bg-position auth-one-bg" id="auth-particles">
        <div className="bg-overlay" />
        <canvas ref={particlesRef} className="particles-canvas" />
        <div className="shape">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 120">
            <path d="M 0,36 C 144,53.6 432,123.2 720,124 C 1008,124.8 1296,56.8 1440,40L1440 140L0 140z"></path>
          </svg>
        </div>
      </div>

      <aside className="lg-left">
        <Link to="/" className="lg-back"><i className="ri-arrow-left-s-line" /><span>Accueil</span></Link>

        <div className="lg-wrap">

          <header className="lg-brand">
            <div className="lg-logo-shell">
              <img src="/assets/images/telnet.png" alt="Telnet" className="lg-logo" />
              <div className="lg-ring lg-ring-1" />
              <div className="lg-ring lg-ring-2" />
              <div className="lg-ring lg-ring-3" />
            </div>
            {/* ✅ FIX : titre sur deux spans bien cadrés, taille réduite */}
            <h1 className="lg-title">
              <span className="lg-title-main">TELNET</span>
              <span className="lg-title-accent">Access</span>
            </h1>
          </header>

          <div className="lg-card">
            {lockout && <LockoutOverlay remain={lockRemain} />}
            <AttemptsBar attempts={attempts} />

            <form onSubmit={handleSubmit} noValidate className="lg-form">
              <FloatInput
                ref={idRef}
                label="Identifiant ou adresse e-mail"
                icon={`ri-${isEmail(identifier) ? "mail" : "user-3"}-line`}
                value={identifier}
                onChange={e => setId(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, id: true }))}
                error={touched.id && !idOk}
                isValid={touched.id && idOk}
                disabled={lockout}
                autoComplete="username"
              />
              {touched.id && !idOk && <p className="lg-err"><i className="ri-error-warning-line" />Identifiant invalide (min. 3 caractères)</p>}

              <div>
                <FloatInput
                  label="Mot de passe"
                  icon="ri-lock-password-line"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e => setPwd(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, pwd: true }))}
                  error={touched.pwd && !pwdOk}
                  isValid={touched.pwd && pwdOk}
                  disabled={lockout}
                  autoComplete="current-password"
                  right={
                    <button type="button" className="fi-eye" onClick={() => setShowPwd(v => !v)} tabIndex={-1}>
                      <i className={`ri-${showPwd ? "eye-off" : "eye"}-line`} />
                    </button>
                  }
                />
                {password && <PwdStrength pwd={password} />}
                {touched.pwd && !pwdOk && <p className="lg-err"><i className="ri-error-warning-line" />Minimum 6 caractères requis</p>}
              </div>

              <div className="lg-row">
                <label className="lg-check" onClick={() => setRemember(v => !v)}>
                  <div className={`lg-chk ${remember ? "lg-chk-on" : ""}`}>{remember && <i className="ri-check-line" />}</div>
                  <span>Maintenir la session</span>
                </label>
                <Link to={`/forgot-password?email=${encodeURIComponent(identifier)}`} className="lg-forgot">Oublié ?</Link>
              </div>

              <button
                type="submit"
                className={`lg-btn ${lockout ? "lg-locked" : ""} ${scanning ? "lg-scanning" : ""}`}
                disabled={loading || lockout}
                onKeyDown={onKey}
              >
                <span className="lg-shim" />
                <span className="lg-btn-txt">
                  {loading ? <><span className="lg-spin" /> Vérification…</>
                    : lockout ? <><i className="ri-lock-2-line" /> Terminal verrouillé</>
                      : scanning ? <><i className="ri-scan-line" /> Authentification…</>
                        : <>Entrer dans le Hub <i className="ri-arrow-right-line" /></>}
                </span>
              </button>
            </form>
          </div>

          <p className="lg-copy">© 2026 TELNET HOLDING · TOUS DROITS RÉSERVÉS</p>
        </div>
      </aside>

    </div>
  );
}

const CSS = `
  :root{
    --bl:#1A56FF;--cy:#6366F1;--gn:#10B981;--rd:#ef4444;
    --am:#1A56FF;--gold:#6366F1;--pu:#A78BFA;
    --bg:#030810;--bg2:#07101F;--br:rgba(255,255,255,.06);
    --tx:#E2E8F0;--mt:rgba(255,255,255,.38);
    --fd:'Syne',sans-serif;--fm:'DM Mono',monospace;--fb:'Plus Jakarta Sans',sans-serif;
    --ease:cubic-bezier(.16,1,.3,1);
    --grad-accent: linear-gradient(110deg, #1A56FF 0%, #6366F1 50%, #0EA5E9 100%);
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

  .lg-root{min-height:100vh;background:#f3f3f9;display:flex;align-items:center;justify-content:center;font-family:var(--fb);color:var(--tx);overflow:hidden;padding:40px 24px;position:relative;}

  /* Background - Velzon style */
  .auth-one-bg-position {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 380px;
    z-index: 0;
    overflow: hidden;
  }
  .auth-one-bg {
    background-image: url(/assets/images/auth-one-bg.jpg);
    background-position: center;
    background-size: cover;
  }
  .auth-one-bg .bg-overlay {
    position: absolute;
    height: 100%;
    width: 100%;
    right: 0;
    bottom: 0;
    left: 0;
    top: 0;
    background: linear-gradient(to right, #4f42ec, #695eef);
    opacity: 0.7;
    z-index: 2;
  }
  .particles-canvas {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    pointer-events: none;
  }
  .shape {
    position: absolute;
    bottom: 0;
    right: 0;
    left: 0;
    z-index: 4;
    pointer-events: none;
    line-height: 0;
  }
  .shape svg {
    width: 100%;
    height: auto;
    fill: #f3f3f9;
    opacity: 1;
  }
  @media (max-width: 575.98px) {
    .auth-one-bg-position {
      height: 280px;
    }
  }

  /* LEFT */
  .lg-left{background:var(--bg2);background-image:linear-gradient(rgba(26,86,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(26,86,255,0.015) 1px,transparent 1px);background-size:10px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:44px 40px;position:relative;z-index:10;border-radius:24px;max-width:440px;width:100%;box-shadow:0 40px 100px rgba(0,0,0,.70),0 0 0 1px rgba(26,86,255,.08) inset;}
  .lg-back{position:absolute;top:26px;left:26px;display:flex;align-items:center;gap:6px;font-family:var(--fb);font-size:13px;font-weight:500;color:var(--mt);text-decoration:none;padding:8px 14px;border-radius:8px;border:1px solid var(--br);background:rgba(255,255,255,.02);transition:all .2s var(--ease);}
  .lg-back:hover{color:#fff;background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);}
  .lg-wrap{width:100%;max-width:420px;}

  /* Brand */
  .lg-brand{text-align:center;margin-bottom:20px;}
  .lg-logo-shell{position:relative;width:72px;height:72px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,rgba(26,86,255,.09),rgba(0,0,0,.60));border-radius:50%;border:1px solid rgba(26,86,255,.20);box-shadow:0 0 28px rgba(26,86,255,.14),0 0 0 6px rgba(26,86,255,.04);}
  .lg-logo{width:44px;height:auto;filter:drop-shadow(0 0 14px rgba(26,86,255,.70));position:relative;z-index:2;}
  .lg-ring{position:absolute;inset:-5px;border-radius:50%;border:1px solid rgba(99,102,241,.22);animation:ring-p 3.2s ease-out infinite;}
  .lg-ring-2{inset:-16px;border-color:rgba(26,86,255,.12);animation-delay:1.1s;}
  .lg-ring-3{inset:-28px;border-color:rgba(99,102,241,.08);animation-delay:2.2s;}
  @keyframes ring-p{0%{transform:scale(1);opacity:1;}100%{transform:scale(1.45);opacity:0;}}

  /* ✅ TITRE CORRIGÉ — taille réduite + letter-spacing ajusté pour ne pas déborder */
  .lg-title{
    font-family:var(--fd);
    font-weight:700;
    font-size:clamp(16px, 3.5vw, 20px);
    letter-spacing:.06em;
    text-transform:uppercase;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:8px;
    margin-bottom:6px;
    white-space:nowrap;
    position:relative;
    overflow:visible;
  }
  .lg-title::after{
    content:'';
    position:absolute;
    bottom:-8px;
    left:50%;
    transform:translateX(-50%);
    width:40px;
    height:1px;
    background:linear-gradient(90deg,transparent,rgba(26,86,255,.45),transparent);
  }
  .lg-title-main{
    background:linear-gradient(160deg,rgba(255,255,255,.95) 0%,#ffffff 50%,rgba(200,210,240,.9) 100%);
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    background-clip:text;
  }
  .lg-title-accent{
    background: linear-gradient(110deg, #1A56FF 0%, #6366F1 50%, #0EA5E9 100%);
    background-size: 200% auto;
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    background-clip:text;
    animation: access-glow 4s linear infinite;
  }
  @keyframes access-glow{
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  /* Card */
  .lg-card{background:rgba(8,16,34,.65);backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:28px 32px;position:relative;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.70),0 0 0 1px rgba(26,86,255,.08) inset,0 0 60px rgba(26,86,255,.05);margin-bottom:14px;}
  .lg-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(26,86,255,.5),transparent);}
  .lg-card::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%, rgba(26,86,255,.03) 0%, transparent 60%);pointer-events:none;}

  /* Lockout */
  .lo{position:absolute;inset:0;z-index:20;background:rgba(4,9,18,.96);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);animation:lo-in .3s var(--ease);border-radius:24px;}
  @keyframes lo-in{from{opacity:0;}to{opacity:1;}}
  .lo-inner{text-align:center;}
  .lo-ring{position:relative;width:80px;height:80px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;}
  .lo-count{position:absolute;font-family:var(--fd);font-weight:800;font-size:22px;color:var(--rd);}
  .lo-title{font-family:var(--fd);font-weight:800;font-size:19px;color:#fff;margin-bottom:8px;}
  .lo-sub{font-size:13px;color:var(--mt);line-height:1.6;} .lo-sub b{color:var(--rd);}

  /* Attempts */
  .att{display:flex;align-items:center;gap:10px;margin-bottom:18px;padding:12px 16px;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.12);border-radius:12px;}
  .att-dots{display:flex;gap:6px;}
  .att-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.10);transition:background .3s;}
  .att-on{background:var(--rd);box-shadow:0 0 8px rgba(239,68,68,.4);}
  .att-txt{font-family:var(--fm);font-size:10px;color:rgba(239,68,68,.9);letter-spacing:.04em;display:flex;align-items:center;gap:5px;}

  /* Form */
  .lg-form{display:flex;flex-direction:column;gap:16px;}

  /* Floating input */
  .fi{position:relative;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(0,0,0,.32);transition:all 0.4s var(--ease);overflow:hidden;}
  .fi:focus-within{border-color:rgba(99,102,241,.5);background:rgba(99,102,241,.04);box-shadow:0 0 20px rgba(99,102,241,.15),0 0 0 1px rgba(99,102,241,.1) inset;}
  .fi-err{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.04);}
  .fi-ok:focus-within{border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.04);box-shadow:0 0 20px rgba(16,185,129,.15),0 0 0 1px rgba(16,185,129,.1) inset;}
  .fi-off{opacity:.5;pointer-events:none;}
  .fi-ico{position:absolute;left:16px;top:50%;transform:translateY(-50%);font-size:18px;color:rgba(255,255,255,.3);pointer-events:none;transition:all .3s var(--ease);}
  .fi:focus-within .fi-ico{color:var(--cy);transform:translateY(-50%) scale(1.1);}
  .fi-lbl{position:absolute;left:48px;top:50%;transform:translateY(-50%);font-family:var(--fb);font-size:14px;color:rgba(255,255,255,.4);pointer-events:none;transition:all .3s var(--ease);transform-origin:top left;white-space:nowrap;}
  .fi-lbl-up{transform:translateY(-15px) scale(.8);top:50%;color:rgba(255,255,255,.5);}
  .fi:focus-within .fi-lbl-up{color:var(--cy);}
  .fi-inp{width:100%;padding:24px 16px 8px 48px;background:transparent;border:none;outline:none;color:#fff;font-family:var(--fb);font-size:14px;caret-color:var(--cy);}
  .fi-line{position:absolute;bottom:0;left:50%;width:0;height:2px;background:linear-gradient(90deg,transparent,var(--cy),transparent);transition:width .4s var(--ease),left .4s var(--ease);box-shadow:0 0 10px rgba(99,102,241,.6);}
  .fi:focus-within .fi-line{width:100%;left:0;}
  .fi-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:rgba(255,255,255,.3);font-size:16px;padding:8px;border-radius:8px;transition:all .3s var(--ease);}
  .fi-eye:hover{color:#fff;background:rgba(255,255,255,.08);transform:translateY(-50%) scale(1.1);}

  /* Pwd strength */
  .ps-wrap{display:flex;align-items:center;gap:12px;margin-top:10px;}
  .ps-bars{display:flex;gap:5px;flex:1;}
  .ps-bar{flex:1;height:4px;border-radius:3px;transition:all .4s var(--ease);}
  .ps-lbl{font-family:var(--fb);font-size:11px;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;color:rgba(255,255,255,.5);transition:color .3s;}

  /* Error msg */
  .lg-err{font-family:var(--fb);font-size:11px;color:rgba(239,68,68,.8);margin-top:6px;display:flex;align-items:center;gap:6px;letter-spacing:.02em;padding:6px 10px;background:rgba(239,68,68,.04);border-radius:8px;border:1px solid rgba(239,68,68,.1);}

  /* Row */
  .lg-row{display:flex;align-items:center;justify-content:space-between;margin-top:6px;}
  .lg-check{display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;transition:all .3s var(--ease);}
  .lg-check:hover{opacity:.8;}
  .lg-chk{width:20px;height:20px;border-radius:6px;border:1.5px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:all .3s var(--ease);}
  .lg-chk-on{background:linear-gradient(135deg, #1A56FF 0%, #6366F1 100%);border-color:transparent;box-shadow:0 0 16px rgba(99,102,241,.4);}
  .lg-chk i{font-size:12px;color:#030810;font-weight:bold;}
  .lg-check span{font-size:13px;color:rgba(255,255,255,.5);transition:color .3s;}
  .lg-check:hover span{color:rgba(255,255,255,.7);}
  .lg-forgot{font-size:13px;color:rgba(99,102,241,.7);text-decoration:none;transition:all .3s var(--ease);font-weight:500;}
  .lg-forgot:hover{color:var(--cy);text-shadow:0 0 12px rgba(99,102,241,.5);transform:translateX(2px);}

  /* Submit */
  .lg-btn{width:100%;position:relative;height:54px;border:none;border-radius:14px;background:linear-gradient(135deg, #1A56FF 0%, #6366F1 50%, #0EA5E9 100%);background-size: 200% 200%;color:#030810;font-family:var(--fd);font-weight:700;font-size:15px;cursor:pointer;overflow:hidden;display:flex;align-items:center;justify-content:center;transition:all 0.4s cubic-bezier(.16,1,.3,1);box-shadow:0 8px 32px rgba(99,102,241,.25),0 0 0 1px rgba(255,255,255,.1) inset,0 0 20px rgba(26,86,255,.15);letter-spacing:.02em;margin-top:6px;animation: gradient-shift 8s ease infinite;}
  .lg-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg, rgba(255,255,255,.3) 0%, transparent 50%);opacity:0;transition:opacity 0.4s;}
  .lg-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 40px rgba(99,102,241,.40),0 0 0 1px rgba(255,255,255,.2) inset,0 0 30px rgba(26,86,255,.25);background-position: 100% 100%;color:#000;}
  .lg-btn:hover:not(:disabled)::before{opacity:1;}
  .lg-btn:active:not(:disabled){transform:translateY(0);}
  .lg-btn:disabled{opacity:.6;cursor:not-allowed;transform:none!important;animation:none;}
  .lg-locked{background:rgba(255,255,255,.04);box-shadow:none;border:1px solid var(--br);color:rgba(255,255,255,.35)!important;animation:none;}
  .lg-scanning{background:linear-gradient(135deg,#6366F1 0%,#1A56FF 100%);color:#030810!important;animation:none;}
  .lg-shim{position:absolute;top:0;left:-80%;width:50%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,.25),transparent);transform:skewX(-20deg);pointer-events:none;animation:shim 3.5s ease-in-out infinite;}
  @keyframes shim{0%,85%{left:-80%;}100%{left:180%;}}
  .lg-scanning .lg-shim{animation:scan-p .6s ease-out forwards;}
  @keyframes scan-p{from{left:-80%;}to{left:180%;}}
  @keyframes gradient-shift{0%,100%{background-position: 0% 50%;}50%{background-position: 100% 50%;}}
  .lg-btn-txt{position:relative;z-index:1;display:flex;align-items:center;gap:8px;}
  .lg-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;animation:spin .7s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}

  .lg-copy{text-align:center;font-family:var(--fm);font-size:9px;color:rgba(255,255,255,.12);letter-spacing:.14em;}

  @media(max-width:480px){.lg-left{padding:28px 20px;}.lg-card{padding:20px 16px;}.lg-title{font-size:18px;letter-spacing:.08em;}}
`;