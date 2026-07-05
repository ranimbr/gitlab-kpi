# Relation Gestion Développeurs ↔ Extraction by Team ↔ Calcul KPIs

## 📋 Résumé Exécutif (Pour les Responsables)

### 🎯 Pourquoi cette relation est critique

**Problème**: Comment calculer des KPIs précis et dynamiques qui s'adaptent automatiquement aux changements d'affectation des développeurs (mutations, suspensions, archivages)?

**Solution**: Le système utilise la gestion SCD Type 2 des développeurs pour calculer les KPIs intelligemment et dynamiquement pour chaque période.

**Bénéfices**:
- ✅ **KPIs dynamiques**: Les KPIs s'adaptent automatiquement aux mutations de site/groupe/projet
- ✅ **Historique précis**: On peut recalculer les KPIs pour n'importe quelle période passée
- ✅ **Intelligence temporelle**: Le système sait quels développeurs étaient actifs pour chaque période
- ✅ **Correction rétroactive**: On peut corriger des affectations passées et recalculer les KPIs

### 🔍 Analogie Simple

Imaginez un système de paie intelligente:
- **Sans SCD Type 2**: On calcule la paie sur l'affectation actuelle (incorrect pour les périodes passées)
- **Avec SCD Type 2**: On calcule la paie sur l'affectation réelle de chaque période (correct)

**Exemple**: Jean était à Paris en janvier (5 devs), muté à Lyon en février (3 devs). Les KPIs de janvier sont calculés avec 5 devs, ceux de février avec 3 devs.

---

## 🔄 Architecture Complète: Gestion Dev ↔ Extraction ↔ KPIs

```
┌─────────────────────────────────────────────────────────────────┐
│              GESTION DÉVELOPPEURS (SCD Type 2)                      │
│  - Création: Nouveau dev avec affectations initiales                 │
│  - Mutation: Changement site/groupe/projet avec historisation         │
│  - Suspension: Désactivation temporaire (congé, formation)           │
│  - Archivage: Sortie définitive (offboarding)                        │
│  - Historisation: TOUT conservé avec dates précises                  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Base de données (SCD Type 2)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              EXTRACTION BY TEAM (Smart-Sync)                        │
│  - auto_target_by_period: Sélection intelligente des devs actifs    │
│  - get_active_during_period: Filtrage temporel SCD Type 2           │
│  - get_certified_developers: Filtrage missions + dates RH            │
│  - Extraction: Commits/MRs filtrés par devs actifs de la période      │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Données extraites + eligible_dev_ids
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              CALCUL KPIs (Intelligent & Dynamique)                   │
│  - KpiAggregator: Génère snapshots par site/groupe/dev               │
│  - KpiCalculator: Calcule les KPIs avec nb_devs dynamique            │
│  - _count_developers: Compte les devs actifs pour la période         │
│  - Score calculé: Normalisé par le nombre de devs                    │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Snapshots KPIs persistés
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              BASE DE DONNÉES (KPIs Historisés)                       │
│  - KpiSnapshot: KPIs par période/site/groupe/dev                     │
│  - Historique complet: KPIs recalculables pour toute période          │
│  - Intelligence: KPIs adaptés aux mutations passées                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 ÉTAPE 1: Gestion Développeurs (SCD Type 2)

### Fichier: `src/backend/app/services/admin/developer_service.py`

**Objectif**: Gérer le cycle de vie des développeurs avec historisation complète

#### 1.1 Mutation de Site avec Historisation
```python
# Fichier: developer_service.py (lignes 496-497)
elif payload.sites is not None:
    self.dev_site_repo.sync_smart(db, developer_id, payload.sites, p_start=p_start, p_end=p_end, mutation_date=mutation_date)
```

**Logique**:
- `sync_smart` compare l'état actuel avec la cible
- Si différence → fermeture ancien segment + création nouveau segment
- Historisation: Ancien segment fermé avec `end_date`, nouveau ouvert avec `start_date`

#### 1.2 Exemple Concret: Mutation Paris → Lyon
```python
# AVANT mutation (2026-01-15):
Table developer_site:
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 5 (Paris) | true | 2026-01-15 | NULL |

# APRES mutation (mutation_date=2026-06-01):
Table developer_site:
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 5 (Paris) | false | 2026-01-15 | 2026-05-31 | ← Historique préservé
| 1 | 6 (Lyon)  true  | 2026-06-01 | NULL          | ← Nouveau segment
```

**Impact**: Les KPIs de janvier-mai seront calculés avec Paris, ceux de juin avec Lyon.

---

## 🎯 ÉTAPE 2: Extraction by Team (Smart-Sync)

### Fichier: `src/backend/app/api/routers/extraction.py`

**Objectif**: Extraire les données GitLab en filtrant intelligemment les développeurs actifs pour la période

#### 2.1 auto_target_by_period (lignes 80-87)
```python
if auto_target_by_period:
    _, _, p_start, p_end = build_period_window(lot.period)
    eligible_devs = DeveloperRepository().get_active_during_period(
        db, p_start.date(), p_end.date()
    )
    developer_ids = [d.id for d in eligible_devs]
    logger.info(f"[lot={lot_id}] Smart-Sync: {len(developer_ids)} développeurs éligibles identifiés.")
```

**Logique**:
- `auto_target_by_period`: Active la sélection intelligente des développeurs
- `get_active_during_period`: Récupère les développeurs actifs pendant la période
- Utilise SCD Type 2 pour filtrer par affectations temporelles

#### 2.2 get_active_during_period (DeveloperRepository)
```python
# Fichier: developer_repository.py
def get_active_during_period(self, db, start_date, end_date):
    """
    Retourne les développeurs actifs pendant une période donnée.
    Utilise SCD Type 2 pour filtrer par affectations temporelles.
    """
    q = db.query(Developer).filter(
        Developer.is_active.is_(True),
        or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date),
        or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= start_date)
    )
    return q.all()
```

**Logique**:
- Filtre par `is_active` (statut actuel)
- Filtre par dates contractuelles RH (onboarding/offboarding)
- Retourne les développeurs éligibles pour la période

---

## 🎯 ÉTAPE 3: Filtrage Intelligent des Développeurs (Mission + RH)

### Fichier: `src/backend/app/utils/mission_utils.py`

**Objectif**: Filtrer les développeurs selon leurs missions et dates RH avec SCD Type 2

#### 3.1 get_certified_developers_query (lignes 80-130)
```python
def get_certified_developers_query(
    db: Session,
    project_id: int,
    period_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    eligible_ids: Optional[List[int]] = None
):
    """
    Retourne une query SQL pour les développeurs certifiés pour une mission.
    Applique SCD Type 2 pour sites, groupes, et projets.
    """
    threshold_date = get_rg02_threshold(start_date.year, start_date.month)
    
    query = db.query(Developer.id).join(
        DeveloperSite,
        (DeveloperSite.developer_id == Developer.id)
    ).join(
        DeveloperGroupLink,
        (DeveloperGroupLink.developer_id == Developer.id)
    ).filter(
        Developer.is_bot.is_(False),
        
        # [STRICT CYCLE DE VIE] Respect des dates contractuelles RH + Règle des 15 jours
        or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date),
        or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date),

        # [SCD2 TEMPORAL - SITE] Le segment de site doit couvrir la période
        or_(DeveloperSite.start_date.is_(None), DeveloperSite.start_date < end_date),
        or_(DeveloperSite.end_date.is_(None),   DeveloperSite.end_date   >= start_date),

        # [SCD2 TEMPORAL - GROUPE] Le segment de groupe doit couvrir la période
        or_(DeveloperGroupLink.start_date.is_(None), DeveloperGroupLink.start_date < end_date),
        or_(DeveloperGroupLink.end_date.is_(None),   DeveloperGroupLink.end_date   >= start_date),
    ).distinct()
    
    # [STRICT TEMPORAL SCOPE] La mission spécifique au projet doit couvrir la période
    query = query.filter(
        or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date < end_date),
        or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_date)
    )
    
    return query
```

**Logique**:
- **RG-02 (Règle des 15 jours)**: Un développeur est compté si offboarding_date >= 15 du mois
- **SCD Type 2**: Vérifie que les segments de site/groupe/projet couvrent la période
- **Filtrage triple**: RH (onboarding/offboarding) + Site + Groupe + Projet

#### 3.2 RG-02 Threshold (lignes 77-80)
```python
# [STRICT CYCLE DE VIE] Règle des 15 jours (RG-02)
# Un développeur n'est compté dans la période que s'il est resté au moins jusqu'au 15 du mois.
threshold_date = date(start_date.year, start_date.month, 15)
```

**Exemple**:
- Période: Janvier 2026
- Offboarding: 10 janvier → Développeur NON compté (avant le 15)
- Offboarding: 20 janvier → Développeur compté (après le 15)

---

## 🎯 ÉTAPE 4: Calcul KPIs (Intelligent & Dynamique)

### Fichier: `src/backend/app/services/kpi/kpi_aggregator.py`

**Objectif**: Générer les snapshots KPIs pour tous les niveaux (site, groupe, global, développeur)

#### 4.1 generate_monthly_snapshots (lignes 39-199)
```python
def generate_monthly_snapshots(
    self,
    project_id: int,
    year:       int,
    month:      int,
    lot_id:     Optional[int] = None,
) -> List[KpiSnapshot]:
    """
    Génère tous les snapshots KPI pour un projet et une période donnée.
    
    Niveaux générés :
        1. Par site    — un snapshot par site associé au projet
        2. Global      — agrégat tous sites confondus
        3. Par groupe  — un snapshot par groupe
        4. Par dev     — un snapshot par développeur validé
    """
    # Résolution de la plage de dates du mois
    start_date, end_date = get_period_date_range_exclusive(year, month)
    
    period = self.period_repo.get_by_year_month(self.db, year, month)
    
    # Harmonisation Mission-Strict (FIX 1: Matérialisation unique)
    eligible_ids = get_certified_developers_for_mission(
        db=self.db, project_id=project_id, period_id=period.id,
        start_date=start_date.date(), end_date=end_date.date()
    )
    
    # Nettoyage des snapshots agrégés périmés
    self.db.query(KpiSnapshot).filter(
        KpiSnapshot.project_id   == project_id,
        KpiSnapshot.period_id    == period.id,
        KpiSnapshot.developer_id.is_(None),   # site, global et groupe uniquement
    ).delete(synchronize_session=False)
    
    # Élagage des snapshots de développeurs obsolètes (SCD Type 2 Rebalancing)
    self._prune_stale_developer_snapshots(project_id, period.id, eligible_ids)
    
    snapshots = []
    
    # Résolution des sites impactés pour cette période
    project_site_ids = self._get_project_site_ids(project_id, period.id)
    
    # 1. Snapshot par site du projet
    if project_site_ids:
        for site_id in project_site_ids:
            kpis = self.calculator.calculate_for_site(
                project_id, site_id, start_date, end_date, eligible_ids=eligible_ids
            )
            kpis["site_id"] = site_id
            snapshot = self._upsert_with_deltas(
                kpis=kpis, period_id=period.id,
                year=year, month=month, lot_id=lot_id,
            )
            snapshots.append(snapshot)
    
    # 2. Snapshot global
    global_kpis = self.calculator.calculate_global(project_id, start_date, end_date, eligible_ids=eligible_ids)
    global_kpis["site_id"]      = None
    global_kpis["developer_id"] = None
    global_snapshot = self._upsert_with_deltas(
        kpis=global_kpis, period_id=period.id,
        year=year, month=month, lot_id=lot_id,
    )
    snapshots.append(global_snapshot)
    
    # 3. Snapshot par groupe
    project_group_ids = self._get_project_group_ids(project_id, period.id)
    if project_group_ids:
        for group_id in project_group_ids:
            kpis = self.calculator.calculate_for_group(
                project_id, group_id, start_date, end_date, eligible_ids=eligible_ids
            )
            kpis["group_id"] = group_id
            snapshot = self._upsert_with_deltas(
                kpis=kpis, period_id=period.id,
                year=year, month=month, lot_id=lot_id,
            )
            snapshots.append(snapshot)
    
    # 4. Snapshot par développeur
    developers = self.db.query(Developer).filter(Developer.id.in_(eligible_ids)).all()
    
    for developer in developers:
        dev_kpis = self.calculator.calculate_for_developer(
            project_id=project_id, developer_id=developer.id,
            start_date=start_date, end_date=end_date, eligible_ids=eligible_ids
        )
        
        primary_site_id = self._get_primary_site_for_developer(developer.id, period_date=start_date.date())
        primary_group_id = self._get_primary_group_for_developer(developer.id, period_date=start_date.date())
        
        dev_kpis["site_id"]      = primary_site_id
        dev_kpis["group_id"]     = primary_group_id
        dev_kpis["developer_id"] = developer.id
        
        snapshot = self._upsert_with_deltas(
            kpis=dev_kpis, period_id=period.id,
            year=year, month=month, lot_id=lot_id,
            developer_id=developer.id,
        )
        snapshots.append(snapshot)
    
    return snapshots
```

**Logique**:
- **eligible_ids**: Liste des développeurs certifiés pour la période (SCD Type 2)
- **4 niveaux de snapshots**: Site, Global, Groupe, Développeur
- **Nettoyage automatique**: Supprime les snapshots obsolètes avant génération
- **SCD Type 2 Rebalancing**: Élimine les snapshots de devs qui ne correspondent plus à leur site actuel

---

## 🎯 ÉTAPE 5: Calcul Dynamique du Nombre de Développeurs

### Fichier: `src/backend/app/services/kpi/kpi_calculator.py`

**Objectif**: Calculer les KPIs avec un nombre de développeurs dynamique selon la période et les filtres

#### 5.1 calculate_project_kpis (lignes 96-171)
```python
def calculate_project_kpis(
    self,
    project_id:   int,
    start_date:   datetime,
    end_date:     datetime,
    site_id:      Optional[int] = None,
    group_id:     Optional[int] = None,
    developer_id: Optional[int] = None,
    eligible_ids: Optional[list] = None,
) -> dict:
    """
    Calcule les KPIs pour un projet avec filtres dynamiques.
    Le nombre de développeurs est calculé dynamiquement selon les filtres.
    """
    
    # 1. Volumes bruts
    nb_commits_project = self._count_all_project_commits(project_id, start_date, end_date, site_id=site_id)
    nb_devs            = self._count_developers(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    nb_commits_devs    = self._count_commits_by_devs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    nb_mrs             = self._count_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    nb_mrs_approved    = self._count_approved_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    nb_mrs_with_time   = self._count_approved_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids, with_time_only=True)
    nb_mrs_merged      = self._count_merged_mrs(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    sum_review_time    = self._sum_review_time(project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids)
    
    # 2. KPIs normalisés par le nombre de développeurs
    denom = max(nb_devs, 1)  # Évite la division par zéro
    
    mr_rate_per_site      = round(nb_mrs / denom, 4)           # MRs par développeur
    approved_mr_rate      = min(1.0, round(nb_mrs_approved / nb_mrs, 4)) if nb_mrs > 0 else 0.0
    merged_mr_rate        = min(1.0, round(nb_mrs_merged / nb_mrs_approved, 4)) if nb_mrs_approved > 0 else 0.0
    commit_rate_per_site  = round(nb_commits_devs / denom, 4)   # Commits par développeur
    avg_review_time_hours = round(sum_review_time / nb_mrs_with_time, 2) if nb_mrs_with_time > 0 else 0.0
    
    kpis = {
        "mr_rate_per_site":        mr_rate_per_site,      # MRs/dev
        "approved_mr_rate":        approved_mr_rate,
        "merged_mr_rate":          merged_mr_rate,
        "commit_rate_per_site":    commit_rate_per_site,  # Commits/dev
        "nb_commits_per_project":  nb_commits_project,
        "avg_review_time_hours":   avg_review_time_hours,
        "nb_developers":           nb_devs,               # Nombre de devs dynamique
        "total_commits":           nb_commits_devs,
        "total_mrs_created":       nb_mrs,
        "total_mrs_approved":      nb_mrs_approved,
        "total_mrs_merged":        nb_mrs_merged,
        "review_time_hours":       round(sum_review_time, 2),
        # ... autres KPIs
    }
    
    return kpis
```

**Logique**:
- **nb_devs**: Calculé dynamiquement selon les filtres (site, groupe, période)
- **Normalisation**: Les KPIs sont divisés par nb_devs pour obtenir des taux par développeur
- **Évite division par zéro**: `denom = max(nb_devs, 1)`

#### 5.2 _count_developers (lignes 259-274)
```python
def _count_developers(
    self, 
    project_id: int, 
    start_date: datetime,
    end_date: datetime,
    site_id: Optional[int] = None, 
    group_id: Optional[int] = None, 
    developer_id: Optional[int] = None,
    eligible_ids: Optional[list] = None
) -> int:
    """
    [SENIOR STRATEGY] Assigned Headcount (Full Squad).
    Compte tous les développeurs officiellement affectés au projet/site.
    Indispensable pour le pilotage de la capacité et du ROI.
    """
    # On utilise le helper d'ID qui gère déjà les filtres Project/Site/Group
    q = self._active_dev_ids_query(
        project_id, start_date, end_date, site_id, group_id, developer_id, eligible_ids
    )
    return q.count()
```

**Logique**:
- Utilise `_active_dev_ids_query` pour filtrer les développeurs
- Compte les développeurs selon les filtres (site, groupe, période)
- Applique SCD Type 2 pour vérifier les affectations temporelles

#### 5.3 _active_dev_ids_query (lignes 177-257)
```python
def _active_dev_ids_query(self, project_id: int, start_date: datetime, end_date: datetime, site_id: Optional[int], group_id: Optional[int], developer_id: Optional[int], eligible_ids: Optional[list] = None):
    """
    [SENIOR] Retourne les IDs de développeurs ASSIGNÉS pour cette période.
    Optimisé : Utilise une sous-requête SQL au lieu d'une liste d'IDs Python.
    """
    if eligible_ids is not None:
        # Si les IDs sont déjà matérialisés, on les utilise directement
        q = self.db.query(Developer.id).filter(
            Developer.id.in_(eligible_ids)
        )
    else:
        # Utilisation de get_certified_developers_query pour la mission
        from app.utils.mission_utils import get_certified_developers_query
        period = self.db.query(Period).filter(
            Period.year == start_date.year,
            Period.month == start_date.month
        ).first()
        
        threshold_date = get_rg02_threshold(start_date.year, start_date.month)
        
        subq = get_certified_developers_query(
            db=self.db, project_id=project_id, period_id=period.id if period else None,
            start_date=start_date.date(), end_date=end_date.date()
        ).subquery()
        
        q = self.db.query(Developer.id).distinct().filter(
            Developer.id.in_(select(subq.c.id)),
            # Respect strict des dates contractuelles RH + Règle des 15 jours
            or_(Developer.onboarding_date.is_(None), Developer.onboarding_date < end_date.date()),
            or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date)
        )
    
    # [STRICT TEMPORAL INTEGRITY] Respect strict des dates d'affectation (SCD Type 2)
    if site_id is not None:
        q = q.join(
            DeveloperSite,
            (DeveloperSite.developer_id == Developer.id)
        ).filter(
            DeveloperSite.site_id == site_id,
            DeveloperSite.start_date < end_date.date(),
            or_(DeveloperSite.end_date >= start_date.date(), DeveloperSite.is_active.is_(True))
        )
    
    if group_id is not None and developer_id is None:
        from app.models.developer_group import DeveloperGroupLink
        q = q.join(
            DeveloperGroupLink,
            (DeveloperGroupLink.developer_id == Developer.id) &
            (DeveloperGroupLink.group_id     == group_id) &
            (DeveloperGroupLink.start_date    <  end_date.date()) &
            ((DeveloperGroupLink.end_date    >= start_date.date()) | (DeveloperGroupLink.is_active.is_(True)))
        )
    
    if developer_id is not None:
        q = q.filter(Developer.id == developer_id)
    
    return q
```

**Logique**:
- **eligible_ids**: Si fourni, utilise directement (optimisation)
- **Mission**: Sinon, utilise `get_certified_developers_query` pour filtrer par mission
- **RH**: Applique les dates contractuelles + RG-02
- **SCD Type 2**: Vérifie que les segments de site/groupe couvrent la période

---

## 🎯 ÉTAPE 6: Scénarios Concrets de Dynamique

### Scénario 1: Mutation de Site avec KPIs Dynamiques

**Contexte**:
- Janvier 2026: 5 développeurs à Paris
- Mutation le 01/06/2026: 3 développeurs mutés à Lyon
- Juin 2026: 2 développeurs restent à Paris, 3 à Lyon

**Processus**:

#### 1. Gestion Développeurs (SCD Type 2)
```python
# Mutation Paris → Lyon pour dev_id=1, mutation_date=2026-06-01
dev_site_repo.sync_smart(
    developer_id=1,
    site_ids=[6],  # Lyon
    mutation_date=2026-06-01
)

# Résultat en base:
Table developer_site:
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 5 (Paris) | false | 2026-01-15 | 2026-05-31 |
| 1 | 6 (Lyon)  true  | 2026-06-01 | NULL          |
```

#### 2. Extraction by Team (Janvier 2026)
```python
# Extraction pour janvier 2026
auto_target_by_period = True
p_start = date(2026, 1, 1)
p_end = date(2026, 2, 1)

eligible_devs = DeveloperRepository().get_active_during_period(db, p_start, p_end)
# Résultat: 5 développeurs (tous à Paris en janvier)
```

#### 3. Calcul KPIs (Janvier 2026)
```python
# KpiAggregator.generate_monthly_snapshots(project_id=1, year=2026, month=1)
eligible_ids = get_certified_developers_for_mission(
    db, project_id=1, period_id=period_jan,
    start_date=date(2026, 1, 1), end_date=date(2026, 2, 1)
)
# Résultat: 5 développeurs éligibles

# KpiCalculator.calculate_for_site(project_id=1, site_id=5, ...)
nb_devs = _count_developers(project_id=1, site_id=5, ...)
# Résultat: nb_devs = 5

# KPIs calculés:
commit_rate_per_site = total_commits / 5  # Commits par dev
mr_rate_per_site = total_mrs / 5          # MRs par dev
```

#### 4. Extraction by Team (Juin 2026)
```python
# Extraction pour juin 2026
auto_target_by_period = True
p_start = date(2026, 6, 1)
p_end = date(2026, 7, 1)

eligible_devs = DeveloperRepository().get_active_during_period(db, p_start, p_end)
# Résultat: 5 développeurs (2 à Paris, 3 à Lyon en juin)
```

#### 5. Calcul KPIs (Juin 2026)
```python
# KpiAggregator.generate_monthly_snapshots(project_id=1, year=2026, month=6)
eligible_ids = get_certified_developers_for_mission(
    db, project_id=1, period_id=period_jun,
    start_date=date(2026, 6, 1), end_date=date(2026, 7, 1)
)
# Résultat: 5 développeurs éligibles

# KpiCalculator.calculate_for_site(project_id=1, site_id=5, ...)
nb_devs = _count_developers(project_id=1, site_id=5, ...)
# Résultat: nb_devs = 2 (seulement les 2 restés à Paris)

# KPIs Paris:
commit_rate_per_site = total_commits_paris / 2  # Commits par dev
mr_rate_per_site = total_mrs_paris / 2          # MRs par dev

# KpiCalculator.calculate_for_site(project_id=1, site_id=6, ...)
nb_devs = _count_developers(project_id=1, site_id=6, ...)
# Résultat: nb_devs = 3 (les 3 mutés à Lyon)

# KPIs Lyon:
commit_rate_per_site = total_commits_lyon / 3  # Commits par dev
mr_rate_per_site = total_mrs_lyon / 3          # MRs par dev
```

**Résultat**: Les KPIs de janvier sont calculés avec 5 devs à Paris, ceux de juin avec 2 devs à Paris et 3 devs à Lyon.

---

### Scénario 2: Suspension Temporaire avec KPIs Dynamiques

**Contexte**:
- Février 2026: 5 développeurs actifs
- Suspension dev_id=1 du 01/03/2026 au 31/03/2026 (congé)
- Mars 2026: 4 développeurs actifs (dev_id=1 suspendu)

**Processus**:

#### 1. Gestion Développeurs (Suspension)
```python
# Suspension dev_id=1, effect_date=2026-03-01
update_data = {"is_active": False}
developer_service.update(db, developer_id=1, update_data, mutation_date=date(2026, 3, 1))

# Résultat en base:
Table developer:
| id | is_active | offboarding_date |
|----|-----------|-----------------|
| 1  | false     | NULL            |

Table developer_site:
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 5 | false | 2026-01-15 | 2026-02-28 |
```

#### 2. Extraction by Team (Mars 2026)
```python
# Extraction pour mars 2026
auto_target_by_period = True
p_start = date(2026, 3, 1)
p_end = date(2026, 4, 1)

eligible_devs = DeveloperRepository().get_active_during_period(db, p_start, p_end)
# Résultat: 4 développeurs (dev_id=1 suspendu, donc non inclus)
```

#### 3. Calcul KPIs (Mars 2026)
```python
# KpiAggregator.generate_monthly_snapshots(project_id=1, year=2026, month=3)
eligible_ids = get_certified_developers_for_mission(
    db, project_id=1, period_id=period_mar,
    start_date=date(2026, 3, 1), end_date=date(2026, 4, 1)
)
# Résultat: 4 développeurs éligibles (dev_id=1 exclu car suspendu)

# KpiCalculator.calculate_global(project_id=1, ...)
nb_devs = _count_developers(project_id=1, ...)
# Résultat: nb_devs = 4

# KPIs calculés:
commit_rate_per_site = total_commits / 4  # Commits par dev (4 devs actifs)
mr_rate_per_site = total_mrs / 4          # MRs par dev (4 devs actifs)
```

#### 4. Réactivation (Avril 2026)
```python
# Réactivation dev_id=1, effect_date=2026-04-01
update_data = {"is_active": True}
developer_service.update(db, developer_id=1, update_data, mutation_date=date(2026, 4, 1))

# Résultat en base:
Table developer:
| id | is_active | offboarding_date |
|----|-----------|-----------------|
| 1  | true      | NULL            |

Table developer_site:
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 5 | false | 2026-01-15 | 2026-02-28 |
| 1 | 5 | true  | 2026-04-01 | NULL       |
```

#### 5. Calcul KPIs (Avril 2026)
```python
# KpiAggregator.generate_monthly_snapshots(project_id=1, year=2026, month=4)
eligible_ids = get_certified_developers_for_mission(
    db, project_id=1, period_id=period_avr,
    start_date=date(2026, 4, 1), end_date=date(2026, 5, 1)
)
# Résultat: 5 développeurs éligibles (dev_id=1 réactivé)

# KpiCalculator.calculate_global(project_id=1, ...)
nb_devs = _count_developers(project_id=1, ...)
# Résultat: nb_devs = 5

# KPIs calculés:
commit_rate_per_site = total_commits / 5  # Commits par dev (5 devs actifs)
mr_rate_per_site = total_mrs / 5          # MRs par dev (5 devs actifs)
```

**Résultat**: Les KPIs de mars sont calculés avec 4 devs (dev suspendu), ceux d'avril avec 5 devs (dev réactivé).

---

### Scénario 3: Offboarding (Archivage) avec RG-02

**Contexte**:
- Janvier 2026: 5 développeurs actifs
- Offboarding dev_id=1 le 10 janvier 2026
- Janvier 2026: Dev_id=1 compté ou non selon RG-02

**Processus**:

#### 1. Gestion Développeurs (Archivage)
```python
# Archivage dev_id=1, offboarding_date=2026-01-10
update_data = {"offboarding_date": date(2026, 1, 10), "is_active": False}
developer_service.update(db, developer_id=1, update_data)

# Résultat en base:
Table developer:
| id | is_active | offboarding_date |
|----|-----------|-----------------|
| 1  | false     | 2026-01-10     |
```

#### 2. Calcul KPIs (Janvier 2026) avec RG-02
```python
# KpiAggregator.generate_monthly_snapshots(project_id=1, year=2026, month=1)
eligible_ids = get_certified_developers_for_mission(
    db, project_id=1, period_id=period_jan,
    start_date=date(2026, 1, 1), end_date=date(2026, 2, 1)
)

# RG-02 Threshold:
threshold_date = get_rg02_threshold(2026, 1)  # 15 janvier 2026

# Dans get_certified_developers_query:
# or_(Developer.offboarding_date.is_(None), Developer.offboarding_date >= threshold_date)
# offboarding_date=2026-01-10 < threshold_date=2026-01-15
# Résultat: dev_id=1 NON inclus dans eligible_ids

# Résultat: 4 développeurs éligibles (dev_id=1 exclu car offboardé avant le 15)
```

#### 3. Calcul KPIs (Janvier 2026)
```python
# KpiCalculator.calculate_global(project_id=1, ...)
nb_devs = _count_developers(project_id=1, ...)
# Résultat: nb_devs = 4

# KPIs calculés:
commit_rate_per_site = total_commits / 4  # Commits par dev (4 devs éligibles)
mr_rate_per_site = total_mrs / 4          # MRs par dev (4 devs éligibles)
```

**Résultat**: Dev_id=1 n'est pas compté dans les KPIs de janvier car offboardé avant le 15 (RG-02).

---

## 🎯 ÉTAPE 7: Correction Rétroactive et Recalcul KPIs

### Fichier: `src/backend/app/services/admin/developer_service.py`

**Objectif**: Permettre de corriger des affectations passées et recalculer les KPIs historiques

#### 7.1 Détection Corrections Rétroactives (lignes 465-530)
```python
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

**Logique**:
- **Snapshot avant/après**: Compare l'état avant et après modification
- **Détection changements**: Identifie les champs modifiés (sites, projets, groupes)
- **Trigger recalcul**: Si changement détecté → recalcul des KPIs historiques

#### 7.2 Exemple Concret: Correction Mutation Passée

**Contexte**:
- Historique: Dev_id=1 était à Paris en janvier 2026
- Correction: Dev_id=1 était en fait à Lyon en janvier 2026
- Action: Modifier la mutation_date de 2026-06-01 à 2026-01-01

**Processus**:

#### 1. Correction de la Mutation
```python
# Correction: mutation_date=2026-01-01 au lieu de 2026-06-01
update_data = {"sites": [{"site_id": 6}], "mutation_date": date(2026, 1, 1)}
developer_service.update(db, developer_id=1, update_data)

# Résultat en base:
Table developer_site:
| developer_id | site_id | is_active | start_date | end_date |
|--------------|---------|-----------|------------|----------|
| 1 | 5 (Paris) | false | 2026-01-01 | 2026-12-31 | ← Ancien segment modifié
| 1 | 6 (Lyon)  true  | 2026-01-01 | NULL          | ← Nouveau segment créé
```

#### 2. Détection du Changement
```python
# Snapshot AVANT
sites_before = {5}  # Paris

# Snapshot APRÈS
sites_after = {6}   # Lyon

# Détection
changed_fields = ["sites"]
```

#### 3. Recalcul KPIs Historiques
```python
# KpiService.recalculate_historical_for_developer(db, developer_id=1, changed_fields=["sites"])
# Recalcule tous les snapshots KPIs pour dev_id=1
# De janvier 2026 à aujourd'hui
```

#### 4. Résultat KPIs (Janvier 2026)
```python
# Avant correction:
# KPIs janvier: nb_devs = 5 (Paris), commit_rate = total_commits / 5

# Après correction:
# KPIs janvier: nb_devs = 5 (Lyon), commit_rate = total_commits / 5
# Note: Le nombre de devs reste le même, mais le site change
```

**Résultat**: Les KPIs historiques sont recalculés automatiquement après la correction de la mutation.

---

## 🎯 ÉTAPE 8: Score Développeur (Intelligent)

### Fichier: `src/backend/app/services/kpi/kpi_calculator.py`

**Objectif**: Calculer un score composite pour chaque développeur, normalisé par le nombre de développeurs

#### 8.1 calculate_developer_score (lignes 48-90)
```python
def calculate_developer_score(self, kpis: dict, weights: Optional[dict] = None) -> float:
    """
    Score composite développeur normalisé (0.0 → 1.0).
    Stocké dans KpiSnapshot.developer_score.
    
    Formule pondérée :
      - commit_rate  (25%) : normalisé sur COMMIT_NORMALIZATION commits/mois
      - mr_rate      (25%) : normalisé sur MR_NORMALIZATION MRs/mois
      - approved_rate(30%) : taux d'approbation (déjà entre 0 et 1)
      - review_time  (20%) : score inverse sigmoïde — moins de temps = meilleur score
    """
    if weights is None:
        weights = {
            "commit_rate":   0.25,
            "mr_rate":       0.25,
            "approved_rate": 0.30,
            "review_time":   0.20,
        }
    
    commit_rate   = min(kpis.get("commit_rate_per_site", 0.0) / self.COMMIT_NORMALIZATION, 1.0)
    mr_rate       = min(kpis.get("mr_rate_per_site",    0.0) / self.MR_NORMALIZATION,     1.0)
    approved_rate = min(kpis.get("approved_mr_rate",    0.0),                             1.0)
    avg_review    = max(kpis.get("avg_review_time_hours", 0.0), 0.0)
    
    # Inactive developer should have 0 score
    if kpis.get("commit_rate_per_site", 0.0) == 0 and kpis.get("mr_rate_per_site", 0.0) == 0:
        return 0.0
    
    # Sigmoïde inverse : résistante aux valeurs aberrantes
    review_score = 1.0 / (1.0 + avg_review / self.REVIEW_REF_HOURS)
    
    score = (
        weights["commit_rate"]   * commit_rate   +
        weights["mr_rate"]       * mr_rate        +
        weights["approved_rate"] * approved_rate  +
        weights["review_time"]   * review_score
    )
    return round(max(0.0, min(1.0, score)), 4)
```

**Logique**:
- **Normalisation**: Les KPIs bruts sont normalisés (commits/mois, MRs/mois)
- **Pondération**: Chaque KPI a un poids (25%, 25%, 30%, 20%)
- **Score composite**: Combinaison pondérée des KPIs normalisés
- **Sigmoïde inverse**: Pour le temps de review (moins de temps = meilleur score)

#### 8.2 Normalization Thresholds (lignes 22-25)
```python
# Team-level normalization thresholds.
COMMIT_NORMALIZATION = 10.0   # commits/mois → score_commit = 1.0
MR_NORMALIZATION     = 5.0    # MRs/mois     → score_mr = 1.0
REVIEW_REF_HOURS     = 24.0   # heures → score_review = 0.5 (point d'inflexion)
```

**Exemple**:
- Développeur A: 15 commits/mois, 8 MRs/mois, 12h review
  - commit_rate = 15/10 = 1.0 (normalisé à 1.0)
  - mr_rate = 8/5 = 1.6 (normalisé à 1.0)
  - review_score = 1/(1+12/24) = 0.67
  - Score = 0.25*1.0 + 0.25*1.0 + 0.30*0.8 + 0.20*0.67 = 0.87

- Développeur B: 5 commits/mois, 2 MRs/mois, 48h review
  - commit_rate = 5/10 = 0.5
  - mr_rate = 2/5 = 0.4
  - review_score = 1/(1+48/24) = 0.33
  - Score = 0.25*0.5 + 0.25*0.4 + 0.30*0.6 + 0.20*0.33 = 0.47

---

## 🎯 ÉTAPE 9: Classement par Site (Intelligent)

### Fichier: `src/backend/app/services/kpi/kpi_aggregator.py`

**Objectif**: Classer les développeurs par site selon leur score

#### 9.1 Calcul du Classement (lignes 178-182)
```python
# Calcul du classement dans chaque site
for site_id, score_snapshot_list in dev_snapshots_by_site.items():
    sorted_list = sorted(score_snapshot_list, key=lambda x: x[0], reverse=True)
    for rank, (_, snap) in enumerate(sorted_list, start=1):
        snap.score_rank_in_site = rank
```

**Logique**:
- **dev_snapshots_by_site**: Dictionnaire site_id → [(score, snapshot)]
- **Tri**: Trie par score décroissant
- **Classement**: Attribue un rang à chaque développeur dans son site

**Exemple**:
```
Site Paris:
- Dev A: score=0.87, rank=1
- Dev B: score=0.75, rank=2
- Dev C: score=0.62, rank=3

Site Lyon:
- Dev D: score=0.91, rank=1
- Dev E: score=0.68, rank=2
```

---

## 🎓 Points Clés pour la Soutenance

### 1. Relation Gestion Dev ↔ Extraction ↔ KPIs
- **SCD Type 2**: Historisation complète des affectations (site, groupe, projet)
- **Smart-Sync**: Extraction intelligente des développeurs actifs pour la période
- **KPIs Dynamiques**: Calculés avec le nombre de développeurs réel de la période
- **Correction Rétroactive**: Possibilité de corriger et recalculer les KPIs historiques

### 2. Dynamique du Nombre de Développeurs
- **_count_developers**: Compte les développeurs selon filtres (site, groupe, période)
- **SCD Type 2**: Vérifie que les segments d'affectation couvrent la période
- **RG-02**: Règle des 15 jours pour les offboardings
- **Normalisation**: Les KPIs sont divisés par nb_devs pour obtenir des taux par développeur

### 3. Intelligence Temporelle
- **eligible_ids**: Liste des développeurs certifiés pour la période
- **get_certified_developers_query**: Filtre par mission + RH + SCD Type 2
- **_active_dev_ids_query**: Optimisation SQL pour éviter les listes Python
- **Cache**: Mise en cache des requêtes pour éviter la reconstruction

### 4. Scénarios de Gestion
- **Mutation**: Changement de site/groupe/projet avec historisation
- **Suspension**: Désactivation temporaire (congé, formation)
- **Archivage**: Sortie définitive (offboarding)
- **Correction**: Modification d'affectations passées avec recalcul KPIs

### 5. KPIs Calculés
- **commit_rate_per_site**: Commits par développeur
- **mr_rate_per_site**: MRs par développeur
- **approved_mr_rate**: Taux d'approbation
- **avg_review_time_hours**: Temps moyen de review
- **developer_score**: Score composite (0.0 → 1.0)

---

## 🚀 Conclusion

Le système de gestion des développeurs est intégré de bout en bout avec l'extraction by team et le calcul des KPIs:

1. **Gestion Développeurs (SCD Type 2)**: Historisation complète des affectations
2. **Extraction by Team (Smart-Sync)**: Sélection intelligente des développeurs actifs
3. **Calcul KPIs (Dynamique)**: KPIs calculés avec nb_devs dynamique
4. **Intelligence Temporelle**: KPIs adaptés aux mutations passées
5. **Correction Rétroactive**: Possibilité de corriger et recalculer

Chaque opération de gestion (création, mutation, suspension, archivage) impacte automatiquement les KPIs futurs et passés grâce à l'historisation SCD Type 2.
