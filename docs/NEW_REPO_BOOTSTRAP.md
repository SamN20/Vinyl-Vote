# New Public Repository Bootstrap (Vinyl Vote)

This guide creates a clean public repository while preserving your private history in `album-vote-site`.

## Strategy

- Keep current repository private as source-of-truth history.
- Create new public repository `vinyl-vote` with curated content.
- Copy only approved files, then rotate secrets before first public push.

## 1) Create Public Repo

In GitHub, create:

- Name: `vinyl-vote`
- Visibility: Public
- Default branch: `main`

## 2) Prepare a Clean Local Export

From your private repo root:

```bash
mkdir -p ../vinyl-vote-public
rsync -av \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.venv' \
  --exclude 'venv' \
  --exclude '*.db' \
  --exclude 'temp' \
  ./ ../vinyl-vote-public/
```

## 3) Initialize New Public Git Repo

```bash
cd ../vinyl-vote-public
git init
git add .
git commit -m "chore: bootstrap Vinyl Vote public repository"
git branch -M main
git remote add origin git@github.com:<your-user>/vinyl-vote.git
git push -u origin main
```

## 4) Immediate Post-Push Checklist

- Verify `.env` is not present in repository.
- Verify no `*.db` files are present.
- Verify license and security docs are visible.
- Add GitHub secrets for deployment workflow.

## 5) Secret Rotation

Rotate all credentials that may have existed in private repo history:

- Flask `SECRET_KEY`
- Spotify credentials
- VAPID keys
- Mail credentials
- KeyN credentials
- Nolofication API key

## 6) Optional: Keep Old Repo As Upstream Private Mirror

If desired, keep private repo as an internal mirror and cherry-pick public-safe changes.

## Notes

If you decide to publish old history, use `git filter-repo` first to remove all secrets and databases from historical commits.
