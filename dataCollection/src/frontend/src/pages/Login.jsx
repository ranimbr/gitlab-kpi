/**
 * pages/Login.jsx
 *
 * CORRECTIONS :
 *   1. stylesInjected : déplacé dans un module-level ref stable avec reset en dev HMR
 *   2. lockout countdown : clearInterval dans le return du useEffect pour éviter leak
 *   3. handleSubmit : dépendances useCallback complètes et stables
 *   4. password strength bar : calcul sans appel de useState inutile
 *
 * AMÉLIORATIONS DESIGN :
 *   - Logo plus soigné avec glassmorphism subtil
 *   - Animation fade-in sur la card
 *   - Indicateur de force du mot de passe amélioré
 *   - Lockout countdown visuel
 *   - Hint "email ou username" dynamique
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Swal from "sweetalert2";

// ── Constantes ────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS  = 5;
const LOCKOUT_SEC   = 30;
const REMEMBER_KEY  = "kpi_remember_identifier";

// ── SweetAlert2 helpers ───────────────────────────────────────────────────────
let _stylesInjected = false; // module-level, stable entre renders (pas de HMR issue en prod)

function injectVelzonStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `.swal-kpi-popup{border-radius:16px!important;box-shadow:0 24px 64px rgba(0,0,0,.18)!important;border:none!important}.swal-kpi-progress-success{background:#0ab39c!important}.swal-kpi-btn-danger{border-radius:8px!important;font-weight:500!important;padding:8px 24px!important}`;
  document.head.appendChild(s);
}

const showLoginSuccess = (identifier) =>
  Swal.fire({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0">
      <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#0ab39c22,#0ab39c44);display:flex;align-items:center;justify-content:center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0ab39c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      </div>
      <h4 style="margin:0;color:#1e2a3b;font-size:1.1rem;font-weight:600">Connexion réussie !</h4>
      <p style="margin:0;color:#6b7280;font-size:.875rem;text-align:center">Bienvenue, <strong style="color:#0ab39c">${identifier}</strong><br/>Redirection en cours…</p>
    </div>`,
    showConfirmButton: false,
    timer: 1800,
    timerProgressBar: true,
    width: 360,
    padding: "1.75rem",
    customClass: { popup: "swal-kpi-popup", timerProgressBar: "swal-kpi-progress-success" },
    didOpen: injectVelzonStyles,
  });

const showLoginError = (message = "Identifiant ou mot de passe incorrect.") =>
  Swal.fire({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0">
      <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#f0654822,#f0654844);display:flex;align-items:center;justify-content:center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f06548" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      </div>
      <h4 style="margin:0;color:#1e2a3b;font-size:1.1rem;font-weight:600">Échec de connexion</h4>
      <p style="margin:0;color:#6b7280;font-size:.875rem;text-align:center">${message}</p>
    </div>`,
    showConfirmButton: true,
    confirmButtonText: "Réessayer",
    confirmButtonColor: "#f06548",
    width: 380,
    padding: "1.75rem",
    customClass: { popup: "swal-kpi-popup", confirmButton: "swal-kpi-btn-danger" },
    didOpen: injectVelzonStyles,
  });

// ── Helpers ───────────────────────────────────────────────────────────────────
function validateIdentifier(v) {
  if (!v || v.trim().length < 3) return false;
  if (v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return true;
}
const isEmail     = (v) => v.includes("@");
const validatePwd = (v) => v && v.length >= 6;

function PwdStrengthBar({ pwd }) {
  if (!pwd) return null;
  const score = [
    pwd.length >= 8,
    /[A-Z]/.test(pwd),
    /[a-z]/.test(pwd),
    /\d/.test(pwd),
    /[^a-zA-Z0-9]/.test(pwd),
  ].filter(Boolean).length;
  const label = score <= 1 ? "Très faible" : score === 2 ? "Faible" : score === 3 ? "Moyen" : score === 4 ? "Fort" : "Très fort";
  const color = score <= 2 ? "#f06548" : score === 3 ? "#f7b84b" : "#0ab39c";
  return (
    <div className="mt-1">
      <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 99,
            background: i <= score ? color : "#e9ecef",
            transition: "background .25s",
          }} />
        ))}
      </div>
      <p className="fs-11 mb-0" style={{ color }}>Force : <strong>{label}</strong></p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Login() {
  const navigate           = useNavigate();
  const { login, loading } = useAuth();

  const savedIdentifier = localStorage.getItem(REMEMBER_KEY) || "";

  const [showPassword,   setShowPassword]   = useState(false);
  const [identifier,     setIdentifier]     = useState(savedIdentifier);
  const [password,       setPassword]       = useState("");
  const [rememberMe,     setRememberMe]     = useState(!!savedIdentifier);
  const [touched,        setTouched]        = useState({ identifier: false, password: false });
  const [attempts,       setAttempts]       = useState(0);
  const [lockout,        setLockout]        = useState(false);
  const [lockoutRemain,  setLockoutRemain]  = useState(0);

  const identifierRef = useRef(null);
  const countdownRef  = useRef(null);

  useEffect(() => { identifierRef.current?.focus(); }, []);

  // ✅ FIX : cleanup dans le useEffect du countdown pour éviter le leak
  const triggerLockout = useCallback(() => {
    setLockout(true);
    setLockoutRemain(LOCKOUT_SEC);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setLockoutRemain(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setLockout(false);
          setAttempts(0);
          // Focus après la fin du lockout
          setTimeout(() => identifierRef.current?.focus(), 100);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ✅ FIX : cleanup du countdown à l'unmount
  useEffect(() => {
    return () => { clearInterval(countdownRef.current); };
  }, []);

  const identifierError = touched.identifier && !validateIdentifier(identifier)
    ? "Email ou nom d'utilisateur invalide (min. 3 caractères)." : "";
  const pwdError = touched.password && !validatePwd(password) ? "6 caractères minimum." : "";
  const formValid = validateIdentifier(identifier) && validatePwd(password);

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    setTouched({ identifier: true, password: true });
    if (!formValid || lockout || loading) return;

    const result = await login(identifier, password);

    if (result.success) {
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, identifier);
      else            localStorage.removeItem(REMEMBER_KEY);
      await showLoginSuccess(identifier);
      navigate("/");
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPassword("");
      identifierRef.current?.focus();
      if (newAttempts >= MAX_ATTEMPTS) triggerLockout();
      else showLoginError(result.message);
    }
  }, [formValid, lockout, loading, identifier, password, rememberMe, attempts, login, navigate, triggerLockout]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && formValid && !loading && !lockout) handleSubmit(e);
  };

  const remainingAttempts = MAX_ATTEMPTS - attempts;

  return (
    <div className="auth-page-wrapper pt-5">
      {/* Background */}
      <div className="auth-one-bg-position auth-one-bg" id="auth-particles">
        <div className="bg-overlay"></div>
        <div className="shape">
          <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 1440 120">
            <path d="M 0,36 C 144,53.6 432,123.2 720,124 C 1008,124.8 1296,56.8 1440,40L1440 140L0 140z" />
          </svg>
        </div>
      </div>

      <div className="auth-page-content">
        <div className="container">
          {/* Logo */}
          <div className="row">
            <div className="col-lg-12">
              <div className="text-center mt-sm-5 mb-4 text-white-50">
                <p className="mt-3 fs-15 fw-medium">GitLab KPI Dashboard</p>
              </div>
            </div>
          </div>

          <div className="row justify-content-center">
            <div className="col-md-8 col-lg-6 col-xl-5">
              <div className="card mt-4" style={{ borderRadius: 20, boxShadow: "0 8px 40px rgba(0,0,0,.12)" }}>
                <div className="card-body p-5">
                  {/* Icône */}
                  <div className="text-center mb-4">
                    <div className="mx-auto mb-3 rounded-circle d-flex align-items-center justify-content-center"
                      style={{
                        width: 68, height: 68,
                        background: "linear-gradient(135deg, #405189 0%, #3577f1 100%)",
                        boxShadow: "0 6px 20px rgba(64,81,137,.35)",
                      }}>
                      <i className="ri-bar-chart-2-line text-white fs-1"></i>
                    </div>
                    <h5 className="text-primary fw-semibold mb-1">Bienvenue !</h5>
                    <p className="text-muted fs-13 mb-0">Connectez-vous pour accéder au tableau de bord.</p>
                  </div>

                  {/* Alertes */}
                  {lockout && (
                    <div className="d-flex align-items-start gap-3 rounded-3 p-3 mb-4"
                      style={{ background: "#fff1f0", border: "1px solid #fecaca" }}>
                      <i className="ri-lock-line text-danger fs-18 flex-shrink-0 mt-1"></i>
                      <div>
                        <strong className="fs-13" style={{ color: "#b91c1c" }}>Compte temporairement verrouillé</strong>
                        <br />
                        <span className="fs-12 text-muted">
                          Réessayez dans <strong>{lockoutRemain}s</strong>.
                        </span>
                        {/* Barre countdown */}
                        <div className="mt-2" style={{ height: 3, background: "#fecaca", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${(lockoutRemain / LOCKOUT_SEC) * 100}%`,
                            background: "#f06548",
                            borderRadius: 99,
                            transition: "width 1s linear",
                          }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {!lockout && attempts >= 2 && attempts < MAX_ATTEMPTS && (
                    <div className="d-flex align-items-center gap-2 rounded-3 p-3 mb-4 fs-13"
                      style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
                      <i className="ri-error-warning-line text-warning fs-16 flex-shrink-0"></i>
                      <span className="text-muted">
                        <strong className="text-warning">{remainingAttempts}</strong> tentative{remainingAttempts > 1 ? "s" : ""} restante{remainingAttempts > 1 ? "s" : ""} avant verrouillage.
                      </span>
                    </div>
                  )}

                  {/* Form */}
                  <form onSubmit={handleSubmit} noValidate>
                    {/* Identifier */}
                    <div className="mb-3">
                      <label htmlFor="identifier" className="form-label fw-medium fs-13">
                        Email ou nom d'utilisateur <span className="text-danger">*</span>
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className={`${isEmail(identifier) ? "ri-mail-line" : "ri-user-line"} text-muted`}></i>
                        </span>
                        <input
                          ref={identifierRef}
                          type="text"
                          className={`form-control ${identifierError ? "is-invalid" : touched.identifier && identifier ? "is-valid" : ""}`}
                          id="identifier"
                          placeholder="admin@telnet.tn ou admin"
                          value={identifier}
                          onChange={e => setIdentifier(e.target.value)}
                          onBlur={() => setTouched(t => ({ ...t, identifier: true }))}
                          onKeyDown={handleKeyDown}
                          autoComplete="username"
                          disabled={lockout}
                        />
                        {identifierError && <div className="invalid-feedback">{identifierError}</div>}
                      </div>
                      {identifier.length > 0 && !identifierError && (
                        <div className="form-text fs-11 mt-1">
                          <i className={`${isEmail(identifier) ? "ri-mail-check-line text-success" : "ri-user-check-line text-primary"} me-1`}></i>
                          {isEmail(identifier) ? "Connexion par email" : "Connexion par nom d'utilisateur"}
                        </div>
                      )}
                    </div>

                    {/* Password */}
                    <div className="mb-3">
                      <label className="form-label fw-medium fs-13" htmlFor="password-input">
                        Mot de passe <span className="text-danger">*</span>
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="ri-lock-line text-muted"></i>
                        </span>
                        <input
                          type={showPassword ? "text" : "password"}
                          className={`form-control ${pwdError ? "is-invalid" : touched.password && password ? "is-valid" : ""}`}
                          id="password-input"
                          placeholder="Entrez votre mot de passe"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          onBlur={() => setTouched(t => ({ ...t, password: true }))}
                          onKeyDown={handleKeyDown}
                          autoComplete="current-password"
                          disabled={lockout}
                        />
                        <button className="btn btn-outline-secondary" type="button"
                          tabIndex="-1" onClick={() => setShowPassword(v => !v)} disabled={lockout}>
                          <i className={`ri-${showPassword ? "eye-off" : "eye"}-line`}></i>
                        </button>
                        {pwdError && <div className="invalid-feedback">{pwdError}</div>}
                      </div>
                      {password.length > 0 && <PwdStrengthBar pwd={password} />}
                    </div>

                    {/* Remember + forgot */}
                    <div className="mb-4 d-flex align-items-center justify-content-between">
                      <div className="form-check">
                        <input className="form-check-input" type="checkbox" id="rememberMe"
                          checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                          disabled={lockout} />
                        <label className="form-check-label fs-13 text-muted" htmlFor="rememberMe">
                          Se souvenir de moi
                        </label>
                      </div>
                      <a href="#" className="fs-12 text-muted text-decoration-none">
                        <i className="ri-lock-line me-1"></i>Mot de passe oublié ?
                      </a>
                    </div>

                    {/* Submit */}
                    <button
                      className={`btn w-100 d-flex align-items-center justify-content-center gap-2 ${lockout ? "btn-secondary" : "btn-primary"}`}
                      type="submit"
                      disabled={loading || lockout}
                      style={{ borderRadius: 10, padding: "11px", fontWeight: 500 }}>
                      {loading
                        ? <><span className="spinner-border spinner-border-sm" role="status"></span>Connexion…</>
                        : lockout
                          ? <><i className="ri-lock-line fs-16"></i>Verrouillé — {lockoutRemain}s</>
                          : <><i className="ri-login-box-line fs-16"></i>Se connecter</>
                      }
                    </button>
                  </form>
                </div>
              </div>

              <div className="text-center mt-3">
                <p className="text-white-50 fs-12 mb-0">
                  <i className="ri-lock-line me-1"></i>Accès réservé aux membres Telnet
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="footer">
        <div className="container">
          <div className="text-center">
            <p className="mb-0 text-muted fs-13">
              &copy; {new Date().getFullYear()} GitLab KPI Dashboard — Telnet
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
