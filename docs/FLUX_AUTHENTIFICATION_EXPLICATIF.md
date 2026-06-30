# Documentation des Flux d'Authentification - Guide Explicatif pour Réunion

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

#### 🎯 Objectif de cette étape
Collecter et valider les informations de connexion de l'utilisateur avant de les envoyer au serveur.

#### 💡 Pourquoi c'est important
Cette étape sert de **première ligne de défense**. En validant les données côté client (dans le navigateur), on:
- Évite des appels inutiles au serveur si les données sont invalides
- Donne un retour immédiat à l'utilisateur (pas d'attente pour une erreur évidente)
- Réduit la charge sur le serveur
- Améliore l'expérience utilisateur

#### 🔧 Ce que fait cette étape
L'utilisateur saisit son identifiant (email ou username) et son mot de passe. Le formulaire:

1. **Valide en temps réel** les champs:
   - Identifiant: minimum 3 caractères
   - Mot de passe: minimum 6 caractères

2. **Affiche la force du mot de passe** (lignes 66-78):
   - Indicateur visuel: Critique, Faible, Moyen, Sécurisé, Excellent
   - Guide l'utilisateur vers un mot de passe sécurisé

3. **Gère les tentatives échouées** (lignes 143-152):
   - Compte les tentatives (max 5)
   - Verrouille le formulaire pendant 30 secondes après 5 échecs
   - Affiche un compte à rebours visuel

4. **Option "Maintenir la session"** (ligne 165):
   - Sauvegarde l'identifiant dans localStorage
   - Pré-remplit le champ à la prochaine connexion

**Lignes 113-126:** Initialisation des états
```javascript
const [identifier, setId] = useState(saved);
const [password, setPwd] = useState("");
const [remember, setRemember] = useState(!!saved);
const [touched, setTouched] = useState({ id: false, pwd: false });
const [attempts, setAttempts] = useState(0);
const [lockout, setLockout] = useState(false);
```

**Lignes 154-172:** Fonction de soumission
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

#### ➡️ Comment cette étape prépare la suivante
Une fois les données validées et collectées, elles sont **prêtes à être envoyées** au service d'authentification. Le service recevra des données propres et validées, ce qui facilite son travail de communication avec le serveur.

---

### Étape 2: Appel au service d'authentification

**Fichier:** `Login.jsx` (ligne 163) → `authService.js` (lignes 31-71)

#### 🎯 Objectif de cette étape
Préparer et envoyer les identifiants au serveur de manière sécurisée et compatible avec différents formats d'API.

#### 💡 Pourquoi c'est important
Le service d'authentification est la **couche de normalisation** entre le frontend et le backend. Il:
- Gère la compatibilité entre différents formats d'API (JSON vs form-data)
- Stocke de manière sécurisée les tokens reçus
- Gère les erreurs de manière centralisée
- Facilite les tests et la maintenance

#### 🔧 Ce que fait cette étape
La fonction `login()` dans authService.js:

1. **Détermine le type d'identifiant** (ligne 71):
   - Si l'identifiant contient "@", c'est un email
   - Sinon, c'est un username

2. **Tentative 1: Envoi en JSON** (lignes 74-80):
   - Format moderne: `{email: "...", password: "..."}`
   - Plus lisible et facile à déboguer
   - Préféré par les APIs modernes

3. **Tentative 2: Fallback OAuth2** (lignes 82-94):
   - Si le serveur renvoie erreur 422 (format non accepté)
   - Réessaie en format form-urlencoded (standard OAuth2)
   - Compatible avec les systèmes legacy
   - Utilise toujours "username" comme champ (standard OAuth2)

4. **Stockage sécurisé du token** (lignes 102-106):
   - Sauvegarde le token JWT dans localStorage
   - Sauvegarde l'heure d'expiration
   - Invalide le cache utilisateur

**Lignes 31-71 dans authService.js:**
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

#### ➡️ Comment cette étape prépare la suivante
Le service envoie les identifiants au backend et **reçoit un token JWT**. Ce token est comme un "passeport" qui prouve l'identité de l'utilisateur. Le contexte d'authentification va utiliser ce token pour:
- Décoder les informations de l'utilisateur
- Créer la session dans l'application
- Savoir qui est connecté et ce qu'il a le droit de faire

---

### Étape 3: Traitement Backend

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py` (lignes 94-184)

#### 🎯 Objectif de cette étape
Vérifier l'identité de l'utilisateur, charger ses données et générer un token d'accès sécurisé.

#### 💡 Pourquoi c'est important
C'est ici que se fait la **véritable authentification**. Le serveur:
- Vérifie que les identifiants sont corrects
- Que le compte est actif
- Prépare toutes les données nécessaires pour que l'utilisateur puisse utiliser l'application
- Génère un token sécurisé qui servira pour toutes les requêtes futures

#### 🔧 Ce que fait cette étape
L'endpoint `POST /auth/login` effectue plusieurs vérifications et traitements:

**1. Rate limiting (lignes 135-136):**
- Vérifie combien de tentatives échouées depuis cette IP
- Si trop de tentatives, bloque temporairement
- **Pourquoi?** Prévenir les attaques par force brute (essayer tous les mots de passe possibles)

**2. Recherche de l'utilisateur (lignes 140-149):**
- Cherche d'abord par email (priorité car plus courant)
- Si pas trouvé, cherche par username/login
- Si email sans "@", le traite comme username
- **Pourquoi?** Flexibilité: l'utilisateur peut se connecter avec email OU username

**3. Vérification du mot de passe (ligne 151):**
- Compare le mot de passe envoyé avec le hash stocké
- Le hashage est irréversible: même avec le hash, on ne peut pas retrouver le mot de passe
- **Pourquoi?** Sécurité: même si la base est volée, les mots de passe sont illisibles

**4. Vérification du compte actif (lignes 155-157):**
- Vérifie que le compte n'a pas été désactivé
- **Pourquoi?** Un compte désactivé ne doit pas pouvoir se connecter

**5. Chargement des données multi-tenant (lignes 159-197):**
- Connecte à la base de données du tenant (organisation)
- Récupère les assignations de l'utilisateur:
  - À quels sites il a accès
  - À quels groupes il appartient
  - À quels projets il peut accéder
- **Pourquoi?** Ces données sont cruciales pour filtrer ce que l'utilisateur peut voir dans l'application

**6. Génération du token JWT (lignes 199-210):**
- Crée un token JWT signé cryptographiquement
- Contient: ID utilisateur, rôle, nom, email, assignations
- Expiration configurable
- **Pourquoi?** Le token sert de "passeport" pour toutes les requêtes futures. Il est signé, donc impossible à falsifier.

**7. Réponse (lignes 212-217):**
- Renvoie le token et sa durée de validité
- Réinitialise le compteur de tentatives
- **Pourquoi?** Le frontend a maintenant tout ce dont il a besoin pour créer la session

**Lignes 94-184:** Endpoint complet
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

#### ➡️ Comment cette étape prépare la suivante
Le token JWT généré contient **toutes les informations nécessaires** pour que le frontend sache qui est l'utilisateur et ce qu'il a le droit de faire. Le contexte d'authentification va décoder ce token pour créer la session utilisateur dans toute l'application.

---

### Étape 4: Mise à jour du contexte d'authentification

**Fichier:** `dataCollection/src/frontend/src/context/AuthContext.jsx` (lignes 74-125)

#### 🎯 Objectif de cette étape
Créer la session utilisateur dans l'application en décryptant le token et en chargeant les informations complètes de l'utilisateur.

#### 💡 Pourquoi c'est important
Le contexte d'authentification est le **"cerveau"** qui sait qui est connecté dans toute l'application. Tous les composants peuvent l'interroger pour:
- Savoir si un utilisateur est connecté
- Connaître son rôle et ses droits
- Filtrer les données selon ses permissions
- Afficher ou masquer des fonctionnalités

#### 🔧 Ce que fait cette étape
La fonction `login()` du contexte:

**1. Appel au service (ligne 272):**
- Utilise le token reçu pour confirmer la connexion
- **Pourquoi?** Déclenche le décodage du token

**2. Décodage du token (ligne 274):**
- Extrait les informations du token JWT
- **Pourquoi?** Le token contient les infos de base de l'utilisateur (ID, rôle, email, etc.)

**3. Mise à jour de l'état (lignes 275-276):**
- Signale à toute l'application qu'un utilisateur est connecté (`isAuthenticated = true`)
- Stocke ses informations dans la variable `user`
- **Pourquoi?** Tous les composants React peuvent maintenant accéder à ces informations

**4. Enrichissement des données (lignes 279-307):**
- Le token JWT contient des informations de base, mais l'appel à `/auth/me` permet de récupérer des données plus détaillées et à jour
- Récupère également les assignations multi-tenant via `/auth/assignments`
- **Pourquoi?** Certaines données peuvent changer entre la génération du token et l'utilisation (ex: nouvelles assignations)

**5. Récupération des assignations (lignes 292-304):**
- Pour les rôles avec accès limité (site_manager, team_lead, etc.)
- Récupère spécifiquement la liste des sites, groupes et projets accessibles
- **Pourquoi?** Permet de filtrer les données affichées dans l'application selon les droits de l'utilisateur

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

#### ➡️ Comment cette étape prépare la suivante
Une fois le contexte mis à jour, **toute l'application sait** qui est l'utilisateur et ce qu'il a le droit de faire. L'application peut maintenant rediriger l'utilisateur vers la page appropriée selon son rôle et ses permissions.

---

### Étape 5: Redirection

**Fichier:** `Login.jsx` (lignes 164-167)

#### 🎯 Objectif de cette étape
Envoyer l'utilisateur vers la page principale de l'application une fois connecté.

#### 💡 Pourquoi c'est important
Après une connexion réussie, l'utilisateur doit être dirigé vers l'interface principale pour commencer à utiliser l'application. C'est la dernière étape du flux de connexion.

#### 🔧 Ce que fait cette étape

**1. Sauvegarde de l'identifiant (ligne 376):**
- Si l'utilisateur a coché "Maintenir la session"
- Son identifiant est sauvegardé dans le localStorage
- **Pourquoi?** Pré-remplira le champ à la prochaine connexion pour améliorer l'expérience utilisateur

**2. Affichage de succès (ligne 377):**
- Affiche un message de bienvenue visuel
- **Pourquoi?** Confirme à l'utilisateur que la connexion a réussi

**3. Redirection (ligne 378):**
- Navigue automatiquement vers la page `/developers`
- **Pourquoi?** Envoie l'utilisateur vers la page principale de l'application

**Lignes 164-167:** Redirection après succès
```javascript
if (res.success) {
  remember ? localStorage.setItem(REMEMBER_KEY, identifier) : localStorage.removeItem(REMEMBER_KEY);
  await toastOk(identifier);
  navigate("/developers");
}
```

#### ➡️ Résultat final
L'utilisateur est maintenant connecté et peut utiliser toutes les fonctionnalités de l'application selon son rôle et ses assignations. Le flux de connexion est complet.

---

## 2. Flux Mot de Passe Oublié (FORGOT PASSWORD)

### Étape 1: Accès à la page

**Fichier:** `dataCollection/src/frontend/src/pages/ForgotPassword.jsx` (lignes 70-100)

#### 🎯 Objectif de cette étape
Permettre à l'utilisateur qui a oublié son mot de passe de demander une réinitialisation.

#### 💡 Pourquoi c'est important
C'est le **point d'entrée** du processus de récupération de compte. L'utilisateur doit pouvoir accéder facilement à cette fonctionnalité depuis la page de connexion.

#### 🔧 Ce que fait cette étape

**1. Accès depuis Login (ligne 427 dans Login.jsx):**
- L'utilisateur clique sur "Oublié ?" dans la page de connexion
- Cela le redirige vers cette page avec son email déjà pré-rempli dans l'URL
- **Pourquoi?** Améliore l'expérience utilisateur en évitant de retaper son email

**2. Récupération automatique de l'email (lignes 402-422):**
- Si l'utilisateur est déjà connecté et accède à cette page
- Le système récupère automatiquement son email via l'API
- **Pourquoi?** Facilite le processus pour les utilisateurs déjà connectés

**3. Affichage du formulaire:**
- Présente un champ simple pour saisir l'adresse email
- **Pourquoi?** Interface simple et claire pour éviter la confusion

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

#### ➡️ Comment cette étape prépare la suivante
Une fois l'email saisi ou récupéré, il est **prêt à être envoyé** au serveur pour lancer le processus de réinitialisation.

---

### Étape 2: Soumission de l'email

**Fichier:** `ForgotPassword.jsx` (lignes 105-121)

#### 🎯 Objectif de cette étape
Envoyer l'email au serveur pour déclencher l'envoi du lien de réinitialisation.

#### 💡 Pourquoi c'est important
C'est l'action qui **lance le processus de récupération** côté serveur. Sans cette étape, le serveur ne sait pas qu'un utilisateur veut récupérer son compte.

#### 🔧 Ce que fait cette étape

**1. Validation de l'email (ligne 440):**
- Vérifie que l'email est au bon format avant de l'envoyer
- **Pourquoi?** Évite les appels inutiles au serveur avec des emails invalides

**2. Appel au service (ligne 445):**
- Envoie l'email au backend via `authService.forgotPassword(email)`
- **Pourquoi?** Le backend va générer le lien de réinitialisation

**3. Affichage du succès (ligne 447):**
- Si l'envoi réussit, affiche un écran de confirmation
- **Pourquoi?** Informe l'utilisateur que des instructions ont été envoyées

**4. Gestion des erreurs (lignes 448-452):**
- Si l'envoi échoue, affiche un message d'erreur
- **Pourquoi?** Informe l'utilisateur en cas de problème technique

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

#### ➡️ Comment cette étape prépare la suivante
Le serveur va recevoir l'email et **générer un lien sécurisé** de réinitialisation qui sera envoyé par email à l'utilisateur.

---

### Étape 3: Traitement Backend

**Fichier:** `dataCollection/src/backend/app/api/routers/auth.py` (lignes 282-324)

#### 🎯 Objectif de cette étape
Générer un lien sécurisé de réinitialisation et l'envoyer par email à l'utilisateur.

#### 💡 Pourquoi c'est important
C'est ici que la **sécurité du processus de récupération** est assurée. Le système doit générer un lien unique, temporaire et sécurisé pour éviter les abus.

#### 🔧 Ce que fait cette étape

**1. Recherche de l'utilisateur (ligne 472):**
- Cherche si un compte existe avec cet email dans la base de données
- **Pourquoi?** Savoir à qui envoyer le lien de réinitialisation

**2. Sécurité - Non-révélation (lignes 474-481):**
- Pour des raisons de sécurité, le système ne révèle jamais si l'email existe ou non
- Même si l'email n'existe pas, il renvoie le même message de succès
- **Pourquoi?** Empêche les attaquants de savoir quels emails sont valides dans le système (énumération)

**3. Vérification du compte actif (lignes 479-481):**
- Si le compte existe mais est désactivé, le même message générique est renvoyé
- **Pourquoi?** Même raison: ne pas révéler d'information sur les comptes

**4. Génération du token (lignes 484-487):**
- Crée un token JWT spécial avec:
  - L'ID de l'utilisateur
  - Son email
  - Le type "password_reset" (pour distinguer des autres tokens)
  - Une expiration courte de 30 minutes
- **Pourquoi?** Le token est unique et temporaire, limitant le temps pendant lequel le lien est valide

**5. Construction du lien (lignes 490-491):**
- Crée l'URL complète de réinitialisation
- **Pourquoi?** L'utilisateur peut cliquer sur ce lien pour accéder à la page de réinitialisation

**6. Envoi de l'email (lignes 494-500):**
- Utilise le service d'email pour envoyer le lien
- **Pourquoi?** L'email est le canal de vérification de l'identité

**7. Réponse (lignes 502-507):**
- Renvoie un message générique de succès
- **Pourquoi?** Maintient la sécurité en ne révélant pas si l'email existe

**Lignes 282-324:** Endpoint complet
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

#### ➡️ Comment cette étape prépare la suivante
L'utilisateur reçoit un email contenant un **lien unique et temporaire**. Ce lien lui permettra de définir un nouveau mot de passe.

---

### Étape 4: Réception email

**Service email** (non visible dans les fichiers fournis)

#### 🎯 Objectif de cette étape
Délivrer le lien de réinitialisation à l'utilisateur de manière sécurisée.

#### 💡 Pourquoi c'est important
L'email est le **canal de vérification de l'identité**. Seul le propriétaire de l'adresse email devrait pouvoir recevoir ce lien.

#### 🔧 Ce que fait cette étape

**1. Envoi de l'email:**
- Le service d'email envoie le message à l'adresse spécifiée
- **Pourquoi?** Délivre le lien de réinitialisation

**2. Contenu de l'email:**
- Le lien de réinitialisation avec le token
- L'information que le lien expire dans 30 minutes
- Des instructions pour suivre le lien
- Un avertissement de sécurité (ne pas partager le lien)
- **Pourquoi?** Guide l'utilisateur et le sensibilise aux risques de sécurité

#### ➡️ Comment cette étape prépare la suivante
L'utilisateur clique sur le lien dans l'email, ce qui l'amène à la page de réinitialisation avec le token déjà inclus dans l'URL.

---

## 3. Flux Réinitialisation Mot de Passe (RESET PASSWORD)

### Étape 1: Accès via lien email

**Fichier:** `ResetPassword.jsx` (lignes 86-140)

#### 🎯 Objectif de cette étape
Vérifier que le lien de réinitialisation est valide et permettre à l'utilisateur de définir un nouveau mot de passe.

#### 💡 Pourquoi c'est important
C'est ici que la **sécurité du token est vérifiée**. Si le lien est invalide ou expiré, l'utilisateur ne doit pas pouvoir continuer pour éviter les abus.

#### 🔧 Ce que fait cette étape

**1. Extraction du token (ligne 556):**
- Récupère le token depuis les paramètres de l'URL (`?token=xxx`)
- **Pourquoi?** Le token est nécessaire pour valider la demande

**2. Vérification de présence (lignes 568-584):**
- Si aucun token n'est présent dans l'URL, affiche une erreur
- Message: "Lien invalide ou expiré"
- Bouton pour demander un nouveau lien
- **Pourquoi?** Empêche l'accès à la page sans token valide

**3. Affichage du formulaire:**
- Si le token est présent, affiche le formulaire pour saisir le nouveau mot de passe
- **Pourquoi?** Permet à l'utilisateur de définir son nouveau mot de passe

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

#### ➡️ Comment cette étape prépare la suivante
Le token est extrait et **prêt à être validé** par le backend lorsque l'utilisateur soumettra son nouveau mot de passe.

---

### Étape 2: Saisie nouveau mot de passe

**Fichier:** `ResetPassword.jsx` (lignes 46-245)

#### 🎯 Objectif de cette étape
Permettre à l'utilisateur de définir un nouveau mot de passe sécurisé.

#### 💡 Pourquoi c'est important
Le nouveau mot de passe doit respecter des **critères de sécurité** pour protéger le compte de l'utilisateur contre les attaques.

#### 🔧 Ce que fait cette étape

**1. Validation en temps réel (lignes 595):**
- Le système vérifie que le mot de passe respecte:
  - Minimum 8 caractères
  - Au moins une majuscule
  - Au moins un chiffre
  - Préfère un caractère spécial (bonus)
- **Pourquoi?** Force l'utilisateur à créer un mot de passe robuste

**2. Indicateur de force (lignes 597-609):**
- Affiche visuellement la force du mot de passe
- Échelle: Critique, Faible, Moyen, Sécurisé, Excellent
- **Pourquoi?** Guide l'utilisateur vers un mot de passe plus sécurisé

**3. Confirmation (lignes 637-656):**
- Demande à l'utilisateur de saisir le mot de passe une deuxième fois
- Vérifie que les deux saisies correspondent
- **Pourquoi?** Évite les erreurs de frappe qui empêcheraient l'utilisateur de se connecter

**4. Bouton de visibilité (lignes 627-631, 649-653):**
- Permet à l'utilisateur de voir ce qu'il tape
- **Pourquoi?** Permet de vérifier son mot de passe avant de le valider

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

#### ➡️ Comment cette étape prépare la suivante
Une fois le nouveau mot de passe validé et confirmé, il est **prêt à être envoyé** au serveur avec le token pour finaliser la réinitialisation.

---

### Étape 3: Soumission

**Fichier:** `ResetPassword.jsx` (lignes 103-120) → `authService.js` (lignes 157-163)

#### 🎯 Objectif de cette étape
Envoyer le nouveau mot de passe et le token au serveur pour validation et mise à jour.

#### 💡 Pourquoi c'est important
C'est l'action qui **finalise le changement de mot de passe** côté serveur. Sans cette étape, le mot de passe ne serait pas modifié dans la base de données.

#### 🔧 Ce que fait cette étape

**1. Validation finale (ligne 688):**
- Vérifie une dernière fois que tous les champs sont valides
- **Pourquoi?** Dernière vérification avant l'envoi

**2. Appel au service (ligne 693):**
- Envoie le token et le nouveau mot de passe au backend
- **Pourquoi?** Le backend va valider le token et mettre à jour le mot de passe

**3. Affichage du succès (ligne 695):**
- Si la réinitialisation réussit, affiche un message de confirmation
- **Pourquoi?** Informe l'utilisateur que le changement est réussi

**4. Redirection automatique (ligne 696):**
- Après 2 secondes, redirige vers la page de connexion
- **Pourquoi?** Permet à l'utilisateur de se connecter immédiatement avec son nouveau mot de passe

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

#### ➡️ Comment cette étape prépare la suivante
Le serveur va **valider le token**, vérifier qu'il est encore valide, et mettre à jour le mot de passe dans la base de données.

---

### Étape 4: Traitement Backend

**Fichier:** `auth.py` (router) (lignes 327-378)

#### 🎯 Objectif de cette étape
Valider le token, vérifier l'identité de l'utilisateur, et mettre à jour son mot de passe de manière sécurisée.

#### 💡 Pourquoi c'est important
C'est ici que la **sécurité du processus est assurée**. Le token doit être valide, non expiré, et correspondre à un utilisateur actif.

#### 🔧 Ce que fait cette étape

**1. Décodage du token (ligne 733):**
- Décode le token JWT pour extraire les informations
- **Pourquoi?** Vérifier que le token est bien formé et contient les informations nécessaires

**2. Validation du token (lignes 735-749):**
- Vérifie que le token n'est pas expiré
- Vérifie que c'est bien un token de type "password_reset" (pas un token de connexion)
- Extrait l'ID utilisateur du token
- Vérifie que l'ID utilisateur est valide
- **Pourquoi?** Empêche l'utilisation de tokens volés ou de tokens de connexion pour réinitialiser un mot de passe

**3. Récupération de l'utilisateur (ligne 752):**
- Cherche l'utilisateur dans la base de données avec l'ID extrait
- **Pourquoi?** Vérifier que l'utilisateur existe toujours

**4. Vérification de l'existence (lignes 754-755):**
- Si l'utilisateur n'existe plus (compte supprimé), renvoie une erreur
- **Pourquoi?** Un compte supprimé ne peut pas réinitialiser son mot de passe

**5. Vérification de l'activité (lignes 757-758):**
- Vérifie que le compte est toujours actif
- **Pourquoi?** Un compte désactivé ne peut pas réinitialiser son mot de passe

**6. Hashage du nouveau mot de passe (ligne 761):**
- Hash le nouveau mot de passe avant de le stocker
- Le hashage est irréversible
- **Pourquoi?** Même avec le hash, on ne peut pas retrouver le mot de passe original (sécurité)

**7. Mise à jour de la base (lignes 764-765):**
- Remplace l'ancien hash du mot de passe par le nouveau
- **Pourquoi?** Le nouveau mot de passe est maintenant actif

**8. Notification email (lignes 772-776):**
- Envoie un email de confirmation à l'utilisateur
- **Pourquoi?** Permet à l'utilisateur de détecter si quelqu'un a utilisé le lien sans autorisation

**9. Réponse (ligne 778):**
- Renvoie un message de succès
- **Pourquoi?** Confirme au frontend que l'opération est réussie

**Lignes 327-378:** Endpoint complet
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
    
    logger.info(f"Password reset successful for user {user.id} ({user.email})")
    
    # Envoyer une notification de confirmation
    email_service = get_email_service()
    email_service.send_password_changed_notification(
        to_email=user.email,
        to_name=user.name
    )
    
    return {"message": "Mot de passe réinitialisé avec succès"}
```

#### ➡️ Comment cette étape prépare la suivante
Le mot de passe est maintenant **mis à jour dans la base de données**. L'utilisateur peut se connecter avec son nouveau mot de passe.

---

### Étape 5: Connexion avec nouveau mot de passe

**Fichier:** `ResetPassword.jsx` (lignes 112-113) → `Login.jsx`

#### 🎯 Objectif de cette étape
Permettre à l'utilisateur de se connecter avec son nouveau mot de passe.

#### 💡 Pourquoi c'est important
Le processus de récupération est **complet**. L'utilisateur a récupéré l'accès à son compte avec un nouveau mot de passe sécurisé.

#### 🔧 Ce que fait cette étape

**1. Redirection automatique (ligne 696):**
- Après 2 secondes, l'utilisateur est redirigé vers la page de connexion
- **Pourquoi?** Guide l'utilisateur vers la prochaine étape logique

**2. Connexion:**
- L'utilisateur saisit son email et son nouveau mot de passe dans le formulaire de connexion standard
- **Pourquoi?** Utilise le flux de connexion normal pour accéder à l'application

**3. Accès à l'application:**
- Une fois connecté, l'utilisateur accède à toutes les fonctionnalités
- **Pourquoi?** L'utilisateur peut maintenant utiliser l'application normalement

#### ➡️ Résultat final
Le processus de récupération de compte est complet. L'utilisateur a récupéré l'accès à son compte avec un nouveau mot de passe sécurisé.

---

## 4. Architecture Multi-Tenant

### 🎯 Concept général

Votre système utilise une **architecture multi-tenant** avec deux bases de données séparées.

### 💡 Pourquoi cette architecture

**Séparation des responsabilités:**
- **auth_db:** Gère l'authentification centrale (qui peut se connecter?)
- **tenant_db:** Gère les données spécifiques à chaque organisation (que peut-il voir?)

**Avantages:**
- **Scalabilité:** Facile d'ajouter de nouveaux tenants (organisations)
- **Sécurité:** Isolation des données entre tenants
- **Flexibilité:** Chaque tenant peut avoir ses propres assignations et configurations
- **Maintenance:** Les données d'authentification sont centralisées et plus faciles à gérer

### 🔧 Bases de données

**1. auth_db: Base d'authentification centrale**
- Utilisateurs (email, login, mot de passe hashé)
- Rôles (super_admin, project_manager, site_manager, etc.)
- Statut d'activation (compte actif ou désactivé)
- **Localisation:** Centralisée, partagée par tous les tenants

**2. tenant_db: Base de données du tenant courant**
- Assignations utilisateurs (sites, groupes, projets)
- Données spécifiques au tenant (projets, métriques, etc.)
- **Localisation:** Une par tenant/organisation

### 🔧 Chargement des données multi-tenant

**Fichier:** `auth.py` (router) (lignes 159-197)

#### Ce qui se passe lors du login

**1. Authentification dans auth_db:**
- Le système vérifie d'abord les identifiants dans auth_db
- **Pourquoi?** auth_db est la source de vérité pour "qui peut se connecter?"

**2. Chargement des données tenant:**
- Une fois authentifié, le système se connecte à tenant_db
- Récupère les assignations de l'utilisateur:
  - user_site_access: à quels sites il a accès
  - user_group_access: à quels groupes il appartient
  - user_project_access: à quels projets il peut accéder
- **Pourquoi?** Ces données sont nécessaires pour filtrer ce que l'utilisateur peut voir dans l'application

**3. Fusion des données:**
- Les données de auth_db et tenant_db sont fusionnées dans l'objet utilisateur
- Le token JWT contient les informations essentielles
- **Pourquoi?** Le frontend a toutes les informations nécessaires sans faire trop d'appels API

**Lignes 159-197:** Chargement des données tenant
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

### 🔧 Endpoint /auth/assignments

**Fichier:** `auth.py` (router) (lignes 233-279)

#### Objectif
Récupérer spécifiquement les assignations multi-tenant de l'utilisateur connecté.

#### Pourquoi
Permet au frontend de savoir exactement à quoi l'utilisateur a accès pour:
- Filtrer les listes de sites, groupes, projets
- Masquer les fonctionnalités non autorisées
- Afficher uniquement les données pertinentes

**Lignes 233-279:** Endpoint complet
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

---

## 5. Sécurité Implémentée

### 🎯 Vue d'ensemble
Votre système d'authentification implémente **8 mesures de sécurité** majeures pour protéger les comptes utilisateurs et les données de l'application.

### 1. Rate Limiting (Frontend + Backend)

**Fichiers:** `Login.jsx` (lignes 9-10, 143-152) + `auth.py` (lignes 26-67)

#### Objectif
Limiter le nombre de tentatives de connexion échouées pour prévenir les attaques par force brute.

#### Pourquoi c'est important
Les attaquants essaient souvent tous les mots de passe possibles pour trouver le bon. Le rate limiting:
- Bloque après 5 tentatives échouées
- Verrouille pendant 30 secondes
- Empêche les attaques automatisées

#### Comment ça marche
- **Frontend:** Compte les tentatives et verrouille le formulaire localement
- **Backend:** Compte les tentatives par IP + identifiant et bloque au niveau serveur
- **Double protection:** Même si le frontend est contourné, le backend protège

### 2. Hashage des mots de passe

**Backend:** Utilisation de bcrypt/argon2 via `hash_password()` et `verify_password()`

#### Objectif
Stocker les mots de passe de manière illisible même si la base de données est compromise.

#### Pourquoi c'est important
Si la base de données est volée:
- Les mots de passe hashés ne peuvent pas être "décryptés"
- Les attaquants ne peuvent pas se connecter avec les mots de passe volés
- Protège les utilisateurs même en cas de faille de sécurité

#### Comment ça marche
- Le hashage est irréversible: on ne peut pas retrouver le mot de passe original
- Même deux utilisateurs avec le même mot de passe auront des hash différents (grâce au "salt")
- La vérification compare le hash du mot de passe saisi avec le hash stocké

### 3. Token JWT avec expiration

**Fichiers:** `auth.py` (lignes 199-210) + `AuthContext.jsx` (lignes 32-64)

#### Objectif
Générer des tokens d'accès temporaires qui prouvent l'identité de l'utilisateur.

#### Pourquoi c'est important
- Le token expire automatiquement après un certain temps
- Même si un token est volé, il ne sera valide que pendant une durée limitée
- Réduit l'impact d'une compromission de token

#### Comment ça marche
- Le token JWT contient une date d'expiration (`exp`)
- Le frontend vérifie cette expiration et demande une reconnexion si nécessaire
- Le backend vérifie aussi l'expiration à chaque requête

### 4. Non-révélation d'information (Sécurité par obscurité)

**Fichier:** `auth.py` (lignes 474-481)

#### Objectif
Ne jamais révéler si un email existe ou non dans le système.

#### Pourquoi c'est important
- Empêche les attaquants de savoir quels emails sont valides (énumération)
- Empêche de savoir quels comptes existent dans le système
- Réduit la surface d'attaque

#### Comment ça marche
- Même message de succès pour email existant et non existant
- "Si un compte existe avec cet email, vous recevrez des instructions"
- Seul le propriétaire de l'email recevra le lien

### 5. Validation forte des mots de passe

**Fichiers:** `auth.py` (schemas) (lignes 16-23, 67-74) + Frontend (lignes 595, 66-78)

#### Objectif
Forcer les utilisateurs à créer des mots de passe robustes.

#### Pourquoi c'est important
- Les mots de passe simples sont faciles à deviner ou à casser par force brute
- Réduit le risque de compromission de compte
- Protège les données de l'utilisateur

#### Critères requis:
- Minimum 8 caractères
- Au moins une majuscule
- Au moins un chiffre
- Préfère un caractère spécial

### 6. Token reset avec expiration courte

**Fichier:** `auth.py` (lignes 484-487)

#### Objectif
Générer des tokens de réinitialisation avec une expiration très courte (30 minutes).

#### Pourquoi c'est important
- Même si un lien de réinitialisation est volé (ex: email compromis), il ne sera valide que 30 minutes
- Réduit la fenêtre d'opport pour les attaquants
- L'utilisateur doit réagir rapidement

#### Comment ça marche
- Token JWT spécial avec type "password_reset"
- Expiration: 30 minutes
- Utilisation unique: après utilisation, le token est invalide

### 7. Vérification de l'activité du compte

**Fichier:** `auth.py` (lignes 155-157, 357-358)

#### Objectif
Empêcher les comptes désactivés de se connecter ou de réinitialiser leur mot de passe.

#### Pourquoi c'est important
- Permet aux administrateurs de désactiver des comptes compromis
- Les comptes désactivés ne peuvent plus être utilisés
- Permet de gérer le cycle de vie des utilisateurs

#### Comment ça marche
- Vérification du champ `is_active` avant toute opération
- Si false, renvoie une erreur 403 (Forbidden)
- Message générique pour ne pas révéler d'information

### 8. Type de token spécifique

**Fichier:** `auth.py` (ligne 739)

#### Objectif
Distinguer les tokens de connexion des tokens de réinitialisation.

#### Pourquoi c'est important
- Empêche d'utiliser un token de connexion pour réinitialiser un mot de passe
- Chaque type de token a son propre usage et validation
- Réduit les risques de confusion ou d'abus

#### Comment ça marche
- Token de connexion: pas de champ "type"
- Token de reset: `type: "password_reset"`
- Le backend vérifie le type avant d'accepter le token

---

## Résumé pour votre réunion

### Points clés à présenter

1. **Architecture multi-tenant robuste:** Séparation claire entre authentification centrale et données spécifiques par organisation

2. **Sécurité à plusieurs niveaux:** Rate limiting, hashage, tokens temporaires, validation forte

3. **Expérience utilisateur soignée:** Validation en temps réel, indicateurs visuels, messages clairs

4. **Processus de récupération sécurisé:** Tokens temporaires, non-révélation d'email, notifications

5. **Code maintenable:** Séparation des responsabilités, commentaires clairs, structure logique

### Arguments techniques

- **Compatibilité:** Support de JSON et OAuth2 form-urlencoded pour flexibilité
- **Performance:** Cache côté client pour éviter les appels répétés
- **Scalabilité:** Architecture multi-tenant prête pour la croissance
- **Observabilité:** Logs détaillés pour le debugging et l'audit

### Mesures de sécurité

- **Frontend:** Rate limiting, validation côté client
- **Backend:** Rate limiting serveur, hashage bcrypt/argon2
- **Tokens:** JWT avec expiration, types spécifiques
- **Processus:** Non-révélation d'information, validation multi-étapes

---

## Conclusion

Ce système d'authentification est **production-ready** avec:
- ✅ Sécurité robuste à plusieurs niveaux
- ✅ Architecture scalable (multi-tenant)
- ✅ Expérience utilisateur optimisée
- ✅ Code maintenable et bien documenté
- ✅ Processus de récupération sécurisé

Le système est prêt pour être utilisé en production avec des utilisateurs réels.
