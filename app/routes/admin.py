from flask import Blueprint, render_template, current_app
from flask import request, redirect, url_for, render_template, flash
from flask import jsonify
from ..utils import search_album, fetch_album_details, search_youtube_music, search_apple_music, get_album_spotify_data
from ..models import Album, Song, User, VotePeriod, NextAlbumVote, Setting
from ..email import send_email
from ..auth import admin_required
from urllib.parse import quote
from .. import db
from flask_login import login_required
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import func
from collections import defaultdict, Counter
from datetime import datetime, timedelta, timezone
from ..models import Vote, AlbumScore, Comment

import csv
from io import StringIO
from flask import Response

bp = Blueprint('admin', __name__, url_prefix='/admin')

@bp.route('/')
@admin_required
def admin_dashboard():
    return render_template('admin.html')

@bp.route('/comments', methods=['GET', 'POST'])
@admin_required
def manage_comments():
    # Handle moderation actions
    if request.method == 'POST':
        comment_id = request.form.get('comment_id')
        action = request.form.get('action')
        comment = Comment.query.get(comment_id)
        
        if comment:
            if action == 'approve':
                comment.is_hidden = False
                comment.is_flagged = False
                flash('Comment approved.', 'success')
            elif action == 'hide':
                comment.is_hidden = True
                flash('Comment hidden.', 'success')
            elif action == 'delete':
                db.session.delete(comment)
                flash('Comment deleted.', 'success')
            db.session.commit()
        return redirect(url_for('admin.manage_comments'))

    # Fetch comments needing review (flagged or hidden)
    flagged_comments = Comment.query.filter(
        (Comment.is_flagged == True) | (Comment.is_hidden == True)
    ).order_by(Comment.timestamp.desc()).all()
    
    return render_template('admin_comments.html', comments=flagged_comments)

@bp.route('/albums', methods=['GET', 'POST'])
@admin_required
def manage_albums():
    albums = Album.query.order_by(Album.queue_order.asc()).all()

    if request.method == 'POST':
        for album in albums:
            new_order = request.form.get(f'order_{album.id}')
            is_current = request.form.get('current_album') == str(album.id)
            album.queue_order = int(new_order) if new_order.isdigit() else 0
            album.is_current = is_current
        db.session.commit()
        flash("Album queue and current album updated.")
        return redirect(url_for('admin.manage_albums'))

    return render_template('admin_albums.html', albums=albums)

@bp.route('/songs', methods=['GET', 'POST'])
@admin_required
def manage_songs():
    """Manage songs with comprehensive stats and ignore functionality"""
    
    # Get selected album or default to current
    selected_id = request.args.get('album_id', type=int)
    current = Album.query.filter_by(is_current=True).first()
    album = Album.query.get(selected_id) if selected_id else current
    
    if not album:
        flash("No album selected or no albums available.", "warning")
        return redirect(url_for('admin.admin_dashboard'))
    
    # Get all albums with votes for dropdown
    albums = Album.query.filter(
        Album.queue_order > 0,
        db.session.query(Vote).filter(
            Vote.song_id.in_([s.id for s in Song.query.filter_by(album_id=Album.id)]),
            Vote.ignored == False
        ).exists()
    ).order_by(Album.queue_order).all()
    
    # Calculate site-wide stats
    total_songs = Song.query.count()
    total_votes_all = Vote.query.count()
    total_votes_counted = Vote.query.filter_by(ignored=False).count()
    total_votes_ignored = Vote.query.filter_by(ignored=True).count()
    total_albums = Album.query.filter(Album.queue_order > 0).count()
    ignored_songs_count = Song.query.filter_by(ignored=True).count()
    
    # Calculate per-song stats for selected album
    songs = Song.query.filter_by(album_id=album.id).order_by(Song.track_number).all()
    song_stats = []
    
    for song in songs:
        # All votes (including ignored)
        all_votes = Vote.query.filter_by(song_id=song.id).all()
        total_vote_count = len(all_votes)
        
        # Non-ignored votes
        counted_votes = [v for v in all_votes if not v.ignored]
        counted_count = len(counted_votes)
        
        # Ignored votes
        ignored_count = total_vote_count - counted_count
        
        # Average of counted votes
        avg_score = None
        if counted_votes:
            avg_score = sum(v.score for v in counted_votes) / len(counted_votes)
        
        # Min and max scores
        min_score = min([v.score for v in counted_votes]) if counted_votes else None
        max_score = max([v.score for v in counted_votes]) if counted_votes else None
        
        # Retro votes count
        retro_count = sum(1 for v in all_votes if v.retroactive)
        
        song_stats.append({
            'song': song,
            'total_votes': total_vote_count,
            'counted_votes': counted_count,
            'ignored_votes': ignored_count,
            'avg_score': round(avg_score, 2) if avg_score else None,
            'min_score': min_score,
            'max_score': max_score,
            'retro_count': retro_count,
            'is_ignored': song.ignored
        })
    
    # Album-level stats
    album_total_votes = sum(s['total_votes'] for s in song_stats)
    album_counted_votes = sum(s['counted_votes'] for s in song_stats)
    album_ignored_votes = sum(s['ignored_votes'] for s in song_stats)
    album_songs_ignored = sum(1 for s in song_stats if s['is_ignored'])
    
    return render_template('admin_songs.html',
                         album=album,
                         albums=albums,
                         song_stats=song_stats,
                         # Site-wide stats
                         total_songs=total_songs,
                         total_votes_all=total_votes_all,
                         total_votes_counted=total_votes_counted,
                         total_votes_ignored=total_votes_ignored,
                         total_albums=total_albums,
                         ignored_songs_count=ignored_songs_count,
                         # Album-level stats
                         album_total_votes=album_total_votes,
                         album_counted_votes=album_counted_votes,
                         album_ignored_votes=album_ignored_votes,
                         album_songs_ignored=album_songs_ignored)

@bp.route('/songs/<int:song_id>/toggle_ignore', methods=['POST'])
@admin_required
def toggle_song_ignore(song_id):
    """Toggle the ignored status of a song and auto-ignore/unignore all its votes"""
    song = Song.query.get_or_404(song_id)
    album_id = song.album_id
    
    # Toggle song ignored status
    song.ignored = not song.ignored
    
    # Auto-update all votes for this song
    Vote.query.filter_by(song_id=song_id).update({'ignored': song.ignored}, synchronize_session=False)
    
    db.session.commit()
    
    status = "ignored" if song.ignored else "unignored"
    vote_count = Vote.query.filter_by(song_id=song_id).count()
    flash(f"Song '{song.title}' has been {status}. {vote_count} vote(s) automatically {status}.", 'info')
    
    return redirect(url_for('admin.manage_songs', album_id=album_id))

@bp.route('/add_album', methods=['GET', 'POST'])
@admin_required
def add_album():
    if request.method == 'POST':
        query = request.form.get('album_query')
        albums = search_album(query)
        return render_template('add_album_results.html', albums=albums)
    return render_template('add_album.html')

@bp.route('/confirm_album/<spotify_id>')
@admin_required
def confirm_album(spotify_id):
    data = fetch_album_details(spotify_id)

    # Save album
    album = Album(
        title=data['title'],
        artist=data['artist'],
        release_date=data['release_date'],
        cover_url=data['cover_url'],
        spotify_url=data['spotify_url'],
        apple_url = f"https://music.apple.com/us/search?term={quote(data['title'] + ' ' + data['artist'])}",
        youtube_url = f"https://music.youtube.com/search?q={quote(data['title'] + ' ' + data['artist'])}"
    )

    # Fetch additional Spotify data (genres, audio features) - added for Retro Hub
    if data.get('spotify_url'):
        try:
            sp_id = data['spotify_url'].split('/')[-1].split('?')[0]
            sp_data = get_album_spotify_data(sp_id)
            if sp_data:
                import json
                album.spotify_data = json.dumps(sp_data)
        except Exception as e:
            print(f"Failed to fetch spotify data during confirm: {e}")

    db.session.add(album)
    db.session.commit()

    # Save songs
    for track in data['tracks']:
        song = Song(
            album_id=album.id,
            title=track['title'],
            track_number=track['track_number'],
            duration=f"{track['duration']//60}:{track['duration']%60:02}",
            spotify_url=track['spotify_url'],
            youtube_url=search_youtube_music(track['title'], album.artist),
            apple_url=search_apple_music(track['title'], album.artist)
        )
        db.session.add(song)
    db.session.commit()

    flash(f"Album '{album.title}' added successfully!")
    return redirect(url_for('admin.admin_dashboard'))

@bp.route('/results', methods=['GET', 'POST'])
@admin_required
def admin_results():
    selected_id = request.args.get('album_id', type=int)
    current = Album.query.filter_by(is_current=True).first()
    album = Album.query.get(selected_id) if selected_id else current

    # Add a check for a missing album
    if album is None:
        flash("No album selected or no albums are available.", "warning")
        return redirect(url_for('admin.admin_dashboard'))

    # 1) SONG STATS (only non-ignored votes)
    song_stats = []
    songs = sorted(album.songs, key=lambda s: s.track_number)
    for s in songs:
        avg = db.session.query(func.avg(Vote.score))\
            .filter(Vote.song_id == s.id, Vote.ignored == False).scalar()
        cnt = db.session.query(func.count(Vote.id))\
            .filter(Vote.song_id == s.id, Vote.ignored == False).scalar()
        song_stats.append({'track': s.track_number, 'title': s.title,
                           'avg': round(avg, 2) if avg else "N/A", 'count': cnt, 'is_ignored': s.ignored})


    # 2) USER ROWS
    user_votes = {}
    raw_votes = Vote.query.join(Song)\
        .filter(Song.album_id == album.id).all()
    ignored_lookup = {
        (v.user_id, v.song.title): v.ignored
        for v in raw_votes
    }
    for v in raw_votes:
        uid = v.user_id
        if uid not in user_votes:
            user_votes[uid] = {'username': v.user.username, 'votes': {}}
        user_votes[uid]['votes'][v.song.title] = v.score

    raw_scores = AlbumScore.query.filter_by(album_id=album.id, ignored=False).all()
    user_album_scores = {s.user_id: s.personal_score for s in raw_scores}

    # Find which users are ignored on this album
    ignored_vote_user_ids = {
        v.user_id for v in Vote.query.join(Song)
        .filter(Song.album_id == album.id, Vote.ignored == True)
        .all()
    }
    ignored_score_user_ids = {
        s.user_id for s in AlbumScore.query
        .filter_by(album_id=album.id, ignored=True)
        .all()
    }
    ignored_user_ids = ignored_vote_user_ids.union(ignored_score_user_ids)

    # Precompute retroactive flags for votes and album scores for faster template rendering
    retro_vote_user_song = set((v.user_id, v.song_id) for v in Vote.query.join(Song).filter(Song.album_id == album.id, Vote.retroactive == True).all())
    retro_score_user_ids = set(s.user_id for s in AlbumScore.query.filter_by(album_id=album.id, retroactive=True).all())

    # Drop in for the album-select dropdown...
    albums = Album.query.filter(
        Album.queue_order > 0,
        db.session.query(Vote).filter(
            Vote.song_id.in_([s.id for s in Song.query.filter_by(album_id=Album.id)]),
            Vote.ignored == False
        ).exists()
    ).order_by(Album.queue_order).all()

    return render_template('admin_results.html',
                           album=album, albums=albums,
                           song_stats=song_stats,
                           songs=songs,
                           user_votes=user_votes,
                           user_album_scores=user_album_scores,
                           ignored_lookup=ignored_lookup,
                           ignored_user_ids=ignored_user_ids,
                           retro_vote_user_song=retro_vote_user_song,
                           retro_score_user_ids=retro_score_user_ids)

@bp.route('/results/<int:album_id>/ignore_user/<int:user_id>', methods=['POST'])
@admin_required
def ignore_user(album_id, user_id):
    # mark all that user's votes & album score as ignored
    song_ids = [s.id for s in Song.query.filter_by(album_id=album_id)]
    Vote.query.filter(Vote.user_id==user_id,
                      Vote.song_id.in_(song_ids))\
              .update({'ignored':True}, synchronize_session=False)
    AlbumScore.query.filter_by(user_id=user_id, album_id=album_id)\
              .update({'ignored':True}, synchronize_session=False)
    db.session.commit()
    flash('User votes ignored for this album.', 'info')
    return redirect(url_for('admin.admin_results', album_id=album_id))

@bp.route('/results/<int:album_id>/delete_user_votes/<int:user_id>', methods=['POST'])
@admin_required
def delete_user_votes(album_id, user_id):
    song_ids = [s.id for s in Song.query.filter_by(album_id=album_id)]
    Vote.query.filter(Vote.user_id==user_id,
                      Vote.song_id.in_(song_ids))\
              .delete(synchronize_session=False)
    AlbumScore.query.filter_by(user_id=user_id, album_id=album_id)\
              .delete(synchronize_session=False)
    db.session.commit()
    flash('User votes deleted for this album.', 'warning')
    return redirect(url_for('admin.admin_results', album_id=album_id))

@bp.route('/results/<int:album_id>/unignore_user/<int:user_id>', methods=['POST'])
@admin_required
def unignore_user(album_id, user_id):
    song_ids = [s.id for s in Song.query.filter_by(album_id=album_id)]
    # clear the ignored flag
    Vote.query.filter(
        Vote.user_id==user_id,
        Vote.song_id.in_(song_ids)
    ).update({'ignored': False}, synchronize_session=False)
    AlbumScore.query.filter_by(user_id=user_id, album_id=album_id) \
              .update({'ignored': False}, synchronize_session=False)
    db.session.commit()
    flash('User votes un‐ignored for this album.', 'info')
    return redirect(url_for('admin.admin_results', album_id=album_id))


@bp.route('/export_all_votes')
@admin_required
def export_all_votes():
    output = StringIO()
    writer = csv.writer(output)

    writer.writerow(["Username", "Album Title", "Track #", "Song Title", "Song Score", "Album Score"])

    albums = Album.query.filter(Album.queue_order > 0).order_by(Album.queue_order).all()

    for album in albums:
        songs = sorted(album.songs, key=lambda s: s.track_number)
        album_scores = {s.user_id: s.personal_score for s in AlbumScore.query.filter_by(album_id=album.id).all()}
        song_votes = Vote.query.join(Song).filter(Song.album_id == album.id).all()

        user_votes = {}
        for vote in song_votes:
            user = vote.user.username
            if user not in user_votes:
                user_votes[user] = {}
            user_votes[user][vote.song.title] = vote.score

        for user, votes in user_votes.items():
            for song in songs:
                writer.writerow([
                    user,
                    album.title,
                    song.track_number,
                    song.title,
                    votes.get(song.title, ""),
                    album_scores.get(vote.user_id, "") if song == songs[0] else ""
                ])

    output.seek(0)
    return Response(output, mimetype='text/csv', headers={
        "Content-Disposition": "attachment; filename=all_votes_export.csv"
    })


from ..models import Notification
from datetime import datetime

@bp.route('/notifications', methods=['GET', 'POST'])
@admin_required
def manage_notifications():
    if request.method == 'POST':
        msg = request.form['message']
        notif_type = request.form['type']
        start = datetime.fromisoformat(request.form['start_time'])
        end = datetime.fromisoformat(request.form['end_time'])

        # Only allow one active banner
        if notif_type == "banner":
            Notification.query.filter_by(type="banner", is_active=True).update({"is_active": False})

        notif = Notification(
            message=msg,
            type=notif_type,
            start_time=start,
            end_time=end,
            is_active=True
        )
        db.session.add(notif)
        db.session.commit()
        flash("Notification scheduled.")
        return redirect(url_for('admin.manage_notifications'))

    notifications = Notification.query.order_by(Notification.start_time.desc()).all()
    return render_template('admin_notifications.html', notifications=notifications)


@bp.route('/toggle_notification/<int:id>', methods=['POST'])
@admin_required
def toggle_notification(id):
    notif = Notification.query.get_or_404(id)
    notif.is_active = not notif.is_active
    db.session.commit()
    flash("Notification updated.")
    return redirect(url_for('admin.manage_notifications'))


@bp.route('/delete_notification/<int:id>', methods=['POST'])
@admin_required
def delete_notification(id):
    notif = Notification.query.get_or_404(id)
    db.session.delete(notif)
    db.session.commit()
    flash("Notification deleted.")
    return redirect(url_for('admin.manage_notifications'))

from ..models import SongRequest
from datetime import datetime, timedelta, timezone

@bp.route('/song-requests')
@admin_required
def admin_song_requests():
    reqs = SongRequest.query.order_by(SongRequest.fulfilled, SongRequest.timestamp.desc()).all()
    
    # Calculate stats
    total_requests = len(reqs)
    fulfilled_count = sum(1 for r in reqs if r.fulfilled)
    pending_count = total_requests - fulfilled_count
    
    # Requests in last 30 days - handle both naive and aware datetimes
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    recent_requests = 0
    for r in reqs:
        # Make timestamp timezone-aware if it's naive
        ts = r.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= thirty_days_ago:
            recent_requests += 1
    
    # Unique requesters
    unique_users = len(set(r.user_id for r in reqs))
    
    # Requests with full metadata (spotify_id)
    with_metadata = sum(1 for r in reqs if r.spotify_id)
    
    stats = {
        'total': total_requests,
        'fulfilled': fulfilled_count,
        'pending': pending_count,
        'recent_30d': recent_requests,
        'unique_users': unique_users,
        'with_metadata': with_metadata
    }
    
    return render_template('admin_song_requests.html', requests=reqs, stats=stats)

@bp.route('/song-requests/<int:req_id>/fulfill', methods=['GET', 'POST'])
@admin_required
def fulfill_request(req_id):
    req = SongRequest.query.get_or_404(req_id)
    
    # If the request already has full album details (spotify_id), use confirm_album flow
    if req.spotify_id:
        # Fetch full album details from Spotify
        data = fetch_album_details(req.spotify_id)
        
        # Save album
        album = Album(
            title=data['title'],
            artist=data['artist'],
            release_date=data['release_date'],
            cover_url=data['cover_url'],
            spotify_url=data['spotify_url'],
            apple_url = f"https://music.apple.com/us/search?term={quote(data['title'] + ' ' + data['artist'])}",
            youtube_url = f"https://music.youtube.com/search?q={quote(data['title'] + ' ' + data['artist'])}"
        )
        db.session.add(album)
        db.session.commit()
        
        # Save songs
        for track in data['tracks']:
            song = Song(
                album_id=album.id,
                title=track['title'],
                track_number=track['track_number'],
                duration=f"{track['duration']//60}:{track['duration']%60:02}",
                spotify_url=track['spotify_url'],
                youtube_url=search_youtube_music(track['title'], album.artist),
                apple_url=search_apple_music(track['title'], album.artist)
            )
            db.session.add(song)
        
        # Mark request as fulfilled
        req.fulfilled = True
        db.session.commit()
        
        flash(f"Album '{album.title}' added successfully and request marked as fulfilled!", 'success')
        return redirect(url_for('admin.admin_song_requests'))
    else:
        # Old-style request without spotify_id - search and let admin pick
        query = f"{req.title} {req.artist}"
        albums = search_album(query)
        return render_template('admin_fulfill_request.html', request=req, albums=albums)

@bp.route('/song-requests/<int:req_id>/confirm-album/<spotify_id>')
@admin_required
def confirm_request_album(req_id, spotify_id):
    """Confirm album selection for a request and add it to the database"""
    req = SongRequest.query.get_or_404(req_id)
    data = fetch_album_details(spotify_id)

    # Save album
    album = Album(
        title=data['title'],
        artist=data['artist'],
        release_date=data['release_date'],
        cover_url=data['cover_url'],
        spotify_url=data['spotify_url'],
        apple_url = f"https://music.apple.com/us/search?term={quote(data['title'] + ' ' + data['artist'])}",
        youtube_url = f"https://music.youtube.com/search?q={quote(data['title'] + ' ' + data['artist'])}"
    )
    db.session.add(album)
    db.session.commit()

    # Save songs
    for track in data['tracks']:
        song = Song(
            album_id=album.id,
            title=track['title'],
            track_number=track['track_number'],
            duration=f"{track['duration']//60}:{track['duration']%60:02}",
            spotify_url=track['spotify_url'],
            youtube_url=search_youtube_music(track['title'], album.artist),
            apple_url=search_apple_music(track['title'], album.artist)
        )
        db.session.add(song)

    # Mark request as fulfilled
    req.fulfilled = True
    db.session.commit()

    flash(f"Album '{album.title}' added successfully and request from {req.user.username} marked as fulfilled!", 'success')
    return redirect(url_for('admin.admin_song_requests'))

@bp.route('/song-requests/<int:req_id>/delete', methods=['POST'])
@admin_required
def delete_song_request(req_id):
    req = SongRequest.query.get_or_404(req_id)
    
    # Prevent deletion of fulfilled requests to maintain history
    if req.fulfilled:
        flash(f'Cannot delete fulfilled request #{req.id}. Fulfilled requests are kept for historical records.', 'error')
        return redirect(url_for('admin.admin_song_requests'))
    
    db.session.delete(req)
    db.session.commit()
    flash(f'Request #{req.id} deleted.', 'info')
    return redirect(url_for('admin.admin_song_requests'))

@bp.route('/users')
@admin_required
def admin_users():
    stats = []
    users = User.query.order_by(User.username).all()
    for u in users:
        votes_count    = Vote.query.filter_by(user_id=u.id).count()
        album_scores_count = AlbumScore.query.filter_by(user_id=u.id).count()
        requests_count = SongRequest.query.filter_by(user_id=u.id).count()
        stats.append({
            'user': u,
            'votes': votes_count,
            'album_scores': album_scores_count,
            'requests': requests_count
        })
    return render_template('admin_users.html', stats=stats)


def _dt(date):
    return date.astimezone(timezone.utc) if isinstance(date, datetime) else date


@bp.route('/users/stats.json')
@admin_required
def admin_users_stats_json():
    now = datetime.now(timezone.utc)

    users = User.query.all()
    total_users = len(users)
    total_admins = sum(1 for u in users if u.is_admin)
    total_banned = sum(1 for u in users if u.is_banned)
    with_email = sum(1 for u in users if (u.email or '').strip())
    active_30d = sum(1 for u in users if u.last_login and _dt(u.last_login) >= now - timedelta(days=30))

    # Registrations per month (last 12 months)
    joined_counts = defaultdict(int)
    for u in users:
        if u.date_joined:
            dj = _dt(u.date_joined)
            key = dj.strftime('%Y-%m')
            joined_counts[key] += 1
    # Build last 12 months sequence
    labels_join = []
    data_join = []
    for i in range(11, -1, -1):
        dt_month = (now.replace(day=1) - timedelta(days=1)).replace(day=1)  # ensure safe
        # compute month i
    
    # Instead compute by iterating months from oldest to newest
    start = (now.replace(day=1) - timedelta(days=11*30))
    # Normalize to month start
    start = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cur = start
    months = []
    for _ in range(12):
        months.append(cur)
        # advance roughly one month by adding 32 days then setting day=1
        cur = (cur + timedelta(days=32)).replace(day=1)
    for m in months:
        key = m.strftime('%Y-%m')
        labels_join.append(m.strftime('%b %Y'))
        data_join.append(joined_counts.get(key, 0))

    # Votes per day (last 60 days)
    day_counts = defaultdict(int)
    votes = Vote.query.all()
    for v in votes:
        if v.timestamp:
            d = _dt(v.timestamp).date().isoformat()
            day_counts[d] += 1
    labels_votes = []
    data_votes = []
    for i in range(59, -1, -1):
        d = (now - timedelta(days=i)).date().isoformat()
        labels_votes.append(d)
        data_votes.append(day_counts.get(d, 0))

    # Distribution: votes per user
    votes_per_user = Counter(v.user_id for v in votes)
    # buckets
    buckets = [
        (0, 0, '0'),
        (1, 5, '1–5'),
        (6, 10, '6–10'),
        (11, 25, '11–25'),
        (26, 50, '26–50'),
        (51, 100, '51–100'),
        (101, 999999, '100+')
    ]
    bucket_labels = [b[2] for b in buckets]
    bucket_counts = [0]*len(buckets)
    for u in users:
        c = votes_per_user.get(u.id, 0)
        for i, (lo, hi, _) in enumerate(buckets):
            if lo <= c <= hi:
                bucket_counts[i] += 1
                break

    # Top voters
    top_voters = sorted(
        (
            {'user_id': u.id, 'username': u.username, 'count': votes_per_user.get(u.id, 0)}
            for u in users
        ), key=lambda x: x['count'], reverse=True
    )[:10]

    payload = {
        'summary': {
            'total_users': total_users,
            'admins': total_admins,
            'banned': total_banned,
            'with_email': with_email,
            'active_last_30d': active_30d,
        },
        'registrations': {
            'labels': labels_join,
            'data': data_join,
        },
        'votes_over_time': {
            'labels': labels_votes,
            'data': data_votes,
        },
        'votes_per_user_distribution': {
            'labels': bucket_labels,
            'data': bucket_counts,
        },
        'top_voters': top_voters,
    }
    return jsonify(payload)

@bp.route('/battles')
@login_required
@admin_required
def admin_battles():
    from ..models import BattleVote, Song
    from sqlalchemy import desc
    
    # Summary stats
    total_votes = BattleVote.query.count()
    users_participating = BattleVote.query.with_entities(BattleVote.user_id).distinct().count()
    
    # Recent battles
    recent_votes = BattleVote.query.order_by(BattleVote.timestamp.desc()).limit(50).all()
    
    return render_template('admin_battles.html', 
                          total_votes=total_votes, 
                          users_participating=users_participating,
                          recent_votes=recent_votes)

@bp.route('/users/<int:user_id>')
@admin_required
def admin_user_detail(user_id):
    u = User.query.get_or_404(user_id)
    return render_template('admin_user_detail.html', user=u)

@bp.route('/users/<int:user_id>/stats.json')
@admin_required
def admin_user_detail_stats(user_id):
    u = User.query.get_or_404(user_id)
    now = datetime.now(timezone.utc)

    # Totals
    total_votes = Vote.query.filter_by(user_id=u.id).count()
    total_album_scores = AlbumScore.query.filter_by(user_id=u.id).count()
    total_requests = SongRequest.query.filter_by(user_id=u.id).count()

    # Votes per day (last 180 days)
    day_counts = defaultdict(int)
    user_votes = Vote.query.filter_by(user_id=u.id).all()
    for v in user_votes:
        if v.timestamp:
            d = _dt(v.timestamp).date().isoformat()
            day_counts[d] += 1
    labels_votes = []
    data_votes = []
    for i in range(179, -1, -1):
        d = (now - timedelta(days=i)).date().isoformat()
        labels_votes.append(d)
        data_votes.append(day_counts.get(d, 0))

    # Score distribution (1–5 bins of 0.5)
    bins = [x/2 for x in range(2, 11)]  # 1.0..5.0 step 0.5
    bin_labels = [f"{b:.1f}" for b in bins]
    bin_counts = [0]*len(bins)
    for v in user_votes:
        s = v.score
        # round to nearest 0.5
        s = round(s*2)/2
        for i, b in enumerate(bins):
            if abs(s - b) < 1e-9:
                bin_counts[i] += 1
                break

    # Top rated albums (from AlbumScore)
    scores = (db.session.query(Album, AlbumScore)
              .join(AlbumScore, AlbumScore.album_id == Album.id)
              .filter(AlbumScore.user_id == u.id)
              .order_by(AlbumScore.personal_score.desc())
              .limit(10)
              .all())
    top_albums = [
        {
            'album_id': a.id,
            'title': a.title,
            'artist': a.artist,
            'score': s.personal_score
        } for a, s in scores
    ]

    # Recent votes (last 10)
    recent_votes = (db.session.query(Vote, Song, Album)
                    .join(Song, Song.id == Vote.song_id)
                    .join(Album, Album.id == Song.album_id)
                    .filter(Vote.user_id == u.id)
                    .order_by(Vote.timestamp.desc())
                    .limit(10)
                    .all())
    recent = [
        {
            'when': _dt(v.timestamp).isoformat() if v.timestamp else None,
            'song': s.title,
            'album': a.title,
            'artist': a.artist,
            'score': v.score
        } for v, s, a in recent_votes
    ]

    payload = {
        'user': {
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'date_joined': _dt(u.date_joined).isoformat() if u.date_joined else None,
            'last_login': _dt(u.last_login).isoformat() if u.last_login else None,
            'is_admin': u.is_admin,
            'is_banned': u.is_banned,
        },
        'totals': {
            'votes': total_votes,
            'album_scores': total_album_scores,
            'requests': total_requests,
        },
        'votes_over_time': {
            'labels': labels_votes,
            'data': data_votes,
        },
        'score_distribution': {
            'labels': bin_labels,
            'data': bin_counts,
        },
        'top_albums': top_albums,
        'recent_votes': recent,
    }
    return jsonify(payload)


@bp.route('/retro_votes')
@admin_required
def retro_votes():
    """List retroactive song votes and album scores with filters.
    Query params:
      - days: int (default 180)
      - type: 'all' | 'songs' | 'albums'
      - show_ignored: '1' to include ignored (default 0)
      - min_score, max_score: float filters (apply to vote score or album personal_score)
      - album_id, user_id: optional ints to narrow down
    """
    now = datetime.now(timezone.utc)
    days = request.args.get('days', default=180, type=int)
    type_filter = request.args.get('type', default='all')
    show_ignored = request.args.get('show_ignored', default='0') == '1'
    min_score = request.args.get('min_score', type=float)
    max_score = request.args.get('max_score', type=float)
    album_id = request.args.get('album_id', type=int)
    user_id = request.args.get('user_id', type=int)

    since = now - timedelta(days=days) if days and days > 0 else None

    # Retro song votes
    song_rows = []
    if type_filter in ('all', 'songs'):
        q = (db.session.query(Vote, Song, Album, User)
             .join(Song, Song.id == Vote.song_id)
             .join(Album, Album.id == Song.album_id)
             .join(User, User.id == Vote.user_id)
             .filter(Vote.retroactive == True))
        if not show_ignored:
            q = q.filter(Vote.ignored == False)
        if since is not None:
            q = q.filter(Vote.timestamp >= since)
        if album_id:
            q = q.filter(Song.album_id == album_id)
        if user_id:
            q = q.filter(Vote.user_id == user_id)
        if min_score is not None:
            q = q.filter(Vote.score >= min_score)
        if max_score is not None:
            q = q.filter(Vote.score <= max_score)
        q = q.order_by(Vote.timestamp.desc())
        results = q.all()
        for v, s, a, u in results:
            song_rows.append({
                'id': v.id,
                'timestamp': _dt(v.timestamp),
                'album_id': a.id,
                'album_title': a.title,
                'artist': a.artist,
                'track': s.track_number,
                'song_title': s.title,
                'user_id': u.id,
                'username': u.username,
                'score': v.score,
                'ignored': v.ignored,
            })

    # Retro album scores
    album_rows = []
    if type_filter in ('all', 'albums'):
        q2 = (db.session.query(AlbumScore, Album, User)
              .join(Album, Album.id == AlbumScore.album_id)
              .join(User, User.id == AlbumScore.user_id)
              .filter(AlbumScore.retroactive == True))
        if not show_ignored:
            q2 = q2.filter(AlbumScore.ignored == False)
        if since is not None:
            q2 = q2.filter(AlbumScore.timestamp >= since)
        if album_id:
            q2 = q2.filter(AlbumScore.album_id == album_id)
        if user_id:
            q2 = q2.filter(AlbumScore.user_id == user_id)
        if min_score is not None:
            q2 = q2.filter(AlbumScore.personal_score >= min_score)
        if max_score is not None:
            q2 = q2.filter(AlbumScore.personal_score <= max_score)
        q2 = q2.order_by(AlbumScore.timestamp.desc())
        results2 = q2.all()
        for ascore, a, u in results2:
            album_rows.append({
                'id': ascore.id,
                'timestamp': _dt(ascore.timestamp),
                'album_id': a.id,
                'album_title': a.title,
                'artist': a.artist,
                'user_id': u.id,
                'username': u.username,
                'score': ascore.personal_score,
                'ignored': ascore.ignored,
            })

    # Build per-album counts (to link to album-centric view)
    album_counts = {}
    def ensure_album(aid, title, artist):
        if aid not in album_counts:
            album_counts[aid] = {
                'album_id': aid,
                'title': title,
                'artist': artist,
                'song_votes': 0,
                'album_scores': 0,
            }

    for r in song_rows:
        ensure_album(r['album_id'], r['album_title'], r['artist'])
        album_counts[r['album_id']]['song_votes'] += 1
    for r in album_rows:
        ensure_album(r['album_id'], r['album_title'], r['artist'])
        album_counts[r['album_id']]['album_scores'] += 1

    albums_with_counts = sorted(album_counts.values(), key=lambda x: (-(x['song_votes']+x['album_scores']), x['title']))

    # Summary
    summary = {
        'songs': len(song_rows),
        'albums': len(album_rows),
        'days': days,
        'type': type_filter,
        'show_ignored': show_ignored,
        'min_score': min_score,
        'max_score': max_score,
    }

    return render_template('admin_retro_votes.html',
                           summary=summary,
                           song_rows=song_rows,
                           album_rows=album_rows,
                           albums_with_counts=albums_with_counts)


@bp.route('/retro_votes/vote/<int:vote_id>/toggle_ignore', methods=['POST'])
@admin_required
def retro_vote_toggle_ignore(vote_id):
    v = Vote.query.get_or_404(vote_id)
    v.ignored = not v.ignored
    db.session.commit()
    flash(f'Song vote #{v.id} set ignored={v.ignored}.', 'info')
    return redirect(request.referrer or url_for('admin.retro_votes'))


@bp.route('/retro_votes/vote/<int:vote_id>/delete', methods=['POST'])
@admin_required
def retro_vote_delete(vote_id):
    v = Vote.query.get_or_404(vote_id)
    db.session.delete(v)
    db.session.commit()
    flash(f'Song vote #{vote_id} deleted.', 'warning')
    return redirect(request.referrer or url_for('admin.retro_votes'))


@bp.route('/retro_votes/album_score/<int:score_id>/toggle_ignore', methods=['POST'])
@admin_required
def retro_album_score_toggle_ignore(score_id):
    s = AlbumScore.query.get_or_404(score_id)
    s.ignored = not s.ignored
    db.session.commit()
    flash(f'Album score #{s.id} set ignored={s.ignored}.', 'info')
    return redirect(request.referrer or url_for('admin.retro_votes'))


@bp.route('/retro_votes/album_score/<int:score_id>/delete', methods=['POST'])
@admin_required
def retro_album_score_delete(score_id):
    s = AlbumScore.query.get_or_404(score_id)
    db.session.delete(s)
    db.session.commit()
    flash(f'Album score #{score_id} deleted.', 'warning')
    return redirect(request.referrer or url_for('admin.retro_votes'))


@bp.route('/retro_votes/album/<int:album_id>')
@admin_required
def retro_votes_album(album_id):
    album = Album.query.get_or_404(album_id)
    # Songs ordered
    songs = sorted(album.songs, key=lambda s: s.track_number)

    # Retro votes for this album
    retro_votes = (db.session.query(Vote)
                   .join(Song, Song.id == Vote.song_id)
                   .filter(Song.album_id == album.id, Vote.retroactive == True)
                   .all())

    # Retro album scores for this album
    retro_scores = AlbumScore.query.filter_by(album_id=album.id, retroactive=True).all()

    # Build structures
    users_map = {u.id: u for u in User.query.all()}
    user_rows = {}
    for v in retro_votes:
        u = users_map.get(v.user_id) or v.user
        if v.user_id not in user_rows:
            user_rows[v.user_id] = {'username': u.username if u else f'User {v.user_id}', 'votes': {}, 'album_score': None, 'album_score_ignored': False}
        user_rows[v.user_id]['votes'][v.song_id] = {'score': v.score, 'ignored': v.ignored, 'vote_id': v.id}

    for s in retro_scores:
        u = users_map.get(s.user_id)
        if s.user_id not in user_rows:
            user_rows[s.user_id] = {'username': u.username if u else f'User {s.user_id}', 'votes': {}, 'album_score': None, 'album_score_ignored': False}
        user_rows[s.user_id]['album_score'] = s.personal_score
        user_rows[s.user_id]['album_score_ignored'] = s.ignored
        user_rows[s.user_id]['album_score_id'] = s.id

    # Sort users by name
    user_rows_sorted = sorted(user_rows.items(), key=lambda kv: kv[1]['username'].lower())
    # Compute per-song averages (non-ignored, all votes)
    song_avgs = {}
    for s in songs:
        avg = (db.session.query(func.avg(Vote.score))
               .filter(Vote.song_id == s.id, Vote.ignored == False)
               .scalar())
        song_avgs[s.id] = round(avg, 2) if avg is not None else None

    return render_template('admin_retro_album.html', album=album, songs=songs, user_rows=user_rows_sorted, song_avgs=song_avgs)


@bp.route('/retro_votes/album/<int:album_id>/user/<int:user_id>/song/<int:song_id>/toggle_ignore', methods=['POST'])
@admin_required
def retro_toggle_song_ignore(album_id, user_id, song_id):
    # Toggle ignored for all retro votes for this user/song
    votes = (Vote.query
             .filter_by(user_id=user_id, song_id=song_id)
             .filter(Vote.retroactive == True)
             .all())
    if not votes:
        flash('No retro vote found for this cell.', 'error')
        return redirect(url_for('admin.retro_votes_album', album_id=album_id))
    # If mixed states, set all to the opposite of majority; otherwise flip
    ignored_values = [v.ignored for v in votes]
    target = not (sum(ignored_values) > len(ignored_values)/2)
    for v in votes:
        v.ignored = target
    db.session.commit()
    flash('Updated ignore state for selected song vote(s).', 'info')
    return redirect(url_for('admin.retro_votes_album', album_id=album_id))


@bp.route('/retro_votes/album/<int:album_id>/user/<int:user_id>/album_score/toggle_ignore', methods=['POST'])
@admin_required
def retro_toggle_album_score_ignore(album_id, user_id):
    scores = (AlbumScore.query
              .filter_by(user_id=user_id, album_id=album_id)
              .filter(AlbumScore.retroactive == True)
              .all())
    if not scores:
        flash('No retro album score found for this user/album.', 'error')
        return redirect(url_for('admin.retro_votes_album', album_id=album_id))
    # Flip to opposite of majority
    ignored_values = [s.ignored for s in scores]
    target = not (sum(ignored_values) > len(ignored_values)/2)
    for s in scores:
        s.ignored = target
    db.session.commit()
    flash('Updated ignore state for album score.', 'info')
    return redirect(url_for('admin.retro_votes_album', album_id=album_id))

@bp.route('/users/<int:user_id>/ban', methods=['POST'])
@admin_required
def ban_user(user_id):
    u = User.query.get_or_404(user_id)
    u.is_banned = True
    db.session.commit()
    flash(f'User "{u.username}" has been banned.', 'success')
    return redirect(url_for('admin.admin_users'))

@bp.route('/users/<int:user_id>/unban', methods=['POST'])
@admin_required
def unban_user(user_id):
    u = User.query.get_or_404(user_id)
    u.is_banned = False
    db.session.commit()
    flash(f'User "{u.username}" has been unbanned.', 'success')
    return redirect(url_for('admin.admin_users'))

from itsdangerous import URLSafeTimedSerializer

def generate_update_email_token(user):
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    return serializer.dumps(user.username, salt='update-email-salt')

@bp.route('/generate_update_email_link/<int:user_id>', methods=['GET'])
@admin_required
@login_required
def generate_update_email_link(user_id):
    user = User.query.get_or_404(user_id)
    token = generate_update_email_token(user)
    update_link = url_for('user.update_email_token', token=token, _external=True)
    # Flash the link wrapped in a span so it can be auto-copied by JavaScript
    # flash(f'<span id="generated-link">{update_link}</span>', 'update_link')
    # flash(f'Update email link for user "{user.username}" generated.', 'info')

    flash(update_link, 'generated_link')
    # flash(f'Update email link for user "{user.username}" generated.', 'info')
    return redirect(url_for('admin.admin_users'))


@bp.route('/email', methods=['GET', 'POST'])
@admin_required
def admin_email():
    if request.method == 'POST':
        send_type = request.form.get('send_type')
        recipient_group = request.form.get('recipients', 'all')

        if recipient_group == 'all':
            users = User.query.filter(User.email.isnot(None)).all()
        elif recipient_group == 'admins':
            users = User.query.filter(User.email.isnot(None), User.is_admin == True).all()
        else:
            current_album = Album.query.filter_by(is_current=True).first()
            song_ids = [s.id for s in current_album.songs] if current_album else []
            voted_user_ids = db.session.query(Vote.user_id).filter(Vote.song_id.in_(song_ids)).distinct()
            users = User.query.filter(User.email.isnot(None), ~User.id.in_(voted_user_ids)).all()

        # Separate KeyN users from legacy users
        keyn_users = [u for u in users if u.keyn_id]
        legacy_users = [u for u in users if not u.keyn_id and u.email]

        if send_type == 'custom':
            subject = request.form.get('subject', 'Message from Vinyl Vote')
            message = request.form.get('message', '')
            custom_html = request.form.get('html_message', '').strip()
            
            # Use custom HTML if provided, otherwise use template
            if custom_html:
                html_body = custom_html
            else:
                html_body = render_template('emails/custom_email.html', subject=subject, message=message)
            text_body = message
        else:
            current_album = Album.query.filter_by(is_current=True).first()
            vote_period = VotePeriod.query.first()
            vote_end = vote_period.end_time.strftime('%b %-d, %Y at %I:%M %p') if vote_period else 'soon'
            vote_url = url_for('user.vote', _external=True)
            html_body = render_template('emails/reminder_email.html', album=current_album, vote_end=vote_end, vote_url=vote_url)
            subject = f"Don't forget to vote on {current_album.title}!" if current_album else "Don't forget to vote!"
            text_body = f"Go vote here: {vote_url}"

        sent_count = 0
        
        # Send via Nolofication to KeyN users
        if keyn_users:
            from app.nolofication import nolofication
            keyn_ids = [u.keyn_id for u in keyn_users]
            
            nolofication.send_bulk_notification(
                user_ids=keyn_ids,
                title=subject,
                message=text_body,
                html_message=html_body,
                notification_type='info',
                category='admin_messages'
            )
            sent_count += len(keyn_ids)
            current_app.logger.info(f"Sent admin email to {len(keyn_ids)} users via Nolofication")
        
        # Send legacy email to non-KeyN users
        if legacy_users:
            legacy_emails = [u.email for u in legacy_users]
            send_email(subject, current_app.config['MAIL_DEFAULT_SENDER_EMAIL'], current_app.config['MAIL_DEFAULT_SENDER_NAME'], legacy_emails, text_body, html_body)
            sent_count += len(legacy_emails)
        
        if sent_count > 0:
            flash(f"Email sent to {sent_count} user(s).", 'success')
        else:
            flash('No recipients found.', 'error')
        return redirect(url_for('admin.admin_email'))

    return render_template('admin_email.html')

@bp.route('/settings', methods=['GET', 'POST'])
@admin_required
def admin_settings():
    setting = Setting.query.filter_by(key='NEXT_ALBUM_OPTION_COUNT').first()
    notif_setting = Setting.query.filter_by(key='AUTO_SWITCH_NOTIFICATION_SCOPE').first()
    if request.method == 'POST':
        count = request.form.get('next_album_option_count', type=int)
        notif_scope = request.form.get('auto_switch_notification_scope', 'all')
        if setting:
            setting.value = str(count)
        else:
            setting = Setting(key='NEXT_ALBUM_OPTION_COUNT', value=str(count))
            db.session.add(setting)
        if notif_setting:
            notif_setting.value = notif_scope
        else:
            notif_setting = Setting(key='AUTO_SWITCH_NOTIFICATION_SCOPE', value=notif_scope)
            db.session.add(notif_setting)
        db.session.commit()
        current_app.config['NEXT_ALBUM_OPTION_COUNT'] = count
        current_app.config['AUTO_SWITCH_NOTIFICATION_SCOPE'] = notif_scope
        flash('Settings updated.', 'success')
        return redirect(url_for('admin.admin_settings'))

    count = int(setting.value) if setting else current_app.config.get('NEXT_ALBUM_OPTION_COUNT', 3)
    notif_scope = (notif_setting.value if notif_setting else current_app.config.get('AUTO_SWITCH_NOTIFICATION_SCOPE', 'all'))
    return render_template('admin_settings.html', count=count, notif_scope=notif_scope)


@bp.route('/next_album_results')
@admin_required
def next_album_results():
    vote_period = VotePeriod.query.first()
    tallies = db.session.query(Album, func.count(NextAlbumVote.id)).join(NextAlbumVote, NextAlbumVote.album_id == Album.id) \
        .filter(NextAlbumVote.vote_period_id == vote_period.id).group_by(Album.id).order_by(func.count(NextAlbumVote.id).desc()).all()
    return render_template('admin_next_album_results.html', tallies=tallies)

from app.scheduler import apply_next_album_votes, weekly_rollover_job, compute_weekly_rollover_plan

@bp.route('/run_apply_next_album_votes', methods=['POST'])
@admin_required
def run_apply_next_album_votes():
    apply_next_album_votes()
    flash('apply_next_album_votes() executed.', 'success')
    return redirect(url_for('admin.admin_settings'))


@bp.route('/run_weekly_rollover', methods=['POST'])
@admin_required
def run_weekly_rollover():
    msg = weekly_rollover_job(force=True)
    flash(msg or 'Weekly rollover executed.', 'success')
    return redirect(url_for('admin.admin_settings'))


@bp.route('/weekly_rollover_preview', methods=['GET'])
@admin_required
def weekly_rollover_preview():
    limit = current_app.config.get('NEXT_ALBUM_OPTION_COUNT', 3)
    plan = compute_weekly_rollover_plan(limit_count=limit, force=True)
    return render_template('admin_weekly_rollover_preview.html', plan=plan)