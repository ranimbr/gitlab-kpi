/**
 * pages/Login.jsx
 *
 * PREMIER ENTERPRISE REFACTOR (Orbital Space, Glassmorphism, Syne/DM-Mono Typo)
 * Functional logic (lockout, safety, and handle submit) remains identical.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Swal from "sweetalert2";

// ── Constants ──
const MAX_ATTEMPTS  = 5;
const LOCKOUT_SEC   = 30;
const REMEMBER_KEY  = "kpi_remember_identifier";
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";

// ── SweetAlert2 Premium Styles ──
let _stylesInjected = false;
function injectPremiumStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .swal-kpi-popup { background: rgba(8, 14, 30, 0.98)!important; backdrop-filter: blur(24px)!important; border-radius: 24px!important; box-shadow: 0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(26,86,255,0.2) inset!important; border: 1px solid rgba(255,255,255,0.05)!important; color: #fff!important; font-family: 'Plus Jakarta Sans', sans-serif!important; }
    .swal-kpi-title { font-family: 'Syne', sans-serif!important; font-weight: 800!important; color: #fff!important; }
    .swal-kpi-progress-success { background: #1A56FF!important; }
    .swal-kpi-btn-confirm { border-radius: 12px!important; font-weight: 700!important; padding: 12px 32px!important; background: #1A56FF!important; border: none!important; color: #fff!important; transition: transform 0.2s!important; }
    .swal-kpi-btn-confirm:hover { transform: translateY(-2px)!important; background: #1446D4!important; }
  `;
  document.head.appendChild(s);
}

const showLoginSuccess = (identifier) =>
  Swal.fire({
    title: "Accès Autorisé",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:10px 0">
      <div style="width:80px;height:80px;border-radius:50%;background:rgba(26,86,255,0.1);display:flex;align-items:center;justify-content:center;border:1px solid rgba(26,86,255,0.3);box-shadow:0 0 30px rgba(26,86,255,0.4)">
        <i class="ri-shield-check-line" style="font-size:2.5rem;color:#1A56FF"></i>
      </div>
      <p style="margin:0;color:#9ca3af;font-size:1rem;text-align:center">Bienvenue, <strong style="color:#fff">${identifier}</strong><br/>Chargement de l'environnement R&D…</p>
    </div>`,
    showConfirmButton: false, timer: 2000, timerProgressBar: true, width: 440, padding: "2.5rem",
    customClass: { popup: "swal-kpi-popup", title: "swal-kpi-title", timerProgressBar: "swal-kpi-progress-success" },
    didOpen: injectPremiumStyles,
  });

const showLoginError = (message = "Identification terminal échouée.") =>
  Swal.fire({
    title: "Échec d'Identification",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:10px 0">
      <div style="width:80px;height:80px;border-radius:50%;background:rgba(239,68,68,0.1);display:flex;align-items:center;justify-content:center;border:1px solid rgba(239,68,68,0.3);box-shadow:0 0 30px rgba(239,68,68,0.4)">
        <i class="ri-error-warning-line" style="font-size:2.5rem;color:#ef4444"></i>
      </div>
      <p style="margin:0;color:#9ca3af;font-size:1rem;text-align:center">${message}</p>
    </div>`,
    showConfirmButton: true, confirmButtonText: "Réessayer", width: 440, padding: "2.5rem", buttonsStyling: false,
    customClass: { popup: "swal-kpi-popup", title: "swal-kpi-title", confirmButton: "swal-kpi-btn-confirm" },
    didOpen: injectPremiumStyles,
  });

// ── Components & Helpers ──
const validateIdentifier = (v) => v && v.trim().length >= 3;
const isEmail = (v) => v.includes("@");
const validatePwd = (v) => v && v.length >= 6;

function PwdStrengthBar({ pwd }) {
  if (!pwd) return null;
  const score = [pwd.length >= 8, /[A-Z]/.test(pwd), /[a-z]/.test(pwd), /\d/.test(pwd), /[^a-zA-Z0-9]/.test(pwd)].filter(Boolean).length;
  const label = ["Critique", "Faible", "Modéré", "Sécurisé", "Fort"][score - 1] || "Critique";
  const color = score <= 2 ? "#ef4444" : score === 3 ? "#f59e0b" : "#10B981";
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? color : "rgba(255,255,255,0.05)", transition: "all .3s", boxShadow: i <= score ? `0 0 10px ${color}40` : "none" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "DM Mono" }}>
        <span style={{ color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>Niveau de protection</span>
        <span style={{ color, fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const savedIdentifier = localStorage.getItem(REMEMBER_KEY) || "";

  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState(savedIdentifier);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(!!savedIdentifier);
  const [touched, setTouched] = useState({ identifier: false, password: false });
  const [attempts, setAttempts] = useState(0);
  const [lockout, setLockout] = useState(false);
  const [lockoutRemain, setLockoutRemain] = useState(0);

  const identifierRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    if (!document.getElementById("login-fonts")) {
      const l = document.createElement("link");
      l.id = "login-fonts"; l.rel = "stylesheet"; l.href = FONT_HREF;
      document.head.appendChild(l);
    }
    identifierRef.current?.focus();
    return () => clearInterval(countdownRef.current);
  }, []);

  const triggerLockout = useCallback(() => {
    setLockout(true); setLockoutRemain(LOCKOUT_SEC);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setLockoutRemain(p => {
        if (p <= 1) { clearInterval(countdownRef.current); setLockout(false); setAttempts(0); return 0; }
        return p - 1;
      });
    }, 1000);
  }, []);

  const formValid = validateIdentifier(identifier) && validatePwd(password);

  const handleSubmit = async (e) => {
    e?.preventDefault(); setTouched({ identifier: true, password: true });
    if (!formValid || lockout || loading) return;

    const res = await login(identifier, password);
    if (res.success) {
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, identifier);
      else localStorage.removeItem(REMEMBER_KEY);
      await showLoginSuccess(identifier);
      navigate("/dashboard");
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts); setPassword("");
      if (newAttempts >= MAX_ATTEMPTS) triggerLockout();
      else showLoginError(res.message);
    }
  };

  return (
    <div className="login-root">
      <style>{CSS}</style>
      
      {/* ── BACKGROUND ── */}
      <div className="lp-noise" />
      <div className="lp-orb lp-orb-1" /><div className="lp-orb lp-orb-2" />

      {/* Bouton Retour Landing */}
      <Link to="/" className="btn-back">
        <i className="ri-arrow-left-s-line" /> Retour au site principal
      </Link>

      <div className="login-container">
        {/* Brand Header */}
        <header className="login-header">
          <div className="login-brand-circle">
            <img src="/assets/images/telnet.png" alt="Telnet Logo" className="login-brand-logo" />
            <div className="login-brand-pulse" />
          </div>
          <h1 className="login-title">TELNET <span className="text-accent">Access</span></h1>
          <p className="login-subtitle">Authentification Terminal R&D · KPI Engine</p>
        </header>

        {/* Form Card */}
        <div className="login-card-shell">
          <div className="login-card-glass">
            
            {/* Lockout Notification */}
            {lockout && (
              <div className="lockout-overlay">
                <i className="ri-lock-2-line" />
                <h3>Terminal Verrouillé</h3>
                <p>Trop de tentatives infructueuses. Sécurité activée.</p>
                <div className="lockout-timer">
                  <div className="lt-bar" style={{ width: `${(lockoutRemain / LOCKOUT_SEC) * 100}%` }} />
                  <span>{lockoutRemain}s restantes</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              {/* Field: Identifier */}
              <div className="login-group">
                <label className="login-label">
                  <span>IDENTIFIANT TERMINAL</span>
                  {touched.identifier && validateIdentifier(identifier) && <span className="label-valid">✓ VALIDE</span>}
                </label>
                <div className="login-input-wrap">
                  <i className={`ri-${isEmail(identifier) ? 'mail' : 'user-3'}-line input-icon`} />
                  <input
                    ref={identifierRef}
                    type="text"
                    className={`login-input ${touched.identifier && !validateIdentifier(identifier) ? 'has-error' : ''}`}
                    placeholder="Saisissez votre identifiant..."
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    onBlur={() => setTouched(t => ({ ...t, identifier: true }))}
                    disabled={lockout}
                  />
                  <div className="input-focus-line" />
                </div>
              </div>

              {/* Field: Password */}
              <div className="login-group">
                <div className="label-row">
                  <label className="login-label">CLÉ D'ACCÈS CRYPTÉE</label>
                  <a href="#" className="label-link" tabIndex="-1">Oubliée ?</a>
                </div>
                <div className="login-input-wrap">
                  <i className="ri-lock-password-line input-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    className={`login-input ${touched.password && !validatePwd(password) ? 'has-error' : ''}`}
                    placeholder="Saisissez votre mot de passe..."
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onBlur={() => setTouched(t => ({ ...t, password: true }))}
                    disabled={lockout}
                  />
                  <button type="button" className="input-reveal" onClick={() => setShowPassword(!showPassword)} tabIndex="-1">
                    <i className={`ri-${showPassword ? "eye-off" : "eye"}-line`} />
                  </button>
                  <div className="input-focus-line" />
                </div>
                <PwdStrengthBar pwd={password} />
              </div>

              {/* Checkbox: Remember Me */}
              <div className="login-actions-row">
                <label className="login-check">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} disabled={lockout} />
                  <span className="check-box" />
                  <span className="check-label">Maintenir la session active</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className={`login-btn ${loading ? 'is-loading' : ''} ${lockout ? 'is-disabled' : ''}`}
                disabled={loading || lockout}
              >
                <div className="login-btn-inner">
                  {loading ? (
                    <> <span className="btn-spinner" /> <span>AUTORISATION EN COURS...</span> </>
                  ) : lockout ? (
                    <> <i className="ri-lock-line" /> <span>ACCÈS BLOQUÉ</span> </>
                  ) : (
                    <> <span>ENTRER DANS LE HUB</span> <i className="ri-arrow-right-line" /> </>
                  )}
                </div>
                <div className="login-btn-glow" />
              </button>
            </form>

            <div className="card-footer">
              <i className="ri-shield-keyhole-line" />
              Connexion sécurisée par cryptage AES-256 bits · IP Logged
            </div>
          </div>
          <div className="login-card-outline" />
        </div>
      </div>
      
      <div className="login-footer-copy">© 2026 TELNET HOLDING · TOUS DROITS RÉSERVÉS</div>
    </div>
  );
}

// ── CSS STYLES (MATCHING LANDING PAGE) ──
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .login-root { 
    background: #040912; 
    color: #E2E8F0; 
    font-family: 'Plus Jakarta Sans', sans-serif; 
    min-height: 100vh; 
    overflow: hidden; 
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    justify-content: center;
    position: relative;
    padding: 20px;
  }

  /* Noise & Background */
  .lp-noise { position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0.03; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); background-size: 256px 256px; }
  .lp-orb { position: absolute; border-radius: 50%; filter: blur(140px); pointer-events: none; z-index: 0; opacity: 0.5; }
  .lp-orb-1 { width: 800px; height: 800px; background: radial-gradient(circle, rgba(26,86,255,0.15), transparent 70%); top: -200px; left: -200px; animation: orb-drift 20s ease-in-out infinite alternate; }
  .lp-orb-2 { width: 600px; height: 600px; background: radial-gradient(circle, rgba(16,185,129,0.1), transparent 70%); bottom: -150px; right: -150px; animation: orb-drift 25s ease-in-out infinite alternate-reverse; }
  @keyframes orb-drift { 0% { transform: translate(0, 0); } 100% { transform: translate(60px, 40px); } }

  .login-container { width: 100%; max-width: 480px; position: relative; z-index: 10; transform: translateY(-20px); animation: fadeIn 0.8s cubic-bezier(0.16,1,0.3,1); }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(0); } to { opacity: 1; transform: translateY(-20px); } }

  .btn-back { position: absolute; top: 40px; left: 40px; text-decoration: none; display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.4); font-size: 13px; font-weight: 500; transition: color 0.3s; z-index: 100; }
  .btn-back:hover { color: #fff; }

  /* Header */
  .login-header { text-align: center; margin-bottom: 40px; }
  .login-brand-circle { width: 84px; height: 84px; margin: 0 auto 24px; position: relative; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); border-radius: 50%; border: 1px solid rgba(255,255,255,0.06); }
  .login-brand-logo { width: 60px; height: auto; position: relative; z-index: 2; filter: drop-shadow(0 0 10px rgba(26,86,255,0.4)); }
  .login-brand-pulse { position: absolute; inset: -4px; border-radius: 50%; border: 1px solid rgba(26,86,255,0.2); animation: pulse-border 3s ease-out infinite; }
  @keyframes pulse-border { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }

  .login-title { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 32px; letter-spacing: -0.02em; color: #fff; margin-bottom: 8px; }
  .text-accent { color: #1A56FF; }
  .login-subtitle { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 0.08em; text-transform: uppercase; }

  /* Card */
  .login-card-shell { position: relative; }
  .login-card-glass { 
    background: rgba(8, 14, 30, 0.7); 
    backdrop-filter: blur(32px); -webkit-backdrop-filter: blur(32px);
    border: 1px solid rgba(255,255,255,0.08); 
    border-radius: 28px; 
    padding: 48px; 
    box-shadow: 0 40px 100px rgba(0,0,0,0.6);
    position: relative; overflow: hidden;
  }
  .login-card-outline { position: absolute; inset: -2px; border-radius: 30px; background: linear-gradient(135deg, rgba(26,86,255,0.2), transparent, rgba(16,185,129,0.1)); pointer-events: none; z-index: -1; }

  .login-form { position: relative; z-index: 2; }
  .login-group { margin-bottom: 24px; }
  .login-label { display: flex; justify-content: space-between; font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.3); font-weight: 500; letter-spacing: 0.1em; margin-bottom: 10px; }
  .label-valid { color: #10B981; font-weight: 700; }
  .label-link { text-decoration: none; color: #1A56FF; transition: opacity .2s; }
  .label-link:hover { opacity: 0.8; }

  .login-input-wrap { position: relative; }
  .input-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); font-size: 18px; color: rgba(255,255,255,0.2); pointer-events: none; transition: color .3s; }
  .login-input { 
    width: 100%; 
    background: rgba(0,0,0,0.3); 
    border: 1px solid rgba(255,255,255,0.08); 
    border-radius: 14px; 
    padding: 14px 16px 14px 48px; 
    color: #fff; 
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 15px; 
    outline: none; 
    transition: all 0.3s;
  }
  .login-input::placeholder { color: rgba(255,255,255,0.15); }
  .login-input:focus { border-color: rgba(26,86,255,0.4); background: rgba(0,0,0,0.5); }
  .login-input:focus + .input-icon { color: #1A56FF; }
  .login-input.has-error { border-color: rgba(239,68,68,0.4); }

  .input-focus-line { position: absolute; bottom: 0; left: 50%; width: 0; height: 1px; background: #1A56FF; transition: all 0.4s cubic-bezier(0.16,1,0.3,1); opacity: 0; }
  .login-input:focus ~ .input-focus-line { width: 100%; left: 0; opacity: 1; box-shadow: 0 -2px 10px #1A56FF; }

  .input-reveal { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: rgba(255,255,255,0.2); cursor: pointer; padding: 6px; border-radius: 8px; transition: all .2s; }
  .input-reveal:hover { color: #fff; background: rgba(255,255,255,0.05); }

  /* Checkbox */
  .login-actions-row { margin: 24px 0 32px; }
  .login-check { display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none; width: fit-content; }
  .login-check input { display: none; }
  .check-box { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); position: relative; transition: all .2s; }
  .login-check input:checked + .check-box { background: #1A56FF; border-color: #1A56FF; box-shadow: 0 0 15px rgba(26,86,255,0.4); }
  .login-check input:checked + .check-box::after { content: '✓'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 800; }
  .check-label { font-size: 13px; color: rgba(255,255,255,0.4); font-weight: 500; transition: color .2s; }
  .login-check:hover .check-label { color: #fff; }

  /* Button */
  .login-btn { 
    width: 100%; position: relative; height: 56px; border: none; border-radius: 14px; background: #1A56FF; color: #fff; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; cursor: pointer; overflow: hidden; transition: all .3s; 
    box-shadow: 0 10px 30px rgba(26,86,255,0.3);
  }
  .login-btn-inner { position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; }
  .login-btn:hover:not(:disabled) { background: #1446D4; transform: translateY(-2px); box-shadow: 0 15px 40px rgba(26,86,255,0.4); }
  .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  
  .login-btn-glow { position: absolute; top: 0; left: -100%; width: 50%; height: 100%; background: linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent); transform: skewX(-20deg); transition: 0.5s; }
  .login-btn:hover .login-btn-glow { left: 200%; transition: 0.8s cubic-bezier(0.1,0.5,0.5,1); }

  .btn-spinner { width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Lockout Overlay */
  .lockout-overlay { position: absolute; inset: 0; background: rgba(8,14,30,0.95); z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px; animation: modalIn 0.4s cubic-bezier(0.16,1,0.3,1); }
  @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
  .lockout-overlay i { font-size: 56px; color: #ef4444; margin-bottom: 24px; animation: shake 0.6s infinite alternate; }
  @keyframes shake { from { transform: translateX(-4px); } to { transform: translateX(4px); } }
  .lockout-overlay h3 { font-family: 'Syne', sans-serif; font-size: 24px; margin-bottom: 12px; }
  .lockout-overlay p { font-size: 14px; color: rgba(255,255,255,0.4); margin-bottom: 32px; max-width: 240px; }
  .lockout-timer { width: 100%; max-width: 200px; position: relative; }
  .lt-bar { height: 4px; background: #ef4444; border-radius: 10px; box-shadow: 0 0 15px rgba(239,68,68,0.5); margin-bottom: 12px; transition: width 1s linear; }
  .lockout-timer span { font-family: 'DM Mono', monospace; font-size: 13px; color: #ef4444; font-weight: 700; }

  .card-footer { margin-top: 32px; text-align: center; font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.2); letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .card-footer i { font-size: 12px; color: #10B981; }

  .login-footer-copy { margin-top: 40px; font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.15); letter-spacing: 0.15em; z-index: 10; position: relative; }

  @media (max-width: 480px) {
    .login-card-glass { padding: 32px 24px; }
    .login-title { font-size: 26px; }
    .btn-back { top: 24px; left: 24px; }
  }
`;
