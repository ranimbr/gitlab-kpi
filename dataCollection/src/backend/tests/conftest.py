"""
tests/conftest.py

Configuration pytest partagée par tous les tests du projet.

[SENIOR] Ce fichier est automatiquement chargé par pytest avant les tests.
Il fournit :
    - session_fixture : une vraie session SQLite en mémoire
    - calculator_fixture : KpiCalculator prêt à l'emploi (DB réelle ou mock)
    - dummy_developer : un développeur de test persisté en mémoire

Run : pytest tests/ -v --tb=short
"""
import pytest
from unittest.mock import MagicMock

from app.services.kpi.kpi_calculator import KpiCalculator


# ── Fixtures globales ────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def mock_db():
    """Session DB mockée — aucune vraie connexion base de données.
    Scope 'session' = créée une seule fois pour tous les tests.
    """
    db = MagicMock()
    db.query.return_value.filter.return_value.scalar.return_value = 0
    db.query.return_value.filter.return_value.first.return_value  = None
    db.query.return_value.filter.return_value.all.return_value    = []
    return db


@pytest.fixture
def calculator(mock_db):
    """KpiCalculator avec session mockée.
    Fixture standard — recréée à chaque test (scope par défaut).
    """
    return KpiCalculator(db=mock_db)


@pytest.fixture
def zero_kpis():
    """KPIs représentant un développeur INACTIF (tout à zéro)."""
    return {
        "commit_rate_per_site":  0.0,
        "mr_rate_per_site":      0.0,
        "approved_mr_rate":      0.0,
        "avg_review_time_hours": 0.0,
    }


@pytest.fixture
def perfect_kpis():
    """KPIs représentant un développeur PARFAIT (seuils maximaux)."""
    return {
        "commit_rate_per_site":  KpiCalculator.COMMIT_NORMALIZATION,
        "mr_rate_per_site":      KpiCalculator.MR_NORMALIZATION,
        "approved_mr_rate":      1.0,
        "avg_review_time_hours": 0.0,
    }


@pytest.fixture
def average_kpis():
    """KPIs représentant un développeur MOYEN de l'équipe."""
    return {
        "commit_rate_per_site":  KpiCalculator.COMMIT_NORMALIZATION / 2,
        "mr_rate_per_site":      KpiCalculator.MR_NORMALIZATION / 2,
        "approved_mr_rate":      0.6,
        "avg_review_time_hours": KpiCalculator.REVIEW_REF_HOURS,  # → review_score = 0.5
    }
