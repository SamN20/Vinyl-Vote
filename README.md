# Vinyl Vote

Vinyl Vote is an "album of the week" voting platform. The current production app is Flask server-rendered, and V2 work is now in progress to modernize frontend architecture, improve developer workflow, and prepare the project for public open-source collaboration.

## Current Status

- Backend: Flask app in `app/`
- Frontend: Jinja templates + vanilla JavaScript + CSS
- Notifications: VAPID web push + Nolofication integration
- Auth: local auth + KeyN OAuth integration
- Scheduler: APScheduler jobs for reminders and weekly rollover

## V2 Direction

- Monorepo approach for backend + new React frontend
- Docker-first local and server workflow (Proxmox-friendly)
- CI via GitHub Actions
- Public repo standards (license, contributing, security policy)

V2 roadmap details are in `docs/V2_ROADMAP.md`.

## Quick Start (Current Flask App)

### Requirements

- Python 3.11+
- Spotify API credentials
- Email credentials (if email notifications are enabled)

### Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python generate_vapid_keys.py
flask --app run.py db upgrade
python run.py
```

For first-time local bootstrap on existing databases, `python db_create.py` is still available.

### Poetry Setup (Optional, recommended for V2)

```bash
poetry install
cp .env.example .env
poetry run flask --app run.py db upgrade
poetry run python run.py
```

The app runs at `http://127.0.0.1:5000`.

## Docker (New Workflow)

Use Docker Compose for local parity and future Proxmox deployment:

```bash
docker compose up --build
```

See `docs/PROXMOX_DEPLOY.md` for deployment flow and `docker-compose.yml` for local services.

## Developer Commands

With virtualenv active:

```bash
make dev
make test
make lint
```

Using Poetry:

```bash
make poetry-install
make poetry-dev
make poetry-test
make poetry-lint
```

## Project Layout

- `app/`: Flask backend package
- `scripts/`: migration and utility scripts
- `extension/`: browser extension assets
- `docs/`: architecture, roadmap, deployment notes
- `.github/workflows/`: CI and deploy automation

## Security and Open Source

- Do not commit `.env`, database files, or local virtualenv directories.
- Follow `SECURITY.md` for vulnerability reporting.
- Read `CONTRIBUTING.md` before opening PRs.

## AI Agent Contributor Guidance

To keep AI-assisted contributions consistent and reviewable:

- Canonical policy: `AGENTS.md`
- GitHub Copilot: `.github/copilot-instructions.md`
- Claude Code compatibility: `CLAUDE.md`
- Gemini CLI compatibility: `GEMINI.md`

## KeyN OAuth Notes

Set these in `.env`:

```text
KEYN_AUTH_SERVER_URL=https://auth-keyn.bynolo.ca
KEYN_CLIENT_ID=your_client_id
KEYN_CLIENT_SECRET=your_client_secret
KEYN_CLIENT_REDIRECT=http://127.0.0.1:5000/oauth/callback
KEYN_DEFAULT_SCOPES=id,username,email,display_name,is_verified
```

Auth defaults in V2 migration:

- `FORCE_KEYN_LOGIN=true` (default)
- `FORCE_KEYN_REGISTRATION=true` (default)

This makes `/login` and `/register` KeyN-first by default.
Legacy fallback routes remain available during migration:

- `/legacy/login`
- `/legacy/register`

Migration helper:

```bash
python scripts/migrate_keyn.py audit
python scripts/migrate_keyn.py link --file users.csv
```

## License

Licensed under AGPL-3.0. See `LICENSE`.

