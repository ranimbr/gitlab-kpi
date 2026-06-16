# Seuils Dynamiques pour l'Intelligence Statistique

## Vue d'ensemble

Le système d'intelligence statistique utilise désormais des **seuils dynamiques basés sur les percentiles** au lieu de seuils hardcodés. Cela permet une adaptation automatique aux spécificités de chaque projet et de chaque équipe.

## Architecture

### Composants

1. **PercentileCalculator** (`app/services/intelligence/percentile_calculator.py`)
   - Calcule les percentiles Q1 (25ème) et Q3 (75ème) pour chaque métrique
   - Basé sur 6 mois d'historique par projet
   - Exclut le mois en cours (données incomplètes)
   - Fallback sur les seuils hardcodés si < 3 périodes de données

2. **TrendAnalyzer** (`app/services/intelligence/trend_analyzer.py`)
   - Utilise les seuils dynamiques calculés par PercentileCalculator
   - Initialise avec `db` et `project_id` pour le contexte
   - Applique les seuils dans `_detect_trend_alerts()` et `_generate_rh_recommendations()`

3. **IntelligenceService** (`app/services/intelligence/intelligence_service.py`)
   - Initialise TrendAnalyzer avec le contexte du projet
   - Orchestre le calcul des seuils dynamiques

## Stratégie de Calcul

### Portée

Les percentiles sont calculés **par projet** (tous sites confondus), pas par site individuel.

**Pourquoi ?**
- Permet la comparaison inter-sites sur le même projet
- Identifie les sites qui performent mal RELATIVEMENT aux autres
- Évite les biais pour les petits sites (1-2 développeurs)

### Période Historique

- **6 mois** d'historique
- Exclut le mois en cours (données incomplètes)
- Minimum de **1 période** requise pour utiliser les percentiles (réduit de 3 pour permettre le calcul avec moins de données)

### Percentiles Utilisés

| Métrique | Seuil | Percentile | Logique |
|----------|-------|------------|---------|
| Velocity (MRs/dev) | Bas | Q1 (25ème) | Sites en dessous du 25ème percentile sont considérés lents |
| Review Time (heures) | Haut | Q3 (75ème) | Sites au-dessus du 75ème percentile ont des goulots |
| Quality (approbation) | Bas | Q1 (25ème) | Sites en dessous du 25ème percentile ont des problèmes de qualité |

### Fallbacks

Si pas assez de données (< 1 période), les seuils hardcodés sont utilisés :
- `VELOCITY_LOW_THRESHOLD = 1.0` MRs/dev
- `REVIEW_TIME_HIGH_THRESHOLD = 48.0` heures
- `QUALITY_LOW_THRESHOLD = 0.5` (50%)

## Exemples d'Utilisation

### Scénario 1 : Projet avec suffisamment de données

```
Projet A (6 mois de données) :
- Velocity : [1.2, 1.5, 1.8, 2.0, 2.2, 2.5] → Q1 = 1.5
- Review Time : [24, 28, 32, 36, 40, 48] → Q3 = 40
- Quality : [0.6, 0.65, 0.7, 0.75, 0.8, 0.85] → Q1 = 0.65

Seuils dynamiques :
- velocity_low = 1.5 (au lieu de 1.0)
- review_time_high = 40 (au lieu de 48)
- quality_low = 0.65 (au lieu de 0.5)
```

### Scénario 2 : Nouveau projet avec peu de données

```
Projet B (0 mois de données) :
- Périodes disponibles = 0 < 1

Seuils utilisés (fallback) :
- velocity_low = 1.0
- review_time_high = 48.0
- quality_low = 0.5
```

## Avantages

1. **Adaptation automatique** : Chaque projet a ses propres seuils basés sur sa réalité
2. **Comparaison équitable** : Les sites sont comparés relativement à leur projet
3. **Réduction des faux positifs** : Les seuils s'adaptent aux spécificités de chaque équipe
4. **Maintenance réduite** : Plus besoin d'ajuster manuellement les seuils

## Monitoring

Les logs indiquent quand les seuils dynamiques sont utilisés :

```
INFO - Seuils dynamiques calculés pour le projet 1: velocity_low=1.50, review_high=40.00, quality_low=0.65 (basé sur 6 périodes)
```

Ou quand les fallbacks sont utilisés :

```
INFO - Pas assez de périodes pour le projet 2: 0 < 1. Utilisation des fallbacks.
```

## Tests

Les tests unitaires sont dans `tests/unit/test_percentile_calculator.py` :
- Test avec suffisamment de données
- Test avec insuffisamment de données (fallback)
- Test du calcul de percentile avec différentes valeurs
- Test de l'exclusion des zéros

## Évolutions Futures

**Phase 2** (optionnel) :
- Exclure les outliers statistiques du calcul des percentiles
- Ajuster la période historique selon la taille du projet
- Permettre la configuration par projet des percentiles (Q1/Q2/Q3)
