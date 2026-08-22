from datetime import datetime, timezone
from flask_login import UserMixin
from . import db

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True)  # new email field
    password_hash = db.Column(db.String(128), nullable=False)
    date_joined = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    push_subscription = db.Column(db.Text)  # JSON subscription object
    is_admin = db.Column(db.Boolean, default=False)

    is_banned    = db.Column(db.Boolean, default=False, nullable=False)
    last_login   = db.Column(db.DateTime, nullable=True)

    # --- KeyN OAuth migration fields ---
    # External KeyN user ID (string because remote IDs may not be ints)
    keyn_id = db.Column(db.String(128), unique=True, nullable=True, index=True)
    # Cached KeyN display name / username (optional convenience)
    keyn_username = db.Column(db.String(128), nullable=True)
    # Flag indicating this legacy local account has been migrated/linked to KeyN
    keyn_migrated = db.Column(db.Boolean, default=False, nullable=False)
    # JSON snapshot of last fetched KeyN profile / scoped data
    keyn_profile_json = db.Column(db.Text, nullable=True)

    votes = db.relationship('Vote', backref='user', lazy=True)
    album_scores = db.relationship('AlbumScore', backref='user', lazy=True)

    song_requests = db.relationship('SongRequest', back_populates='user', cascade='all, delete-orphan')

class Album(db.Model):
    __tablename__ = 'albums'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(128), nullable=False)
    artist = db.Column(db.String(128), nullable=False)
    release_date = db.Column(db.String(64))
    cover_url = db.Column(db.String(256))
    spotify_url = db.Column(db.String(256))
    apple_url = db.Column(db.String(256))
    youtube_url = db.Column(db.String(256))
    is_current = db.Column(db.Boolean, default=False)
    queue_order = db.Column(db.Integer, default=0)  # 0 means unscheduled
    
    # Store Spotify audio features (valence, energy, etc.) and genres as JSON
    spotify_data = db.Column(db.Text, nullable=True)

    songs = db.relationship('Song', backref='album', lazy=True)
    album_scores = db.relationship('AlbumScore', backref='album', lazy=True)

class Song(db.Model):
    __tablename__ = 'songs'
    id = db.Column(db.Integer, primary_key=True)
    album_id = db.Column(db.Integer, db.ForeignKey('albums.id'), nullable=False)
    title = db.Column(db.String(128), nullable=False)
    track_number = db.Column(db.Integer)
    duration = db.Column(db.String(16))

    spotify_url = db.Column(db.String(256))
    spotify_track_id = db.Column(db.String(128), nullable=True, index=True)
    isrc = db.Column(db.String(32), nullable=True, index=True)
    apple_url = db.Column(db.String(256))
    youtube_url = db.Column(db.String(256))
    
    # When True, all votes for this song are automatically marked as ignored
    ignored = db.Column(db.Boolean, default=False, nullable=False)

    votes = db.relationship('Vote', backref='song', lazy=True)
    battle_votes_won = db.relationship('BattleVote', foreign_keys='BattleVote.winner_id', backref='winner', lazy='dynamic')
    battle_votes_lost = db.relationship('BattleVote', foreign_keys='BattleVote.loser_id', backref='loser', lazy='dynamic')

    # Elo Rating System
    elo_rating = db.Column(db.Float, default=1000.0)
    match_count = db.Column(db.Integer, default=0)

    audio_matches = db.relationship('SongAudioMatch', backref='song', lazy=True, cascade='all, delete-orphan')


class SongAudioMatch(db.Model):
    __tablename__ = 'song_audio_matches'
    id = db.Column(db.Integer, primary_key=True)
    song_id = db.Column(db.Integer, db.ForeignKey('songs.id'), nullable=False)
    provider = db.Column(db.String(32), nullable=False, default='deezer')
    provider_track_id = db.Column(db.String(128), nullable=True)
    match_status = db.Column(db.String(32), nullable=False, default='missing')
    match_confidence = db.Column(db.Float, nullable=True)
    preview_available = db.Column(db.Boolean, default=False, nullable=False)
    isrc = db.Column(db.String(32), nullable=True)
    matched_title = db.Column(db.String(256), nullable=True)
    matched_artist = db.Column(db.String(256), nullable=True)
    matched_album = db.Column(db.String(256), nullable=True)
    matched_duration = db.Column(db.Integer, nullable=True)
    reviewed = db.Column(db.Boolean, default=False, nullable=False)
    override = db.Column(db.Boolean, default=False, nullable=False)
    disabled = db.Column(db.Boolean, default=False, nullable=False)
    notes = db.Column(db.Text, nullable=True)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.UniqueConstraint('song_id', 'provider', name='uq_song_audio_match_song_provider'),
        db.Index('ix_song_audio_matches_provider_track', 'provider', 'provider_track_id'),
        db.Index('ix_song_audio_matches_status', 'provider', 'match_status', 'preview_available'),
    )


class NeedleDropDailyChallenge(db.Model):
    __tablename__ = 'needle_drop_daily_challenges'
    id = db.Column(db.Integer, primary_key=True)
    local_date = db.Column(db.String(10), unique=True, nullable=False, index=True)
    song_id = db.Column(db.Integer, db.ForeignKey('songs.id'), nullable=False)
    provider = db.Column(db.String(32), nullable=False, default='deezer')
    provider_track_id = db.Column(db.String(128), nullable=False)
    clip_offset_seconds = db.Column(db.Float, nullable=False, default=0.0)
    selection_seed = db.Column(db.String(128), nullable=False)
    published_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = db.Column(db.DateTime, nullable=False)

    song = db.relationship('Song', backref='needle_drop_dailies')


class NeedleDropSession(db.Model):
    __tablename__ = 'needle_drop_sessions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    mode = db.Column(db.String(16), nullable=False)
    daily_challenge_id = db.Column(db.Integer, db.ForeignKey('needle_drop_daily_challenges.id'), nullable=True)
    song_id = db.Column(db.Integer, db.ForeignKey('songs.id'), nullable=False)
    filter_key = db.Column(db.String(64), nullable=True)
    status = db.Column(db.String(16), nullable=False, default='active')
    attempts_used = db.Column(db.Integer, nullable=False, default=0)
    started_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    completed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship('User', backref='needle_drop_sessions')
    daily_challenge = db.relationship('NeedleDropDailyChallenge', backref='sessions')
    song = db.relationship('Song', backref='needle_drop_sessions')

    __table_args__ = (
        db.Index('ix_needle_drop_sessions_user_mode', 'user_id', 'mode', 'status'),
        db.UniqueConstraint('user_id', 'daily_challenge_id', name='uq_needle_drop_daily_user_session'),
    )


class NeedleDropAttempt(db.Model):
    __tablename__ = 'needle_drop_attempts'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('needle_drop_sessions.id'), nullable=False)
    attempt_number = db.Column(db.Integer, nullable=False)
    guess_type = db.Column(db.String(16), nullable=False)
    guessed_song_id = db.Column(db.Integer, db.ForeignKey('songs.id'), nullable=True)
    guessed_artist = db.Column(db.String(256), nullable=True)
    result = db.Column(db.String(32), nullable=False)
    clip_length = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    session = db.relationship('NeedleDropSession', backref='attempts')
    guessed_song = db.relationship('Song')

    __table_args__ = (
        db.UniqueConstraint('session_id', 'attempt_number', name='uq_needle_drop_attempt_number'),
    )


class NeedleDropRecognitionStat(db.Model):
    __tablename__ = 'needle_drop_recognition_stats'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    song_id = db.Column(db.Integer, db.ForeignKey('songs.id'), nullable=False)
    exact_correct_count = db.Column(db.Integer, nullable=False, default=0)
    artist_recognition_count = db.Column(db.Integer, nullable=False, default=0)
    failure_count = db.Column(db.Integer, nullable=False, default=0)
    best_attempt = db.Column(db.Integer, nullable=True)
    last_exact_at = db.Column(db.DateTime, nullable=True)
    last_artist_at = db.Column(db.DateTime, nullable=True)
    last_failed_at = db.Column(db.DateTime, nullable=True)
    cooldown_until = db.Column(db.DateTime, nullable=True)

    user = db.relationship('User', backref='needle_drop_recognition_stats')
    song = db.relationship('Song', backref='needle_drop_recognition_stats')

    __table_args__ = (
        db.UniqueConstraint('user_id', 'song_id', name='uq_needle_drop_user_song_stat'),
        db.Index('ix_needle_drop_recognition_lookup', 'user_id', 'song_id', 'cooldown_until'),
    )

class Vote(db.Model):
    __tablename__ = 'votes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    song_id = db.Column(db.Integer, db.ForeignKey('songs.id'), nullable=False)
    score = db.Column(db.Float, nullable=False)  # 1–5
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    ignored = db.Column(db.Boolean, default=False, nullable=False)
    # mark whether this vote was submitted after the album's voting window
    retroactive = db.Column(db.Boolean, default=False, nullable=False)

class AlbumScore(db.Model):
    __tablename__ = 'album_scores'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    album_id = db.Column(db.Integer, db.ForeignKey('albums.id'), nullable=False)
    personal_score = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    ignored = db.Column(db.Boolean, default=False, nullable=False)
    # mark whether this album score was submitted retroactively
    retroactive = db.Column(db.Boolean, default=False, nullable=False)

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(20))  # "banner" or "popup"
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)

class SongRequest(db.Model):
    __tablename__ = 'song_requests'
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title      = db.Column(db.String(200), nullable=False)
    artist     = db.Column(db.String(200), nullable=False)
    timestamp  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    fulfilled  = db.Column(db.Boolean, default=False, nullable=False)
    
    # Additional metadata fields for album details
    spotify_id     = db.Column(db.String(128), nullable=True)  # Spotify album ID
    cover_url      = db.Column(db.String(256), nullable=True)  # Album cover image URL
    release_date   = db.Column(db.String(64), nullable=True)   # Album release date
    spotify_url    = db.Column(db.String(256), nullable=True)  # Direct Spotify link

    # optional backref if you want to see user.song_requests
    user       = db.relationship('User', back_populates='song_requests')

class VotePeriod(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    end_time = db.Column(db.DateTime, nullable=False)

class Setting(db.Model):
    """Key/value store for simple site settings."""
    __tablename__ = 'settings'
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(64), unique=True, nullable=False)
    value = db.Column(db.String(256))

class NextAlbumVote(db.Model):
    """A user's pick for the next album."""
    __tablename__ = 'next_album_votes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    album_id = db.Column(db.Integer, db.ForeignKey('albums.id'), nullable=False)
    vote_period_id = db.Column(db.Integer, db.ForeignKey('vote_period.id'), nullable=False)
class Comment(db.Model):
    __tablename__ = 'comments'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    album_id = db.Column(db.Integer, db.ForeignKey('albums.id'), nullable=False)
    text = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    is_hidden = db.Column(db.Boolean, default=False) # For auto-mod or admin hide
    is_flagged = db.Column(db.Boolean, default=False) # For user reports
    parent_id = db.Column(db.Integer, db.ForeignKey('comments.id'), nullable=True)

    user = db.relationship('User', backref='comments', lazy=True)
    album = db.relationship('Album', backref='comments', lazy=True)
    replies = db.relationship('Comment', backref=db.backref('parent', remote_side=[id]), lazy=True)

class BattleVote(db.Model):
    __tablename__ = 'battle_votes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    winner_id = db.Column(db.Integer, db.ForeignKey('songs.id'), nullable=False)
    loser_id = db.Column(db.Integer, db.ForeignKey('songs.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', backref='battle_votes', lazy=True)
