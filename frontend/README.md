# Vinyl Vote Frontend (V2)

React + Vite frontend for Vinyl Vote V2.

## Current Migration Scope

- KeyN-aware session bootstrap using `/api/v1/session-check`
- Current album fetch via `/api/v1/current-album`
- Vote submit flow via `/api/v1/votes`
- Results page flow via `/api/v1/results/*`
- Data leaderboard pages via `/api/v1/leaderboard/*`
- Legacy login fallback link for transition users

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm run test
```

## Dev Integration

By default, Vite proxies backend routes to `http://127.0.0.1:5000` for local dev:

- `/api/*`
- `/oauth/*`
- `/login`
- `/register`
- `/legacy/*`

You can also set `VITE_API_BASE_URL` to point to a separate backend host.

Example:

```bash
VITE_API_BASE_URL=http://127.0.0.1:5000 npm run dev
```
