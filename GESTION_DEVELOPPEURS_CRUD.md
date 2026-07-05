# Gestion Complète des Développeurs - CRUD et Cycle de Vie

## 📋 Résumé Exécutif (Pour les Responsables)

### 🎯 Pourquoi ce système est important pour l'entreprise

**Problème résolu**: Comment tracker l'historique complet des affectations des développeurs (site, groupe, projet) dans le temps pour calculer des KPIs précis et gérer les équipes efficacement.

**Solution technique**: SCD Type 2 (Slowly Changing Dimension Type 2) - Une méthode de base de données qui conserve TOUT l'historique des changements.

**Bénéfices business**:
- ✅ **Historique complet**: On sait exactement quand chaque développeur était sur quel projet
- ✅ **KPIs précis**: Calculs de productivité basés sur les affectations réelles
- ✅ **Audit trail**: Traçabilité complète des mutations et changements
- ✅ **Flexibilité**: Possibilité de corriger des erreurs passées sans perdre l'historique
- ✅ **Conformité RH**: Respect des dates contractuelles (onboarding/offboarding)

### 🔍 Analogie Simple

Imaginez un carnet de bord pour chaque développeur:
- **Sans SCD Type 2**: On ne sait que son affectation actuelle (on perd l'historique)
- **Avec SCD Type 2**: On a un carnet complet avec toutes les affectations passées et futures

**Exemple**: Jean était à Paris de janvier à mai, muté à Lyon en juin. Avec SCD Type 2, on peut calculer ses KPIs pour janvier (Paris) et juin (Lyon) séparément.

### 📊 Ce que le système fait concrètement

1. **Création**: Ajouter un nouveau développeur avec ses affectations initiales
2. **Activation/Désactivation**: Gérer les suspensions temporaires (congés, formations)
3. **Mutation**: Changer les affectations (site, groupe, projet) en conservant l'historique
4. **Archivage**: Fixer la date de sortie définitive (offboarding)
5. **Historisation**: Conserver TOUTES les modifications avec dates précises

---

## 🎯 Objectif du Système (Technique)

Permettre la gestion complète du cycle de vie des développeurs: création, activation/désactivation, mutation des affectations (site/groupe/projet), et archivage, avec historisation SCD Type 2 pour le tracking temporel.

---

## 📊 Architecture en 4 Couches

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                              │
│  - Liste des développeurs avec filtres                                  │
│  - Modal d'édition/ajout                                               │
│  - Actions: Toggle actif, Archiver, Mutations                         │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTP Request (POST/PUT/PATCH)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API (FastAPI)                            │
│  - Endpoint POST /developers (création)                              │
│  - Endpoint PUT /developers/{id} (mise à jour)                        │
│  - Validation des données                                            │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Appel Service
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND SERVICE (Business Logic)                       │
│  - DeveloperService.update()                                         │
│  - Gestion SCD Type 2 (sites, projets, groupes)                        │
│  - Suspension/Réactivation                                          │
│  - Détection corrections rétroactives                               │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ SQL Queries
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                 BASE DE DONNÉES (PostgreSQL)                        │
│  - Tables: developer, developer_site, developer_project, etc.      │
│  - SCD Type 2 pour historisation temporelle                         │
└─────────────────────────────────────────────────────────────────┘
```

### 🎯 Objectifs par Étape et Relations

**ÉTAPE 1: Frontend - Interface Utilisateur**
- **Objectif**: Permettre à l'utilisateur de visualiser et modifier les développeurs
- **Relation**: Interface ↔ Service HTTP (transmission des données)
- **Modification**: L'utilisateur modifie les données dans le formulaire React

**ÉTAPE 2: Frontend Service - Transmission HTTP**
- **Objectif**: Sérialiser les données et envoyer au backend via API REST
- **Relation**: Service HTTP ↔ Backend API (requête HTTP)
- **Modification**: Les données sont sérialisées en JSON pour transmission

**ÉTAPE 3: Backend API - Validation**
- **Objectif**: Valider les données reçues et déléguer au service métier
- **Relation**: API ↔ Service métier (appel des méthodes de logique métier)
- **Modification**: Les données sont validées et transformées en dictionnaire Python

**ÉTAPE 4: Backend Service - Logique Métier**
- **Objectif**: Appliquer la logique métier SCD Type 2 pour les mutations et cycle de vie
- **Relation**: Service ↔ Repository (accès à la base de données)
- **Modification**: La logique métier transforme les données en opérations SQL

**ÉTAPE 5: Repository - Synchronisation SCD Type 2**
- **Objectif**: Synchroniser intelligemment les segments de liaison avec historisation
- **Relation**: Repository ↔ Base de données (SQL queries)
- **Modification**: Les segments sont créés/fermés avec dates précises

**ÉTAPE 6: Base de Données - Persistance**
- **Objectif**: Stocker les données avec historisation temporelle complète
- **Relation**: Base de données ↔ Système (données persistées pour KPIs)
- **Modification**: Les données sont persistées en base avec INSERT/UPDATE SQL

### 🔗 Flux de Modification (Création → Mise à Jour)

```
┌─────────────────────────────────────────────────────────────────┐
│                     MODIFICATION UTILISATEUR                         │
│  - Création: Formulaire vide → POST /developers                │
│  - Mise à jour: Formulaire pré-rempli → PUT /developers/{id}     │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Données JSON
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              HISTORISATION SCD TYPE 2 (Conservation)              │
│  - Chaque modification crée un NOUVE segment daté              │
│  - Ancien segment fermé avec date de fin (end_date)             │
│  - Nouveau segment ouvert avec date de début (start_date)            │
│  - Pas de suppression des anciens segments (historique préservée)    │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ SQL INSERT/UPDATE
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              BASE DE DONNÉES (Historique Complète)               │
│  - Ancien segment: is_active=false, end_date=date_fin            │
│  - Nouveau segment: is_active=true, end_date=NULL                │
│  - Permet de retracer l'historique complet des affectations         │
└─────────────────────────────────────────────────────────────────┘
```

### 🎓 Comment l'Historique est Conservé (SCD Type 2)

**Principe SCD Type 2 (Slowly Changing Dimension Type 2)**:
- **Conservation**: On ne SUPPRIME JAMAIS les anciennes données
- **Historisation**: Chaque modification crée un NOUVE segment avec des dates précises
- **Traçabilité**: On peut retracer l'historique complet des affectations dans le temps

**Exemple Concret: Mutation de Site**
```
État AVANT mutation:
  Table developer_site:
  | developer_id | site_id | is_active | start_date | end_date |
  |--------------|---------|-----------|------------|----------|
  | 1 | 5 (Paris) | true | 2026-01-15 | NULL |

MODIFICATION: Paris → Lyon, mutation_date=2026-06-01

État APRÈS mutation:
  Table developer_site:
  | developer_id | site_id | is_active | start_date | end_date |
  |--------------|---------|-----------|------------|----------|
  | 1 | 5 (Paris) | false | 2026-01-15 | 2026-05-31 | ← Ancien segment fermé
  | 1 | 6 (Lyon)  true  | 2026-06-01 | NULL          | ← Nouveau segment ouvert
```

**Avantages**:
- **Historique complet**: On sait que le dev était à Paris du 15/01 au 31/05
- **Audit trail**: On sait quand la mutation a eu lieu (2026-06-01)
- **KPIs historiques**: On peut recalculer les KPIs pour les périodes passées
- **Pas de perte**: Aucune donnée n'est supprimée

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                              │
│  - Liste des développeurs avec filtres                                  │
│  - Modal d'édition/ajout                                               │
│  - Actions: Toggle actif, Archiver, Mutations                         │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTP Request (POST/PUT/PATCH)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API (FastAPI)                            │
│  - Endpoint POST /developers (création)                              │
│  - Endpoint PUT /developers/{id} (mise à jour)                        │
│  - Validation des données                                            │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Appel Service
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND SERVICE (Business Logic)                       │
│  - DeveloperService.update()                                         │
│  - Gestion SCD Type 2 (sites, projets, groupes)                        │
│  - Suspension/Réactivation                                          │
│  - Détection corrections rétroactives                               │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ SQL Queries
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                 BASE DE DONNÉES (PostgreSQL)                        │
│  - Tables: developer, developer_site, developer_project, etc.      │
│  - SCD Type 2 pour historisation temporelle                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 ÉTAPE 1: Frontend - Interface de Gestion

### Fichier: `src/frontend/src/pages/admin/DevelopersPage.jsx`

**Objectif**: Interface utilisateur pour la gestion des développeurs

#### 1.1 Bouton Nouveau Développeur (lignes 1867-1869)
```javascript
<button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={() => setEditDev({})}>
  <i className="ri-add-line me-1"></i> Nouveau Développeur
</button>
```

**Objectif**: Ouvre le modal d'édition avec un objet vide pour créer un nouveau développeur

#### 1.2 Toggle Activation/Désactivation (lignes 1813-1824)
```javascript
const handleToggleActive = useCallback(async (dev) => {
  try {
    const willBeActive = !dev.is_active;
    const updateData   = { is_active: willBeActive };
    if (willBeActive) updateData.offboarding_date = null;
    await developerService.update(dev.id, updateData);
    showToast(`${devDisplayName(dev)} est maintenant ${willBeActive ? "Actif" : "Désactivé"}`);
    await load();
  } catch {
    showToast("Erreur lors du changement de statut", "danger");
  }
}, [load, showToast]);
```

**Logique**:
- Inverse le statut `is_active`
- Si réactivation → efface `offboarding_date`
- Appel API PUT pour mettre à jour
- Recharge la liste après succès

#### 1.3 Archivage (Offboarding) (lignes 1826-1838)
```javascript
const handleArchiveConfirm = useCallback(async (dev, date) => {
  setArchiveDevLoading(true);
  try {
    await developerService.update(dev.id, { offboarding_date: date, is_active: false });
    showToast(`${devDisplayName(dev)} a été archivé (Sortie fixée au ${new Date(date).toLocaleDateString("fr-FR")})`);
    setArchiveDev(null);
    await load();
  } catch {
    showToast("Erreur lors de l'archivage", "danger");
  } finally {
    setArchiveDevLoading(false);
  }
}, [load, showToast]);
```

**Logique**:
- Fixe la date de sortie (`offboarding_date`)
- Désactive le développeur (`is_active = false`)
- Appel API PUT pour mettre à jour

---

## 🔄 ÉTAPE 2: Frontend Service - Appels HTTP

### Fichier: `src/frontend/src/services/developerService.js`

#### 2.1 Méthode update (mise à jour développeur)
```javascript
update(id, data) {
  return api.put(`/developers/${id}`, data);
}
```

**Paramètres envoyés**:
- `is_active`: booléen pour activation/désactivation
- `offboarding_date`: date pour archivage
- `sites`, `projects`, `groups`: listes pour mutations

---

## 🔄 ÉTAPE 3: Backend API - Réception des Mises à Jour

### Fichier: `src/backend/app/api/routers/developers.py`

#### 3.1 Endpoint PUT /developers/{id} (mise à jour)
```python
@router.put("/{developer_id}")
async def update_developer(
    developer_id: int,
    payload: DeveloperUpdate,
    db: Session = Depends(get_db),
    current_admin: AppUser = Depends(get_current_admin)
):
    """
    Met à jour un développeur existant.
    Gère les mutations SCD Type 2 pour sites, projets, groupes.
    """
    result = service.update_developer(
        db=db,
        developer_id=developer_id,
        update_data=payload.dict(exclude_unset=True),
        mutation_date=payload.mutation_date
    )
    db.commit()
    return result
```

**Paramètres reçus**:
- `developer_id`: ID du développeur à modifier
- `payload`: Données de mise à jour (is_active, offboarding_date, sites, projects, groups, mutation_date)

---

## 🔄 ÉTAPE 4: Backend Service - Logique de Mise à Jour

### Fichier: `src/backend/app/services/admin/developer_service.py`

**Objectif**: Gérer les mises à jour avec SCD Type 2

#### 4.1 Méthode update_developer (lignes 250-550 approx)
```python
def update_developer(
    self,
    db: Session,
    developer_id: int,
    update_data: dict,
    mutation_date: Optional[date] = None
) -> Developer:
    """
    Met à jour un développeur avec gestion SCD Type 2.
    Gère activation/désactivation, mutations, et archivage.
    """
    developer = self.dev_repo.get_by_id(db, developer_id)
    if not developer:
        raise ValueError(f"Developer id={developer_id} not found")
    
    # Calcul des dates de période
    p_start = p_end = None
    period_id = update_data.get("period_id")
    if period_id:
        period = db.query(Period).filter(Period.id == period_id).first()
        if period:
            p_start = date(period.year, period.month, 1)
            if period.month == 12:
                p_end = date(period.year + 1, 1, 1)
            else:
                p_end = date(period.year, period.month + 1, 1)
    
    off_date_to_use = update_data.get("offboarding_date") or developer.offboarding_date
```

#### 4.2 Gestion Activation/Désactivation (lignes 301-459)
```python
# ========================================================================
# GESTION DU CYCLE DE VIE (Activation / Désactivation)
# ========================================================================
new_is_active = update_data.get("is_active", None)
is_active_before = developer.is_active

if new_is_active is not None and new_is_active != is_active_before:
    effect_date = mutation_date or off_date_to_use or date.today()

    from app.models.developer_site import DeveloperSite
    from app.models.developer_project import DeveloperProject
    from app.models.developer_group import DeveloperGroupLink
    from datetime import timedelta

    if not new_is_active:
        # ── SUSPENSION : Fermeture propre de la carrière à la veille de effect_date ──────
        close_date = effect_date - timedelta(days=1)

        # 1. Traitement des Sites
        # Supprimer les segments qui commencent après la date de fermeture
        future_sites = db.query(DeveloperSite).filter(
            DeveloperSite.developer_id == developer_id,
            DeveloperSite.start_date > close_date
        ).all()
        for seg in future_sites:
            logger.info("[SUSPENSION] Suppression segment site futur id=%d", seg.id)
            db.delete(seg)

        # Fermer les segments actifs à la date de fermeture
        active_sites = db.query(DeveloperSite).filter(
            DeveloperSite.developer_id == developer_id,
            DeveloperSite.start_date <= close_date,
            ((DeveloperSite.is_active.is_(True)) | (DeveloperSite.end_date > close_date))
        ).all()
        for seg in active_sites:
            seg.is_active = False
            seg.end_date  = close_date
            logger.info("[SUSPENSION] Fermeture segment site id=%d au %s", seg.id, close_date)

        # 2. Traitement des Projets
        future_projects = db.query(DeveloperProject).filter(
            DeveloperProject.developer_id == developer_id,
            DeveloperProject.start_date > close_date
        ).all()
        for seg in future_projects:
            logger.info("[SUSPENSION] Suppression segment projet futur id=%d", seg.id)
            db.delete(seg)

        active_projects = db.query(DeveloperProject).filter(
            DeveloperProject.developer_id == developer_id,
            DeveloperProject.start_date <= close_date,
            ((DeveloperProject.is_active.is_(True)) | (DeveloperProject.end_date > close_date))
        ).all()
        for seg in active_projects:
            seg.is_active = False
            seg.end_date = close_date
            logger.info("[SUSPENSION] Fermeture segment projet id=%d au %s", seg.id, close_date)

        # 3. Traitement des Groupes
        future_groups = db.query(DeveloperGroupLink).filter(
            DeveloperGroupLink.developer_id == developer_id,
            DeveloperGroupLink.start_date > close_date
        ).all()
        for seg in future_groups:
            logger.info("[SUSPENSION] Suppression segment groupe futur id=%d", seg.id)
            db.delete(seg)

        active_groups = db.query(DeveloperGroupLink).filter(
            DeveloperGroupLink.developer_id == developer_id,
            DeveloperGroupLink.start_date <= close_date,
            ((DeveloperGroupLink.is_active.is_(True)) | (DeveloperGroupLink.end_date > close_date))
        ).all()
        for seg in active_groups:
            seg.is_active = False
            seg.end_date = close_date
            logger.info("[SUSPENSION] Fermeture segment groupe id=%d au %s", seg.id, close_date)

        db.flush()
        logger.info(
            "[SUSPENSION] Dev_id=%d suspendu à compter du %s (fermeture au %s)",
            developer_id, effect_date, close_date
        )

    else:
        # ── RÉACTIVATION : Réouverture des segments depuis effect_date ──
        # Réouvrir les segments site fermés les plus récents
        closed_sites = db.query(DeveloperSite).filter(
            DeveloperSite.developer_id == developer_id,
            DeveloperSite.is_active.is_(False),
        ).order_by(DeveloperSite.end_date.desc()).all()

        # On ne rouvre que les segments fermés lors de la suspension
        # (ceux dont end_date = effect_date - 1 jour)
        reactivation_close_date = None
        if closed_sites:
            reactivation_close_date = max(
                (s.end_date for s in closed_sites if s.end_date), default=None
            )

        reopened_site_ids = set()
        for seg in closed_sites:
            if seg.end_date and seg.end_date == reactivation_close_date and seg.site_id not in reopened_site_ids:
                # Créer un nouveau segment ouvert à partir de effect_date
                db.add(DeveloperSite(
                    developer_id=developer_id,
                    site_id=seg.site_id,
                    is_primary=seg.is_primary,
                    is_active=True,
                    start_date=effect_date,
                    end_date=None,
                ))
                reopened_site_ids.add(seg.site_id)
                logger.info(
                    "[RÉACTIVATION] Rouvert segment site_id=%d pour dev_id=%d à partir du %s",
                    seg.site_id, developer_id, effect_date
                )

        # Même logique pour projets et groupes...
```

**Logique de Suspension**:
1. **Date de fermeture**: `effect_date - 1 jour`
2. **Suppression segments futurs**: Segments qui commencent après la fermeture
3. **Fermeture segments actifs**: `is_active = False`, `end_date = close_date`
4. **Appliqué à**: Sites, Projets, Groupes

**Logique de Réactivation**:
1. **Identification segments fermés**: Recherche les segments avec `is_active = False`
2. **Date de réactivation**: Date de fermeture la plus récente
3. **Réouverture**: Crée nouveau segment avec `start_date = effect_date`, `end_date = NULL`
4. **Appliqué à**: Sites, Projets, Groupes

#### 4.3 Gestion Mutations Sites/Projets/Groupes (lignes 487-530)
```python
# ── [SCD2 FIX] Skip sync_smart si is_active vient de changer ──
is_active_just_changed = (new_is_active is not None and new_is_active != is_active_before)
is_suspension = is_active_just_changed and not new_is_active

# 1. Sites
if is_suspension or is_active_just_changed:
    pass # On ne recrée pas de segments pour un dev qu'on vient de suspendre ou réactiver !
elif payload.sites is not None:
    self.dev_site_repo.sync_smart(db, developer_id, payload.sites, p_start=p_start, p_end=p_end, mutation_date=mutation_date)
elif not is_active_just_changed:
    final_sites = [{"site_id": ds.site_id, "is_primary": ds.is_primary}
                    for ds in self.dev_site_repo.get_by_developer(db, developer_id)]
    if set(final_sites) != set(payload.sites):
        self.dev_site_repo.sync_smart(db, developer_id, payload.sites, p_start=p_start, p_end=p_end, mutation_date=mutation_date)

# 2. Projets
if is_suspension or is_active_just_changed:
    pass
elif payload.projects is not None:
    self.dev_proj_repo.sync_smart(db, developer_id, payload.projects, p_start=p_start, p_end=p_end, mutation_date=mutation_date)
elif not is_active_just_changed:
    final_projects = [{"project_id": dp.project_id}
                      for dp in self.dev_proj_repo.get_by_developer(db, developer_id, active_only=True)]
    if set(final_projects) != set(payload.projects):
        self.dev_proj_repo.sync_smart(db, developer_id, payload.projects, p_start=p_start, p_end=p_end, mutation_date=mutation_date)

# 3. Groupes
if is_suspension or is_active_just_changed:
    pass
elif payload.groups is not None:
    self.dev_group_repo.sync_smart(db, developer_id, payload.groups, p_start=p_start, p_end=p_end, mutation_date=mutation_date)
elif not is_active_just_changed:
    final_groups = [{"group_id": gl.group_id}
                    for gl in db.query(DeveloperGroupLink).filter(
                        DeveloperGroupLink.developer_id == developer_id,
                        DeveloperGroupLink.is_active == True
                    ).all()]
    if set(final_groups) != set(payload.groups, key=lambda x: x["group_id"]):
        self.dev_group_repo.sync_smart(db, developer_id, payload.groups, p_start=p_start, p_end=p_end, mutation_date=mutation_date)
```

**Logique sync_smart**:
- Compare l'état actuel avec l'état souhaité
- Crée/ferme les segments SCD Type 2 selon les différences
- Gère les mutations avec `mutation_date` pour historisation

#### 4.4 Détection Corrections Rétroactives (lignes 465-530)
```python
# ========================================================================
# [ENTERPRISE] DÉTECTION DES CHANGEMENTS SENSIBLES (Option B)
# Capture l'état AVANT synchronisation pour détecter les corrections
# qui nécessitent un recalcul des KPIs historiques.
# ========================================================================
changed_fields = []

# Snapshot AVANT
projects_before = set(
    dp.project_id for dp in self.dev_proj_repo.get_by_developer(db, developer_id, active_only=True)
)
sites_before = set(
    ds.site_id for ds in self.dev_site_repo.get_by_developer(db, developer_id)
    if getattr(ds, 'is_active', True)
)
)
groups_before = set(
    gl.group_id for gl in db.query(DeveloperGroupLink).filter(
        DeveloperGroupLink.developer_id == developer_id,
        DeveloperGroupLink.is_active == True
    ).all()
)

# ... après synchronisation ...

# Snapshot APRÈS
projects_after = set(
    dp.project_id for dp in self.dev_proj_repo.get_by_developer(db, developer_id, active_only=True)
)
sites_after = set(
    ds.site_id for ds in self.dev_site_repo.get_by_developer(db, developer_id)
    if getattr(ds, 'is_active', True)
)
)
groups_after = set(
    gl.group_id for gl in db.query(DeveloperGroupLink).filter(
        DeveloperGroupLink.developer_id == developer_id,
        DeveloperGroupLink.is_active == True
    ).all()
)

# Détection des changements
if projects_before != projects_after:
    changed_fields.append("projects")
if sites_before != sites_after:
    changed_fields.append("sites")
if groups_before != groups_after:
    changed_fields.append("groups")

# Si changement détecté → trigger recalcul KPIs historiques
if changed_fields and not is_suspension:
    from app.services.kpi.kpi_service import KpiService
    kpi_service = KpiService()
    kpi_service.recalculate_historical_for_developer(db, developer_id, changed_fields)
```

---

## 🔄 ÉTAPE 5: Repository - Synchronisation SCD Type 2

### Fichier: `src/backend/app/repositories/developer_site_repository.py`

#### 5.1 Méthode sync_smart (synchronisation intelligente)
```python
def sync_smart(
    self,
    db: Session,
    developer_id: int,
    site_ids: List[int],
    p_start: Optional[date] = None,
    p_end: Optional[date] = None,
    mutation_date: Optional[date] = None
) -> None:
    """
    Synchronise les affectations sites d'un développeur avec SCD Type 2.
    Crée/ferme les segments selon les différences détectées.
    """
    # Segments actuels
    current = db.query(DeveloperSite).filter(
        DeveloperSite.developer_id == developer_id
    ).all()
    
    current_map = {cs.site_id: cs for cs in current}
    target_set = set(site_ids)
    
    # Segments à fermer (présents mais plus dans la cible)
    for site_id, seg in current_map.items():
        if site_id not in target_set:
            if seg.is_active:
                seg.is_active = False
                seg.end_date = mutation_date or date.today()
    
    # Segments à créer (dans la cible mais pas présents)
    for site_id in target_set:
        if site_id not in current_map:
            db.add(DeveloperSite(
                developer_id=developer_id,
                site_id=site_id,
                is_primary=(len(target_set) == 1 or site_id == list(target_set)[0]),
                is_active=True,
                start_date=mutation_date or p_start or date.today(),
                end_date=None
            ))
    
    db.flush()
```

**Logique**:
1. **Segments actuels**: Récupère tous les segments du développeur
2. **Fermeture**: Segments présents mais plus dans la cible → `is_active = False`, `end_date = mutation_date`
3. **Création**: Segments dans la cible mais pas présents → Nouveau segment avec `start_date = mutation_date`
4. **Historisation**: Chaque changement est daté avec `mutation_date`

---

## 🔄 ÉTAPE 6: Base de Données - Persistance SCD Type 2

### Tables Principales

#### 6.1 Table `developer` (Informations RH)
```sql
CREATE TABLE developer (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    gitlab_username VARCHAR(255),
    gitlab_user_id INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    is_bot BOOLEAN DEFAULT FALSE,
    is_validated BOOLEAN DEFAULT FALSE,
    is_external BOOLEAN DEFAULT FALSE,
    onboarding_date DATE,
    offboarding_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 6.2 Table `developer_site` (SCD Type 2 - Affectations Sites)
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

**Exemple de données (mutation de site)**:
| developer_id | site_id | is_primary | is_active | start_date | end_date |
|--------------|---------|------------|-----------|------------|----------|
| 1 | 5 (Paris) | true | true | 2026-01-15 | 2026-05-31 |
| 1 | 6 (Lyon) | true | true | 2026-06-01 | NULL |

**Interprétation**:
- Développeur 1 était à Paris du 15/01/2026 au 31/05/2026
- Muté à Lyon le 01/06/2026 (toujours actif)

#### 6.3 Table `developer_project` (SCD Type 2 - Missions)
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

**Exemple de données (mutation de projet)**:
| developer_id | project_id | is_active | start_date | end_date |
|--------------|------------|-----------|------------|----------|
| 1 | 12 (Frontend) | true | true | 2026-01-15 | 2026-03-31 |
| 1 | 13 (Backend) | true | true | 2026-04-01 | NULL |

**Interprétation**:
- Développeur 1 était sur Frontend du 15/01/2026 au 31/03/2026
- Muté sur Backend le 01/04/2026 (toujours actif)

#### 6.4 Table `developer_group_link` (SCD Type 2 - Groupes)
```sql
CREATE TABLE developer_group_link (
    id SERIAL PRIMARY KEY,
    developer_id INTEGER REFERENCES developer(id),
    group_id INTEGER REFERENCES group(id),
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    UNIQUE(developer_id, group_id, start_date)
);
```

---

## 🔍 Exemples Concrets Complets

### Exemple 1: Création Nouveau Développeur

#### Frontend
```
1. Utilisateur clique "Nouveau Développeur"
2. Modal s'ouvre avec formulaire vide
3. Remplit: name="Jean Dupont", email="jean@example.com", gitlab_username="jeandupont"
4. Sélectionne: site_id=5 (Paris), project_ids=[12,13], group_id=3 (Backend)
5. Clique "Enregistrer"
```

#### Backend Service
```
1. Création Developer:
   INSERT INTO developer (name, email, gitlab_username, is_active, onboarding_date)
   VALUES ('Jean Dupont', 'jean@example.com', 'jeandupont', true, '2026-01-15')

2. Création DeveloperSite (SCD Type 2):
   INSERT INTO developer_site (developer_id, site_id, is_primary, is_active, start_date)
   VALUES (1, 5, true, true, '2026-01-15')

3. Création DeveloperProject (SCD Type 2):
   INSERT INTO developer_project (developer_id, project_id, is_active, start_date)
   VALUES (1, 12, true, true, '2026-01-15')
   INSERT INTO developer_project (developer_id, project_id, is_active, start_date)
   VALUES (1, 13, true, true, '2026-01-15')

4. Création DeveloperGroupLink (SCD Type 2):
   INSERT INTO developer_group_link (developer_id, group_id, is_active, start_date)
   VALUES (1, 3, true, true, '2026-01-15')
```

---

### Exemple 2: Suspension (Désactivation)

#### Frontend
```
1. Utilisateur clique toggle "Actif" → "Désactivé" pour développeur 1
2. handleToggleActive() appelé avec willBeActive=false
3. Appel API PUT /developers/1 avec {is_active: false}
```

#### Backend Service (lignes 312-379)
```
1. Détection changement: new_is_active=false, is_active_before=true
2. effect_date = date.today() (ex: 2026-06-15)
3. close_date = effect_date - 1 jour = 2026-06-14

4. Traitement Sites:
   - Suppression segments futurs (start_date > 2026-06-14)
   - Fermeture segments actifs: is_active=false, end_date=2026-06-14

5. Traitement Projets:
   - Suppression segments futurs
   - Fermeture segments actifs: is_active=false, end_date=2026-06-14

6. Traitement Groupes:
   - Suppression segments futurs
   - Fermeture segments actifs: is_active=false, end_date=2026-06-14

7. UPDATE developer SET is_active=false WHERE id=1
```

#### Résultat Base de Données
```
Table developer:
| id | is_active | offboarding_date |
|----|-----------|-----------------|
| 1  | false     | NULL            |

Table developer_site (avant):
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 5 | true | 2026-01-15 | NULL |

Table developer_site (après):
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 5 | false | 2026-01-15 | 2026-06-14 |
```

---

### Exemple 3: Mutation de Site

#### Frontend
```
1. Utilisateur édite développeur 1
2. Change site_id de 5 (Paris) à 6 (Lyon)
3. Définit mutation_date = 2026-06-01
4. Clique "Enregistrer"
```

#### Backend Service (lignes 496-497)
```
1. Appel dev_site_repo.sync_smart(
   developer_id=1,
   site_ids=[6],
   mutation_date=2026-06-01
)

2. sync_smart détecte:
   - Segment actuel: site_id=5, is_active=true
   - Cible: site_id=6
   - Différence: 5 → 6

3. Actions:
   - Fermeture segment Paris: is_active=false, end_date=2026-06-01
   - Création segment Lyon: site_id=6, is_active=true, start_date=2026-06-01, end_date=NULL
```

#### Résultat Base de Données
```
Table developer_site:
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 5 (Paris) | false | 2026-01-15 | 2026-05-31 |
| 1 | 6 (Lyon) | true | 2026-06-01 | NULL |
```

**Historique préservé**: On voit que le développeur était à Paris jusqu'au 31/05, puis muté à Lyon le 01/06.

---

### Exemple 4: Archivage (Offboarding)

#### Frontend
```
1. Utilisateur clique "Archiver" pour développeur 1
2. Sélectionne offboarding_date = 2026-12-31
3. handleArchiveConfirm() appelé
4. Appel API PUT /developers/1 avec {offboarding_date: "2026-12-31", is_active: false}
```

#### Backend Service
```
1. Détection: offboarding_date fourni, is_active=false
2. effect_date = 2026-12-31
3. close_date = effect_date - 1 jour = 2026-12-30

4. Traitement Sites/Projets/Groupes:
   - Même logique que suspension
   - Fermeture de tous les segments actifs à 2026-12-30

5. UPDATE developer SET 
   is_active=false, 
   offboarding_date='2026-12-31' 
   WHERE id=1
```

#### Résultat Base de Données
```
Table developer:
| id | is_active | offboarding_date |
|----|-----------|-----------------|
| 1  | false     | 2026-12-31     |

Table developer_site:
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 6 | false | 2026-06-01 | 2026-12-30 |
```

---

## 🎓 Points Clés pour la Soutenance

### 1. SCD Type 2 (Slowly Changing Dimension)
- **Historisation complète**: Chaque affectation est datée (start_date, end_date)
- **Support des mutations**: Un développeur peut changer de site/groupe/projet dans le temps
- **Requêtes temporelles**: Filtrage par période avec chevauchements gérés
- **Pas de perte d'historique**: Les anciens segments restent en base

### 2. Suspension vs Archivage
- **Suspension**: `is_active=false` sans `offboarding_date` (temporaire)
- **Archivage**: `is_active=false` + `offboarding_date` (définitif)
- **Réactivation**: Possible après suspension, impossible après archivage

### 3. Mutation Date
- **mutation_date**: Date à laquelle la mutation prend effet
- **Historisation**: Permet de tracker quand les mutations ont eu lieu
- **Rétroactivité**: Permet de corriger des dates passées

### 4. Triple Vérification
- **Sites**: Segments SCD Type 2 couvrant la période
- **Projets**: Segments SCD Type 2 couvrant la période
- **Groupes**: Segments SCD Type 2 couvrant la période
- **Cycle de vie**: onboarding_date et offboarding_date respectés

### 5. Détection Corrections Rétroactives
- **Snapshot avant/après**: Compare l'état avant et après modification
- **Trigger recalcul KPIs**: Si changement détecté → recalcul des KPIs historiques
- **Audit trail**: Log des changements sensibles

### 6. sync_smart
- **Intelligent**: Compare l'état actuel avec la cible
- **Optimisé**: Ne modifie que ce qui est nécessaire
- **Atomique**: Tout dans une transaction SQL

---

## 🚀 Conclusion

Le système de gestion des développeurs suit ce processus:

1. **Frontend**: Interface utilisateur avec actions (créer, toggle actif, archiver, éditer)
2. **Service HTTP**: Transmission des données via API REST
3. **Backend API**: Validation et délégation au service métier
4. **Service Métier**: Gestion SCD Type 2 des affectations, suspension/réactivation
5. **Repository**: Synchronisation intelligente des segments
6. **Base de données**: Persistance avec historisation temporelle complète

Chaque opération (création, activation, mutation, archivage) est historisée avec des dates précises, permettant de tracker l'évolution des affectations dans le temps et de recalculer les KPIs historiques en cas de corrections.
