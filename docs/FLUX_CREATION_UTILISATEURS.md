# Flux Technique - Création des Utilisateurs et Architecture Multi-Base de Données

## Vue d'Ensemble de l'Architecture Multi-Base de Données

```
Architecture : 2 Bases de Données PostgreSQL
├── auth_db   : Base partagée pour l'authentification (utilisateurs, mots de passe)
└── telnetdb  : Base tenant principale (données métier par défaut)

Flux de Création d'Utilisateur :
Frontend (RegisterForm)
    ↓
POST /auth/register
    ↓
Backend Router (auth.py)
    ↓
Backend Repository (user_repository.py)
    ↓
Backend Model (app_user.py)
    ↓
Database (auth_db) → INSERT app_user
    ↓
[PAS de réplication automatique]

Flux de Login et Chargement Multi-Tenant :
Frontend (LoginForm)
    ↓
POST /auth/login
    ↓
Backend Router (auth.py)
    ↓
Authentification dans auth_db
    ↓
Chargement des assignations depuis telnetdb
    ↓
Fusion des données en mémoire
    ↓
Génération JWT token
```

---

## Architecture des 2 Bases de Données

### 1. auth_db - Base d'Authentification Partagée

**Rôle** : Stocker les informations d'authentification pour tous les tenants

**Tables principales** :
- `app_user` : Utilisateurs du dashboard (email, login, hashed_password, role)
- `audit_log` : Journal des actions d'audit

**Pourquoi une base séparée ?**
- Séparation des responsabilités : authentification vs données métier
- Sécurité : Les credentials sont isolés des données métier
- Scalabilité : Peut être hébergée sur un serveur dédié
- Multi-tenant : Partagée entre tous les tenants

**Configuration** :
```python
# database/session.py (Ligne 35)
AUTH_DB = "auth_db"

def get_auth_session():
    """Returns a session for the shared auth database (auth_db)"""
    auth_engine = get_auth_engine()
    if AUTH_DB not in _sessionmakers:
        _sessionmakers[AUTH_DB] = sessionmaker(bind=auth_engine, autoflush=False, autocommit=False)
    return _sessionmakers[AUTH_DB]()
```

---

### 2. telnetdb - Base Tenant Principale

**Rôle** : Stocker les données métier du tenant principal

**Tables principales** :
- `developer` : Développeurs GitLab
- `developer_site` : Affectations développeur → site (SCD Type 2)
- `developer_group_link` : Affectations développeur → groupe (SCD Type 2)
- `developer_project` : Missions développeur → projet (SCD Type 2)
- `commit` : Commits GitLab
- `merge_request` : Merge Requests GitLab
- `kpi_snapshot` : Snapshots KPI
- `extraction_lot` : Lots d'extraction
- `period` : Périodes temporelles
- `site` : Sites géographiques
- `project` : Projets
- `developer_group` : Groupes d'équipes
- `user_site_access` : Assignations utilisateurs → sites (multi-tenant)
- `user_group_access` : Assignations utilisateurs → groupes (multi-tenant)
- `user_project_access` : Assignations utilisateurs → projets (multi-tenant)

**Pourquoi une base séparée ?**
- Isolation des données métier par tenant
- Performance : Les requêtes métier ne sont pas ralenties par l'authentification
- Flexibilité : Peut être migrée ou sauvegardée indépendamment

**Configuration** :
```python
# database/session.py (Ligne 24-28)
try:
    parsed = urllib.parse.urlparse(settings.DATABASE_URL or "")
    DEFAULT_DB = parsed.path.lstrip('/') or "telnetdb"
except Exception:
    DEFAULT_DB = "telnetdb"
```

---

## ÉTAPE 1 : Frontend - Formulaire d'Inscription

**Fichier** : Frontend (non spécifié dans l'analyse, typiquement RegisterForm.jsx)

### Requête HTTP envoyée
```
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123!",
  "login": "johndoe",
  "name": "John Doe"
}
```

### Ce qui se passe
- L'utilisateur remplit le formulaire d'inscription
- Le frontend valide le mot de passe (8+ caractères, 1 majuscule, 1 chiffre)
- Le frontend envoie la requête POST au backend

---

## ÉTAPE 2 : Backend - Réception de la Requête Register

**Fichier** : `dataCollection/src/backend/app/api/routers/auth.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\auth.py`

### Code Backend (Ligne 70-91)
```python
@router.post("/register", response_model=UserResponse, status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_auth_db)):
    if repo.email_exists(db, request.email):
        raise _http_error(400, "AUTH_EMAIL_ALREADY_REGISTERED", "Email already registered")

    if request.login and repo.get_by_login(db, request.login):
        raise _http_error(400, "AUTH_LOGIN_ALREADY_TAKEN", "Login already taken")

    # ✅ FIX : hash dans le router — pas de mot de passe en clair dans le repo
    hashed = hash_password(request.password)

    user = repo.create_user(
        db              = db,
        email           = request.email,
        hashed_password = hashed,
        login           = request.login,
        name            = request.name,
    )
    db.commit()
    db.refresh(user)
    logger.info(f"User registered — id={user.id} email={user.email}")
    return user
```

### Ce qui se passe
- FastAPI reçoit la requête POST
- Il utilise `get_auth_db` pour obtenir une session vers `auth_db`
- Il vérifie si l'email existe déjà
- Il vérifie si le login existe déjà
- Il hash le mot de passe avec bcrypt
- Il appelle le repository pour créer l'utilisateur
- Il commit la transaction dans `auth_db`

---

## ÉTAPE 3 : Backend - Validation du Schéma

**Fichier** : `dataCollection/src/backend/app/schemas/auth.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\schemas\auth.py`

### Code Backend (Ligne 10-23)
```python
class RegisterRequest(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=8, description="Minimum 8 caractères")
    login:    Optional[str] = Field(default=None, min_length=2, max_length=100)
    name:     Optional[str] = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_password_strength(self) -> "RegisterRequest":
        pwd = self.password
        if not any(c.isupper() for c in pwd):
            raise ValueError("Le mot de passe doit contenir au moins une majuscule.")
        if not any(c.isdigit() for c in pwd):
            raise ValueError("Le mot de passe doit contenir au moins un chiffre.")
        return self
```

### Ce qui se passe
- Pydantic valide automatiquement le format de l'email
- Pydantic valide la longueur du mot de passe (min 8 caractères)
- Le validator personnalisé vérifie la présence d'une majuscule
- Le validator personnalisé vérifie la présence d'un chiffre
- Si validation échoue, FastAPI retourne une erreur 400

---

## ÉTAPE 4 : Backend - Repository - Création de l'Utilisateur

**Fichier** : `dataCollection/src/backend/app/repositories/user_repository.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\repositories\user_repository.py`

### Code Backend (Méthode create_user)
```python
def create_user(
    self,
    db: Session,
    email: str,
    hashed_password: str,
    login: Optional[str] = None,
    name: Optional[str] = None,
    role: Optional[UserRoleEnum] = None,
    site_id: Optional[int] = None,
    group_id: Optional[int] = None,
) -> AppUser:
    """
    Crée un nouvel utilisateur dans la base de données.
    """
    user = AppUser(
        email=email,
        hashed_password=hashed_password,
        login=login,
        name=name,
        role=role or UserRoleEnum.developer,
        is_active=True,
        site_id=site_id,
        group_id=group_id,
    )
    db.add(user)
    db.flush()
    return user
```

### Ce qui se passe
- Le repository crée une instance du modèle `AppUser`
- Il définit les attributs : email, hashed_password, login, name, role, is_active
- Il ajoute l'utilisateur à la session SQLAlchemy
- Il flush la session (sans commit) pour obtenir l'ID généré
- Il retourne l'utilisateur créé

---

## ÉTAPE 5 : Backend - Model - Définition de l'Utilisateur

**Fichier** : `dataCollection/src/backend/app/models/app_user.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\models\app_user.py`

### Code Backend (Ligne 44-100)
```python
class UserRoleEnum(str, enum.Enum):
    # ✅ CORRECTION : 6 rôles granulaires (remplace admin/user)
    super_admin     = "super_admin"    # Accès total
    site_manager    = "site_manager"   # Accès limité à son site
    project_manager = "project_manager" # Accès limité à ses projets assignés
    team_lead       = "team_lead"      # Accès limité à son groupe d'équipe
    viewer          = "viewer"         # Accès flexible (sites, équipes, projets combinés)
    developer       = "developer"      # Lecture seule de ses propres KPIs


class AppUser(Base):

    __tablename__ = "app_user"

    id              = Column(Integer, primary_key=True)
    email           = Column(String(255), unique=True, nullable=False)
    login           = Column(String(100), unique=True, nullable=True)
    name            = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(
        Enum(UserRoleEnum),
        default=UserRoleEnum.developer,
        nullable=False,
    )
    is_active = Column(Boolean, default=True, nullable=False)

    # ⚠️  PostgreSQL uniquement — liste des Dashboard.id accessibles
    dashboard_access = Column(ARRAY(Integer), nullable=True, default=list)

    # ✅ AJOUT : FK vers Site (pour les site_managers)
    # NULL pour super_admin et team_lead
    site_id = Column(
        Integer,
        ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ✅ AJOUT : FK vers DeveloperGroup (pour les team_leads)
    # NULL pour super_admin et site_manager
    group_id = Column(
        Integer,
        ForeignKey("developer_group.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ✅ AJOUT : FK vers Profile (pour la gestion des menus)
    # NULL signifie qu'aucun profil personnalisé n'est assigné
    profile_id = Column(
        Integer,
        ForeignKey("profile.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ✅ AJOUT : FK vers Role (pour la gestion dynamique des rôles)
    # NULL signifie que l'utilisateur utilise l'ancien système enum
    # Pour la compatibilité ascendante, on garde les deux systèmes
    role_id = Column(
        Integer,
        ForeignKey("role.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── RELATIONS ─────────────────────────────────────────────────────────────
    # Relations pour multi-tenant (site_accesses, group_accesses, project_accesses)
    site_accesses = relationship("UserSiteAccess", back_populates="user", cascade="all, delete-orphan")
    group_accesses = relationship("UserGroupAccess", back_populates="user", cascade="all, delete-orphan")
    project_accesses = relationship("UserProjectAccess", back_populates="user", cascade="all, delete-orphan")
```

### Ce qui se passe
- SQLAlchemy mappe la classe `AppUser` à la table `app_user`
- Les colonnes sont définies avec leurs types et contraintes
- Les clés étrangères (site_id, group_id, profile_id, role_id) sont définies
- Les relations ORM (site_accesses, group_accesses, project_accesses) sont définies
- Les données sont stockées dans `auth_db`

---

## ÉTAPE 6 : Database - Insertion dans auth_db

**Base de données** : `auth_db`

### SQL exécuté
```sql
INSERT INTO app_user (
    email,
    login,
    name,
    hashed_password,
    role,
    is_active,
    dashboard_access,
    site_id,
    group_id,
    profile_id,
    role_id,
    created_at,
    updated_at
)
VALUES (
    'user@example.com',
    'johndoe',
    'John Doe',
    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31l',  -- bcrypt hash
    'developer',
    true,
    ARRAY[]::INTEGER[],
    NULL,
    NULL,
    NULL,
    NULL,
    NOW(),
    NOW()
)
RETURNING id;
```

### Ce qui se passe
- L'utilisateur est inséré dans la table `app_user` de `auth_db`
- Le mot de passe est stocké hashé avec bcrypt (jamais en clair)
- L'ID généré est retourné pour être utilisé dans les autres bases
- Les timestamps created_at et updated_at sont automatiquement générés

---

## ÉTAPE 7 : Backend - Login et Chargement Multi-Tenant

**Fichier** : `dataCollection/src/backend/app/api/routers/auth.py`

### Code Backend (Ligne 94-150)
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
```

### Ce qui se passe
- L'authentification se fait dans `auth_db` (email + mot de passe)
- Si authentification réussie, le système charge les données tenant depuis la base courante
- Le système fusionne les données tenant avec l'utilisateur authentifié
- Le système charge les assignations multi-sites/multi-équipes/multi-projets
- Le système génère un JWT token pour l'utilisateur

---

## Résumé Chronologique du Flux de Création d'Utilisateur

| Étape | Couche | Fichier | Base de données | Action | Résultat |
|-------|-------|--------|----------------|--------|----------|
| 1 | Frontend | RegisterForm.jsx | - | Formulaire inscription | Envoi POST /auth/register |
| 2 | Backend Router | auth.py | - | Réception POST | Validation schéma |
| 3 | Backend Schema | auth.py | - | Validation Pydantic | Vérification mot de passe |
| 4 | Backend Router | auth.py | - | Hash mot de passe | bcrypt hash |
| 5 | Backend Repository | user_repository.py | - | create_user() | Instance AppUser |
| 6 | Backend Model | app_user.py | - | Définition modèle | Mapping SQLAlchemy |
| 7 | Database | - | auth_db | INSERT app_user | Utilisateur créé |
| 8 | Backend Router | auth.py | - | Commit transaction | Validation en base |
| 9 | Frontend | RegisterForm.jsx | - | Réponse 201 | Utilisateur créé |

**NOTE IMPORTANTE** : Il n'y a PAS de réplication automatique de l'utilisateur vers telnetdb lors de la création. L'utilisateur existe UNIQUEMENT dans auth_db.

---

## Points Clés de l'Architecture Multi-Base de Données

### 1. Séparation des Responsabilités

**auth_db** :
- Stocke uniquement les données d'authentification (app_user, audit_log)
- Partagée entre tous les tenants
- Isolée des données métier
- Optimisée pour les requêtes d'authentification

**telnetdb** :
- Stocke les données métier (developer, commit, merge_request, kpi_snapshot, etc.)
- Base par défaut pour le tenant principal
- Contient également les assignations multi-tenant (user_site_access, user_group_access, user_project_access)
- Optimisée pour les requêtes métier

### 2. Sécurité

- **Mot de passe hashé** : Jamais stocké en clair, uniquement bcrypt hash
- **Isolation** : Les credentials sont isolés des données métier
- **Rate limiting** : Protection contre les attaques par force brute
- **JWT Token** : Authentification stateless pour les requêtes API

### 3. Performance

- **Connection pooling** : Chaque base a son propre pool de connexions
- **LRU cache** : Les engines sont mis en cache avec éviction LRU
- **Async queries** : Les requêtes sont asynchrones pour éviter le blocage
- **Indexation** : Les tables sont indexées pour les requêtes fréquentes

### 4. Multi-Tenant Dynamique

- **Chargement dynamique** : Les assignations sont chargées depuis telnetdb lors du login
- **Fusion en mémoire** : Les données auth_db et telnetdb sont fusionnées dans l'objet utilisateur
- **Pas de réplication** : L'utilisateur n'est PAS répliqué automatiquement dans telnetdb
- **Assignations flexibles** : Les utilisateurs peuvent avoir des accès multi-sites/multi-équipes/multi-projets

---

## Configuration des Bases de Données

### Fichier de Configuration

**Fichier** : `dataCollection/src/backend/app/core/config.py`

### Code Backend (Ligne 38-48)
```python
# ── Database ─────────────────────────────────────────────────────────────
POSTGRES_USER:     str = "postgres"
POSTGRES_PASSWORD: str = "postgres"
POSTGRES_HOST:     str = "localhost"
POSTGRES_PORT:     str = "5432"
POSTGRES_DB:       str = "kpi_dashboard"

# DATABASE_URL peut être fourni directement dans .env (ex: docker-compose)
# Sinon, il est construit depuis les variables POSTGRES_* ci-dessus.
DATABASE_URL: Optional[str] = None
AUTO_CREATE_SCHEMAS: bool = True
```

### Construction de l'URL de Base de Données

```python
@model_validator(mode="after")
def build_database_url(self) -> "Settings":
    if not self.DATABASE_URL:
        self.DATABASE_URL = (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )
    return self
```

### Résultat
```
DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/kpi_dashboard"
```

---

## Gestion Dynamique des Bases de Données

### Fichier de Session

**Fichier** : `dataCollection/src/backend/app/database/session.py`

### Code Backend (Ligne 59-101)
```python
def get_engine_for_db(db_name: str):
    if not db_name:
        db_name = DEFAULT_DB  # telnetdb par défaut

    with db_lock:
        if db_name in _engines:
            _last_used[db_name] = time.time()
            return _engines[db_name]

        # Manage LRU cache for engines (evict least recently used, keeping default/auth db pinned)
        evictable = [db for db in _engines if db not in (AUTH_DB, DEFAULT_DB)]
        if len(_engines) >= MAX_CACHED_ENGINES and evictable:
            oldest_db = min(evictable, key=lambda db: _last_used.get(db, 0))
            logger.info(f"[DB Eviction] Closing engine for database '{oldest_db}' to release connection pool resources.")
            try:
                _engines[oldest_db].dispose()
            except Exception as e:
                logger.warning(f"Failed to dispose of engine for database '{oldest_db}': {e}")
            _engines.pop(oldest_db, None)
            _sessionmakers.pop(oldest_db, None)
            _last_used.pop(oldest_db, None)

        # Check/create database if it doesn't exist on server
        create_db_if_not_exists(db_name)

        # Construct URL for the specific database name
        parsed = urllib.parse.urlparse(settings.DATABASE_URL)
        db_url = urllib.parse.urlunparse(parsed._replace(path=f"/{db_name}"))

        # Create the engine
        new_engine = create_engine(
            db_url,
            pool_pre_ping = True,
            pool_size     = 10,
            max_overflow  = 20,
            pool_timeout  = 30,
            pool_recycle  = 1800,
            echo          = settings.DEBUG,
        )

        _engines[db_name] = new_engine
        _last_used[db_name] = time.time()
```

### Ce qui se passe
- Le système maintient un cache de engines SQLAlchemy
- Si la base est déjà dans le cache, il retourne l'engine existant
- Si le cache est plein, il évicte la base la moins récemment utilisée (LRU)
- Il crée la base de données si elle n'existe pas
- Il crée un nouvel engine avec un pool de connexions
- Il configure le pool pour optimiser les performances

---

## Conclusion

L'architecture multi-base de données du système permet :

1. **Séparation des responsabilités** : auth_db pour l'authentification, telnetdb pour les données métier
2. **Sécurité** : Isolation des credentials des données métier
3. **Performance** : Optimisation des requêtes par base
4. **Multi-tenant dynamique** : Chargement des assignations depuis telnetdb lors du login
5. **Flexibilité** : Migration et sauvegarde indépendantes

Le flux de création d'utilisateur suit ce pattern :
- Frontend → Backend Router → Backend Schema → Backend Repository → Backend Model → auth_db (UNIQUEMENT)

Le flux de login et multi-tenant suit ce pattern :
- Frontend → Backend Router → Authentification auth_db → Chargement assignations telnetdb → Fusion en mémoire → JWT token

Cette architecture garantit une séparation claire des responsabilités tout en maintenant la cohérence des données via le chargement dynamique des assignations multi-tenant.
