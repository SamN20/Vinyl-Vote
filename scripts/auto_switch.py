from datetime import datetime, timedelta
import pytz

from app import create_app, db
from app.models import Album

# Voting ends at Sunday 11:59 PM Eastern
def get_vote_end_time():
    eastern = pytz.timezone('America/Toronto')
    now = datetime.now(eastern)

    days_ahead = 6 - now.weekday()
    if days_ahead < 0:
        days_ahead += 7

    end_of_week = now + timedelta(days=days_ahead)
    end_of_week = end_of_week.replace(hour=23, minute=59, second=59, microsecond=0)
    return end_of_week

app = create_app()

with app.app_context():
    eastern = pytz.timezone('America/Toronto')
    now = datetime.now(eastern)

    vote_end = get_vote_end_time()

    if now > vote_end:
        print("⏰ Voting period has ended. Rotating albums...")

        # Archive current
        current = Album.query.filter_by(is_current=True).first()
        if current:
            current.is_current = False
            print(f"📦 Archived album: {current.title} by {current.artist}")

        # Get next album in queue
        next_album = Album.query.filter(Album.queue_order > 0).order_by(Album.queue_order.asc()).first()
        if next_album:
            next_album.is_current = True
            print(f"✅ New current album: {next_album.title} by {next_album.artist}")
        else:
            print("⚠️ No album in queue. Nothing promoted.")

        db.session.commit()
    else:
        print("🕒 Voting still active. No changes made.")
