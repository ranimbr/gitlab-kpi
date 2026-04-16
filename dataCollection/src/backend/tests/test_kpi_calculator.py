"""
tests/test_kpi_calculator.py

Tests unitaires pour KpiCalculator.calculate_developer_score().

COUVERTURE :
    1. Score toujours borné entre 0.0 et 1.0 (propriété fondamentale)
    2. Développeur inactif → score = 0.0
    3. Développeur parfait (théorique) → score proche de 1.0
    4. Temps de review rapide → meilleur score
    5. Aucune MR approuvée → approved_rate = 0.0 (pas de division par zéro)
    6. Poids personnalisés respectés

Run : pytest tests/test_kpi_calculator.py -v
"""
import pytest
from unittest.mock import MagicMock

from app.services.kpi.kpi_calculator import KpiCalculator


# ── Fixture ─────────────────────────────────────────────────────────────────

@pytest.fixture
def calculator():
    """Calculateur avec session DB mockée (aucune vraie requête exécutée)."""
    mock_db = MagicMock()
    return KpiCalculator(db=mock_db)


# ── Tests fondamentaux ───────────────────────────────────────────────────────

class TestCalculateDeveloperScore:

    def test_score_always_between_0_and_1_inactive_dev(self, calculator):
        """Un dev inactif (tout à 0) doit avoir un score de 0.0 exactement."""
        kpis = {
            "commit_rate_per_site": 0.0,
            "mr_rate_per_site":     0.0,
            "approved_mr_rate":     0.0,
            "avg_review_time_hours": 0.0,
        }
        score = calculator.calculate_developer_score(kpis)
        assert score == 0.0, f"Score attendu 0.0, obtenu {score}"

    def test_score_upper_bound_never_exceeds_1(self, calculator):
        """Même avec des valeurs extrêmes, le score ne dépasse jamais 1.0."""
        kpis = {
            "commit_rate_per_site":  999.0,   # complètement hors norme
            "mr_rate_per_site":      999.0,
            "approved_mr_rate":      2.0,     # valeur invalide mais doit être clampée
            "avg_review_time_hours": 0.0,     # review instantanée → review_score = 1.0
        }
        score = calculator.calculate_developer_score(kpis)
        assert 0.0 <= score <= 1.0, f"Score hors bornes: {score}"

    def test_perfect_developer_score_near_1(self, calculator):
        """Dev parfait : 10+ commits, 5+ MRs, 100% approuvées, review immédiate."""
        kpis = {
            "commit_rate_per_site":  10.0,  # normalisé à 1.0 (seuil = 10)
            "mr_rate_per_site":       5.0,  # normalisé à 1.0 (seuil = 5)
            "approved_mr_rate":       1.0,  # 100% approuvées
            "avg_review_time_hours":  0.0,  # review instantanée
        }
        score = calculator.calculate_developer_score(kpis)
        assert score == 1.0, f"Score parfait attendu 1.0, obtenu {score}"

    def test_faster_review_gives_higher_score(self, calculator):
        """Un dev qui review plus vite doit avoir un meilleur score."""
        base_kpis = {
            "commit_rate_per_site":  5.0,
            "mr_rate_per_site":      2.0,
            "approved_mr_rate":      0.8,
        }
        score_fast = calculator.calculate_developer_score({**base_kpis, "avg_review_time_hours": 1.0})
        score_slow = calculator.calculate_developer_score({**base_kpis, "avg_review_time_hours": 72.0})
        assert score_fast > score_slow, (
            f"Review rapide devrait donner un score supérieur: {score_fast} > {score_slow}"
        )

    def test_no_division_by_zero_zero_mrs(self, calculator):
        """Zéro MR → pas de division par zéro, score calculé normalement."""
        kpis = {
            "commit_rate_per_site":  3.0,
            "mr_rate_per_site":      0.0,
            "approved_mr_rate":      0.0,  # 0/0 = 0 (géré en amont)
            "avg_review_time_hours": 0.0,
        }
        # Ne doit PAS lever ZeroDivisionError
        score = calculator.calculate_developer_score(kpis)
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0

    def test_missing_keys_use_default_zero(self, calculator):
        """Les clés manquantes sont traitées comme 0 via dict.get(..., 0)."""
        score = calculator.calculate_developer_score({})  # dict vide
        assert score == 0.0

    def test_custom_weights_sum_respected(self, calculator):
        """Poids personnalisés : résultat cohérent avec la formule manuelle."""
        kpis = {
            "commit_rate_per_site":  10.0,   # → 1.0 normalisé
            "mr_rate_per_site":       5.0,   # → 1.0 normalisé
            "approved_mr_rate":       1.0,   # → 1.0
            "avg_review_time_hours":  0.0,   # → review_score = 1.0
        }
        weights = {"commit_rate": 0.4, "mr_rate": 0.3, "approved_rate": 0.2, "review_time": 0.1}
        score = calculator.calculate_developer_score(kpis, weights=weights)
        assert score == 1.0

    def test_score_precision_4_decimal_places(self, calculator):
        """Le score est arrondi à 4 décimales."""
        kpis = {
            "commit_rate_per_site":  3.0,
            "mr_rate_per_site":      1.5,
            "approved_mr_rate":      0.6,
            "avg_review_time_hours": 12.0,
        }
        score = calculator.calculate_developer_score(kpis)
        # Vérifier que l'arrondi à 4 décimales est respecté
        assert score == round(score, 4)

    def test_score_monotone_commits(self, calculator):
        """Plus de commits = score plus élevé (toutes choses égales)."""
        base = {"mr_rate_per_site": 0.0, "approved_mr_rate": 0.0, "avg_review_time_hours": 24.0}
        score_low  = calculator.calculate_developer_score({**base, "commit_rate_per_site": 1.0})
        score_high = calculator.calculate_developer_score({**base, "commit_rate_per_site": 8.0})
        assert score_high > score_low
