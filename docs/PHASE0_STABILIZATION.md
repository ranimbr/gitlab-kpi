# Phase 0 - Stabilization Checklist

This phase freezes feature work and focuses only on reliability, consistency, and baseline engineering quality.

## Objectives

- Remove critical inconsistencies and duplicate logic.
- Make behavior predictable under failures (API errors, auth errors, timeouts).
- Establish minimum quality gates before new development.

## Scope (In)

- Backend service consistency fixes.
- Frontend API layer hardening and simplification.
- Lint/test baseline setup and execution.
- Documentation alignment with actual behavior.

## Scope (Out)

- New KPIs.
- New dashboard widgets.
- Major feature redesign.

## Done So Far

- Removed duplicate `get_merge_request_notes()` declaration in `gitlab_client.py`.
- Simplified `frontend/src/services/api.js` by removing unstable request de-dup mechanism and keeping robust auth/error handling.

## Remaining Tasks

1. Backend cleanup
   - Remove duplicate or dead code paths in extraction/KPI services.
   - Normalize exception mapping in API routers.
2. Frontend cleanup
   - Ensure all services use shared API client consistently.
   - Remove stale comments and historical "hotfix" noise.
3. Quality gates
   - Run backend tests in a reproducible environment.
   - Run frontend lint and build checks.
4. Documentation
   - Update README "known limitations" and "stabilization status".

## Exit Criteria

- No known duplicate method definitions in core services.
- API client behavior is deterministic for `401`, timeout, and network failures.
- Backend and frontend checks pass locally.
- Phase 0 status documented and reviewable.
