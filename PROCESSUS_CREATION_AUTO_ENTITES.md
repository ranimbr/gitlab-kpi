# Processus de Création Automatique des Entités (Sites, Projets, Groupes)

## 🎯 Contexte

Lors de l'import de développeurs en **Mode Création Réelle**, si les flags `create_missing_sites`, `create_missing_projects` ou `create_missing_groups` sont activés, le système crée automatiquement les entités manquantes dans la base de données.

---

## 📊 Flux de Création Automatique

```
┌─────────────────────────────────────────────────────────────────┐
│          FRONTEND: Sélection des Options d'Auto-Création           │
│  - createMissingSites: true/false                                 │
│  - createMissingProjects: true/false                               │
│  - createMissingGroups: true/false                                 │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ FormData transmis
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND API: Réception des Flags                     │
│  - developers.py: Extraction des paramètres Form                   │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Transmission au service
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│         BACKEND SERVICE: Traitement Ligne par Ligne                  │
│  - developer_service.py: Résolution des entités manquantes           │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Appel repositories
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│          REPOSITORIES: Création des Entités en Base                 │
│  - site_repo.create_from_import()                                   │
│  - project_repo.create_from_import()                               │
│  - group_repo.create_from_import()                                  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ SQL INSERT
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              BASE DE DONNÉES: Persistance                           │
│  - Tables: site, project, group                                    │
│  - Tables de liaison: developer_site, developer_project, etc.      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 ÉTAPE 1: Frontend - Configuration des Options

### Fichier: `src/frontend/src/components/admin/DeveloperImportModal.jsx`

**Objectif**: Permettre à l'utilisateur d'activer l'auto-création

#### 1.1 Définition des Options (lignes 11-16)
```javascript
const [options, setOptions] = useState({
  createMissingSites: false,    // Auto-créer les sites inconnus
  createMissingProjects: false, // Auto-créer les projets inconnus
  createMissingGroups: true,     // Auto-créer les groupes inconnus
  fullSync: true,                // Sync complète (désactive absents)
});
```

**Ce que cela signifie**:
- `createMissingSites: true` → Si un site du CSV n'existe pas en base, il sera créé automatiquement
- `createMissingProjects: true` → Si un projet du CSV n'existe pas en base, il sera créé automatiquement
- `createMissingGroups: true` → Si un groupe du CSV n'existe pas en base, il sera créé automatiquement

#### 1.2 Transmission au Service (lignes 56-59)
```javascript
const response = await developerService.importFile(file, {
  dryRun: false,
  period_id: selectedPeriodId || null,
  ...options  // Inclut createMissingSites, createMissingProjects, createMissingGroups
});
```

---

## 🔄 ÉTAPE 2: Frontend Service - Transmission des Flags

### Fichier: `src/frontend/src/services/developerService.js`

**Objectif**: Sérialiser les flags dans FormData

#### 2.1 Construction FormData (lignes 123-127)
```javascript
// Conversion booléens → strings (FormData limitation)
form.append("dry_run", options.dryRun ? "true" : "false");
form.append("create_missing_sites", options.createMissingSites ? "true" : "false");
form.append("create_missing_projects", options.createMissingProjects ? "true" : "false");
form.append("create_missing_groups", options.createMissingGroups ? "true" : "false");
form.append("full_sync", options.fullSync ? "true" : "false");
```

**Pourquoi strings?**
- FormData ne sérialise pas nativement les booléens
- Conversion en "true"/"false" pour compatibilité HTTP

---

## 🔄 ÉTAPE 3: Backend API - Réception des Flags

### Fichier: `src/backend/app/api/routers/developers.py`

**Objectif**: Extraire et valider les flags

#### 3.1 Définition des Paramètres (lignes 189-208)
```python
create_missing_sites: bool = Form(
    default=False,
    description=(
        "Si True : les sites du CSV absents en base sont créés automatiquement "
        "(name=<nom>, country='À définir', is_active=True). "
        "Désactivé par défaut — activer seulement si vous faites confiance au fichier source."
    ),
),
create_missing_projects: bool = Form(
    default=False,
    description=(
        "Si True : les projets du CSV absents en base sont créés automatiquement. "
        "Même comportement que create_missing_sites."
    ),
),
create_missing_groups: bool = Form(default=False),
```

**Sécurité**:
- Par défaut `False` pour éviter les créations accidentelles
- Description explicite dans la docstring API

#### 3.2 Transmission au Service (lignes 258-261)
```python
result = service.import_from_file(
    db                      = db,
    file_content            = content,
    file_name               = file.filename,
    period_id               = period_id,
    imported_by             = current_admin.id,
    dry_run                 = dry_run,
    create_missing_sites    = create_missing_sites,      # ← Flag transmis
    create_missing_projects = create_missing_projects,    # ← Flag transmis
    create_missing_groups   = create_missing_groups,     # ← Flag transmis
    full_sync               = full_sync,
)
```

---

## 🔄 ÉTAPE 4: Backend Service - Résolution des Sites

### Fichier: `src/backend/app/services/admin/developer_service.py`

**Objectif**: Créer automatiquement les sites manquants

#### 4.1 Extraction des Sites du CSV (lignes 1037-1038)
```python
# ── Résolution des sites ──────────────────────────────────────────
site_names     = [s.strip() for s in (row.get("sites") or "").split(",") if s.strip()]
resolved_sites : List[dict] = []
```

**Format CSV attendu**: `sites: "Paris,Tunis,Lyon"`

#### 4.2 Recherche et Création Automatique (lignes 1040-1058)
```python
for i, sname in enumerate(site_names):
    site = all_sites.get(sname.lower())
    if site is None:
        if create_missing_sites:
            # ✅ CRÉATION AUTOMATIQUE DU SITE
            site = self.site_repo.create_from_import(db, sname)
            all_sites[sname.lower()] = site  # Mise à jour du cache
            created_sites_names.add(sname)
            logger.info("Import: site '%s' créé (ligne %d)", sname, row_num)
        else:
            # ⚠️ Site non trouvé et auto-création désactivée
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

**Logique détaillée**:
1. **Recherche**: `site = all_sites.get(sname.lower())` - Recherche dans le cache O(1)
2. **Si trouvé**: Ajout à `resolved_sites`
3. **Si non trouvé**:
   - **Si `create_missing_sites=True`**: Appel à `site_repo.create_from_import()`
   - **Si `create_missing_sites=False`**: Ajout à `unknown_sites_names` + warning

---

## 🔄 ÉTAPE 5: Backend Service - Résolution des Projets

### Fichier: `src/backend/app/services/admin/developer_service.py`

**Objectif**: Créer automatiquement les projets manquants

#### 5.1 Extraction des Projets du CSV (lignes 1061-1068)
```python
# ── Résolution des projets ────────────────────────────────────────
project_items     = [p.strip() for p in (row.get("projects") or "").split(",") if p.strip()]
resolved_projects : List[object] = []

for pitem in project_items:
    # Analyse syntaxe "Nom:ID" (ex: "Frontend:1234")
    parts = pitem.rsplit(":", 1)
    pname = parts[0].strip()
    p_gitlab_id = int(parts[1].strip()) if len(parts) > 1 and parts[1].strip().isdigit() else None
```

**Format CSV attendu**: `projects: "Frontend:1234,Backend:5678"`

#### 5.2 Recherche par ID GitLab puis par Nom (lignes 1070-1077)
```python
# 1. Tentative par ID GitLab (Le plus fiable)
proj = None
if p_gitlab_id and p_gitlab_id in all_projects_by_id:
    proj = all_projects_by_id[p_gitlab_id]
    
# 2. Tentative par Nom si non trouvé par ID
if proj is None:
    proj = all_projects_by_name.get(pname.lower())
```

**Priorité de recherche**:
1. ID GitLab (plus fiable)
2. Nom du projet

#### 5.3 Création Automatique (lignes 1079-1098)
```python
if proj is None:
    if create_missing_projects:
        # ✅ CRÉATION AUTOMATIQUE DU PROJET
        proj = self.project_repo.create_from_import(
            db, 
            pname, 
            gitlab_project_id=p_gitlab_id, 
            gitlab_config_id=default_gitlab_config_id
        )
        all_projects_by_name[pname.lower()] = proj  # Mise à jour du cache
        created_projects_names.add(pname)
        logger.info("Import: projet '%s' créé avec ID%s (ligne %d)", pname, p_gitlab_id, row_num)
    else:
        # ⚠️ Projet non trouvé et auto-création désactivée
        if pname not in unknown_projects_data or (unknown_projects_data[pname] is None and p_gitlab_id):
            unknown_projects_data[pname] = p_gitlab_id
            
        row_warnings.append(
            f"Projet '{pname}' introuvable — dev mis à jour sans ce projet."
        )
        logger.warning("Import: projet '%s' introuvable (ligne %d)", pname, row_num)
        continue
```

**Données utilisées pour la création**:
- `pname`: Nom du projet
- `gitlab_project_id`: ID GitLab (si fourni)
- `gitlab_config_id`: Configuration GitLab (par défaut ou spécifiée)

#### 5.4 Réparation des Projets Orphelins (lignes 1100-1113)
```python
else:
    #  LOGIQUE AMÉLIORÉE : Réparation des projets orphelins (sans config)
    updates = {}
    
    # 1. Update ID GitLab si fourni dans CSV et manquant en base
    if p_gitlab_id is not None and getattr(proj, "gitlab_project_id", None) is None:
        updates["gitlab_project_id"] = p_gitlab_id
    
    # 2. Update Config GitLab si fournie via l'UI et manquante en base
    if default_gitlab_config_id and getattr(proj, "gitlab_config_id", None) is None:
        updates["gitlab_config_id"] = default_gitlab_config_id
    
    if updates:
        self.project_repo.update(db, proj.id, updates)
```

**Intelligence**:
- Si le projet existe mais manque l'ID GitLab ou la config → Mise à jour automatique
- Évite les projets orphelins (sans lien GitLab)

---

## 🔄 ÉTAPE 6: Backend Service - Résolution des Groupes

### Fichier: `src/backend/app/services/admin/developer_service.py`

**Objectif**: Créer automatiquement les groupes manquants

#### 6.1 Extraction des Groupes du CSV (lignes 1117-1118)
```python
# ── Résolution des groupes ────────────────────────────────────────
groups_csv = [g.strip() for g in group_csv_raw.split(",") if g.strip()]
resolved_group_ids: List[int] = []
```

**Format CSV attendu**: `group: "Backend,Frontend,DevOps"`

#### 6.2 Recherche et Création Automatique (lignes 1120-1134)
```python
for gname in groups_csv:
    gname_clean = gname.lower().strip()
    group = all_groups.get(gname_clean)
    
    if group is None:
        if create_missing_groups:
            # ✅ CRÉATION AUTOMATIQUE DU GROUPE
            group = self.group_repo.create_from_import(db, gname)
            db.flush() # Pour avoir l'ID
            all_groups[gname_clean] = group  # Mise à jour du cache
            created_groups_names.add(gname)
            logger.info("Import: groupe '%s' CRÉÉ et indexé (ligne %d)", gname, row_num)
        else:
            # ⚠️ Groupe non trouvé et auto-création désactivée
            unknown_groups_names.add(gname)
            row_warnings.append(f"Groupe '{gname}' introuvable (auto-création OFF).")
            logger.warning("Import: groupe '%s' introuvable et non créé (ligne %d)", gname, row_num)
```

**Logique**:
- Recherche dans le cache par nom
- Si non trouvé et flag activé → Création
- Si non trouvé et flag désactivé → Warning

---

## 🔄 ÉTAPE 7: Repository Site - Création en Base

### Fichier: `src/backend/app/repositories/site_repository.py`

**Objectif**: Persister le site en base de données

#### 7.1 Méthode create_from_import
```python
def create_from_import(self, db: Session, name: str) -> Site:
    """Crée un site depuis l'import avec des valeurs par défaut."""
    site = Site(
        name=name,
        country="À définir",  # Valeur par défaut
        is_active=True,      # Site actif par défaut
    )
    db.add(site)
    db.flush()
    return site
```

**Valeurs par défaut**:
- `country="À définir"`: À compléter manuellement après import
- `is_active=True`: Site actif immédiatement

**Table SQL**:
```sql
INSERT INTO site (name, country, is_active, created_at)
VALUES ('Paris', 'À définir', true, NOW());
```

---

## 🔄 ÉTAPE 8: Repository Project - Création en Base

### Fichier: `src/backend/app/repositories/project_repository.py`

**Objectif**: Persister le projet en base de données

#### 8.1 Méthode create_from_import
```python
def create_from_import(
    self, 
    db: Session, 
    name: str, 
    gitlab_project_id: Optional[int] = None,
    gitlab_config_id: Optional[int] = None
) -> Project:
    """Crée un projet depuis l'import avec configuration GitLab."""
    project = Project(
        name=name,
        gitlab_project_id=gitlab_project_id,
        gitlab_config_id=gitlab_config_id,
        is_active=True,  # Projet actif par défaut
    )
    db.add(project)
    db.flush()
    return project
```

**Données stockées**:
- `name`: Nom du projet
- `gitlab_project_id`: Lien avec GitLab (si fourni)
- `gitlab_config_id`: Configuration GitLab (domaine)
- `is_active=True`: Projet actif immédiatement

**Table SQL**:
```sql
INSERT INTO project (name, gitlab_project_id, gitlab_config_id, is_active, created_at)
VALUES ('Frontend', 1234, 1, true, NOW());
```

---

## 🔄 ÉTAPE 9: Repository Group - Création en Base

### Fichier: `src/backend/app/repositories/group_repository.py`

**Objectif**: Persister le groupe en base de données

#### 9.1 Méthode create_from_import
```python
def create_from_import(self, db: Session, name: str) -> Group:
    """Crée un groupe depuis l'import."""
    group = Group(
        name=name,
        is_active=True,  # Groupe actif par défaut
    )
    db.add(group)
    db.flush()
    return group
```

**Table SQL**:
```sql
INSERT INTO group (name, is_active, created_at)
VALUES ('Backend', true, NOW());
```

---

## 🔄 ÉTAPE 10: Base de Données - Persistance Finale

### Tables Affectées

#### 10.1 Table `site`
```sql
CREATE TABLE site (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    country VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Exemple après import**:
| id | name | country | is_active | created_at |
|----|------|---------|-----------|------------|
| 5 | Paris | À définir | true | 2026-01-15 10:30:00 |
| 6 | Lyon | À définir | true | 2026-01-15 10:30:01 |

#### 10.2 Table `project`
```sql
CREATE TABLE project (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    gitlab_project_id INTEGER,
    gitlab_config_id INTEGER REFERENCES gitlab_config(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Exemple après import**:
| id | name | gitlab_project_id | gitlab_config_id | is_active | created_at |
|----|------|-------------------|------------------|-----------|------------|
| 12 | Frontend | 1234 | 1 | true | 2026-01-15 10:30:02 |
| 13 | Backend | 5678 | 1 | true | 2026-01-15 10:30:03 |

#### 10.3 Table `group`
```sql
CREATE TABLE group (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Exemple après import**:
| id | name | is_active | created_at |
|----|------|-----------|------------|
| 3 | Backend | true | 2026-01-15 10:30:04 |
| 4 | Frontend | true | 2026-01-15 10:30:05 |

#### 10.4 Tables de Liaison (SCD Type 2)
```sql
-- Affectation développeur → site
INSERT INTO developer_site (developer_id, site_id, is_primary, is_active, start_date, end_date)
VALUES (1, 5, true, true, '2026-01-15', NULL);

-- Affectation développeur → projet
INSERT INTO developer_project (developer_id, project_id, is_active, start_date, end_date)
VALUES (1, 12, true, '2026-01-15', NULL);

-- Affectation développeur → groupe
INSERT INTO developer_group_link (developer_id, group_id, start_date, end_date)
VALUES (1, 3, '2026-01-15', NULL);
```

---

## 🔍 Exemple Concret Complet

### Scénario: Import avec Auto-Création Activée

#### CSV d'Import
```csv
name,email,gitlab_username,sites,projects,group,onboarding_date
Jean Dupont,jean@example.com,jeandupont,Paris,Lyon,Frontend:1234,Backend,2026-01-15
Marie Martin,marie@example.com,mariemartin,Marseille,Backend:5678,DevOps,2026-02-01
```

#### Options Frontend
```javascript
{
  createMissingSites: true,
  createMissingProjects: true,
  createMissingGroups: true,
  dryRun: false
}
```

#### Traitement Backend

**Ligne 1: Jean Dupont**
```
1. Extraction sites: ["Paris", "Lyon"]
2. Recherche Paris: Non trouvé
3. create_missing_sites=true → Création Site(id=5, name="Paris", country="À définir")
4. Recherche Lyon: Non trouvé
5. create_missing_sites=true → Création Site(id=6, name="Lyon", country="À définir")
6. Extraction projets: ["Frontend:1234"]
7. Recherche Frontend: Non trouvé
8. create_missing_projects=true → Création Project(id=12, name="Frontend", gitlab_project_id=1234)
9. Extraction groupes: ["Backend"]
10. Recherche Backend: Non trouvé
11. create_missing_groups=true → Création Group(id=3, name="Backend")
12. Création Développeur Jean Dupont (id=1)
13. Affectations SCD Type 2
```

**Ligne 2: Marie Martin**
```
1. Extraction sites: ["Marseille"]
2. Recherche Marseille: Non trouvé
3. create_missing_sites=true → Création Site(id=7, name="Marseille", country="À définir")
4. Extraction projets: ["Backend:5678"]
5. Recherche Backend: Non trouvé
6. create_missing_projects=true → Création Project(id=13, name="Backend", gitlab_project_id=5678)
7. Extraction groupes: ["DevOps"]
8. Recherche DevOps: Non trouvé
9. create_missing_groups=true → Création Group(id=4, name="DevOps")
10. Création Développeur Marie Martin (id=2)
11. Affectations SCD Type 2
```

#### Résultat Base de Données

**Table site**:
| id | name | country | is_active |
|----|------|---------|-----------|
| 5 | Paris | À définir | true |
| 6 | Lyon | À définir | true |
| 7 | Marseille | À définir | true |

**Table project**:
| id | name | gitlab_project_id | gitlab_config_id | is_active |
|----|------|-------------------|------------------|-----------|
| 12 | Frontend | 1234 | 1 | true |
| 13 | Backend | 5678 | 1 | true |

**Table group**:
| id | name | is_active |
|----|------|-----------|
| 3 | Backend | true |
| 4 | DevOps | true |

**Table developer_site**:
| developer_id | site_id | is_primary | is_active | start_date | end_date |
|--------------|---------|------------|-----------|------------|----------|
| 1 | 5 | true | true | 2026-01-15 | NULL |
| 1 | 6 | false | true | 2026-01-15 | NULL |
| 2 | 7 | true | true | 2026-02-01 | NULL |

---

## 🎓 Points Clés pour la Soutenance

### 1. Sécurité par Défaut
- **Flags désactivés par défaut**: Évite les créations accidentelles
- **Validation explicite**: L'utilisateur doit activer consciemment l'auto-création

### 2. Valeurs par Défaut Intelligentes
- **Sites**: `country="À définir"` → À compléter manuellement
- **Projets**: `gitlab_config_id` → Premier domaine disponible
- **Groupes**: Création simple avec nom

### 3. Cache O(1) pour Performance
- **Pré-chargement**: Un appel DB par type d'entité
- **Mise à jour du cache**: Après création, ajout au cache pour éviter les doublons

### 4. Réparation Automatique
- **Projets orphelins**: Mise à jour automatique de l'ID GitLab manquant
- **Config manquante**: Attribution automatique de la config par défaut

### 5. Traçabilité
- **Logs**: Chaque création est loggée avec le numéro de ligne
- **Warnings**: Entités non créées sont listées dans le rapport

### 6. Commit Atomique
- **db.flush()**: Obtention de l'ID sans commit immédiat
- **db.commit()**: Commit final après traitement complet
- **Rollback**: En cas d'erreur, tout est annulé

---

## 🚀 Conclusion

Le processus de création automatique des entités suit ce flux:

1. **Frontend**: Activation des flags via UI
2. **Service HTTP**: Sérialisation en FormData
3. **API**: Extraction et validation des flags
4. **Service**: Résolution ligne par ligne avec création conditionnelle
5. **Repositories**: Création avec valeurs par défaut intelligentes
6. **Base de données**: Persistance atomique avec commit final

Chaque étape est sécurisée, traçable et optimisée pour la performance, garantissant que les entités sont créées uniquement lorsque l'utilisateur l'a explicitement demandé.
