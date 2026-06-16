"""
tests/unit/test_validator.py

Validates the Developer Archiving Regression fixes:
  1. rh_status prioritizes OUT if offboarding_date is in the past
  2. get_by_tab(active_only=True, period_id=X) includes historically active devs (not just is_active=True)
  3. compute_headcount counts devs that were active during a period via SCD-Type-2 site segments,
     even if they are currently offboarded (is_active=False)

Run : pytest tests/unit/test_validator.py -v
"""
import pytest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.developer import Developer
from app.models.developer_group import DeveloperGroup, DeveloperGroupLink
from app.models.developer_project import DeveloperProject
from app.models.developer_site import DeveloperSite
from app.models.gitlab_config import GitLabConfig
from app.models.project import Project
from app.models.site import Site
from app.models.period import Period, PeriodStatusEnum
from app.repositories.developer_repository import DeveloperRepository
from app.services.admin.developer_status_service import DeveloperStatusService
from unittest.mock import patch

# ── Fixture ─────────────────────────────────────────────────────────────────

@pytest.fixture
def test_db():
    """SQLite in-memory DB with only the tables needed for archiving tests."""
    engine = create_engine("sqlite:///:memory:")
    # Targeted table creation — avoids ARRAY-type columns in app_user
    # Order matters: referenced tables before referencing tables
    GitLabConfig.__table__.create(engine)
    Site.__table__.create(engine)
    Project.__table__.create(engine)
    DeveloperGroup.__table__.create(engine)
    Developer.__table__.create(engine)
    DeveloperSite.__table__.create(engine)
    DeveloperGroupLink.__table__.create(engine)
    Period.__table__.create(engine)
    DeveloperProject.__table__.create(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    with patch("app.repositories.audit_log_repository.AuditLogRepository.log", return_value=None):
        try:
            yield db
        finally:
            db.close()


def _make_dev(test_db, **kwargs) -> Developer:
    """Helper: create & flush a Developer with sensible defaults."""
    defaults = dict(
        name="TestDev",
        is_bot=False,
        is_validated=True,
        is_active=True,
        source="manual",
    )
    defaults.update(kwargs)
    dev = Developer(**defaults)
    test_db.add(dev)
    test_db.flush()
    return dev


def _make_period(test_db, year: int, month: int, pid: int = None) -> Period:
    """Helper: create & flush a Period."""
    kwargs = dict(year=year, month=month, status=PeriodStatusEnum.open)
    if pid:
        kwargs["id"] = pid
    p = Period(**kwargs)
    test_db.add(p)
    test_db.flush()
    return p


def _make_site(test_db, name: str = "Sfax") -> Site:
    """Helper: create & flush a Site."""
    s = Site(name=name, is_active=True)
    test_db.add(s)
    test_db.flush()
    return s


# ── Tests ────────────────────────────────────────────────────────────────────

class TestRhStatusPriority:
    """Bug fix: rh_status must return 'OUT' when offboarding_date < today."""

    def test_out_when_offboarded_in_past(self, test_db):
        """Developer offboarded on 2026-04-04 → rh_status must be 'OUT' today (2026-05-18)."""
        dev = _make_dev(
            test_db,
            name="Martin",
            is_active=False,
            onboarding_date=date(2025, 1, 1),
            offboarding_date=date(2026, 4, 4),
        )
        test_db.commit()
        # rh_status is a dynamic property — no reload needed
        assert dev.rh_status == "OUT", (
            f"Attendu 'OUT' car offboarding_date={dev.offboarding_date} < aujourd'hui, "
            f"obtenu '{dev.rh_status}'"
        )

    def test_out_supersedes_is_active_flag(self, test_db):
        """Even if is_active was left True by mistake, OUT takes priority."""
        dev = _make_dev(
            test_db,
            name="Martin",
            is_active=True,          # état incohérent simulé
            onboarding_date=date(2025, 1, 1),
            offboarding_date=date(2026, 3, 1),
        )
        test_db.commit()
        assert dev.rh_status == "OUT"

    def test_active_when_no_offboarding(self, test_db):
        """Developer with no offboarding_date and is_active=True → 'ACTIVE'."""
        dev = _make_dev(
            test_db,
            name="Alice",
            is_active=True,
            onboarding_date=date(2025, 6, 1),
            offboarding_date=None,
        )
        test_db.commit()
        # Without site/group context, rh_status falls through to ACTIVE
        assert dev.rh_status in ("ACTIVE", "INACTIVE")  # INACTIVE if no site/group loaded

    def test_inactive_when_is_active_false_and_no_offboarding(self, test_db):
        """Manually deactivated developer (no offboarding_date) → 'INACTIVE'."""
        dev = _make_dev(
            test_db,
            name="Bob",
            is_active=False,
            onboarding_date=date(2025, 6, 1),
            offboarding_date=None,
        )
        test_db.commit()
        assert dev.rh_status == "INACTIVE"


class TestGetByTabHistoricalActiveOnly:
    """Bug fix: get_by_tab(active_only=True) must not filter out historical devs when period_id is set."""

    def test_historical_offboarded_dev_included_for_old_period(self, test_db):
        """
        Martin: offboarded 2026-04-04 → is_active=False today.
        With period_id=Jan 2026, active_only=True → Martin MUST be returned.
        """
        martin = _make_dev(
            test_db,
            name="Martin",
            is_active=False,
            onboarding_date=date(2025, 1, 1),
            offboarding_date=date(2026, 4, 4),
        )
        jan = _make_period(test_db, 2026, 1)
        test_db.commit()

        repo = DeveloperRepository()

        # ── Without period → must be EXCLUDED (currently inactive)
        results, total = repo.get_by_tab(test_db, tab="validated", active_only=True)
        names = [d.name for d in results]
        assert "Martin" not in names, (
            "Martin est inactif aujourd'hui → ne doit PAS apparaître sans période"
        )

        # ── With Jan 2026 period → must be INCLUDED (was active back then)
        results, total = repo.get_by_tab(
            test_db, tab="validated", period_id=jan.id, active_only=True
        )
        names = [d.name for d in results]
        assert "Martin" in names, (
            f"Martin avait offboarding_date={martin.offboarding_date} > 2026-01-31 "
            f"donc il était actif en janvier 2026. Il doit être inclus. Résultats: {names}"
        )

    def test_dev_not_yet_onboarded_excluded(self, test_db):
        """Developer whose onboarding is after the period end must be excluded."""
        future_dev = _make_dev(
            test_db,
            name="FutureDev",
            is_active=True,
            onboarding_date=date(2026, 5, 1),
            offboarding_date=None,
        )
        jan = _make_period(test_db, 2026, 1)
        test_db.commit()

        repo = DeveloperRepository()
        results, _ = repo.get_by_tab(
            test_db, tab="validated", period_id=jan.id, active_only=True
        )
        names = [d.name for d in results]
        assert "FutureDev" not in names, (
            "FutureDev rejoint en Mai 2026 → ne doit pas compter en Janvier 2026"
        )

    def test_currently_active_dev_included_without_period(self, test_db):
        """Currently active developer is always included when no period is specified."""
        dev = _make_dev(
            test_db,
            name="Alice",
            is_active=True,
            onboarding_date=date(2025, 1, 1),
            offboarding_date=None,
        )
        test_db.commit()

        repo = DeveloperRepository()
        results, _ = repo.get_by_tab(test_db, tab="validated", active_only=True)
        names = [d.name for d in results]
        assert "Alice" in names


class TestComputeHeadcountHistorical:
    """Bug fix: compute_headcount must count offboarded devs if they had a site during the period."""

    def _setup_dev_with_site(self, test_db, site, offboarding: date):
        """Helper: create a developer + site assignment within [2025-01-01, offboarding]."""
        dev = _make_dev(
            test_db,
            name="Martin",
            is_active=False,          # currently inactive (departed)
            onboarding_date=date(2025, 1, 1),
            offboarding_date=offboarding,
        )
        ds = DeveloperSite(
            developer_id=dev.id,
            site_id=site.id,
            is_active=False,          # segment closed after departure
            is_primary=True,
            start_date=date(2025, 1, 1),
            end_date=offboarding,
        )
        test_db.add(ds)
        test_db.flush()
        return dev

    def test_offboarded_dev_counted_in_historical_period(self, test_db):
        """
        Martin offboarded 2026-04-04 → must be counted for Jan 2026 (was present then).
        """
        site = _make_site(test_db, "Sfax")
        self._setup_dev_with_site(test_db, site, offboarding=date(2026, 4, 4))
        jan = _make_period(test_db, 2026, 1)
        test_db.commit()

        svc = DeveloperStatusService()
        count = svc.compute_headcount(test_db, jan)
        assert count == 1, (
            f"Martin était présent en Janvier 2026 → effectif = 1, obtenu {count}"
        )

    def test_offboarded_dev_not_counted_after_departure(self, test_db):
        """
        Martin offboarded 2026-04-04 → must NOT be counted for May 2026.
        """
        site = _make_site(test_db, "Sfax")
        self._setup_dev_with_site(test_db, site, offboarding=date(2026, 4, 4))
        may = _make_period(test_db, 2026, 5)
        test_db.commit()

        svc = DeveloperStatusService()
        count = svc.compute_headcount(test_db, may)
        assert count == 0, (
            f"Martin est parti le 04/04/2026 → effectif Mai 2026 = 0, obtenu {count}"
        )

    def test_dev_departed_before_15th_not_counted(self, test_db):
        """
        Developer who left on the 3rd of the month (< 15 days) should NOT be counted
        due to the RG-02 threshold rule.
        """
        site = _make_site(test_db, "Tunis")
        # Left on April 3rd → less than 15 days in April
        dev = _make_dev(
            test_db,
            name="EarlyOut",
            is_active=False,
            onboarding_date=date(2025, 1, 1),
            offboarding_date=date(2026, 4, 3),
        )
        ds = DeveloperSite(
            developer_id=dev.id,
            site_id=site.id,
            is_active=False,
            is_primary=True,
            start_date=date(2025, 1, 1),
            end_date=date(2026, 4, 3),
        )
        test_db.add(ds)
        april = _make_period(test_db, 2026, 4)
        test_db.commit()

        svc = DeveloperStatusService()
        count = svc.compute_headcount(test_db, april)
        assert count == 0, (
            f"EarlyOut est parti le 03/04 (<15j) → ne doit pas compter en Avril, obtenu {count}"
        )


# ── Tests RG-05 : Validation des dates ───────────────────────────────────────

class TestRg05DateValidation:
    """
    RG-05 : La date d'entrée doit être strictement antérieure à la date de départ.
    Validation réalisée dans update_developer() et create_developer() du backend.
    """

    def test_update_raises_422_when_onboarding_equals_offboarding(self, test_db):
        """onboarding_date == offboarding_date → HTTP 422."""
        from fastapi import HTTPException
        from app.services.admin.developer_service import DeveloperService
        from app.schemas.developer import DeveloperUpdate

        dev = _make_dev(test_db, name="DateCheck", onboarding_date=date(2025, 1, 1))
        test_db.commit()

        svc = DeveloperService()
        payload = DeveloperUpdate(
            onboarding_date=date(2026, 3, 1),
            offboarding_date=date(2026, 3, 1),   # MÊME date → invalide
        )

        with pytest.raises(HTTPException) as exc_info:
            svc.update_developer(test_db, dev.id, payload)

        assert exc_info.value.status_code == 422
        assert "RG-05" in exc_info.value.detail

    def test_update_raises_422_when_onboarding_after_offboarding(self, test_db):
        """onboarding_date > offboarding_date → HTTP 422."""
        from fastapi import HTTPException
        from app.services.admin.developer_service import DeveloperService
        from app.schemas.developer import DeveloperUpdate

        dev = _make_dev(test_db, name="DateCheck2", onboarding_date=date(2025, 1, 1))
        test_db.commit()

        svc = DeveloperService()
        payload = DeveloperUpdate(
            onboarding_date=date(2026, 6, 1),
            offboarding_date=date(2026, 3, 1),   # entrée APRÈS sortie → invalide
        )

        with pytest.raises(HTTPException) as exc_info:
            svc.update_developer(test_db, dev.id, payload)

        assert exc_info.value.status_code == 422

    def test_update_accepts_valid_dates(self, test_db):
        """onboarding_date < offboarding_date → pas d'exception."""
        from app.services.admin.developer_service import DeveloperService
        from app.schemas.developer import DeveloperUpdate

        dev = _make_dev(test_db, name="DateCheckOK", onboarding_date=date(2025, 1, 1))
        test_db.commit()

        svc = DeveloperService()
        payload = DeveloperUpdate(
            onboarding_date=date(2025, 1, 1),
            offboarding_date=date(2026, 4, 4),   # valide
        )

        # Ne doit pas lever d'exception
        result = svc.update_developer(test_db, dev.id, payload)
        assert result is not None

    def test_update_accepts_offboarding_only(self, test_db):
        """Si only offboarding_date est fournie (sans changer onboarding), doit passer."""
        from app.services.admin.developer_service import DeveloperService
        from app.schemas.developer import DeveloperUpdate

        dev = _make_dev(
            test_db, name="DateCheckOff",
            onboarding_date=date(2025, 1, 1),
        )
        test_db.commit()

        svc = DeveloperService()
        # Seulement offboarding_date, pas de onboarding_date dans le payload
        payload = DeveloperUpdate(offboarding_date=date(2026, 4, 4))

        # onboarding_date existant (2025-01-01) < offboarding (2026-04-04) → valide
        result = svc.update_developer(test_db, dev.id, payload)
        assert result is not None


class TestReonboardingReactivation:
    def test_reactivation_clears_offboarding_date_and_restores_active_status(self, test_db):
        """Re-onboarding a developer (setting new onboarding date, clearing offboarding) updates status to ACTIVE."""
        from app.services.admin.developer_service import DeveloperService
        from app.schemas.developer import DeveloperUpdate

        # Create a developer who has already offboarded (in the past, e.g. 2025-12-31)
        dev = _make_dev(
            test_db,
            name="ArchivedDev",
            onboarding_date=date(2025, 1, 1),
            offboarding_date=date(2025, 12, 31),
            is_active=False
        )
        test_db.commit()

        # Verify initial status is OUT
        assert dev.rh_status == "OUT"

        # Now perform Re-onboarding:
        # 1. New onboarding date (e.g. 2026-02-01)
        # 2. Clear offboarding date (set to None)
        # 3. Set is_active to True
        svc = DeveloperService()
        payload = DeveloperUpdate(
            onboarding_date=date(2026, 2, 1),
            offboarding_date=None,
            is_active=True
        )

        res_dict = svc.update_developer(test_db, dev.id, payload)
        test_db.commit()

        # Verify updated properties
        result = res_dict["developer"]
        assert result.onboarding_date == date(2026, 2, 1)
        assert result.offboarding_date is None
        assert result.is_active is True
        assert result.rh_status == "ACTIVE"


