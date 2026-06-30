# Architecture Backend Détaillée - Explication des Couches et Relations

## 1. Pourquoi cette Architecture ? (Clean Architecture)

L'architecture backend suit le pattern **Clean Architecture** (aussi appelé **Onion Architecture** ou **Layered Architecture**). Ce choix est motivé par :

### Objectifs principaux :
- **Séparation des responsabilités** : Chaque couche a un rôle unique
- **Testabilité** : Facile à tester unitairement chaque couche
- **Maintenabilité** : Modifier une couche sans impacter les autres
- **Scalabilité** : Ajouter de nouvelles fonctionnalités sans refactor
- **Réutilisabilité** : Réutiliser les repositories et services dans différents contextes

---

## 2. Vue d'Ensemble des Couches

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (api/)                          │
│  - Routers (endpoints HTTP)                                   │
│  - Dependencies (injection de dépendances)                    │
│  - Middleware (CORS, DB selector)                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Schemas Layer (schemas/)                     │
│  - Pydantic models (validation, sérialisation)               │
│  - DTOs (Data Transfer Objects)                               │
│  - Request/Response models                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 Services Layer (services/)                   │
│  - Business logic (logique métier)                           │
│  - Orchestration des repositories                             │
│  - Calculs complexes (KPI, ML)                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Repositories Layer (repositories/)               │
│  - Data Access Layer (accès aux données)                     │
│  - Requêtes SQL via SQLAlchemy                               │
│  - Abstraction de la base de données                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 Models Layer (models/)                        │
│  - SQLAlchemy ORM models                                     │
│  - Mapping objet-relationnel                                 │
│  - Relations entre tables                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               Database Layer (database/)                      │
│  - Session management                                         │
│  - Engine configuration                                       │
│  - Connection pooling                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Explication Détaillée de Chaque Dossier

### 3.1 `api/` - Couche API (Presentation Layer)

**Rôle** : Point d'entrée HTTP de l'application. Gère les requêtes/réponses HTTP.

**Contenu** :
- `routers/` : 23 routeurs spécialisés (auth, kpis, developers, extraction, etc.)
- `dependencies.py` : Injection de dépendances (get_current_user, get_db)
- `middleware.py` : Middleware CORS, DatabaseSelectorMiddleware
- `api_router.py` : Router principal qui inclut tous les sous-routeurs

**Pourquoi séparé ?**
- **Isolation HTTP** : Logique HTTP séparée de la logique métier
- **Documentation** : FastAPI génère automatiquement la Swagger UI
- **Validation** : Pydantic valide les requêtes avant d'atteindre la logique métier
- **Testabilité** : Facile de tester les endpoints avec des mocks

**Exemple de flux** :
```python
# api/routers/auth.py
@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    # 1. Validation Pydantic automatique
    # 2. Appel au repository
    user = repo.get_by_email(db, request.email)
    # 3. Appel au service de sécurité
    if verify_password(request.password, user.hashed_password):
        token = create_access_token(user.id)
    # 4. Retour via Schema Pydantic
    return TokenResponse(access_token=token)
```

---

### 3.2 `schemas/` - Couche Schemas (Data Transfer Objects)

**Rôle** : Définit la structure des données échangées entre l'API et le frontend. Validation et sérialisation.

**Pourquoi Pydantic ?**
- **Validation automatique** : Vérifie types, formats, contraintes
- **Sérialisation** : Convertit les objets Python en JSON
- **Documentation** : Génère les schémas OpenAPI automatiquement
- **Type safety** : Type hints Python pour l'IDE

**Types de schemas** :
- `*Request` : Données reçues du frontend (ex: `LoginRequest`)
- `*Response` : Données envoyées au frontend (ex: `UserResponse`)
- `*Base` : Champs communs (ex: `UserBase`)
- `*Create` : Données pour création (ex: `UserCreate`)
- `*Update` : Données pour mise à jour (ex: `UserUpdate`)

**Exemple** :
```python
# schemas/user.py
class UserResponse(BaseModel):
    id: int
    email: EmailStr
    login: str
    role: UserRoleEnum
    is_active: bool
    
    model_config = {"from_attributes": True}  # Convertit depuis SQLAlchemy
```

**Pourquoi séparé des models ?**
- **API vs Database** : Les schemas représentent le contrat API, pas la structure DB
- **Flexibilité** : Peut exposer/masquer des champs selon le contexte
- **Validation** : Règles de validation différentes pour API vs DB
- **Versioning** : Facile de versionner l'API sans changer la DB

---

### 3.3 `services/` - Couche Services (Business Logic Layer)

**Rôle** : Contient la logique métier complexe. Orchestre les repositories et applique les règles métier.

**Pourquoi séparé ?**
- **Logique métier centralisée** : Règles métier non dispersées dans les routers
- **Réutilisabilité** : Services utilisables par plusieurs endpoints
- **Testabilité** : Facile de tester la logique métier sans HTTP
- **Complexité** : Isoler les calculs complexes (KPI, ML)

**Sous-dossiers** :
- `extraction/` : Service d'extraction GitLab
- `kpi/` : Calcul des KPI
- `intelligence/` : Analyse ML
- `scheduler/` : Tâches planifiées
- `admin/` : Fonctions admin

**Exemple de flux** :
```python
# services/kpi/kpi_calculator.py
class KpiCalculator:
    def calculate_mr_rate(self, db: Session, period_id: int):
        # 1. Récupère les données via repositories
        mrs = mr_repository.get_by_period(db, period_id)
        developers = dev_repository.get_active(db)
        
        # 2. Applique la logique métier
        mr_count = len(mrs)
        dev_count = len(developers)
        
        # 3. Calcul complexe
        if dev_count > 0:
            rate = mr_count / dev_count
        else:
            rate = 0
            
        # 4. Retourne le résultat
        return rate
```

**Relation avec repositories** :
- Services **orchestrent** les repositories
- Un service peut appeler **plusieurs repositories**
- Services contiennent la **logique métier**, repositories contiennent la **logique d'accès aux données**

---

### 3.4 `repositories/` - Couche Repositories (Data Access Layer)

**Rôle** : Abstraction de l'accès aux données. Encapsule toutes les requêtes SQL via SQLAlchemy.

**Pourquoi séparé ?**
- **Abstraction DB** : Cache la complexité de SQLAlchemy
- **Réutilisabilité** : Requêtes réutilisables dans plusieurs services
- **Testabilité** : Facile de mocker les repositories pour les tests
- **Maintenance** : Centraliser les requêtes SQL

**Pattern Repository** :
- Chaque repository correspond à une entité (table)
- Méthodes CRUD standard : `get_all`, `get_by_id`, `create`, `update`, `delete`
- Méthodes métier spécifiques : `get_by_email`, `get_active_users`, etc.

**Exemple** :
```python
# repositories/user_repository.py
class AppUserRepository(BaseRepository[AppUser]):
    def get_by_email(self, db: Session, email: str) -> Optional[AppUser]:
        """Requête SQL encapsulée"""
        return db.query(AppUser).filter(AppUser.email == email).one_or_none()
    
    def get_active_users(self, db: Session) -> List[AppUser]:
        """Requête avec filtre"""
        return db.query(AppUser).filter(AppUser.is_active.is_(True)).all()
```

**Relation avec models** :
- Repositories utilisent les **models SQLAlchemy**
- Repositories retournent des **instances de models**
- Repositories ne connaissent pas les schemas (couche inférieure)

---

### 3.5 `models/` - Couche Models (ORM Layer)

**Rôle** : Définit la structure de la base de données via SQLAlchemy ORM. Mapping objet-relationnel.

**Pourquoi séparé ?**
- **Structure DB centralisée** : Définition unique du schéma
- **Relations** : Définit les relations entre tables (FK, Many-to-Many)
- **Validation DB** : Contraintes au niveau de la DB (nullable, unique, etc.)
- **Migration** : Alembic utilise les models pour générer les migrations

**Contenu** :
- Chaque fichier correspond à une table
- Hérite de `Base` (classe de base SQLAlchemy)
- Définit les colonnes, types, relations

**Exemple** :
```python
# models/app_user.py
class AppUser(Base):
    __tablename__ = "app_user"
    
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRoleEnum), default=UserRoleEnum.developer)
    is_active = Column(Boolean, default=True)
    
    # Relations
    site_accesses = relationship("UserSiteAccess", back_populates="user")
```

**Relation avec database** :
- Models sont utilisés par SQLAlchemy pour créer les tables
- `Base.metadata.create_all()` génère le DDL SQL

---

### 3.6 `database/` - Couche Database (Infrastructure Layer)

**Rôle** : Configuration de la connexion à la base de données, gestion des sessions.

**Contenu** :
- `session.py` : Session management, get_db dependency
- `init_db.py` : Initialisation des tables
- `base.py` : Engine configuration

**Pourquoi séparé ?**
- **Configuration centralisée** : URL DB, pooling, etc.
- **Session management** : Gestion du cycle de vie des sessions
- **Connection pooling** : Optimisation des connexions

---

### 3.7 `core/` - Configuration et Utilitaires

**Rôle** : Configuration centrale, sécurité, logging.

**Contenu** :
- `config.py` : Settings Pydantic (variables d'environnement)
- `security.py` : JWT, hashage, chiffrement
- `logging_config.py` : Configuration des logs

**Pourquoi séparé ?**
- **Configuration centralisée** : Un seul point de configuration
- **Réutilisabilité** : Fonctions de sécurité utilisées partout
- **Maintenabilité** : Facile de modifier la configuration

---

## 4. Flux de Données Complet

### Exemple : Login d'un utilisateur

```
1. Frontend envoie POST /api/v1/auth/login
   ↓
2. api/routers/auth.py (Router)
   - Validation Pydantic de LoginRequest
   - Injection de la session DB
   ↓
3. repositories/user_repository.py (Repository)
   - get_by_email(db, email)
   - Requête SQL : SELECT * FROM app_user WHERE email = ?
   ↓
4. models/app_user.py (Model)
   - Instance AppUser retournée
   ↓
5. core/security.py (Service)
   - verify_password(password, hashed_password)
   - create_access_token(user_id)
   ↓
6. schemas/auth.py (Schema)
   - TokenResponse(access_token=token)
   - Sérialisation JSON
   ↓
7. Réponse HTTP 200 au frontend
```

### Exemple : Calcul d'un KPI

```
1. Frontend envoie GET /api/v1/kpis?period_id=1
   ↓
2. api/routers/kpis.py (Router)
   - Validation des query params
   - Injection de la session DB
   ↓
3. services/kpi/kpi_calculator.py (Service)
   - Orchestration des repositories
   ↓
4. repositories/ (Multiple)
   - mr_repository.get_by_period(db, period_id)
   - dev_repository.get_active(db)
   - commit_repository.get_by_period(db, period_id)
   ↓
5. models/ (Multiple)
   - MergeRequest, Developer, Commit instances
   ↓
6. services/kpi/kpi_calculator.py (Service)
   - Calculs complexes (pandas, numpy)
   - Application des règles métier
   ↓
7. repositories/kpi_snapshot_repository.py (Repository)
   - create(db, kpi_snapshot)
   - Sauvegarde du résultat
   ↓
8. schemas/kpi.py (Schema)
   - KpiResponse
   - Sérialisation JSON
   ↓
9. Réponse HTTP 200 au frontend
```

---

## 5. Relations Entre les Couches

### Règles de dépendance (Dependency Rule)

```
Les dépendances ne doivent pointer que vers l'intérieur (vers le centre) :

API → Schemas → Services → Repositories → Models → Database
  ↑                                                ↑
  └────────────────────────────────────────────────┘
```

**Règles importantes** :
- **API** peut dépendre de Schemas, Services, Repositories
- **Schemas** ne dépend de rien (ou seulement d'enums)
- **Services** peuvent dépendre de Repositories et d'autres Services
- **Repositories** peuvent dépendre de Models
- **Models** ne dépendent de rien (sauf de Base)
- **Database** est la couche la plus basse

**Ce qui est INTERDIT** :
- ❌ Repository qui dépend d'un Schema
- ❌ Service qui dépend d'un Router
- ❌ Model qui dépend d'un Repository
- ❌ API qui accède directement à la DB (sans repository)

---

## 6. Avantages de Cette Architecture

### 6.1 Testabilité

Chaque couche peut être testée indépendamment :

```python
# Test du repository (sans DB réelle)
def test_get_by_email():
    mock_db = Mock()
    repo = AppUserRepository()
    user = repo.get_by_email(mock_db, "test@test.com")
    assert user is not None

# Test du service (avec repositories mockés)
def test_calculate_kpi():
    mock_mr_repo = Mock()
    mock_dev_repo = Mock()
    service = KpiCalculator(mock_mr_repo, mock_dev_repo)
    kpi = service.calculate_mr_rate(mock_db, 1)
    assert kpi == 5.2
```

### 6.2 Maintenabilité

Modifier une couche sans impacter les autres :

- **Changer de DB** : Modifier seulement `database/` et `repositories/`
- **Changer l'API** : Modifier seulement `api/` et `schemas/`
- **Ajouter une règle métier** : Modifier seulement `services/`
- **Changer le schéma DB** : Modifier seulement `models/` et générer une migration

### 6.3 Scalabilité

Ajouter de nouvelles fonctionnalités facilement :

- **Nouveau endpoint** : Ajouter un router dans `api/routers/`
- **Nouvelle entité** : Ajouter model, schema, repository
- **Nouveau service** : Ajouter dans `services/`
- **Nouveau calcul KPI** : Ajouter dans `services/kpi/`

---

## 7. Exemple Concret : Créer un Nouveau Endpoint

Pour créer un endpoint `GET /api/v1/stats/summary` :

### Étape 1 : Créer le Schema
```python
# schemas/stats.py
class StatsResponse(BaseModel):
    total_users: int
    total_projects: int
    total_kpis: int
```

### Étape 2 : Créer le Repository (si nécessaire)
```python
# repositories/stats_repository.py
class StatsRepository(BaseRepository):
    def get_summary(self, db: Session) -> dict:
        user_count = db.query(AppUser).count()
        project_count = db.query(Project).count()
        kpi_count = db.query(KpiSnapshot).count()
        return {
            "total_users": user_count,
            "total_projects": project_count,
            "total_kpis": kpi_count
        }
```

### Étape 3 : Créer le Router
```python
# api/routers/stats.py
from app.repositories.stats_repository import StatsRepository
from app.schemas.stats import StatsResponse

router = APIRouter(prefix="/stats", tags=["Stats"])
repo = StatsRepository()

@router.get("/summary", response_model=StatsResponse)
def get_summary(db: Session = Depends(get_db)):
    return repo.get_summary(db)
```

### Étape 4 : Enregistrer le Router
```python
# api/api_router.py
from app.api.routers import stats

api_router.include_router(stats.router)
```

**Résultat** : Nouveau endpoint fonctionnel en respectant l'architecture !

---

## 8. Bonnes Pratiques

### 8.1 Nommage

- **Models** : Nom de la table en PascalCase (ex: `AppUser`)
- **Schemas** : Suffixe selon le rôle (ex: `UserResponse`, `LoginRequest`)
- **Repositories** : Suffixe `Repository` (ex: `AppUserRepository`)
- **Services** : Suffixe `Service` ou nom fonctionnel (ex: `KpiCalculator`)
- **Routers** : Nom de la ressource au pluriel (ex: `users.py`, `kpis.py`)

### 8.2 Single Responsibility

Chaque classe/fonction a une seule responsabilité :
- Router : Gère HTTP
- Schema : Valide/sérialise
- Service : Logique métier
- Repository : Accès aux données
- Model : Structure DB

### 8.3 DRY (Don't Repeat Yourself)

- Réutiliser les repositories dans plusieurs services
- Réutiliser les schemas dans plusieurs endpoints
- Réutiliser les services dans plusieurs routers

### 8.4 Documentation

- Docstrings pour chaque classe et fonction importante
- Commentaires pour la logique complexe
- Type hints pour tous les paramètres et retours

---

## 9. Conclusion

Cette architecture **Clean Architecture** offre une base solide et maintenable pour le projet :

- **Séparation claire** des responsabilités
- **Testabilité** maximale
- **Maintenabilité** à long terme
- **Scalabilité** pour l'avenir
- **Réutilisabilité** du code

Chaque couche a un rôle précis et les dépendances sont bien définies, ce qui facilite le développement, les tests et la maintenance.
