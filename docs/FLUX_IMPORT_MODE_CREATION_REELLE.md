# Flux Technique - Mode Création Réelle (Toutes Options Activées)

## Scénario

Le Super Admin active toutes les options d'auto-création et de synchronisation :
- ✅ **Créer automatiquement les sites manquants**
- ✅ **Créer automatiquement les projets manquants**
- ✅ **Créer automatiquement les groupes manquants**
- ✅ **Mode Synchronisation Totale (Full Sync) — ACTIF**
- ❌ **Dry-run désactivé** (mode création réelle)

---

## ÉTAPE 1 : Frontend - Configuration des Options

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

### Code Frontend
```javascript
// Ligne 300-304 : State des options
const [createMissingSites,    setCreateMissingSites]    = useState(true);   // ✅ Activé
const [createMissingProjects, setCreateMissingProjects] = useState(true);   // ✅ Activé
const [createMissingGroups,  setCreateMissingGroups]   = useState(true);   // ✅ Activé
const [fullSync,              setFullSync]             = useState(true);    // ✅ Activé
const [dryRun,                setDryRun]                = useState(false);  // ❌ Désactivé
```

### Action du Super Admin
1. Coche toutes les cases d'auto-création
2. Coche "Mode Synchronisation Totale"
3. Désactive "Dry-run" (ou laisse décoché)
4. Sélectionne le fichier CSV
5. Clique sur "Importer" (pas "Prévisualiser")

---

## ÉTAPE 2 : Frontend - Appel API avec Options

**Fichier** : `dataCollection/src/frontend/src/services/developerService.js`

### Code Frontend
```javascript
// Ligne 107-132 : importFile
importFile: (file, options = {}) => {
  const form = new FormData();
  form.append("file", file);

  // ... autres paramètres ...

  // ✅ Booléens transmis comme strings "true"/"false"
  form.append("dry_run",                 options.dryRun                ? "true" : "false");  // "false"
  form.append("create_missing_sites",    options.createMissingSites    ? "true" : "false");  // "true"
  form.append("create_missing_projects", options.createMissingProjects ? "true" : "false");  // "true"
  form.append("create_missing_groups",   options.createMissingGroups   ? "true" : "false");  // "true"
  form.append("full_sync",               options.fullSync              ? "true" : "false");  // "true"

  return api.post("/developers/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
}
```

### Requête HTTP envoyée
```
POST /api/v1/developers/import
Content-Type: multipart/form-data

file: [binaire du fichier CSV]
dry_run: "false"                    ← Création réelle
create_missing_sites: "true"       ← Auto-création sites
create_missing_projects: "true"    ← Auto-création projets
create_missing_groups: "true"       ← Auto-création groupes
full_sync: "true"                   ← Synchronisation totale
```

---

## ÉTAPE 3 : Backend - Réception des Paramètres

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

### Code Backend
```python
# Ligne 649-681 : endpoint import_developers
@router.post("/import", response_model=DeveloperImportResponse, status_code=201)
async def import_developers(
    background_tasks:        BackgroundTasks,
    file:                    UploadFile    = File(...),
    period_id:               Optional[int] = Form(default=None),
    default_site_id:         Optional[int] = Form(default=None),
    default_group_id:        Optional[int] = Form(default=None),
    default_gitlab_config_id: Optional[int] = Form(default=None),
    dry_run:                 bool          = Form(default=False),           # ← false
    create_missing_sites:    bool          = Form(default=False),           # ← true
    create_missing_projects: bool          = Form(default=False),           # ← true
    create_missing_groups:   bool          = Form(default=False),           # ← true
    full_sync:               bool            = Form(default=False),           # ← true
    db:                      Session       = Depends(get_db),
    current_admin:           AppUser       = Depends(get_current_admin),
):
```

### Actions du Backend
1. Reçoit les paramètres avec les valeurs activées
2. Passe ces paramètres au service d'import

---

## ÉTAPE 4 : Backend - Service d'Import avec Auto-Création

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
    dry_run:                 bool = False,           # ← false (création réelle)
    create_missing_sites:    bool = False,           # ← true (auto-création sites)
    create_missing_projects: bool = False,           # ← true (auto-création projets)
    create_missing_groups:   bool = False,           # ← true (auto-création groupes)
    full_sync:               bool = False,           # ← true (synchronisation totale)
) -> dict:
```

### Actions du Service
1. Crée le log d'import (traçabilité)
2. Parse le fichier CSV/Excel
3. Pré-charge les référentiels existants (sites, groupes, projets)
4. Pour chaque ligne du CSV :
   - Extrait les données
   - Résout les sites (avec auto-création si manquant)
   - Résout les projets (avec auto-création si manquant)
   - Résout les groupes (avec auto-création si manquant)
   - Crée ou met à jour le développeur
5. Si full_sync : désactive les développeurs absents
6. Commit des changements en base
7. Recalcul des KPIs en background

---

## ÉTAPE 5 : Backend - Résolution des Sites avec Auto-Création

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

### Code Backend
```python
# Ligne 1003-1025 : Résolution des sites
site_names     = [s.strip() for s in (row.get("sites") or "").split(",") if s.strip()]
resolved_sites : List[dict] = []

for i, sname in enumerate(site_names):
    site = all_sites.get(sname.lower())
    if site is None:
        # ✅ AUTO-CRÉATION ACTIVÉE
        if create_missing_sites:  # ← true
            site = self.site_repo.create_from_import(db, sname)
            all_sites[sname.lower()] = site
            created_sites_names.add(sname)
            logger.info("Import: site '%s' créé (ligne %d)", sname, row_num)
        else:
            # ❌ Cas non atteint (create_missing_sites=true)
            unknown_sites_names.add(sname)
            row_warnings.append(
                f"Site '{sname}' introuvable — dev mis à jour sans ce site."
            )
            logger.warning("Import: site '%s' introuvable (ligne %d)", sname, row_num)
            continue
    resolved_sites.append({
        "site": site,
        "is_primary": (i == 0 and not resolved_sites),
    })
```

### Ce qui se passe réellement

**Si le site "Paris" n'existe PAS en base :**

1. Le service cherche "Paris" dans le cache `all_sites`
2. Non trouvé → `site is None`
3. `create_missing_sites` est `true` → **BRANCHE AUTO-CRÉATION**
4. Appel à `self.site_repo.create_from_import(db, "Paris")`

**Repository** : `dataCollection/src/backend/app/repositories/site_repository.py`
```python
def create_from_import(self, db: Session, name: str) -> Site:
    """Crée un site avec des données minimales pour l'import."""
    site = Site(
        name=name,
        country="À définir",  # ← Donnée minimale
        is_active=True,
    )
    db.add(site)
    db.flush()
    return site
```

**Résultat en base PostgreSQL** :
```sql
INSERT INTO site (name, country, is_active, created_at)
VALUES ('Paris', 'À définir', true, NOW());
```

5. Le site créé est ajouté au cache `all_sites` pour les lignes suivantes
6. Le site est ajouté à `created_sites_names` pour le rapport
7. Le développeur est associé à ce site

---

## ÉTAPE 6 : Backend - Résolution des Projets avec Auto-Création

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

### Code Backend
```python
# Ligne 1027-1081 : Résolution des projets
project_items     = [p.strip() for p in (row.get("projects") or "").split(",") if p.strip()]
resolved_projects : List[object] = []

for pitem in project_items:
    # Analyse syntaxe "Nom:ID" (ex: "Frontend:1234")
    parts = pitem.rsplit(":", 1)
    pname = parts[0].strip()
    p_gitlab_id = int(parts[1].strip()) if len(parts) > 1 and parts[1].strip().isdigit() else None

    # 1. Recherche par ID GitLab
    proj = None
    if p_gitlab_id and p_gitlab_id in all_projects_by_id:
        proj = all_projects_by_id[p_gitlab_id]
    
    # 2. Recherche par Nom
    if proj is None:
        proj = all_projects_by_name.get(pname.lower())
    
    if proj is None:
        # ✅ AUTO-CRÉATION ACTIVÉE
        if create_missing_projects:  # ← true
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
            # ❌ Cas non atteint (create_missing_projects=true)
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
    csv_project_ids.add(proj.id)
```

### Ce qui se passe réellement

**Si le projet "backend-api" n'existe PAS en base :**

1. Le service cherche "backend-api" par ID GitLab (si fourni)
2. Puis par nom
3. Non trouvé → `proj is None`
4. `create_missing_projects` est `true` → **BRANCHE AUTO-CRÉATION**
5. Appel à `self.project_repo.create_from_import(db, "backend-api", gitlab_project_id, gitlab_config_id)`

**Repository** : `dataCollection/src/backend/app/repositories/project_repository.py`
```python
def create_from_import(self, db: Session, name: str, gitlab_project_id: Optional[int] = None, gitlab_config_id: Optional[int] = None) -> Project:
    """Crée un projet avec des données minimales pour l'import."""
    project = Project(
        name=name,
        gitlab_project_id=gitlab_project_id,
        gitlab_config_id=gitlab_config_id,
        is_active=True,
    )
    db.add(project)
    db.flush()
    return project
```

**Résultat en base PostgreSQL** :
```sql
INSERT INTO project (name, gitlab_project_id, gitlab_config_id, is_active, created_at)
VALUES ('backend-api', 1234, 1, true, NOW());
```

6. Le projet créé est ajouté au cache pour les lignes suivantes
7. Le projet est ajouté à `created_projects_names` pour le rapport
8. Le développeur est associé à ce projet

---

## ÉTAPE 7 : Backend - Résolution des Groupes avec Auto-Création

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

### Code Backend
```python
# Ligne 1083-1107 : Résolution des groupes
groups_csv = [g.strip() for g in group_csv_raw.split(",") if g.strip()]
resolved_group_ids: List[int] = []

for gname in groups_csv:
    gname_clean = gname.lower().strip()
    group = all_groups.get(gname_clean)
    
    if group is None:
        # ✅ AUTO-CRÉATION ACTIVÉE
        if create_missing_groups:  # ← true
            group = self.group_repo.create_from_import(db, gname)
            db.flush()  # Pour avoir l'ID
            all_groups[gname_clean] = group
            created_groups_names.add(gname)
            logger.info("Import: groupe '%s' CRÉÉ et indexé (ligne %d)", gname, row_num)
        else:
            # ❌ Cas non atteint (create_missing_groups=true)
            unknown_groups_names.add(gname)
            row_warnings.append(f"Groupe '{gname}' introuvable (auto-création OFF).")
            logger.warning("Import: groupe '%s' introuvable et non créé (ligne %d)", gname, row_num)
    if group:
        resolved_group_ids.append(group.id)

# Fallback sur default_group_id si aucun groupe résolu
if not resolved_group_ids and default_group_id:
    resolved_group_ids = [default_group_id]
```

### Ce qui se passe réellement

**Si le groupe "Backend Tunis" n'existe PAS en base :**

1. Le service cherche "backend tunis" (case-insensitive) dans le cache
2. Non trouvé → `group is None`
3. `create_missing_groups` est `true` → **BRANCHE AUTO-CRÉATION**
4. Appel à `self.group_repo.create_from_import(db, "Backend Tunis")`

**Repository** : `dataCollection/src/backend/app/repositories/developer_repository.py`
```python
def create_from_import(self, db: Session, name: str) -> DeveloperGroup:
    """Crée un groupe avec des données minimales pour l'import."""
    group = DeveloperGroup(
        name=name,
        is_active=True,
    )
    db.add(group)
    db.flush()
    return group
```

**Résultat en base PostgreSQL** :
```sql
INSERT INTO developer_group (name, is_active, created_at)
VALUES ('Backend Tunis', true, NOW());
```

5. Le groupe créé est ajouté au cache pour les lignes suivantes
6. Le groupe est ajouté à `created_groups_names` pour le rapport
7. Le développeur est associé à ce groupe

---

## ÉTAPE 8 : Backend - Création du Développeur

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

### Code Backend
```python
# Ligne 1229-1291 : Création d'un nouveau développeur
else:
    # Création standard
    dev_data = {
        "gitlab_username": username,
        "name":            name,
        "email":           email,
        "is_active":       True,
        "is_validated":    True,  # ← Validé automatiquement
        "is_bot":          False,
        "auto_created":    False,
        "source":          "csv_import",  # ← Trace de provenance
        "created_by":      imported_by,  # ← ID du super admin
        "onboarding_date": onboarding_date,
        "offboarding_date": offboarding_date,
    }

    developer = self.dev_repo.create(
        db, dev_data, 
        group_ids=resolved_group_ids,  # ← Groupes résolus (créés ou existants)
        p_start=effective_p_start,
        p_end=p_end
    )
    db.flush()

    # Synchronisation INTELLIGENTE des sites
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

### Ce qui se passe réellement

**Pour chaque développeur du CSV :**

1. **Création du développeur** :
```sql
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
```

2. **Association aux groupes** (via table `developer_group_link`) :
```sql
INSERT INTO developer_group_link (developer_id, group_id, start_date, is_active)
VALUES (123, 456, '2024-01-15', true);
```

3. **Association aux sites** (via table `developer_site`) :
```sql
INSERT INTO developer_site (developer_id, site_id, is_primary, start_date, is_active)
VALUES (123, 5, true, '2024-01-15', true);
```

4. **Association aux projets** (via table `developer_project`) :
```sql
INSERT INTO developer_project (developer_id, project_id, period_id, start_date, is_active)
VALUES (123, 789, 12, '2024-01-15', true);
```

5. **Auto-discovery** : Création automatique des associations projet-site
```sql
INSERT INTO project_site (project_id, site_id)
VALUES (789, 5);
```

---

## ÉTAPE 9 : Backend - Full Sync (Synchronisation Totale)

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

### Code Backend
```python
# Ligne 1300-1348 : Full Sync
deactivated_list = []
if full_sync and csv_project_ids:  # ← true et csv_project_ids non vide
    from app.models.developer_project import DeveloperProject

    # Devs qui étaient actifs sur ces projets ce mois-ci mais absents du CSV
    active_in_scope = (
        db.query(DeveloperProject.developer_id)
        .filter(
            DeveloperProject.project_id.in_(csv_project_ids),  # ← Projets du CSV
            DeveloperProject.period_id == period_id,              # ← Période sélectionnée
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
            if not dry_run:  # ← false (création réelle)
                # ✅ DÉSACTIVATION RÉELLE
                self.dev_proj_repo.deactivate_from_projects(
                    db, d_id, list(csv_project_ids), p_start=p_start
                )
                
                # Audit log pour traçabilité
                self.audit_repo.log(
                    db=db, user_id=imported_by, action="DEV_REMOVED_FROM_PERIOD",
                    entity_type="Developer", entity_id=d_id,
                    entity_name=dev.name or dev.gitlab_username or dev.email,
                    old_value={"period_id": period_id, "project_ids": list(csv_project_ids)},
                    new_value={"reason": "Absent du fichier CSV pour cette période — mission CLÔTURÉE"},
                )
            deactivated_list.append({"id": d_id, "name": dev.name, "email": dev.email})
```

### Ce qui se passe réellement

**Scénario concret :**

**Avant l'import** (période Janvier 2026, projet "backend-api") :
- Ahmed Ben Ali → Actif sur backend-api
- Mohamed Karray → Actif sur backend-api
- Leila Mansour → Actif sur backend-api

**CSV importé** (Janvier 2026) :
- Ahmed Ben Ali → backend-api
- Mohamed Karray → backend-api
- (Leila Mansour ABSENTE du CSV)

**Traitement Full Sync** :

1. **Identification des projets du CSV** :
   - `csv_project_ids = {789}` (ID de backend-api)

2. **Recherche des devs actifs sur ces projets** :
```sql
SELECT DISTINCT developer_id 
FROM developer_project 
WHERE project_id IN (789) 
  AND period_id = 12 
  AND is_active = true;
```
Résultat : `{123, 124, 125}` (Ahmed, Mohamed, Leila)

3. **Identification des devs retirés** :
   - `processed_ids = {123, 124}` (Ahmed, Mohamed)
   - `removed_from_period = {123, 124, 125} - {123, 124} = {125}` (Leila)

4. **Désactivation de Leila** :
```sql
UPDATE developer_project
SET is_active = false, end_date = '2026-01-31'
WHERE developer_id = 125 
  AND project_id IN (789)
  AND period_id = 12;
```

5. **Audit log** :
```sql
INSERT INTO audit_log (
    user_id, action, entity_type, entity_id, 
    entity_name, old_value, new_value, created_at
)
VALUES (
    1, 'DEV_REMOVED_FROM_PERIOD', 'Developer', 125,
    'Leila Mansour', 
    '{"period_id": 12, "project_ids": [789]}',
    '{"reason": "Absent du fichier CSV pour cette période — mission CLÔTURÉE"}',
    NOW()
);
```

**IMPORTANT** : `Developer.is_active` de Leila reste `true` (elle est toujours dans l'entreprise), seule sa mission sur ce projet est clôturée.

---

## ÉTAPE 10 : Backend - Finalisation et Commit

**Fichier** : `dataCollection/src/backend/app/services/admin/developer_service.py`

### Code Backend
```python
# Ligne 1350-1367 : Finalisation
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

if not dry_run:  # ← false (création réelle)
    db.commit()  # ✅ COMMIT DES CHANGEMENTS EN BASE
else:
    db.rollback()
```

### Ce qui se passe réellement

**Commit PostgreSQL** :
```sql
-- Toutes les opérations sont validées en base
COMMIT;
```

**Changements validés** :
1. ✅ Nouveaux développeurs créés
2. ✅ Nouveaux sites créés (country='À définir')
3. ✅ Nouveaux projets créés
4. ✅ Nouveaux groupes créés
5. ✅ Associations développeur-site/projet/groupe créées
6. ✅ Missions des devs absents clôturées (full sync)
7. ✅ Log d'import marqué comme "completed"
8. ✅ Audit logs créés pour traçabilité

---

## ÉTAPE 11 : Backend - Recalcul des KPIs en Background

**Fichier** : `dataCollection/src/backend/app/api/routers/developers.py`

### Code Backend
```python
# Ligne 731-744 : Recalcul automatique
if not dry_run and processed_ids:  # ← false et processed_ids non vide
    from app.services.kpi.kpi_service import KpiService
    kpi_service = KpiService()
    
    for d_id in processed_ids:
        background_tasks.add_task(
            kpi_service.recalculate_developer_history,
            developer_id=d_id,
            changed_fields=["import_sync"]
        )
```

### Ce qui se passe réellement

**Pour chaque développeur importé/mis à jour** :

1. **Tâche de fond ajoutée** (non bloquante) :
```python
background_tasks.add_task(
    kpi_service.recalculate_developer_history,
    developer_id=123,  # Ahmed Ben Ali
    changed_fields=["import_sync"]
)
```

2. **Recalcul des KPIs** :
   - Le service KPI calcule/récalcule tous les KPIs pour Ahmed
   - Pour toutes les périodes impactées
   - MR Rate, Commit Rate, Review Time, etc.
   - Sauvegarde en base

3. **Avantage** : L'utilisateur n'attend pas le recalcul, la réponse est immédiate

---

## ÉTAPE 12 : Frontend - Affichage des Résultats

**Fichier** : `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

### Code Frontend
```javascript
// Ligne 99-216 : ImportResultBanners
function ImportResultBanners({ result }) {
  const hasCreatedSites    = result.created_sites?.length    > 0;
  const hasCreatedProjects = result.created_projects?.length > 0;
  const hasDeactivations   = result.deactivated_count > 0;

  if (hasCreatedSites || hasCreatedProjects) {
    // Bandeau vert : Entités créées automatiquement
  }
  if (hasDeactivations) {
    // Bandeau rouge : Turnover détecté
  }
}
```

### Résultat affiché

```
✅ Entités créées automatiquement
   Sites créés : [Paris] [Tunis]
   Projets créés : [backend-api] [frontend]
   Groupes créés : [Backend Tunis] [Frontend Paris]

⚠️ Synchronisation Totale : Turnover détecté
   1 développeur(s) ont été marqués comme Inactifs sur ces projets
   Leurs données historiques sont conservées mais ils n'apparaissent plus dans les KPIs actifs.
```

---

## Résumé des Opérations en Base de Données

### Tables modifiées

**1. `site`** (Nouveaux sites créés)
```sql
INSERT INTO site (name, country, is_active, created_at)
VALUES 
  ('Paris', 'À définir', true, NOW()),
  ('Tunis', 'À définir', true, NOW());
```

**2. `project`** (Nouveaux projets créés)
```sql
INSERT INTO project (name, gitlab_project_id, gitlab_config_id, is_active, created_at)
VALUES 
  ('backend-api', 1234, 1, true, NOW()),
  ('frontend', 5678, 1, true, NOW());
```

**3. `developer_group`** (Nouveaux groupes créés)
```sql
INSERT INTO developer_group (name, is_active, created_at)
VALUES 
  ('Backend Tunis', true, NOW()),
  ('Frontend Paris', true, NOW());
```

**4. `developer`** (Nouveaux développeurs créés)
```sql
INSERT INTO developer (
    gitlab_username, name, email, is_active, is_validated, 
    source, created_by, onboarding_date, created_at
)
VALUES 
  ('ahmed.benali', 'Ahmed Ben Ali', 'ahmed@corp.tn', true, true, 
   'csv_import', 1, '2024-01-15', NOW()),
  ('mohamed.karray', 'Mohamed Karray', 'mohamed@corp.tn', true, true, 
   'csv_import', 1, '2024-02-01', NOW());
```

**5. `developer_group_link`** (Associations groupe)
```sql
INSERT INTO developer_group_link (developer_id, group_id, start_date, is_active)
VALUES 
  (123, 456, '2024-01-15', true),  -- Ahmed → Backend Tunis
  (124, 457, '2024-02-01', true);  -- Mohamed → Backend Tunis
```

**6. `developer_site`** (Associations site)
```sql
INSERT INTO developer_site (developer_id, site_id, is_primary, start_date, is_active)
VALUES 
  (123, 5, true, '2024-01-15', true),  -- Ahmed → Paris (principal)
  (124, 6, true, '2024-02-01', true);  -- Mohamed → Tunis (principal)
```

**7. `developer_project`** (Associations projet)
```sql
INSERT INTO developer_project (developer_id, project_id, period_id, start_date, is_active)
VALUES 
  (123, 789, 12, '2024-01-15', true),  -- Ahmed → backend-api (période 12)
  (124, 789, 12, '2024-02-01', true);  -- Mohamed → backend-api (période 12)
```

**8. `developer_project`** (Full Sync - désactivation)
```sql
UPDATE developer_project
SET is_active = false, end_date = '2026-01-31'
WHERE developer_id = 125 
  AND project_id IN (789)
  AND period_id = 12;
```

**9. `project_site`** (Auto-discovery)
```sql
INSERT INTO project_site (project_id, site_id)
VALUES 
  (789, 5),  -- backend-api → Paris
  (789, 6);  -- backend-api → Tunis
```

**10. `developer_import_log`** (Log d'import)
```sql
INSERT INTO developer_import_log (
    file_name, imported_by, target_database, file_type,
    status, total_rows, success_count, error_count, 
    report_data, created_at
)
VALUES (
    'developers_jan2026.csv', 1, 'main', 'csv',
    'completed', 10, 8, 1, 
    '{"success": [...], "errors": [...]}', NOW()
);
```

**11. `audit_log`** (Audit trail)
```sql
INSERT INTO audit_log (
    user_id, action, entity_type, entity_id, 
    entity_name, old_value, new_value, created_at
)
VALUES (
    1, 'DEV_REMOVED_FROM_PERIOD', 'Developer', 125,
    'Leila Mansour', 
    '{"period_id": 12, "project_ids": [789]}',
    '{"reason": "Absent du fichier CSV pour cette période — mission CLÔTURÉE"}',
    NOW()
);
```

---

## Points de Vigilance

### 1. Données Minimales pour les Entités Créées

**Sites créés** :
- `country='À définir'` → À compléter manuellement après l'import
- `is_active=true` → Activé par défaut

**Projets créés** :
- `gitlab_config_id` → Utilise le défaut ou celui spécifié
- `is_active=true` → Activé par défaut

**Groupes créés** :
- Pas de description ni autres métadonnées
- `is_active=true` → Activé par défaut

### 2. Full Sync ne modifie PAS `Developer.is_active`

**Règle métier** :
- `Developer.is_active = False` → Départ définitif de l'entreprise (action admin manuelle)
- `DeveloperProject.is_active = False` → Absent de ce projet ce mois-ci (temporel)

**Full Sync** ne fait que clôturer les missions sur les projets du CSV pour la période, pas désactiver le développeur lui-même.

### 3. Recalcul KPIs en Background

- Non bloquant pour l'utilisateur
- Peut prendre du temps si beaucoup de développeurs
- Les KPIs sont mis à jour de manière asynchrone

### 4. Audit Log Complet

- Toutes les actions sont tracées
- Utile pour le debugging et la conformité
- Permet de savoir qui a fait quoi et quand

---

## Conclusion

En mode création réelle avec toutes les options activées :

1. **Auto-création** : Sites, projets et groupes manquants sont créés automatiquement avec des données minimales
2. **Full Sync** : Les développeurs absents du CSV sont désactivés des projets concernés pour la période
3. **Commit réel** : Tous les changements sont validés en base de données
4. **Recalcul KPIs** : Les KPIs sont recalculés en background pour les développeurs impactés
5. **Traçabilité** : Logs d'import et audit logs assurent la traçabilité complète

C'est un mode puissant pour les imports de confiance où vous êtes sûr que les noms correspondent exactement aux entités en base.
