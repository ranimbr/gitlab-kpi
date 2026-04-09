/**
 * Login.jsx — TELNET COMMAND · v3
 *
 * Améliorations vs v2 :
 *   · Inputs à labels flottants (floating label — standard enterprise UX 2024)
 *   · Bouton submit avec shimmer animé + scan effect au clic
 *   · Countdown circulaire SVG pour le lockout (plus premium qu'une barre)
 *   · Dots de tentatives visuels (5 points qui s'éteignent)
 *   · Meilleure hiérarchie — divider gradient latéral plus élaboré
 *   · CSS variables pour la cohérence système
 *   · Logic auth 100% identique (lockout, attempts, SweetAlert2)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Swal from "sweetalert2";
import ThreeLoginBackground from "../components/three/ThreeLoginBackground";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SEC  = 30;
const REMEMBER_KEY = "kpi_remember_identifier";
const FONTS_URL    = "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";

// SweetAlert2 — identique v2
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

const isEmail  = v => v.includes("@");
const validId  = v => v && v.trim().length >= 3;
const validPwd = v => v && v.length >= 6;

// ── Floating Label Input ───────────────────────────────────────────────────────
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

// ── Password Strength ─────────────────────────────────────────────────────────
function PwdStrength({ pwd }) {
  if (!pwd) return null;
  const score = [pwd.length >= 8, /[A-Z]/.test(pwd), /[a-z]/.test(pwd), /\d/.test(pwd), /[^a-zA-Z0-9]/.test(pwd)].filter(Boolean).length;
  const colors = ["#ef4444","#f97316","#f59e0b","#1A56FF","#10B981"];
  const labels = ["Critique","Faible","Moyen","Sécurisé","Excellent"];
  const c = colors[score - 1] || colors[0];
  return (
    <div className="ps-wrap">
      <div className="ps-bars">{[1,2,3,4,5].map(i => <div key={i} className="ps-bar" style={{ background: i <= score ? c : "rgba(255,255,255,.06)", boxShadow: i <= score ? `0 0 7px ${c}55` : "none" }} />)}</div>
      <span className="ps-lbl" style={{ color: c }}><i className="ri-lock-fill" /> {labels[score - 1] || labels[0]}</span>
    </div>
  );
}

// ── Circular Lockout Overlay ──────────────────────────────────────────────────
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

// ── Attempts Indicator ────────────────────────────────────────────────────────
function AttemptsBar({ attempts }) {
  if (attempts < 2) return null;
  return (
    <div className="att">
      <div className="att-dots">{Array.from({ length: MAX_ATTEMPTS }).map((_, i) => <div key={i} className={`att-dot ${i < attempts ? "att-on" : ""}`} />)}</div>
      <span className="att-txt"><i className="ri-alert-line" /> {MAX_ATTEMPTS - attempts} tentative{MAX_ATTEMPTS - attempts > 1 ? "s" : ""} restante{MAX_ATTEMPTS - attempts > 1 ? "s" : ""}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Login() {
  const navigate           = useNavigate();
  const { login, loading } = useAuth();
  const saved              = localStorage.getItem(REMEMBER_KEY) || "";

  const [showPwd,    setShowPwd]    = useState(false);
  const [identifier, setId]         = useState(saved);
  const [password,   setPwd]         = useState("");
  const [remember,   setRemember]    = useState(!!saved);
  const [touched,    setTouched]     = useState({ id: false, pwd: false });
  const [attempts,   setAttempts]    = useState(0);
  const [lockout,    setLockout]     = useState(false);
  const [lockRemain, setLockRemain]  = useState(0);
  const [scanning,   setScanning]    = useState(false);

  const idRef  = useRef(null);
  const cntRef = useRef(null);

  useEffect(() => {
    if (!document.getElementById("lg3-fonts")) {
      const l = Object.assign(document.createElement("link"), { id: "lg3-fonts", rel: "stylesheet", href: FONTS_URL });
      document.head.appendChild(l);
    }
    setTimeout(() => idRef.current?.focus(), 150);
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
      navigate("/developers");
    } else {
      const n = attempts + 1; setAttempts(n); setPwd(""); idRef.current?.focus();
      n >= MAX_ATTEMPTS ? triggerLockout() : toastErr(res.message);
    }
  }, [formOk, lockout, loading, identifier, password, remember, attempts, login, navigate, triggerLockout]);

  const onKey = e => { if (e.key === "Enter" && formOk && !loading && !lockout) handleSubmit(); };

  return (
    <div className="lg-root">
      <style>{CSS}</style>

      {/* ── LEFT: Form ── */}
      <aside className="lg-left">
        <Link to="/" className="lg-back"><i className="ri-arrow-left-s-line" /><span>Accueil</span></Link>

        <div className="lg-wrap">

          {/* Brand */}
          <header className="lg-brand">
            <div className="lg-logo-shell">
              <img src="/assets/images/telnet.png" alt="Telnet" className="lg-logo" />
              <div className="lg-ring lg-ring-1" />
              <div className="lg-ring lg-ring-2" />
            </div>
            <h1 className="lg-title">TELNET <span>Access</span></h1>
           
          </header>

          {/* Card */}
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
                <a href="#" className="lg-forgot" tabIndex={-1}>Oublié ?</a>
              </div>

              <button
                type="submit"
                className={`lg-btn ${lockout ? "lg-locked" : ""} ${scanning ? "lg-scanning" : ""}`}
                disabled={loading || lockout}
                onKeyDown={onKey}
              >
                <span className="lg-shim" />
                <span className="lg-btn-txt">
                  {loading    ? <><span className="lg-spin" /> Vérification…</>
                  : lockout   ? <><i className="ri-lock-2-line" /> Terminal verrouillé</>
                  : scanning  ? <><i className="ri-scan-line" /> Authentification…</>
                  :             <>Entrer dans le Hub <i className="ri-arrow-right-line" /></>}
                </span>
              </button>
            </form>

            
          </div>

          <p className="lg-copy">© 2026 TELNET HOLDING · TOUS DROITS RÉSERVÉS</p>
        </div>
      </aside>

      {/* ── RIGHT: Three.js ── */}
      <div className="lg-right">
        <div className="lg-divider" />
        <ThreeLoginBackground />
       
      </div>
    </div>
  );
}

const CSS = `
  :root{--bl:#1A56FF;--cy:#00D4FF;--gn:#10B981;--rd:#ef4444;--bg:#040912;--bg2:#07101F;--br:rgba(255,255,255,.06);--tx:#E2E8F0;--mt:rgba(255,255,255,.35);--fd:'Syne',sans-serif;--fm:'DM Mono',monospace;--fb:'Plus Jakarta Sans',sans-serif;--ease:cubic-bezier(.16,1,.3,1);}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

  .lg-root{min-height:100vh;background:var(--bg);display:grid;grid-template-columns:480px 1fr;font-family:var(--fb);color:var(--tx);overflow:hidden;}

  /* LEFT */
  .lg-left{background:var(--bg2);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 48px;position:relative;z-index:10;}
  .lg-back{position:absolute;top:26px;left:26px;display:flex;align-items:center;gap:6px;font-family:var(--fb);font-size:13px;font-weight:500;color:var(--mt);text-decoration:none;padding:8px 14px;border-radius:8px;border:1px solid var(--br);background:rgba(255,255,255,.02);transition:all .2s var(--ease);}
  .lg-back:hover{color:#fff;background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);}
  .lg-wrap{width:100%;max-width:400px;}

  /* Brand */
  .lg-brand{text-align:center;margin-bottom:32px;}
  .lg-logo-shell{position:relative;width:90px;height:90px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);border-radius:50%;border:1px solid rgba(255,255,255,.06);}
  .lg-logo{width:58px;height:auto;filter:drop-shadow(0 0 14px rgba(26,86,255,.5));position:relative;z-index:2;}
  .lg-ring{position:absolute;inset:-5px;border-radius:50%;border:1.5px solid rgba(26,86,255,.22);animation:ring-p 3s ease-out infinite;}
  .lg-ring-2{inset:-14px;border-color:rgba(26,86,255,.1);animation-delay:1.5s;}
  @keyframes ring-p{0%{transform:scale(1);opacity:1;}100%{transform:scale(1.4);opacity:0;}}
  .lg-title{font-family:var(--fd);font-weight:800;font-size:28px;letter-spacing:.02em;color:#fff;margin-bottom:6px;}
  .lg-title span{color:var(--bl);}
  .lg-subtitle{font-family:var(--fm);font-size:10px;color:var(--mt);letter-spacing:.12em;text-transform:uppercase;}

  /* Card */
  .lg-card{background:rgba(8,16,34,.65);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border:1px solid var(--br);border-radius:24px;padding:40px;position:relative;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,.5),0 0 0 1px rgba(26,86,255,.06) inset;margin-bottom:18px;}
  .lg-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(26,86,255,.4),transparent);}

  /* Lockout */
  .lo{position:absolute;inset:0;z-index:20;background:rgba(4,9,18,.96);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);animation:lo-in .3s var(--ease);border-radius:24px;}
  @keyframes lo-in{from{opacity:0;}to{opacity:1;}}
  .lo-inner{text-align:center;}
  .lo-ring{position:relative;width:80px;height:80px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;}
  .lo-count{position:absolute;font-family:var(--fd);font-weight:800;font-size:22px;color:var(--rd);}
  .lo-title{font-family:var(--fd);font-weight:800;font-size:19px;color:#fff;margin-bottom:8px;}
  .lo-sub{font-size:13px;color:var(--mt);line-height:1.6;} .lo-sub b{color:var(--rd);}

  /* Attempts */
  .att{display:flex;align-items:center;gap:10px;margin-bottom:18px;padding:10px 14px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.16);border-radius:10px;}
  .att-dots{display:flex;gap:5px;}
  .att-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.12);transition:background .3s;}
  .att-on{background:var(--rd);box-shadow:0 0 6px rgba(239,68,68,.5);}
  .att-txt{font-family:var(--fm);font-size:10px;color:var(--rd);letter-spacing:.04em;display:flex;align-items:center;gap:5px;}

  /* Form */
  .lg-form{display:flex;flex-direction:column;gap:16px;}

  /* Floating input */
  .fi{position:relative;border:1px solid var(--br);border-radius:12px;background:rgba(0,0,0,.28);transition:border-color .2s,background .2s;overflow:hidden;}
  .fi:focus-within{border-color:rgba(26,86,255,.45);background:rgba(26,86,255,.03);}
  .fi-err{border-color:rgba(239,68,68,.4);}
  .fi-ok:focus-within{border-color:rgba(16,185,129,.35);}
  .fi-off{opacity:.5;pointer-events:none;}
  .fi-ico{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:17px;color:var(--mt);pointer-events:none;transition:color .2s;}
  .fi:focus-within .fi-ico{color:var(--bl);}
  .fi-lbl{position:absolute;left:46px;top:50%;transform:translateY(-50%);font-family:var(--fb);font-size:14px;color:var(--mt);pointer-events:none;transition:all .2s var(--ease);transform-origin:top left;white-space:nowrap;}
  .fi-lbl-up{transform:translateY(-100%) scale(.78);top:14px;color:rgba(255,255,255,.42);}
  .fi:focus-within .fi-lbl-up{color:var(--bl);}
  .fi-inp{width:100%;padding:22px 16px 8px 46px;background:transparent;border:none;outline:none;color:#fff;font-family:var(--fb);font-size:14px;caret-color:var(--bl);}
  .fi-line{position:absolute;bottom:0;left:50%;width:0;height:1.5px;background:var(--bl);transition:width .3s var(--ease),left .3s var(--ease);box-shadow:0 0 8px rgba(26,86,255,.55);}
  .fi:focus-within .fi-line{width:100%;left:0;}
  .fi-eye{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--mt);font-size:16px;padding:6px;border-radius:6px;transition:all .2s;}
  .fi-eye:hover{color:#fff;background:rgba(255,255,255,.05);}

  /* Pwd strength */
  .ps-wrap{display:flex;align-items:center;gap:10px;margin-top:8px;}
  .ps-bars{display:flex;gap:4px;flex:1;}
  .ps-bar{flex:1;height:3px;border-radius:2px;transition:background .3s,box-shadow .3s;}
  .ps-lbl{font-family:var(--fm);font-size:10px;font-weight:600;display:flex;align-items:center;gap:4px;white-space:nowrap;}

  /* Error msg */
  .lg-err{font-family:var(--fm);font-size:10px;color:var(--rd);margin-top:5px;display:flex;align-items:center;gap:5px;letter-spacing:.03em;}

  /* Row */
  .lg-row{display:flex;align-items:center;justify-content:space-between;margin-top:4px;}
  .lg-check{display:flex;align-items:center;gap:9px;cursor:pointer;user-select:none;}
  .lg-chk{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--br);background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;transition:all .2s;}
  .lg-chk-on{background:var(--bl);border-color:var(--bl);box-shadow:0 0 12px rgba(26,86,255,.4);}
  .lg-chk i{font-size:11px;color:#fff;}
  .lg-check span{font-size:13px;color:var(--mt);}
  .lg-forgot{font-size:13px;color:rgba(26,86,255,.7);text-decoration:none;transition:color .2s;}
  .lg-forgot:hover{color:var(--bl);}

  /* Submit */
  .lg-btn{width:100%;position:relative;height:52px;border:none;border-radius:12px;background:linear-gradient(135deg,#1A56FF 0%,#0D40CC 100%);color:#fff;font-family:var(--fd);font-weight:700;font-size:15px;cursor:pointer;overflow:hidden;display:flex;align-items:center;justify-content:center;transition:transform .2s var(--ease),box-shadow .2s var(--ease);box-shadow:0 8px 28px rgba(26,86,255,.35),0 1px 0 rgba(255,255,255,.08) inset;letter-spacing:.015em;margin-top:4px;}
  .lg-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 14px 38px rgba(26,86,255,.45),0 1px 0 rgba(255,255,255,.08) inset;}
  .lg-btn:active:not(:disabled){transform:translateY(0);}
  .lg-btn:disabled{opacity:.65;cursor:not-allowed;transform:none!important;}
  .lg-locked{background:rgba(255,255,255,.04);box-shadow:none;border:1px solid var(--br);}
  .lg-scanning{background:linear-gradient(135deg,#0D40CC 0%,#08288A 100%);}
  .lg-shim{position:absolute;top:0;left:-80%;width:50%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,.22),transparent);transform:skewX(-20deg);pointer-events:none;animation:shim 3.5s ease-in-out infinite;}
  @keyframes shim{0%,85%{left:-80%;}100%{left:180%;}}
  .lg-scanning .lg-shim{animation:scan-p .6s ease-out forwards;}
  @keyframes scan-p{from{left:-80%;}to{left:180%;}}
  .lg-btn-txt{position:relative;z-index:1;display:flex;align-items:center;gap:8px;}
  .lg-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;animation:spin .7s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}

  /* Card footer */
  .lg-foot{margin-top:24px;text-align:center;font-family:var(--fm);font-size:9px;color:rgba(255,255,255,.18);letter-spacing:.06em;display:flex;align-items:center;justify-content:center;gap:7px;border-top:1px solid var(--br);padding-top:18px;}
  .lg-copy{text-align:center;font-family:var(--fm);font-size:9px;color:rgba(255,255,255,.12);letter-spacing:.14em;}

  /* RIGHT */
  .lg-right{position:relative;overflow:hidden;background:#020810;}
  .lg-divider{position:absolute;top:0;left:0;bottom:0;width:1px;z-index:5;background:linear-gradient(to bottom,transparent 0%,rgba(26,86,255,.15) 15%,rgba(26,86,255,.5) 50%,rgba(26,86,255,.15) 85%,transparent 100%);box-shadow:1px 0 20px rgba(26,86,255,.12);}
  .lg-right-top{position:absolute;top:30px;left:44px;z-index:10;display:flex;align-items:center;gap:8px;font-family:var(--fm);font-size:10px;color:rgba(255,255,255,.4);letter-spacing:.14em;text-transform:uppercase;}
  .lg-dot{width:6px;height:6px;border-radius:50%;background:var(--bl);box-shadow:0 0 8px var(--bl);animation:ring-p 2s ease-in-out infinite;display:inline-block;}
  .lg-right-bot{position:absolute;bottom:42px;left:44px;z-index:10;}
  .lg-rt{font-family:var(--fd);font-weight:800;font-size:28px;color:rgba(255,255,255,.85);line-height:1.15;letter-spacing:-.01em;margin-bottom:6px;}
  .lg-rs{font-family:var(--fm);font-size:11px;color:rgba(26,86,255,.7);letter-spacing:.08em;}

  @media(max-width:900px){.lg-root{grid-template-columns:1fr;}.lg-right{display:none;}.lg-left{padding:60px 24px;}}
  @media(max-width:480px){.lg-card{padding:28px 20px;}.lg-title{font-size:24px;}}
`;