"""One-time helper to add KeyN OAuth columns to the users table.

Usage:
  python scripts/add_keyn_columns.py            # perform migration
  python scripts/add_keyn_columns.py --dry-run  # show what would happen

What it does (idempotent):
  - Adds keyn_id (VARCHAR(128)) if missing
  - Adds keyn_username (VARCHAR(128)) if missing
  - Adds keyn_migrated (BOOLEAN NOT NULL DEFAULT 0) if missing

Notes:
  * Designed for SQLite (simple ALTER TABLE ADD COLUMN). Works on Postgres/MySQL too.
  * Does NOT create a unique index on keyn_id to avoid failures if data not clean yet.
    Add that later once all rows are properly linked.
"""
from __future__ import annotations
import argparse
from sqlalchemy import inspect, text
import os, sys

# Ensure project root (parent of scripts/) is on sys.path so 'app' package can be imported
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import create_app, db

COLUMNS = [
    ("keyn_id", "VARCHAR(128)"),
    ("keyn_username", "VARCHAR(128)"),
    ("keyn_migrated", "BOOLEAN NOT NULL DEFAULT 0"),
]

def detect_missing():
    insp = inspect(db.engine)
    cols = {c['name'] for c in insp.get_columns('users')}
    missing = [c for c, _ in COLUMNS if c not in cols]
    return missing

def apply(missing, dry_run: bool=False):
    if not missing:
        print("✅ All KeyN columns already present; nothing to do.")
        return
    print("Columns missing:", ", ".join(missing))
    if dry_run:
        print("(dry-run) Would execute:")
    for name, ddl in COLUMNS:
        if name not in missing:
            continue
        stmt = f"ALTER TABLE users ADD COLUMN {name} {ddl}" if name != 'keyn_migrated' else f"ALTER TABLE users ADD COLUMN {name} {ddl}"
        if dry_run:
            print("  ", stmt)
        else:
            db.session.execute(text(stmt))
    if not dry_run:
        db.session.commit()
        print("✅ Migration applied.")


def main():
    ap = argparse.ArgumentParser(description="Add KeyN OAuth columns to users table")
    ap.add_argument('--dry-run', action='store_true', help='Show actions without applying')
    args = ap.parse_args()

    app = create_app()
    with app.app_context():
        missing = detect_missing()
        apply(missing, dry_run=args.dry_run)

if __name__ == '__main__':
    main()
