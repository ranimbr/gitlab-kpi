# Documentation des Flux d'Authentification

## Table des matières
1. [Flux de Connexion (LOGIN)](#1-flux-de-connexion-login)
2. [Flux Mot de Passe Oublié (FORGOT PASSWORD)](#2-flux-mot-de-passe-oublie-forgot-password)
3. [Flux Réinitialisation Mot de Passe (RESET PASSWORD)](#3-flux-réinitialisation-mot-de-passe-reset-password)
4. [Architecture Multi-Tenant](#4-architecture-multi-tenant)
5. [Sécurité Implémentée](#5-sécurité-implémentée)

---

## 1. Flux de Connexion (LOGIN)

### Étape 1: Saisie des identifiants (Frontend)

**Fichier:** `dataCollection/src/frontend/src/pages/Login.jsx`

L'utilisateur saisit son identifiant (email ou username) et son mot de passe dans le formulaire.

**Lignes 113-126:** Initialisation des états
```javascript
const [identifier, setId] = useState(saved);
const [password, setPwd] = useState("");
const [remember, setRemember] = useState(!!saved);
const [touched, setTouched] = useState({ id: false, pwd: false });
const [attempts, setAttempts] = useState(0);
const [lockout, setLockout] = useState(false);
```

**Lignes 154-172:** Fonction de soumission du formulaire
```javascript
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
```

**Fonctionnalités gérées:**
- Validation des champs (min 3 caractères pour l'identifiant, min 6 pour le mot de passe)
- Indicateur de force du mot de passe (lignes 66-78)
- Gestion des tentatives (max 5 avant verrouillage de 30 secondes, lignes 143-152)
- Option "Maintenir la session" (localStorage, ligne 165)

---

### Étape 2: Appel au service d'authentification

**Fichier:** `dataCollection/src/frontend/src/services/authService.js`

**Ligne 163 dans Login.jsx:** Appel à la fonction login
```javascript
const res = await login(identifier, password);
```

**Lignes 31-71 dans authService.js:** Fonction login()
```javascript
login: async (identifier, password) => {
  const isEmail = identifier.includes("@");

  // Tentative 1 : JSON (backend custom)
  let response;
  try {
    const jsonPayload = isEmail
      ? { email: identifier, password }
      : { username: identifier, password };

    response = await api.post("/auth/login", jsonPayload);
  } catch (err) {
    // [FIX-1] Si 422 → backend attend OAuth2 form-urlencoded
    if (err.response?.status === 422) {
      const formData = new URLSearchParams();
      formData.append("username", identifier); // OAuth2 utilise toujours "username"
      formData.append("password", password);

      response = await api.post("/auth/login", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } else {
      throw err;
    }
  }

  const { access_token, expires_in } = response.data;

  if (!access_token) {
    throw new Error("Réponse du serveur invalide : token manquant.");
  }

  localStorage.setItem("access_token", access_token);
  if (expires_in) {
    const expiresAt = Date.now() + expires_in * 1000;
    localStorage.setItem("token_expires_at", String(expiresAt));
  }

  _meCacheData = null; // invalider le cache me
  return response.data;
},
```

**Logique:**
1. Détermine si l'identifiant est un email (contient "@")
2. **Tentative 1:** Envoie en JSON avec `{email, password}` ou `{username, password}`
3. **Tentative 2 (fallback):** Si erreur 422, renvoie en form-urlencoded OAuth2 standard
4. Stocke le token JWT et l'expiration dans localStorage (lignes 63-67)

---

### Étape 3: Traitement Backend

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py`

**Lignes 94-184:** Endpoint POST /auth/login
```python
@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, raw_request: Request, db: Session = Depends(get_auth_db)):
    user = None
    max_attempts = max(1, settings.LOGIN_MAX_ATTEMPTS)
    lock_seconds = max(1, settings.LOGIN_LOCK_SECONDS)
    login_hint = request.username or request.email or "unknown"
    bucket_key = _login_bucket_key(raw_request, login_hint)

    if _is_rate_limited(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds):
        raise _http_error(429, "AUTH_TOO_MANY_ATTEMPTS", "Too many login attempts. Retry later.")

    # ✅ ARCHITECTURE MULTI-TENANT: Authentification uniquement dans auth_db
    # Lookup par email (prioritaire)
    if request.email:
        user = repo.get_by_email(db, request.email)

    # Fallback sur username/login
    if not user and request.username:
        user = repo.get_by_login(db, request.username)

    # Fallback : email fourni sans @  → traité comme login
    if not user and request.email and "@" not in request.email:
        user = repo.get_by_login(db, request.email)

    if not user or not verify_password(request.password, user.hashed_password):
        _register_failed_attempt(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds)
        raise _http_error(status.HTTP_401_UNAUTHORIZED, "AUTH_INVALID_CREDENTIALS", "Invalid credentials")

    if not user.is_active:
        _register_failed_attempt(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds)
        raise _http_error(status.HTTP_403_FORBIDDEN, "AUTH_USER_INACTIVE", "User account is inactive")

    # ✅ ARCHITECTURE MULTI-TENANT: Charger les données tenant après authentification
    # Charger les assignations multi-sites/multi-équipes/multi-projets depuis la base tenant courante
    from app.database.session import get_db as get_tenant_db
    from app.repositories.user_site_access_repository import UserSiteAccessRepository
    from app.repositories.user_group_access_repository import UserGroupAccessRepository
    from app.repositories.user_project_access_repository import UserProjectAccessRepository
    try:
        tenant_db = next(get_tenant_db())
        tenant_user = repo.get_by_id(tenant_db, user.id)
        if tenant_user:
            # Fusionner les données tenant avec l'utilisateur auth
            user.site_id = tenant_user.site_id
            user.group_id = tenant_user.group_id
            
            # ✅ FIX : Charger les assignations depuis les tables d'accès multi-tenant
            site_access_repo = UserSiteAccessRepository()
            group_access_repo = UserGroupAccessRepository()
            project_access_repo = UserProjectAccessRepository()
            
            try:
                site_accesses = site_access_repo.get_by_user_id(tenant_db, user.id)
                user._site_accesses = site_accesses
            except Exception:
                user._site_accesses = []
            
            try:
                group_accesses = group_access_repo.get_by_user_id(tenant_db, user.id)
                user._group_accesses = group_accesses
            except Exception:
                user._group_accesses = []
            
            try:
                project_accesses = project_access_repo.get_by_user_id(tenant_db, user.id)
                user._project_accesses = project_accesses
            except Exception:
                user._project_accesses = []
        tenant_db.close()
    except Exception as e:
        logger.warning(f"Failed to load tenant data for user {user.id}: {e}")

    access_token = create_access_token(
        data           = {
            "sub": str(user.id), 
            "role": user.role,
            "name": user.name,
            "email": user.email,
            "site_id": user.site_id,
            "group_id": user.group_id,
            "project_ids": user.project_ids if user.is_project_manager else None
        },
        expires_delta  = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    _reset_attempts(bucket_key)
    logger.info(f"Login success — user id={user.id} role={user.role}")
    return TokenResponse(
        access_token = access_token,
        expires_in   = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
```

**Fonctions de rate limiting (lignes 39-67):**
```python
def _is_rate_limited(key: str, max_attempts: int, lock_seconds: int) -> bool:
    now = time.time()
    with _LOGIN_GUARD:
        state = _LOGIN_ATTEMPTS.get(key)
        if not state:
            return False
        if state.get("locked_until", 0) > now:
            return True
        if now - state.get("window_start", now) > lock_seconds:
            _LOGIN_ATTEMPTS.pop(key, None)
            return False
    return False

def _register_failed_attempt(key: str, max_attempts: int, lock_seconds: int) -> None:
    now = time.time()
    with _LOGIN_GUARD:
        state = _LOGIN_ATTEMPTS.get(key)
        if not state or now - state.get("window_start", now) > lock_seconds:
            state = {"count": 0, "window_start": now, "locked_until": 0}
            _LOGIN_ATTEMPTS[key] = state
        state["count"] += 1
        if state["count"] >= max_attempts:
            state["locked_until"] = now + lock_seconds
```

**Étapes du traitement:**
1. **Rate limiting:** Vérifie le nombre de tentatives par IP + identifiant (ligne 102)
2. **Recherche utilisateur:** 
   - Priorité: recherche par email (ligne 108)
   - Fallback: recherche par username/login (ligne 112)
   - Fallback: si email sans "@", traité comme login (ligne 115)
3. **Vérification mot de passe:** Utilise `verify_password()` pour comparer le hash (ligne 118)
4. **Vérification compte:** Vérifie que `user.is_active = true` (ligne 122)
5. **Chargement données multi-tenant:** (lignes 126-164)
   - Connexion à la base tenant
   - Récupération des assignations (sites, groupes, projets)
6. **Génération token JWT:** Crée un access_token avec les données utilisateur (lignes 166-177)
7. **Réponse:** Retourne `{access_token, expires_in}` (lignes 181-184)

---

### Étape 4: Mise à jour du contexte d'authentification

**Fichier:** `dataCollection/src/frontend/src/context/AuthContext.jsx`

**Lignes 74-125:** Fonction login du contexte
```javascript
const login = useCallback(async (identifier, password) => {
  setLoading(true);
  try {
    await authService.login(identifier, password);

    const decoded = decodeToken();
    setIsAuthenticated(true);
    setUser(decoded);

    // Enrichi depuis /auth/me (site_id, group_id peuvent être absents du JWT)
    try {
      const me = await authService.getMe(true);
      setUser(prev => ({
        ...prev,
        name:             me.name             ?? prev?.name,
        site_id:          me.site_id          ?? prev?.site_id,
        group_id:         me.group_id         ?? prev?.group_id,
        project_ids:      me.project_ids      ?? prev?.project_ids ?? [],
        dashboard_access: me.dashboard_access ?? prev?.dashboard_access ?? [],
        login:            me.login            ?? null,
      }));
      
      // ✅ Récupérer les assignations multi-tenant pour le filtrage automatique
      if (me.role === 'site_manager' || me.role === 'team_lead' || me.role === 'project_manager' || me.role === 'viewer') {
        try {
          const assignments = await authService.getUserAssignments();
          setUser(prev => ({
            ...prev,
            site_ids: assignments.site_ids || [],
            group_ids: assignments.group_ids || [],
            project_ids: assignments.project_ids || []
          }));
        } catch (e) {
          console.error("Erreur lors de la récupération des assignments:", e);
        }
      }
    } catch {
      // /auth/me optionnel — on garde les données du JWT
    }

    return { success: true };
  } catch (err) {
    const message =
      err.message ||
      err.response?.data?.detail ||
      "Email ou mot de passe incorrect.";
    return { success: false, message };
  } finally {
    setLoading(false);
  }
}, []);
```

**Lignes 32-64:** Fonction decodeToken
```javascript
const decodeToken = () => {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    // Expiration côté client
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("token_expires_at");
      return null;
    }

    return {
      id:               payload.sub              ?? null,
      email:            payload.email            ?? "",
      role:             payload.role             ?? ROLES.DEVELOPER,
      name:             payload.name             ?? null,
      site_id:          payload.site_id          ?? null,
      group_id:         payload.group_id         ?? null,
      project_ids:      payload.project_ids      ?? [],
      dashboard_access: payload.dashboard_access ?? [],
    };
  } catch {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token_expires_at");
    return null;
  }
};
```

**Étapes:**
1. Appelle `authService.login()` (ligne 78)
2. Décode le token JWT pour extraire les infos utilisateur (ligne 80)
3. Met à jour `isAuthenticated` et `user` (lignes 81-82)
4. Enrichit les données via `/auth/me` (ligne 86)
5. Récupère les assignations multi-tenant via `/auth/assignments` (lignes 98-110)
6. Retourne `{success: true}` ou `{success: false, message}` (lignes 115-121)

---

### Étape 5: Redirection

**Fichier:** `dataCollection/src/frontend/src/pages/Login.jsx`

**Lignes 164-167:** Redirection après succès
```javascript
if (res.success) {
  remember ? localStorage.setItem(REMEMBER_KEY, identifier) : localStorage.removeItem(REMEMBER_KEY);
  await toastOk(identifier);
  navigate("/developers");
}
```

---

## 2. Flux Mot de Passe Oublié (FORGOT PASSWORD)

### Étape 1: Accès à la page

**Fichier:** `dataCollection/src/frontend/src/pages/ForgotPassword.jsx`

**Lignes 70-100:** Initialisation et récupération de l'email
```javascript
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
```

**Lignes 245 dans Login.jsx:** Lien vers forgot password
```javascript
<Link to={`/forgot-password?email=${encodeURIComponent(identifier)}`} className="lg-forgot">Oublié ?</Link>
```

---

### Étape 2: Soumission de l'email

**Fichier:** `dataCollection/src/frontend/src/pages/ForgotPassword.jsx`

**Lignes 105-121:** Fonction de soumission
```javascript
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
```

---

### Étape 3: Traitement Backend

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py`

**Lignes 282-324:** Endpoint POST /auth/forgot-password
```python
@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_auth_db)):
    """
    Envoie un email de réinitialisation de mot de passe.
    
    Pour des raisons de sécurité, ne révèle jamais si un email existe ou non.
    """
    user = repo.get_by_email(db, request.email)
    
    if not user:
        # Pour des raisons de sécurité, on ne révèle pas si l'email existe
        logger.info(f"Forgot password requested for non-existent email: {request.email}")
        return {"message": "Si un compte existe avec cet email, vous recevrez des instructions."}
    
    if not user.is_active:
        logger.warning(f"Forgot password requested for inactive user: {request.email}")
        return {"message": "Si un compte existe avec cet email, vous recevrez des instructions."}
    
    # Générer un token JWT avec expiration courte (30 minutes)
    reset_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "type": "password_reset"},
        expires_delta=timedelta(minutes=30)
    )
    
    # Construire le lien de réinitialisation
    frontend_url = settings.FRONTEND_URL
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    
    # Envoyer l'email
    email_service = get_email_service()
    email_sent = email_service.send_password_reset_email(
        to_email=user.email,
        reset_link=reset_link,
        to_name=user.name,
        expiry_minutes=30
    )
    
    if email_sent:
        logger.info(f"Password reset email sent to {user.email}")
        return {"message": "Si un compte existe avec cet email, vous recevrez des instructions."}
    else:
        logger.error(f"Failed to send password reset email to {user.email}")
        raise _http_error(500, "AUTH_EMAIL_SEND_FAILED", "Failed to send reset email")
```

**Fichier:** `dataCollection/src/backend/app/schemas/auth.py`

**Lignes 57-59:** Schéma ForgotPasswordRequest
```python
class ForgotPasswordRequest(BaseModel):
    """Demande de réinitialisation de mot de passe"""
    email: EmailStr = Field(description="Email de l'utilisateur")
```

**Étapes:**
1. **Recherche utilisateur** par email dans auth_db (ligne 289)
2. **Sécurité:** Ne révèle jamais si l'email existe (lignes 291-298)
3. **Vérification activité:** Vérifie `user.is_active` (lignes 296-298)
4. **Génération token JWT:** Crée un token spécial (lignes 300-304)
   - `sub`: user_id
   - `email`: email utilisateur
   - `type`: "password_reset"
   - Expiration: 30 minutes
5. **Construction lien:** Crée l'URL `/reset-password?token={reset_token}` (lignes 306-308)
6. **Envoi email:** Utilise le service email (lignes 310-317)
7. **Réponse:** Message générique de succès (lignes 319-324)

---

### Étape 4: Réception email

**Service email** (non visible dans les fichiers fournis)

L'utilisateur reçoit un email contenant:
- Lien de réinitialisation avec le token
- Information sur l'expiration (30 minutes)
- Instructions pour suivre le lien

---

## 3. Flux Réinitialisation Mot de Passe (RESET PASSWORD)

### Étape 1: Accès via lien email

**Fichier:** `dataCollection/src/frontend/src/pages/ResetPassword.jsx`

**Lignes 86-140:** Vérification du token
```javascript
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [touched, setTouched] = useState({ pwd: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // ... validation et soumission ...

  if (!token) {
    return (
      <div className="rp-root">
        <style>{CSS}</style>
        <div className="rp-container">
          <div className="rp-card">
            <div className="rp-error">
              <i className="ri-error-warning-line" />
              <h2>Lien invalide ou expiré</h2>
              <p>Le lien de réinitialisation n'est pas valide ou a expiré.</p>
              <Link to="/forgot-password" className="rp-btn">Demander un nouveau lien</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
```

---

### Étape 2: Saisie nouveau mot de passe

**Fichier:** `dataCollection/src/frontend/src/pages/ResetPassword.jsx`

**Lignes 46-60:** Validation du mot de passe
```javascript
const isValidPwd = v => v && v.length >= 8 && /[A-Z]/.test(v) && /\d/.test(v);

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
```

**Lignes 190-245:** Formulaire de réinitialisation
```javascript
<form onSubmit={handleSubmit} noValidate className="rp-form">
  <div>
    <FloatInput
      label="Nouveau mot de passe"
      icon="ri-lock-password-line"
      type={showPwd ? "text" : "password"}
      value={password}
      onChange={e => setPassword(e.target.value)}
      onBlur={() => setTouched(t => ({ ...t, pwd: true }))}
      error={touched.pwd && !pwdOk}
      isValid={touched.pwd && pwdOk}
      disabled={loading}
      autoComplete="new-password"
      right={
        <button type="button" className="fi-eye" onClick={() => setShowPwd(v => !v)} tabIndex={-1}>
          <i className={`ri-${showPwd ? "eye-off" : "eye"}-line`} />
        </button>
      }
    />
    {password && <PwdStrength pwd={password} />}
    {touched.pwd && !pwdOk && <p className="rp-err"><i className="ri-error-warning-line" />Minimum 8 caractères, 1 majuscule, 1 chiffre</p>}
  </div>

  <div>
    <FloatInput
      label="Confirmer le mot de passe"
      icon="ri-lock-2-line"
      type={showConfirmPwd ? "text" : "password"}
      value={confirmPassword}
      onChange={e => setConfirmPassword(e.target.value)}
      onBlur={() => setTouched(t => ({ ...t, confirm: true }))}
      error={touched.confirm && !confirmOk}
      isValid={touched.confirm && confirmOk}
      disabled={loading}
      autoComplete="new-password"
      right={
        <button type="button" className="fi-eye" onClick={() => setShowConfirmPwd(v => !v)} tabIndex={-1}>
          <i className={`ri-${showConfirmPwd ? "eye-off" : "eye"}-line`} />
        </button>
      }
    />
    {touched.confirm && !confirmOk && <p className="rp-err"><i className="ri-error-warning-line" />Les mots de passe ne correspondent pas</p>}
  </div>

  <button
    type="submit"
    className={`rp-btn ${loading ? "rp-locked" : ""}`}
    disabled={loading}
    onKeyDown={onKey}
  >
    <span className="rp-shim" />
    <span className="rp-btn-txt">
      {loading ? <><span className="rp-spin" /> Modification en cours...</> : <>Réinitialiser <i className="ri-refresh-line" /></>}
    </span>
  </button>
</form>
```

**Le formulaire demande:**
- Nouveau mot de passe (min 8 caractères, 1 majuscule, 1 chiffre)
- Confirmation du mot de passe
- Indicateur de force du mot de passe
- Validation en temps réel

---

### Étape 3: Soumission

**Fichier:** `dataCollection/src/frontend/src/pages/ResetPassword.jsx`

**Lignes 103-120:** Fonction de soumission
```javascript
const handleSubmit = async e => {
  e?.preventDefault();
  setTouched({ pwd: true, confirm: true });
  if (!formOk) return;

  setLoading(true);
  try {
    await authService.resetPassword(token, password);
    setSuccess(true);
    await toastOk("Mot de passe modifié avec succès");
    setTimeout(() => navigate("/login"), 2000);
  } catch (error) {
    console.error("Reset password error:", error);
    toastErr("Impossible de réinitialiser le mot de passe");
  } finally {
    setLoading(false);
  }
};
```

**Fichier:** `dataCollection/src/frontend/src/services/authService.js`

**Lignes 157-163:** Fonction resetPassword
```javascript
resetPassword: async (token, newPassword) => {
  const response = await api.post("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  return response.data;
},
```

---

### Étape 4: Traitement Backend

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py`

**Lignes 327-378:** Endpoint POST /auth/reset-password
```python
@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_auth_db)):
    """
    Réinitialise le mot de passe avec un token valide.
    """
    # Décoder et valider le token
    payload = decode_access_token(request.token)
    
    if payload is None:
        raise _http_error(400, "AUTH_INVALID_TOKEN", "Token invalide ou expiré")
    
    # Vérifier que c'est un token de reset de mot de passe
    if payload.get("type") != "password_reset":
        raise _http_error(400, "AUTH_INVALID_TOKEN_TYPE", "Type de token invalide")
    
    user_id = payload.get("sub")
    if user_id is None:
        raise _http_error(400, "AUTH_TOKEN_PAYLOAD_INVALID", "Token payload invalide")
    
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise _http_error(400, "AUTH_TOKEN_USER_ID_INVALID", "ID utilisateur invalide")
    
    # Récupérer l'utilisateur
    user = repo.get_by_id(db, user_id)
    
    if user is None:
        raise _http_error(404, "AUTH_USER_NOT_FOUND", "Utilisateur non trouvé")
    
    if not user.is_active:
        raise _http_error(403, "AUTH_USER_INACTIVE", "Compte utilisateur inactif")
    
    # Hasher le nouveau mot de passe
    hashed = hash_password(request.new_password)
    
    # Mettre à jour le mot de passe
    user.hashed_password = hashed
    db.commit()
    # ❌ FIX : Supprimer db.refresh(user) car il peut recharger depuis auth_db et perdre les données temporaires
    # Les assignations (site_id, group_id) sont gérées dans tenant_db, pas dans auth_db
    
    logger.info(f"Password reset successful for user {user.id} ({user.email})")
    
    # Envoyer une notification de confirmation
    email_service = get_email_service()
    email_service.send_password_changed_notification(
        to_email=user.email,
        to_name=user.name
    )
    
    return {"message": "Mot de passe réinitialisé avec succès"}
```

**Fichier:** `dataCollection/src/backend/app/schemas/auth.py`

**Lignes 62-74:** Schéma ResetPasswordRequest
```python
class ResetPasswordRequest(BaseModel):
    """Réinitialisation de mot de passe avec token"""
    token: str = Field(description="Token de réinitialisation JWT")
    new_password: str = Field(min_length=8, description="Nouveau mot de passe")

    @model_validator(mode="after")
    def validate_password_strength(self) -> "ResetPasswordRequest":
        pwd = self.new_password
        if not any(c.isupper() for c in pwd):
            raise ValueError("Le mot de passe doit contenir au moins une majuscule.")
        if not any(c.isdigit() for c in pwd):
            raise ValueError("Le mot de passe doit contenir au moins un chiffre.")
        return self
```

**Étapes:**
1. **Décodage token:** Utilise `decode_access_token()` pour extraire le payload (ligne 333)
2. **Validation token:**
   - Vérifie que le token n'est pas expiré (ligne 335)
   - Vérifie que `type == "password_reset"` (ligne 339)
   - Extrait `user_id` du payload (ligne 342)
3. **Récupération utilisateur:** Recherche l'utilisateur par ID dans auth_db (ligne 352)
4. **Vérification activité:** Vérifie `user.is_active` (ligne 357)
5. **Hashage nouveau mot de passe:** Utilise `hash_password()` (ligne 361)
6. **Mise à jour base:** Modifie `user.hashed_password` dans auth_db (lignes 364-365)
7. **Notification email:** Envoie un email de confirmation du changement (lignes 372-376)
8. **Réponse:** Message de succès (ligne 378)

---

### Étape 5: Connexion avec nouveau mot de passe

**Fichier:** `dataCollection/src/frontend/src/pages/ResetPassword.jsx`

**Lignes 112-113:** Redirection après succès
```javascript
await toastOk("Mot de passe modifié avec succès");
setTimeout(() => navigate("/login"), 2000);
```

L'utilisateur est redirigé vers la page de connexion et peut se connecter avec son nouveau mot de passe.

---

## 4. Architecture Multi-Tenant

**Important:** Votre système utilise une architecture multi-tenant avec deux bases de données:

### Bases de données

1. **auth_db:** Base d'authentification centrale
   - Utilisateurs (email, login, mot de passe hashé)
   - Rôles
   - Statut d'activation

2. **tenant_db:** Base de données du tenant courant
   - Assignations utilisateurs (sites, groupes, projets)
   - Données spécifiques au tenant

### Chargement des données multi-tenant

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py`

**Lignes 126-164:** Chargement des données tenant après authentification
```python
# ✅ ARCHITECTURE MULTI-TENANT: Charger les données tenant après authentification
# Charger les assignations multi-sites/multi-équipes/multi-projets depuis la base tenant courante
from app.database.session import get_db as get_tenant_db
from app.repositories.user_site_access_repository import UserSiteAccessRepository
from app.repositories.user_group_access_repository import UserGroupAccessRepository
from app.repositories.user_project_access_repository import UserProjectAccessRepository
try:
    tenant_db = next(get_tenant_db())
    tenant_user = repo.get_by_id(tenant_db, user.id)
    if tenant_user:
        # Fusionner les données tenant avec l'utilisateur auth
        user.site_id = tenant_user.site_id
        user.group_id = tenant_user.group_id
        
        # ✅ FIX : Charger les assignations depuis les tables d'accès multi-tenant
        site_access_repo = UserSiteAccessRepository()
        group_access_repo = UserGroupAccessRepository()
        project_access_repo = UserProjectAccessRepository()
        
        try:
            site_accesses = site_access_repo.get_by_user_id(tenant_db, user.id)
            user._site_accesses = site_accesses
        except Exception:
            user._site_accesses = []
        
        try:
            group_accesses = group_access_repo.get_by_user_id(tenant_db, user.id)
            user._group_accesses = group_accesses
        except Exception:
            user._group_accesses = []
        
        try:
            project_accesses = project_access_repo.get_by_user_id(tenant_db, user.id)
            user._project_accesses = project_accesses
        except Exception:
            user._project_accesses = []
    tenant_db.close()
except Exception as e:
    logger.warning(f"Failed to load tenant data for user {user.id}: {e}")
```

**Lignes 233-279:** Endpoint /auth/assignments
```python
@router.get("/assignments")
def get_user_assignments(
    current_user: AppUser = Depends(get_current_user),
):
    """Récupère les assignations multi-tenant de l'utilisateur courant."""
    from app.database.session import get_db as get_tenant_db
    from app.repositories.user_site_access_repository import UserSiteAccessRepository
    from app.repositories.user_group_access_repository import UserGroupAccessRepository
    from app.repositories.user_project_access_repository import UserProjectAccessRepository
    from app.repositories.user_repository import AppUserRepository
    import logging
    logger = logging.getLogger(__name__)
    
    user_repo = AppUserRepository()
    
    logger.info(f"[DEBUG /assignments] current_user.id={current_user.id}, current_user.email={current_user.email}")
    
    # Get tenant database connection
    tenant_db = next(get_tenant_db())
    
    # Récupérer le tenant_user par email
    tenant_user = user_repo.get_by_email(tenant_db, current_user.email)
    if not tenant_user:
        logger.warning(f"[DEBUG /assignments] No tenant_user found for email={current_user.email}")
        return {"site_ids": [], "group_ids": [], "project_ids": []}
    
    logger.info(f"[DEBUG /assignments] tenant_user.id={tenant_user.id}, tenant_user.site_id={tenant_user.site_id}")
    
    site_access_repo = UserSiteAccessRepository()
    group_access_repo = UserGroupAccessRepository()
    project_access_repo = UserProjectAccessRepository()
    
    # Récupérer les assignations depuis tenant avec tenant_user.id
    site_accesses = site_access_repo.get_by_user_id(tenant_db, tenant_user.id)
    group_accesses = group_access_repo.get_by_user_id(tenant_db, tenant_user.id)
    project_accesses = project_access_repo.get_by_user_id(tenant_db, tenant_user.id)
    
    logger.info(f"[DEBUG /assignments] site_accesses={len(site_accesses)}, group_accesses={len(group_accesses)}, project_accesses={len(project_accesses)}")
    
    result = {
        "site_ids": [access.site_id for access in site_accesses],
        "group_ids": [access.group_id for access in group_accesses],
        "project_ids": [access.project_id for access in project_accesses]
    }
    
    logger.info(f"[DEBUG /assignments] Returning: {result}")
    return result
```

### Avantages de cette architecture

- **Séparation des responsabilités:** Authentification centralisée, données spécifiques par tenant
- **Scalabilité:** Facile d'ajouter de nouveaux tenants
- **Sécurité:** Isolation des données entre tenants
- **Flexibilité:** Chaque tenant peut avoir ses propres assignations

---

## 5. Sécurité Implémentée

### 5.1 Rate Limiting (Frontend)

**Fichier:** `dataCollection/src/frontend/src/pages/Login.jsx`

**Lignes 9-10:** Configuration
```javascript
const MAX_ATTEMPTS = 5;
const LOCKOUT_SEC = 30;
```

**Lignes 143-152:** Fonction triggerLockout
```javascript
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
```

### 5.2 Rate Limiting (Backend)

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py`

**Lignes 26-27:** Variables globales
```python
_LOGIN_ATTEMPTS = {}
_LOGIN_GUARD = threading.Lock()
```

**Lignes 39-67:** Fonctions de rate limiting
```python
def _is_rate_limited(key: str, max_attempts: int, lock_seconds: int) -> bool:
    now = time.time()
    with _LOGIN_GUARD:
        state = _LOGIN_ATTEMPTS.get(key)
        if not state:
            return False
        if state.get("locked_until", 0) > now:
            return True
        if now - state.get("window_start", now) > lock_seconds:
            _LOGIN_ATTEMPTS.pop(key, None)
            return False
    return False

def _register_failed_attempt(key: str, max_attempts: int, lock_seconds: int) -> None:
    now = time.time()
    with _LOGIN_GUARD:
        state = _LOGIN_ATTEMPTS.get(key)
        if not state or now - state.get("window_start", now) > lock_seconds:
            state = {"count": 0, "window_start": now, "locked_until": 0}
            _LOGIN_ATTEMPTS[key] = state
        state["count"] += 1
        if state["count"] >= max_attempts:
            state["locked_until"] = now + lock_seconds
```

### 5.3 Hashage des mots de passe

**Backend:** Utilisation de bcrypt/argon2 via `hash_password()` et `verify_password()`

### 5.4 Token JWT

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py`

**Lignes 166-177:** Génération du token
```python
access_token = create_access_token(
    data           = {
        "sub": str(user.id), 
        "role": user.role,
        "name": user.name,
        "email": user.email,
        "site_id": user.site_id,
        "group_id": user.group_id,
        "project_ids": user.project_ids if user.is_project_manager else None
    },
    expires_delta  = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
)
```

**Fichier:** `dataCollection/src/frontend/src/context/AuthContext.jsx`

**Lignes 32-64:** Décodage et vérification d'expiration
```javascript
const decodeToken = () => {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    // Expiration côté client
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("token_expires_at");
      return null;
    }

    return {
      id:               payload.sub              ?? null,
      email:            payload.email            ?? "",
      role:             payload.role             ?? ROLES.DEVELOPER,
      name:             payload.name             ?? null,
      site_id:          payload.site_id          ?? null,
      group_id:         payload.group_id         ?? null,
      project_ids:      payload.project_ids      ?? [],
      dashboard_access: payload.dashboard_access ?? [],
    };
  } catch {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token_expires_at");
    return null;
  }
};
```

### 5.5 Non-révélation d'email

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py`

**Lignes 291-298:** Message générique
```python
if not user:
    # Pour des raisons de sécurité, on ne révèle pas si l'email existe
    logger.info(f"Forgot password requested for non-existent email: {request.email}")
    return {"message": "Si un compte existe avec cet email, vous recevrez des instructions."}

if not user.is_active:
    logger.warning(f"Forgot password requested for inactive user: {request.email}")
    return {"message": "Si un compte existe avec cet email, vous recevrez des instructions."}
```

### 5.6 Validation mot de passe

**Fichier:** `dataCollection/src/backend/app/schemas/auth.py`

**Lignes 16-23:** Validation RegisterRequest
```python
@model_validator(mode="after")
def validate_password_strength(self) -> "RegisterRequest":
    pwd = self.password
    if not any(c.isupper() for c in pwd):
        raise ValueError("Le mot de passe doit contenir au moins une majuscule.")
    if not any(c.isdigit() for c in pwd):
        raise ValueError("Le mot de passe doit contenir au moins un chiffre.")
    return self
```

**Lignes 67-74:** Validation ResetPasswordRequest
```python
@model_validator(mode="after")
def validate_password_strength(self) -> "ResetPasswordRequest":
    pwd = self.new_password
    if not any(c.isupper() for c in pwd):
        raise ValueError("Le mot de passe doit contenir au moins une majuscule.")
    if not any(c.isdigit() for c in pwd):
        raise ValueError("Le mot de passe doit contenir au moins un chiffre.")
    return self
```

### 5.7 Token reset avec expiration courte

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py`

**Lignes 300-304:** Génération token reset
```python
reset_token = create_access_token(
    data={"sub": str(user.id), "email": user.email, "type": "password_reset"},
    expires_delta=timedelta(minutes=30)
)
```

### 5.8 Vérification activité compte

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py`

**Lignes 122-124:** Vérification login
```python
if not user.is_active:
    _register_failed_attempt(bucket_key, max_attempts=max_attempts, lock_seconds=lock_seconds)
    raise _http_error(status.HTTP_403_FORBIDDEN, "AUTH_USER_INACTIVE", "User account is inactive")
```

**Lignes 357-358:** Vérification reset password
```python
if not user.is_active:
    raise _http_error(403, "AUTH_USER_INACTIVE", "Compte utilisateur inactif")
```

---

## Résumé des fichiers impliqués

### Frontend
- `dataCollection/src/frontend/src/pages/Login.jsx` - Page de connexion
- `dataCollection/src/frontend/src/pages/ForgotPassword.jsx` - Page mot de passe oublié
- `dataCollection/src/frontend/src/pages/ResetPassword.jsx` - Page réinitialisation mot de passe
- `dataCollection/src/frontend/src/services/authService.js` - Service d'authentification
- `dataCollection/src/frontend/src/context/AuthContext.jsx` - Contexte d'authentification

### Backend
- `dataCollection/src/backend/app/api/routers/auth.py` - Router d'authentification
- `dataCollection/src/backend/app/schemas/auth.py` - Schémas de validation
- `dataCollection/src/backend/app/core/security.py` - Fonctions de sécurité (hash, token)
- `dataCollection/src/backend/app/core/email_service.py` - Service d'envoi d'emails

### Repositories
- `dataCollection/src/backend/app/repositories/user_repository.py` - Repository utilisateurs
- `dataCollection/src/backend/app/repositories/user_site_access_repository.py` - Assignations sites
- `dataCollection/src/backend/app/repositories/user_group_access_repository.py` - Assignations groupes
- `dataCollection/src/backend/app/repositories/user_project_access_repository.py` - Assignations projets

---

## Conclusion

Ce système d'authentification implémente les meilleures pratiques de sécurité:
- Rate limiting côté frontend et backend
- Hashage sécurisé des mots de passe
- Tokens JWT avec expiration
- Non-révélation d'informations sensibles
- Validation forte des mots de passe
- Architecture multi-tenant scalable
- Gestion sécurisée des tokens de réinitialisation

L'architecture multi-tenant permet une séparation claire entre l'authentification centrale et les données spécifiques à chaque organisation, facilitant ainsi la scalabilité et la maintenance du système.
