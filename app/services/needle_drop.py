from __future__ import annotations

import hashlib
import json
import random
import re
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app, url_for
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload

from .. import db
from ..models import (
    Album,
    AlbumScore,
    BattleVote,
    NeedleDropAttempt,
    NeedleDropDailyChallenge,
    NeedleDropRecognitionStat,
    NeedleDropSession,
    Song,
    SongAudioMatch,
    Vote,
)


TORONTO = ZoneInfo("America/Toronto")
CLIP_LENGTHS = [0.75, 1.5, 3, 6, 12, 20]
MAX_ATTEMPTS = len(CLIP_LENGTHS)
PROVIDER = "deezer"


def normalize_guess(value):
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def parse_duration_seconds(duration):
    if not duration:
        return None
    parts = str(duration).split(":")
    try:
        nums = [int(part) for part in parts]
    except ValueError:
        return None
    if len(nums) == 2:
        return nums[0] * 60 + nums[1]
    if len(nums) == 3:
        return nums[0] * 3600 + nums[1] * 60 + nums[2]
    return None


def today_local_date():
    return datetime.now(TORONTO).date()


def local_day_window(local_date):
    start = datetime.combine(local_date, time.min, tzinfo=TORONTO)
    end = start + timedelta(days=1)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def _aware_utc(value):
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_expired(challenge):
    expires = _aware_utc(challenge.expires_at)
    return bool(expires and datetime.now(timezone.utc) >= expires)


def _current_album_order():
    current = Album.query.filter_by(is_current=True).first()
    return current.queue_order if current and current.queue_order else None


def eligible_song_query():
    current_order = _current_album_order()
    query = (
        Song.query.options(joinedload(Song.album))
        .join(Album)
        .join(SongAudioMatch, SongAudioMatch.song_id == Song.id)
        .filter(
            Album.queue_order > 0,
            Song.ignored.is_(False),
            SongAudioMatch.provider == PROVIDER,
            SongAudioMatch.provider_track_id.isnot(None),
            SongAudioMatch.preview_available.is_(True),
            SongAudioMatch.disabled.is_(False),
        )
    )
    if current_order:
        query = query.filter(Album.queue_order < current_order)
    return query


def eligible_songs():
    return eligible_song_query().order_by(Album.queue_order, Song.track_number, Song.id).all()


def match_for_song(song):
    return (
        SongAudioMatch.query.filter_by(song_id=song.id, provider=PROVIDER)
        .filter(SongAudioMatch.disabled.is_(False))
        .first()
    )


def ensure_daily_challenge(local_date=None):
    local_date = local_date or today_local_date()
    date_key = local_date.isoformat()
    existing = NeedleDropDailyChallenge.query.filter_by(local_date=date_key).first()
    if existing:
        return existing

    pool = eligible_songs()
    if not pool:
        return None

    used_song_ids = {
        row[0]
        for row in db.session.query(NeedleDropDailyChallenge.song_id).distinct().all()
    }
    unused = [song for song in pool if song.id not in used_song_ids]
    if len(unused) < max(2, int(len(pool) * 0.05)):
        unused = pool

    seed = hashlib.sha256(f"needle-drop:{date_key}:{current_app.config.get('SECRET_KEY', '')}".encode()).hexdigest()
    rng = random.Random(seed)
    song = rng.choice(unused)
    match = match_for_song(song)
    if not match or not match.provider_track_id:
        return None

    _, expires_at = local_day_window(local_date)
    max_offset = max(0, 30 - int(max(CLIP_LENGTHS)))
    offset = round(rng.uniform(0, max_offset), 2) if max_offset else 0.0
    challenge = NeedleDropDailyChallenge(
        local_date=date_key,
        song_id=song.id,
        provider=PROVIDER,
        provider_track_id=match.provider_track_id,
        clip_offset_seconds=offset,
        selection_seed=seed[:32],
        published_at=datetime.now(timezone.utc),
        expires_at=expires_at,
    )
    db.session.add(challenge)
    db.session.commit()
    return challenge


def get_or_create_daily_session(user_id, local_date=None):
    challenge = ensure_daily_challenge(local_date)
    if not challenge:
        return None, None
    session = NeedleDropSession.query.filter_by(
        user_id=user_id,
        daily_challenge_id=challenge.id,
    ).first()
    if not session:
        session = NeedleDropSession(
            user_id=user_id,
            mode="daily",
            daily_challenge_id=challenge.id,
            song_id=challenge.song_id,
            status="active",
        )
        db.session.add(session)
        db.session.commit()
    return challenge, session


def _attempt_payload(attempt):
    return {
        "attempt_number": attempt.attempt_number,
        "guess_type": attempt.guess_type,
        "result": attempt.result,
        "clip_length": attempt.clip_length,
        "guessed_song_id": attempt.guessed_song_id,
        "guessed_artist": attempt.guessed_artist,
    }


def _song_payload(song, include_streams=False):
    payload = {
        "id": song.id,
        "title": song.title,
        "artist": song.album.artist if song.album else None,
        "album": {
            "id": song.album.id if song.album else None,
            "title": song.album.title if song.album else None,
            "artist": song.album.artist if song.album else None,
            "cover_url": song.album.cover_url if song.album else None,
        },
    }
    if include_streams:
        payload.update(
            {
                "spotify_url": song.spotify_url,
                "apple_url": song.apple_url,
                "youtube_url": song.youtube_url,
            }
        )
    return payload


def _user_context(user_id, song):
    song_vote = Vote.query.filter_by(user_id=user_id, song_id=song.id, ignored=False).order_by(Vote.timestamp.desc()).first()
    album_score = None
    if song.album:
        album_score = (
            AlbumScore.query.filter_by(user_id=user_id, album_id=song.album.id, ignored=False)
            .order_by(AlbumScore.timestamp.desc())
            .first()
        )
    wins = BattleVote.query.filter_by(user_id=user_id, winner_id=song.id).count()
    losses = BattleVote.query.filter_by(user_id=user_id, loser_id=song.id).count()
    return {
        "song_rating": song_vote.score if song_vote else None,
        "album_rating": album_score.personal_score if album_score else None,
        "faceoff": {"wins": wins, "losses": losses, "total": wins + losses},
        "message": personalized_message(song_vote.score if song_vote else None, wins),
    }


def personalized_message(song_rating, faceoff_wins):
    if song_rating and song_rating >= 4.5:
        return "You had this one rated high. Memory picked a dramatic entrance today."
    if song_rating is not None:
        return "You had rated this before, so Vinyl Vote suspected it was somewhere in the shelves."
    if faceoff_wins >= 3:
        return "You have picked this track in Face-Off more than once. Recognition: complicated, apparently."
    return "Fresh pull from the completed Vinyl Vote catalog."


def reveal_payload(session, include_stats=False):
    song = db.session.get(Song, session.song_id, options=[joinedload(Song.album)])
    payload = {
        "song": _song_payload(song, include_streams=True),
        "user_context": _user_context(session.user_id, song),
    }
    if include_stats:
        payload["community_stats"] = daily_stats_for_challenge(session.daily_challenge) if session.daily_challenge else None
    return payload


def session_payload(session, challenge=None, include_reveal=False):
    challenge = challenge or session.daily_challenge
    attempts = sorted(session.attempts, key=lambda item: item.attempt_number)
    next_index = min(session.attempts_used, MAX_ATTEMPTS - 1)
    payload = {
        "session_id": session.id,
        "mode": session.mode,
        "status": session.status,
        "attempts_used": session.attempts_used,
        "max_attempts": MAX_ATTEMPTS,
        "clip_lengths": CLIP_LENGTHS,
        "next_clip_length": CLIP_LENGTHS[next_index],
        "attempts": [_attempt_payload(attempt) for attempt in attempts],
        "preview_url": url_for("api_v1.needle_drop_preview", session_id=session.id),
    }
    if challenge:
        payload["daily"] = {
            "date": challenge.local_date,
            "expires_at": _aware_utc(challenge.expires_at).isoformat() if challenge.expires_at else None,
            "expired": is_expired(challenge),
            "clip_offset_seconds": challenge.clip_offset_seconds,
            "stats_available": is_expired(challenge),
        }
    if include_reveal:
        payload["reveal"] = reveal_payload(session, include_stats=bool(challenge and is_expired(challenge)))
    return payload


def record_attempt(session, *, guess_type, song_id=None, artist=None):
    if session.status != "active":
        return session.status, session_payload(session, include_reveal=True)
    if session.attempts_used >= MAX_ATTEMPTS:
        session.status = "revealed" if session.mode == "endless" else "failed"
        session.completed_at = datetime.now(timezone.utc)
        db.session.commit()
        return session.status, session_payload(session, include_reveal=True)

    song = db.session.get(Song, session.song_id, options=[joinedload(Song.album)])
    guessed_song = db.session.get(Song, int(song_id), options=[joinedload(Song.album)]) if song_id else None
    attempt_number = session.attempts_used + 1
    clip_length = CLIP_LENGTHS[min(session.attempts_used, MAX_ATTEMPTS - 1)]
    result = "wrong"

    if guess_type == "skip":
        result = "skipped"
    elif guessed_song and guessed_song.id == song.id:
        result = "correct"
    else:
        guessed_artist = artist or (guessed_song.album.artist if guessed_song and guessed_song.album else None)
        if guessed_artist and normalize_guess(guessed_artist) == normalize_guess(song.album.artist if song.album else ""):
            result = "artist_recognized"

    attempt = NeedleDropAttempt(
        session_id=session.id,
        attempt_number=attempt_number,
        guess_type=guess_type,
        guessed_song_id=guessed_song.id if guessed_song else None,
        guessed_artist=artist or (guessed_song.album.artist if guessed_song and guessed_song.album else None),
        result=result,
        clip_length=clip_length,
    )
    db.session.add(attempt)
    session.attempts_used = attempt_number

    if result == "correct":
        session.status = "won"
        session.completed_at = datetime.now(timezone.utc)
        update_recognition(session.user_id, song.id, exact=True, attempt_number=attempt_number)
    elif result == "artist_recognized":
        update_recognition(session.user_id, song.id, artist=True)
    elif attempt_number >= MAX_ATTEMPTS:
        session.status = "revealed" if session.mode == "endless" else "failed"
        session.completed_at = datetime.now(timezone.utc)
        update_recognition(session.user_id, song.id, failed=True)

    db.session.commit()
    include_reveal = session.status in {"won", "failed", "revealed"} or result == "correct"
    if session.status == "failed" and result != "correct":
        result = "failed"
    elif session.status == "revealed" and result != "correct":
        result = "revealed"
    return result, session_payload(session, include_reveal=include_reveal)


def update_recognition(user_id, song_id, *, exact=False, artist=False, failed=False, attempt_number=None):
    now = datetime.now(timezone.utc)
    stat = NeedleDropRecognitionStat.query.filter_by(user_id=user_id, song_id=song_id).first()
    if not stat:
        stat = NeedleDropRecognitionStat(user_id=user_id, song_id=song_id)
        db.session.add(stat)
    stat.exact_correct_count = stat.exact_correct_count or 0
    stat.artist_recognition_count = stat.artist_recognition_count or 0
    stat.failure_count = stat.failure_count or 0
    if exact:
        stat.exact_correct_count += 1
        stat.last_exact_at = now
        stat.cooldown_until = None
        if attempt_number and (stat.best_attempt is None or attempt_number < stat.best_attempt):
            stat.best_attempt = attempt_number
    if artist:
        stat.artist_recognition_count += 1
        stat.last_artist_at = now
    if failed:
        stat.failure_count += 1
        stat.last_failed_at = now
        stat.cooldown_until = now + timedelta(days=7)


def daily_stats_for_challenge(challenge):
    sessions = NeedleDropSession.query.filter_by(daily_challenge_id=challenge.id).all()
    total = len(sessions)
    wins = len([item for item in sessions if item.status == "won"])
    failures = len([item for item in sessions if item.status == "failed"])
    by_attempt = {str(i): 0 for i in range(1, MAX_ATTEMPTS + 1)}
    for session in sessions:
        if session.status == "won":
            by_attempt[str(session.attempts_used)] = by_attempt.get(str(session.attempts_used), 0) + 1
    return {
        "players": total,
        "wins": wins,
        "failures": failures,
        "win_rate": round(wins / total, 3) if total else 0,
        "by_attempt": by_attempt,
    }


def share_text(session):
    attempts = sorted(session.attempts, key=lambda item: item.attempt_number)
    marks = []
    for attempt in attempts:
        if attempt.result == "correct":
            marks.append("🟩")
        elif attempt.result == "artist_recognized":
            marks.append("🟨")
        else:
            marks.append("⬛")
    while len(marks) < MAX_ATTEMPTS and session.status == "failed":
        marks.append("⬛")
    date = session.daily_challenge.local_date if session.daily_challenge else "Endless"
    score = session.attempts_used if session.status == "won" else "X"
    return f"Needle Drop {date} {score}/{MAX_ATTEMPTS}\n{''.join(marks)}"


def autocomplete_items(query):
    term = f"%{query.strip()}%" if query else "%"
    artists = (
        db.session.query(Album.artist)
        .join(Song, Song.album_id == Album.id)
        .filter(Album.queue_order > 0, Song.ignored.is_(False), Album.artist.ilike(term))
        .distinct()
        .order_by(Album.artist)
        .limit(10)
        .all()
    )
    songs = (
        Song.query.options(joinedload(Song.album))
        .join(Album)
        .filter(Album.queue_order > 0, Song.ignored.is_(False), or_(Song.title.ilike(term), Album.artist.ilike(term)))
        .order_by(Album.artist, Song.title)
        .limit(20)
        .all()
    )
    return {
        "items": [{"type": "artist", "id": None, "label": artist, "artist": artist} for (artist,) in artists]
        + [
            {"type": "song", "id": song.id, "label": f"{song.title} — {song.album.artist}", "title": song.title, "artist": song.album.artist}
            for song in songs
        ]
    }


def endless_options(user_id):
    genres = set()
    for (spotify_data,) in db.session.query(Album.spotify_data).filter(Album.spotify_data.isnot(None)).all():
        try:
            genres.update(json.loads(spotify_data or "{}").get("genres", []))
        except Exception:
            continue
    return {
        "presets": [
            {"key": "everything", "label": "Everything"},
            {"key": "should_know", "label": "Songs You Should Know"},
            {"key": "forgotten", "label": "Forgotten Favorites"},
            {"key": "rated", "label": "Songs I've Rated"},
            {"key": "unrated", "label": "Songs I Haven't Rated"},
            {"key": "genre", "label": "Genre Challenge"},
        ],
        "genres": sorted(genres)[:50],
        "difficulties": [],
    }


def familiarity_score(user_id, song):
    score = 0.0
    vote = Vote.query.filter_by(user_id=user_id, song_id=song.id, ignored=False).first()
    if vote:
        score += 5.0 + max(0, float(vote.score) - 3.0) * 0.5
    wins = BattleVote.query.filter_by(user_id=user_id, winner_id=song.id).count()
    if wins:
        score += min(6.0, wins * 1.5)
    stat = NeedleDropRecognitionStat.query.filter_by(user_id=user_id, song_id=song.id).first()
    if stat:
        score += stat.exact_correct_count * 6.0
        score += stat.artist_recognition_count * 1.5
    return score


def create_endless_round(user_id, filter_key="everything", genre=None, difficulty=None):
    pool = eligible_songs()
    now = datetime.now(timezone.utc)
    if not pool:
        return None

    stats = {
        stat.song_id: stat
        for stat in NeedleDropRecognitionStat.query.filter_by(user_id=user_id).all()
    }
    correct_ids = {song_id for song_id, stat in stats.items() if stat.exact_correct_count > 0}
    available = [song for song in pool if song.id not in correct_ids]
    if len(available) < max(1, int(len(pool) * 0.1)):
        available = pool
    available = [
        song
        for song in available
        if not stats.get(song.id) or not stats[song.id].cooldown_until or _aware_utc(stats[song.id].cooldown_until) <= now
    ] or pool

    if filter_key == "rated":
        rated_ids = {row[0] for row in db.session.query(Vote.song_id).filter_by(user_id=user_id, ignored=False).all()}
        available = [song for song in available if song.id in rated_ids] or pool
    elif filter_key == "unrated":
        rated_ids = {row[0] for row in db.session.query(Vote.song_id).filter_by(user_id=user_id, ignored=False).all()}
        available = [song for song in available if song.id not in rated_ids] or pool
    elif filter_key in {"should_know", "forgotten"}:
        scored = sorted(available, key=lambda song: familiarity_score(user_id, song), reverse=True)
        available = scored[: max(1, len(scored) // 2)] if filter_key == "should_know" else scored[max(1, len(scored) // 2):] or scored
    elif filter_key == "genre" and genre:
        genre_pool = []
        for song in available:
            try:
                album_genres = json.loads(song.album.spotify_data or "{}").get("genres", [])
            except Exception:
                album_genres = []
            if genre in album_genres:
                genre_pool.append(song)
        available = genre_pool or available

    rng = random.Random(f"{user_id}:{datetime.now(timezone.utc).timestamp()}:{filter_key}:{genre}:{difficulty}")
    song = rng.choice(available)
    session = NeedleDropSession(
        user_id=user_id,
        mode="endless",
        song_id=song.id,
        filter_key=filter_key,
        status="active",
    )
    db.session.add(session)
    db.session.commit()
    return session
