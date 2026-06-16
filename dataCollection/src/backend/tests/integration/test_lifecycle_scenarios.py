"""
Test Script for Developer Lifecycle Scenarios

Validates that the extraction engine correctly handles:
1. Temporary Suspension (Sabbatical)
2. Reactivation after Suspension
3. Site Mutation (Case B)
4. Retroactive Correction (Case A)
5. Definitive Departure (Offboarding)
6. New Developer Addition
"""
import pytest
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.models.developer import Developer
from app.models.developer_site import DeveloperSite
from app.models.developer_group import DeveloperGroupLink
from app.models.developer_project import DeveloperProject
from app.models.period import Period
from app.models.site import Site
from app.models.project import Project
from app.models.developer_group import DeveloperGroup

from app.utils.mission_utils import get_certified_developers_for_mission, get_site_for_developer_at_date


@pytest.fixture
def db():
    """
    Each test gets a fresh transaction that is ALWAYS rolled back.
    Nothing ever persists to the database between tests.
    """
    session = SessionLocal()
    session.begin_nested()   # SAVEPOINT — lets us rollback the whole test
    try:
        yield session
    finally:
        session.rollback()   # Always rollback — test data never persists
        session.close()


@pytest.fixture
def setup_test_data(db):
    """Setup test data: sites, groups, projects, periods — all inside the test transaction."""
    # Sites
    site_sfax  = Site(name="Sfax_test",  country="Tunisia", is_active=True)
    site_paris = Site(name="Paris_test", country="France",  is_active=True)
    site_tunis = Site(name="Tunis_test", country="Tunisia", is_active=True)
    db.add_all([site_sfax, site_paris, site_tunis])
    db.flush()

    # Groups (no site_id column on DeveloperGroup)
    group_backend  = DeveloperGroup(name="Équipe Backend_test")
    group_frontend = DeveloperGroup(name="Équipe Frontend_test")
    db.add_all([group_backend, group_frontend])
    db.flush()

    # Projects (gitlab_config_id omitted — nullable FK, no config row in test transaction)
    project_inkscape = Project(
        name="inkscape_test",
        gitlab_project_id=99991,
        is_active=True,
    )
    project_gitlab_shell = Project(
        name="gitlab-shell_test",
        gitlab_project_id=99992,
        is_active=True,
    )
    db.add_all([project_inkscape, project_gitlab_shell])
    db.flush()

    # Periods (get-or-create, as they may already exist in the real DB)
    def get_or_create_period(year, month, status):
        p = db.query(Period).filter(Period.year == year, Period.month == month).first()
        if not p:
            p = Period(year=year, month=month, status=status)
            db.add(p)
            db.flush()
        return p

    period_jan = get_or_create_period(2026, 1, "closed")
    period_feb = get_or_create_period(2026, 2, "closed")
    period_mar = get_or_create_period(2026, 3, "open")
    period_apr = get_or_create_period(2026, 4, "open")
    period_may = get_or_create_period(2026, 5, "open")

    return {
        "sites":   {"sfax": site_sfax,  "paris": site_paris, "tunis": site_tunis},
        "groups":  {"backend": group_backend, "frontend": group_frontend},
        "projects": {"inkscape": project_inkscape, "gitlab_shell": project_gitlab_shell},
        "periods": {
            "jan": period_jan, "feb": period_feb, "mar": period_mar,
            "apr": period_apr, "may": period_may,
        },
    }


def test_scenario_1_suspension(db, setup_test_data):
    """
    Scenario 1: Temporary Suspension (Sabbatical)
    Elliot Forbes suspended on 01/03/2026
    Expected: Dev should NOT be extracted for March 2026
    """
    # Create Elliot Forbes
    dev_elliot = Developer(
        name="Elliot Forbes",
        email="elliot@example.com",
        gitlab_username="elliot_forbes",
        is_active=True,
        is_validated=True,
        onboarding_date=date(2026, 1, 1),
        offboarding_date=None
    )
    db.add(dev_elliot)
    db.flush()
    
    # Assign to Sfax site and Backend group
    db.add(DeveloperSite(
        developer_id=dev_elliot.id,
        site_id=setup_test_data["sites"]["sfax"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.add(DeveloperGroupLink(
        developer_id=dev_elliot.id,
        group_id=setup_test_data["groups"]["backend"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.add(DeveloperProject(
        developer_id=dev_elliot.id,
        project_id=setup_test_data["projects"]["inkscape"].id,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.flush()
    
    # Test BEFORE suspension - should be eligible for March
    eligible_before = get_certified_developers_for_mission(
        db=db,
        project_id=setup_test_data["projects"]["inkscape"].id,
        period_id=setup_test_data["periods"]["mar"].id
    )
    assert dev_elliot.id in eligible_before, "Elliot should be eligible for March BEFORE suspension"
    
    # Simulate suspension via update (is_active=False, mutation_date=2026-03-01)
    # This would normally be done via API, but we simulate the SCD Type 2 effect
    # Close site segment on 28/02/2026
    site_segment = db.query(DeveloperSite).filter(
        DeveloperSite.developer_id == dev_elliot.id,
        DeveloperSite.site_id == setup_test_data["sites"]["sfax"].id
    ).first()
    site_segment.is_active = False
    site_segment.end_date = date(2026, 2, 28)
    
    # Close group segment on 28/02/2026
    group_segment = db.query(DeveloperGroupLink).filter(
        DeveloperGroupLink.developer_id == dev_elliot.id,
        DeveloperGroupLink.group_id == setup_test_data["groups"]["backend"].id
    ).first()
    group_segment.is_active = False
    group_segment.end_date = date(2026, 2, 28)
    
    db.flush()
    
    # Test AFTER suspension - should NOT be eligible for March
    eligible_after = get_certified_developers_for_mission(
        db=db,
        project_id=setup_test_data["projects"]["inkscape"].id,
        period_id=setup_test_data["periods"]["mar"].id
    )
    assert dev_elliot.id not in eligible_after, "Elliot should NOT be eligible for March AFTER suspension"


def test_scenario_2_reactivation(db, setup_test_data):
    """
    Scenario 2: Reactivation after Suspension
    Elliot Forbes reactivates on 18/05/2026
    Expected: Dev should be eligible for May 2026
    """
    # Create Elliot Forbes with suspension gap
    dev_elliot = Developer(
        name="Elliot Forbes",
        email="elliot@example.com",
        gitlab_username="elliot_forbes",
        is_active=True,
        is_validated=True,
        onboarding_date=date(2026, 1, 1),
        offboarding_date=None
    )
    db.add(dev_elliot)
    db.flush()
    
    # Create SUSPENDED segments (closed on 28/02/2026)
    db.add(DeveloperSite(
        developer_id=dev_elliot.id,
        site_id=setup_test_data["sites"]["sfax"].id,
        is_primary=True,
        is_active=False,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28)
    ))
    db.add(DeveloperGroupLink(
        developer_id=dev_elliot.id,
        group_id=setup_test_data["groups"]["backend"].id,
        is_primary=True,
        is_active=False,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28)
    ))
    db.add(DeveloperProject(
        developer_id=dev_elliot.id,
        project_id=setup_test_data["projects"]["inkscape"].id,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.flush()
    
    # Test DURING suspension (March) - should NOT be eligible
    eligible_march = get_certified_developers_for_mission(
        db=db,
        project_id=setup_test_data["projects"]["inkscape"].id,
        period_id=setup_test_data["periods"]["mar"].id
    )
    assert dev_elliot.id not in eligible_march, "Elliot should NOT be eligible for March (suspended)"
    
    # Simulate reactivation - create new segments starting 18/05/2026
    db.add(DeveloperSite(
        developer_id=dev_elliot.id,
        site_id=setup_test_data["sites"]["sfax"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 5, 18)
    ))
    db.add(DeveloperGroupLink(
        developer_id=dev_elliot.id,
        group_id=setup_test_data["groups"]["backend"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 5, 18)
    ))
    db.flush()
    
    # Test AFTER reactivation (May) - should be eligible
    eligible_may = get_certified_developers_for_mission(
        db=db,
        project_id=setup_test_data["projects"]["inkscape"].id,
        period_id=setup_test_data["periods"]["may"].id
    )
    assert dev_elliot.id in eligible_may, "Elliot should be eligible for May AFTER reactivation"


def test_scenario_3_site_mutation(db, setup_test_data):
    """
    Scenario 3: Site Mutation (Case B)
    Martin Owens moves from Sfax to Paris on 15/04/2026
    Expected: April extraction should attribute correctly to each site
    """
    # Create Martin Owens
    dev_martin = Developer(
        name="Martin Owens",
        email="martin@example.com",
        gitlab_username="martin_owens",
        is_active=True,
        is_validated=True,
        onboarding_date=date(2026, 1, 1),
        offboarding_date=None
    )
    db.add(dev_martin)
    db.flush()
    
    # Initial assignment to Sfax (01/01/2026 - 14/04/2026)
    db.add(DeveloperSite(
        developer_id=dev_martin.id,
        site_id=setup_test_data["sites"]["sfax"].id,
        is_primary=True,
        is_active=False,  # Closed by mutation
        start_date=date(2026, 1, 1),
        end_date=date(2026, 4, 14)
    ))
    db.add(DeveloperGroupLink(
        developer_id=dev_martin.id,
        group_id=setup_test_data["groups"]["backend"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.add(DeveloperProject(
        developer_id=dev_martin.id,
        project_id=setup_test_data["projects"]["inkscape"].id,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.flush()
    
    # Test site attribution for April 1-14
    site_apr_early = get_site_for_developer_at_date(
        db=db,
        developer_id=dev_martin.id,
        target_date=date(2026, 4, 10)
    )
    assert site_apr_early == setup_test_data["sites"]["sfax"].id, "Martin should be at Sfax on April 10"
    
    # Mutation to Paris (15/04/2026 - end_date=None)
    db.add(DeveloperSite(
        developer_id=dev_martin.id,
        site_id=setup_test_data["sites"]["paris"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 4, 15)
    ))
    db.flush()
    
    # Test site attribution for April 20 (after mutation)
    site_apr_late = get_site_for_developer_at_date(
        db=db,
        developer_id=dev_martin.id,
        target_date=date(2026, 4, 20)
    )
    assert site_apr_late == setup_test_data["sites"]["paris"].id, "Martin should be at Paris on April 20"
    
    # Test site attribution for March (before mutation)
    site_mar = get_site_for_developer_at_date(
        db=db,
        developer_id=dev_martin.id,
        target_date=date(2026, 3, 15)
    )
    assert site_mar == setup_test_data["sites"]["sfax"].id, "Martin should be at Sfax in March"


def test_scenario_4_retroactive_correction(db, setup_test_data):
    """
    Scenario 4: Retroactive Correction (Case A)
    Pablo Gil Fernández was wrong about site, always been Tunis not Paris
    Expected: Historical data should be corrected, periods recalculated
    """
    # Create Pablo with WRONG site (Paris) - simulating the error
    dev_pablo = Developer(
        name="Pablo Gil Fernández",
        email="pablo@example.com",
        gitlab_username="pablo_gil",
        is_active=True,
        is_validated=True,
        onboarding_date=date(2026, 1, 1),
        offboarding_date=None
    )
    db.add(dev_pablo)
    db.flush()
    
    # WRONG assignment to Paris (simulating the error)
    db.add(DeveloperSite(
        developer_id=dev_pablo.id,
        site_id=setup_test_data["sites"]["paris"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.add(DeveloperGroupLink(
        developer_id=dev_pablo.id,
        group_id=setup_test_data["groups"]["frontend"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.add(DeveloperProject(
        developer_id=dev_pablo.id,
        project_id=setup_test_data["projects"]["inkscape"].id,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.flush()
    
    # Verify WRONG site before correction (March)
    site_wrong_mar = get_site_for_developer_at_date(
        db=db,
        developer_id=dev_pablo.id,
        target_date=date(2026, 3, 15)
    )
    assert site_wrong_mar == setup_test_data["sites"]["paris"].id, "Pablo should be at Paris BEFORE correction (the error)"
    
    # CORRECTION (Case A) - Retroactively change to Tunis (NO mutation_date)
    site_segment = db.query(DeveloperSite).filter(
        DeveloperSite.developer_id == dev_pablo.id
    ).first()
    site_segment.site_id = setup_test_data["sites"]["tunis"].id
    # No mutation_date, no new segment - just update existing
    db.flush()
    
    # Verify CORRECTED site after correction (March)
    site_correct_mar = get_site_for_developer_at_date(
        db=db,
        developer_id=dev_pablo.id,
        target_date=date(2026, 3, 15)
    )
    assert site_correct_mar == setup_test_data["sites"]["tunis"].id, "Pablo should be at Tunis AFTER correction"
    
    # Verify CORRECTED site for all history (January)
    site_correct_jan = get_site_for_developer_at_date(
        db=db,
        developer_id=dev_pablo.id,
        target_date=date(2026, 1, 15)
    )
    assert site_correct_jan == setup_test_data["sites"]["tunis"].id, "Pablo should be at Tunis in January AFTER correction"


def test_scenario_5_offboarding(db, setup_test_data):
    """
    Scenario 5: Definitive Departure (Offboarding)
    Igor Drozdov offboarded on 31/03/2026
    Expected: Dev should NOT be eligible for April 2026 (RG-02: 15-day rule)
    """
    # Create Igor Drozdov
    dev_igor = Developer(
        name="Igor Drozdov",
        email="igor@example.com",
        gitlab_username="igor_drozdov",
        is_active=True,
        is_validated=True,
        onboarding_date=date(2026, 1, 1),
        offboarding_date=None
    )
    db.add(dev_igor)
    db.flush()
    
    # Assign to Sfax site and Backend group
    db.add(DeveloperSite(
        developer_id=dev_igor.id,
        site_id=setup_test_data["sites"]["sfax"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.add(DeveloperGroupLink(
        developer_id=dev_igor.id,
        group_id=setup_test_data["groups"]["backend"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.add(DeveloperProject(
        developer_id=dev_igor.id,
        project_id=setup_test_data["projects"]["inkscape"].id,
        is_active=True,
        start_date=date(2026, 1, 1)
    ))
    db.flush()
    
    # Test BEFORE offboarding (March) - should be eligible
    eligible_mar = get_certified_developers_for_mission(
        db=db,
        project_id=setup_test_data["projects"]["inkscape"].id,
        period_id=setup_test_data["periods"]["mar"].id
    )
    assert dev_igor.id in eligible_mar, "Igor should be eligible for March BEFORE offboarding"
    
    # Offboarding on 31/03/2026
    dev_igor.offboarding_date = date(2026, 3, 31)
    
    # Close all segments on 30/03/2026
    site_segment = db.query(DeveloperSite).filter(
        DeveloperSite.developer_id == dev_igor.id
    ).first()
    site_segment.is_active = False
    site_segment.end_date = date(2026, 3, 30)
    
    group_segment = db.query(DeveloperGroupLink).filter(
        DeveloperGroupLink.developer_id == dev_igor.id
    ).first()
    group_segment.is_active = False
    group_segment.end_date = date(2026, 3, 30)
    
    proj_segment = db.query(DeveloperProject).filter(
        DeveloperProject.developer_id == dev_igor.id
    ).first()
    proj_segment.is_active = False
    proj_segment.end_date = date(2026, 3, 30)
    
    db.flush()
    
    # Test AFTER offboarding (April) - should NOT be eligible (RG-02: offboarding < 15th)
    eligible_apr = get_certified_developers_for_mission(
        db=db,
        project_id=setup_test_data["projects"]["inkscape"].id,
        period_id=setup_test_data["periods"]["apr"].id
    )
    assert dev_igor.id not in eligible_apr, "Igor should NOT be eligible for April (offboarding < 15th)"


def test_scenario_6_new_developer(db, setup_test_data):
    """
    Scenario 6: New Developer Addition
    New developer added with onboarding_date in current month
    Expected: Dev should be eligible for current month
    """
    # Create new developer with onboarding in May
    dev_new = Developer(
        name="New Developer",
        email="new@example.com",
        gitlab_username="new_dev",
        is_active=True,
        is_validated=True,
        onboarding_date=date(2026, 5, 15),
        offboarding_date=None
    )
    db.add(dev_new)
    db.flush()
    
    # Assign to Paris site and Frontend group
    db.add(DeveloperSite(
        developer_id=dev_new.id,
        site_id=setup_test_data["sites"]["paris"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 5, 15)
    ))
    db.add(DeveloperGroupLink(
        developer_id=dev_new.id,
        group_id=setup_test_data["groups"]["frontend"].id,
        is_primary=True,
        is_active=True,
        start_date=date(2026, 5, 15)
    ))
    db.add(DeveloperProject(
        developer_id=dev_new.id,
        project_id=setup_test_data["projects"]["inkscape"].id,
        is_active=True,
        start_date=date(2026, 5, 15)
    ))
    db.flush()
    
    # Test eligibility for May (current month with onboarding)
    eligible_may = get_certified_developers_for_mission(
        db=db,
        project_id=setup_test_data["projects"]["inkscape"].id,
        period_id=setup_test_data["periods"]["may"].id
    )
    assert dev_new.id in eligible_may, "New dev should be eligible for May (onboarding in May)"
    
    # Test NOT eligible for April (before onboarding)
    eligible_apr = get_certified_developers_for_mission(
        db=db,
        project_id=setup_test_data["projects"]["inkscape"].id,
        period_id=setup_test_data["periods"]["apr"].id
    )
    assert dev_new.id not in eligible_apr, "New dev should NOT be eligible for April (onboarding in May)"


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])
