# Vinyl Vote V2 Roadmap

## Goal

Ship a public, contributor-friendly, maintainable V2 with a React frontend,
Flask API backend, and reproducible Proxmox deployment.

## Phase 1: Foundation (Current)

- Add repo standards: license, contributing, security, code of conduct.
- Add CI workflows for lint, tests, backend Docker build, and frontend build.
- Add Dockerized runtime and local commands via `Makefile`.
- Bootstrap React frontend in `frontend/`.

## Phase 2: API Stabilization

- Audit existing JSON routes in `app/routes/api.py`.
- Create versioned API contract (`/api/v1/...`) for V2 clients.
- Add schema validation and error contract consistency.
- Add backend tests for key endpoint contracts.

## Phase 3: Frontend Migration

- Port voting flow first:
  - Current album fetch
  - Track voting submit
  - Vote lock state
- Port auth session UX and profile pages.
- Port results and leaderboard pages.
- Keep old templates behind `/legacy/*` during migration.

## Phase 4: Production Hardening

- Move primary deploy DB to Postgres for reliability and observability.
- Add structured logging and alerting.
- Add migration framework (Flask-Migrate/Alembic).
- Add rollback runbook and release checklist.

## Phase 5: Public Launch

- Remove sensitive artifacts from git history.
- Rotate all credentials and keys.
- Publish repository and community docs.
- Announce contribution guide and issue templates.

## Decision Log

- Monorepo chosen
- New public repository name: Vinyl Vote
- Frontend stack: React + Vite
- Hosting target: Proxmox with Docker Compose
- Delivery path: GitHub Actions + SSH deploy
- License: AGPL-3.0
