/**
 * ForgotPassword.jsx — TELNET COMMAND · Mot de passe oublié
 * Cohérence visuelle totale avec Login.jsx (Velzon-style banner + dark card)
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import authService from "../services/authService";

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

const toastOk = (msg = "Email envoyé avec succès") => Swal.fire({
  html: `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:8px 0"><div style="width:76px;height:76px;border-radius:50%;background:rgba(16,185,129,.08);display:flex;align-items:center;justify-content:center;border:1px solid rgba(16,185,129,.25);box-shadow:0 0 32px rgba(16,185,129,.2)"><i class="ri-mail-check-line" style="font-size:2.2rem;color:#10B981"></i></div><div style="text-align:center"><p style="margin:0 0 4px;font-size:1.05rem;font-weight:700;color:#fff">Email envoyé</p><p style="margin:0;color:rgba(255,255,255,.4);font-size:.875rem">${msg}</p></div></div>`,
  showConfirmButton: false, timer: 2500, timerProgressBar: true, width: 380, padding: "2rem",
  customClass: { popup: "sw-p", timerProgressBar: "sw-ok" }, didOpen: injectSwal,
});

const toastErr = (msg = "Une erreur est survenue") => Swal.fire({
  html: `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:8px 0"><div style="width:76px;height:76px;border-radius:50%;background:rgba(239,68,68,.08);display:flex;align-items:center;justify-content:center;border:1px solid rgba(239,68,68,.25)"><i class="ri-close-circle-line" style="font-size:2.2rem;color:#ef4444"></i></div><div style="text-align:center"><p style="margin:0 0 6px;font-size:1.05rem;font-weight:700;color:#fff">Erreur</p><p style="margin:0;color:rgba(255,255,255,.4);font-size:.875rem">${msg}</p></div></div>`,
  confirmButtonText: "Réessayer", width: 380, padding: "2rem", buttonsStyling: false,
  customClass: { popup: "sw-p", confirmButton: "sw-b" }, didOpen: injectSwal,
});

const isValidEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function FloatInput({ label, icon, type = "text", value, onChange, onBlur, error, isValid, disabled, autoComplete }) {
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
      />
      <div className="fi-line" />
    </div>
  );
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const particlesRef = useRef(null);

  useEffect(() => {
    // Load fonts
    if (!document.getElementById("fp3-fonts")) {
      const l = Object.assign(document.createElement("link"), { id: "fp3-fonts", rel: "stylesheet", href: FONTS_URL });
      document.head.appendChild(l);
    }
    // Pre-fill email from URL
    const emailFromUrl = searchParams.get("email");
    if (emailFromUrl) setEmail(emailFromUrl);

    // Particles animation — identical to Login
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
        const count = Math.floor((canvas.width * canvas.height) / 15000);
        for (let i = 0; i < count; i++) particles.push(createParticle());
      };

      const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
          p.x += p.speedX;
          p.y += p.speedY;
          if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
          if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
          ctx.fill();
        });
        animationId = requestAnimationFrame(animate);
      };

      resizeCanvas();
      initParticles();
      animate();

      window.addEventListener('resize', () => { resizeCanvas(); initParticles(); });
      return () => { window.removeEventListener('resize', resizeCanvas); cancelAnimationFrame(animationId); };
    }
  }, [searchParams]);

  const emailOk = isValidEmail(email);
  const formOk = emailOk && !loading;

  const handleSubmit = async e => {
    e?.preventDefault();
    setTouched(true);
    if (!formOk) return;
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSuccess(true);
      await toastOk("Instructions envoyées à votre email");
    } catch (error) {
      console.error("Forgot password error:", error);
      toastErr("Impossible d'envoyer l'email");
    } finally {
      setLoading(false);
    }
  };

  const onKey = e => { if (e.key === "Enter" && formOk) handleSubmit(); };

  return (
    <div className="fp-root">
      <style>{CSS}</style>

      {/* Velzon-style banner — identical to Login */}
      <div className="auth-one-bg-position auth-one-bg" id="auth-particles">
        <div className="bg-overlay" />
        <canvas ref={particlesRef} className="particles-canvas" />
        <div className="shape">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 120">
            <path d="M 0,36 C 144,53.6 432,123.2 720,124 C 1008,124.8 1296,56.8 1440,40L1440 140L0 140z"></path>
          </svg>
        </div>
      </div>

      <div className="fp-left">
        <Link to="/login" className="fp-back"><i className="ri-arrow-left-s-line" /><span>Connexion</span></Link>

        <div className="fp-wrap">
          <header className="fp-brand">
            <div className="fp-logo-shell">
              <img src="/assets/images/telnet.png" alt="Telnet" className="fp-logo" />
              <div className="fp-ring fp-ring-1" />
              <div className="fp-ring fp-ring-2" />
              <div className="fp-ring fp-ring-3" />
            </div>
            <h1 className="fp-title">
              <span className="fp-title-main">TELNET</span>
              <span className="fp-title-accent">Recovery</span>
            </h1>
          </header>

          <div className="fp-card">
            {success ? (
              <div className="fp-success">
                <div className="fp-success-icon">
                  <i className="ri-mail-check-line" />
                </div>
                <h2 className="fp-success-title">Email envoyé!</h2>
                <p className="fp-success-text">
                  Si un compte existe avec cet email, vous recevrez des instructions pour réinitialiser votre mot de passe.
                </p>
                <div className="fp-success-note">
                  <i className="ri-information-line" />
                  <span>Vérifiez votre dossier spam si vous ne voyez pas l'email.</span>
                </div>
                <button onClick={() => navigate("/login")} className="fp-btn">
                  <span className="fp-shim" />
                  <span className="fp-btn-txt">Retour à la connexion <i className="ri-arrow-right-line" /></span>
                </button>
              </div>
            ) : (
              <>
                <div className="fp-header">
                  <h2 className="fp-heading">Mot de passe oublié?</h2>
                  <p className="fp-subtitle">Entrez votre email pour recevoir un lien de réinitialisation</p>
                </div>

                <div className="fp-alert">
                  <i className="ri-information-line" />
                  <span>Les instructions seront envoyées à votre adresse email</span>
                </div>

                <form onSubmit={handleSubmit} noValidate className="fp-form">
                  <FloatInput
                    label="Adresse email"
                    icon="ri-mail-line"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onBlur={() => setTouched(true)}
                    error={touched && !emailOk}
                    isValid={touched && emailOk}
                    disabled={loading}
                    autoComplete="email"
                  />
                  {touched && !emailOk && <p className="fp-err"><i className="ri-error-warning-line" />Email invalide</p>}

                  <button
                    type="submit"
                    className={`fp-btn ${loading ? "fp-locked" : ""}`}
                    disabled={loading}
                    onKeyDown={onKey}
                  >
                    <span className="fp-shim" />
                    <span className="fp-btn-txt">
                      {loading ? <><span className="fp-spin" /> Envoi en cours...</> : <>Envoyer le lien <i className="ri-send-plane-line" /></>}
                    </span>
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="fp-copy">© 2026 TELNET HOLDING · TOUS DROITS RÉSERVÉS</p>
        </div>
      </div>

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

  .fp-root{min-height:100vh;background:#f3f3f9;display:flex;align-items:center;justify-content:center;font-family:var(--fb);color:var(--tx);overflow:hidden;padding:40px 24px;position:relative;}

  /* Background - Velzon style (identical to Login) */
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

  /* Card container — same as .lg-left */
  .fp-left{background:var(--bg2);background-image:linear-gradient(rgba(26,86,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(26,86,255,0.015) 1px,transparent 1px);background-size:10px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:44px 40px;position:relative;z-index:10;border-radius:24px;max-width:440px;width:100%;box-shadow:0 40px 100px rgba(0,0,0,.70),0 0 0 1px rgba(26,86,255,.08) inset;}
  .fp-back{position:absolute;top:26px;left:26px;display:flex;align-items:center;gap:6px;font-family:var(--fb);font-size:13px;font-weight:500;color:var(--mt);text-decoration:none;padding:8px 14px;border-radius:8px;border:1px solid var(--br);background:rgba(255,255,255,.02);transition:all .2s var(--ease);}
  .fp-back:hover{color:#fff;background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);}
  .fp-wrap{width:100%;max-width:420px;}

  /* Brand */
  .fp-brand{text-align:center;margin-bottom:20px;}
  .fp-logo-shell{position:relative;width:72px;height:72px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,rgba(26,86,255,.09),rgba(0,0,0,.60));border-radius:50%;border:1px solid rgba(26,86,255,.20);box-shadow:0 0 28px rgba(26,86,255,.14),0 0 0 6px rgba(26,86,255,.04);}
  .fp-logo{width:44px;height:auto;filter:drop-shadow(0 0 14px rgba(26,86,255,.70));position:relative;z-index:2;}
  .fp-ring{position:absolute;inset:-5px;border-radius:50%;border:1px solid rgba(99,102,241,.22);animation:ring-p 3.2s ease-out infinite;}
  .fp-ring-2{inset:-16px;border-color:rgba(26,86,255,.12);animation-delay:1.1s;}
  .fp-ring-3{inset:-28px;border-color:rgba(99,102,241,.08);animation-delay:2.2s;}
  @keyframes ring-p{0%{transform:scale(1);opacity:1;}100%{transform:scale(1.45);opacity:0;}}

  .fp-title{
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
  .fp-title::after{
    content:'';
    position:absolute;
    bottom:-8px;
    left:50%;
    transform:translateX(-50%);
    width:40px;
    height:1px;
    background:linear-gradient(90deg,transparent,rgba(26,86,255,.45),transparent);
  }
  .fp-title-main{
    background:linear-gradient(160deg,rgba(255,255,255,.95) 0%,#ffffff 50%,rgba(200,210,240,.9) 100%);
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    background-clip:text;
  }
  .fp-title-accent{
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
  .fp-card{background:rgba(8,16,34,.65);backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:32px;position:relative;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.70),0 0 0 1px rgba(26,86,255,.08) inset,0 0 60px rgba(26,86,255,.05);margin-bottom:14px;}
  .fp-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(26,86,255,.5),transparent);}
  .fp-card::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%, rgba(26,86,255,.03) 0%, transparent 60%);pointer-events:none;}

  /* Header */
  .fp-header{text-align:center;margin-bottom:18px;}
  .fp-heading{font-family:var(--fd);font-weight:700;font-size:22px;color:#fff;margin-bottom:8px;}
  .fp-subtitle{font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;}

  /* Alert */
  .fp-alert{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(26,86,255,.05);border:1px solid rgba(26,86,255,.12);border-radius:12px;margin-bottom:16px;}
  .fp-alert i{font-size:18px;color:var(--bl);}
  .fp-alert span{font-size:12px;color:rgba(255,255,255,.7);}

  /* Success State */
  .fp-success{text-align:center;padding:20px 0;}
  .fp-success-icon{width:80px;height:80px;margin:0 auto 20px;border-radius:50%;background:rgba(16,185,129,.08);display:flex;align-items:center;justify-content:center;border:1px solid rgba(16,185,129,.25);box-shadow:0 0 32px rgba(16,185,129,.2);}
  .fp-success-icon i{font-size:2.5rem;color:#10B981;}
  .fp-success-title{font-family:var(--fd);font-weight:700;font-size:22px;color:#fff;margin-bottom:12px;}
  .fp-success-text{font-size:14px;color:rgba(255,255,255,.6);line-height:1.7;margin-bottom:20px;}
  .fp-success-note{display:flex;align-items:center;gap:8px;padding:12px;background:rgba(26,86,255,.05);border:1px solid rgba(26,86,255,.12);border-radius:10px;margin-bottom:24px;}
  .fp-success-note i{font-size:16px;color:var(--bl);}
  .fp-success-note span{font-size:12px;color:rgba(255,255,255,.6);}

  /* Form */
  .fp-form{display:flex;flex-direction:column;gap:16px;}

  /* Floating input — identical to Login */
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

  /* Error msg */
  .fp-err{font-family:var(--fb);font-size:11px;color:rgba(239,68,68,.8);margin-top:6px;display:flex;align-items:center;gap:6px;letter-spacing:.02em;padding:6px 10px;background:rgba(239,68,68,.04);border-radius:8px;border:1px solid rgba(239,68,68,.1);}

  /* Submit button — identical to Login */
  .fp-btn{width:100%;position:relative;height:54px;border:none;border-radius:14px;background:linear-gradient(135deg, #1A56FF 0%, #6366F1 50%, #0EA5E9 100%);background-size: 200% 200%;color:#030810;font-family:var(--fd);font-weight:700;font-size:15px;cursor:pointer;overflow:hidden;display:flex;align-items:center;justify-content:center;transition:all 0.4s cubic-bezier(.16,1,.3,1);box-shadow:0 8px 32px rgba(99,102,241,.25),0 0 0 1px rgba(255,255,255,.1) inset,0 0 20px rgba(26,86,255,.15);letter-spacing:.02em;margin-top:6px;animation: gradient-shift 8s ease infinite;text-decoration:none;}
  .fp-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg, rgba(255,255,255,.3) 0%, transparent 50%);opacity:0;transition:opacity 0.4s;}
  .fp-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 40px rgba(99,102,241,.40),0 0 0 1px rgba(255,255,255,.2) inset,0 0 30px rgba(26,86,255,.25);background-position: 100% 100%;color:#000;}
  .fp-btn:hover:not(:disabled)::before{opacity:1;}
  .fp-btn:active:not(:disabled){transform:translateY(0);}
  .fp-btn:disabled{opacity:.6;cursor:not-allowed;transform:none!important;animation:none;}
  .fp-locked{background:rgba(255,255,255,.04);box-shadow:none;border:1px solid var(--br);color:rgba(255,255,255,.35)!important;animation:none;}
  .fp-shim{position:absolute;top:0;left:-80%;width:50%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,.25),transparent);transform:skewX(-20deg);pointer-events:none;animation:shim 3.5s ease-in-out infinite;}
  @keyframes shim{0%,85%{left:-80%;}100%{left:180%;}}
  @keyframes gradient-shift{0%,100%{background-position: 0% 50%;}50%{background-position: 100% 50%;}}
  .fp-btn-txt{position:relative;z-index:1;display:flex;align-items:center;gap:8px;}
  .fp-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;animation:spin .7s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}

  .fp-copy{text-align:center;font-family:var(--fm);font-size:9px;color:rgba(255,255,255,.12);letter-spacing:.14em;}

  @media(max-width:480px){.fp-left{padding:28px 20px;}.fp-card{padding:22px 16px;}.fp-title{font-size:18px;letter-spacing:.08em;}}
`;
