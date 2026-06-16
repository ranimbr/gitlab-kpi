"""
Tests unitaires pour le PercentileCalculator.

Teste le calcul des seuils dynamiques basés sur les percentiles.
"""
import pytest
from datetime import datetime
from sqlalchemy.orm import Session

from app.services.intelligence.percentile_calculator import PercentileCalculator, FALLBACK_THRESHOLDS


class TestPercentileCalculator:
    """Tests pour le calculateur de percentiles dynamiques."""

    def test_calculate_with_sufficient_data(self, db_session: Session):
        """
        Test le calcul des percentiles avec suffisamment de données.
        
        Devrait utiliser les percentiles calculés et non les fallbacks.
        """
        calculator = PercentileCalculator(db_session)
        
        # Ce test nécessite des données de test dans la base
        # Pour l'instant, on teste la structure de retour
        result = calculator.calculate_dynamic_thresholds(
            project_id=1,
            min_periods=3,
            history_months=6
        )
        
        # Vérifier la structure de retour
        assert "velocity_low" in result
        assert "review_time_high" in result
        assert "quality_low" in result
        assert "using_fallback" in result
        assert "periods_used" in result
        
        # Vérifier que les valeurs sont des nombres
        assert isinstance(result["velocity_low"], (int, float))
        assert isinstance(result["review_time_high"], (int, float))
        assert isinstance(result["quality_low"], (int, float))
        assert isinstance(result["periods_used"], int)
        assert isinstance(result["using_fallback"], bool)

    def test_calculate_with_insufficient_data(self, db_session: Session):
        """
        Test le calcul des percentiles avec insuffisamment de données.
        
        Devrait utiliser les seuils de fallback hardcodés.
        """
        calculator = PercentileCalculator(db_session)
        
        # Utiliser un project_id qui n'existe probablement pas
        result = calculator.calculate_dynamic_thresholds(
            project_id=99999,  # ID inexistant
            min_periods=3,
            history_months=6
        )
        
        # Vérifier que les fallbacks sont utilisés
        assert result["using_fallback"] is True
        assert result["velocity_low"] == FALLBACK_THRESHOLDS["velocity_low"]
        assert result["review_time_high"] == FALLBACK_THRESHOLDS["review_time_high"]
        assert result["quality_low"] == FALLBACK_THRESHOLDS["quality_low"]

    def test_fallback_thresholds_constants(self):
        """Test que les constantes de fallback sont définies correctement."""
        assert "velocity_low" in FALLBACK_THRESHOLDS
        assert "review_time_high" in FALLBACK_THRESHOLDS
        assert "quality_low" in FALLBACK_THRESHOLDS
        
        assert FALLBACK_THRESHOLDS["velocity_low"] == 1.0
        assert FALLBACK_THRESHOLDS["review_time_high"] == 48.0
        assert FALLBACK_THRESHOLDS["quality_low"] == 0.5

    def test_calculate_percentile_with_valid_values(self):
        """Test le calcul de percentile avec des valeurs valides."""
        calculator = PercentileCalculator(None)
        
        # Test avec des valeurs simples
        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        
        # Q1 (25ème percentile) devrait être ~2.0
        q1 = calculator._calculate_percentile(values, 25)
        assert q1 == 2.0
        
        # Q3 (75ème percentile) devrait être ~4.0
        q3 = calculator._calculate_percentile(values, 75)
        assert q3 == 4.0

    def test_calculate_percentile_with_zeros(self):
        """Test le calcul de percentile exclut les zéros."""
        calculator = PercentileCalculator(None)
        
        # Test avec des zéros (absence de données)
        values = [0.0, 0.0, 1.0, 2.0, 3.0, 4.0, 5.0]
        
        # Les zéros devraient être exclus
        q1 = calculator._calculate_percentile(values, 25)
        # Sans les zéros: [1.0, 2.0, 3.0, 4.0, 5.0]
        # Q1 de [1, 2, 3, 4, 5] est 2.0
        assert q1 == 2.0

    def test_calculate_percentile_with_all_zeros(self):
        """Test le calcul de percentile avec toutes les valeurs à zéro."""
        calculator = PercentileCalculator(None)
        
        # Test avec toutes les valeurs à zéro
        values = [0.0, 0.0, 0.0]
        
        # Devrait utiliser le fallback
        q1 = calculator._calculate_percentile(values, 25)
        assert q1 == FALLBACK_THRESHOLDS["velocity_low"]

    def test_calculate_percentile_with_empty_list(self):
        """Test le calcul de percentile avec une liste vide."""
        calculator = PercentileCalculator(None)
        
        # Test avec une liste vide
        values = []
        
        # Devrait utiliser le fallback
        q1 = calculator._calculate_percentile(values, 25)
        assert q1 == FALLBACK_THRESHOLDS["velocity_low"]
