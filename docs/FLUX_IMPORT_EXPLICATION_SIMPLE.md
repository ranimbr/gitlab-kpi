# Flux Import Développeurs - Explication Simple et Détaillée

## Vue d'Ensemble Simple

Imaginez que vous êtes le Super Admin et vous voulez ajouter 50 développeurs à votre système. Au lieu de les créer un par un, vous utilisez un fichier Excel.

```
Vous (Super Admin)
    ↓
1. Vous préparez un fichier Excel avec les infos des développeurs
    ↓
2. Vous allez sur la page "Import Développeurs"
    ↓
3. Vous uploadez le fichier
    ↓
4. Le système analyse le fichier
    ↓
5. Le système crée les développeurs en base de données
    ↓
6. Le système calcule leurs KPIs
    ↓
7. Vous voyez le résultat : "50 développeurs créés avec succès"
```

---

## ÉTAPE 1 : Vous Préparez le Fichier Excel

**Ce que vous faites** :
Vous créez un fichier Excel avec les colonnes suivantes :

| name | email | gitlab_username | sites | projects | group |
|------|-------|-----------------|-------|----------|-------|
| Ahmed Ben Ali | ahmed@corp.tn | ahmed.benali | Paris | backend-api | Backend Tunis |
| Mohamed Karray | mohamed@corp.tn | mohamed.karray | Tunis | frontend | Frontend Paris |

**Pourquoi ces colonnes ?**
- `name`, `email`, `gitlab_username` : Obligatoires pour identifier le développeur
- `sites` : Où le développeur travaille (peut être plusieurs sites séparés par virgule)
- `projects` : Sur quels projets il travaille (peut être plusieurs projets)
- `group` : Son équipe/groupe

---

## ÉTAPE 2 : Vous Allez sur la Page Import

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\pages\admin\DevelopersImportPage.jsx`

**Ce que vous voyez** :
```
┌─────────────────────────────────────────────────┐
│  Import en masse — Développeurs                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  [Glissez-déposez votre fichier ici]            │
│                                                 │
│  Options d'import :                             │
│  ☐ Dry-run (prévisualisation)                   │
│  ☐ Créer automatiquement les sites manquants    │
│  ☐ Créer automatiquement les projets manquants  │
│  ☐ Créer automatiquement les groupes manquants   │
│  ☐ Mode Synchronisation Totale (Full Sync)       │
│                                                 │
│  [Prévisualiser]  [Importer]                    │
└─────────────────────────────────────────────────┘
```

**Code Frontend** (Ligne 293-317) :
```javascript
export default function DevelopersImportPage() {
  const [file, setFile] = useState(null);           // Le fichier que vous uploadez
  const [dryRun, setDryRun] = useState(true);        // Prévisualisation par défaut
  const [createMissingSites, setCreateMissingSites] = useState(false);  // Auto-création sites
  const [createMissingProjects, setCreateMissingProjects] = useState(false);  // Auto-création projets
  const [createMissingGroups, setCreateMissingGroups] = useState(false);   // Auto-création groupes
  const [fullSync, setFullSync] = useState(false);     // Synchronisation totale
  // ...
}
```

**Ce qui se passe** :
- Le frontend affiche la page avec les options
- Vous pouvez cocher/décocher les options selon vos besoins
- Par défaut, le "Dry-run" est coché (mode prévisualisation sécurisé)

---

## ÉTAPE 3 : Vous Uploadez le Fichier

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\pages\admin\DevelopersImportPage.jsx`

**Ce que vous faites** :
1. Vous glissez-déposez votre fichier Excel dans la zone
2. OU vous cliquez pour sélectionner le fichier
3. Le fichier apparaît dans l'interface

**Code Frontend** (Ligne 397-409) :
```javascript
const handleFile = (f) => {
  if (!f) return;
  
  // Vérifie que le format est correct (.csv, .xlsx, .xls)
  const ext = "." + f.name.split(".").pop().toLowerCase();
  if (!ACCEPTED_EXTS.includes(ext)) {
    setError("Format non supporté. Utilisez .csv, .xlsx ou .xls");
    return;
  }
  
  setFile(f);  // Stocke le fichier dans la mémoire du navigateur
  setResult(null);
  setError("");
};
```

**Ce qui se passe** :
- Le frontend vérifie que le format est correct
- Le fichier est stocké temporairement dans le navigateur
- Le fichier n'est PAS encore envoyé au serveur

---

## ÉTAPE 4 : Vous Cliquez "Prévisualiser" (Dry-run)

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\pages\admin\DevelopersImportPage.jsx`

**Ce que vous faites** :
Vous cochez "Dry-run" (ou laissez-le coché par défaut) et cliquez sur "Prévisualiser"

**Code Frontend** (Ligne 414-450) :
```javascript
const handleImport = useCallback(async (forceDryRun = dryRun) => {
  if (!file) { 
    setError("Veuillez sélectionner un fichier."); 
    return; 
  }
  
  setLoading(true);  // Affiche "Chargement..."
  
  try {
    // Appel au service qui envoie le fichier au backend
    const res = await developerService.importFile(file, {
      defaultSiteId:         siteId  || null,
      defaultGroupId:        groupId || null,
      defaultGitlabConfigId: defaultGitlabConfigId || null,
      dryRun:                forceDryRun,  // true = prévisualisation
      createMissingSites:    forceDryRun ? false : createMissingSites,
      createMissingProjects: forceDryRun ? false : createMissingProjects,
      createMissingGroups:   forceDryRun ? false : createMissingGroups,
      fullSync:               forceDryRun ? false : fullSync,
      periodId:               periodId || null,
    });

    setResult(res);  // Stocke le résultat pour l'affichage
    refreshLogs();  // Rafraîchit l'historique des imports
  } catch (err) {
    setError(err.message || "Erreur lors de l'import.");
  } finally {
    setLoading(false);  // Cache "Chargement..."
  }
}, [file, dryRun, createMissingSites, createMissingProjects, createMissingGroups, fullSync]);
```

**Ce qui se passe** :
- Le frontend prépare les données à envoyer
- Il appelle la fonction `developerService.importFile()`
- Cette fonction va envoyer le fichier au serveur

---

## ÉTAPE 5 : Le Frontend Envoie le Fichier au Serveur

**Fichier** : `dataCollection/src/frontend/src/services/developerService.js`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\services\developerService.js`

**Code Frontend** (Ligne 107-132) :
```javascript
importFile: (file, options = {}) => {
  const form = new FormData();  // Crée un formulaire multipart
  form.append("file", file);    // Ajoute le fichier

  // Ajoute les options comme champs du formulaire
  if (options.defaultSiteId)
    form.append("default_site_id", String(options.defaultSiteId));
  if (options.defaultGroupId)
    form.append("default_group_id", String(options.defaultGroupId));
  if (options.defaultGitlabConfigId)
    form.append("default_gitlab_config_id", String(options.defaultGitlabConfigId));
  if (options.periodId)
    form.append("period_id", String(options.periodId));

  // Convertit les booléens en strings ("true"/"false")
  form.append("dry_run",                 options.dryRun                ? "true" : "false");
  form.append("create_missing_sites",    options.createMissingSites    ? "true" : "false");
  form.append("create_missing_projects", options.createMissingProjects ? "true" : "false");
  form.append("create_missing_groups",   options.createMissingGroups   ? "true" : "false");
  form.append("full_sync",               options.fullSync              ? "true" : "false");

  // Envoie la requête HTTP POST au backend
  return api.post("/developers/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
}
```

**Ce qui se passe** :
- Le frontend crée un `FormData` (formulaire multipart)
- Il ajoute le fichier et toutes les options
- Il envoie une requête HTTP POST à `/api/v1/developers/import`

**Requête HTTP envoyée** :
```
POST http://localhost:8001/api/v1/developers/import
Content-Type: multipart/form-data

------Boundary
Content-Disposition: form-data; name="file"; filename="developers.xlsx"
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

[binaire du fichier Excel]
------Boundary
Content-Disposition: form-data; name="dry_run"

true
------Boundary
Content-Disposition: form-data; name="create_missing_sites"

false
------Boundary
...
```

---

## ÉTAPE 6 : Le Backend Reçoit la Requête

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\developers.py`

**Code Backend** (Ligne 649-681) :
```python
@router.post("/import", response_model=DeveloperImportResponse, status_code=201)
async def import_developers(
    background_tasks:        BackgroundTasks,  # Pour les tâches de fond
    file:                    UploadFile    = File(...),  # Le fichier uploadez
    period_id:               Optional[int] = Form(default=None),
    default_site_id:         Optional[int] = Form(default=None),
    default_group_id:        Optional[int] = Form(default=None),
    default_gitlab_config_id: Optional[int] = Form(default=None),
    dry_run:                 bool          = Form(default=False),  # true = prévisualisation
    create_missing_sites:    bool          = Form(default=False),
    create_missing_projects: bool          = Form(default=False),
    create_missing_groups:   bool          = Form(default=False),
    full_sync:               bool            = Form(default=False),
    db:                      Session       = Depends(get_db),  # Session base de données
    current_admin:           AppUser       = Depends(get_current_admin),  # Vous (super admin)
):
```

**Ce qui se passe** :
- FastAPI reçoit la requête HTTP POST
- Il extrait le fichier et tous les paramètres
- Il vérifie que vous êtes bien connecté (super admin)
- Il prépare une session de base de données

---

## ÉTAPE 7 : Le Backend Valide le Fichier

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\developers.py`

**Code Backend** (Ligne 697-701) :
```python
if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
    raise HTTPException(
        status_code=400,
        detail="Format non supporté. Utilisez CSV (.csv) ou Excel (.xlsx, .xls).",
    )
```

**Ce qui se passe** :
- Le backend vérifie que le fichier a la bonne extension
- Si ce n'est pas le cas, il renvoie une erreur 400
- Si c'est bon, il continue

---

## ÉTAPE 8 : Le Backend Lit le Fichier

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\developers.py`

**Code Backend** (Ligne 703-713) :
```python
content = await file.read()  # Lit le contenu binaire du fichier
service = DeveloperService()  # Crée le service d'import

# Si aucun domaine GitLab n'est spécifié, prend le premier disponible
if default_gitlab_config_id is None:
    from app.models.gitlab_config import GitLabConfig
    first_config = db.query(GitLabConfig).first()
    if first_config:
        default_gitlab_config_id = first_config.id
        logger.info("Import: Aucun domaine spécifié, utilisation automatique du Domaine ID %d", default_gitlab_config_id)
```

**Ce qui se passe** :
- Le backend lit le contenu binaire du fichier (les octets)
- Il crée une instance du service `DeveloperService`
- Si vous n'avez pas spécifié de domaine GitLab, il prend le premier disponible (auto-découverte)

---

## ÉTAPE 9 : Le Backend Appelle le Service d'Import

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\developers.py`

**Code Backend** (Ligne 715-729) :
```python
result = service.import_from_file(
    db                      = db,
    file_content            = content,  # Le contenu binaire du fichier
    file_name               = file.filename,
    period_id               = period_id,
    imported_by             = current_admin.id,  # Votre ID de super admin
    default_site_id         = default_site_id,
    default_group_id        = default_group_id,
    default_gitlab_config_id = default_gitlab_config_id,
    dry_run                 = dry_run,  # true = prévisualisation
    create_missing_sites    = create_missing_sites,
    create_missing_projects = create_missing_projects,
    create_missing_groups   = create_missing_groups,
    full_sync               = full_sync,
)
```

**Ce qui se passe** :
- Le backend appelle la méthode `import_from_file` du service
- Il passe tous les paramètres (fichier, options, votre ID, etc.)
- C'est ici que la logique métier principale commence

---

## ÉTAPE 10 : Le Service Crée un Log d'Import

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 828-865) :
```python
def import_from_file(self, db, file_content, file_name, ...):
    # Détection du type de fichier
    file_type = "xlsx" if file_name.lower().endswith((".xlsx", ".xls")) else "csv"

    # Récupère la base de données cible pour l'audit
    target_db = current_db_var.get() or "unknown"

    # Crée un log d'import pour traçabilité
    import_log_id = self.import_log_repo.create_log(
        db, file_name=file_name, imported_by=imported_by, 
        target_database=target_db, file_type=file_type
    )
    db.flush()  # Force l'écriture en base pour avoir l'ID
```

**Ce qui se passe** :
- Le service crée un enregistrement dans la table `developer_import_log`
- Cela permet de tracer qui a importé quoi et quand
- `db.flush()` force l'écriture en base pour avoir l'ID du log

**En base de données** :
```sql
INSERT INTO developer_import_log (
    file_name, imported_by, target_database, file_type, status, created_at
)
VALUES (
    'developers.xlsx', 1, 'main', 'xlsx', 'processing', NOW()
);
```

---

## ÉTAPE 11 : Le Service Parse le Fichier

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 867-877) :
```python
try:
    rows = self._parse_file(file_content, file_type)
except HTTPException:
    raise
except Exception as e:
    # Si erreur de lecture, marque le log comme échoué
    self.import_log_repo.fail(db, import_log_id, str(e))
    db.commit()
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Erreur de lecture du fichier : {e}",
    )
```

**Ce qui se passe** :
- Le service appelle `_parse_file()` pour lire le fichier
- Si c'est un CSV, il utilise le module Python `csv`
- Si c'est un Excel, il utilise une librairie comme `openpyxl` ou `pandas`
- Le résultat est une liste de dictionnaires (une ligne = un dictionnaire)

**Exemple de résultat** :
```python
rows = [
    {
        'name': 'Ahmed Ben Ali',
        'email': 'ahmed@corp.tn',
        'gitlab_username': 'ahmed.benali',
        'sites': 'Paris',
        'projects': 'backend-api',
        'group': 'Backend Tunis'
    },
    {
        'name': 'Mohamed Karray',
        'email': 'mohamed@corp.tn',
        'gitlab_username': 'mohamed.karray',
        'sites': 'Tunis',
        'projects': 'frontend',
        'group': 'Frontend Paris'
    }
]
```

---

## ÉTAPE 12 : Le Service Charge les Référentiels en Mémoire

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 879-904) :
```python
# Préparation de la fenêtre temporelle (si période spécifiée)
p_start = p_end = None
if period_id:
    period = db.query(Period).filter(Period.id == period_id).first()
    if period:
        from app.services.extraction.extraction_filters import build_period_window
        _, _, p_start, p_end = build_period_window(period)

# Pré-chargement O(1) des référentiels (cache)
all_sites = {s.name.lower().strip(): s for s in self.site_repo.get_all(db)}
all_groups = {g.name.lower().strip(): g for g in self.group_repo.get_all(db)}

# Projets : double indexation (par nom et par ID GitLab)
_projects_all = self.project_repo.get_all(db, active_only=False)
all_projects_by_name = {p.name.lower(): p for p in _projects_all}
all_projects_by_id = {p.gitlab_project_id: p for p in _projects_all if p.gitlab_project_id}
```

**Ce qui se passe** :
- Le service charge TOUS les sites de la base en mémoire
- Il crée un dictionnaire : `{"paris": Site(id=5), "tunis": Site(id=6)}`
- Il fait de même pour les groupes et les projets
- Pour les projets, il crée 2 index : par nom et par ID GitLab

**Pourquoi ?**
- Pour éviter de faire une requête SQL pour chaque ligne du CSV
- C'est beaucoup plus rapide (O(1) au lieu de O(n))

**En base de données** :
```sql
SELECT * FROM site;
SELECT * FROM developer_group;
SELECT * FROM project;
```

---

## ÉTAPE 13 : Le Service Traite Chaque Ligne du CSV

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 918-960) :
```python
for row_num, row in enumerate(rows, start=2):  # Commence à 2 (ligne 1 = en-têtes)
    # Fonction résiliente pour extraire les valeurs (tolère variations de noms)
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
    group_csv_raw = get_val(["group", "groups", "groupe", "groupes", "equipe", "équipe", "team"])
    
    # Parsing des dates
    onboarding_csv_raw  = get_val(["onboarding_date", "date_entree", "date_arrivee", "join_date"])
    offboarding_csv_raw = get_val(["offboarding_date", "date_sortie", "date_depart", "leave_date"])

    def parse_csv_date(val):
        if not val: return None
        try:
            if "/" in val:
                return datetime.strptime(val, "%d/%m/%Y").date()
            return datetime.fromisoformat(val).date()
        except: return None

    onboarding_date  = parse_csv_date(onboarding_csv_raw)
    offboarding_date = parse_csv_date(offboarding_csv_raw)
```

**Ce qui se passe** :
- Le service parcourt chaque ligne du CSV
- Pour chaque ligne, il extrait les valeurs
- La fonction `get_val()` est résiliente : elle accepte plusieurs variantes de noms de colonnes
- Les dates sont parsées (supporte YYYY-MM-DD et DD/MM/YYYY)

**Exemple pour la ligne 2** :
```python
row = {
    'name': 'Ahmed Ben Ali',
    'email': 'ahmed@corp.tn',
    'gitlab_username': 'ahmed.benali',
    'sites': 'Paris',
    'projects': 'backend-api',
    'group': 'Backend Tunis',
    'onboarding_date': '2024-01-15',
    'offboarding_date': ''
}

name = 'Ahmed Ben Ali'
email = 'ahmed@corp.tn'
username = 'ahmed.benali'
group_csv_raw = 'Backend Tunis'
onboarding_date = datetime.date(2024, 1, 15)
offboarding_date = None
```

---

## ÉTAPE 14 : Le Service Valide les Champs Obligatoires

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 962-969) :
```python
if not name or not email or not username:
    logger.warning("Import Ligne %d: Champs manquants (Nom=%s, Email=%s, User=%s)", row_num, name, email, username)
    error_list.append({
        "row": row_num, "status": "error",
        "name": name or None, "email": email or None,
        "reason": "Champs obligatoires manquants (name, email, gitlab_username)",
    })
    continue  # Passe à la ligne suivante
```

**Ce qui se passe** :
- Le service vérifie que les champs obligatoires sont présents
- Si un champ manque, il ajoute une erreur à la liste
- Il passe à la ligne suivante (continue)

**Pourquoi ?**
- Pour éviter de créer des développeurs incomplets
- Pour signaler clairement les erreurs à l'utilisateur

---

## ÉTAPE 15 : Le Service Détecte les Doublons

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 973-978) :
```python
existing_dev = None
if self.dev_repo.get_by_email(db, email):
    existing_dev = self.dev_repo.get_by_email(db, email)
elif self.dev_repo.get_by_gitlab_username(db, username):
    existing_dev = self.dev_repo.get_by_gitlab_username(db, username)
```

**Ce qui se passe** :
- Le service cherche si un développeur avec cet email existe déjà
- Si non, il cherche par username GitLab
- S'il trouve un développeur existant, c'est un doublon

**En base de données** :
```sql
SELECT * FROM developer WHERE email = 'ahmed@corp.tn';
-- OU
SELECT * FROM developer WHERE gitlab_username = 'ahmed.benali';
```

---

## ÉTAPE 16 : Mode Dry-run (Prévisualisation)

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 980-999) :
```python
if dry_run:  # true = prévisualisation
    # Analyse des entités sans créer le développeur
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
    continue  # Passe à la ligne suivante (pas de création en base)
```

**Ce qui se passe en mode dry-run** :
- Le service analyse chaque ligne
- Il détecte les sites/projets/groupes inconnus
- Il NE crée RIEN en base de données
- Il simule ce qui se passerait
- Il retourne un rapport de prévisualisation

**Pourquoi le dry-run ?**
- Pour voir ce qui va se passer sans risquer d'erreur
- Pour détecter les entités inconnues (sites, projets, groupes)
- Pour corriger les erreurs avant l'import réel

---

## ÉTAPE 17 : Le Service Résout les Sites

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 1003-1025) :
```python
site_names = [s.strip() for s in (row.get("sites") or "").split(",") if s.strip()]
resolved_sites = []

for i, sname in enumerate(site_names):
    site = all_sites.get(sname.lower())  # Recherche dans le cache
    if site is None:
        if create_missing_sites:  # Si auto-création activée
            site = self.site_repo.create_from_import(db, sname)
            all_sites[sname.lower()] = site
            created_sites_names.add(sname)
            logger.info("Import: site '%s' créé (ligne %d)", sname, row_num)
        else:
            # Site inconnu → warning
            unknown_sites_names.add(sname)
            row_warnings.append(f"Site '{sname}' introuvable — dev mis à jour sans ce site.")
            continue
    resolved_sites.append({
        "site": site,
        "is_primary": (i == 0 and not resolved_sites),  # Premier site = principal
    })
```

**Ce qui se passe** :
- Le service extrait les sites de la ligne (séparés par virgule)
- Pour chaque site, il cherche dans le cache
- Si le site existe → l'utilise
- Si le site n'existe PAS :
  - Si `create_missing_sites=true` → le crée
  - Si `create_missing_sites=false` → warning, passe ce site

**Exemple concret** :
```
CSV : sites = "Paris,Tunis"
Cache : {"paris": Site(id=5), "lyon": Site(id=7)}

Pour "Paris" :
  - Recherche "paris" dans le cache → TROUVÉ (Site id=5)
  - Ajouté à resolved_sites

Pour "Tunis" :
  - Recherche "tunis" dans le cache → PAS TROUVÉ
  - Si create_missing_sites=true → Crée Site(id=8, name="Tunis")
  - Ajouté au cache
  - Ajouté à resolved_sites
```

---

## ÉTAPE 18 : Le Service Résout les Projets

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 1027-1081) :
```python
project_items = [p.strip() for p in (row.get("projects") or "").split(",") if p.strip()]
resolved_projects = []

for pitem in project_items:
    # Analyse syntaxe "Nom:ID" (ex: "Frontend:1234")
    parts = pitem.rsplit(":", 1)
    pname = parts[0].strip()
    p_gitlab_id = int(parts[1].strip()) if len(parts) > 1 and parts[1].strip().isdigit() else None

    # 1. Recherche par ID GitLab (le plus fiable)
    proj = None
    if p_gitlab_id and p_gitlab_id in all_projects_by_id:
        proj = all_projects_by_id[p_gitlab_id]
    
    # 2. Recherche par Nom si non trouvé par ID
    if proj is None:
        proj = all_projects_by_name.get(pname.lower())
    
    if proj is None:
        if create_missing_projects:  # Si auto-création activée
            proj = self.project_repo.create_from_import(
                db, pname, gitlab_project_id=p_gitlab_id, 
                gitlab_config_id=default_gitlab_config_id
            )
            all_projects_by_name[pname.lower()] = proj
            created_projects_names.add(pname)
        else:
            # Projet inconnu → warning
            unknown_projects_data[pname] = p_gitlab_id
            row_warnings.append(f"Projet '{pname}' introuvable — dev mis à jour sans ce projet.")
            continue
    
    resolved_projects.append(proj)
    csv_project_ids.add(proj.id)  # Pour le full_sync
```

**Ce qui se passe** :
- Le service extrait les projets de la ligne
- Il supporte la syntaxe "Nom" ou "Nom:ID"
- Il cherche d'abord par ID GitLab (plus fiable)
- Puis par nom
- Si non trouvé et auto-création activée → crée le projet

**Exemple concret** :
```
CSV : projects = "backend-api:1234,frontend"
Cache par ID : {1234: Project(id=789, name="backend-api")}
Cache par nom : {"backend-api": Project(id=789), "mobile-app": Project(id=790)}

Pour "backend-api:1234" :
  - Recherche ID 1234 dans le cache → TROUVÉ (Project id=789)
  - Ajouté à resolved_projects

Pour "frontend" :
  - Recherche "frontend" dans le cache par nom → PAS TROUVÉ
  - Si create_missing_projects=true → Crée Project(id=791, name="frontend")
  - Ajouté au cache
  - Ajouté à resolved_projects
```

---

## ÉTAPE 19 : Le Service Résout les Groupes

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 1083-1107) :
```python
groups_csv = [g.strip() for g in group_csv_raw.split(",") if g.strip()]
resolved_group_ids = []

for gname in groups_csv:
    gname_clean = gname.lower().strip()
    group = all_groups.get(gname_clean)
    
    if group is None:
        if create_missing_groups:  # Si auto-création activée
            group = self.group_repo.create_from_import(db, gname)
            db.flush()  # Pour avoir l'ID
            all_groups[gname_clean] = group
            created_groups_names.add(gname)
        else:
            # Groupe inconnu → warning
            unknown_groups_names.add(gname)
            row_warnings.append(f"Groupe '{gname}' introuvable (auto-création OFF).")
    
    if group:
        resolved_group_ids.append(group.id)

# Fallback sur default_group_id si aucun groupe résolu
if not resolved_group_ids and default_group_id:
    resolved_group_ids = [default_group_id]
```

**Ce qui se passe** :
- Le service extrait les groupes de la ligne
- Il cherche dans le cache par nom (case-insensitive)
- Si non trouvé et auto-création activée → crée le groupe
- Si aucun groupe résolu → utilise le groupe par défaut

**Exemple concret** :
```
CSV : group = "Backend Tunis"
Cache : {"backend tunis": Group(id=456), "frontend paris": Group(id=457)}

Pour "Backend Tunis" :
  - Recherche "backend tunis" dans le cache → TROUVÉ (Group id=456)
  - Ajouté à resolved_group_ids
```

---

## ÉTAPE 20 : Le Service Crée ou Met à Jour le Développeur

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Cas 1 : Développeur existe déjà (UPSERT)**

**Code Backend** (Ligne 1123-1224) :
```python
if existing_dev:
    # Politique de réactivation Enterprise
    if existing_dev.offboarding_date is not None:
        # Dev offboardé → correction groupe uniquement
        if resolved_group_ids:
            self.dev_repo.sync_groups_smart(
                db, existing_dev, resolved_group_ids,
                p_start=effective_p_start,
                p_end=existing_dev.offboarding_date
            )
        success_list.append({
            "row": row_num, "status": "updated",
            "name": name, "email": email,
            "reason": f"Groupe corrigé (dev offboardé le {existing_dev.offboarding_date})."
        })
        processed_ids.add(existing_dev.id)
        continue
    
    # Mise à jour des dates
    hist_updates = {}
    if onboarding_date: hist_updates["onboarding_date"] = onboarding_date
    if offboarding_date is not None: hist_updates["offboarding_date"] = offboarding_date
    if hist_updates:
        self.dev_repo.update(db, existing_dev, hist_updates)

    # Synchronisation intelligente des groupes
    if resolved_group_ids:
        self.dev_repo.sync_groups_smart(
            db, existing_dev, resolved_group_ids, p_start=effective_p_start
        )

    # Synchronisation intelligente des sites
    if resolved_sites:
        self.dev_site_repo.sync_smart(
            db, existing_dev.id,
            [{"site_id": rs["site"].id, "is_primary": rs["is_primary"]} for rs in resolved_sites],
            p_start=effective_p_start
        )

    # Synchronisation intelligente des projets
    if resolved_projects:
        project_ids = [p.id for p in resolved_projects]
        self.dev_proj_repo.sync_smart(
            db, existing_dev.id, project_ids, p_start=effective_p_start
        )

    success_list.append({
        "row": row_num, "status": "updated",
        "name": name, "email": email,
        "reason": "Mise à jour réussie (affectations ajoutées)."
    })
    processed_ids.add(existing_dev.id)
```

**Ce qui se passe** :
- Si le développeur existe déjà (même email ou username)
- Le service met à jour ses affectations (groupes, sites, projets)
- Il utilise la synchronisation intelligente (SCD Type 2)
- Il ne crée PAS de nouveau développeur

**En base de données** :
```sql
-- Mise à jour du développeur
UPDATE developer 
SET onboarding_date = '2024-01-15'
WHERE id = 123;

-- Synchronisation des groupes (SCD Type 2)
INSERT INTO developer_group_link (developer_id, group_id, start_date, is_active)
VALUES (123, 456, '2024-01-15', true);

-- Synchronisation des sites (SCD Type 2)
INSERT INTO developer_site (developer_id, site_id, is_primary, start_date, is_active)
VALUES (123, 5, true, '2024-01-15', true);

-- Synchronisation des projets (SCD Type 2)
INSERT INTO developer_project (developer_id, project_id, period_id, start_date, is_active)
VALUES (123, 789, 12, '2024-01-15', true);
```

---

**Cas 2 : Nouveau développeur (CRÉATION)**

**Code Backend** (Ligne 1229-1291) :
```python
else:
    # Création standard
    dev_data = {
        "gitlab_username": username,
        "name": name,
        "email": email,
        "is_active": True,
        "is_validated": True,  # Validé automatiquement
        "is_bot": False,
        "auto_created": False,
        "source": "csv_import",  # Trace de provenance
        "created_by": imported_by,  # Votre ID
        "onboarding_date": onboarding_date,
        "offboarding_date": offboarding_date,
    }

    developer = self.dev_repo.create(
        db, dev_data, 
        group_ids=resolved_group_ids,
        p_start=effective_p_start,
        p_end=p_end
    )
    db.flush()

    # Synchronisation intelligente des sites
    if resolved_sites:
        self.dev_site_repo.sync_smart(
            db, developer.id,
            [{"site_id": rs["site"].id, "is_primary": rs["is_primary"]} for rs in resolved_sites],
            p_start=effective_p_start
        )

    # Synchronisation intelligente des projets
    if resolved_projects:
        project_ids = [p.id for p in resolved_projects]
        self.dev_proj_repo.sync_smart(
            db, developer.id, project_ids, p_start=effective_p_start
        )

    success_list.append({
        "row": row_num, "status": "success",
        "name": name, "email": email,
    })
    processed_ids.add(developer.id)
```

**Ce qui se passe** :
- Si le développeur n'existe PAS
- Le service crée un nouveau développeur
- Il valide automatiquement (`is_validated=True`)
- Il associe les groupes, sites et projets
- Il utilise la synchronisation intelligente (SCD Type 2)

**En base de données** :
```sql
-- Création du développeur
INSERT INTO developer (
    gitlab_username, name, email, is_active, is_validated, 
    is_bot, auto_created, source, created_by, 
    onboarding_date, offboarding_date, created_at
)
VALUES (
    'ahmed.benali', 'Ahmed Ben Ali', 'ahmed@corp.tn', 
    true, true, false, false, 'csv_import', 1, 
    '2024-01-15', NULL, NOW()
);
-- ID généré : 123

-- Association aux groupes
INSERT INTO developer_group_link (developer_id, group_id, start_date, is_active)
VALUES (123, 456, '2024-01-15', true);

-- Association aux sites
INSERT INTO developer_site (developer_id, site_id, is_primary, start_date, is_active)
VALUES (123, 5, true, '2024-01-15', true);

-- Association aux projets
INSERT INTO developer_project (developer_id, project_id, period_id, start_date, is_active)
VALUES (123, 789, 12, '2024-01-15', true);
```

---

## ÉTAPE 21 : Le Service Finalise le Log d'Import

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\services\admin\developer_service.py`

**Code Backend** (Ligne 1350-1367) :
```python
self.import_log_repo.complete(
    db, import_log_id,
    total_rows = len(rows),
    success_count = len(success_list),
    error_count = len(error_list),
    duplicate_count = len(duplicate_list),
    report_data = {
        "success": success_list,
        "errors": error_list,
        "duplicates": duplicate_list,
    },
)

if not dry_run:  # false = création réelle
    db.commit()  # Valide tous les changements en base
else:
    db.rollback()  # Annule tous les changements (dry-run)
```

**Ce qui se passe** :
- Le service met à jour le log d'import avec les statistiques
- Si `dry_run=false` → `COMMIT` (valide les changements)
- Si `dry_run=true` → `ROLLBACK` (annule les changements)

**En base de données** :
```sql
-- Mise à jour du log d'import
UPDATE developer_import_log
SET status = 'completed',
    total_rows = 10,
    success_count = 8,
    error_count = 1,
    duplicate_count = 1,
    report_data = '{"success": [...], "errors": [...]}'
WHERE id = 1;

-- COMMIT (si dry_run=false)
COMMIT;
```

---

## ÉTAPE 22 : Le Backend Recalcule les KPIs en Background

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\developers.py`

**Code Backend** (Ligne 731-744) :
```python
if not dry_run and processed_ids:
    from app.services.kpi.kpi_service import KpiService
    kpi_service = KpiService()
    
    for d_id in processed_ids:
        background_tasks.add_task(
            kpi_service.recalculate_developer_history,
            developer_id=d_id,
            changed_fields=["import_sync"]
        )
```

**Ce qui se passe** :
- Pour chaque développeur importé/mis à jour
- Le backend ajoute une tâche de fond
- Cette tâche recalculera tous les KPIs du développeur
- Le recalcul se fait en arrière-plan (non bloquant)

**Pourquoi en background ?**
- Pour ne pas faire attendre l'utilisateur
- Le recalcul peut prendre du temps
- L'utilisateur reçoit la réponse immédiate

---

## ÉTAPE 23 : Le Backend Retourne la Réponse

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\backend\app\api\routers\developers.py`

**Structure de la réponse** :
```json
{
  "dry_run": true,
  "total_rows": 10,
  "success_count": 8,
  "error_count": 1,
  "duplicate_count": 1,
  "unknown_sites": [],
  "unknown_projects": [],
  "unknown_groups": [],
  "created_sites": [],
  "created_projects": [],
  "created_groups": [],
  "deactivated_count": 0,
  "rows": [
    {
      "row": 2,
      "status": "success",
      "name": "Ahmed Ben Ali",
      "email": "ahmed@corp.tn"
    },
    {
      "row": 3,
      "status": "error",
      "name": "Leila Mansour",
      "email": "leila@corp.tn",
      "reason": "Champs obligatoires manquants"
    }
  ]
}
```

---

## ÉTAPE 24 : Le Frontend Affiche les Résultats

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

**Chemin complet** : `c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrectionMAIimportant\dataCollection\src\frontend\src\pages\admin\DevelopersImportPage.jsx`

**Code Frontend** (Ligne 99-216) :
```javascript
function ImportResultBanners({ result }) {
  const hasCreatedSites = result.created_sites?.length > 0;
  const hasCreatedProjects = result.created_projects?.length > 0;
  const hasUnknownSites = result.unknown_sites?.length > 0;

  if (hasCreatedSites || hasCreatedProjects) {
    // Affiche un bandeau vert : "Entités créées automatiquement"
  }

  if (hasUnknownSites) {
    // Affiche un bandeau jaune : "Entités introuvables"
  }
}
```

**Ce que vous voyez** :
```
┌─────────────────────────────────────────────────┐
│  ✅ Import terminé avec succès                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Total : 10 lignes                              │
│  Succès : 8                                     │
│  Erreurs : 1                                    │
│  Doublons : 1                                   │
│                                                 │
│  Détails :                                      │
│  ✓ Ahmed Ben Ali (ligne 2)                      │
│  ✓ Mohamed Karray (ligne 3)                     │
│  ✗ Leila Mansour (ligne 4) - Champs manquants  │
│  ⚠ Ahmed Dupont (ligne 5) - Déjà existant       │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Résumé Simple du Flux

```
1. Vous préparez un fichier Excel avec les développeurs
   ↓
2. Vous allez sur la page "Import Développeurs"
   ↓
3. Vous uploadez le fichier
   ↓
4. Le frontend envoie le fichier au backend (HTTP POST)
   ↓
5. Le backend reçoit la requête et valide le fichier
   ↓
6. Le backend lit le fichier (parse CSV/Excel)
   ↓
7. Le backend charge les référentiels (sites, groupes, projets)
   ↓
8. Pour chaque ligne du CSV :
   - Extrait les données
   - Valide les champs obligatoires
   - Détecte les doublons
   - Résout les sites (lookup ou création)
   - Résout les projets (lookup ou création)
   - Résout les groupes (lookup ou création)
   - Crée ou met à jour le développeur
   ↓
9. Le backend valide les changements (COMMIT)
   ↓
10. Le backend lance le recalcul des KPIs en background
   ↓
11. Le backend retourne le résultat
   ↓
12. Le frontend affiche les résultats
```

---

## Points Clés à Retenir

### 1. Séparation des Responsabilités
- **Frontend** : Interface utilisateur, envoi du fichier
- **Backend API** : Réception HTTP, validation
- **Backend Service** : Logique métier (résolution, création)
- **Backend Repositories** : Accès aux données
- **Base de données** : Stockage

### 2. Mode Dry-run (Prévisualisation)
- Simule l'import sans créer en base
- Détecte les entités inconnues
- Permet de corriger avant l'import réel

### 3. Auto-création
- Si activée, crée automatiquement les sites/projets/groupes manquants
- Avec des données minimales (à compléter après)

### 4. Synchronisation Intelligente (SCD Type 2)
- Gère les affectations temporelles
- Utilise `sync_smart` pour sites, projets, groupes
- Auto-discovery des associations projet-site

### 5. Full Sync
- Désactive les développeurs absents du CSV
- Ne modifie PAS `Developer.is_active` (seulement les missions)
- Pour synchroniser avec l'effectif actuel

### 6. Recalcul KPIs
- Se fait en background (non bloquant)
- Recalcule tous les KPIs des développeurs impactés
- Maintient les métriques à jour

### 7. Traçabilité
- Log d'import complet
- Audit log pour chaque action
- Permet de savoir qui a fait quoi et quand

---

## Conclusion

Ce flux d'import illustre parfaitement votre architecture **Clean Architecture** :

- Chaque couche a une responsabilité claire
- Le flux est prévisible et testable
- La logique métier est isolée dans le service
- Les données sont protégées par le dry-run
- L'audit complet assure la traçabilité

C'est une implémentation **professionnelle** et **maintenable** pour gérer l'import massif de développeurs.
