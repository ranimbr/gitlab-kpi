# Architecture d'Import des Développeurs - Soutenance Technique

## 📋 Vue d'Ensemble du Flux

```
Fichier CSV/Excel → API Router → DeveloperService → Repositories → Base de Données
                      ↓              ↓              ↓              ↓
                   Validation   Traitement   Persistance   Audit Log
```

---

## 🎯 Étape 1: Point d'Entrée API

**Fichier**: `app/api/routers/developers.py` (ligne 649)

### Endpoint Principal
```python
@router.post("/import", response_model=DeveloperImportResponse, status_code=201)
async def import_developers(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),           # Fichier CSV ou Excel
    period_id: Optional[int] = Form(None),  # Période cible (optionnel)
    dry_run: bool = Form(False),             # Mode simulation
    create_missing_sites: bool = Form(False),    # Auto-création sites
    create_missing_projects: bool = Form(False), # Auto-création projets
    create_missing_groups: bool = Form(False),   # Auto-création groupes
    full_sync: bool = Form(False),           # Sync complète
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin),
)
```

### Rôle de l'API Router
- **Validation du format**: Accepte uniquement `.csv`, `.xlsx`, `.xls`
- **Extraction du contenu**: Lit le fichier uploadé
- **Résilience GitLab**: Si aucun domaine spécifié, utilise le premier disponible
- **Délégation**: Transmet tout à `DeveloperService.import_from_file()`
- **Post-traitement**: Déclenche le recalcul KPI en background si mode création

---

## 🔧 Étape 2: Service Métier (Cœur du Système)

**Fichier**: `app/services/admin/developer_service.py` (ligne 861)

### Méthode Principale: `import_from_file()`

#### 2.1 Initialisation et Logging
```python
# Création du log d'import dans auth_db
import_log_id = self.import_log_repo.create_log(
    db, file_name=file_name, imported_by=imported_by, 
    target_database=target_db, file_type=file_type
)
```

**Pourquoi?**
- Traçabilité complète de tous les imports
- Stocké dans `auth_db` (séparée de la base de données principale)
- Statuts: `pending` → `completed` / `failed`

#### 2.2 Parsing du Fichier
```python
rows = self._parse_file(file_content, file_type)
```

**Formats supportés**:
- CSV: Séparateur virgule standard
- Excel: `.xlsx` et `.xls` via pandas/openpyxl

#### 2.3 Pré-chargement des Référentiels (Optimisation O(1))
```python
all_sites    = {s.name.lower().strip(): s for s in self.site_repo.get_all(db)}
all_groups   = {g.name.lower().strip(): g for g in self.group_repo.get_all(db)}
all_projects_by_name = {p.name.lower(): p for p in self.project_repo.get_all(db)}
all_projects_by_id   = {p.gitlab_project_id: p for p in _projects_all if p.gitlab_project_id}
```

**Avantages**:
- Un seul appel base de données pour chaque type d'entité
- Recherche instantanée par nom (dictionnaire Python)
- Évite N+1 requêtes dans la boucle de traitement

#### 2.4 Traitement Ligne par Ligne

##### Détection Flexible des Colonnes
```python
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
group    = get_val(["group", "groups", "groupe", "equipe", "team"])
```

**Intelligence**:
- Accepte plusieurs variantes de noms de colonnes
- Case-insensitive et trimming automatique
- Résilient aux erreurs de formatage CSV

##### Parsing des Dates
```python
def parse_csv_date(val):
    if not val: return None
    try:
        if "/" in val:
            return datetime.strptime(val, "%d/%m/%Y").date()  # Format français
        return datetime.fromisoformat(val).date()            # Format ISO
    except: return None
```

##### Détection UPSERT (Création ou Mise à jour)
```python
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

---

## 🔄 Étape 3: Mode Dry Run vs Mode Création Réelle

### Mode Dry Run (`dry_run=True`)

**Objectif**: Simulation sans modification de la base de données

```python
if dry_run:
    # Analyse des entités sans création
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
    continue  # Passe à la ligne suivante SANS commit
```

**Ce que fait le Dry Run**:
- ✅ Parse le fichier complètement
- ✅ Détecte les doublons
- ✅ Identifie les sites/projets/groupes inconnus
- ✅ Valide les formats de données
- ❌ NE crée AUCUN enregistrement en base
- ❌ NE modifie AUCUNE affectation

**Cas d'usage**:
- Validation d'un fichier CSV avant import massif
- Test de nouvelles affectations sans risque
- Audit des données avant synchronisation

### Mode Création Réelle (`dry_run=False`)

**Objectif**: Application effective des changements

```python
# 1. Résolution des sites
for sname in site_names:
    site = all_sites.get(sname.lower())
    if site is None:
        if create_missing_sites:
            site = self.site_repo.create_from_import(db, sname)
            created_sites_names.add(sname)
        else:
            unknown_sites_names.add(sname)

# 2. Création ou mise à jour du développeur
if existing_dev:
    # UPDATE avec sync_smart (SCD Type 2)
    self.dev_site_repo.sync_smart(db, developer_id, payload.sites, ...)
else:
    # CREATE avec affectations initiales
    developer = self.dev_repo.create(db, dev_data, group_ids=payload.group_ids)

# 3. Commit des changements
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

## 🏗️ Étape 4: Gestion des Entités Manquantes (Enterprise)

### Sites Inconnus
```python
if create_missing_sites:
    site = self.site_repo.create_from_import(db, sname)
    created_sites_names.add(sname)
else:
    unknown_sites_names.add(sname)
```

**Comportement**:
- `create_missing_sites=True`: Création automatique avec `country='À définir'`
- `create_missing_sites=False`: Ajouté à `unknown_sites_names` (warning non bloquant)

### Projets Inconnus
```python
if create_missing_projects:
    project = self.project_repo.create_from_import(db, pname, gitlab_project_id)
    created_projects_names.add(pname)
else:
    unknown_projects_data[pname] = gitlab_project_id
```

### Groupes Inconnus
```python
if create_missing_groups:
    group = self.group_repo.create_from_import(db, gname)
    created_groups_names.add(gname)
else:
    unknown_groups_names.add(gname)
```

---

## 📊 Étape 5: Rapport d'Import

### Structure de Réponse
```python
{
    "import_log_id": 123,
    "total_rows": 50,
    "success_count": 45,
    "error_count": 3,
    "duplicate_count": 2,
    "rows": [
        {
            "row": 2,
            "status": "success",
            "name": "Jean Dupont",
            "email": "jean@example.com",
            "reason": "Créé avec succès"
        },
        {
            "row": 5,
            "status": "error",
            "name": "Marie Martin",
            "email": "marie@example.com",
            "reason": "Champs obligatoires manquants",
            "warnings": ["Site 'Lyon' inconnu"]
        }
    ],
    "unknown_sites": ["Lyon", "Marseille"],
    "unknown_projects": ["projet_inconnu"],
    "unknown_groups": ["equipe_alpha"],
    "created_sites": ["Paris", "Toulouse"],
    "created_projects": ["projet_x"],
    "created_groups": ["equipe_beta"],
    "processed_ids": [1, 2, 3, 4, 5]  # IDs des devs traités
}
```

---

## 🔗 Étape 6: Post-Import - Recalcul KPI

**Fichier**: `app/api/routers/developers.py` (ligne 731)

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

**Pourquoi en Background?**
- Le recalcul KPI peut être long (beaucoup de périodes)
- Ne bloque pas la réponse API
- Traitement asynchrone via FastAPI BackgroundTasks

---

## 🗄️ Étape 7: Persistance et Audit

### Tables Impliquées

1. **developer** (Table principale)
   - Informations personnelles (nom, email, gitlab_username)
   - Statuts (is_active, is_validated, is_bot)
   - Dates RH (onboarding_date, offboarding_date)

2. **developer_site** (SCD Type 2)
   - Affectations sites avec dates
   - Segments: `start_date` / `end_date`
   - `is_primary` pour site principal

3. **developer_project** (SCD Type 2)
   - Affectations projets avec dates
   - Certifications de mission

4. **developer_group_link** (SCD Type 2)
   - Appartenance aux équipes

5. **developer_import_log** (auth_db)
   - Historique des imports
   - Statuts et rapports

### Audit Trail
```python
self.audit_repo.log(
    db=db, user_id=imported_by, action="IMPORT_DEVELOPERS",
    entity_type="DeveloperImportLog", entity_id=import_log_id,
    new_value={
        "file_name": file_name,
        "total_rows": len(rows),
        "dry_run": dry_run,
        "create_missing_sites": create_missing_sites,
    }
)
```

---

## 🎓 Points Clés pour la Soutenance

### 1. Architecture en Couches
- **API Router**: Validation et délégation
- **Service**: Logique métier complexe
- **Repository**: Accès données optimisé
- **Models**: Définition schéma base de données

### 2. SCD Type 2 (Slowly Changing Dimension)
- Historisation complète des affectations
- Segments datés pour tracking temporel
- Support mutations/corrections rétroactives

### 3. Mode Dry Run
- **Sécurité**: Test sans risque
- **Validation**: Détection erreurs avant commit
- **Transparence**: Rapport prédictif complet

### 4. Enterprise Features
- Auto-création d'entités manquantes
- Full Sync pour synchronisation complète
- Résilience aux erreurs de formatage

### 5. Performance
- Pré-chargement O(1) des référentiels
- Recherche par dictionnaire (instantanée)
- Background tasks pour recalcul KPI

### 6. Traçabilité
- Logs d'import dans auth_db
- Audit trail pour chaque action
- Rapports détaillés par ligne

---

## 🚀 Workflow Complet

```
1. Admin upload CSV
   ↓
2. API Router valide format
   ↓
3. DeveloperService parse fichier
   ↓
4. Pré-chargement référentiels (sites, groupes, projets)
   ↓
5. Pour chaque ligne:
   - Extraction flexible des champs
   - Parsing des dates
   - Détection UPSERT (email/username)
   - Résolution entités (sites/groupes/projets)
   - Mode Dry Run: Simulation seulement
   - Mode Création: Application effective
   ↓
6. Commit base de données
   ↓
7. Mise à jour import_log (completed)
   ↓
8. Rapport détaillé retourné
   ↓
9. Background: Recalcul KPI pour devs impactés
```

---

## 💡 Avantages de cette Architecture

1. **Maintenabilité**: Séparation claire des responsabilités
2. **Testabilité**: Dry run permet validation sans risque
3. **Performance**: Optimisations O(1) et background tasks
4. **Flexibilité**: Support CSV/Excel, colonnes flexibles
5. **Enterprise**: Auto-création, full sync, traçabilité
6. **Robustesse**: Gestion erreurs, validation, rollback

---

## 📝 Exemple Concret

### CSV Input
```csv
name,email,gitlab_username,sites,group,onboarding_date
Jean Dupont,jean@example.com,jean_dup,Paris,OPE,2026-01-15
Marie Martin,marie@example.com,marie_mart,Lyon,INTEG,2026-02-01
```

### Traitement (Mode Création)
1. **Ligne 1 (Jean)**:
   - Email non trouvé → CREATE
   - Site "Paris" existe → Affectation
   - Groupe "OPE" existe → Affectation
   - onboarding_date: 2026-01-15

2. **Ligne 2 (Marie)**:
   - Email non trouvé → CREATE
   - Site "Lyon" inconnu → Warning ou création (selon flag)
   - Groupe "INTEG" existe → Affectation
   - onboarding_date: 2026-02-01

### Résultat
```json
{
    "success_count": 2,
    "unknown_sites": ["Lyon"],
    "rows": [
        {"row": 2, "status": "success", "name": "Jean Dupont"},
        {"row": 3, "status": "success", "name": "Marie Martin", "warnings": ["Site 'Lyon' inconnu"]}
    ]
}
```

---

## 🔍 Points Techniques Avancés

### SCD Type 2 Implementation
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

---

## 🎯 Conclusion

Cette architecture d'import offre:
- **Sécurité**: Dry run pour validation
- **Performance**: Optimisations O(1)
- **Flexibilité**: Support multi-format, colonnes variables
- **Enterprise**: Auto-création, traçabilité complète
- **Robustesse**: Gestion erreurs, rollback, audit

Le système est prêt pour la production avec des garanties de qualité et de traçabilité.
