import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from sqlalchemy import text

app = create_app()

with app.app_context():
    try:
        # Check if column exists first
        result = db.session.execute(text("PRAGMA table_info(albums)")).fetchall()
        columns = [row[1] for row in result]
        if 'spotify_data' in columns:
            print("Column 'spotify_data' already exists.")
        else:
            print("Adding 'spotify_data' column to 'albums' table...")
            db.session.execute(text("ALTER TABLE albums ADD COLUMN spotify_data TEXT"))
            db.session.commit()
            print("Migration successful.")
    except Exception as e:
        print(f"Migration failed: {e}")
        db.session.rollback()
