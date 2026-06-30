# Guide de Déploiement Gratuit - Vercel + Supabase + Render

## Architecture Multi-Tenant (Option Recommandée)
- **Frontend:** Vercel (React/Vite) - Meilleur pour React
- **Backend:** Render (FastAPI Python) - Meilleur pour Python
- **3 Bases de données:** Supabase (PostgreSQL) - 500MB gratuit par projet
  - **auth_db** - Base d'authentification (login, users)
  - **telnet_db** -Base tenant Telnet
  - **gitlab_kpi1** - Base tenant GitLab KPI

**Pourquoi cette combinaison est meilleure:**
- Vercel est optimisé pour React (CDN global, préchargement)
- Supabase offre auth + realtime + storage en plus de PostgreSQL
- Render est stable pour les services Python
- Coût total: 0€/mois

---

## ÉTAPE 1: Créer les 3 bases de données sur Supabase

1. Créer un compte sur https://supabase.com
2. Créer 3 projets séparés (un par base de données):
   - `gitlab-kpi-auth-db`
   - `gitlab-kpi-telnet-db`
   - `gitlab-kpi-main-db`

3. Pour chaque projet, récupérer dans Settings > Database:
   - Connection string (format: `postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres`)
   - Sauvegarder dans un fichier `.env.production`

**Avantage Supabase:**
- 500MB de stockage gratuit par projet
- Interface web pour gérer les tables
- Auth intégré (optionnel)
- Realtime (optionnel)

---

## ÉTAPE 2: Préparer les variables d'environnement

Créer fichier `.env.production` à la racine:

```env
# Base de données Auth (Supabase)
POSTGRES_AUTH_HOST=db.xxx.supabase.co
POSTGRES_AUTH_PORT=5432
POSTGRES_AUTH_USER=postgres
POSTGRES_AUTH_PASSWORD=votre_password_supabase
POSTGRES_AUTH_DB=postgres

# Base de données Tenant Telnet (Supabase)
POSTGRES_TELNET_HOST=db.yyy.supabase.co
POSTGRES_TELNET_PORT=5432
POSTGRES_TELNET_USER=postgres
POSTGRES_TELNET_PASSWORD=votre_password_supabase
POSTGRES_TELNET_DB=postgres

# Base de données Tenant GitLab KPI (Supabase)
POSTGRES_HOST=db.zzz.supabase.co
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=votre_password_supabase
POSTGRES_DB=postgres

# GitLab Token
GITLAB_TOKEN=votre_gitlab_token

# Auth
ADMIN_EMAIL=admin@votre-domaine.com
ADMIN_PASSWORD=VotreMotDePasse123!
SECRET_KEY=votre_secret_key_tres_long_aleatoire
ENCRYPTION_KEY=votre_cle_encryption

# CORS (domaines Vercel + Render)
ALLOWED_ORIGINS=https://votre-app.vercel.app,https://gitlab-kpi-backend.onrender.com
```

---

## ÉTAPE 3: Adapter le backend pour l'architecture multi-tenant

L'application utilise déjà une architecture multi-tenant avec:
- `auth_db` centralisée pour l'authentification (login, users)
- Bases tenant (`telnet_db`, `gitlab_kpi1`) pour les données spécifiques
- Switch dynamique entre bases tenant via la topbar

**Pas de modification nécessaire** si votre code utilise déjà `get_auth_db()` et `get_tenant_db()`.

---

## ÉTAPE 4: Déployer le Backend sur Render

Créer `render.yaml` à la racine:

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
      # Base Auth (Supabase)
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
      # Base Tenant Telnet (Supabase)
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
      # Base Tenant GitLab KPI (Supabase)
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
```

**Déploiement sur Render:**
1. Créer un compte sur https://render.com
2. Connecter votre repository Git
3. Importer `render.yaml`
4. Configurer les variables d'environnement
5. Déployer

---

## ÉTAPE 5: Initialiser les bases de données sur Supabase

Pour chaque base de données Supabase, exécuter les migrations:

**Option 1: Via SQL Editor Supabase (recommandé)**
1. Aller dans le dashboard Supabase
2. Ouvrir SQL Editor
3. Copier-coller le contenu des fichiers de migration
4. Exécuter pour chaque base

**Option 2: Via psql en ligne de commande**
```bash
# Pour auth_db
psql $AUTH_DB_URL -f dataCollection/src/backend/alembic/versions/xxx_auth_migration.py

# Pour telnet_db
psql $TELNET_DB_URL -f dataCollection/src/backend/alembic/versions/xxx_telnet_migration.py

# Pour gitlab_kpi1
psql $MAIN_DB_URL -f dataCollection/src/backend/alembic/versions/xxx_main_migration.py
```

---

## ÉTAPE 6: Déployer le Frontend sur Vercel

### 6.1 Créer `vercel.json` à la racine

```json
{
  "buildCommand": "cd dataCollection/src/frontend && npm install && npm run build",
  "outputDirectory": "dataCollection/src/frontend/dist",
  "framework": "vite",
  "env": {
    "VITE_API_URL": "https://gitlab-kpi-backend.onrender.com/api/v1"
  }
}
```

### 6.2 Déploiement sur Vercel

1. Créer un compte sur https://vercel.com
2. Connecter votre repository Git (GitHub/GitLab)
3. Importer le projet
4. Vercel détectera automatiquement Vite/React
5. Configurer les variables d'environnement:
   - `VITE_API_URL` = `https://gitlab-kpi-backend.onrender.com/api/v1`
6. Déployer

**Avantages Vercel:**
- CDN global (accès rapide partout)
- Préchargement automatique des pages
- Preview deployments pour chaque PR
- Analytics inclus

---

## ÉTAPE 7: Vérifier le déploiement

1. **Backend:** `https://gitlab-kpi-backend.onrender.com/docs` (documentation FastAPI)
2. **Frontend:** `https://votre-app.vercel.app`
3. **Supabase:** Dashboard pour vérifier les tables

**Tester l'architecture multi-tenant:**
1. Login via auth_db
2. Switch entre bases tenant via la topbar
3. Vérifier que les données sont correctes pour chaque tenant

---

## Comparaison des Options

| Critère | Render+Neon | Vercel+Supabase+Render |
|---------|-------------|------------------------|
| Frontend | Render (bon) | Vercel (excellent pour React) |
| Backend | Render (excellent) | Render (excellent) |
| Database | Neon (serverless) | Supabase (500MB + features) |
| CDN | Basique | Global (Vercel) |
| Auth | Custom | Supabase (optionnel) |
| Realtime | Non | Oui (Supabase) |
| Storage | Non | Oui (Supabase) |
| Prix | 0€ | 0€ |

**Recommandation:** Vercel + Supabase + Render pour votre projet React multi-tenant.

---

## Maintenance

### Auto-pause et redémarrage
- **Supabase:** Active mais moins agressif que Neon
- **Render:** Redémarre automatiquement si nécessaire
- **Vercel:** Toujours actif (serverless)

### Mises à jour
- **Backend:** Push sur Git → Render redéploie
- **Frontend:** Push sur Git → Vercel redéploie
- **Database:** Via SQL Editor Supabase ou migrations

### Logs
- **Render:** Dashboard Render
- **Vercel:** Dashboard Vercel
- **Supabase:** Dashboard Supabase

---

## Coûts

- **Vercel:** 0€ (100GB bandwidth/mois)
- **Render:** 0€ (750h/mois)
- **Supabase:** 0€ (3 projets × 500MB = 1.5GB total)
- **Total:** 0€/mois

---

## Accès pour le responsable

Partager les URLs:
- Frontend: `https://votre-app.vercel.app`
- Backend API: `https://gitlab-kpi-backend.onrender.com/api/v1`
- Documentation API: `https://gitlab-kpi-backend.onrender.com/docs`
- Supabase Dashboard: Partager l'accès au projet (optionnel)

Créer un compte admin avec les credentials définis dans `.env.production`

---

## Sauvegarde du travail local

**RASSUREZ-VOUS:** Le déploiement NE détruit PAS votre travail local car:
- Vous utilisez un repository Git
- Le déploiement se fait depuis une branche séparée (ex: `deploy/production`)
- Vos fichiers locaux restent intacts
- Les bases de données Supabase sont séparées de vos DB locales

---

## Dépannage

### Problème: CORS errors
**Solution:** Ajouter le domaine Vercel dans `ALLOWED_ORIGINS` sur Render

### Problème: Database connection timeout
**Solution:** Supabase a un mode "pause" moins agressif, mais vérifiez les connection strings

### Problème: Frontend ne charge pas
**Solution:** Vérifiez que `VITE_API_URL` pointe vers le bon backend Render

---

## Alternatives

### Option 2: Tout sur Vercel
- Backend en serverless function (plus complexe)
- Frontend sur Vercel
- Supabase pour DB

### Option 3: Tout sur Railway
- Backend + Frontend + 3 DB sur Railway
- Plus simple mais moins optimisé pour React

---

## Conclusion

La combinaison **Vercel + Supabase + Render** est la meilleure option pour votre projet car:
- Vercel est optimisé pour React (CDN global, préchargement)
- Supabase offre plus de fonctionnalités (auth, realtime, storage)
- Render est stable pour les services Python
- Architecture multi-tenant parfaitement supportée
- Coût total: 0€/mois
