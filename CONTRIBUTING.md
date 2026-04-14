# Contributing to Vinyl Vote

Thanks for your interest in contributing.

## Ground Rules

- Be respectful and collaborative.
- Open an issue for non-trivial changes before implementation.
- Keep PRs focused and small.
- Never commit secrets, production data, or local DB files.

Use GitHub templates when opening issues and PRs:

- Issue templates: `.github/ISSUE_TEMPLATE/`
- PR template: `.github/pull_request_template.md`

## Development Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
cp .env.example .env
flask --app run.py db upgrade
```

Poetry setup (optional):

```bash
poetry install
cp .env.example .env
poetry run flask --app run.py db upgrade
```

Run locally:

```bash
make dev
```

Run checks:

```bash
make lint
make test
make frontend-test
```

## Branching and PRs

- Branch naming: `feature/<name>`, `fix/<name>`, `chore/<name>`.
- Create branches from an issue whenever practical and reference the issue in the PR.
- Include a short PR description with:
  - What changed
  - Why it changed
  - How it was tested
- Link related issues.

Recommended flow:

1. Open an issue using a template.
2. Create a focused branch for that issue.
3. Implement a minimal scoped change.
4. Run checks (`make lint`, `make test`, and `make frontend-test`).
5. Open a PR using the PR template and link the issue.

## Commit Style

Prefer Conventional Commits:

- `feat: add voting card API`
- `fix: handle missing spotify track id`
- `chore: add ci workflow`

## Frontend V2 Notes

React SPA work is being added incrementally.

- Keep backend API changes backward-compatible where possible.
- Add tests for new API contracts.
- Document endpoint changes in PR descriptions.

## Auth Migration Notes

- V2 now defaults to KeyN-first auth (`/login` and `/register` redirect to KeyN by default).
- Legacy form routes are still available for transition/testing:
  - `/legacy/login`
  - `/legacy/register`
- Keep auth changes backward-compatible and include route-level tests in PRs.

## Security

Please do not report security issues publicly. See `SECURITY.md`.
