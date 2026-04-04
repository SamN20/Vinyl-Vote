import sys
import os
import json
import time

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from app.models import Album
from app.utils import get_album_spotify_data

def backfill():
    app = create_app()
    with app.app_context():
        albums = Album.query.all()
        print(f"Found {len(albums)} albums. checking for missing spotify_data...")
        
        count = 0
        for album in albums:
            if not album.spotify_data and album.spotify_url:
                print(f"Backfilling {album.title} - {album.artist}...")
                try:
                    sp_id = album.spotify_url.split('/')[-1].split('?')[0]
                    data = get_album_spotify_data(sp_id)
                    if data:
                        album.spotify_data = json.dumps(data)
                        db.session.commit()
                        print(f"  -> Success: {len(data['genres'])} genres, popularity {data['popularity']}")
                        count += 1
                        time.sleep(0.5) # rate limit politeness
                    else:
                        print("  -> Failed to fetch data.")
                except Exception as e:
                    print(f"  -> Error: {e}")
            else:
                if not album.spotify_url:
                    print(f"Skipping {album.title}: No Spotify URL")
                else:
                    pass # already has data
        
        print(f"Backfill complete. Updated {count} albums.")

if __name__ == "__main__":
    backfill()
