# Guide de Déploiement Gratuit - GitLab KPI Dashboard

## Architecture Multi-Tenant
- **Backend:** Render.com (FastAPI)
- **Frontend:** Render.com (React/Vite)
- **3 Bases de données:** Neon.tech (PostgreSQL serverless)
  - **auth_db** - Base d'authentification (login, users)
  - **telnet_db** - Base tenant Telnet
  - **gitlab_kpi1** - Base tenant GitLab KPI

**Architecture de l'application:**
- Login via auth_db
- Switch entre bases tenant via la topbar
- Chaque tenant a sa propre base de données

---

## ÉTAPE 1: Créer les 3 bases de données sur Neon.tech

1. Créer un compte sur https://neon.tech
2. Créer 3 projets séparés (un par base de données):
   - `gitlab-kpi-auth-db`
   - `gitlab-kpi-telnet-db`
   - `gitlab-kpi-main-db`

3. Pour chaque projet, récupérer:
   - Connection string (format: `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`)
   - Sauvegarder dans un fichier `.env.render`

### ÉTAPE 2: Préparer les variables d'environnement

Créer fichier `.env.render` à la racine:

```env
# Base de données Auth (pour login/users)
POSTGRES_AUTH_HOST=ep-xxx.region.aws.neon.tech
POSTGRES_AUTH_PORT=5432
POSTGRES_AUTH_USER=neondb_owner
POSTGRES_AUTH_PASSWORD=votre_password
POSTGRES_AUTH_DB=neondb

# Base de données Tenant Telnet (accessible via topbar)
POSTGRES_TELNET_HOST=ep-yyy.region.aws.neon.tech
POSTGRES_TELNET_PORT=5432
POSTGRES_TELNET_USER=neondb_owner
POSTGRES_TELNET_PASSWORD=votre_password
POSTGRES_TELNET_DB=neondb

# Base de données Tenant GitLab KPI (accessible via topbar)
POSTGRES_HOST=ep-zzz.region.aws.neon.tech
POSTGRES_PORT=5432
POSTGRES_USER=neondb_owner
POSTGRES_PASSWORD=votre_password
POSTGRES_DB=neondb

# GitLab Token
GITLAB_TOKEN=votre_gitlab_token

# Auth
ADMIN_EMAIL=admin@votre-domaine.com
ADMIN_PASSWORD=VotreMotDePasse123!
SECRET_KEY=votre_secret_key_tres_long_aleatoire
ENCRYPTION_KEY=votre_cle_encryption

# CORS (domaine Render)
ALLOWED_ORIGINS=https://votre-app.onrender.com
```

**Important:** L'application utilise:
- `auth_db` pour l'authentification (login, création de comptes)
- Les bases tenant (`telnet_db`, `gitlab_kpi1`) sont accessibles via la topbar après login

### ÉTAPE 3: Adapter le backend pour l'architecture multi-tenant

L'application utilise déjà une architecture multi-tenant avec:
- `auth_db` centralisée pour l'authentification (login, users)
- Bases tenant (`telnet_db`, `gitlab_kpi1`) pour les données spécifiques
- Switch dynamique entre bases tenant via la topbar

**Configuration actuelle:**
- Le backend utilise `get_auth_db()` pour l'authentification
- Le backend utilise `get_tenant_db()` pour les données tenant
- Le switch de base de données se fait via la topbar frontend

**Pas de modification nécessaire** si votre code utilise déjà cette architecture. Vérifiez simplement que `dataCollection/src/backend/app/database/session.py` supporte les connexions multiples.

Si vous devez adapter la configuration, ajoutez dans `config.py`:

```python
# Configuration multi-tenant existante dans votre code
# Vérifiez que les variables suivantes sont définies:
POSTGRES_AUTH_HOST=...
POSTGRES_AUTH_PORT=5432
POSTGRES_AUTH_USER=...
POSTGRES_AUTH_PASSWORD=...
POSTGRES_AUTH_DB=...

# Pour les bases tenant (telnet_db, gitlab_kpi1)
# Le switch se fait dynamiquement via la topbar
POSTGRES_HOST=...
POSTGRES_PORT=5432
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=...
```

### ÉTAPE 4: Créer le fichier render.yaml

Créer `render.yaml` à la racine du projet:

```yaml
services:
  # Service Backend (multi-tenant avec auth_db + tenant DBs)
  - type: pserv
    name: gitlab-kpi-backend
    env: python
    plan: free
    buildCommand: cd dataCollection/src/backend && pip install -r requirements.txt
    startCommand: cd dataCollection/src/backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: PORT
        value: 8000
      # Base Auth (login/users)
      - key: POSTGRES_AUTH_HOST
        sync: false
      - key: POSTGRES_AUTH_PORT
        value: 5432
      - key: POSTGRES_AUTH_USER
        sync: false
      - key: POSTGRES_AUTH_PASSWORD
        sync: false
      - key: POSTGRES_AUTH_DB
        sync: false
      # Base Tenant Telnet (accessible via topbar)
      - key: POSTGRES_TELNET_HOST
        sync: false
      - key: POSTGRES_TELNET_PORT
        value: 5432
      - key: POSTGRES_TELNET_USER
        sync: false
      - key: POSTGRES_TELNET_PASSWORD
        sync: false
      - key: POSTGRES_TELNET_DB
        sync: false
      # Base Tenant GitLab KPI (accessible via topbar)
      - key: POSTGRES_HOST
        sync: false
      - key: POSTGRES_PORT
        value: 5432
      - key: POSTGRES_USER
        sync: false
      - key: POSTGRES_PASSWORD
        sync: false
      - key: POSTGRES_DB
        sync: false
      # GitLab & Auth
      - key: GITLAB_TOKEN
        sync: false
      - key: ADMIN_EMAIL
        sync: false
      - key: ADMIN_PASSWORD
        sync: false
      - key: SECRET_KEY
        sync: false
      - key: ENCRYPTION_KEY
        sync: false
      - key: ALLOWED_ORIGINS
        sync: false

  # Service Frontend
  - type: web
    name: gitlab-kpi-frontend
    env: node
    plan: free
    buildCommand: cd dataCollection/src/frontend && npm install && npm run build
    startCommand: cd dataCollection/src/frontend && npm run preview
    envVars:
      - key: VITE_API_URL
        value: https://gitlab-kpi-backend.onrender.com/api/v1
```

### ÉTAPE 5: Initialiser les bases de données sur Neon

Pour chaque base de données Neon, exécuter les migrations correspondantes:

```bash
# Pour auth_db (base d'authentification centrale)
psql $AUTH_DB_URL -f dataCollection/src/backend/alembic/versions/xxx_auth_migration.py

# Pour telnet_db (base tenant Telnet)
psql $TELNET_DB_URL -f dataCollection/src/backend/alembic/versions/xxx_telnet_migration.py

# Pour gitlab_kpi1 (base tenant GitLab KPI)
psql $MAIN_DB_URL -f dataCollection/src/backend/alembic/versions/xxx_main_migration.py
```

**Important pour l'architecture multi-tenant:**
- Les tables d'authentification (users, roles) sont dans `auth_db`
- Les assignations utilisateurs-projets sont dans chaque base tenant
- Le switch entre bases tenant se fait via la topbar frontend

### ÉTAPE 6: Déployer sur Render

1. Créer un compte sur https://render.com
2. Connecter votre repository Git (GitHub/GitLab)
3. Importer le fichier `render.yaml`
4. Render détectera automatiquement les services
5. Configurer les variables d'environnement dans le dashboard Render
6. Déployer

### ÉTAPE 7: Vérifier le déploiement

1. Backend: `https://gitlab-kpi-backend.onrender.com/docs` (documentation FastAPI)
2. Frontend: `https://gitlab-kpi-frontend.onrender.com`
3. Tester l'authentification et les endpoints

---

## Alternatives si Render ne fonctionne pas

### Option 2: Railway.app
- Backend + Frontend sur Railway
- Bases de données sur Neon
- Plus complexe à configurer

### Option 3: Fly.io
- Tout sur Fly.io (backend + frontend + 3 DB)
- Plus technique mais tout gratuit
- Nécessite CLI `fly`

---

## Sauvegarde du travail local

**RASSUREZ-VOUS:** Le déploiement NE détruit PAS votre travail local car:
- Vous utilisez un repository Git
- Le déploiement se fait depuis une branche séparée (ex: `deploy/production`)
- Vos fichiers locaux restent intacts
- Les bases de données Neon sont séparées de vos DB locales

---

## Maintenance

- **Auto-pause:** Neon met les DB en pause après inactivité (économise les crédits)
- **Redémarrage automatique:** Render redémarre les services si nécessaire
- **Logs:** Disponibles dans le dashboard Render
- **Mises à jour:** Push sur Git → Redéploiement automatique

---

## Coûts

- **Render:** 0€ (750h/mois gratuit)
- **Neon:** 0€ (3 projets gratuits = ~500h total)
- **Total:** 0€/mois

---

## Accès pour le responsable

Partager les URLs:
- Frontend: `https://gitlab-kpi-frontend.onrender.com`
- Backend API: `https://gitlab-kpi-backend.onrender.com/api/v1`
- Documentation API: `https://gitlab-kpi-backend.onrender.com/docs`

Créer un compte admin avec les credentials définis dans `.env.render`
