from app import create_app, db
from app.models import VotePeriod, Setting
from config import Config
from datetime import datetime

app = create_app()

with app.app_context():
    db.create_all()
    # Initialize the vote period entry
    vote_period = db.session.get(VotePeriod, 1)
    if not vote_period:
        vote_end_iso = Config.get_vote_end_time()
        vote_end_dt = datetime.fromisoformat(vote_end_iso)
        vote_period = VotePeriod(id=1, end_time=vote_end_dt)
        db.session.add(vote_period)
        db.session.commit()

    setting = Setting.query.filter_by(key='NEXT_ALBUM_OPTION_COUNT').first()
    if not setting:
        setting = Setting(key='NEXT_ALBUM_OPTION_COUNT', value=str(Config.NEXT_ALBUM_OPTION_COUNT))
        db.session.add(setting)
        db.session.commit()

    print("✅ Database created.")