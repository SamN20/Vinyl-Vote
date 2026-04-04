import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'instance', 'album_vote.db')
# Adjust path if instance folder is not used or different
# Based on file listing, db is in root: /home/sam/album-vote-site/album_vote.db
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'album_vote.db')

def add_columns():
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Check if columns exist
        cursor.execute("PRAGMA table_info(songs)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'elo_rating' not in columns:
            print("Adding elo_rating column...")
            cursor.execute("ALTER TABLE songs ADD COLUMN elo_rating REAL DEFAULT 1000.0")
        else:
            print("elo_rating column already exists.")

        if 'match_count' not in columns:
            print("Adding match_count column...")
            cursor.execute("ALTER TABLE songs ADD COLUMN match_count INTEGER DEFAULT 0")
        else:
            print("match_count column already exists.")
            
        conn.commit()
        print("Migration successful.")
    except Exception as e:
        print(f"An error occurred: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    add_columns()
