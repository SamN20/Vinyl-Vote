# AGENTS.md

Shared instructions for coding assistants working in this repository.

## Purpose

This file standardizes how AI agents contribute to Vinyl Vote V2 so issue-based and branch-based collaboration stays predictable for maintainers and new contributors.

## Read First

Before making changes, review:

1. `README.md`
2. `CONTRIBUTING.md`
3. `SECURITY.md`
4. `docs/V2_ROADMAP.md`

## Workflow Expectations

1. Work from an issue for non-trivial changes.
2. Use focused branches: `feature/<name>`, `fix/<name>`, `chore/<name>`.
3. Keep pull requests small and scoped.
4. In PR descriptions include:
   - What changed
   - Why it changed
   - How it was tested
   - Linked issue(s)

## Local Development

Prefer Docker for parity with deployment:

```bash
docker compose up --build
```

For direct Python workflows, use the documented virtualenv setup in `README.md`.

## Validation Before PR

Run project checks after making changes:

```bash
make lint
make test
```

For formatting-only updates when needed:

```bash
make format
```

## Codebase Notes

- Backend application code is in `app/`.
- Legacy server-rendered templates are in `app/templates/`.
- V2 frontend work is in `frontend/` (React + Vite).
- Utility and migration scripts are in `scripts/`.

## V2 Migration Guardrails

1. Keep API changes backward-compatible where practical during migration.
2. Prioritize endpoint contract clarity and consistent error responses.
3. Add or update tests for behavior changes, especially API routes.
4. Keep legacy behavior available until migration plans in `docs/V2_ROADMAP.md` are complete.

## Security Guardrails

1. Never commit secrets, `.env` files, production data, or local DB artifacts.
2. Do not add credentials to code, docs, logs, tests, or examples.
3. Follow `SECURITY.md` for vulnerability handling.

## Agent Behavior

1. Make minimal, targeted changes.
2. Do not refactor unrelated code.
3. Preserve existing style unless a task explicitly requests cleanup.
4. If assumptions are required, state them clearly in the PR notes.
5. If blocked by missing context, ask maintainers concise questions.

## Definition Of Done

A task is ready for review when:

1. Requested behavior is implemented.
2. Relevant tests pass locally.
3. Lint checks pass.
4. Documentation is updated for user-facing or contributor-facing changes.
5. PR description includes test evidence and linked issue.
