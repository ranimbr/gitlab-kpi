# Présentation Technique - Dashboard KPI GitLab

## 1. Vue d'ensemble du projet

Le **Dashboard KPI GitLab** est une application web complète de monitoring et d'analyse des indicateurs de performance (KPI) pour les équipes de développement utilisant GitLab. Il permet de suivre l'activité des développeurs, les Merge Requests, les commits et de générer des rapports automatisés.

### Objectifs principaux :
- **Centralisation** des métriques GitLab multi-sites
- **Automatisation** des extractions mensuelles
- **Visualisation** interactive des KPIs
- **Gestion des accès** par profils et rôles
- **Alertes intelligentes** basées sur des seuils configurables

---

## 2. Choix Technologiques

### 2.1 Frontend - Stack Moderne et Performant

#### Framework : React 19.2.0 + Vite 7.3.1
**Pourquoi React ?**
- **Écosystème mature** : Bibliothèques riches et maintenues
- **Composants réutilisables** : Architecture modulaire et maintenable
- **Performance** : Virtual DOM optimisé pour les interfaces complexes
- **Community** : Support important et documentation exhaustive

**Pourquoi Vite ?**
- **Développement ultra-rapide** : Hot Module Replacement instantané
- **Build optimisé** : Bundling moderne avec Rollup
- **Configuration minimale** : Convention over configuration
- **Production-ready** : Optimisations automatiques (tree-shaking, code splitting)

#### Bibliothèques clés :
- **React Router DOM 7.13.0** : Navigation SPA (Single Page Application)
- **Chart.js 4.5.1 + ApexCharts 5.6.0 + Recharts 3.8.1** : Visualisation de données multi-approches
- **GSAP 3.15.0** : Animations fluides et performantes
- **Axios 1.13.5** : Client HTTP avec interceptors et retry
- **SweetAlert2 11.26.20** : Notifications utilisateur élégantes
- **react-simple-maps 3.0.0** : Cartographie interactive pour la présence internationale

### 2.2 Backend - API REST Moderne et Scalable

#### Framework : FastAPI 0.115.0
**Pourquoi FastAPI ?**
- **Performance native** : Basé sur Starlette et Pydantic, comparable à Node.js/Go
- **Validation automatique** : Pydantic v2 pour la validation des données
- **Documentation auto-générée** : Swagger UI / OpenAPI 3.1
- **Typage statique** : Support complet des type hints Python
- **Async/await** : I/O non-bloquant pour haute concurrence
- **Sécurité intégrée** : OAuth2, JWT, CORS

#### Serveur : Uvicorn 0.30.6
- **Serveur ASGI** : Support WebSocket et async
- **Production-ready** : Gestion robuste des connexions
- **Hot reload** : Développement efficace

### 2.3 Base de Données - PostgreSQL 15

**Pourquoi PostgreSQL ?**
- **Fiabilité** : ACID compliant, transactions robustes
- **Performance** : Index avancés, requêtes complexes optimisées
- **Extensibilité** : JSONB, extensions GIS, full-text search
- **Open Source** : Pas de coûts de licence
- **Entreprise-ready** : Supporté par les plus grandes entreprises

#### ORM : SQLAlchemy 2.0.36
- **Abstraction puissante** : Mapping objet-relationnel
- **Migration Alembic** : Gestion versionnée du schéma
- **Performance** : Lazy loading, eager loading, caching
- **Type safety** : Intégration avec Pydantic

### 2.4 Authentification & Sécurité

- **JWT (python-jose)** : Tokens stateless, scalables
- **Bcrypt (passlib)** : Hashage sécurisé des mots de passe
- **Cryptography (Fernet)** : Chiffrement des tokens GitLab en base
- **CORS Middleware** : Politique flexible pour le développement
- **Audit Logging** : Traçabilité complète des actions

### 2.5 Orchestration - Docker Compose

**Pourquoi Docker ?**
- **Reproductibilité** : Environnement identique dev/prod
- **Isolation** : Séparation des services (db, backend, frontend)
- **Scalabilité** : Facile à déployer sur Kubernetes
- **Déploiement simplifié** : `docker-compose up`

### 2.6 Data Processing & ML

- **Pandas 2.2.2** : Manipulation de données tabulaires
- **NumPy 1.26.4** : Calculs numériques performants
- **Scikit-learn 1.5.0** : Algorithmes ML pour l'intelligence
- **Statsmodels 0.14.2** : Analyse statistique avancée
- **SciPy 1.13.1** : Fonctions scientifiques

### 2.7 Tâches Planifiées

- **APScheduler 3.10.4** : Scheduler mensuel pour les extractions automatiques
- **Job persistant** : Reprise après crash du serveur

---

## 3. Architecture du Système

### 3.1 Architecture Globale

```
┌─────────────────────────────────────────────────────────────┐
│                        Utilisateur                           │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  - Vite Dev Server (Port 5173/5174)                         │
│  - React Router (Navigation SPA)                             │
│  - Chart.js/ApexCharts (Visualisation)                       │
│  - GSAP (Animations)                                          │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/REST API
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                          │
│  - Uvicorn ASGI Server (Port 8000/8001)                     │
│  - API Router (23 endpoints)                                 │
│  - Middleware (CORS, DB Selector)                             │
│  - Pydantic (Validation)                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐      ┌──────────────────┐
│  PostgreSQL   │      │   GitLab API     │
│  (Port 5432)  │◄─────│  (Externe)       │
│  - SQLAlchemy │      │  - httpx client  │
│  - Alembic    │      │  - Token chiffré │
└───────────────┘      └──────────────────┘
```

### 3.2 Architecture Backend - Pattern Clean Architecture

```
app/
├── api/                    # Couche API (Routes)
│   ├── routers/           # 23 routeurs spécialisés
│   │   ├── auth.py        # Authentification JWT
│   │   ├── kpis.py        # Endpoints KPI
│   │   ├── extraction.py # Extraction GitLab
│   │   └── ...
│   ├── dependencies.py    # Injection de dépendances
│   └── middleware.py      # Middleware CORS/DB
│
├── core/                   # Configuration centrale
│   ├── config.py          # Settings Pydantic
│   ├── security.py        # JWT, Hashage
│   └── logging_config.py  # Configuration logs
│
├── models/                 # ORM SQLAlchemy
│   ├── base.py            # Base class commune
│   ├── app_user.py        # Utilisateurs
│   ├── project.py         # Projets GitLab
│   ├── developer.py       # Développeurs
│   ├── kpi_snapshot.py    # Snapshots KPI
│   └── ...
│
├── schemas/                # Pydantic Schemas (DTO)
│   ├── kpi.py             # Schémas KPI
│   ├── auth.py            # Schémas Auth
│   └── ...
│
├── repositories/           # Data Access Layer
│   ├── kpi_repository.py  # Requêtes KPI
│   ├── user_repository.py # Requêtes Users
│   └── ...
│
├── services/               # Business Logic
│   ├── extraction/       # Service extraction GitLab
│   ├── kpi/               # Calcul KPI
│   ├── scheduler/         # Tâches planifiées
│   └── intelligence/      # Analyse ML
│
└── database/               # Database Layer
    ├── session.py         # Session management
    ├── init_db.py         # Initialisation tables
    └── base.py            # Engine configuration
```

### 3.3 Architecture Frontend - Pattern Component-Based

```
src/
├── components/            # Composants réutilisables
│   ├── charts/           # Graphiques Chart.js/ApexCharts
│   ├── layout/           # Layout (Navbar, Sidebar)
│   └── ui/               # Composants UI génériques
│
├── pages/                 # Pages principales
│   ├── LandingPage.jsx   # Page d'accueil cinématique
│   ├── Dashboard.jsx     # Dashboard principal
│   ├── KPIPage.jsx       # Page KPI
│   └── ...
│
├── services/              # API Clients
│   ├── authService.js    # Authentification
│   ├── kpiService.js     # Appels API KPI
│   └── ...
│
├── context/               # React Context
│   └── AuthContext.jsx   # État authentification
│
└── utils/                 # Utilitaires
    └── helpers.js        # Fonctions utilitaires
```

### 3.4 Flux de Données

#### Extraction GitLab (Mensuelle)
```
1. Scheduler (APScheduler) déclenche extraction
2. Service Extraction appelle GitLab API via httpx
3. Données brutes stockées dans PostgreSQL
4. Calcul KPI automatique (scikit-learn/pandas)
5. Snapshots KPI créés avec seuils
6. Alertes générées si seuils dépassés
7. Notification email/Slack si configuré
```

#### Authentification
```
1. User soumet login (email + password)
2. Backend vérifie credentials (bcrypt hash)
3. Génération JWT token (python-jose)
4. Token retourné au frontend
5. Frontend stocke token (localStorage)
6. Token inclus dans headers Axios
7. Middleware JWT valide chaque requête
```

#### Dashboard KPI
```
1. Frontend request /api/v1/kpis
2. Backend valide JWT
3. Repository query PostgreSQL
4. Calculs agrégés (pandas/numpy)
5. Données retournées au frontend
6. Chart.js/ApexCharts visualise
```

---

## 4. Points Forts Techniques

### 4.1 Performance
- **Async/await** : I/O non-bloquant sur backend
- **Virtual DOM** : React optimise les rendus
- **Index PostgreSQL** : Requêtes rapides
- **Lazy loading** : Chargement à la demande
- **Code splitting** : Vite divise le bundle

### 4.2 Sécurité
- **JWT stateless** : Pas de session serveur
- **Bcrypt** : Hashage sécurisé (cost factor 12)
- **Fernet encryption** : Tokens GitLab chiffrés
- **CORS configuré** : Origines autorisées
- **Audit logging** : Traçabilité complète
- **Rate limiting** : Protection contre abus

### 4.3 Maintenabilité
- **Clean Architecture** : Séparation des responsabilités
- **Type hints** : Python 3.10+ avec mypy ready
- **Pydantic validation** : Contrôle des données
- **Alembic migrations** : Versioning schéma DB
- **Tests unitaires** : pytest avec fixtures
- **Documentation** : Docstrings et commentaires

### 4.2 Scalabilité
- **Docker** : Déploiement containerisé
- **Stateless backend** : Horizontal scaling possible
- **PostgreSQL** : Support millions de rows
- **Connection pooling** : SQLAlchemy pool
- **Async I/O** : Haute concurrence

### 4.5 Expérience Utilisateur
- **SPA fluide** : Navigation sans rechargement
- **Animations GSAP** : Transitions élégantes
- **Notifications** : SweetAlert2
- **Responsive design** : Mobile-friendly
- **Dark mode** : Interface moderne

---

## 5. Architecture de Base de Données

### 5.1 Schéma Principal

**Tables principales :**
- `app_user` : Utilisateurs et rôles
- `gitlab_config` : Configurations GitLab (token chiffré)
- `site` : Sites géographiques (Tunisie, France, etc.)
- `project` : Projets GitLab
- `developer` : Développeurs
- `period` : Périodes temporelles (mensuelles)
- `extraction_lot` : Lots d'extraction
- `commit` : Commits GitLab
- `merge_request` : Merge Requests
- `kpi_definition` : Définitions KPI
- `kpi_snapshot` : Snapshots KPI calculés
- `kpi_threshold` : Seuils d'alerte
- `alert` : Alertes générées
- `dashboard` : Configurations dashboard
- `audit_log` : Journal d'audit

### 5.2 Relations Clés

- **Many-to-Many** : developer ↔ project, project ↔ site
- **One-to-Many** : site → project, project → merge_request
- **Self-referencing** : developer_group → developer

### 5.3 Indexation

- Index partiels sur `status` (merge_request)
- Index composés sur `(period_id, project_id)`
- Index JSONB sur `dashboard_access` (app_user)
- Index COALESCE pour NULL handling

---

## 6. Déploiement

### 6.1 Docker Compose (Développement)

```yaml
services:
  db:          # PostgreSQL 15
  backend:     # FastAPI + Uvicorn
  frontend:    # Vite + React
```

**Commandes :**
```bash
docker-compose up -d          # Démarrer tous les services
docker-compose logs backend   # Logs backend
docker-compose down           # Arrêter
```

### 6.2 Production (Recommandé)

- **Kubernetes** : Orchestration container
- **Nginx** : Reverse proxy + SSL
- **PostgreSQL RDS** : Database managée
- **Redis** : Cache + sessions
- **CI/CD** : GitLab CI ou GitHub Actions

---

## 7. Monitoring & Observabilité

### 7.1 Logs
- **Structured logging** : JSON format
- **Log levels** : DEBUG, INFO, WARNING, ERROR
- **File rotation** : Gestion automatique
- **Audit trail** : Toutes les actions loggées

### 7.2 Health Checks
- **Endpoint `/health`** : Vérification DB + latence
- **Docker healthcheck** : PostgreSQL ready
- **Uptime monitoring** : Disponibilité service

### 7.3 Métriques
- **Response time** : Temps de réponse API
- **DB latency** : Latence requêtes SQL
- **Error rate** : Taux d'erreurs
- **Extraction success** : Taux de succès extraction

---

## 8. Sécurité Renforcée

### 8.1 Authentification
- **JWT avec expiration** : 60 minutes par défaut
- **Refresh tokens** : (Futur) Renouvellement transparent
- **Login lockout** : 5 essais max, lock 5 minutes
- **Password strength** : Validation complexité

### 8.2 Authorization
- **Role-based access** : super_admin, admin, user, viewer
- **Profile system** : Profils personnalisés avec menus
- **Dashboard access** : Accès par dashboard
- **API permissions** : Vérification par endpoint

### 8.3 Data Protection
- **Encryption at rest** : Tokens GitLab chiffrés (Fernet)
- **HTTPS only** : (Prod) TLS obligatoire
- **Environment variables** : Secrets hors code
- **SQL injection prevention** : SQLAlchemy parameterized queries

---

## 9. Roadmap Technique

### Court terme (1-3 mois)
- [ ] Tests E2E avec Playwright
- [ ] CI/CD pipeline automatisé
- [ ] Monitoring Prometheus + Grafana
- [ ] Cache Redis pour les KPIs

### Moyen terme (3-6 mois)
- [ ] WebSocket pour temps réel
- [ ] Export PDF/Excel avancé
- [ ] ML predictions (tendance KPI)
- [ ] Multi-tenancy complet

### Long terme (6-12 mois)
- [ ] Microservices avancés
- [ ] GraphQL API
- [ ] Mobile app (React Native)
- [ ] Intégration Jira/GitHub

---

## 10. Conclusion

Le Dashboard KPI GitLab repose sur une **architecture moderne, scalable et sécurisée** utilisant les **meilleures pratiques actuelles** du développement web :

- **Frontend** : React 19 + Vite pour performance et DX
- **Backend** : FastAPI pour API rapide et bien documentée
- **Database** : PostgreSQL pour fiabilité et performance
- **DevOps** : Docker pour portabilité et reproductibilité
- **Security** : JWT + Encryption + Audit logging
- **Architecture** : Clean Architecture pour maintenabilité

Cette stack technique garantit une **base solide** pour l'évolution du projet et répond aux **exigences enterprise** de l'entreprise TELNET.
