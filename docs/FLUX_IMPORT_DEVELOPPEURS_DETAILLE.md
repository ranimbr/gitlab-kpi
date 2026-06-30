# Flux Technique Détaillé - Import Développeurs par Super Admin

## Vue d'ensemble du Flux

```
Super Admin (Navigateur)
    ↓
Frontend : DevelopersImportPage.jsx
    ↓
Frontend : developerService.js (importFile)
    ↓
HTTP POST /api/v1/developers/import (multipart/form-data)
    ↓
Backend : api/routers/developers.py (endpoint import_developers)
    ↓
Backend : services/admin/developer_service.py (import_from_file)
    ↓
Backend : repositories (accès DB)
    ↓
PostgreSQL (sauvegarde)
```

---

## ÉTAPE 1 : Frontend - Sélection du Fichier

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

### Action du Super Admin
1. Navigue vers la page `/admin/developers/import`
2. Glisse-dépose un fichier CSV/Excel ou clique pour sélectionner
3. Configure les options :
   - Site par défaut (optionnel)
   - Groupe par défaut (optionnel)
   - Configuration GitLab par défaut (optionnel)
   - Période cible (optionnel)
   - Dry-run (coché par défaut) = prévisualisation
   - Créer sites manquants (désactivé par défaut)
   - Créer projets manquants (désactivé par défaut)
   - Créer groupes manquants (désactivé par défaut)
   - Full Sync (désactivé par défaut)

### Code Frontend
```javascript
// Ligne 397-409 : handleFile
const handleFile = (f) => {
  if (!f) return;
  const ext = "." + f.name.split(".").pop().toLowerCase();
  if (!ACCEPTED_EXTS.includes(ext)) {
    setError("Format non supporté. Utilisez .csv, .xlsx ou .xls");
    return;
  }
  setFile(f);  // Stocke le fichier dans le state
  setResult(null);
  setError("");
};
```

---

## ÉTAPE 2 : Frontend - Prévisualisation (Dry-run)

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

### Action du Super Admin
1. Clique sur le bouton "Prévisualiser"
2. Le frontend appelle `handleImport(true)` (dry_run = true)

### Code Frontend
```javascript
// Ligne 414-450 : handleImport
const handleImport = useCallback(async (forceDryRun = dryRun) => {
  if (!file) { setError("Veuillez sélectionner un fichier."); return; }
  setLoading(true);
  setError("");
  setResult(null);

  try {
    const res = await developerService.importFile(file, {
      defaultSiteId:         siteId  || null,
      defaultGroupId:        groupId || null,
      defaultGitlabConfigId: defaultGitlabConfigId || null,
      dryRun:                forceDryRun,  // true pour prévisualisation
      createMissingSites:    forceDryRun ? false : createMissingSites,
      createMissingProjects: forceDryRun ? false : createMissingProjects,
      createMissingGroups:   forceDryRun ? false : createMissingGroups,
      fullSync:               forceDryRun ? false : fullSync,
      periodId:               periodId || null,
    });

    setResult(res);
    setActiveTab(res.error_count > 0 ? "error" : "success");

    // Afficher l'étape de résolution si dry-run avec entités inconnues
    if (forceDryRun && (res.unknown_sites?.length > 0 || res.unknown_projects?.length > 0)) {
      setShowResolutionStep(true);
    }

    refreshLogs();
  } catch (err) {
    setError(err.message || "Erreur lors de l'import.");
  } finally {
    setLoading(false);
  }
}, [file, siteId, groupId, defaultGitlabConfigId, dryRun, createMissingSites, createMissingProjects, createMissingGroups, fullSync, refreshLogs]);
```

---

## ÉTAPE 3 : Frontend - Appel API

**Fichier** : `dataCollection/src/frontend/src/services/developerService.js`

### Code Frontend
```javascript
// Ligne 107-132 : importFile
importFile: (file, options = {}) => {
  const form = new FormData();
  form.append("file", file);

  if (options.defaultSiteId)
    form.append("default_site_id",  String(options.defaultSiteId));
  if (options.defaultGroupId)
    form.append("default_group_id", String(options.defaultGroupId));
  if (options.defaultGitlabConfigId)
    form.append("default_gitlab_config_id", String(options.defaultGitlabConfigId));
  if (options.periodId)
    form.append("period_id", String(options.periodId));

  // Booléens → strings "true"/"false" (FormData ne sérialise pas les booléens)
  form.append("dry_run",                 options.dryRun                ? "true" : "false");
  form.append("create_missing_sites",    options.createMissingSites    ? "true" : "false");
  form.append("create_missing_projects", options.createMissingProjects ? "true" : "false");
  form.append("create_missing_groups",   options.createMissingGroups   ? "true" : "false");
  form.append("full_sync",               options.fullSync              ? "true" : "false");

  return api.post("/developers/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
}
```

**Requête HTTP envoyée** :
```
POST /api/v1/developers/import
Content-Type: multipart/form-data

file: [binaire du fichier CSV/Excel]
default_site_id: "5"
default_group_id: "3"
default_gitlab_config_id: "1"
period_id: "12"
dry_run: "true"
create_missing_sites: "false"
create_missing_projects: "false"
create_missing_groups: "false"
full_sync: "false"
```

---

## ÉTAPE 4 : Backend - Réception de la Requête

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

### Code Backend
```python
# Ligne 649-746 : endpoint import_developers
@router.post("/import", response_model=DeveloperImportResponse, status_code=201)
async def import_developers(
    background_tasks:        BackgroundTasks,
    file:                    UploadFile    = File(..., description="Fichier CSV ou Excel"),
    period_id:               Optional[int] = Form(default=None),
    default_site_id:         Optional[int] = Form(default=None),
    default_group_id:        Optional[int] = Form(default=None),
    default_gitlab_config_id: Optional[int] = Form(default=None),
    dry_run:                 bool          = Form(default=False),
    create_missing_sites:    bool          = Form(default=False),
    create_missing_projects: bool          = Form(default=False),
    create_missing_groups:   bool          = Form(default=False),
    full_sync:               bool            = Form(default=False),
    db:                      Session       = Depends(get_db),
    current_admin:           AppUser       = Depends(get_current_admin),
):
```

### Actions du Backend
1. **Validation du format** :
```python
if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
    raise HTTPException(
        status_code=400,
        detail="Format non supporté. Utilisez CSV (.csv) ou Excel (.xlsx, .xls).",
    )
```

2. **Lecture du fichier** :
```python
content = await file.read()  # Lit le contenu binaire
```

3. **Auto-découverte du domaine GitLab** (si non spécifié) :
```python
if default_gitlab_config_id is None:
    from app.models.gitlab_config import GitLabConfig
    first_config = db.query(GitLabConfig).first()
    if first_config:
        default_gitlab_config_id = first_config.id
        logger.info("Import: Aucun domaine spécifié, utilisation automatique du Domaine ID %d", default_gitlab_config_id)
```

4. **Appel au service d'import** :
```python
service = DeveloperService()
result = service.import_from_file(
    db                      = db,
    file_content            = content,
    file_name               = file.filename,
    period_id               = period_id,
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

5. **Recalcul automatique des KPIs** (si pas dry-run) :
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

6. **Retour de la réponse** :
```python
return result
```

---

## ÉTAPE 5 : Backend - Service d'Import (Logique Métier)

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

### Code Backend
```python
# Ligne 828-843 : import_from_file
def import_from_file(
    self,
    db:                      Session,
    file_content:            bytes,
    file_name:               str,
    period_id:               Optional[int] = None,
    imported_by:             Optional[int] = None,
    default_site_id:         Optional[int] = None,
    default_group_id:        Optional[int] = None,
    default_gitlab_config_id: Optional[int] = None,
    dry_run:                 bool = False,
    create_missing_sites:    bool = False,
    create_missing_projects: bool = False,
    create_missing_groups:   bool = False,
    full_sync:               bool = False,
) -> dict:
```

### Actions du Service

#### 5.1 Détection du type de fichier
```python
file_type = "xlsx" if file_name.lower().endswith((".xlsx", ".xls")) else "csv"
```

#### 5.2 Création du log d'import
```python
target_db = current_db_var.get() or "unknown"

import_log_id = self.import_log_repo.create_log(
    db, file_name=file_name, imported_by=imported_by, target_database=target_db, file_type=file_type
)
db.flush()
```

#### 5.3 Parsing du fichier
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

#### 5.4 Préparation de la fenêtre temporelle (si période spécifiée)
```python
p_start = p_end = None
if period_id:
    period = db.query(Period).filter(Period.id == period_id).first()
    if period:
        from app.services.extraction.extraction_filters import build_period_window
        _, _, p_start, p_end = build_period_window(period)
```

#### 5.5 Pré-chargement des référentiels (cache)
```python
# Sites : index par nom (case-insensitive)
all_sites = {s.name.lower().strip(): s for s in self.site_repo.get_all(db)}

# Groupes : index par nom (case-insensitive)
all_groups = {g.name.lower().strip(): g for g in self.group_repo.get_all(db)}

# Projets : double indexation (par nom et par ID GitLab)
_projects_all = self.project_repo.get_all(db, active_only=False)
all_projects_by_name = {p.name.lower(): p for p in _projects_all}
all_projects_by_id   = {p.gitlab_project_id: p for p in _projects_all if p.gitlab_project_id}
```

#### 5.6 Initialisation des collecteurs
```python
success_list   : List[dict] = []
error_list     : List[dict] = []
duplicate_list : List[dict] = []

unknown_sites_names    : Set[str] = set()
unknown_projects_data  : Dict[str, Optional[int]] = {}
unknown_groups_names   : Set[str] = set()
created_sites_names    : Set[str] = set()
created_projects_names : Set[str] = set()
created_groups_names   : Set[str] = set()

csv_project_ids: set = set()  # Projets référencés dans le CSV
processed_ids: set = set()
```

---

## ÉTAPE 6 : Backend - Traitement Ligne par Ligne

### Pour chaque ligne du CSV (à partir de la ligne 2)

#### 6.1 Extraction des données de la ligne
```python
# Ligne 918-960
for row_num, row in enumerate(rows, start=2):
    # Fonction résiliente pour extraire les valeurs (tolère variations de noms de colonnes)
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
    
    onboarding_csv_raw  = get_val(["onboarding_date", "date_entree", "date_arrivee", "join_date"])
    offboarding_csv_raw = get_val(["offboarding_date", "date_sortie", "date_depart", "leave_date"])
    mission_start_raw   = get_val(["mission_start", "start_date", "debut_mission", "date_debut"])
    mission_end_raw     = get_val(["mission_end", "end_date", "fin_mission", "date_fin"])

    # Parsing des dates (supporte YYYY-MM-DD et DD/MM/YYYY)
    def parse_csv_date(val):
        if not val: return None
        try:
            if "/" in val:
                return datetime.strptime(val, "%d/%m/%Y").date()
            return datetime.fromisoformat(val).date()
        except: return None

    onboarding_date  = parse_csv_date(onboarding_csv_raw)
    offboarding_date = parse_csv_date(offboarding_csv_raw)
    mission_start = parse_csv_date(mission_start_raw) or onboarding_date
    mission_end   = parse_csv_date(mission_end_raw) or offboarding_date
```

#### 6.2 Validation des champs obligatoires
```python
# Ligne 962-969
if not name or not email or not username:
    error_list.append({
        "row": row_num, "status": "error",
        "name": name or None, "email": email or None,
        "reason": "Champs obligatoires manquants (name, email, gitlab_username)",
    })
    continue
```

#### 6.3 Détection de doublon (UPSERT)
```python
# Ligne 973-978
existing_dev = None
if self.dev_repo.get_by_email(db, email):
    existing_dev = self.dev_repo.get_by_email(db, email)
elif self.dev_repo.get_by_gitlab_username(db, username):
    existing_dev = self.dev_repo.get_by_gitlab_username(db, username)
```

#### 6.4 Mode Dry-run (prévisualisation)
```python
# Ligne 980-999
if dry_run:
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
    continue
```

---

## ÉTAPE 7 : Backend - Résolution des Sites

### Code Backend
```python
# Ligne 1003-1025
site_names     = [s.strip() for s in (row.get("sites") or "").split(",") if s.strip()]
resolved_sites : List[dict] = []

for i, sname in enumerate(site_names):
    site = all_sites.get(sname.lower())
    if site is None:
        if create_missing_sites:
            # Création automatique du site
            site = self.site_repo.create_from_import(db, sname)
            all_sites[sname.lower()] = site
            created_sites_names.add(sname)
            logger.info("Import: site '%s' créé (ligne %d)", sname, row_num)
        else:
            # Site inconnu → warning
            unknown_sites_names.add(sname)
            row_warnings.append(
                f"Site '{sname}' introuvable — dev mis à jour sans ce site."
            )
            logger.warning("Import: site '%s' introuvable (ligne %d)", sname, row_num)
            continue
    resolved_sites.append({
        "site": site,
        "is_primary": (i == 0 and not resolved_sites),  # Premier site = site principal
    })
```

### Logique
- Si le site existe dans la base → utiliser
- Si le site n'existe PAS :
  - Si `create_missing_sites=True` → créer automatiquement
  - Si `create_missing_sites=False` → warning, dev créé sans ce site
- Le premier site de la liste est marqué comme "principal"

---

## ÉTAPE 8 : Backend - Résolution des Projets

### Code Backend
```python
# Ligne 1027-1081
project_items     = [p.strip() for p in (row.get("projects") or "").split(",") if p.strip()]
resolved_projects : List[object] = []

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
        if create_missing_projects:
            # Création automatique du projet
            proj = self.project_repo.create_from_import(
                db, 
                pname, 
                gitlab_project_id=p_gitlab_id, 
                gitlab_config_id=default_gitlab_config_id
            )
            all_projects_by_name[pname.lower()] = proj
            created_projects_names.add(pname)
            logger.info("Import: projet '%s' créé avec ID%s (ligne %d)", pname, p_gitlab_id, row_num)
        else:
            # Projet inconnu → warning
            if pname not in unknown_projects_data or (unknown_projects_data[pname] is None and p_gitlab_id):
                unknown_projects_data[pname] = p_gitlab_id
            row_warnings.append(
                f"Projet '{pname}' introuvable — dev mis à jour sans ce projet."
            )
            logger.warning("Import: projet '%s' introuvable (ligne %d)", pname, row_num)
            continue
    else:
        # Réparation des projets orphelins (sans config)
        updates = {}
        if p_gitlab_id is not None and getattr(proj, "gitlab_project_id", None) is None:
            updates["gitlab_project_id"] = p_gitlab_id
        if default_gitlab_config_id and getattr(proj, "gitlab_config_id", None) is None:
            updates["gitlab_config_id"] = default_gitlab_config_id
        if updates:
            self.project_repo.update(db, proj.id, updates)
    
    resolved_projects.append(proj)
    csv_project_ids.add(proj.id)  # Pour le full_sync
```

### Logique
- Supporte la syntaxe "Nom" ou "Nom:ID"
- Recherche d'abord par ID GitLab (plus fiable), puis par nom
- Si le projet n'existe PAS :
  - Si `create_missing_projects=True` → créer automatiquement
  - Si `create_missing_projects=False` → warning, dev créé sans ce projet
- Répare automatiquement les projets orphelins (sans config GitLab)

---

## ÉTAPE 9 : Backend - Résolution des Groupes

### Code Backend
```python
# Ligne 1083-1107
groups_csv = [g.strip() for g in group_csv_raw.split(",") if g.strip()]
resolved_group_ids: List[int] = []

for gname in groups_csv:
    gname_clean = gname.lower().strip()
    group = all_groups.get(gname_clean)
    
    if group is None:
        if create_missing_groups:
            # Création automatique du groupe
            group = self.group_repo.create_from_import(db, gname)
            db.flush()  # Pour avoir l'ID
            all_groups[gname_clean] = group
            created_groups_names.add(gname)
            logger.info("Import: groupe '%s' CRÉÉ et indexé (ligne %d)", gname, row_num)
        else:
            # Groupe inconnu → warning
            unknown_groups_names.add(gname)
            row_warnings.append(f"Groupe '{gname}' introuvable (auto-création OFF).")
            logger.warning("Import: groupe '%s' introuvable et non créé (ligne %d)", gname, row_num)
    if group:
        resolved_group_ids.append(group.id)

# Fallback sur default_group_id si aucun groupe résolu
if not resolved_group_ids and default_group_id:
    resolved_group_ids = [default_group_id]
```

### Logique
- Recherche le groupe par nom (case-insensitive)
- Si le groupe n'existe PAS :
  - Si `create_missing_groups=True` → créer automatiquement
  - Si `create_missing_groups=False` → warning, dev créé sans groupe
- Si aucun groupe résolu → utilise `default_group_id`

---

## ÉTAPE 10 : Backend - Calcul de la Date d'Effet

### Code Backend
```python
# Ligne 1111-1121
# Définir le start_date effectif pour la synchronisation
effective_p_start = p_start  # date de la période sélectionnée (ex: 01/01/2026)
if onboarding_date:
    # On prend le MAX : si le dev arrive en cours de période, sa mission commence à son arrivée
    onboarding_as_dt = datetime.combine(onboarding_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    if not effective_p_start or onboarding_as_dt > effective_p_start:
        effective_p_start = onboarding_as_dt
```

### Logique
- La date d'effet est le MAX entre :
  - La date de début de la période sélectionnée
  - La date d'onboarding du développeur
- Cela garantit qu'un dev ne démarre jamais AVANT son onboarding

---

## ÉTAPE 11 : Backend - Mise à jour (UPSERT) d'un Développeur Existant

### Code Backend
```python
# Ligne 1123-1224
if existing_dev:
    # Politique de réactivation Enterprise
    if existing_dev.offboarding_date is not None:
        # RÈGLE : Un dev offboardé NE DOIT PAS être réactivé par un import CSV
        # MAIS : On corrige son AFFECTATION (groupe/équipe) uniquement
        logger.info(
            "Import Ligne %d: DEV_OFFBOARDED_GROUP_SYNC — %s a une date de départ (%s), "
            "correction groupe uniquement (pas de réactivation).",
            row_num, name, existing_dev.offboarding_date
        )
        if resolved_group_ids:
            self.dev_repo.sync_groups_smart(
                db, existing_dev, resolved_group_ids,
                p_start=effective_p_start,
                p_end=existing_dev.offboarding_date
            )
        success_list.append({
            "row": row_num, "status": "updated",
            "name": name, "email": email,
            "reason": f"Groupe corrigé (dev offboardé le {existing_dev.offboarding_date}, statut RH conservé)."
        })
        processed_ids.add(existing_dev.id)
        db.flush()
        continue  # On s'arrête là : pas de mise à jour des autres champs

    elif not existing_dev.is_active:
        # is_active=False sans offboarding_date → erreur système, on corrige
        self.dev_repo.update(db, existing_dev, {"is_active": True})
        row_warnings.append(
            "[AUTO-CORRECTION] Développeur marqué inactif sans date de départ — réactivé automatiquement."
        )
        logger.info(
            "Import Ligne %d: AUTO_REACTIVATE — %s réactivé (is_active=False sans offboarding_date).",
            row_num, name
        )

    # Mise à jour des dates si fournies dans le CSV
    hist_updates = {}
    if onboarding_date: hist_updates["onboarding_date"] = onboarding_date
    if offboarding_date is not None: hist_updates["offboarding_date"] = offboarding_date
    if hist_updates:
        self.dev_repo.update(db, existing_dev, hist_updates)

    # Synchronisation INTELLIGENTE des équipes (SCD Type 2)
    if resolved_group_ids:
        self.dev_repo.sync_groups_smart(
            db, existing_dev, resolved_group_ids, p_start=effective_p_start
        )

    # Synchronisation INTELLIGENTE des sites (SCD Type 2)
    if resolved_sites:
        self.dev_site_repo.sync_smart(
            db, existing_dev.id,
            [{"site_id": rs["site"].id, "is_primary": rs["is_primary"]} for rs in resolved_sites],
            p_start=effective_p_start
        )
    elif default_site_id:
        self.dev_site_repo.sync_smart(
            db, existing_dev.id,
            [{"site_id": default_site_id, "is_primary": True}],
            p_start=effective_p_start
        )

    # Synchronisation INTELLIGENTE des projets (SCD Type 2)
    if resolved_projects:
        project_ids = [p.id for p in resolved_projects]
        self.dev_proj_repo.sync_smart(
            db, existing_dev.id, project_ids,
            p_start=effective_p_start
        )
        self._update_developer_project_period_id(
            db, existing_dev.id, project_ids, period_id
        )
    else:
        # Si aucun projet dans le CSV, on clôture les missions actives
        self.dev_proj_repo.sync_smart(db, existing_dev.id, [], p_start=effective_p_start)

    db.flush()
    
    success_list.append({
        "row": row_num, "status": "updated",
        "name": name, "email": email,
        "reason": "Mise à jour réussie (affectations ajoutées)."
    })
    processed_ids.add(existing_dev.id)

    # Auto-discovery des associations projet-site
    self.sync_project_site_associations(db, existing_dev.id)
```

### Logique
- **Si le dev a une offboarding_date** : Pas de réactivation, seulement correction du groupe
- **Si le dev est inactif SANS offboarding_date** : Auto-réactivation (correction d'erreur)
- **Mise à jour des dates** : onboarding_date et offboarding_date si fournies
- **Synchronisation intelligente** :
  - Groupes : `sync_groups_smart` (SCD Type 2)
  - Sites : `sync_smart` (SCD Type 2)
  - Projets : `sync_smart` (SCD Type 2)
- **Auto-discovery** : Synchronisation des associations projet-site

---

## ÉTAPE 12 : Backend - Création d'un Nouveau Développeur

### Code Backend
```python
# Ligne 1229-1291
else:
    # Création standard
    dev_data = {
        "gitlab_username": username,
        "name":            name,
        "email":           email,
        "is_active":       True,
        "is_validated":    True,
        "is_bot":          False,
        "auto_created":    False,
        "source":          "csv_import",
        "created_by":      imported_by,
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

    # Synchronisation INTELLIGENTE des sites (nouveau dev)
    if resolved_sites:
        self.dev_site_repo.sync_smart(
            db, developer.id,
            [{"site_id": rs["site"].id, "is_primary": rs["is_primary"]} for rs in resolved_sites],
            p_start=effective_p_start
        )
    elif default_site_id:
        self.dev_site_repo.sync_smart(
            db, developer.id,
            [{"site_id": default_site_id, "is_primary": True}],
            p_start=effective_p_start
        )

    # Synchronisation INTELLIGENTE des projets
    if resolved_projects:
        project_ids = [p.id for p in resolved_projects]
        self.dev_proj_repo.sync_smart(
            db, developer.id, project_ids,
            p_start=effective_p_start
        )

    success_list.append({
        "row": row_num,
        "status": "success",
        "name": name,
        "email": email,
    })
    processed_ids.add(developer.id)

    # Auto-discovery des associations projet-site
    self.sync_project_site_associations(db, developer.id)
```

### Logique
- Création du développeur avec les données du CSV
- `is_validated=True` : Validé automatiquement lors de l'import
- `source="csv_import"` : Trace de la provenance
- Synchronisation intelligente des sites, groupes et projets (SCD Type 2)
- Auto-discovery des associations projet-site

---

## ÉTAPE 13 : Backend - Full Sync (Synchronisation Totale)

### Code Backend
```python
# Ligne 1300-1348
# RÉCONCILIATION (Full Sync)
deactivated_list = []
if full_sync and csv_project_ids:
    from app.models.developer_project import DeveloperProject

    # Devs qui étaient actifs sur ces projets ce mois-ci mais absents du CSV
    active_in_scope = (
        db.query(DeveloperProject.developer_id)
        .filter(
            DeveloperProject.project_id.in_(csv_project_ids),
            DeveloperProject.period_id == period_id,
            DeveloperProject.is_active.is_(True),
        )
        .distinct()
        .all()
    )
    active_ids_in_scope = {row[0] for row in active_in_scope}

    # Identification des devs retirés du périmètre
    removed_from_period = active_ids_in_scope - processed_ids
    for d_id in removed_from_period:
        dev = self.dev_repo.get_by_id(db, d_id)
        if dev:
            if not dry_run:
                # Désactivation réelle (Hard Sync)
                self.dev_proj_repo.deactivate_from_projects(db, d_id, list(csv_project_ids), p_start=p_start)
                
                self.audit_repo.log(
                    db=db, user_id=imported_by, action="DEV_REMOVED_FROM_PERIOD",
                    entity_type="Developer", entity_id=d_id,
                    entity_name=dev.name or dev.gitlab_username or dev.email,
                    old_value={"period_id": period_id, "project_ids": list(csv_project_ids)},
                    new_value={"reason": "Absent du fichier CSV pour cette période — mission CLÔTURÉE"},
                )
            deactivated_list.append({"id": d_id, "name": dev.name, "email": dev.email})
```

### Logique
- **Full Sync** = Synchronisation totale pour une période donnée
- Identifie les développeurs qui étaient actifs sur les projets du CSV mais absents du fichier
- Désactive leurs missions sur ces projets pour la période
- **IMPORTANT** : Ne modifie PAS `Developer.is_active` (seulement les missions temporaires)
- Audit log pour traçabilité

---

## ÉTAPE 14 : Backend - Finalisation

### Code Backend
```python
# Ligne 1350-1367
# Finalisation
self.import_log_repo.complete(
    db, import_log_id,
    total_rows      = len(rows),
    success_count   = len(success_list),
    error_count     = len(error_list),
    duplicate_count = len(duplicate_list),
    report_data     = {
        "success":    success_list,
        "errors":     error_list,
        "duplicates": duplicate_list,
    },
)

if not dry_run:
    db.commit()  # Commit des changements en base
else:
    db.rollback()  # Rollback en dry-run (pas de changements)
```

### Logique
- Met à jour le log d'import avec les statistiques
- Si `dry_run=False` : Commit des changements
- Si `dry_run=True` : Rollback (annulation des changements)

---

## ÉTAPE 15 : Backend - Retour de la Réponse

### Structure de la réponse
```python
{
    "dry_run": true/false,
    "total_rows": 10,
    "success_count": 8,
    "error_count": 1,
    "duplicate_count": 1,
    "unknown_sites": ["Paris"],
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
            "email": "ahmed@corp.tn",
            "warnings": []
        },
        {
            "row": 3,
            "status": "error",
            "name": "Leila Mansour",
            "email": "leila@corp.tn",
            "reason": "Champs obligatoires manquants"
        },
        {
            "row": 4,
            "status": "updated",
            "name": "Mohamed Karray",
            "email": "mohamed@corp.tn",
            "warnings": ["Site 'Paris' introuvable — dev mis à jour sans ce site."]
        }
    ]
}
```

---

## ÉTAPE 16 : Frontend - Affichage des Résultats

### Code Frontend
```javascript
// Ligne 99-216 : ImportResultBanners
function ImportResultBanners({ result }) {
  if (!result) return null;
  const hasCreatedSites    = result.created_sites?.length    > 0;
  const hasCreatedProjects = result.created_projects?.length > 0;
  const hasUnknownSites    = result.unknown_sites?.length    > 0;
  const hasUnknownProjects = result.unknown_projects?.length > 0;
  const hasDeactivations   = result.deactivated_count > 0;

  // Affichage des bandaux selon les résultats
  if (hasCreatedSites || hasCreatedProjects) {
    // Bandeau vert : Entités créées automatiquement
  }
  if (hasDeactivations) {
    // Bandeau rouge : Turnover détecté
  }
  if (hasUnknownSites || hasUnknownProjects) {
    // Bandeau jaune : Entités introuvables
  }
}
```

### Actions du Frontend
1. Affiche les résultats du dry-run
2. Si des entités sont inconnues (`unknown_sites`, `unknown_projects`, `unknown_groups`) :
   - Affiche le composant `ImportResolutionStep`
   - Permet à l'admin de choisir : CRÉER, MAPPER ou IGNORER

---

## ÉTAPE 17 : Frontend - Résolution des Conflits

### Code Frontend
```javascript
// Ligne 467-505 : handleConfirmRealImport
const handleConfirmRealImport = useCallback(async (directResolutions = null) => {
  if (!file) return;
  setLoading(true);
  setError("");

  const effectiveResolutions = directResolutions || resolutions;

  // Détecte si des entités ont été créées côté frontend
  const hadSiteCreations = effectiveResolutions && Object.values(effectiveResolutions.sites || {}).some(r => r.action === "created");
  const hadProjCreations = effectiveResolutions && Object.values(effectiveResolutions.projects || {}).some(r => r.action === "created");
  const hadGroupCreations = effectiveResolutions && Object.values(effectiveResolutions.groups || {}).some(r => r.action === "created");

  try {
    const res = await developerService.importFile(file, {
      defaultSiteId:         siteId  || null,
      defaultGroupId:        groupId || null,
      defaultGitlabConfigId: defaultGitlabConfigId || null,
      dryRun:                false,  // Import réel cette fois
      createMissingSites:    hadSiteCreations || createMissingSites,
      createMissingProjects: hadProjCreations || createMissingProjects,
      createMissingGroups:   hadGroupCreations || createMissingGroups,
      fullSync:               fullSync,
      periodId:               periodId || null,
    });

    setResult(res);
    setShowResolutionStep(false);
    setResolutions(null);
    refreshLogs();
  } catch (err) {
    setError(err.message || "Erreur lors de l'import réel.");
  } finally {
    setLoading(false);
  }
}, [file, siteId, groupId, defaultGitlabConfigId, resolutions, createMissingSites, createMissingProjects, createMissingGroups, fullSync, refreshLogs]);
```

### Actions du Frontend
1. L'admin choisit les actions pour chaque entité inconnue :
   - **CRÉER** : Crée l'entité via l'API (siteService.create, projectService.create)
   - **MAPPER** : Sélectionne une entité existante
   - **IGNORER** : Laisse le développeur sans cette entité
2. Clique sur "Appliquer et confirmer"
3. Relance l'import avec `dry_run=false` et les flags appropriés

---

## ÉTAPE 18 : Backend - Recalcul des KPIs

### Code Backend
```python
# Ligne 731-744 : Recalcul automatique après import
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

### Logique
- Pour chaque développeur importé/mis à jour
- Lance une tâche de fond pour recalculer son historique KPI
- `changed_fields=["import_sync"]` : indique que le changement vient d'un import
- Cela permet de recalculer les KPIs pour toutes les périodes impactées

---

## Résumé Chronologique

| Étape | Couche | Action | Fichier |
|-------|-------|--------|--------|
| 1 | Frontend | Sélection du fichier CSV/Excel | `DevelopersImportPage.jsx` |
| 2 | Frontend | Configuration des options (dry-run, sites, etc.) | `DevelopersImportPage.jsx` |
| 3 | Frontend | Clique "Prévisualiser" → `handleImport(true)` | `DevelopersImportPage.jsx` |
| 4 | Frontend | Appel API via `developerService.importFile()` | `developerService.js` |
| 5 | Frontend | Envoi FormData (multipart/form-data) | `developerService.js` |
| 6 | Backend | Réception POST `/api/v1/developers/import` | `developers.py` |
| 7 | Backend | Validation du format de fichier | `developers.py` |
| 8 | Backend | Lecture du contenu binaire | `developers.py` |
| 9 | Backend | Auto-découverte du domaine GitLab | `developers.py` |
| 10 | Backend | Appel `DeveloperService.import_from_file()` | `developer_service.py` |
| 11 | Backend | Création du log d'import | `developer_service.py` |
| 12 | Backend | Parsing du fichier (CSV/Excel) | `developer_service.py` |
| 13 | Backend | Pré-chargement des référentiels (sites, groupes, projets) | `developer_service.py` |
| 14 | Backend | Boucle sur chaque ligne du CSV | `developer_service.py` |
| 15 | Backend | Extraction des données de la ligne | `developer_service.py` |
| 16 | Backend | Validation des champs obligatoires | `developer_service.py` |
| 17 | Backend | Détection de doublon (par email ou username) | `developer_service.py` |
| 18 | Backend | Si dry-run : analyse sans créer | `developer_service.py` |
| 19 | Backend | Résolution des sites (lookup ou création) | `developer_service.py` |
| 20 | Backend | Résolution des projets (lookup ou création) | `developer_service.py` |
| 21 | Backend | Résolution des groupes (lookup ou création) | `developer_service.py` |
| 22 | Backend | Calcul de la date d'effet | `developer_service.py` |
| 23 | Backend | Si dev existe : UPSERT (mise à jour) | `developer_service.py` |
| 24 | Backend | Si dev n'existe pas : CRÉATION | `developer_service.py` |
| 25 | Backend | Synchronisation intelligente (SCD Type 2) | `developer_service.py` |
| 26 | Backend | Si full_sync : désactivation des absents | `developer_service.py` |
| 27 | Backend | Finalisation du log d'import | `developer_service.py` |
| 28 | Backend | Commit ou Rollback selon dry_run | `developer_service.py` |
| 29 | Backend | Retour de la réponse JSON | `developers.py` |
| 30 | Backend | Si pas dry-run : recalcul KPIs en background | `developers.py` |
| 31 | Frontend | Affichage des résultats | `DevelopersImportPage.jsx` |
| 32 | Frontend | Si entités inconnues : étape de résolution | `ImportResolutionStep.jsx` |
| 33 | Frontend | Admin choisit les actions (CRÉER/MAPPER/IGNORER) | `ImportResolutionStep.jsx` |
| 34 | Frontend | Clique "Appliquer et confirmer" | `ImportResolutionStep.jsx` |
| 35 | Frontend | Relance import avec `dry_run=false` | `DevelopersImportPage.jsx` |
| 36 | Backend | Import réel avec création des entités | `developer_service.py` |
| 37 | Backend | Commit des changements en base | `developer_service.py` |
| 38 | Backend | Recalcul KPIs en background | `developers.py` |
| 39 | Frontend | Affichage final des résultats | `DevelopersImportPage.jsx` |

---

## Points Clés de Votre Architecture

### 1. Séparation des Responsabilités
- **Frontend** : UI, validation utilisateur, affichage
- **Backend API** : Réception HTTP, validation des paramètres
- **Backend Service** : Logique métier complexe (résolution, synchronisation)
- **Backend Repositories** : Accès aux données (CRUD)
- **Backend Models** : Structure de la base de données

### 2. Système de Dry-run
- Permet de prévisualiser les changements sans impact
- Détecte les entités inconnues (sites, projets, groupes)
- Étape de résolution pour corriger avant import réel

### 3. Synchronisation Intelligente (SCD Type 2)
- Gestion automatique des segments temporels
- `sync_smart` pour sites, projets, groupes
- Auto-discovery des associations projet-site

### 4. Politique Enterprise
- Protection contre la réactivation de devs offboardés
- Auto-correction des erreurs système (is_active=False sans offboarding_date)
- Audit log complet pour traçabilité

### 5. Full Sync
- Synchronisation par période et par projet
- Ne modifie PAS `Developer.is_active` (seulement les missions)
- Turnover détecté et rapporté

### 6. Recalcul Automatique
- KPIs recalculés en background après import
- Permet de maintenir les métriques à jour
- Non-bloquant pour l'utilisateur

---

## Conclusion

Ce flux d'import illustre parfaitement votre architecture **Clean Architecture** :

- Chaque couche a une responsabilité claire
- Le flux est prévisible et testable
- La logique métier est isolée dans le service
- Les données sont protégées par le dry-run
- L'audit complet assure la traçabilité
- Le recalcul automatique maintient les KPIs à jour

C'est une implémentation **enterprise-grade** robuste et maintenable.
