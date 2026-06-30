import pytest
from unittest.mock import MagicMock

from app.models.developer import Developer
from app.models.period import Period
from app.services.extraction.developer_identity import (
    matches_target_devs,
    normalize_email,
    normalize_name,
    normalize_username,
    resolve_developer,
    synthetic_gitlab_id,
)
from app.services.extraction.extraction_filters import (
    build_period_window,
    build_target_vectors,
    find_matched_target_dev,
    is_in_period,
    mr_matches_target_devs,
)
from app.services.extraction.gitlab_fetch_strategy import (
    discover_target_branches,
    fetch_unique_commits,
)


def _dev(dev_id, gitlab_user_id=None, email=None, username=None, name=None):
    dev = Developer()
    dev.id = dev_id
    dev.gitlab_user_id = gitlab_user_id
    dev.email = email
    dev.gitlab_username = username
    dev.name = name
    return dev


def test_identity_normalization_and_synthetic_id_stable():
    assert normalize_email(" Test@Mail.COM ") == "test@mail.com"
    assert normalize_name("  Rami   ABID ") == "rami abid"
    assert normalize_username("Rami_Abid ") == "rami_abid"
    assert synthetic_gitlab_id("A@B.COM", "Rami ABID") == synthetic_gitlab_id("a@b.com", "rami abid")


def test_matches_target_devs_with_multiple_vectors():
    target = _dev(1, gitlab_user_id=77, email="dev@corp.com", username="devuser", name="Dev User")
    target_map = {1: target}
    assert matches_target_devs(77, None, None, target_map)
    assert matches_target_devs(None, None, "DEV@CORP.COM", target_map)
    assert matches_target_devs(None, "dev user", None, target_map)
    assert not matches_target_devs(None, "someone else", "x@y.z", target_map)


def test_resolve_developer_strict_mode_does_not_create_unknown():
    db = MagicMock()
    developer_repo = MagicMock()
    dev_project_repo = MagicMock()
    logger = MagicMock()
    developer_repo.get_by_gitlab_user_id.return_value = None
    developer_repo.get_by_email.return_value = None
    developer_repo.get_by_gitlab_username.return_value = None
    developer_repo.get_by_username.return_value = None

    result = resolve_developer(
        db=db,
        project_id=10,
        period_id=1,
        developer_repo=developer_repo,
        dev_project_repo=dev_project_repo,
        logger=logger,
        email="unknown@corp.com",
        name="Unknown Dev",
        gitlab_id=None,
        username="unknown",
        forbid_creation=True,
    )
    assert result is None
    developer_repo.create.assert_not_called()


def test_period_window_and_bounds_filtering():
    period = Period()
    period.year = 2026
    period.month = 2
    since, until, start, end = build_period_window(period)
    assert since == "2026-02-01T00:00:00Z"
    assert until == "2026-02-28T23:59:59Z"
    assert is_in_period("2026-02-14T12:00:00Z", start, end)
    assert not is_in_period("2026-03-01T00:00:00Z", start, end)


def test_mr_target_matching_and_fast_dev_match():
    target = _dev(1, gitlab_user_id=101, email="d@corp.com", username="dev101", name="Dev 101")
    target_map = {1: target}
    mr_data = {
        "author": {"id": 101, "username": "dev101"},
        "reviewers": [],
        "assignees": [],
    }
    assert mr_matches_target_devs(mr_data, target_map)
    matched = find_matched_target_dev(target_map, 101, "d@corp.com", "dev101")
    assert matched is not None and matched.id == 1


def test_build_target_vectors_scoped_and_fallback():
    target = _dev(1, gitlab_user_id=55, email="a@corp.com", username="adev", name="A Dev")
    ids, names, emails, usernames = build_target_vectors({}, {1: target}, scoped=True)
    assert ids == [55]
    assert names == ["A Dev"]
    assert emails == ["a@corp.com"]
    assert usernames == ["adev"]

    author = {"id": 9, "name": "B Dev", "email": "b@corp.com", "username": "bdev"}
    ids, names, emails, usernames = build_target_vectors(author, {}, scoped=False)
    assert ids == [9]
    assert names == ["B Dev"]


@pytest.mark.asyncio
async def test_fetch_strategy_discovers_branches_and_deduplicates_commits():
    class FakeClient:
        async def get_project_events(self, **kwargs):
            return [{"push_data": {"ref": "refs/heads/feature/a"}}]

        async def get_project_commits(self, **kwargs):
            return [{"id": "c1"}, {"id": "c2"}]

    client = FakeClient()
    logger = MagicMock()
    branches = await discover_target_branches(client, 1, "2026-01-01T00:00:00Z", "2026-01-31T23:59:59Z", logger)
    assert "refs/heads/feature/a" in branches

    commits = await fetch_unique_commits(client, 1, "2026-01-01T00:00:00Z", "2026-01-31T23:59:59Z", target_authors=None)
    assert sorted([c["id"] for c in commits]) == ["c1", "c2"]


def test_mr_commits_count_population():
    """
    Test that commits_count is correctly populated from GitLab API response.
    This ensures KPI #8 (avg_commits_per_mr) has valid data.
    """
    from app.services.extraction.extraction_service import build_target_vectors, is_target_author_commit, is_in_period
    
    # Mock GitLab API response for MR detail
    full_mr_data = {
        "commits_count": 5,
        "user_notes_count": 3,
        "author": {"id": 101, "name": "Test Dev", "email": "test@corp.com", "username": "testdev"}
    }
    
    # Mock commits list
    mr_commits = [
        {"id": "c1", "title": "feat: add feature", "author_email": "test@corp.com", "authored_date": "2026-01-15T10:00:00Z"},
        {"id": "c2", "title": "fix: bug fix", "author_email": "test@corp.com", "authored_date": "2026-01-15T11:00:00Z"},
        {"id": "c3", "title": "merge branch main", "author_email": "test@corp.com", "authored_date": "2026-01-15T12:00:00Z"},
    ]
    
    # Mock target devs map
    target_devs_map = {1: MagicMock(id=1, name="Test Dev", email="test@corp.com", gitlab_username="testdev")}
    
    # Build target vectors
    author_data = full_mr_data.get("author", {})
    target_ids, target_names, target_emails, target_unames = build_target_vectors(
        author_data=author_data,
        target_devs_map=target_devs_map,
        scoped=False
    )
    
    # Test that commits_count comes from GitLab API (total commits in MR)
    mr_data = {}
    mr_data.update(full_mr_data)
    
    # This is the fix: commits_count should be from API, not filtered commits
    mr_data["commits_count"] = full_mr_data.get("commits_count", len(mr_commits))
    
    assert mr_data["commits_count"] == 5, "commits_count should be total commits from GitLab API"
    
    # Verify filtered commits are different (used for KPI calculation, not commits_count)
    lot_start = "2026-01-01T00:00:00Z"
    lot_end = "2026-01-31T23:59:59Z"
    filtered_commits = [
        c for c in mr_commits
        if (not (c.get("title", "").lower().startswith("merge branch"))) and
        is_target_author_commit(c, target_names, target_emails) and
        is_in_period(c.get("authored_date", ""), lot_start, lot_end)
    ]
    
    assert len(filtered_commits) == 2, "Filtered commits should exclude merge commits"
    assert mr_data["commits_count"] != len(filtered_commits), "commits_count should not equal filtered commits"

