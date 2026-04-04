# Deploying Vinyl Vote on Proxmox

This document defines a practical GitHub Actions -> SSH -> Docker Compose deploy flow.

## Server Prep

1. Install Docker and Docker Compose plugin on the VM/LXC that will run Vinyl Vote.
2. Create deploy path, for example `/opt/vinyl-vote`.
3. Clone repository to deploy path.
4. Add `.env` on server with production secrets.

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
docker compose up -d --build
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

- upstream: `http://127.0.0.1:5000`
- enforce HTTPS
- set secure headers

## Rollback

If deployment fails:

```bash
cd /opt/vinyl-vote
git log --oneline -n 5
git reset --hard <last-good-commit>
docker compose up -d --build
```

## Hardening Checklist

- Set `REMEMBER_COOKIE_SECURE=true`
- Ensure strong `SECRET_KEY`
- Rotate VAPID and API keys if previously exposed
- Restrict SSH key to deploy-only host/user
