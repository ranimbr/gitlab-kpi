# Dashboard KPI GitLab

Projet de Fin d'Études 

---

## Prérequis

| Outil | Version | Téléchargement |
|-------|---------|----------------|
| Python | 3.11+ | https://www.python.org/downloads/ |
| Node.js | 18+ | https://nodejs.org/ |
| PostgreSQL | 14+ | https://www.postgresql.org/download/ |
| Git | — | https://git-scm.com/ |

---

## 1. Récupérer le code source

```bash
git clone https://gitlab.com/rami07/kpi-gitlab.git
cd kpi-gitlab
git checkout feature/sprint1
```

---

## 2. Configurer la base de données

### Sur Linux
```bash
sudo -u postgres psql -c "CREATE DATABASE gitlab_kpi_version3;"
sudo -u postgres psql gitlab_kpi_version3 < bdd_sprint1.sql
```

### Sur Windows (dans le terminal PostgreSQL ou cmd)
```cmd
psql -U postgres -c "CREATE DATABASE gitlab_kpi_version3;"
psql -U postgres gitlab_kpi_version3 < bdd_sprint1.sql
```

> Le fichier **bdd_sprint1.sql** est fourni séparément (Google Drive).

---

## 3. Installer et démarrer le Backend

### Sur Linux
```bash
cd dataCollection/src/backend

# Créer l'environnement virtuel
python3 -m venv venv
source venv/bin/activate

# Installer les dépendances
pip install -r requirements.txt

# Configurer l'environnement
cp .env.example .env
nano .env
```

### Sur Windows
```cmd
cd dataCollection\src\backend

# Créer l'environnement virtuel
python -m venv venv
venv\Scripts\activate

# Installer les dépendances
pip install -r requirements.txt

# Configurer l'environnement
copy .env.example .env
notepad .env
```

### Contenu du fichier .env à renseigner

```env
APP_NAME=KPI GitLab Dashboard
APP_VERSION=1.0.0
DEBUG=True

# Adapter le mot de passe PostgreSQL
DATABASE_URL=postgresql://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/gitlab_kpi_version3

SECRET_KEY=changeme_en_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=VOTRE_TOKEN_GITLAB

ALLOWED_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
SCHEDULER_ENABLED=False
```

### Créer le compte administrateur

#### Linux
```bash
python -m app.scripts.create_admin
```

#### Windows
```cmd
python -m app.scripts.create_admin
```

### Démarrer le backend

#### Linux
```bash
uvicorn app.main:app --reload
```

#### Windows
```cmd
uvicorn app.main:app --reload
```

> Le backend démarre sur **http://localhost:8000**  
> Documentation API disponible sur **http://localhost:8000/docs**

---

## 4. Installer et démarrer le Frontend

### Sur Linux
```bash
cd dataCollection/src/frontend
npm install
npm run dev
```

### Sur Windows
```cmd
cd dataCollection\src\frontend
npm install
npm run dev
```

> Le frontend démarre sur **http://localhost:5173**

---

## 5. Accès à l'application

Ouvrir dans le navigateur : **http://localhost:5173**

| Champ | Valeur |
|-------|--------|
| Email | admin@test.com |
| Mot de passe | admin123! |

---

## 6. Fonctionnalités à tester

### 6.1 Gestion des projets GitLab
- Menu **Admin → Projets GitLab**
- Ajouter un projet avec son ID GitLab
- Vérifier qu'il apparaît dans la liste

### 6.2 Gestion des développeurs
- Menu **Admin → Développeurs**
- Ajouter un développeur et l'affecter à un groupe/site
- Vérifier l'affichage dans la liste

### 6.3 Extraction des données GitLab
- Menu **Extraction**
- Sélectionner un projet et une période
- Cliquer sur **Lancer l'extraction**
- Vérifier que les commits et MRs remontent

### 6.4 Dashboard KPI
- Menu **Dashboard**
- Vérifier l'affichage des  KPIs calculés
- Vérifier les graphiques et tableaux

### 6.5 Seuils d'alerte
- Menu **Admin → Seuils KPI**
- Configurer un seuil warning et critical sur un KPI
- Relancer une extraction et vérifier les couleurs (vert/orange/rouge)

---

## 7. Structure du projet

```
kpi-gitlab/
└── dataCollection/
    └── src/
        ├── backend/          ← API FastAPI (Python)
        │   ├── app/
        │   │   ├── api/      ← Routes REST
        │   │   ├── models/   ← Modèles SQLAlchemy 
        │   │   ├── services/ ← Logique métier + extraction GitLab
        │   │   └── schemas/  ← Validation Pydantic
        │   ├── .env.example
        │   └── requirements.txt
        └── frontend/         ← Interface React.js
            └── src/
                ├── pages/    ← Pages de l'application
                ├── services/ ← Appels API
                └── components/
```

---

## 8. En cas de problème

| Problème | Solution |
|----------|----------|
| `ModuleNotFoundError` | Vérifier que le venv est activé |
| `Connection refused` port 8000 | Vérifier que le backend est démarré |
| `Connection refused` port 5173 | Vérifier que le frontend est démarré |
| Erreur base de données | Vérifier `DATABASE_URL` dans le `.env` |
| `401 Unauthorized` | Vérifier email/mot de passe admin |
| Extraction GitLab échoue | Vérifier `GITLAB_TOKEN` dans le `.env` |
