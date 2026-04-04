import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'album_vote.db')

def create_table():
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Create battle_votes table
        print("Creating battle_votes table...")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS battle_votes (
                id INTEGER PRIMARY KEY,
                user_id INTEGER,
                winner_id INTEGER NOT NULL,
                loser_id INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(winner_id) REFERENCES songs(id),
                FOREIGN KEY(loser_id) REFERENCES songs(id)
            )
        ''')
        
        conn.commit()
        print("Migration successful.")
    except Exception as e:
        print(f"An error occurred: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    create_table()
