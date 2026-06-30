# Calcul des Scores de Santé - Intelligence Fab

## Résumé Exécutif

Ce document explique en détail comment le **score de santé (0-100)** est calculé pour chaque site/équipe dans le module d'intelligence statistique.

**Point clé** : Ce n'est PAS de l'IA, c'est une **formule mathématique déterministe** basée sur des règles métier explicites.

---

## Formule de Calcul du Score

### Décomposition du Score (Total 100 points)

```
Score = Vélocité (30 pts) + Qualité (30 pts) + Review Time (25 pts) + Tendances (15 pts)
```

### 1. Vélocité - 30 points maximum

**Formule** :
```python
vel_score = min(30, (velocity / 3.0) * 30)
```

**Logique** :
- Vélocité idéale : 3.0 MRs/dev = 30 points
- Vélocité 0 MRs/dev = 0 points
- Plafonné à 30 points (pas de bonus au-delà de 3.0)

**Exemples** :
- 4.0 MRs/dev → (4.0 / 3.0) × 30 = 40 → min(30, 40) = **30 pts**
- 2.0 MRs/dev → (2.0 / 3.0) × 30 = 20 → **20 pts**
- 0.0 MRs/dev → (0.0 / 3.0) × 30 = 0 → **0 pts**

---

### 2. Qualité - 30 points maximum

**Formule** :
```python
qual_score = quality * 30
```

**Logique** :
- Qualité = taux d'approbation (0.0 à 1.0)
- 100% d'approbation = 30 points
- 0% d'approbation = 0 points

**Exemples** :
- 100% (1.0) → 1.0 × 30 = **30 pts**
- 80% (0.8) → 0.8 × 30 = **24 pts**
- 0% (0.0) → 0.0 × 30 = **0 pts**

---

### 3. Review Time - 25 points maximum

**Formule** :
```python
rev_score = max(0.0, 25 - (review_time / 100.0) * 25)
```

**Logique** :
- Temps de revue idéal : 0h = 25 points
- Temps de revue 100h = 0 points
- Planché à 0 (pas de score négatif)

**Exemples** :
- 0h → 25 - (0/100) × 25 = **25 pts**
- 50h → 25 - (50/100) × 25 = 12.5 → **12.5 pts**
- 81.4h → 25 - (81.4/100) × 25 = 4.65 → **4.65 pts**
- 100h+ → 25 - (100/100) × 25 = 0 → **0 pts**

---

### 4. Tendances - 15 points (bonus/malus)

**Formule** :
```python
trend_score = 5  # baseline

# Bonus vélocité
if vel_trend == "improving":
    trend_score += 5
elif vel_trend == "declining":
    trend_score -= 5 * min(3, consecutive_declining)

# Bonus qualité
if qual_trend == "improving":
    trend_score += 5
elif qual_trend == "declining":
    trend_score -= 5

# Plancher à 0, plafond à 15
trend_score = max(0, min(15, trend_score))
```

**Logique** :
- Baseline : 5 points
- Vélocité en amélioration : +5 points
- Vélocité en déclin : -5 × nombre de mois (max -15)
- Qualité en amélioration : +5 points
- Qualité en déclin : -5 points

**Exemples** :
- Amélioration vélocité + amélioration qualité : 5 + 5 + 5 = **15 pts**
- Stable vélocité + stable qualité : 5 + 0 + 0 = **5 pts**
- Déclin vélocité (2 mois) + déclin qualité : 5 - 10 - 5 = **0 pts**

---

## Application aux Cas Réels

### Cas 1 : Tunis (Score 75/100)

**Données** :
- Vélocité : 4.0 MRs/dev (+33.3%)
- Review Time : 81.4h (-71.4%)
- Qualité : 100%
- Tendance vélocité : improving (+33.3%)
- Tendance review : improving (-71.4% = amélioration)
- Tendance qualité : stable (0%)

**Calcul** :
```
1. Vélocité : min(30, (4.0 / 3.0) × 30) = 30 pts
2. Qualité : 1.0 × 30 = 30 pts
3. Review Time : 25 - (81.4 / 100) × 25 = 4.65 pts
4. Tendances : 
   - Baseline = 5
   - Vélocité improving = +5
   - Review improving (non compté dans trend_score actuel)
   - Qualité stable = 0
   - Total = 10 pts

Score total = 30 + 30 + 4.65 + 10 = 74.65 → 75/100
```

**Note** : Le score de 75/100 correspond parfaitement au calcul.

---

### Cas 2 : Paris (Score 30/100)

**Données** :
- Vélocité : 0.0 MRs/dev (0%)
- Review Time : 0.0h (0%)
- Qualité : 0% (0%)
- Tendances : stable (0% pour tout)

**Calcul** :
```
1. Vélocité : min(30, (0.0 / 3.0) × 30) = 0 pts
2. Qualité : 0.0 × 30 = 0 pts
3. Review Time : 25 - (0.0 / 100) × 25 = 25 pts
4. Tendances : 
   - Baseline = 5
   - Vélocité stable = 0
   - Qualité stable = 0
   - Total = 5 pts

Score total = 0 + 0 + 25 + 5 = 30/100
```

**Note** : Le score de 30/100 correspond parfaitement au calcul.

**Interprétation** :
- Paris a 0 vélocité et 0 qualité → très critique
- Mais review time à 0h → 25 points (car pas de goulot)
- Score 30/100 = situation critique malgré le review time

---

## Classification des Scores

| Score | Classification | Couleur | Action |
|-------|--------------|---------|--------|
| 80-100 | Excellent | Vert | Maintenir |
| 60-79 | Bon | Vert clair | Surveiller |
| 40-59 | Moyen | Orange | Améliorer |
| 20-39 | Critique | Rouge | Action requise |
| 0-19 | Très critique | Rouge foncé | Action immédiate |

---

## Pourquoi cette Formule ?

### 1. Équilibre des Dimensions

**30% Vélocité** :
- Productivité = nombre de MRs livrées
- Essentiel pour la livraison

**30% Qualité** :
- Taux d'approbation = qualité du code
- Essentiel pour éviter les bugs

**25% Review Time** :
- Temps de revue = efficacité du processus
- Important mais moins critique que vélocité/qualité

**15% Tendances** :
- Évolution dans le temps = bonus/malus
- Encourage l'amélioration continue

### 2. Plafonnements et Planchers

**Pourquoi plafonner à 30 pour la vélocité ?**
- Évite de sur-valoriser les équipes très productives
- Focus sur l'équilibre plutôt que l'excès

**Pourquoi plancher à 0 ?**
- Pas de score négatif
- Minimum 0/100 = échec total possible

### 3. Sensibilité aux Tendances

**Pourquoi -5 par mois de déclin ?**
- Pénalité progressive
- Maximum -15 (3 mois) = significatif mais pas rédhibitoire

**Pourquoi +5 pour amélioration ?**
- Encourage l'amélioration continue
- Bonus limité pour éviter l'inflation

---

## Détection des Tendances

### Direction de Tendance

**Calcul** :
```python
delta_pct = ((dernière_valeur - première_valeur) / première_valeur) * 100

if delta_pct <= -10:  direction = "declining"
elif delta_pct >= 10:  direction = "improving"
else:                  direction = "stable"
```

**Exemples** :
- 4.0 → 3.0 : (3.0 - 4.0) / 4.0 × 100 = -25% → declining
- 2.0 → 4.0 : (4.0 - 2.0) / 2.0 × 100 = +100% → improving
- 3.0 → 3.2 : (3.2 - 3.0) / 3.0 × 100 = +6.7% → stable

### Mois Consécutifs en Déclin

**Calcul** :
```python
consecutive_declining = 0
for i in range(len(values) - 1, 0, -1):
    if values[i] < values[i-1]:
        consecutive_declining += 1
    else:
        break
```

**Exemple** :
- Valeurs : [4.0, 3.5, 3.0, 2.5]
- Décompte : 2.5 < 3.0 (oui), 3.0 < 3.5 (oui), 3.5 < 4.0 (oui)
- consecutive_declining = 3

---

## Interprétation des Scores

### Score 75/100 (Tunis) - Excellent

**Forces** :
- Vélocité très élevée (4.0 MRs/dev)
- Qualité parfaite (100%)
- Tendances positives

**Faiblesses** :
- Review time élevé (81.4h) → goulot potentiel
- Mais en amélioration (-71.4%)

**Actions** :
- Maintenir la vélocité et qualité
- Optimiser le processus de revue (asynchrone ?)
- Partager les bonnes pratiques

### Score 30/100 (Paris) - Critique

**Forces** :
- Aucune force identifiée

**Faiblesses** :
- Vélocité nulle (0.0 MRs/dev)
- Qualité nulle (0%)
- Pas d'amélioration

**Actions** :
- Investigation prioritaire
- Recrutement ou redistribution
- Formation ciblée
- Support technique

---

## Recommandations Générées

### Règle 1 : Qualité Critique

```python
if quality < seuil_dynamique_quality:
    recommandation = "RH · Formation / Mutation"
    message = "Taux d'approbation critique. Identifier les profils en difficulté."
```

**Cas Paris** :
- quality = 0% < seuil (ex: 50%)
- → Recommandation RH formation/mutation

### Règle 2 : Vélocité Faible

```python
if velocity < seuil_dynamique_velocity:
    recommandation = "RH · Recrutement"
    message = "Vélocité faible. Envisager recrutement ou redistribution."
```

**Cas Paris** :
- velocity = 0.0 < seuil (ex: 1.5)
- → Recommandation RH recrutement

### Règle 3 : Best Practice Sharing

```python
if best_score - worst_score >= 20:
    recommandation = "Best Practice · Transfert"
    message = "Écart significatif. Organiser partage entre sites."
```

**Cas Tunis vs Paris** :
- 75 - 30 = 45 ≥ 20
- → Recommandation partage de bonnes pratiques

---

## Points Clés à Communiquer

### ✅ Ce que c'est
- **Formule mathématique explicite**
- **Règles métier documentées**
- **Calcul déterministe** (mêmes données = même score)
- **100% transparent** et justifiable

### ❌ Ce que ce n'est PAS
- **Pas d'IA** ni de machine learning
- **Pas de boîte noire**
- **Pas d'apprentissage automatique**
- **Pas de "magie"**

### 🎯 Pourquoi cette approche
- **Adaptée au volume de données** (3,000 snapshots)
- **Justifiable pour RH/Legal**
- **Modifiable selon les besoins métier**
- **Coût de maintenance minimal**

---

## Référence Technique

**Fichier source** : `dataCollection/src/backend/app/services/intelligence/trend_analyzer.py`

**Méthode** : `_compute_health_score()` (lignes 359-406)

**Code** :
```python
def _compute_health_score(
    self,
    velocity: float,
    review_time: float,
    quality: float,
    vel_trend: Dict,
    rev_trend: Dict,
    qual_trend: Dict,
) -> int:
    score = 0

    # Vélocité (30 pts)
    vel_score = min(30, (velocity / 3.0) * 30)
    score += vel_score

    # Qualité (30 pts)
    qual_score = quality * 30
    score += qual_score

    # Review time (25 pts)
    rev_score = max(0.0, 25 - (review_time / 100.0) * 25)
    score += rev_score

    # Bonus/malus tendances (15 pts)
    trend_score = 0
    if vel_trend["direction"] == "improving":
        trend_score += 5
    elif vel_trend["direction"] == "declining":
        trend_score -= 5 * min(3, vel_trend["consecutive_declining"])

    if qual_trend["direction"] == "improving":
        trend_score += 5
    elif qual_trend["direction"] == "declining":
        trend_score -= 5

    trend_score += 5  # baseline
    score += max(0, min(15, trend_score))

    return max(0, min(100, round(score)))
```

---


**Date** : 12 juin 2026  
**Auteur** : Équipe technique Dashboard KPI  
**Version** : 1.0
