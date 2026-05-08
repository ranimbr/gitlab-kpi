# Security Hardening Checkpoint

## Scope completed

This checkpoint covers the mini hardening security pass performed on backend API contracts and authentication/session behaviors.

## Changes implemented

### 1) Standardized API errors for sensitive endpoints

- Added normalized error format `CODE: message` in:
  - `src/backend/app/api/routers/projects.py`
  - `src/backend/app/api/routers/gitlab_configs.py`
- Reduced internal information leakage in project and GitLab config flows:
  - removed raw network exception details from public responses
  - removed exposure of raw GitLab response body in `/gitlab-configs/{id}/test`
  - replaced token decryption/encryption internals in responses with controlled messages

### 2) Login brute-force protection

- Added lightweight in-memory login throttling in:
  - `src/backend/app/api/routers/auth.py`
- Behavior:
  - key: `client_ip + login_hint`
  - default threshold: 5 failed attempts
  - lock duration: 300 seconds
  - successful login resets bucket
- Added standardized auth errors:
  - `AUTH_INVALID_CREDENTIALS`
  - `AUTH_USER_INACTIVE`
  - `AUTH_TOO_MANY_ATTEMPTS`
  - `AUTH_EMAIL_ALREADY_REGISTERED`
  - `AUTH_LOGIN_ALREADY_TAKEN`

### 3) Configurable security knobs via environment

- Added new settings in:
  - `src/backend/app/core/config.py`
    - `LOGIN_MAX_ATTEMPTS` (default: 5)
    - `LOGIN_LOCK_SECONDS` (default: 300)
- Wired those settings in:
  - `src/backend/app/api/routers/auth.py`
- Documented env variables in:
  - `src/backend/.env.example`

### 4) Standardized JWT dependency errors

- Updated `src/backend/app/core/security.py` to use `CODE: message` for auth dependency failures:
  - `AUTH_TOKEN_INVALID_OR_EXPIRED`
  - `AUTH_TOKEN_PAYLOAD_INVALID`
  - `AUTH_TOKEN_USER_ID_INVALID`
  - `AUTH_USER_NOT_FOUND`
  - `AUTH_USER_INACTIVE`

## Validation performed

- Python compile checks on modified files: OK
- Targeted lint checks on modified files: OK
- API smoke tests:
  - `src/backend/tests/test_api_smoke.py`
  - result: all tests passed during hardening iterations

## Residual risks / limitations

1. In-memory login throttle is per-process only.
   - In multi-worker/multi-instance deployments, counters are not shared.
   - Recommended next step: shared store (Redis) for distributed rate limiting.

2. Rate limit key includes login hint.
   - Better against account-targeted brute force, but IP-only global caps are not implemented.
   - Recommended next step: dual limiter (IP global + account scoped).

3. Security response contract is standardized on key routers, but not yet universal.
   - Recommended next step: roll out `_http_error` pattern progressively to remaining routers.

4. Legacy tests excluded from CI remain a quality risk.
   - `test_kpi_calculator.py` inconsistency should be fixed in a dedicated hardening ticket.

## Recommended next security steps (priority order)

1. Add Redis-backed distributed rate limiter for `/auth/login`.
2. Add structured security audit logs for failed auth attempts.
3. Enforce stronger production guardrails:
   - fail-fast when `SECRET_KEY` is default in non-debug mode
   - explicit checks for secure CORS in production
4. Add focused tests for auth throttling and JWT error contract.
