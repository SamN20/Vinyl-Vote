from flask import Blueprint, jsonify, request, current_app, make_response
from flask_login import login_required, current_user
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from .. import db
from ..models import Album, Vote, AlbumScore, VotePeriod, Song

bp = Blueprint('api', __name__, url_prefix='/api')
bp_v1 = Blueprint('api_v1', __name__, url_prefix='/api/v1')

def _allowed_origin(origin: str) -> bool:
    """Return True if the request origin is allowed to receive CORS headers."""
    if not origin:
        return False
    if origin.startswith('chrome-extension://') or origin.startswith('moz-extension://'):
        return True

    allowed = current_app.config.get('VINYL_VOTE_API_ALLOWED_ORIGINS', []) or []
    return origin in allowed


@bp.before_request
@bp_v1.before_request
def handle_preflight():
    """Return the appropriate response for CORS preflight checks."""
    if request.method == 'OPTIONS':
        response = make_response('', 204)
        request_method = request.headers.get('Access-Control-Request-Method')
        request_headers = request.headers.get('Access-Control-Request-Headers')
        if request_method:
            response.headers['Access-Control-Allow-Methods'] = request_method
        else:
            response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
        if request_headers:
            response.headers['Access-Control-Allow-Headers'] = request_headers
        else:
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response


@bp.after_request
@bp_v1.after_request
def inject_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin and _allowed_origin(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers.add('Vary', 'Origin')
    return response


@bp.route('/session-check', methods=['GET'])
@bp_v1.route('/session-check', methods=['GET'])
def session_check():
    """Simple endpoint for mobile PWAs to verify session validity."""
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'user_id': current_user.id,
            'username': current_user.username
        }), 200
    else:
        return jsonify({
            'authenticated': False
        }), 200


def _album_payload(album: Album, vote_end: str, user_votes: dict, personal_score):
    songs = [
        {
            'id': song.id,
            'title': song.title,
            'track_number': song.track_number,
            'duration': song.duration,
            'spotify_url': song.spotify_url,
            'apple_url': song.apple_url,
            'youtube_url': song.youtube_url,
            'score': user_votes.get(song.id),
        }
        for song in sorted(album.songs, key=lambda s: s.track_number or 0)
    ]

    payload = {
        'album': {
            'id': album.id,
            'title': album.title,
            'artist': album.artist,
            'release_date': album.release_date,
            'cover_url': album.cover_url,
            'spotify_url': album.spotify_url,
            'apple_url': album.apple_url,
            'youtube_url': album.youtube_url,
            'songs': songs,
        },
        'vote_end': vote_end,
        'user': {
            'song_votes': {str(song_id): score for song_id, score in user_votes.items()},
            'album_score': personal_score.personal_score if personal_score else None,
            'has_album_score': bool(personal_score and not personal_score.ignored),
        },
    }
    return payload


@bp.route('/current-album', methods=['GET'])
@bp_v1.route('/current-album', methods=['GET'])
@login_required
def get_current_album():
    album = (
        Album.query.options(joinedload(Album.songs))
        .filter_by(is_current=True)
        .first()
    )

    if not album:
        return jsonify({'error': 'No album is currently open for voting.'}), 404

    vote_period = VotePeriod.query.first()
    vote_end = vote_period.end_time.isoformat() if vote_period else None

    votes = {
        vote.song_id: vote.score
        for vote in Vote.query.filter_by(user_id=current_user.id).filter(Vote.song_id.in_([s.id for s in album.songs])).all()
    }

    personal_score = AlbumScore.query.filter_by(
        user_id=current_user.id, album_id=album.id
    ).first()

    payload = _album_payload(album, vote_end, votes, personal_score)

    has_full_vote = bool(personal_score) and len(votes) == len(album.songs)
    payload['user']['has_voted'] = has_full_vote

    return jsonify(payload)


@bp.route('/votes', methods=['POST'])
@bp_v1.route('/votes', methods=['POST'])
@login_required
def submit_votes():
    data = request.get_json(silent=True) or {}

    album = (
        Album.query.options(joinedload(Album.songs))
        .filter_by(is_current=True)
        .first()
    )

    if not album:
        return jsonify({'error': 'No album is currently open for voting.'}), 404

    song_scores = data.get('song_scores', {})
    album_score = data.get('album_score')

    if not isinstance(song_scores, dict):
        return jsonify({'error': 'song_scores must be a mapping of song IDs to scores.'}), 400

    for song in album.songs:
        raw_value = song_scores.get(str(song.id))
        if raw_value is None:
            continue
        try:
            score = float(raw_value)
        except (TypeError, ValueError):
            return jsonify({'error': f'Invalid score for song {song.id}.'}), 400

        existing_vote = Vote.query.filter_by(user_id=current_user.id, song_id=song.id).first()
        if existing_vote:
            existing_vote.score = score
            existing_vote.ignored = False
        else:
            vote = Vote(user_id=current_user.id, song_id=song.id, score=score, retroactive=False)
            db.session.add(vote)

    personal_score = None
    if album_score is not None:
        try:
            normalized = float(album_score)
        except (TypeError, ValueError):
            return jsonify({'error': 'album_score must be a number.'}), 400

        existing_score = AlbumScore.query.filter_by(
            user_id=current_user.id, album_id=album.id
        ).first()
        if existing_score:
            existing_score.personal_score = normalized
            existing_score.ignored = False
            personal_score = existing_score
        else:
            personal_score = AlbumScore(
                user_id=current_user.id,
                album_id=album.id,
                personal_score=normalized,
                retroactive=False,
            )
            db.session.add(personal_score)
    else:
        personal_score = AlbumScore.query.filter_by(
            user_id=current_user.id, album_id=album.id
        ).first()

    db.session.commit()

    votes = {
        vote.song_id: vote.score
        for vote in Vote.query.filter(
            Vote.user_id == current_user.id,
            Vote.song_id.in_([s.id for s in album.songs])
        ).all()
    }

    vote_period = VotePeriod.query.first()
    vote_end = vote_period.end_time.isoformat() if vote_period else None

    payload = _album_payload(album, vote_end, votes, personal_score)
    payload['message'] = 'Votes saved successfully.'
    payload['user']['has_voted'] = bool(personal_score) and len(votes) == len(album.songs)

    return jsonify(payload)


# -------- Retro voting endpoints --------

def _is_retro_eligible(album: Album) -> bool:
    """Album is eligible for retro voting if it exists and is earlier than the current album."""
    current = Album.query.filter_by(is_current=True).first()
    if not album or not current:
        return False
    # Only allow albums earlier than current (smaller queue_order, positive)
    return (album.queue_order or 0) > 0 and album.queue_order < (current.queue_order or 0)


def _user_has_any_votes_for_album(user_id: int, album: Album) -> bool:
    song_ids = [s.id for s in album.songs]
    existing_score = AlbumScore.query.filter_by(user_id=user_id, album_id=album.id).first()
    existing_vote = Vote.query.filter(Vote.user_id == user_id, Vote.song_id.in_(song_ids)).first()
    return bool(existing_score or existing_vote)


def _retro_recommendations_for_user(user_id: int):
    import json
    from collections import defaultdict

    current = Album.query.filter_by(is_current=True).first()
    if not current:
        return []

    candidates = Album.query.filter(
        Album.queue_order < current.queue_order,
        Album.queue_order > 0,
    ).all()

    scored_album_ids = set(
        s.album_id for s in AlbumScore.query.filter_by(user_id=user_id).all()
    )
    voted_album_ids = set(
        v.song.album_id
        for v in Vote.query.filter_by(user_id=user_id).join(Song).all()
    )
    done_ids = scored_album_ids.union(voted_album_ids)
    unvoted_albums = [a for a in candidates if a.id not in done_ids]

    user_artist_avgs = {}
    user_scores = (
        AlbumScore.query.filter_by(user_id=user_id)
        .options(joinedload(AlbumScore.album))
        .all()
    )
    user_artist_scores = defaultdict(list)
    user_genre_counts = defaultdict(int)

    for score_row in user_scores:
        if not score_row.album:
            continue

        user_artist_scores[score_row.album.artist].append(score_row.personal_score)

        if score_row.personal_score >= 3.5 and score_row.album.spotify_data:
            try:
                spotify_data = json.loads(score_row.album.spotify_data)
                for genre in spotify_data.get('genres', []):
                    user_genre_counts[genre] += 1
            except Exception:
                continue

    for artist, scores in user_artist_scores.items():
        user_artist_avgs[artist] = sum(scores) / len(scores)

    top_user_genres = {genre for genre, count in user_genre_counts.items() if count >= 1}

    global_avgs = {}
    for album in unvoted_albums:
        avg_score = (
            db.session.query(func.avg(AlbumScore.personal_score))
            .filter_by(album_id=album.id, ignored=False)
            .scalar()
        )
        # Use 5.0 because historical model in legacy route used a 10-point scale prediction.
        global_avgs[album.id] = avg_score if avg_score is not None else 5.0

    recommendations = []

    for album in unvoted_albums:
        base_score = global_avgs.get(album.id, 5.0)
        artist_avg = user_artist_avgs.get(album.artist)
        artist_bonus = 0.0
        match_reason = 'Global favorite'

        if artist_avg is not None:
            artist_bonus = (artist_avg - 5.0) * 0.6
            match_reason = f'You rated {album.artist} {artist_avg:.1f} avg'

        spotify_bonus = 0.0

        if album.spotify_data:
            try:
                data = json.loads(album.spotify_data)
                popularity = data.get('popularity', 0)
                spotify_bonus += (popularity / 100.0) * 0.3

                candidate_genres = data.get('genres', [])
                matching_genres = [g for g in candidate_genres if g in top_user_genres]

                if matching_genres and artist_bonus <= 0:
                    genre_boost = min(1.5, len(matching_genres) * 0.5)
                    spotify_bonus += genre_boost

                    if match_reason == 'Global favorite':
                        display_genres = ', '.join(g.title() for g in matching_genres[:2])
                        match_reason = f'Matches your taste in {display_genres}'
            except Exception:
                pass

        predicted = min(9.9, max(0.1, base_score + artist_bonus + spotify_bonus))
        match_percent = max(1, min(99, int(round(predicted * 10))))

        recommendations.append({
            'id': album.id,
            'title': album.title,
            'artist': album.artist,
            'cover_url': album.cover_url,
            'spotify_url': album.spotify_url,
            'apple_url': album.apple_url,
            'youtube_url': album.youtube_url,
            'song_count': len(album.songs),
            'predicted': round(predicted, 2),
            'match_percent': match_percent,
            'reason': match_reason,
        })

    recommendations.sort(key=lambda row: row['predicted'], reverse=True)
    return recommendations


@bp.route('/retro-albums', methods=['GET'])
@bp_v1.route('/retro-albums', methods=['GET'])
@login_required
def list_retro_albums():
    """Return a list of past albums the current user hasn't voted on yet."""
    current = Album.query.filter_by(is_current=True).first()
    if not current:
        return jsonify({'albums': []})

    # Candidate past albums
    albums = Album.query.options(joinedload(Album.songs)).filter(
        Album.is_current == False,
        Album.queue_order > 0,
        Album.queue_order < current.queue_order
    ).all()

    result = []
    for album in albums:
        if _user_has_any_votes_for_album(current_user.id, album):
            continue
        result.append({
            'id': album.id,
            'title': album.title,
            'artist': album.artist,
            'cover_url': album.cover_url,
            'spotify_url': album.spotify_url,
            'apple_url': album.apple_url,
            'youtube_url': album.youtube_url,
            'song_count': len(album.songs),
        })

    return jsonify({'albums': result})


@bp.route('/retro-recommendations', methods=['GET'])
@bp_v1.route('/retro-recommendations', methods=['GET'])
@login_required
def list_retro_recommendations():
    recommendations = _retro_recommendations_for_user(current_user.id)
    return jsonify({'albums': recommendations})


@bp.route('/retro-album/<int:album_id>', methods=['GET'])
@bp_v1.route('/retro-album/<int:album_id>', methods=['GET'])
@login_required
def get_retro_album(album_id):
    """Fetch details for a retro-eligible album, if the user hasn't already voted on it."""
    album = Album.query.options(joinedload(Album.songs)).get(album_id)
    if not album or not _is_retro_eligible(album):
        return jsonify({'error': 'Album is not eligible for retro voting.'}), 403
    if _user_has_any_votes_for_album(current_user.id, album):
        return jsonify({'error': 'You have already voted on this album.'}), 409

    votes = {}
    personal_score = None
    payload = _album_payload(album, vote_end=None, user_votes=votes, personal_score=personal_score)
    payload['user']['has_voted'] = False
    return jsonify(payload)


@bp.route('/retro-votes/<int:album_id>', methods=['POST'])
@bp_v1.route('/retro-votes/<int:album_id>', methods=['POST'])
@login_required
def submit_retro_votes(album_id):
    """Submit retro votes for a past album; marks votes/scores with retroactive=True."""
    album = Album.query.options(joinedload(Album.songs)).get(album_id)
    if not album or not _is_retro_eligible(album):
        return jsonify({'error': 'Album is not eligible for retro voting.'}), 403
    if _user_has_any_votes_for_album(current_user.id, album):
        return jsonify({'error': 'You have already voted on this album.'}), 409

    data = request.get_json(silent=True) or {}
    song_scores = data.get('song_scores', {})
    album_score = data.get('album_score')

    if not isinstance(song_scores, dict):
        return jsonify({'error': 'song_scores must be a mapping of song IDs to scores.'}), 400

    for song in album.songs:
        raw_value = song_scores.get(str(song.id))
        if raw_value is None:
            continue
        try:
            score = float(raw_value)
        except (TypeError, ValueError):
            return jsonify({'error': f'Invalid score for song {song.id}.'}), 400

        # Only create if not exists; retro votes cannot overwrite prior votes
        existing_vote = Vote.query.filter_by(user_id=current_user.id, song_id=song.id).first()
        if existing_vote:
            return jsonify({'error': 'You have already voted on this album.'}), 409
        # Auto-ignore new votes for ignored songs
        db.session.add(Vote(user_id=current_user.id, song_id=song.id, score=score, retroactive=True, ignored=song.ignored))

    personal_score_row = None
    if album_score is not None:
        try:
            normalized = float(album_score)
        except (TypeError, ValueError):
            return jsonify({'error': 'album_score must be a number.'}), 400

        existing_score = AlbumScore.query.filter_by(user_id=current_user.id, album_id=album.id).first()
        if existing_score:
            return jsonify({'error': 'You have already voted on this album.'}), 409
        personal_score_row = AlbumScore(
            user_id=current_user.id,
            album_id=album.id,
            personal_score=normalized,
            retroactive=True,
        )
        db.session.add(personal_score_row)

    db.session.commit()

    votes = {vote.song_id: vote.score for vote in Vote.query.filter(
        Vote.user_id == current_user.id,
        Vote.song_id.in_([s.id for s in album.songs])
    ).all()}

    payload = _album_payload(album, vote_end=None, user_votes=votes, personal_score=personal_score_row)
    payload['message'] = 'Retro votes saved successfully.'
    payload['user']['has_voted'] = True
    return jsonify(payload)