"""Migration & reconciliation script for linking legacy users to KeyN accounts.

Usage:
  python scripts/migrate_keyn.py audit            # Show summary of linkage status
  python scripts/migrate_keyn.py link --file users.csv  # Bulk link by CSV mapping

CSV format (no header required or with header columns keyn_id,local_username,email):
keyn_id,local_username,email
12345,legacyUser,user@example.com
...

The script attempts to:
 1. Link by exact username if provided and available.
 2. Otherwise find by email.
 3. Mark keyn_migrated flag.

It will not overwrite existing keyn_id links unless --force specified.
"""
from __future__ import annotations
import csv
import argparse
import os
from flask import Flask
import os, sys

# Ensure project root (parent of scripts/) is on sys.path for 'app' imports
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import create_app, db
from app.models import User


def audit():
    total = User.query.count()
    linked = User.query.filter(User.keyn_id.isnot(None)).count()
    migrated = User.query.filter_by(keyn_migrated=True).count()
    print(f"Total users: {total}")
    print(f"Linked users (keyn_id set): {linked}")
    print(f"Migrated flag true: {migrated}")
    print(f"Unlinked: {total - linked}")

    # Potential duplicates by email that could cause ambiguity
    dup_emails = db.session.execute(
        db.text("SELECT email, COUNT(*) c FROM users WHERE email IS NOT NULL GROUP BY email HAVING c>1")
    ).fetchall()
    if dup_emails:
        print("Duplicate emails detected (manual review needed):")
        for row in dup_emails:
            print(f"  {row.email} -> {row.c} accounts")


def bulk_link(path: str, force: bool = False):
    with open(path, newline='') as f:
        reader = csv.DictReader(f)
        # if no header treat columns sequentially
        if reader.fieldnames is None:
            f.seek(0)
            reader = csv.reader(f)
            rows = []
            for r in reader:
                if not r:
                    continue
                keyn_id, username, email = (r + [None, None, None])[:3]
                rows.append({'keyn_id': keyn_id, 'local_username': username, 'email': email})
        else:
            rows = []
            for r in reader:
                rows.append({
                    'keyn_id': r.get('keyn_id') or r.get('id'),
                    'local_username': r.get('local_username') or r.get('username'),
                    'email': r.get('email')
                })

    linked = 0
    skipped = 0
    for row in rows:
        keyn_id = row['keyn_id']
        if not keyn_id:
            print('Skipping row with no keyn_id')
            skipped += 1
            continue
        user = None
        if row['local_username']:
            user = User.query.filter_by(username=row['local_username']).first()
        if not user and row['email']:
            user = User.query.filter_by(email=row['email']).first()
        if not user:
            print(f"No local match for KeyN {keyn_id} ({row['local_username']}/{row['email']})")
            skipped += 1
            continue
        if user.keyn_id and user.keyn_id != keyn_id and not force:
            print(f"User {user.username} already linked to {user.keyn_id}, skipping (use --force to override)")
            skipped += 1
            continue
        user.keyn_id = keyn_id
        user.keyn_migrated = True
        linked += 1
    db.session.commit()
    print(f"Linked {linked} users; skipped {skipped}")


def main():
    parser = argparse.ArgumentParser(description='KeyN migration helper')
    sub = parser.add_subparsers(dest='cmd')
    sub.add_parser('audit')
    p_link = sub.add_parser('link')
    p_link.add_argument('--file', required=True)
    p_link.add_argument('--force', action='store_true')

    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if args.cmd == 'audit' or args.cmd is None:
            audit()
        elif args.cmd == 'link':
            bulk_link(args.file, force=args.force)
        else:
            parser.print_help()

if __name__ == '__main__':
    main()
