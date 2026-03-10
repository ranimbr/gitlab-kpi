import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Swal from "sweetalert2";

// ── SweetAlert helpers ────────────────────────────────────────────────────────
const showLoginSuccess = (email) =>
  Swal.fire({
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0">
        <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#0ab39c22,#0ab39c44);display:flex;align-items:center;justify-content:center">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#0ab39c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h4 style="margin:0;color:#343a40;font-size:1.15rem;font-weight:600">Connexion réussie !</h4>
        <p style="margin:0;color:#878a99;font-size:.875rem">
          Bienvenue, <strong style="color:#0ab39c">${email}</strong><br/>
          Redirection vers le tableau de bord…
        </p>
      </div>`,
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
    width: 380,
    padding: "2rem",
    backdrop: "rgba(0,0,0,0.4)",
    customClass: { popup: "swal-velzon-popup", timerProgressBar: "swal-velzon-progress-success" },
    didOpen: injectVelzonStyles,
  });

const showLoginError = (message = "Email ou mot de passe incorrect.") =>
  Swal.fire({
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0">
        <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#f0654822,#f0654844);display:flex;align-items:center;justify-content:center">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#f06548" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h4 style="margin:0;color:#343a40;font-size:1.15rem;font-weight:600">Échec de connexion</h4>
        <p style="margin:0;color:#878a99;font-size:.875rem;text-align:center">${message}</p>
        <div style="background:#fff5f5;border:1px solid #f8d7da;border-radius:8px;padding:10px 16px;width:100%;box-sizing:border-box">
          <p style="margin:0;color:#842029;font-size:.8rem;display:flex;align-items:center;gap:6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#842029" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Vérifiez vos identifiants et réessayez.
          </p>
        </div>
      </div>`,
    showConfirmButton: true,
    confirmButtonText: "Réessayer",
    confirmButtonColor: "#f06548",
    width: 400,
    padding: "2rem",
    backdrop: "rgba(0,0,0,0.4)",
    customClass: { popup: "swal-velzon-popup", confirmButton: "swal-velzon-btn-danger" },
    didOpen: injectVelzonStyles,
  });

let stylesInjected = false;
function injectVelzonStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .swal-velzon-popup {
      border-radius: 16px !important;
      box-shadow: 0 24px 64px rgba(0,0,0,.18) !important;
      border: none !important;
      font-family: 'Poppins','Nunito',system-ui,sans-serif !important;
    }
    .swal-velzon-progress-success { background: #0ab39c !important; }
    .swal-velzon-btn-danger {
      border-radius: 8px !important;
      font-weight: 500 !important;
      font-size: .875rem !important;
      padding: 8px 24px !important;
      box-shadow: 0 4px 12px rgba(240,101,72,.35) !important;
    }
    .swal-velzon-btn-danger:hover {
      transform: translateY(-1px) !important;
      box-shadow: 0 6px 16px rgba(240,101,72,.45) !important;
    }
  `;
  document.head.appendChild(s);
}

// ── Validation inline ─────────────────────────────────────────────────────────
const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validatePwd   = (v) => v.length >= 6;

// ─────────────────────────────────────────────────────────────────────────────
export default function Login() {
  const navigate        = useNavigate();
  const { login, loading } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");

  // [NEW] Validation inline
  const [touched, setTouched] = useState({ email: false, password: false });
  const [attempts, setAttempts] = useState(0);  // [NEW] compteur d'échecs

  const emailRef = useRef(null);

  // [NEW] Focus auto sur le champ email au montage
  useEffect(() => { emailRef.current?.focus(); }, []);

  const emailError = touched.email    && !validateEmail(email)   ? "Email invalide."               : "";
  const pwdError   = touched.password && !validatePwd(password)  ? "6 caractères minimum."         : "";
  const formValid  = validateEmail(email) && validatePwd(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!formValid) return;

    const result = await login(email, password);
    if (result.success) {
      await showLoginSuccess(email);
      navigate("/dashboard");
    } else {
      setAttempts((n) => n + 1);
      setPassword("");             // [NEW] vide le mot de passe après échec
      showLoginError(result.message);
    }
  };

  // [NEW] Soumission par Entrée
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && formValid && !loading) handleSubmit(e);
  };

  return (
    <div className="auth-page-wrapper pt-5">
      {/* Background */}
      <div className="auth-one-bg-position auth-one-bg" id="auth-particles">
        <div className="bg-overlay"></div>
        <div className="shape">
          <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 1440 120">
            <path d="M 0,36 C 144,53.6 432,123.2 720,124 C 1008,124.8 1296,56.8 1440,40L1440 140L0 140z"></path>
          </svg>
        </div>
      </div>

      <div className="auth-page-content">
        <div className="container">

          {/* Titre */}
          <div className="row">
            <div className="col-lg-12">
              <div className="text-center mt-sm-5 mb-4 text-white-50">
                <p className="mt-3 fs-15 fw-medium">GitLab KPI Dashboard</p>
              </div>
            </div>
          </div>

          <div className="row justify-content-center">
            <div className="col-md-8 col-lg-6 col-xl-5">
              <div className="card mt-4" style={{ borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,.10)" }}>
                <div className="card-body p-4">

                  {/* Header */}
                  <div className="text-center mt-2 mb-1">
                    {/* [NEW] Icône avatar Telnet */}
                    <div
                      className="mx-auto mb-3 rounded-circle d-flex align-items-center justify-content-center"
                      style={{
                        width: 64, height: 64,
                        background: "linear-gradient(135deg,#405189 0%,#3577f1 100%)",
                        boxShadow: "0 4px 16px rgba(64,81,137,.35)",
                      }}
                    >
                      <i className="ri-bar-chart-2-line text-white fs-2"></i>
                    </div>
                    <h5 className="text-primary fw-semibold">Bienvenue !</h5>
                    <p className="text-muted fs-13">Connectez-vous pour accéder au tableau de bord.</p>
                  </div>

                  {/* [NEW] Bandeau d'avertissement après 3 échecs */}
                  {attempts >= 3 && (
                    <div className="alert alert-warning d-flex align-items-center gap-2 py-2 fs-13 mb-3">
                      <i className="ri-error-warning-line fs-16 flex-shrink-0"></i>
                      <span>
                        Trop de tentatives échouées. Vérifiez vos identifiants ou contactez l'administrateur.
                      </span>
                    </div>
                  )}

                  <div className="p-2 mt-3">
                    <form onSubmit={handleSubmit} noValidate>

                      {/* Email */}
                      <div className="mb-3">
                        <label htmlFor="email" className="form-label fw-medium fs-13">
                          Email <span className="text-danger">*</span>
                        </label>
                        <div className="input-group">
                          <span className="input-group-text"><i className="ri-mail-line text-muted"></i></span>
                          <input
                            ref={emailRef}
                            type="email"
                            className={`form-control ${emailError ? "is-invalid" : touched.email && email ? "is-valid" : ""}`}
                            id="email"
                            placeholder="admin@telnet.tn"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                            onKeyDown={handleKeyDown}
                            autoComplete="email"
                            required
                          />
                          {emailError && <div className="invalid-feedback">{emailError}</div>}
                        </div>
                      </div>

                      {/* Mot de passe */}
                      <div className="mb-3">
                        <label className="form-label fw-medium fs-13" htmlFor="password-input">
                          Mot de passe <span className="text-danger">*</span>
                        </label>
                        <div className="input-group">
                          <span className="input-group-text"><i className="ri-lock-line text-muted"></i></span>
                          <input
                            type={showPassword ? "text" : "password"}
                            className={`form-control ${pwdError ? "is-invalid" : touched.password && password ? "is-valid" : ""}`}
                            id="password-input"
                            placeholder="Entrez votre mot de passe"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                            onKeyDown={handleKeyDown}
                            autoComplete="current-password"
                            required
                          />
                          <button
                            className="btn btn-outline-secondary"
                            type="button"
                            tabIndex="-1"
                            onClick={() => setShowPassword((v) => !v)}
                            title={showPassword ? "Masquer" : "Afficher"}
                          >
                            <i className={`ri-${showPassword ? "eye-off" : "eye"}-line`}></i>
                          </button>
                          {pwdError && <div className="invalid-feedback">{pwdError}</div>}
                        </div>
                      </div>

                      {/* [NEW] Barre de force du mot de passe (feedback visuel) */}
                      {password.length > 0 && (
                        <div className="mb-3">
                          <div style={{ height: 4, borderRadius: 99, background: "#e9ecef", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              borderRadius: 99,
                              transition: "width .3s, background .3s",
                              width:
                                password.length < 6  ? "25%"  :
                                password.length < 10 ? "60%"  : "100%",
                              background:
                                password.length < 6  ? "#f06548" :
                                password.length < 10 ? "#f7b84b" : "#0ab39c",
                            }}></div>
                          </div>
                          <p className="fs-11 text-muted mb-0 mt-1">
                            Force :{" "}
                            <span style={{
                              color:
                                password.length < 6  ? "#f06548" :
                                password.length < 10 ? "#f7b84b" : "#0ab39c",
                              fontWeight: 600,
                            }}>
                              {password.length < 6 ? "Trop court" : password.length < 10 ? "Moyen" : "Fort"}
                            </span>
                          </p>
                        </div>
                      )}

                      {/* Bouton submit */}
                      <div className="mt-4">
                        <button
                          className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                          type="submit"
                          disabled={loading}
                          style={{ borderRadius: 8, padding: "10px", fontWeight: 500 }}
                        >
                          {loading ? (
                            <>
                              <span className="spinner-border spinner-border-sm" role="status"></span>
                              Connexion en cours...
                            </>
                          ) : (
                            <>
                              <i className="ri-login-box-line fs-16"></i>
                              Se connecter
                            </>
                          )}
                        </button>
                      </div>

                    </form>
                  </div>

                </div>
              </div>

              {/* [NEW] Hint discret sous la card */}
              <div className="text-center mt-3">
                <p className="text-white-50 fs-12 mb-0">
                  <i className="ri-lock-line me-1"></i>
                  Accès réservé aux membres Telnet
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
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
