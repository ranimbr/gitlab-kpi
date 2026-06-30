# Rapport de Vérification - ExtractionByTeam (Extraction par Équipe)

## Date de vérification
22 juin 2026

## Fichiers analysés
1. `dataCollection/src/frontend/src/pages/ExtractionByTeamTab.jsx` (Frontend)
2. `dataCollection/src/backend/app/api/routers/extraction.py` (Backend - endpoints `/simulate-team` et `/run`)
3. `dataCollection/src/backend/app/utils/mission_utils.py` (Logique de mission)

---

## Vue d'ensemble du Flux ExtractionByTeam

```
Utilisateur (Navigateur)
    ↓
Frontend : ExtractionByTeamTab.jsx
    ↓
Backend : api/routers/extraction.py
    ↓
Endpoint 1 : POST /extraction/simulate-team (Simulation)
    ↓
Endpoint 2 : POST /extraction/run (Extraction réelle)
    ↓
Backend : services/extraction/extraction_service.py (_background_extraction)
    ↓
Backend : utils/mission_utils.py (get_certified_developers_for_mission)
    ↓
GitLab API (récupération commits + MRs)
    ↓
PostgreSQL (sauvegarde commits + MRs)
```

---

## Problèmes Identifiés

### 🔴 CRITIQUE #1: Paramètre `all_developers` non utilisé dans le backend

**Fichier:** `extraction.py` (Backend)
**Lignes:** 1257 (réception du paramètre)

**Problème:**
Le paramètre `all_developers` est envoyé depuis le frontend mais n'est PAS utilisé dans la logique du backend.

**Code Frontend (ExtractionByTeamTab.jsx ligne 255):**
```javascript
all_developers: (isSmartSync && !selectedSite && !selectedGroup) ? true : false,
```

**Code Backend (extraction.py ligne 1257):**
```python
async def run_extraction_by_team(
    ...
    all_developers: bool = False,  # ✅ Paramètre reçu
    ...
):
    # ❌ Le paramètre all_developers n'est PAS utilisé dans la logique
    dev_query = db.query(Developer).filter(Developer.is_active.is_(True), Developer.is_validated.is_(True))
    # ...
```

**Impact:**
- Le paramètre `all_developers` est ignoré
- La logique Smart-Sync ne fonctionne pas comme prévu
- Le filtrage des développeurs ne respecte pas l'intention du frontend

**Recommandation:**
Utiliser le paramètre `all_developers` pour modifier la logique de filtrage:
```python
if not all_developers:
    dev_query = dev_query.filter(Developer.is_active.is_(True), Developer.is_validated.is_(True))
```

---

### 🟡 MOYEN #2: Incohérence dans le filtrage des développeurs entre Frontend et Backend

**Fichiers:** 
- `ExtractionByTeamTab.jsx` (Frontend) ligne 66
- `extraction.py` (Backend) ligne 1187
- `mission_utils.py` ligne 102

**Problème:**
Le frontend utilise le paramètre `tab: "extraction"` pour charger les développeurs, mais le backend applique des filtres différents (`is_active`, `is_validated`) qui ne sont pas appliqués dans `get_certified_developers_for_mission`.

**Code Frontend (ExtractionByTeamTab.jsx ligne 66):**
```javascript
api.get("/developers", { params: { tab: "extraction", period_id: selectedPeriod || undefined } })
```

**Code Backend (extraction.py ligne 1187):**
```python
dev_query = db.query(Developer).filter(Developer.is_active.is_(True), Developer.is_validated.is_(True))
```

**Code Mission Utils (mission_utils.py ligne 102):**
```python
# ❌ PAS de filtre sur is_active ou is_validated
.filter(
    Developer.is_bot.is_(False),
    # ...
)
```

**Impact:**
- Incohérence entre la liste affichée dans le frontend et les développeurs réellement extraits
- Les développeurs inactifs ou non validés peuvent apparaître dans la liste mais ne seront pas extraits
- Confusion pour l'utilisateur

**Recommandation:**
Ajouter les filtres `is_active` et `is_validated` dans `get_certified_developers_query` pour garantir la cohérence:
```python
.filter(
    Developer.is_bot.is_(False),
    Developer.is_active.is_(True),      # ✅ AJOUTER
    Developer.is_validated.is_(True),  # ✅ AJOUTER
    # ...
)
```

---

### 🟡 MOYEN #3: Double logique Smart-Sync (confusion entre `is_smart_sync` et `auto_target_by_period`)

**Fichiers:**
- `ExtractionByTeamTab.jsx` lignes 256, 260
- `extraction.py` lignes 1284, 1201

**Problème:**
Le frontend envoie deux paramètres (`is_smart_sync` et `auto_target_by_period`) qui semblent avoir la même fonctionnalité, créant une confusion sur la logique appliquée.

**Code Frontend (ExtractionByTeamTab.jsx):**
```javascript
is_smart_sync: isSmartSync,           // Ligne 256
auto_target_by_period: isSmartSync    // Ligne 260 (même valeur)
```

**Code Backend (extraction.py ligne 1284):**
```python
if (is_smart_sync or auto_target_by_period) and period:
    # ❌ Les deux paramètres sont traités comme identiques
    _, _, p_start, p_end = build_period_window(period)
    eligible_devs = DeveloperRepository().get_active_during_period(db, p_start.date(), p_end.date())
```

**Impact:**
- Redondance inutile
- Confusion sur la logique métier
- Difficulté de maintenance

**Recommandation:**
Unifier les paramètres en un seul (`auto_target_by_period`) ou clarifier la différence entre les deux:
- `is_smart_sync`: Activation du mode Smart-Sync dans l'UI
- `auto_target_by_period`: Application réelle de la logique RH dans le backend

---

### 🟡 MOYEN #4: Duplication de code (violation DRY) dans le filtrage des projets

**Fichiers:**
- `extraction.py` lignes 1226-1236 (endpoint `/simulate-team`)
- `extraction.py` lignes 1308-1317 (endpoint `/run`)

**Problème:**
La logique de filtrage des projets par période vs persistant est dupliquée dans les deux endpoints, violant le principe DRY (Don't Repeat Yourself).

**Code Dupliqué (extraction.py):**
```python
# Dans /simulate-team (ligne 1226)
if period:
    project_query = project_query.filter(
        or_(
            DeveloperProject.period_id == period.id,
            and_(
                DeveloperProject.period_id.is_(None),
                or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
                or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_p)
            )
        )
    )

# Dans /run (ligne 1308) - MÊME LOGIQUE
project_query = project_query.filter(
    or_(
        DeveloperProject.period_id == period.id,
        and_(
            DeveloperProject.period_id.is_(None),
            or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
            or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_p)
        )
    )
)
```

**Impact:**
- Maintenance difficile (deux endroits à modifier)
- Risque d'incohérence si un endpoint est modifié mais pas l'autre
- Code moins lisible

**Recommandation:**
Extraire cette logique dans une fonction utilitaire:
```python
def filter_projects_by_period(query, period, start_p, end_p):
    return query.filter(
        or_(
            DeveloperProject.period_id == period.id,
            and_(
                DeveloperProject.period_id.is_(None),
                or_(DeveloperProject.start_date.is_(None), DeveloperProject.start_date <= end_p),
                or_(DeveloperProject.end_date.is_(None), DeveloperProject.end_date >= start_p)
            )
        )
    )
```

---

### 🟢 MINEUR #5: Paramètre `eligible_ids` utilisé correctement mais pas documenté

**Fichiers:**
- `extraction.py` ligne 1338
- `mission_utils.py` lignes 121-122

**Statut:** ✅ Fonctionne correctement

**Observation:**
Le paramètre `eligible_ids` est passé correctement à `get_certified_developers_for_mission` et utilisé dans `get_certified_developers_query`.

**Code:**
```python
# extraction.py ligne 1338
project_target_ids = get_certified_developers_for_mission(
    db, project_id=project.id, period_id=period.id, eligible_ids=target_dev_ids
)

# mission_utils.py lignes 121-122
if eligible_ids:
    query = query.filter(Developer.id.in_(eligible_ids))
```

**Recommandation:**
Ajouter un commentaire documentant ce paramètre pour clarifier son usage.

---

## Points Positifs

### ✅ Bonnes pratiques identifiées

1. **Polling intelligent (ExtractionByTeamTab.jsx lignes 114-152):**
   - Polling parallèle pour plus de réactivité
   - Gestion propre de l'état de chargement
   - Nettoyage correct des timers

2. **Filtrage contextuel des projets (ExtractionByTeamTab.jsx lignes 211-233):**
   - Tri intelligent des projets (sélectionnés > personnel > équipe > reste)
   - Calcul dynamique des projets pertinents
   - Bonne expérience utilisateur

3. **Simulation avant extraction (extraction.py ligne 1174):**
   - Endpoint `/simulate-team` permet d'estimer l'impact avant extraction
   - Évite les extractions inutiles ou trop lourdes

4. **Isolation stricte par projet (extraction.py lignes 1336-1343):**
   - Filtrage des développeurs certifiés spécifiquement pour chaque projet
   - Évite d'envoyer la liste globale de l'équipe à chaque tâche projet

5. **Gestion des erreurs robuste:**
   - Try/catch dans les appels API
   - Messages d'erreur clairs
   - Logging détaillé

---

## Recommandations Prioritaires

### 🔴 Priorité 1 (Critique)
1. **Corriger l'utilisation du paramètre `all_developers`** dans `extraction.py` ligne 1257
2. **Ajouter les filtres `is_active` et `is_validated`** dans `get_certified_developers_query` (mission_utils.py)

### 🟡 Priorité 2 (Moyenne)
3. **Unifier les paramètres Smart-Sync** (`is_smart_sync` vs `auto_target_by_period`)
4. **Extraire la logique de filtrage des projets** dans une fonction utilitaire

### 🟢 Priorité 3 (Mineure)
5. **Documenter le paramètre `eligible_ids`** dans `mission_utils.py`

---

## Conclusion

Le code d'extraction par équipe est globalement bien structuré et fonctionnel, mais présente quelques incohérences et problèmes de maintenance qui devraient être corrigés pour garantir la cohérence entre le frontend et le backend, et faciliter la maintenance future.

Les problèmes critiques (#1 et #2) devraient être corrigés immédiatement car ils affectent directement la fonctionnalité et l'expérience utilisateur.
