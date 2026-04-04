#!/usr/bin/env python3
"""
Migration script to add 'ignored' column to songs table.
When a song is marked as ignored, all votes for that song will be automatically ignored.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from sqlalchemy import text

def migrate():
    app = create_app()
    with app.app_context():
        # Check if column already exists
        result = db.session.execute(text("PRAGMA table_info(songs)")).fetchall()
        columns = [row[1] for row in result]
        
        if 'ignored' in columns:
            print("✓ Column 'ignored' already exists in songs table")
            return
        
        # Add the ignored column
        print("Adding 'ignored' column to songs table...")
        db.session.execute(text(
            "ALTER TABLE songs ADD COLUMN ignored BOOLEAN NOT NULL DEFAULT 0"
        ))
        db.session.commit()
        print("✓ Column 'ignored' added successfully to songs table")
        
        # Verify
        result = db.session.execute(text("PRAGMA table_info(songs)")).fetchall()
        columns = [row[1] for row in result]
        if 'ignored' in columns:
            print("✓ Migration verified successfully")
        else:
            print("✗ Migration verification failed")

if __name__ == '__main__':
    migrate()
