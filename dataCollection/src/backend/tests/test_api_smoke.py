from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers import analytics, kpis
from app.models.app_user import AppUser, UserRoleEnum


def _fake_user():
    user = AppUser()
    user.id = 1
    user.email = "admin@test.com"
    user.role = UserRoleEnum.super_admin
    user.is_active = True
    return user


def _build_client():
    app = FastAPI()
    app.include_router(kpis.router)
    app.include_router(analytics.router)

    fake_db = MagicMock()

    def override_db():
        return fake_db

    def override_user():
        return _fake_user()

    app.dependency_overrides[kpis.get_db] = override_db
    app.dependency_overrides[kpis.get_current_user] = override_user
    app.dependency_overrides[analytics.get_db] = override_db
    app.dependency_overrides[analytics.get_current_user] = override_user
    app.dependency_overrides[analytics.get_current_admin] = override_user

    return TestClient(app)


def test_kpis_trend_rejects_invalid_kpi_field():
    client = _build_client()
    response = client.get(
        "/kpis/trend",
        params={"project_id": 1, "kpi_field": "invalid_field"},
    )
    assert response.status_code == 400
    assert "KPI_FIELD_INVALID" in response.json()["detail"]


def test_analytics_history_rejects_invalid_date_range():
    client = _build_client()
    response = client.get(
        "/analytics/1/history",
        params={"start_date": "2026-03-10", "end_date": "2026-03-01"},
    )
    assert response.status_code == 400
    assert "ANALYTICS_DATE_RANGE_INVALID" in response.json()["detail"]


def test_kpis_dashboard_contract_ok(monkeypatch):
    client = _build_client()

    def fake_dashboard_summary(self, **kwargs):
        return {
            "latest_metrics": None,
            "history": [],
            "comparative_by_site": [],
            "total_snapshots": 0,
            "site_id": kwargs.get("site_id"),
        }

    monkeypatch.setattr(kpis.AnalyticsService, "get_dashboard_summary", fake_dashboard_summary)
    response = client.get("/kpis/dashboard", params={"project_id": "1"})
    assert response.status_code == 200
    payload = response.json()
    assert "latest_metrics" in payload
    assert "history" in payload
    assert payload["project_id"] == 1


def test_kpis_leaderboard_contract_ok(monkeypatch):
    client = _build_client()

    def fake_leaderboard(self, **kwargs):
        return {"site_id": None, "group_id": None, "period_label": "2026/01", "total_devs": 0, "entries": []}

    monkeypatch.setattr(kpis.AnalyticsService, "get_leaderboard", fake_leaderboard)
    response = client.get("/kpis/leaderboard", params={"project_id": 1, "period_id": 1})
    assert response.status_code == 200
    assert "entries" in response.json()


def test_kpis_compare_lot_mode_contract_ok(monkeypatch):
    client = _build_client()

    def fake_compare_for_lot(self, project_id, lot_id, kpi_field):
        return []

    monkeypatch.setattr(kpis.AnalyticsService, "get_site_comparison_for_lot", fake_compare_for_lot)
    response = client.get("/kpis/compare", params={"project_id": 1, "lot_id": 99})
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_kpis_top_developers_lot_mode_contract_ok(monkeypatch):
    client = _build_client()

    def fake_leaderboard(self, **kwargs):
        return {"entries": []}

    monkeypatch.setattr(kpis.AnalyticsService, "get_leaderboard", fake_leaderboard)
    response = client.get("/kpis/top-developers", params={"project_id": 1, "lot_id": 77})
    assert response.status_code == 200
    assert response.json() == []


def test_analytics_latest_returns_not_found(monkeypatch):
    client = _build_client()
    monkeypatch.setattr(analytics.AnalyticsService, "get_latest_kpis", lambda self, *args, **kwargs: None)
    response = client.get("/analytics/1/latest")
    assert response.status_code == 404
    assert "ANALYTICS_SNAPSHOT_NOT_FOUND" in response.json()["detail"]


def test_analytics_dashboard_contract_ok(monkeypatch):
    client = _build_client()

    def fake_dashboard_summary(self, project_id, site_id, group_id, developer_id):
        return {"latest_metrics": None, "history": [], "comparative_by_site": [], "total_snapshots": 0}

    monkeypatch.setattr(analytics.AnalyticsService, "get_dashboard_summary", fake_dashboard_summary)
    response = client.get("/analytics/1/dashboard")
    assert response.status_code == 200
    payload = response.json()
    assert "project_id" in payload
    assert "history" in payload


def test_analytics_heatmap_contract_ok(monkeypatch):
    client = _build_client()
    monkeypatch.setattr(
        analytics.commit_repo,
        "get_daily_activity",
        lambda db, developer_id, start_date, end_date: [{"date": "2026-03-01", "count": 3}],
    )
    response = client.get("/analytics/developer/42/heatmap", params={"months": 3})
    assert response.status_code == 200
    payload = response.json()
    assert payload["developer_id"] == 42
    assert payload["total_commits"] == 3
