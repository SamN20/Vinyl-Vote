"""Add album metadata to song_requests table

This migration adds columns for spotify_id, cover_url, release_date, and spotify_url
to the song_requests table to store full album details when users request albums.
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from sqlalchemy import text

def upgrade():
    """Add new columns to song_requests table"""
    app = create_app()
    with app.app_context():
        with db.engine.connect() as conn:
            # Check if columns already exist and add them if they don't
            result = conn.execute(text("PRAGMA table_info(song_requests)"))
            existing_columns = {row[1] for row in result}
            
            if 'spotify_id' not in existing_columns:
                conn.execute(text("ALTER TABLE song_requests ADD COLUMN spotify_id VARCHAR(128)"))
                print("  ✓ Added spotify_id column")
            else:
                print("  • spotify_id column already exists")
                
            if 'cover_url' not in existing_columns:
                conn.execute(text("ALTER TABLE song_requests ADD COLUMN cover_url VARCHAR(256)"))
                print("  ✓ Added cover_url column")
            else:
                print("  • cover_url column already exists")
                
            if 'release_date' not in existing_columns:
                conn.execute(text("ALTER TABLE song_requests ADD COLUMN release_date VARCHAR(64)"))
                print("  ✓ Added release_date column")
            else:
                print("  • release_date column already exists")
                
            if 'spotify_url' not in existing_columns:
                conn.execute(text("ALTER TABLE song_requests ADD COLUMN spotify_url VARCHAR(256)"))
                print("  ✓ Added spotify_url column")
            else:
                print("  • spotify_url column already exists")
                
            conn.commit()
            print("\n✓ Successfully updated song_requests table")

def downgrade():
    """Remove the added columns"""
    app = create_app()
    with app.app_context():
        with db.engine.connect() as conn:
            # SQLite doesn't support DROP COLUMN easily, would need to recreate table
            # For now, just print a warning
            print("⚠ Downgrade not fully supported on SQLite without table recreation")
            print("  Columns will remain in table but won't be used")
            conn.commit()

if __name__ == '__main__':
    print("Running migration: add album metadata to song_requests")
    upgrade()
    print("Migration complete!")
