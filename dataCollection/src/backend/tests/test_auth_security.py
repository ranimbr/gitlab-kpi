from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers import auth
from app.core import security as security_core


def _build_client():
    app = FastAPI()
    app.include_router(auth.router)

    fake_db = MagicMock()

    def override_db():
        return fake_db

    app.dependency_overrides[auth.get_db] = override_db
    app.dependency_overrides[security_core.get_db] = override_db
    return TestClient(app)


def test_login_rate_limit_blocks_after_failed_attempts(monkeypatch):
    client = _build_client()
    auth._LOGIN_ATTEMPTS.clear()

    monkeypatch.setattr(auth.repo, "get_by_email", lambda db, email: None)
    monkeypatch.setattr(auth.repo, "get_by_login", lambda db, login: None)

    payload = {"email": "nobody@example.com", "password": "WrongPass123"}
    for _ in range(5):
        response = client.post("/auth/login", json=payload)
        assert response.status_code == 401
        assert "AUTH_INVALID_CREDENTIALS" in response.json()["detail"]

    blocked = client.post("/auth/login", json=payload)
    assert blocked.status_code == 429
    assert "AUTH_TOO_MANY_ATTEMPTS" in blocked.json()["detail"]


def test_auth_me_rejects_invalid_token_payload_with_standard_code(monkeypatch):
    client = _build_client()
    monkeypatch.setattr(security_core, "decode_access_token", lambda token: {"role": "super_admin"})

    response = client.get("/auth/me", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    assert "AUTH_TOKEN_PAYLOAD_INVALID" in response.json()["detail"]
