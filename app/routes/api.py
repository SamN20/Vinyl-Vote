from flask import Blueprint, jsonify, request, current_app, make_response
from flask_login import login_required, current_user
from sqlalchemy import func
from sqlalchemy.orm import joinedload
import requests

from .. import db
from ..models import Album, Vote, AlbumScore, VotePeriod, Song, Setting, BattleVote
from ..utils import fetch_artist_image

bp = Blueprint('api', __name__, url_prefix='/api')
bp_v1 = Blueprint('api_v1', __name__, url_prefix='/api/v1')


def _results_summary_for_album(album: Album):
    song_ids = [song.id for song in album.songs]
    user_votes = {}
    if current_user.is_authenticated and song_ids:
        user_votes = {
            vote.song_id: vote.score
            for vote in Vote.query.filter_by(user_id=current_user.id)
            .filter(Vote.song_id.in_(song_ids), Vote.ignored.is_(False))
            .all()
        }

    song_stats = []
    for song in sorted(album.songs, key=lambda s: s.track_number or 0):
        avg = db.session.query(func.avg(Vote.score)).filter_by(song_id=song.id, ignored=False).scalar()
        count = db.session.query(func.count(Vote.id)).filter_by(song_id=song.id, ignored=False).scalar()

        distribution = [0, 0, 0, 0, 0]
        rows = (
            db.session.query(Vote.score, func.count(Vote.id))
            .filter_by(song_id=song.id, ignored=False)
            .group_by(Vote.score)
            .all()
        )
        for score, bucket_count in rows:
            if 1 <= score <= 5:
                distribution[int(score) - 1] += bucket_count

        song_stats.append(
            {
                'id': song.id,
                'track_number': song.track_number,
                'title': song.title,
                'avg_score': round(float(avg), 2) if avg is not None else None,
                'vote_count': int(count or 0),
                'user_score': user_votes.get(song.id),
                'distribution': distribution,
                'ignored': bool(song.ignored),
            }
        )

    avg_song_score = None
    if song_ids:
        raw_song_avg = db.session.query(func.avg(Vote.score)).filter(
            Vote.song_id.in_(song_ids),
            Vote.ignored.is_(False),
        ).scalar()
        avg_song_score = round(float(raw_song_avg), 2) if raw_song_avg is not None else None

    raw_album_avg = db.session.query(func.avg(AlbumScore.personal_score)).filter_by(
        album_id=album.id,
        ignored=False,
    ).scalar()
    avg_album_score = round(float(raw_album_avg), 2) if raw_album_avg is not None else None

    voter_count = (
        db.session.query(func.count(func.distinct(AlbumScore.user_id)))
        .filter_by(album_id=album.id, ignored=False)
        .scalar()
    )

    vote_distribution = [0, 0, 0, 0, 0]
    counted_vote_total = 0
    ignored_vote_total = 0
    if song_ids:
        distribution_rows = (
            db.session.query(Vote.score, func.count(Vote.id))
            .filter(Vote.song_id.in_(song_ids), Vote.ignored.is_(False))
            .group_by(Vote.score)
            .all()
        )
        for score, bucket_count in distribution_rows:
            if 1 <= score <= 5:
                vote_distribution[int(score) - 1] += bucket_count

        counted_vote_total = int(
            db.session.query(func.count(Vote.id))
            .filter(Vote.song_id.in_(song_ids), Vote.ignored.is_(False))
            .scalar()
            or 0
        )
        ignored_vote_total = int(
            db.session.query(func.count(Vote.id))
            .filter(Vote.song_id.in_(song_ids), Vote.ignored.is_(True))
            .scalar()
            or 0
        )

    return {
        'album': {
            'id': album.id,
            'title': album.title,
            'artist': album.artist,
            'release_date': album.release_date,
            'cover_url': album.cover_url,
            'spotify_url': album.spotify_url,
            'apple_url': album.apple_url,
            'youtube_url': album.youtube_url,
        },
        'summary': {
            'avg_song_score': avg_song_score,
            'avg_album_score': avg_album_score,
            'voter_count': int(voter_count or 0),
            'vote_distribution': vote_distribution,
            'counted_votes': counted_vote_total,
            'ignored_votes': ignored_vote_total,
        },
        'songs': song_stats,
    }


def _latest_results_album():
    current = Album.query.filter_by(is_current=True).first()
    if not current:
        return None, 'No current album is set.'

    previous = (
        Album.query.options(joinedload(Album.songs))
        .filter(Album.queue_order < current.queue_order, Album.queue_order > 0)
        .order_by(Album.queue_order.desc())
        .first()
    )
    if not previous:
        return None, 'No previous album is available yet.'

    return previous, None


def _pagination_payload(total: int, page: int, per_page: int):
    pages = max((total + per_page - 1) // per_page, 1) if per_page > 0 else 1
    return {
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': pages,
    }


def _resolve_artist_image(artist: str):
    fallback = current_app.config.get('DEFAULT_ARTIST_IMAGE') or '/static/favicon_64x64.png'
    cache_key = f"artist_image:{artist}"
    try:
        setting = Setting.query.filter_by(key=cache_key).first()
        if setting and setting.value:
            return setting.value
    except Exception:
        db.session.rollback()
        return fallback

    try:
        image_url = fetch_artist_image(artist) or fallback
    except Exception:
        image_url = fallback

    try:
        if image_url and image_url != fallback:
            if setting:
                setting.value = image_url
            else:
                db.session.add(Setting(key=cache_key, value=image_url))
            db.session.commit()
    except Exception:
        db.session.rollback()

    return image_url


def _fetch_artist_bio_text(artist_name: str):
    cache_key = f"artist_bio:{artist_name}"
    setting = Setting.query.filter_by(key=cache_key).first()
    if setting and setting.value:
        return setting.value

    def _cache(text: str):
        try:
            if setting:
                setting.value = text
            else:
                db.session.add(Setting(key=cache_key, value=text))
            db.session.commit()
        except Exception:
            db.session.rollback()

    def _truncate(text: str):
        if len(text) > 250:
            return text[:247] + '...'
        return text

    try:
        import urllib.parse as urlparse

        rest_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urlparse.quote(artist_name)}"
        response = requests.get(
            rest_url,
            timeout=6,
            headers={'accept': 'application/json', 'user-agent': 'vinyl-vote/1.0'},
        )
        if response.ok:
            data = response.json()
            extract = data.get('extract') or data.get('description')
            if extract:
                extract = _truncate(extract)
                _cache(extract)
                return extract
    except Exception:
        pass

    try:
        params = {
            'action': 'query',
            'format': 'json',
            'prop': 'extracts',
            'exintro': True,
            'explaintext': True,
            'titles': artist_name,
        }
        response = requests.get('https://en.wikipedia.org/w/api.php', params=params, timeout=6)
        if response.ok:
            data = response.json()
            page = next(iter(data.get('query', {}).get('pages', {}).values()), {})
            extract = page.get('extract')
            if extract:
                extract = _truncate(extract)
                _cache(extract)
                return extract
    except Exception:
        pass

    return 'No bio found.'

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


@bp.route('/results/latest', methods=['GET'])
@bp_v1.route('/results/latest', methods=['GET'])
def get_latest_results():
    album, error = _latest_results_album()
    if not album:
        return jsonify({'error': error}), 404

    return jsonify(_results_summary_for_album(album))


@bp.route('/results/album/<int:album_id>', methods=['GET'])
@bp_v1.route('/results/album/<int:album_id>', methods=['GET'])
def get_results_for_album(album_id):
    album = db.session.get(Album, album_id, options=[joinedload(Album.songs)])
    if not album:
        return jsonify({'error': 'Album not found.'}), 404

    return jsonify(_results_summary_for_album(album))


@bp.route('/leaderboard/artists', methods=['GET'])
@bp_v1.route('/leaderboard/artists', methods=['GET'])
def get_leaderboard_artists():
    current_album = Album.query.filter_by(is_current=True).first()
    if not current_album:
        return jsonify({'error': 'No current album is set. Cannot determine top artists.'}), 404

    q = request.args.get('q', '', type=str).strip()
    min_ratings = request.args.get('min_ratings', type=int)
    min_avg = request.args.get('min_avg', type=float)
    page = max(request.args.get('page', 1, type=int), 1)
    per_page = min(max(request.args.get('per_page', 25, type=int), 5), 100)
    sort_by = request.args.get('sort_by', 'avg_score', type=str)
    sort_dir = request.args.get('sort_dir', 'desc', type=str).lower()

    base = (
        db.session.query(
            Album.artist.label('artist'),
            func.avg(Vote.score).label('avg_score'),
            func.count(Vote.id).label('rating_count'),
        )
        .join(Song, Song.album_id == Album.id)
        .join(Vote, Vote.song_id == Song.id)
        .filter(
            Album.queue_order > 0,
            Album.queue_order < current_album.queue_order,
            Vote.ignored.is_(False),
        )
        .group_by(Album.artist)
    )

    if q:
        base = base.filter(Album.artist.ilike(f"%{q}%"))

    if min_ratings is not None:
        base = base.having(func.count(Vote.id) >= min_ratings)
    else:
        base = base.having(func.count(Vote.id) > 0)

    if min_avg is not None:
        base = base.having(func.avg(Vote.score) >= min_avg)

    subq = base.subquery()
    total = db.session.query(func.count()).select_from(subq).scalar() or 0

    sortable = {
        'avg_score': subq.c.avg_score,
        'rating_count': subq.c.rating_count,
        'artist': subq.c.artist,
    }
    sort_column = sortable.get(sort_by, subq.c.avg_score)
    order_clause = sort_column.asc() if sort_dir == 'asc' else sort_column.desc()

    rows = (
        db.session.query(subq.c.artist, subq.c.avg_score, subq.c.rating_count)
        .order_by(order_clause)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = []
    rank_offset = (page - 1) * per_page
    for index, row in enumerate(rows):
        image_url = _resolve_artist_image(row.artist)
        items.append(
            {
                'rank': rank_offset + index + 1,
                'artist': row.artist,
                'avg_score': round(float(row.avg_score), 2) if row.avg_score is not None else None,
                'rating_count': int(row.rating_count or 0),
                'image_url': image_url,
            }
        )

    return jsonify(
        {
            'items': items,
            'pagination': _pagination_payload(int(total), page, per_page),
            'filters': {
                'q': q,
                'min_ratings': min_ratings,
                'min_avg': min_avg,
                'sort_by': sort_by if sort_by in sortable else 'avg_score',
                'sort_dir': 'asc' if sort_dir == 'asc' else 'desc',
            },
        }
    )


@bp.route('/leaderboard/artists/<path:artist_name>/bio', methods=['GET'])
@bp_v1.route('/leaderboard/artists/<path:artist_name>/bio', methods=['GET'])
def get_leaderboard_artist_bio(artist_name):
    return jsonify({'bio': _fetch_artist_bio_text(artist_name)})


@bp.route('/leaderboard/artists/<path:artist_name>/top-songs', methods=['GET'])
@bp_v1.route('/leaderboard/artists/<path:artist_name>/top-songs', methods=['GET'])
def get_leaderboard_artist_top_songs(artist_name):
    rows = (
        db.session.query(
            Song.id,
            Song.title,
            Song.spotify_url,
            Song.apple_url,
            Song.youtube_url,
            func.avg(Vote.score).label('avg_score'),
            func.count(Vote.id).label('rating_count'),
        )
        .join(Album, Album.id == Song.album_id)
        .join(Vote, Vote.song_id == Song.id)
        .filter(Album.artist == artist_name, Vote.ignored.is_(False))
        .group_by(Song.id)
        .order_by(func.avg(Vote.score).desc())
        .limit(3)
        .all()
    )

    payload = []
    for row in rows:
        avg_score = float(row.avg_score) if row.avg_score is not None else None
        payload.append(
            {
                'id': row.id,
                'title': row.title,
                'avg_score': round(avg_score, 2) if avg_score is not None else None,
                'rating_count': int(row.rating_count or 0),
                'spotify_url': row.spotify_url,
                'apple_url': row.apple_url,
                'youtube_url': row.youtube_url,
            }
        )

    return jsonify({'items': payload})


@bp.route('/leaderboard/battle', methods=['GET'])
@bp_v1.route('/leaderboard/battle', methods=['GET'])
def get_leaderboard_battle():
    page = max(request.args.get('page', 1, type=int), 1)
    per_page = min(max(request.args.get('per_page', 50, type=int), 10), 100)
    q = request.args.get('q', '', type=str).strip()
    sort_by = request.args.get('sort_by', 'elo_rating', type=str)
    sort_dir = request.args.get('sort_dir', 'desc', type=str).lower()

    current_album = Album.query.filter_by(is_current=True).first()
    max_queue_order = current_album.queue_order if current_album else 0

    base = Song.query.join(Album).filter(
        Song.match_count > 0,
        Album.queue_order > 0,
        Album.queue_order <= max_queue_order,
    )

    if q:
        base = base.filter(
            db.or_(
                Song.title.ilike(f"%{q}%"),
                Album.artist.ilike(f"%{q}%"),
                Album.title.ilike(f"%{q}%"),
            )
        )

    sort_map = {
        'elo_rating': Song.elo_rating,
        'match_count': Song.match_count,
        'title': Song.title,
        'artist': Album.artist,
    }
    sort_column = sort_map.get(sort_by, Song.elo_rating)
    order_clause = sort_column.asc() if sort_dir == 'asc' else sort_column.desc()

    total = base.count()
    rows = (
        base.options(joinedload(Song.album))
        .order_by(order_clause)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    user_votes = {}
    if current_user.is_authenticated:
        vote_rows = (
            db.session.query(BattleVote.winner_id, func.count(BattleVote.id))
            .filter(BattleVote.user_id == current_user.id)
            .group_by(BattleVote.winner_id)
            .all()
        )
        user_votes = {winner_id: int(count) for winner_id, count in vote_rows}

    rank_offset = (page - 1) * per_page
    items = []
    for index, song in enumerate(rows):
        items.append(
            {
                'id': song.id,
                'rank': rank_offset + index + 1,
                'title': song.title,
                'track_number': song.track_number,
                'spotify_url': song.spotify_url,
                'apple_url': song.apple_url,
                'youtube_url': song.youtube_url,
                'elo_rating': round(float(song.elo_rating), 1) if song.elo_rating is not None else None,
                'match_count': int(song.match_count or 0),
                'user_winner_count': user_votes.get(song.id, 0),
                'album': {
                    'id': song.album.id if song.album else None,
                    'title': song.album.title if song.album else None,
                    'artist': song.album.artist if song.album else None,
                    'cover_url': song.album.cover_url if song.album else None,
                },
            }
        )

    return jsonify(
        {
            'items': items,
            'pagination': _pagination_payload(int(total), page, per_page),
            'filters': {
                'q': q,
                'sort_by': sort_by if sort_by in sort_map else 'elo_rating',
                'sort_dir': 'asc' if sort_dir == 'asc' else 'desc',
            },
        }
    )


@bp.route('/leaderboard/albums', methods=['GET'])
@bp_v1.route('/leaderboard/albums', methods=['GET'])
def get_leaderboard_albums():
    current_album = Album.query.filter_by(is_current=True).first()
    if not current_album:
        return jsonify({'error': 'No current album is set. Cannot determine top albums.'}), 404

    page = max(request.args.get('page', 1, type=int), 1)
    per_page = min(max(request.args.get('per_page', 25, type=int), 5), 100)
    q = request.args.get('q', '', type=str).strip().lower()
    sort_by = request.args.get('sort_by', 'avg_song_score', type=str)
    sort_dir = request.args.get('sort_dir', 'desc', type=str).lower()

    vote_agg = (
        db.session.query(
            Song.album_id.label('album_id'),
            func.avg(Vote.score).label('avg_song_score'),
            func.count(Vote.id).label('vote_count'),
        )
        .join(Vote, Vote.song_id == Song.id)
        .filter(Vote.ignored.is_(False))
        .group_by(Song.album_id)
        .subquery()
    )

    album_score_agg = (
        db.session.query(
            AlbumScore.album_id.label('album_id'),
            func.avg(AlbumScore.personal_score).label('avg_album_score'),
            func.count(AlbumScore.id).label('album_score_count'),
        )
        .filter(AlbumScore.ignored.is_(False))
        .group_by(AlbumScore.album_id)
        .subquery()
    )

    song_count_agg = (
        db.session.query(
            Song.album_id.label('album_id'),
            func.count(Song.id).label('song_count'),
        )
        .group_by(Song.album_id)
        .subquery()
    )

    base = (
        db.session.query(
            Album.id.label('album_id'),
            Album.title.label('album_title'),
            Album.artist.label('album_artist'),
            Album.release_date.label('release_date'),
            Album.cover_url.label('cover_url'),
            vote_agg.c.avg_song_score,
            vote_agg.c.vote_count,
            album_score_agg.c.avg_album_score,
            album_score_agg.c.album_score_count,
            song_count_agg.c.song_count,
        )
        .outerjoin(vote_agg, vote_agg.c.album_id == Album.id)
        .outerjoin(album_score_agg, album_score_agg.c.album_id == Album.id)
        .outerjoin(song_count_agg, song_count_agg.c.album_id == Album.id)
        .filter(
            Album.is_current.is_(False),
            Album.queue_order > 0,
            Album.queue_order < current_album.queue_order,
            func.coalesce(song_count_agg.c.song_count, 0) > 0,
            db.or_(
                func.coalesce(vote_agg.c.vote_count, 0) > 0,
                func.coalesce(album_score_agg.c.album_score_count, 0) > 0,
            ),
        )
    )

    if q:
        search = f'%{q}%'
        base = base.filter(
            db.or_(
                Album.title.ilike(search),
                Album.artist.ilike(search),
            )
        )

    sort_map = {
        'avg_song_score': func.coalesce(vote_agg.c.avg_song_score, -1),
        'avg_album_score': func.coalesce(album_score_agg.c.avg_album_score, -1),
        'title': func.lower(Album.title),
        'artist': func.lower(Album.artist),
        'vote_count': func.coalesce(vote_agg.c.vote_count, 0),
    }
    sort_column = sort_map.get(sort_by, sort_map['avg_song_score'])
    order_clause = sort_column.asc() if sort_dir == 'asc' else sort_column.desc()

    total = base.count()
    rows = (
        base.order_by(order_clause)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    rank_offset = (page - 1) * per_page
    page_items = []
    for index, row in enumerate(rows):
        page_items.append(
            {
                'id': row.album_id,
                'rank': rank_offset + index + 1,
                'title': row.album_title,
                'artist': row.album_artist,
                'release_date': row.release_date,
                'cover_url': row.cover_url,
                'avg_song_score': round(float(row.avg_song_score), 2) if row.avg_song_score is not None else None,
                'avg_album_score': round(float(row.avg_album_score), 2) if row.avg_album_score is not None else None,
                'song_count': int(row.song_count or 0),
                'vote_count': int(row.vote_count or 0),
                'album_score_count': int(row.album_score_count or 0),
            }
        )

    return jsonify(
        {
            'items': page_items,
            'pagination': _pagination_payload(int(total), page, per_page),
            'filters': {
                'q': q,
                'sort_by': sort_by if sort_by in sort_map else 'avg_song_score',
                'sort_dir': 'asc' if sort_dir == 'asc' else 'desc',
            },
        }
    )


@bp.route('/leaderboard/songs', methods=['GET'])
@bp_v1.route('/leaderboard/songs', methods=['GET'])
def get_leaderboard_songs():
    current_album = Album.query.filter_by(is_current=True).first()
    if not current_album:
        return jsonify({'error': 'No current album is set. Cannot determine top songs.'}), 404

    page = max(request.args.get('page', 1, type=int), 1)
    per_page = min(max(request.args.get('per_page', 25, type=int), 5), 100)
    q = request.args.get('q', '', type=str).strip()
    min_ratings = max(request.args.get('min_ratings', 3, type=int), 1)
    sort_by = request.args.get('sort_by', 'avg_score', type=str)
    sort_dir = request.args.get('sort_dir', 'desc', type=str).lower()

    base = (
        db.session.query(
            Song.id.label('song_id'),
            Song.title.label('song_title'),
            Song.spotify_url,
            Song.apple_url,
            Song.youtube_url,
            Song.track_number,
            Album.id.label('album_id'),
            Album.title.label('album_title'),
            Album.artist.label('album_artist'),
            Album.cover_url.label('album_cover_url'),
            func.avg(Vote.score).label('avg_score'),
            func.count(Vote.id).label('rating_count'),
        )
        .join(Album, Album.id == Song.album_id)
        .join(Vote, Vote.song_id == Song.id)
        .filter(
            Album.queue_order > 0,
            Album.queue_order < current_album.queue_order,
            Vote.ignored.is_(False),
        )
        .group_by(Song.id)
        .having(func.count(Vote.id) >= min_ratings)
    )

    if q:
        base = base.filter(
            db.or_(
                Song.title.ilike(f'%{q}%'),
                Album.artist.ilike(f'%{q}%'),
                Album.title.ilike(f'%{q}%'),
            )
        )

    subq = base.subquery()
    total = db.session.query(func.count()).select_from(subq).scalar() or 0

    sort_map = {
        'avg_score': subq.c.avg_score,
        'rating_count': subq.c.rating_count,
        'title': subq.c.song_title,
        'artist': subq.c.album_artist,
        'album': subq.c.album_title,
    }
    sort_column = sort_map.get(sort_by, sort_map['avg_score'])
    order_clause = sort_column.asc() if sort_dir == 'asc' else sort_column.desc()

    rows = (
        db.session.query(subq)
        .order_by(order_clause)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = []
    rank_offset = (page - 1) * per_page
    for index, row in enumerate(rows):
        items.append(
            {
                'id': row.song_id,
                'rank': rank_offset + index + 1,
                'title': row.song_title,
                'avg_score': round(float(row.avg_score), 2) if row.avg_score is not None else None,
                'rating_count': int(row.rating_count or 0),
                'track_number': row.track_number,
                'spotify_url': row.spotify_url,
                'apple_url': row.apple_url,
                'youtube_url': row.youtube_url,
                'album': {
                    'id': row.album_id,
                    'title': row.album_title,
                    'artist': row.album_artist,
                    'cover_url': row.album_cover_url,
                },
            }
        )

    return jsonify(
        {
            'items': items,
            'pagination': _pagination_payload(int(total), page, per_page),
            'filters': {
                'q': q,
                'min_ratings': min_ratings,
                'sort_by': sort_by if sort_by in sort_map else 'avg_score',
                'sort_dir': 'asc' if sort_dir == 'asc' else 'desc',
            },
        }
    )


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

    candidates = (
        Album.query.options(joinedload(Album.songs))
        .filter(
            Album.queue_order < current.queue_order,
            Album.queue_order > 0,
        )
        .all()
    )

    scored_album_ids = set(
        s.album_id for s in AlbumScore.query.filter_by(user_id=user_id).all()
    )
    voted_album_ids = set(
        album_id
        for (album_id,) in (
            Vote.query.filter_by(user_id=user_id)
            .join(Song)
            .with_entities(Song.album_id)
            .all()
        )
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

    album_ids = [album.id for album in unvoted_albums]
    global_avgs = {}

    if album_ids:
        avg_rows = (
            db.session.query(
                AlbumScore.album_id,
                func.avg(AlbumScore.personal_score),
            )
            .filter(AlbumScore.album_id.in_(album_ids), AlbumScore.ignored.is_(False))
            .group_by(AlbumScore.album_id)
            .all()
        )
        global_avgs = {album_id: avg_score for album_id, avg_score in avg_rows}

    recommendations = []

    for album in unvoted_albums:
        # Use 5.0 because historical model in legacy route used a 10-point scale prediction.
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