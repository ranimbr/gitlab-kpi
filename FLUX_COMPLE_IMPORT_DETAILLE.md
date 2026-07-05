# Flux Complet d'Import des Développeurs - Du Frontend à la Base de Données

## 🎯 Objectif du Système

Permettre aux administrateurs d'importer massivement des développeurs depuis un fichier CSV/Excel, avec validation, simulation (dry-run), et gestion intelligente des entités manquantes.

---

## 📊 Architecture en 3 Couches

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                              │
│  - Interface utilisateur                                            │
│  - Validation visuelle                                              │
│  - Gestion des fichiers                                            │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTP Request (FormData)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API (FastAPI)                            │
│  - Validation des requêtes                                          │
│  - Sécurité (authentification)                                     │
│  - Orchestration du traitement                                    │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Appel Services
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND SERVICES (Business Logic)                       │
│  - Traitement métier complexe                                      │
│  - Parsing CSV/Excel                                                │
│  - Logique SCD Type 2                                               │
│  - Gestion des entités manquantes                                  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ SQL Queries
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                 BASE DE DONNÉES (PostgreSQL)                        │
│  - Tables: developer, developer_site, developer_project, etc.      │
│  - Logs: developer_import_log (auth_db)                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 ÉTAPE 1: Frontend - Interface Utilisateur

### Fichier: `src/frontend/src/components/admin/DeveloperImportModal.jsx`

**Objectif**: Fournir une interface simple pour l'upload de fichier

#### 1.1 Sélection du Fichier (lignes 7-18, 39-43)
```javascript
// Lignes 7-18: State du fichier
const [file, setFile] = useState(null);

// Lignes 39-43: Handler de sélection
const handleFileSelect = (e) => {
  if (e.target.files && e.target.files[0]) {
    setFile(e.target.files[0]);
  }
};
```

**Ce qui se passe**:
- L'utilisateur sélectionne un fichier via l'input file
- Le fichier est stocké dans le state React `file`
- Le composant affiche le nom et la taille du fichier

#### 1.2 Configuration des Options (lignes 11-16)
```javascript
const [options, setOptions] = useState({
  createMissingSites: false,    // Auto-créer les sites inconnus
  createMissingProjects: false, // Auto-créer les projets inconnus
  createMissingGroups: true,     // Auto-créer les groupes inconnus
  fullSync: true,                // Sync complète (désactive absents)
});
```

**Objectif**: Permettre à l'admin de contrôler le comportement de l'import

#### 1.3 Appel au Service Frontend (lignes 52-83)
```javascript
const handleImport = async () => {
  if (!file) return;
  setLoading(true);
  try {
    const response = await developerService.importFile(file, {
      dryRun: false,
      period_id: selectedPeriodId || null,
      ...options
    });
    
    Swal.fire({
      icon: 'success',
      title: 'Import terminé',
      text: `${response.success_count} développeurs ajoutés ou mis à jour.`,
      confirmButtonColor: '#4361ee'
    });
    
    if (onSuccess) onSuccess();
    onClose();
  } catch (error) {
    console.error(error);
    const msg = error.response?.data?.detail || "Une erreur est survenue lors de l'importation.";
    Swal.fire({
      icon: 'error',
      title: 'Échec de l\'import',
      text: msg,
      confirmButtonColor: '#ef4444'
    });
  } finally {
    setLoading(false);
  }
};
```

---

## 🔄 ÉTAPE 2: Frontend - Service HTTP

### Fichier: `src/frontend/src/services/developerService.js`

**Objectif**: Encapsuler les appels HTTP vers le backend

#### 2.1 Construction de la Requête FormData (lignes 107-132)
```javascript
importFile: (file, options = {}) => {
  const form = new FormData();
  form.append("file", file);

  // Ajout des paramètres
  if (options.defaultSiteId)
    form.append("default_site_id", String(options.defaultSiteId));
  if (options.defaultGroupId)
    form.append("default_group_id", String(options.defaultGroupId));
  if (options.periodId)
    form.append("period_id", String(options.periodId));

  // Conversion booléens → strings (FormData limitation)
  form.append("dry_run", options.dryRun ? "true" : "false");
  form.append("create_missing_sites", options.createMissingSites ? "true" : "false");
  form.append("create_missing_projects", options.createMissingProjects ? "true" : "false");
  form.append("create_missing_groups", options.createMissingGroups ? "true" : "false");
  form.append("full_sync", options.fullSync ? "true" : "false");

  return api.post("/developers/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
}
```

**Pourquoi FormData?**
- Permet l'upload de fichiers binaires
- Standard HTTP pour les formulaires avec fichiers
- Compatible avec FastAPI backend

#### 2.2 Envoi HTTP
```javascript
return api.post("/developers/import", form, {
  headers: { "Content-Type": "multipart/form-data" },
})
```

**Ce qui se passe**:
- Le fichier est envoyé via HTTP POST
- Les paramètres sont envoyés en multipart/form-data
- L'URL est: `http://localhost:8000/api/v1/developers/import`

---

## 🔄 ÉTAPE 3: Backend API Router

### Fichier: `src/backend/app/api/routers/developers.py` (ligne 649)

**Objectif**: Point d'entrée API, validation et délégation

#### 3.1 Endpoint API (lignes 649-681)
```python
@router.post("/import", response_model=DeveloperImportResponse, status_code=201)
async def import_developers(
    background_tasks:        BackgroundTasks,
    file:                    UploadFile    = File(...),           # Fichier uploadé
    period_id:               Optional[int] = Form(default=None),  # Période cible
    default_site_id:         Optional[int] = Form(default=None),
    default_group_id:        Optional[int] = Form(default=None),
    default_gitlab_config_id: Optional[int] = Form(default=None),
    dry_run:                 bool          = Form(default=False),             # Mode simulation
    create_missing_sites:    bool          = Form(
        default=False,
        description=(
            "Si True : les sites du CSV absents en base sont créés automatiquement "
            "(name=<nom>, country='À définir', is_active=True). "
            "Désactivé par défaut — activer seulement si vous faites confiance au fichier source."
        ),
    ),
    create_missing_projects: bool          = Form(
        default=False,
        description=(
            "Si True : les projets du CSV absents en base sont créés automatiquement. "
            "Même comportement que create_missing_sites."
        ),
    ),
    create_missing_groups: bool            = Form(default=False),
    full_sync:             bool            = Form(
        default=False,
        description="Si True : désactive les développeurs absents du fichier (Sync totale)."
    ),
    db:            Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
```

**Sécurité**:
- `Depends(get_current_admin)`: Seuls les admins peuvent importer
- Validation du format fichier (.csv, .xlsx, .xls)

#### 3.2 Validation du Format (lignes 697-701)
```python
if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
    raise HTTPException(
        status_code=400,
        detail="Format non supporté. Utilisez CSV (.csv) ou Excel (.xlsx, .xls).",
    )
```

#### 3.3 Extraction du Contenu (ligne 703)
```python
content = await file.read()
```

#### 3.4 Résilience GitLab (lignes 708-713)
```python
if default_gitlab_config_id is None:
    from app.models.gitlab_config import GitLabConfig
    first_config = db.query(GitLabConfig).first()
    if first_config:
        default_gitlab_config_id = first_config.id
        logger.info("Import: Aucun domaine spécifié, utilisation automatique du Domaine ID %d", default_gitlab_config_id)
```

**Pourquoi?**
- Évite de créer des projets orphelins
- Utilise le premier domaine GitLab disponible si non spécifié

#### 3.5 Délégation au Service (lignes 715-729)
```python
result = service.import_from_file(
    db                      = db,
    file_content            = content,
    file_name               = file.filename,
    period_id               = period_id,  #  AJOUT SENIOR
    imported_by             = current_admin.id,
    default_site_id         = default_site_id,
    default_group_id        = default_group_id,
    default_gitlab_config_id = default_gitlab_config_id,
    dry_run                 = dry_run,
    create_missing_sites    = create_missing_sites,
    create_missing_projects = create_missing_projects,
    create_missing_groups   = create_missing_groups,
    full_sync               = full_sync,
)
```

#### 3.6 Post-Import: Recalcul KPI en Background (lignes 731-746)
```python
# ✅ [SOLUTION SOLIDE] : Recalcul automatique après import
processed_ids = result.get("processed_ids", [])
if not dry_run and processed_ids:
    from app.services.kpi.kpi_service import KpiService
    kpi_service = KpiService()
    logger.info(f"[ENTERPRISE] Import finished. Triggering background recalculation for {len(processed_ids)} developers.")
    
    # On regroupe les recalculs (un appel par dev suffit, il traitera toutes ses périodes impactées)
    for d_id in processed_ids:
        background_tasks.add_task(
            kpi_service.recalculate_developer_history,
            developer_id=d_id,
            changed_fields=["import_sync"]
        )
```

**Pourquoi Background?**
- Le recalcul KPI peut être long (beaucoup de périodes)
- Ne bloque pas la réponse API
- Traitement asynchrone via FastAPI BackgroundTasks

---

## 🔄 ÉTAPE 4: Backend Service - Logique Métier

### Fichier: `src/backend/app/services/admin/developer_service.py` (ligne 861)

**Objectif**: Cœur du traitement métier

#### 4.1 Création du Log d'Import (lignes 895-898)
```python
import_log_id = self.import_log_repo.create_log(
    db, file_name=file_name, imported_by=imported_by, 
    target_database=target_db, file_type=file_type
)
db.flush()
```

**Table**: `developer_import_log` dans `auth_db`

**Pourquoi une base séparée?**
- Traçabilité même si la base principale est rollbackée
- Centralisation des logs d'audit

#### 4.2 Parsing du Fichier (lignes 900-910)
```python
try:
    rows = self._parse_file(file_content, file_type)
except HTTPException:
    raise
except Exception as e:
    self.import_log_repo.fail(db, import_log_id, str(e))
    db.commit()
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Erreur de lecture du fichier : {e}",
    )
```

**Formats supportés**:
- CSV: Séparateur virgule
- Excel: `.xlsx` et `.xls` via pandas

#### 4.3 Pré-chargement des Référentiels (Optimisation O(1)) (lignes 922-937)
```python
# ── Pré-chargement O(1) des référentiels ────────────────────────────
all_sites    = {s.name.lower().strip(): s for s in self.site_repo.get_all(db)}
all_groups   = {g.name.lower().strip(): g for g in self.group_repo.get_all(db)}

# ✅ LOGIQUE SENIOR : Tracking pour Full Sync
# ⚠️ FIX ARCHITECTURAL : Le scope du full_sync est PROJET × PÉRIODE, pas global.
csv_project_ids: set = set()  # Projets référencés dans le CSV
processed_ids: set = set()

logger.info("Import: %d sites et %d groupes chargés en cache.", len(all_sites), len(all_groups))

# Projets : double indexation (Nom et ID GitLab)
_projects_all = self.project_repo.get_all(db, active_only=False)
all_projects_by_name = {p.name.lower(): p for p in _projects_all}
all_projects_by_id   = {p.gitlab_project_id: p for p in _projects_all if p.gitlab_project_id}
```

**Avantages**:
- Un seul appel base de données par type d'entité
- Recherche instantanée par nom (dictionnaire Python O(1))
- Évite N+1 requêtes dans la boucle de traitement

#### 4.4 Traitement Ligne par Ligne

##### Extraction Flexible des Champs (lignes 957-975)
```python
#  LOGIQUE RESILIENTE (Senior) : On cherche avec une tolérance maximale
def get_val(keys):
    keys_lower = [k.lower().strip() for k in keys]
    for row_k, val in row.items():
        rk_clean = str(row_k).lower().strip()
        if rk_clean in keys_lower:
            return (str(val) or "").strip()
    return ""

name     = get_val(["name", "nom", "full_name"])
email    = get_val(["email", "mail", "courriel"]).lower()
username = get_val(["gitlab_username", "username", "identifiant", "user"])

# Détection flexible de la colonne Groupe
group_csv_raw = get_val(["group", "groups", "groupe", "groupes", "equipe", "équipe", "team"])

onboarding_csv_raw  = get_val(["onboarding_date", "date_entree", "date_arrivee", "join_date"])
offboarding_csv_raw = get_val(["offboarding_date", "date_sortie", "date_depart", "leave_date"])
mission_start_raw   = get_val(["mission_start", "start_date", "debut_mission", "date_debut"])
mission_end_raw     = get_val(["mission_end", "end_date", "fin_mission", "date_fin"])
```

**Intelligence**:
- Accepte plusieurs variantes de noms de colonnes
- Case-insensitive et trimming automatique
- Résilient aux erreurs de formatage CSV

##### Détection UPSERT (lignes 1007-1011)
```python
# ── Détection Existant (UPSERT) ───────────────────────────────────
existing_dev = None
if self.dev_repo.get_by_email(db, email):
    existing_dev = self.dev_repo.get_by_email(db, email)
elif self.dev_repo.get_by_gitlab_username(db, username):
    existing_dev = self.dev_repo.get_by_gitlab_username(db, username)
```

**Logique**:
1. Recherche par email (priorité)
2. Si pas trouvé, recherche par gitlab_username
3. Si trouvé → UPDATE, sinon → CREATE

#### 4.5 Mode Dry Run (lignes 1013-1032)
```python
if dry_run:
    # En dry-run : on analyse les entités même sans créer le dev
    # pour remonter unknown_sites/projects/groups dans le rapport
    self._analyze_dry_run_row(
        row, all_sites, all_projects_by_name, all_groups,
        unknown_sites_names, unknown_projects_data, unknown_groups_names,
    )
    if existing_dev:
        success_list.append({
            "row": row_num, "status": "updated",
            "name": name, "email": email,
            "reason": f"Sera mis à jour (ID {existing_dev.id})",
        })
    else:
        success_list.append({
            "row": row_num, "status": "success",
            "name": name, "email": email,
            "reason": "Création prévue",
        })
    continue
```

**Ce que fait le Dry Run**:
- ✅ Parse le fichier complètement
- ✅ Détecte les doublons
- ✅ Identifie les sites/projets/groupes inconnus
- ✅ Valide les formats de données
- ❌ NE crée AUCUN enregistrement en base
- ❌ NE modifie AUCUNE affectation

#### 4.6 Mode Création Réelle
```python
# Résolution des sites
for sname in site_names:
    site = all_sites.get(sname.lower())
    if site is None:
        if create_missing_sites:
            site = self.site_repo.create_from_import(db, sname)
            created_sites_names.add(sname)
        else:
            unknown_sites_names.add(sname)

# Création ou mise à jour
if existing_dev:
    # UPDATE avec sync_smart (SCD Type 2)
    self.dev_site_repo.sync_smart(db, developer_id, payload.sites, ...)
else:
    # CREATE avec affectations initiales
    developer = self.dev_repo.create(db, dev_data, group_ids=payload.group_ids)

# Commit des changements
db.commit()
```

**Ce que fait le Mode Création**:
- ✅ Crée les développeurs inconnus
- ✅ Met à jour les développeurs existants
- ✅ Crée les sites/projets/groupes (si flags activés)
- ✅ Applique les affectations site/groupe/projet
- ✅ Génère les logs d'audit
- ✅ Déclenche le recalcul KPI en background

---

## 🔄 ÉTAPE 5: Backend Repository - Accès Données

### Fichier: `src/backend/app/repositories/developer_import_log_repository.py`

**Objectif**: Persistance des logs d'import

#### 5.1 Création du Log (ligne 82)
```python
def create_log(
    self,
    db: Session,
    file_name: str,
    imported_by: Optional[int],
    target_database: str,
    file_type: Optional[str] = None,
) -> int:
    auth_db = get_auth_session()
    try:
        log = DeveloperImportLog(
            file_name       = file_name,
            file_type       = file_type,
            imported_by     = imported_by,
            target_database = target_database,
            status          = ImportStatusEnum.pending,
            total_rows      = 0,
        )
        auth_db.add(log)
        auth_db.flush()
        auth_db.commit()
        log_id = log.id
        return log_id
    except Exception:
        auth_db.rollback()
        raise
    finally:
        auth_db.close()
```

**Pourquoi auth_db séparée?**
- Logs d'audit doivent survivre aux rollbacks
- Centralisation de tous les imports
- Séparation des responsabilités

#### 5.2 Mise à jour du Statut (ligne 133)
```python
def complete(
    self,
    db: Session,
    log_id: int,
    total_rows: int,
    success_count: int,
    error_count: int,
    duplicate_count: int,
    report_data: Optional[dict] = None,
) -> DeveloperImportLog:
    auth_db = get_auth_session()
    try:
        log_from_db = auth_db.query(DeveloperImportLog).filter(
            DeveloperImportLog.id == log_id
        ).first()
        if log_from_db:
            log_from_db.status          = ImportStatusEnum.completed
            log_from_db.total_rows      = total_rows
            log_from_db.success_count   = success_count
            log_from_db.error_count     = error_count
            log_from_db.duplicate_count = duplicate_count
            log_from_db.report_data     = report_data
            auth_db.flush()
            auth_db.commit()
            return log_from_db
    except Exception:
        auth_db.rollback()
        raise
    finally:
        auth_db.close()
```

---

## 🔄 ÉTAPE 6: Base de Données - Persistance

### Tables Principales

#### 6.1 Table `developer` (Base principale)
```sql
CREATE TABLE developer (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    gitlab_username VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_validated BOOLEAN DEFAULT FALSE,
    is_bot BOOLEAN DEFAULT FALSE,
    onboarding_date DATE,
    offboarding_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Objectif**: Stocker les informations personnelles des développeurs

#### 6.2 Table `developer_site` (SCD Type 2)
```sql
CREATE TABLE developer_site (
    id SERIAL PRIMARY KEY,
    developer_id INTEGER REFERENCES developer(id),
    site_id INTEGER REFERENCES site(id),
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    UNIQUE(developer_id, site_id, start_date)
);
```

**Objectif**: Historiser les affectations sites avec dates
- `start_date`: Début de l'affectation
- `end_date`: Fin de l'affectation (NULL si actif)
- Supporte les mutations et corrections rétroactives

#### 6.3 Table `developer_project` (SCD Type 2)
```sql
CREATE TABLE developer_project (
    id SERIAL PRIMARY KEY,
    developer_id INTEGER REFERENCES developer(id),
    project_id INTEGER REFERENCES project(id),
    is_active BOOLEAN DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    UNIQUE(developer_id, project_id, start_date)
);
```

**Objectif**: Historiser les affectations projets

#### 6.4 Table `developer_import_log` (auth_db)
```sql
CREATE TABLE developer_import_log (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    imported_by INTEGER,
    target_database VARCHAR(100),
    status VARCHAR(20),  -- pending, completed, failed
    total_rows INTEGER,
    success_count INTEGER,
    error_count INTEGER,
    duplicate_count INTEGER,
    report_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Objectif**: Traçabilité complète des imports

---

## 🎯 Résumé des Relations entre Étapes

```
1. FRONTEND (DeveloperImportModal.jsx)
   ↓ Sélection fichier + options
2. FRONTEND SERVICE (developerService.js)
   ↓ Construction FormData + envoi HTTP
3. BACKEND API (developers.py)
   ↓ Validation format + délégation
4. BACKEND SERVICE (developer_service.py)
   ↓ Parsing + traitement métier + SCD Type 2
5. BACKEND REPOSITORY (developer_import_log_repository.py)
   ↓ Création log dans auth_db
6. BASE DE DONNÉES (PostgreSQL)
   ↓ Persistance developer + developer_site + developer_project
7. BACKEND SERVICE (kpi_service)
   ↓ Recalcul KPI en background
8. FRONTEND (DeveloperImportModal.jsx)
   ↓ Affichage résultat + SweetAlert
```

---

## 💡 Points Techniques Avancés

### SCD Type 2 (Slowly Changing Dimension)
```python
# Segments datés pour tracking historique
DeveloperSite(
    developer_id=dev_id,
    site_id=site_id,
    start_date=date(2026, 1, 15),  # Début affectation
    end_date=None,                   # Toujours actif
    is_active=True
)

# Mutation de site
DeveloperSite(
    developer_id=dev_id,
    site_id=new_site_id,
    start_date=date(2026, 6, 1),   # Nouvelle affectation
    end_date=None,
    is_active=True
)
# Ancien segment fermé automatiquement
```

**Pourquoi SCD Type 2?**
- Historisation complète des affectations
- Supporte corrections rétroactives
- Tracking temporel précis

### Sync Smart
```python
# Gestion intelligente des affectations
self.dev_site_repo.sync_smart(
    db, developer_id, payload.sites,
    p_start=p_start,           # Date de début de mission
    p_end=p_end,               # Date de fin (offboarding)
    mutation_date=mutation_date  # Date d'effet du changement
)
```

**Intelligence**:
- Création automatique des segments SCD Type 2
- Gestion des chevauchements temporels
- Support des mutations et corrections

---

## 🔍 Exemple Concret de Flux

### Scénario: Import de 2 développeurs

#### 1. Frontend
```
Admin sélectionne fichier "equipe_janvier.csv"
Options: dry_run=false, create_missing_groups=true
Clique "Lancer l'import"
```

#### 2. Frontend Service
```
FormData construit:
- file: equipe_janvier.csv (binaire)
- dry_run: "false"
- create_missing_groups: "true"
POST /api/v1/developers/import
```

#### 3. Backend API
```
Réception de la requête
Validation format CSV ✓
Extraction contenu binaire
Délégation à DeveloperService.import_from_file()
```

#### 4. Backend Service
```
Parsing CSV → 2 lignes détectées
Pré-chargement référentiels:
  - sites: {"paris": Site(id=1), "tunis": Site(id=2)}
  - groupes: {"backend": Group(id=1), "frontend": Group(id=2)}

Ligne 1: Jean Dupont
  - Email non trouvé → CREATE
  - Site "Paris" existe → Affectation
  - Groupe "Backend" existe → Affectation
  - onboarding_date: 2026-01-15

Ligne 2: Marie Martin
  - Email non trouvé → CREATE
  - Site "Lyon" inconnu → Warning (create_missing_groups=false)
  - Groupe "Frontend" existe → Affectation
  - onboarding_date: 2026-02-01

Commit base de données
```

#### 5. Backend Repository
```
Création log dans auth_db:
  - status: "completed"
  - success_count: 2
  - unknown_sites: ["Lyon"]
```

#### 6. Base de Données
```
Table developer:
  - id=1, name="Jean Dupont", email="jean@example.com"
  - id=2, name="Marie Martin", email="marie@example.com"

Table developer_site:
  - dev_id=1, site_id=1 (Paris), start_date=2026-01-15
  - dev_id=2, site_id=NULL (Lyon inconnu)

Table developer_group_link:
  - dev_id=1, group_id=1 (Backend), start_date=2026-01-15
  - dev_id=2, group_id=2 (Frontend), start_date=2026-02-01
```

#### 7. Backend Service (Background)
```
Recalcul KPI pour dev_id=1 et dev_id=2
BackgroundTasks.add_task()
```

#### 8. Frontend
```
Réponse API reçue:
{
  "success_count": 2,
  "unknown_sites": ["Lyon"],
  "rows": [
    {"row": 2, "status": "success", "name": "Jean Dupont"},
    {"row": 3, "status": "success", "name": "Marie Martin", "warnings": ["Site 'Lyon' introuvable"]}
  ]
}

SweetAlert affiché: "2 développeurs ajoutés ou mis à jour"
```

---

## 🎓 Points Clés pour la Soutenance

### 1. Séparation des Responsabilités
- **Frontend**: Interface utilisateur et validation visuelle
- **Backend API**: Validation HTTP et sécurité
- **Backend Service**: Logique métier complexe
- **Repository**: Accès optimisé aux données
- **Base de données**: Persistance et historisation

### 2. Communication HTTP
- **FormData**: Standard pour l'upload de fichiers
- **Multipart/form-data**: Format HTTP pour les formulaires avec fichiers
- **JSON**: Format de réponse structuré

### 3. Optimisations Performance
- **Pré-chargement O(1)**: Un appel DB par type d'entité
- **Dictionnaires Python**: Recherche instantanée O(1)
- **Background Tasks**: Recalcul KPI non bloquant

### 4. Sécurité et Traçabilité
- **Authentification admin**: Seuls les admins peuvent importer
- **Logs séparés**: auth_db pour traçabilité
- **Audit trail**: Chaque action loggée

### 5. Intelligence Métier
- **SCD Type 2**: Historisation complète
- **Sync Smart**: Gestion automatique des segments
- **Dry Run**: Validation sans risque
- **Auto-création**: Gestion des entités manquantes

---

## 🚀 Conclusion

Ce flux complet illustre une architecture moderne et robuste:

1. **Frontend React**: Interface intuitive avec drag & drop
2. **Service HTTP**: Encapsulation propre des appels API
3. **API FastAPI**: Validation et sécurité
4. **Service Métier**: Logique complexe avec SCD Type 2
5. **Repository**: Accès optimisé aux données
6. **Base PostgreSQL**: Persistance et historisation
7. **Background Tasks**: Traitement asynchrone

Chaque couche a une responsabilité claire et communique avec les autres via des interfaces bien définies, garantissant maintenabilité, performance et fiabilité.
