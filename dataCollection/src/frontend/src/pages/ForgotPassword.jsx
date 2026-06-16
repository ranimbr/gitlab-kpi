/**
 * ForgotPassword.jsx — TELNET COMMAND · Mot de passe oublié
 * Style cohérent avec Login.jsx (sans vidéo)
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
    @keyframes success-appear {
      0% { transform: scale(0.8); opacity: 0; }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes error-appear {
      0% { transform: scale(0.8); opacity: 0; }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

const toastOk = (msg = "Email envoyé avec succès") => Swal.fire({
  html: `<div style="display:flex;flex-direction:column;align-items:center;gap:18px;padding:12px 0"><div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg, rgba(16,185,129,.15), rgba(16,185,129,.08));display:flex;align-items:center;justify-content:center;border:1px solid rgba(16,185,129,.3);box-shadow:0 0 40px rgba(16,185,129,.3),0 0 0 1px rgba(16,185,129,.2) inset,0 0 35px rgba(16,185,129,.15);animation:success-appear 0.6s var(--ease) forwards"><i class="ri-mail-check-line" style="font-size:2.4rem;color:#10B981"></i></div><div style="text-align:center"><p style="margin:0 0 6px;font-size:1.1rem;font-weight:800;color:#fff">Email envoyé</p><p style="margin:0;color:rgba(255,255,255,.5);font-size:.9rem">${msg}</p></div></div>`,
  showConfirmButton: false, timer: 2500, timerProgressBar: true, width: 380, padding: "2rem",
  customClass: { popup: "sw-p", timerProgressBar: "sw-ok" }, didOpen: injectSwal,
});

const toastErr = (msg = "Une erreur est survenue") => Swal.fire({
  html: `<div style="display:flex;flex-direction:column;align-items:center;gap:18px;padding:12px 0"><div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg, rgba(239,68,68,.15), rgba(239,68,68,.08));display:flex;align-items:center;justify-content:center;border:1px solid rgba(239,68,68,.3);box-shadow:0 0 40px rgba(239,68,68,.3),0 0 0 1px rgba(239,68,68,.2) inset,0 0 35px rgba(239,68,68,.15);animation:error-appear 0.6s var(--ease) forwards"><i class="ri-error-warning-line" style="font-size:2.4rem;color:#ef4444"></i></div><div style="text-align:center"><p style="margin:0 0 6px;font-size:1.1rem;font-weight:800;color:#fff">Erreur</p><p style="margin:0;color:rgba(255,255,255,.5);font-size:.9rem">${msg}</p></div></div>`,
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
  const [userEmail, setUserEmail] = useState("");

  // Récupérer l'email de l'utilisateur connecté au chargement
  useEffect(() => {
    const fetchUserEmail = async () => {
      try {
        // Priorité: email depuis l'URL (venant de Login), puis depuis l'API
        const emailFromUrl = searchParams.get("email");
        if (emailFromUrl) {
          setEmail(emailFromUrl);
          return;
        }

        const user = await authService.getMe();
        if (user?.email) {
          setUserEmail(user.email);
          setEmail(user.email);
        }
      } catch (error) {
        console.error("Failed to fetch user email:", error);
      }
    };
    fetchUserEmail();
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

      <div className="fp-container">
        <Link to="/login" className="fp-back"><i className="ri-arrow-left-s-line" /><span>Retour</span></Link>

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
                  <span className="fp-btn-txt">Retour à la connexion</span>
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
    --bl:#1A56FF;--cy:#00D4FF;--gn:#10B981;--rd:#ef4444;
    --am:#FFB830;--gold:#FFD060;
    --bg:#040912;--bg2:#07101F;--br:rgba(255,255,255,.06);
    --tx:#E2E8F0;--mt:rgba(255,255,255,.35);
    --fd:'Syne',sans-serif;--fm:'DM Mono',monospace;--fb:'Plus Jakarta Sans',sans-serif;
    --ease:cubic-bezier(.16,1,.3,1);
    --grad-accent: linear-gradient(110deg, #FFB830 0%, #FFD060 38%, #00D4FF 100%);
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

  .fp-root{min-height:100vh;background:var(--bg);display:flex;align-items:center;justify-content:center;font-family:var(--fb);color:var(--tx);overflow:hidden;position:relative;}
  
  /* Background pattern - cohérent avec Login */
  .fp-root::before{
    content:'';
    position:absolute;
    inset:0;
    background-image:linear-gradient(rgba(26,86,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(26,86,255,0.015) 1px,transparent 1px);
    background-size:10px 10px;
    pointer-events:none;
  }

  .fp-container{position:relative;z-index:10;width:100%;max-width:480px;padding:40px;}

  /* Back button - cohérent avec Login */
  .fp-back{position:absolute;top:26px;left:26px;display:flex;align-items:center;gap:6px;font-family:var(--fb);font-size:13px;font-weight:500;color:var(--mt);text-decoration:none;padding:8px 14px;border-radius:8px;border:1px solid var(--br);background:rgba(255,255,255,.02);transition:all .2s var(--ease);}
  .fp-back:hover{color:#fff;background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);}

  .fp-wrap{width:100%;}

  /* Brand - cohérent avec Login */
  .fp-brand{text-align:center;margin-bottom:28px;}
  .fp-logo-shell{position:relative;width:88px;height:88px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,rgba(0,212,255,.09),rgba(0,0,0,.60));border-radius:50%;border:1px solid rgba(0,212,255,.20);box-shadow:0 0 28px rgba(0,212,255,.14),0 0 0 6px rgba(0,212,255,.04);}
  .fp-logo{width:54px;height:auto;filter:drop-shadow(0 0 14px rgba(0,212,255,.70));position:relative;z-index:2;}
  .fp-ring{position:absolute;inset:-5px;border-radius:50%;border:1px solid rgba(255,184,48,.22);animation:ring-p 3.2s ease-out infinite;}
  .fp-ring-2{inset:-16px;border-color:rgba(0,212,255,.12);animation-delay:1.1s;}
  .fp-ring-3{inset:-28px;border-color:rgba(255,184,48,.08);animation-delay:2.2s;}
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
  }
  .fp-title::after{
    content:'';
    position:absolute;
    bottom:-8px;
    left:50%;
    transform:translateX(-50%);
    width:40px;
    height:1px;
    background:linear-gradient(90deg,transparent,rgba(0,212,255,.45),transparent);
  }
  .fp-title-main{
    background:linear-gradient(160deg,rgba(255,255,255,.95) 0%,#ffffff 50%,rgba(200,210,240,.9) 100%);
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    background-clip:text;
  }
  .fp-title-accent{
    background: linear-gradient(110deg, #FFB830 0%, #FFD060 40%, #00D4FF 100%);
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

  /* Card - cohérent avec Login */
  .fp-card{background:rgba(8,16,34,.65);backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:44px;position:relative;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.70),0 0 0 1px rgba(26,86,255,.08) inset,0 0 60px rgba(0,212,255,.05);margin-bottom:18px;}
  .fp-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(0,212,255,.5),transparent);}
  .fp-card::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%, rgba(0,212,255,.03) 0%, transparent 60%);pointer-events:none;}

  /* Header */
  .fp-header{text-align:center;margin-bottom:24px;}
  .fp-heading{font-family:var(--fd);font-weight:700;font-size:22px;color:#fff;margin-bottom:8px;}
  .fp-subtitle{font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;}

  /* Alert */
  .fp-alert{display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(255,184,48,.05);border:1px solid rgba(255,184,48,.12);border-radius:12px;margin-bottom:20px;}
  .fp-alert i{font-size:18px;color:var(--am);}
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

  /* Floating input - cohérent avec Login */
  .fi{position:relative;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(0,0,0,.32);transition:all 0.4s var(--ease);overflow:hidden;}
  .fi:focus-within{border-color:rgba(0,212,255,.5);background:rgba(0,212,255,.04);box-shadow:0 0 20px rgba(0,212,255,.15),0 0 0 1px rgba(0,212,255,.1) inset;}
  .fi-err{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.04);}
  .fi-ok:focus-within{border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.04);box-shadow:0 0 20px rgba(16,185,129,.15),0 0 0 1px rgba(16,185,129,.1) inset;}
  .fi-off{opacity:.5;pointer-events:none;}
  .fi-ico{position:absolute;left:16px;top:50%;transform:translateY(-50%);font-size:18px;color:rgba(255,255,255,.3);pointer-events:none;transition:all .3s var(--ease);}
  .fi:focus-within .fi-ico{color:var(--cy);transform:translateY(-50%) scale(1.1);}
  .fi-lbl{position:absolute;left:48px;top:50%;transform:translateY(-50%);font-family:var(--fb);font-size:14px;color:rgba(255,255,255,.4);pointer-events:none;transition:all .3s var(--ease);transform-origin:top left;white-space:nowrap;}
  .fi-lbl-up{transform:translateY(-15px) scale(.8);top:50%;color:rgba(255,255,255,.5);}
  .fi:focus-within .fi-lbl-up{color:var(--cy);}
  .fi-inp{width:100%;padding:24px 16px 8px 48px;background:transparent;border:none;outline:none;color:#fff;font-family:var(--fb);font-size:14px;caret-color:var(--cy);}
  .fi-line{position:absolute;bottom:0;left:50%;width:0;height:2px;background:linear-gradient(90deg,transparent,var(--cy),transparent);transition:width .4s var(--ease),left .4s var(--ease);box-shadow:0 0 10px rgba(0,212,255,.6);}
  .fi:focus-within .fi-line{width:100%;left:0;}

  /* Error msg */
  .fp-err{font-family:var(--fb);font-size:11px;color:rgba(239,68,68,.8);margin-top:6px;display:flex;align-items:center;gap:6px;letter-spacing:.02em;padding:6px 10px;background:rgba(239,68,68,.04);border-radius:8px;border:1px solid rgba(239,68,68,.1);}

  /* Submit button - cohérent avec Login */
  .fp-btn{width:100%;position:relative;height:54px;border:none;border-radius:14px;background:linear-gradient(135deg, #1A56FF 0%, #00D4FF 50%, #FFB830 100%);background-size: 200% 200%;color:#030810;font-family:var(--fd);font-weight:700;font-size:15px;cursor:pointer;overflow:hidden;display:flex;align-items:center;justify-content:center;transition:all 0.4s cubic-bezier(.16,1,.3,1);box-shadow:0 8px 32px rgba(0,212,255,.25),0 0 0 1px rgba(255,255,255,.1) inset,0 0 20px rgba(255,184,48,.15);letter-spacing:.02em;margin-top:6px;animation: gradient-shift 8s ease infinite;}
  .fp-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg, rgba(255,255,255,.3) 0%, transparent 50%);opacity:0;transition:opacity 0.4s;}
  .fp-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,212,255,.40),0 0 0 1px rgba(255,255,255,.2) inset,0 0 30px rgba(255,184,48,.25);background-position: 100% 100%;color:#000;}
  .fp-btn:hover:not(:disabled)::before{opacity:1;}
  .fp-btn:active:not(:disabled){transform:translateY(0);}
  .fp-btn:disabled{opacity:.6;cursor:not-allowed;transform:none!important;animation:none;}
  .fp-locked{background:rgba(255,255,255,.04);box-shadow:none;border:1px solid var(--br);color:rgba(255,255,255,.35)!important;animation:none;}
  .fp-shim{position:absolute;top:0;left:-80%;width:50%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,.25),transparent);transform:skewX(-20deg);pointer-events:none;animation:shim 3.5s ease-in-out infinite;}
  @keyframes shim{0%,85%{left:-80%;}100%{left:-180%;}}
  @keyframes gradient-shift{0%,100%{background-position: 0% 50%;}50%{background-position: 100% 50%;}}
  .fp-btn-txt{position:relative;z-index:1;display:flex;align-items:center;gap:8px;}
  .fp-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;animation:spin .7s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}

  .fp-copy{text-align:center;font-family:var(--fm);font-size:9px;color:rgba(255,255,255,.12);letter-spacing:.14em;}

  @media(max-width:480px){.fp-container{padding:24px 20px;}.fp-card{padding:28px 20px;}.fp-title{font-size:18px;letter-spacing:.08em;}}
`;
