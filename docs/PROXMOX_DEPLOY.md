# Deploying Vinyl Vote on Proxmox

This document defines a practical GitHub Actions -> SSH -> Docker Compose deploy flow.

## Server Prep

1. Install Docker and Docker Compose plugin on the VM/LXC that will run Vinyl Vote.
2. Create deploy path, for example `/opt/vinyl-vote`.
3. Clone repository to deploy path.
4. Add `.env` on server with production secrets.
5. Ensure a writable `db/` folder exists beside `docker-compose.prod.yml` (the stack bind-mounts SQLite there).

## GitHub Secrets

Set the following repository secrets:

- `PROXMOX_SSH_HOST`
- `PROXMOX_SSH_USER`
- `PROXMOX_SSH_PRIVATE_KEY`
- `PROXMOX_SSH_PORT`
- `PROXMOX_DEPLOY_PATH`

## First Deploy

On server:

```bash
cd /opt/vinyl-vote
# choose any free host port for frontend (example: 8088)
export FRONTEND_HOST_PORT=8088
export PUBLIC_SITE_URL=https://vinylvote.yourdomain.com
docker compose -f docker-compose.prod.yml up -d --build
```

## Continuous Deploy

Workflow file: `.github/workflows/deploy-proxmox.yml`

On `main` push (or manual dispatch), GitHub Actions will:

1. SSH to server
2. Pull latest `main`
3. Rebuild and restart containers
4. Prune old images

## Reverse Proxy

Terminate TLS at your reverse proxy (Nginx/Caddy/Traefik) and forward to app container:

- upstream: `http://127.0.0.1:<FRONTEND_HOST_PORT>`
- enforce HTTPS
- set secure headers

`docker-compose.prod.yml` serves the React frontend at `${FRONTEND_HOST_PORT}` (default `8088`) and proxies API/auth routes to backend.
BrowserRouter deep links are handled by the frontend nginx fallback to `index.html`.
Frontend SEO tags in `frontend/index.html` are built from `PUBLIC_SITE_URL`.

## Cloudflare Tunnel (Separate Host)

If your Cloudflare Tunnel runs on a different server in your LAN, point the tunnel ingress to this app server:

- `http://<VINYL_VOTE_LAN_IP>:<FRONTEND_HOST_PORT>`

Example ingress target:

```yaml
ingress:
	- hostname: vinylvote.yourdomain.com
		service: http://192.168.1.50:8088
	- service: http_status:404
```

Use your app server LAN IP and the same `FRONTEND_HOST_PORT` value from `.env`.

## Rollback

If deployment fails:

```bash
cd /opt/vinyl-vote
git log --oneline -n 5
git reset --hard <last-good-commit>
docker compose -f docker-compose.prod.yml up -d --build
```

## Hardening Checklist

- Set `REMEMBER_COOKIE_SECURE=true`
- Set `SESSION_COOKIE_SECURE=true`
- Ensure strong `SECRET_KEY`
- Rotate VAPID and API keys if previously exposed
- Restrict SSH key to deploy-only host/user

## Production Compose Notes

- Stack file: `docker-compose.prod.yml`
- Services: `frontend`, `web`, `scheduler`
- Scheduler runs in its own container (`ENABLE_SCHEDULER=true`) while `web` keeps scheduler off (`ENABLE_SCHEDULER=false`)
- SQLite database file is persisted in the host `db/` folder
- Frontend host port is configurable with `FRONTEND_HOST_PORT` (default `8088`)
- If you terminate TLS before the container, keep secure cookie flags enabled
- Web container runs `flask db upgrade` on startup by default (`RUN_MIGRATIONS_ON_START=true`)

## Centralized URL Configuration

Configure external/manage URLs in `.env` instead of editing code:

- `KEYN_AUTH_SERVER_URL`
- `KEYN_PROFILE_URL` (optional override)
- `KEYN_EDIT_PROFILE_URL` (optional override)
- `KEYN_CHANGE_PASSWORD_URL` (optional override)
- `NOLOFICATION_URL`
- `NOLOFICATION_SITE_ID`
- `NOLOFICATION_PREFERENCES_URL` (optional override)
- `CHROME_EXTENSION_STORE_URL`

## Troubleshooting 500 on `/api/v1/*`

If frontend loads but API routes return 500:

1. Check logs:

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 web
docker compose -f docker-compose.prod.yml logs --tail=120 scheduler
```

2. If you see `sqlite3.OperationalError: unable to open database file`, check that the host `db/` folder exists and is writable, then rebuild and restart:

```bash
docker compose -f docker-compose.prod.yml down
mkdir -p db
docker compose -f docker-compose.prod.yml up -d --build
```
