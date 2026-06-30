# Documentation des Flux d'Import et de Création - Guide Explicatif pour Réunion

## Table des matières
1. [Flux d'Import des Développeurs](#1-flux-dimport-des-développeurs)
2. [Flux de Création des Sites, Projets et Groupes](#2-flux-de-création-des-sites-projets-et-groupes)
3. [Apparition dans Admin Configuration](#3-apparition-dans-admin-configuration)

---

## 1. Flux d'Import des Développeurs

### Vue d'ensemble du Flux

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

### Étape 1: Sélection du Fichier (Frontend)

**Fichier:** `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

**Lignes:** 397-409

**Objectif de cette étape:**
Permettre à l'administrateur de sélectionner un fichier CSV ou Excel contenant la liste des développeurs à importer.

**Pourquoi c'est important:**
- C'est le point d'entrée du flux d'import
- Valide le format du fichier dès le début pour éviter des erreurs ultérieures
- Stocke le fichier en mémoire pour l'envoyer au backend

**Ce que fait cette étape:**
- Vérifie que le fichier a une extension valide (.csv, .xlsx, .xls)
- Stocke le fichier dans le state React (`setFile(f)`)
- Réinitialise les résultats précédents pour éviter la confusion

**Comment cette étape prépare la suivante:**
Le fichier est maintenant disponible dans le state et peut être envoyé au backend lors de l'étape suivante (prévisualisation ou import réel).

**Code:**
```javascript
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

### Étape 2: Prévisualisation (Dry-run)

**Fichier:** `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

**Lignes:** 414-450

**Objectif de cette étape:**
Analyser le fichier SANS modifier la base de données pour détecter les erreurs et les entités manquantes (sites, projets, groupes).

**Pourquoi c'est important:**
- Évite de corrompre la base de données avec des données invalides
- Permet à l'administrateur de voir les problèmes avant l'import réel
- Détecte les sites/projets/groupes inconnus qui nécessitent une action

**Ce que fait cette étape:**
- Envoie le fichier au backend avec `dry_run=true`
- Le backend analyse chaque ligne du CSV
- Détecte les sites/projets/groupes inconnus
- Retourne un rapport avec les erreurs, warnings et entités manquantes
- Affiche l'étape de résolution si des entités sont inconnues

**Comment cette étape prépare la suivante:**
Le rapport de prévisualisation indique à l'administrateur s'il doit créer des entités manquantes ou corriger des erreurs avant l'import réel.

**Code:**
```javascript
const handleImport = useCallback(async (forceDryRun = dryRun) => {
  if (!file) { setError("Veuillez sélectionner un fichier."); return; }
  setLoading(true);
  setError("");
  setResult(null);

  try {
    const res = await developerService.importFile(file, {
      dryRun: forceDryRun,  // true pour prévisualisation
      createMissingSites: false,  // Jamais créer en dry-run
      createMissingProjects: false,
      createMissingGroups: false,
      // ... autres options
    });

    setResult(res);
    // Afficher l'étape de résolution si entités inconnues
    if (forceDryRun && (res.unknown_sites?.length > 0 || res.unknown_projects?.length > 0)) {
      setShowResolutionStep(true);
    }
  } catch (err) {
    setError(err.message || "Erreur lors de l'import.");
  } finally {
    setLoading(false);
  }
}, [file, dryRun, /* ... */]);
```

---

### Étape 3: Résolution des Entités Manquantes

**Fichier:** `dataCollection/src/frontend/src/pages/admin/DevelopersImportPage.jsx`

**Lignes:** 467-505

**Objectif de cette étape:**
Permettre à l'administrateur de choisir comment traiter les sites/projets/groupes inconnus détectés lors du dry-run.

**Pourquoi c'est important:**
- Donne le contrôle à l'administrateur sur la création automatique
- Évite les créations accidentelles d'entités mal nommées
- Permet de mapper des noms incorrects (ex: "Paris" → "Tunis")

**Ce que fait cette étape:**
- Affiche pour chaque entité inconnue 3 options:
  - **CRÉER**: Crée l'entité automatiquement via l'API
  - **MAPPER**: Associe à une entité existante (si erreur de frappe)
  - **IGNORER**: Importe sans cette entité
- Stocke les résolutions dans le state
- Relance l'import réel avec les résolutions appliquées

**Comment cette étape prépare la suivante:**
Les entités "CRÉER" sont maintenant créées en base de données, donc l'import réel peut les trouver par nom. Les entités "MAPPER" sont associées correctement.

**Code:**
```javascript
const handleConfirmRealImport = useCallback(async (directResolutions = null) => {
  // Détecter si des entités ont été créées côté frontend
  const hadSiteCreations = effectiveResolutions && Object.values(effectiveResolutions.sites || {}).some(r => r.action === "created");
  const hadProjCreations = effectiveResolutions && Object.values(effectiveResolutions.projects || {}).some(r => r.action === "created");

  try {
    const res = await developerService.importFile(file, {
      dryRun: false,  // Import réel cette fois
      createMissingSites: hadSiteCreations || createMissingSites,  // True si créées
      createMissingProjects: hadProjCreations || createMissingProjects,
      // ...
    });

    setResult(res);
    setShowResolutionStep(false);
    refreshLogs();
  } catch (err) {
    setError(err.message || "Erreur lors de l'import réel.");
  } finally {
    setLoading(false);
  }
}, [file, /* ... */]);
```

---

### Étape 4: Envoi au Backend

**Fichier:** `dataCollection/src/frontend/src/services/developerService.js`

**Lignes:** 107-132

**Objectif de cette étape:**
Envoyer le fichier et les options au backend via une requête HTTP multipart/form-data.

**Pourquoi c'est important:**
- Sépare la logique frontend de la logique backend
- Normalise le format des données (FormData)
- Gère la conversion des booléens en strings (FormData ne supporte pas les booléens)

**Ce que fait cette étape:**
- Crée un objet FormData
- Ajoute le fichier
- Ajoute toutes les options (site par défaut, groupe par défaut, dry_run, etc.)
- Convertit les booléens en strings "true"/"false"
- Envoie la requête POST à `/developers/import`

**Comment cette étape prépare la suivante:**
Le backend reçoit les données dans un format standardisé et peut commencer le traitement.

**Code:**
```javascript
importFile: (file, options = {}) => {
  const form = new FormData();
  form.append("file", file);

  if (options.defaultSiteId)
    form.append("default_site_id", String(options.defaultSiteId));
  
  // Booléens → strings "true"/"false"
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

---

### Étape 5: Réception et Validation Backend

**Fichier:** `dataCollection/src/backend/app/api/routers/developers.py`

**Lignes:** 649-746

**Objectif de cette étape:**
Valider la requête, vérifier les permissions, et déléguer le traitement au service.

**Pourquoi c'est important:**
- Sécurise l'endpoint (seul l'admin peut importer)
- Valide le format du fichier
- Délègue la logique métier au service (principe de séparation des responsabilités)

**Ce que fait cette étape:**
- Vérifie que l'utilisateur est un admin (`get_current_admin`)
- Valide que le fichier a une extension valide
- Lit le contenu du fichier
- Délègue au `DeveloperService.import_from_file()`
- Lance le recalcul des KPIs en arrière-plan après import

**Comment cette étape prépare la suivante:**
Le service reçoit toutes les données nécessaires (fichier, options, utilisateur) pour traiter l'import.

**Code:**
```python
@router.post("/import", response_model=DeveloperImportResponse, status_code=201)
async def import_developers(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    dry_run: bool = Form(default=False),
    create_missing_sites: bool = Form(default=False),
    create_missing_projects: bool = Form(default=False),
    create_missing_groups: bool = Form(default=False),
    full_sync: bool = Form(default=False),
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
):
    # Validation du format
    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Format non supporté.")

    content = await file.read()
    service = DeveloperService()

    # Délégation au service
    result = service.import_from_file(
        db=db,
        file_content=content,
        file_name=file.filename,
        imported_by=current_admin.id,
        dry_run=dry_run,
        create_missing_sites=create_missing_sites,
        create_missing_projects=create_missing_projects,
        create_missing_groups=create_missing_groups,
        full_sync=full_sync,
    )

    # Recalcul KPIs en arrière-plan
    if not dry_run and result.get("processed_ids"):
        for d_id in result["processed_ids"]:
            background_tasks.add_task(
                kpi_service.recalculate_developer_history,
                developer_id=d_id,
                changed_fields=["import_sync"]
            )

    return result
```

---

### Étape 6: Traitement du Fichier

**Fichier:** `dataCollection/src/backend/app/services/admin/developer_service.py`

**Lignes:** 828-1024

**Objectif de cette étape:**
Parser le fichier CSV/Excel et traiter chaque ligne pour créer/mettre à jour les développeurs.

**Pourquoi c'est important:**
- C'est le cœur de la logique d'import
- Gère tous les cas particuliers (doublons, entités manquantes, dates)
- Assure l'intégrité des données

**Ce que fait cette étape:**
- Parse le fichier (CSV ou Excel)
- Pour chaque ligne:
  - Extrait les données (nom, email, gitlab_username, sites, projets, groupe, dates)
  - Valide les champs obligatoires
  - Détecte si le développeur existe déjà (par email ou username)
  - Résout les sites (crée si `create_missing_sites=true`, sinon warning)
  - Résout les projets (crée si `create_missing_projects=true`, sinon warning)
  - Résout les groupes (crée si `create_missing_groups=true`, sinon warning)
  - Crée ou met à jour le développeur
  - Associe les sites/projets/groupes
- Retourne un rapport détaillé

**Comment cette étape prépare la suivante:**
Les développeurs sont créés/mis à jour en base de données avec toutes leurs associations.

**Code:**
```python
def import_from_file(self, db, file_content, file_name, dry_run=False, 
                     create_missing_sites=False, create_missing_projects=False, 
                     create_missing_groups=False, full_sync=False):
    # Parser le fichier
    rows = self._parse_file(file_content, file_type)

    # Pré-charger les référentiels (sites, projets, groupes)
    all_sites = {s.name.lower(): s for s in self.site_repo.get_all(db)}
    all_projects_by_name = {p.name.lower(): p for p in self.project_repo.get_all(db)}
    all_groups = {g.name.lower(): g for g in self.group_repo.get_all(db)}

    # Traiter chaque ligne
    for row_num, row in enumerate(rows, start=2):
        # Extraire les données
        name = get_val(["name", "nom"])
        email = get_val(["email"])
        username = get_val(["gitlab_username"])
        site_names = [s.strip() for s in (row.get("sites") or "").split(",")]
        project_names = [p.strip() for p in (row.get("projects") or "").split(",")]
        group_name = get_val(["group", "groupe"])

        # Résoudre les sites
        for sname in site_names:
            site = all_sites.get(sname.lower())
            if site is None:
                if create_missing_sites:
                    site = self.site_repo.create_from_import(db, sname)
                    all_sites[sname.lower()] = site
                    created_sites_names.add(sname)
                else:
                    unknown_sites_names.add(sname)
            resolved_sites.append({"site": site, "is_primary": i == 0})

        # Résoudre les projets (même logique)
        # Résoudre les groupes (même logique)

        # Créer ou mettre à jour le développeur
        if existing_dev:
            # Mettre à jour
        else:
            # Créer

    return {
        "success_count": len(success_list),
        "error_count": len(error_list),
        "duplicate_count": len(duplicate_list),
        "rows": success_list + error_list + duplicate_list,
        "unknown_sites": list(unknown_sites_names),
        "unknown_projects": list(unknown_projects_data.keys()),
        "unknown_groups": list(unknown_groups_names),
        "created_sites": list(created_sites_names),
        "created_projects": list(created_projects_names),
        "created_groups": list(created_groups_names),
    }
```

---

### Étape 7: Création des Entités Manquantes

**Fichier:** `dataCollection/src/backend/app/repositories/site_repository.py`

**Lignes:** 69-87

**Objectif de cette étape:**
Créer automatiquement un site/projet/groupe s'il n'existe pas et si l'option est activée.

**Pourquoi c'est important:**
- Permet l'import sans préparation manuelle
- Réduit le temps d'administration
- Détecte automatiquement le pays et le timezone (pour les sites)

**Ce que fait cette étape:**
- Vérifie si l'entité existe déjà (par nom, case-insensitive)
- Si elle existe: retourne l'existante (évite les doublons)
- Si elle n'existe pas: crée l'entité avec des valeurs par défaut intelligentes
- Pour les sites: détecte le pays et le timezone via `LocationService.guess_metadata()`

**Comment cette étape prépare la suivante:**
L'entité est maintenant disponible en base de données et peut être associée aux développeurs.

**Code (pour les sites):**
```python
def create_from_import(self, db: Session, name: str) -> Site:
    existing = self.get_by_name_ilike(db, name)
    if existing:
        return existing  # Évite les doublons

    metadata = LocationService.guess_metadata(name)

    site = Site(
        name=name.strip(),
        country=metadata["country"],  # Ex: "France" pour "Paris"
        timezone=metadata["timezone"],  # Ex: "Europe/Paris"
        is_active=True,
    )
    db.add(site)
    db.flush()
    return site
```

**Code (pour les projets):**
```python
def create_from_import(self, db: Session, name: str, 
                     gitlab_project_id=None, gitlab_config_id=None) -> Project:
    # Priorité à l'ID GitLab (Source of Truth)
    if gitlab_project_id is not None:
        existing = self.get_by_gitlab_id(db, gitlab_project_id)
        if existing:
            return existing

    # Lookup par nom
    existing = self.get_by_name_ilike(db, name)
    if existing:
        return existing

    project = Project(
        name=name.strip(),
        description="Créé depuis l'import CSV développeurs — à compléter",
        gitlab_project_id=gitlab_project_id,
        gitlab_config_id=gitlab_config_id,
        is_active=True,
        archived=False,
    )
    db.add(project)
    db.flush()
    return project
```

---

### Étape 8: Sauvegarde en Base de Données

**Fichier:** `dataCollection/src/backend/app/services/admin/developer_service.py`

**Lignes:** 1024-1100 (approximatif)

**Objectif de cette étape:**
Sauvegarder tous les changements en base de données de manière atomique.

**Pourquoi c'est important:**
- Assure l'intégrité des données (tout ou rien)
- Permet le rollback en cas d'erreur
- Garantit la cohérence des relations (développeurs ↔ sites/projets/groupes)

**Ce que fait cette étape:**
- Crée les développeurs nouveaux
- Met à jour les développeurs existants
- Crée les associations développeur-site
- Crée les associations développeur-projet
- Crée les associations développeur-groupe
- Commit la transaction
- Enregistre le log d'import

**Comment cette étape prépare la suivante:**
Les données sont maintenant persistantes et peuvent être consultées dans l'interface d'administration.

---

## 2. Flux de Création des Sites, Projets et Groupes

### Vue d'ensemble du Flux

```
Administrateur (Navigateur)
    ↓
Frontend : SitesPage.jsx / AdminProjectsPage.jsx
    ↓
Frontend : siteService.js / projectService.js (create)
    ↓
HTTP POST /api/v1/sites ou /api/v1/projects
    ↓
Backend : api/routers/sites.py ou projects.py (endpoint create)
    ↓
Backend : repositories (site_repository.py / project_repository.py)
    ↓
PostgreSQL (sauvegarde)
    ↓
Apparition dans Admin Configuration
```

---

### Étape 1: Création Manuelle d'un Site

**Fichier:** `dataCollection/src/frontend/src/pages/admin/SitesPage.jsx`

**Lignes:** 27-70 (SiteModal)

**Objectif de cette étape:**
Permettre à l'administrateur de créer un nouveau site géographique manuellement.

**Pourquoi c'est important:**
- Permet de préparer l'infrastructure avant l'import des développeurs
- Donne un contrôle total sur les métadonnées (pays, timezone)
- Évite les créations automatiques avec des valeurs par défaut

**Ce que fait cette étape:**
- Affiche un modal avec un formulaire
- Permet de saisir le nom, le pays, le timezone
- Option de deviner automatiquement le pays/timezone via API
- Envoie les données au backend via `siteService.create()`

**Comment cette étape prépare la suivante:**
Les données sont envoyées au backend pour création en base de données.

**Code:**
```javascript
const submit = async () => {
  setError("");
  if (!form.name.trim()) return setError("Nom requis.");
  setLoading(true);
  try {
    const payload = { 
      name: form.name.trim(), 
      country: form.country.trim() || null, 
      timezone: form.timezone.trim() || null, 
      is_active: form.is_active 
    };
    await siteService.create(payload);  // Envoi au backend
    onSave();
  } catch(err) { 
    setError(err.response?.data?.detail || "Erreur de sauvegarde."); 
  } finally { 
    setLoading(false); 
  }
};
```

---

### Étape 2: Création Manuelle d'un Projet

**Fichier:** `dataCollection/src/frontend/src/pages/admin/AdminProjectsPage.jsx`

**Lignes:** 27-71 (ProjectModal)

**Objectif de cette étape:**
Permettre à l'administrateur de connecter un projet GitLab au système.

**Pourquoi c'est important:**
- Permet d'importer les commits depuis GitLab
- Associe le projet à une instance GitLab spécifique
- Permet d'associer le projet à plusieurs sites

**Ce que fait cette étape:**
- Affiche un modal avec un formulaire
- Permet de saisir le nom, l'ID GitLab, l'instance GitLab
- Permet de sélectionner les sites associés
- Envoie les données au backend via `projectService.create()`

**Comment cette étape prépare la suivante:**
Les données sont envoyées au backend pour création en base de données.

**Code:**
```javascript
const submit = async () => {
  setError("");
  if (!form.name.trim()) return setError("Nom requis.");
  if (!form.gitlab_config_id) return setError("Instance GitLab requise.");
  setLoading(true);
  try {
    const payload = {
      name: form.name.trim(),
      gitlab_config_id: parseInt(form.gitlab_config_id),
      gitlab_project_id: parseInt(form.gitlab_project_id),
      is_active: form.is_active,
      site_ids: selectedSiteIds,  // Sites associés
    };
    await projectService.create(payload);  // Envoi au backend
    onSave();
  } catch (err) {
    setError(err.message || "Erreur de sauvegarde");
  } finally {
    setLoading(false);
  }
};
```

---

### Étape 3: Sauvegarde Backend

**Fichier:** `dataCollection/src/backend/app/repositories/site_repository.py`

**Lignes:** 69-87 (create_from_import)

**Objectif de cette étape:**
Créer l'entité en base de données avec validation.

**Pourquoi c'est important:**
- Assure l'intégrité des données
- Évite les doublons (vérification par nom)
- Applique les valeurs par défaut intelligentes

**Ce que fait cette étape:**
- Vérifie si le site existe déjà
- Si non: crée le site avec les métadonnées
- Sauvegarde en base de données
- Retourne l'objet créé

**Comment cette étape prépare la suivante:**
Le site est maintenant disponible pour:
- L'import des développeurs (association)
- L'affichage dans Admin Configuration
- L'extraction des commits GitLab

---

## 3. Apparition dans Admin Configuration

### Comment les données apparaissent

Les sites, projets et groupes créés (manuellement ou via import) apparaissent dans les pages d'administration:

1. **Sites:** Page `/admin/sites`
   - Liste tous les sites avec leur pays, timezone, statut
   - Permet de modifier, supprimer, activer/désactiver
   - Affiche le nombre de développeurs par site

2. **Projets:** Page `/admin/projects`
   - Liste tous les projets avec leur instance GitLab, sites associés
   - Permet de modifier, supprimer, archiver
   - Affiche le nombre de commits et contributeurs

3. **Groupes:** Page `/admin/developers` (onglet Groupes)
   - Liste tous les groupes d'équipes
   - Permet de modifier, supprimer
   - Affiche le nombre de membres par groupe

### Pourquoi ils apparaissent

Les données apparaissent parce que:
- Les repositories backend (`site_repository`, `project_repository`, `developer_repository`) ont des méthodes `get_all()` qui lisent la base de données
- Les services frontend (`siteService`, `projectService`, `developerService`) appellent ces méthodes
- Les pages React (`SitesPage`, `AdminProjectsPage`, `DevelopersPage`) affichent les données retournées

### Flux de lecture

```
Page React (SitesPage.jsx)
    ↓
useEffect → siteService.getAll()
    ↓
HTTP GET /api/v1/sites
    ↓
Backend : api/routers/sites.py (endpoint get_all)
    ↓
Backend : repositories/site_repository.py (get_all)
    ↓
PostgreSQL (SELECT * FROM sites)
    ↓
Retour au frontend → Affichage dans la page
```

---

## Résumé pour votre responsable

### Flux d'Import des Développeurs

1. **Sélection du fichier:** L'admin choisit un CSV/Excel
2. **Prévisualisation (Dry-run):** Analyse sans modification pour détecter les erreurs et entités manquantes
3. **Résolution:** L'admin choisit de créer/mapper/ignorer les entités manquantes
4. **Envoi au backend:** Le fichier est envoyé avec les options
5. **Traitement:** Le backend parse chaque ligne, résout les entités, crée/met à jour les développeurs
6. **Sauvegarde:** Les données sont persistées en base de données
7. **Recalcul KPIs:** Les KPIs sont recalculés en arrière-plan

### Flux de Création des Sites/Projets/Groupes

1. **Mode création réelle:**
   - **Manuelle:** L'admin utilise les pages d'administration pour créer
   - **Automatique:** L'import avec `create_missing_sites=true` crée automatiquement
2. **Sauvegarde:** Les entités sont créées en base de données avec validation
3. **Apparition:** Les entités apparaissent immédiatement dans les pages d'administration

### Points clés à retenir

- **Dry-run:** Toujours faire une prévisualisation avant l'import réel
- **Résolution:** Permet de contrôler la création automatique d'entités
- **Déduplication:** Le système évite automatiquement les doublons (par email pour les devs, par nom pour les sites/projets)
- **Intégrité:** Les transactions assurent que tout est sauvegardé ou rien
- **Recalcul:** Les KPIs sont recalculés automatiquement après import
