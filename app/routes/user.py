from flask import Blueprint, Response, render_template, redirect, url_for, flash, request, session, make_response
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from datetime import timedelta, timezone
import pytz
import secrets

from .. import db
from ..models import User, BattleVote
from ..forms import (
    LoginForm,
    RegisterForm,
    ResetPasswordRequestForm,
    ResetPasswordForm,
    ChangeUsernameForm,
    ChangePasswordForm,
    UpdateEmailForm,
)

from ..models import Album, Song, Vote, AlbumScore, VotePeriod, NextAlbumVote, Setting
from sqlalchemy.orm import joinedload
from flask import request

from sqlalchemy.sql import func

from flask import jsonify
from flask import current_app

from flask import jsonify
from pywebpush import webpush, WebPushException
import json

import requests

bp = Blueprint('user', __name__)

@bp.route('/')
def index():
    album = Album.query.options(joinedload(Album.songs)).filter_by(is_current=True).first()
    top_albums = []
    history = []
    user_streak_current = None

    if album:
        vote_period = VotePeriod.query.first()
        vote_end = vote_period.end_time.isoformat() if vote_period else None
        vote_end_dt = datetime.fromisoformat(vote_end) if vote_end else None

        avg_album_score = db.session.query(func.avg(AlbumScore.personal_score))\
            .filter_by(album_id=album.id, ignored=False).scalar()
        voter_count = db.session.query(func.count(func.distinct(AlbumScore.user_id)))\
            .filter_by(album_id=album.id, ignored=False).scalar()

        # Leaderboard (Top 3)
        top_query = Album.query.filter(
            Album.queue_order > 0,
            Album.is_current == False
        ).all()

        for a in top_query:
            song_ids = [s.id for s in a.songs]
            avg_song_score = db.session.query(func.avg(Vote.score)).filter(Vote.song_id.in_(song_ids), Vote.ignored==False).scalar()
            avg_album_score = db.session.query(func.avg(AlbumScore.personal_score))\
                .filter_by(album_id=a.id, ignored=False).scalar()
            if avg_song_score:
                top_albums.append({
                    'id': a.id,
                    'title': a.title,
                    'artist': a.artist,
                    'cover_url': a.cover_url,
                    'avg': round(avg_song_score, 2),
                    'avg_album_score': round(avg_album_score, 2) if avg_album_score else "N/A",
                })

        top_albums.sort(key=lambda x: x['avg'], reverse=True)
        top_albums = top_albums[:3]

        # Recent history (last 3 finished albums)
        if album.queue_order:
            history_query = Album.query.filter(
                Album.queue_order < album.queue_order,
                Album.queue_order > 0
            ).order_by(Album.queue_order.desc()).limit(3).all()

            for h in history_query:
                score = db.session.query(func.avg(AlbumScore.personal_score))\
                    .filter_by(album_id=h.id, ignored=False).scalar()
                song_ids = [s.id for s in h.songs]
                avg_song_score = db.session.query(func.avg(Vote.score)).filter(Vote.song_id.in_(song_ids), Vote.ignored == False).scalar()
                history.append({
                    'id': h.id,
                    'title': h.title,
                    'artist': h.artist,
                    'cover_url': h.cover_url,
                    'score': round(score, 2) if score else "N/A",
                    'avg_song_score': round(avg_song_score, 2) if avg_song_score else "N/A",
                })

        og_title       = f"Vote: {album.title} by {album.artist}"
        og_description = f"Voting ends on {vote_end_dt.strftime('%b %-d, %Y at %I:%M %p')}. {voter_count} people have voted so far."
        og_image       = album.cover_url
        og_url         = url_for('user.index', _external=True)

        # If logged in, compute current weekly streak (exclude this week)
        if current_user.is_authenticated:
            # Past completed albums ordered by week
            past_albums = (
                Album.query
                .filter(Album.queue_order > 0, Album.queue_order < album.queue_order)
                .order_by(Album.queue_order)
                .all()
            )
            past_ids = [a.id for a in past_albums]
            # Albums with any on-time participation
            song_album_ids = [a[0] for a in db.session.query(Song.album_id)
                              .join(Vote, Vote.song_id == Song.id)
                              .filter(Vote.user_id == current_user.id, Vote.ignored == False, Vote.retroactive == False)
                              .distinct().all()]
            score_album_ids = [a[0] for a in db.session.query(AlbumScore.album_id)
                               .filter(AlbumScore.user_id == current_user.id, AlbumScore.ignored == False, AlbumScore.retroactive == False)
                               .distinct().all()]
            participated = set(song_album_ids + score_album_ids).intersection(set(past_ids))
            # Walk backwards
            streak = 0
            for aid in reversed(past_ids):
                if aid in participated:
                    streak += 1
                else:
                    break
            user_streak_current = streak

        return render_template(
            'index.html',
            album=album,
            avg_album_score=round(avg_album_score, 2) if avg_album_score else None,
            voter_count=voter_count,
            top_albums=top_albums,
            history=history,
            logged_in=current_user.is_authenticated,
            user_streak_current=user_streak_current,
            # Open Graph overrides:
            og_type       = 'website',
            og_title      = og_title,
            og_description= og_description,
            og_image      = og_image,
            og_url        = og_url,
        )

    return render_template('index.html', album=None, logged_in=current_user.is_authenticated)

@bp.route('/results/album/<int:album_id>')
def album_results(album_id: int):
    album = Album.query.options(joinedload(Album.songs)).get(album_id)
    if not album:
        flash("Album not found.")
        return redirect(url_for('user.index'))

    # Song stats
    song_stats = []
    user_votes = {}
    if current_user.is_authenticated:
        user_votes = {v.song_id: v.score for v in Vote.query.filter_by(user_id=current_user.id).join(Song).filter(Song.album_id == album.id).all()}

    for song in sorted(album.songs, key=lambda s: s.track_number or 0):
        avg = db.session.query(func.avg(Vote.score)).filter_by(song_id=song.id, ignored=False).scalar()
        count = db.session.query(func.count(Vote.id)).filter_by(song_id=song.id, ignored=False).scalar()
        # Per-song rating distribution (1–5 buckets)
        dist = [0, 0, 0, 0, 0]
        rows = db.session.query(Vote.score, func.count(Vote.id)) \
            .filter_by(song_id=song.id, ignored=False) \
            .group_by(Vote.score).all()
        for score, c in rows:
            if 1 <= score <= 5:
                dist[int(score) - 1] += c
        user_rating = user_votes.get(song.id, None)
        song_stats.append({
            'track': song.track_number,
            'title': song.title,
            'avg': round(avg, 2) if avg else "N/A",
            'count': count,
            'user_rating': user_rating,
            'dist': dist,
            'is_ignored': song.ignored
        })

    avg_song_score = db.session.query(func.avg(Vote.score)).filter(
        Vote.song_id.in_([s.id for s in album.songs]),
        Vote.ignored == False
    ).scalar()
    avg_album_score = db.session.query(func.avg(AlbumScore.personal_score)).filter_by(album_id=album.id, ignored=False).scalar()
    voter_count = db.session.query(func.count(func.distinct(AlbumScore.user_id))).filter_by(album_id=album.id, ignored=False).scalar()

    return render_template('results.html',
                           album=album,
                           song_stats=song_stats,
                           avg_album_score=round(avg_album_score, 2) if avg_album_score else "N/A",
                           avg_song_score=round(avg_song_score, 2) if avg_song_score else "N/A",
                           voter_count=voter_count)

@bp.route('/terms')
def terms():
    """Display the Terms and Conditions page."""
    return render_template('legal/terms_of_use.html')


@bp.route('/privacy')
def privacy():
    """Display the Privacy Policy page."""
    return render_template('legal/privacy_policy.html')


@bp.route('/robots.txt')
def robots_txt():
    base = request.url_root.rstrip('/')
    body = "\n".join(
        [
            'User-agent: *',
            'Allow: /',
            f'Sitemap: {base}/sitemap.xml',
        ]
    )
    return Response(body, mimetype='text/plain')


@bp.route('/sitemap.xml')
def sitemap_xml():
    base = request.url_root.rstrip('/')
    pages = [
        {'loc': f'{base}/', 'priority': '1.0', 'changefreq': 'daily'},
        {'loc': f'{base}/results', 'priority': '0.9', 'changefreq': 'weekly'},
        {'loc': f'{base}/top_albums', 'priority': '0.8', 'changefreq': 'weekly'},
        {'loc': f'{base}/top_artists', 'priority': '0.8', 'changefreq': 'weekly'},
        {'loc': f'{base}/top_songs', 'priority': '0.8', 'changefreq': 'weekly'},
        {'loc': f'{base}/invite', 'priority': '0.7', 'changefreq': 'weekly'},
        {'loc': f'{base}/terms', 'priority': '0.4', 'changefreq': 'monthly'},
        {'loc': f'{base}/privacy', 'priority': '0.4', 'changefreq': 'monthly'},
    ]

    current_date = datetime.now(timezone.utc).date().isoformat()
    items = [
        (
            f"<url><loc>{page['loc']}</loc><lastmod>{current_date}</lastmod>"
            f"<changefreq>{page['changefreq']}</changefreq><priority>{page['priority']}</priority></url>"
        )
        for page in pages
    ]

    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + ''.join(items)
        + '</urlset>'
    )
    return Response(body, mimetype='application/xml')

@bp.route('/extension')
def extension():
    """Open the chrome web store page for the extension in a new tab."""
    return redirect(current_app.config.get('CHROME_EXTENSION_STORE_URL'), code=302)

# VAPID keys are used for web push notifications
@bp.route('/vapid-public-key')
def vapid_public_key():
    # Return empty with 204 if not configured to avoid client errors
    try:
        key = current_app.config.get('VAPID_PUBLIC_KEY')
        if not key:
            return ('', 204)
        return key
    except Exception:
        return ('', 204)

# This endpoint is used to send web push notifications
@bp.route('/subscribe', methods=['POST'])
@login_required
def subscribe():
    subscription = request.get_json()
    # Try to load existing subscriptions as a list, or start a new one
    try:
        subs = json.loads(current_user.push_subscription) if current_user.push_subscription else []
    except Exception:
        subs = []

    # Append subscription if not already stored
    if subscription not in subs:
        subs.append(subscription)

    current_user.push_subscription = json.dumps(subs)
    db.session.commit()
    return '', 204


@bp.route('/results')
def results():
    current = Album.query.filter_by(is_current=True).first()
    if not current:
        flash("No current album is set.")
        return redirect(url_for('user.index'))

    # Find the album with the highest queue_order < current.queue_order
    previous = Album.query.filter(
        Album.queue_order < current.queue_order,
        Album.queue_order > 0
    ).order_by(Album.queue_order.desc()).first()

    if not previous:
        flash("No previous album to show results for yet.")
        return redirect(url_for('user.index'))

    # Song stats
    song_stats = []
    # Get user's votes for this album if logged in
    user_votes = {}
    if current_user.is_authenticated:
        user_votes = {v.song_id: v.score for v in Vote.query.filter_by(user_id=current_user.id).join(Song).filter(Song.album_id == previous.id).all()}
    
    for song in sorted(previous.songs, key=lambda s: s.track_number):
        avg = db.session.query(func.avg(Vote.score)).filter_by(song_id=song.id, ignored=False).scalar()
        count = db.session.query(func.count(Vote.id)).filter_by(song_id=song.id, ignored=False).scalar()
        # Per-song rating distribution (1–5 buckets)
        dist = [0, 0, 0, 0, 0]
        rows = db.session.query(Vote.score, func.count(Vote.id)) \
            .filter_by(song_id=song.id, ignored=False) \
            .group_by(Vote.score).all()
        for score, c in rows:
            if 1 <= score <= 5:
                dist[int(score) - 1] += c
        user_rating = user_votes.get(song.id, None)
        song_stats.append({
            'track': song.track_number,
            'title': song.title,
            'avg': round(avg, 2) if avg else "N/A",
            'count': count,
            'user_rating': user_rating,
            'dist': dist,
            'is_ignored': song.ignored
        })

    avg_song_score = db.session.query(func.avg(Vote.score)).filter(
        Vote.song_id.in_([s.id for s in previous.songs]),
        Vote.ignored == False
    ).scalar()
    avg_album_score = db.session.query(func.avg(AlbumScore.personal_score)).filter_by(album_id=previous.id, ignored=False).scalar()
    voter_count = db.session.query(func.count(func.distinct(AlbumScore.user_id))).filter_by(album_id=previous.id, ignored=False).scalar()

    return render_template('results.html',
                           album=previous,
                           song_stats=song_stats,
                           avg_album_score=round(avg_album_score, 2) if avg_album_score else "N/A",
                           avg_song_score=round(avg_song_score, 2) if avg_song_score else "N/A",
                           voter_count=voter_count)


@bp.route('/login', methods=['GET','POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('user.index'))

    # KeyN is the default auth path during V2 migration.
    if current_app.config.get('FORCE_KEYN_LOGIN'):
        return redirect(url_for('oauth.oauth_login'))

    return _legacy_login_flow()


@bp.route('/legacy/login', methods=['GET', 'POST'])
def legacy_login():
    if current_user.is_authenticated:
        return redirect(url_for('user.index'))

    return _legacy_login_flow()


def _legacy_login_flow():
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user and check_password_hash(user.password_hash, form.password.data):
            if user.is_banned:
                flash("Your account has been banned. Contact an admin.", "error")
                return redirect(url_for('user.legacy_login'))

            # Use remember_me for persistent login on mobile
            remember_me = form.remember_me.data
            login_user(user, remember=remember_me)

            # Make session permanent if remember me is checked
            if remember_me:
                session.permanent = True

            # record last_login
            user.last_login = datetime.utcnow()
            db.session.commit()
            return redirect(url_for('user.index'))

        flash('Invalid username or password.', 'error')

    return render_template(
        'login.html',
        form=form,
        legacy_mode=True,
        force_keyn_login=current_app.config.get('FORCE_KEYN_LOGIN', False),
    )

@bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('user.index'))

    # KeyN is the default auth path during V2 migration.
    if current_app.config.get('FORCE_KEYN_REGISTRATION'):
        return redirect(url_for('oauth.oauth_login'))

    return _legacy_register_flow()


@bp.route('/legacy/register', methods=['GET', 'POST'])
def legacy_register():
    if current_user.is_authenticated:
        return redirect(url_for('user.index'))

    return _legacy_register_flow()


@bp.route('/dev/login', methods=['GET'])
def dev_login():
    if not current_app.config.get('DEV_AUTH_BYPASS', False):
        return "Not Found", 404

    if current_user.is_authenticated:
        target = request.args.get('next', url_for('user.index'))
        if isinstance(target, str) and target.startswith('/'):
            return redirect(target)
        return redirect(url_for('user.index'))

    configured_default = current_app.config.get('DEV_AUTH_BYPASS_DEFAULT_USERNAME', 'dev-user')
    username = (request.args.get('username') or configured_default or 'dev-user').strip()
    username = username[:64] or 'dev-user'

    user = User.query.filter_by(username=username).first()
    created = False

    if not user:
        user = User(
            username=username,
            password_hash=generate_password_hash(secrets.token_hex(32)),
            keyn_migrated=False,
            is_banned=False,
        )
        db.session.add(user)
        created = True

    user.last_login = datetime.utcnow()
    db.session.commit()

    login_user(user, remember=True)
    session.permanent = True

    if created:
        flash(f"Dev login created local user '{username}'.", 'info')
    else:
        flash(f"Logged in as local dev user '{username}'.", 'info')

    target = request.args.get('next', '/')
    if isinstance(target, str) and target.startswith('/'):
        return redirect(target)
    return redirect(url_for('user.index'))


def _legacy_register_flow():
    form = RegisterForm()
    if form.validate_on_submit():
        existing = User.query.filter_by(username=form.username.data).first()
        if existing:
            flash('Username already taken.')
        else:
            hashed_pw = generate_password_hash(form.password.data)
            user = User(username=form.username.data, password_hash=hashed_pw)
            db.session.add(user)
            db.session.commit()
            login_user(user, remember=True)  # Auto-remember for new users
            session.permanent = True
            return redirect(url_for('user.index'))
    return render_template(
        'register.html',
        form=form,
        legacy_mode=True,
        force_keyn=current_app.config.get('FORCE_KEYN_REGISTRATION', False),
        force_keyn_login=current_app.config.get('FORCE_KEYN_LOGIN', False),
    )

@bp.route('/logout', methods=['GET', 'POST'])
def logout():
    """Log out user and clear all session/auth cookies."""
    logout_user()
    session.clear()

    # Create response with redirect
    response = make_response(redirect(url_for('user.index')))

    # Explicitly expire session cookies with both max_age and expires for maximum compatibility
    expires = 'Thu, 01 Jan 1970 00:00:00 GMT'
    
    response.set_cookie(
        'remember_token',
        '',
        max_age=0,
        expires=expires,
        path='/',
        samesite='Lax',
        httponly=True,
    )
    response.set_cookie(
        'session',
        '',
        max_age=0,
        expires=expires,
        path='/',
        samesite='Lax',
        httponly=True,
    )

    return response

@bp.route('/update_email', methods=['POST'])
@login_required
def update_email():
    form = UpdateEmailForm()
    if form.validate_on_submit():
        current_user.email = form.email.data
        db.session.commit()
        flash('Email updated successfully!', 'success')
    else:
        flash('Please enter a valid email address.', 'error')
    return redirect(url_for('user.index'))

@bp.route('/update_email_token/<token>', methods=['GET', 'POST'])
def update_email_token(token):
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        username = serializer.loads(token, salt='update-email-salt', max_age=3600)
    except Exception:
        flash("The update link is invalid or has expired.", "error")
        return redirect(url_for('user.index'))
    user = User.query.filter_by(username=username).first()
    if not user:
        flash("User not found.", "error")
        return redirect(url_for('user.index'))
    
    form = UpdateEmailForm()
    if form.validate_on_submit():
        user.email = form.email.data
        db.session.commit()
        flash("Email updated successfully!", "success")
        return redirect(url_for('user.index'))
    if form.errors:
        flash("Please enter a valid email address.", "error")
    
    return render_template('update_email_token.html', form=form, username=user.username)

from itsdangerous import URLSafeTimedSerializer

def generate_reset_token(user):
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    return serializer.dumps(user.username, salt='password-reset-salt')

def verify_reset_token(token, expiration=3600):
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        username = serializer.loads(token, salt='password-reset-salt', max_age=expiration)
    except Exception:
        return None
    return User.query.filter_by(username=username).first()

from ..email import send_email

@bp.route('/reset_password_request', methods=['GET', 'POST'])
def reset_password_request():
    form = ResetPasswordRequestForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if not user:
            user = User.query.filter_by(email=form.username.data).first()
        if user:
            if user.keyn_migrated or user.keyn_id:
                flash('This account uses KeyN sign-in. Please reset your password through KeyN.', 'info')
                return redirect(url_for('oauth.oauth_login'))
            if user.email == "NULL":
                flash("You do not have an email address set. Please contact an admin.", "error")
                return redirect(url_for('user.legacy_login'))
            token = generate_reset_token(user)
            reset_url = url_for('user.reset_password', token=token, _external=True)
            
            # Use Nolofication for users with KeyN IDs
            if user.keyn_id:
                from app.nolofication import nolofication
                html_msg = f'''
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #ff9800;">🔐 Password Reset Request</h2>
                    <p>You requested to reset your password for your Vinyl Vote account.</p>
                    <p>Click the button below to reset your password:</p>
                    <a href="{reset_url}" 
                       style="display: inline-block; padding: 12px 24px; background: #ff9800; 
                              color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">
                        Reset Password
                    </a>
                    <p style="margin-top: 20px; font-size: 14px; color: #666;">
                        If you didn't request this, you can safely ignore this email.
                    </p>
                </div>
                '''
                nolofication.send_notification(
                    user_id=user.keyn_id,
                    title='Password Reset Request',
                    message=f'Use the following link to reset your password: {reset_url}',
                    html_message=html_msg,
                    notification_type='warning',
                    category='security'
                )
            else:
                # Legacy email for non-KeyN users
                send_email(
                    subject='Password Reset Request',
                    sender_email=current_app.config['MAIL_DEFAULT_SENDER_EMAIL'],
                    sender_name=current_app.config['MAIL_DEFAULT_SENDER_NAME'],
                    recipients=[user.email],
                    text_body=f'Use the following link to reset your password:\n{reset_url}',
                    html_body=f'<p>Click <a href="{reset_url}">here</a> to reset your password.</p>'
                )
            flash('An email with instructions to reset your password has been sent.', 'info')
        else:
            flash('Invalid username/email.', 'error')
        return redirect(url_for('user.login'))
    return render_template('reset_password_request.html', form=form)

@bp.route('/reset_password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    user = verify_reset_token(token)
    if not user:
        flash('The password reset link is invalid or has expired.', 'error')
        return redirect(url_for('user.reset_password_request'))
    if user.keyn_migrated or user.keyn_id:
        flash('This account uses KeyN sign-in. Please reset your password through KeyN.', 'info')
        return redirect(url_for('oauth.oauth_login'))
    form = ResetPasswordForm()
    if form.validate_on_submit():
        user.password_hash = generate_password_hash(form.password.data)
        db.session.commit()
        flash('Your password has been reset. You can now log in.', 'success')
        return redirect(url_for('user.login'))
    return render_template('reset_password.html', form=form)

@bp.route('/invite')
def invite():
    album = Album.query.filter_by(is_current=True).first()
    if not album:
        flash("No album available to invite people to.", "error")
        return redirect(url_for('user.index'))

    # parse the VOTE_END_TIME from config and convert to ISO
    vote_period = VotePeriod.query.first()
    vote_end_dt = vote_period.end_time if vote_period else None
    vote_end_iso = vote_period.end_time.isoformat() if vote_period else None

    # OG metadata
    og_title       = "Join Vinyl Vote Today!"
    og_description = f"Each week, a new album is featured for you to rate. This week, we're voting on \"{album.title}\" by {album.artist}. Don't miss out! Make an account today.\nVoting ends on {vote_end_dt.strftime('%b %-d, %Y at %I:%M %p')}"
    og_image       = album.cover_url
    og_url         = url_for('user.invite', _external=True)

    return render_template(
        'invite.html',
        album          = album,
        vote_end       = vote_end_iso,    # ← pass ISO string for JS
        og_type        = 'website',
        og_title       = og_title,
        og_description = og_description,
        og_image       = og_image,
        og_url         = og_url,
    )


@bp.route('/vote', methods=['GET', 'POST'])
@login_required
def vote():
    album = Album.query.options(joinedload(Album.songs)).filter_by(is_current=True).first()
    if not album:
        flash("No album set for voting.")
        return redirect(url_for('user.index'))

    if request.method == 'POST':
        # Handle song votes
        for song in album.songs:
            score = request.form.get(f'score_{song.id}')
            if score:
                try:
                    score = float(score)
                except ValueError:
                    continue  # skip invalid inputs

                # For the current album allow editing existing votes (users may change their vote while the week is live)
                existing_vote = Vote.query.filter_by(user_id=current_user.id, song_id=song.id).first()
                if existing_vote:
                    existing_vote.score = score
                    # Auto-ignore if song is now ignored
                    existing_vote.ignored = song.ignored
                else:
                    # Auto-ignore new votes for ignored songs
                    db.session.add(Vote(user_id=current_user.id, song_id=song.id, score=score, retroactive=False, ignored=song.ignored))

        # Handle personal album score
        personal_score = request.form.get('personal_score')
        if personal_score:
            existing_score = AlbumScore.query.filter_by(user_id=current_user.id, album_id=album.id).first()
            if existing_score:
                # allow updating album score for the current album
                existing_score.personal_score = float(personal_score)
            else:
                db.session.add(AlbumScore(user_id=current_user.id, album_id=album.id, personal_score=float(personal_score), retroactive=False))

        db.session.commit()
        flash("Your votes have been saved.")
        session['clear_localstorage'] = True
        # After voting on the weekly album, send the user to pick next week's album
        return redirect(url_for('user.next_album_vote'))

    # GET request - show current values
    user_votes = {v.song_id: v.score for v in Vote.query.filter_by(user_id=current_user.id).all()}
    personal_score = AlbumScore.query.filter_by(user_id=current_user.id, album_id=album.id).first()

    vote_end = current_app.config.get('VOTE_END_TIME', None)
    vote_end_dt = datetime.fromisoformat(vote_end) if vote_end else None
    vote_end_readable = vote_end_dt.strftime('%b %-d, %Y at %I:%M %p') if vote_end_dt else "N/A"

    og_title       = f"Go Vote on: {album.title} by {album.artist}"
    og_description = f"Voting ends on {vote_end_readable}."
    og_image       = album.cover_url
    og_url         = url_for('user.vote', _external=True)

    return render_template(
        'vote.html',
        album=album,
        user_votes=user_votes,
        personal_score=personal_score,
        og_type='website',
        og_title=og_title,
        og_description=og_description,
        og_image=og_image,
        og_url=og_url,
    )


@bp.route('/retro_hub')
@login_required
def retro_hub():
    """
    Main hub for retroactive voting.
    Lists all missed albums sorted by predicted rating.
    """
    import json
    from sqlalchemy import func
    from collections import defaultdict
    
    current = Album.query.filter_by(is_current=True).first()
    if not current:
        return redirect(url_for('user.index'))

    # 1. Get all candidate albums (past albums)
    candidates = Album.query.filter(
        Album.queue_order < current.queue_order,
        Album.queue_order > 0
    ).all()

    # 2. Filter out albums the user has already voted on
    # Get set of album_ids specific user has voted on (via AlbumScore or Song Votes)
    
    # User AlbumScores
    scored_album_ids = set(s.album_id for s in AlbumScore.query.filter_by(user_id=current_user.id).all())
    
    # User Song Votes (get distinct album_ids)
    voted_album_ids = set(v.song.album_id for v in Vote.query.filter_by(user_id=current_user.id).join(Song).all())
    
    done_ids = scored_album_ids.union(voted_album_ids)
    
    unvoted_albums = [a for a in candidates if a.id not in done_ids]
    
    # 3. Calculate Predictions
    
    # Pre-fetch user's artist averages
    user_artist_avgs = {}
    user_scores = AlbumScore.query.filter_by(user_id=current_user.id).options(joinedload(AlbumScore.album)).all()
    user_artist_scores = defaultdict(list)
    
    # Also calculate user's top genres from high-rated albums
    user_genre_counts = defaultdict(int)

    for s in user_scores:
        if s.album:
            user_artist_scores[s.album.artist].append(s.personal_score)
            
            # If user liked this album (>= 3.5), count its genres
            # Scores seems to be out of 5, so 3.5 is a good threshold (70%)
            if s.personal_score >= 3.5 and s.album.spotify_data:
                try:
                    sdata = json.loads(s.album.spotify_data)
                    genres = sdata.get('genres', [])
                    for g in genres:
                        user_genre_counts[g] += 1
                except:
                    pass
    
    for artist, scores in user_artist_scores.items():
        user_artist_avgs[artist] = sum(scores) / len(scores)

    # Identify top genres (appearing at least twice)
    top_user_genres = {g for g, count in user_genre_counts.items() if count >= 1}
    # Or just take top 10 regardless of count if list is small?
    # Let's weigh them. Actually, simpler: just use the set for matching.

    # Pre-fetch global averages for candidates
    global_avgs = {}
    for a in unvoted_albums:
        avg = db.session.query(func.avg(AlbumScore.personal_score)).filter_by(album_id=a.id, ignored=False).scalar()
        global_avgs[a.id] = avg if avg is not None else 5.0 # default to mid-point if no votes

    recommendations = []
    
    for a in unvoted_albums:
        # A. Base Score (Global Popularity)
        base_score = global_avgs.get(a.id, 5.0)
        
        # B. Artist Affinity
        artist_avg = user_artist_avgs.get(a.artist)
        artist_bonus = 0
        match_reason = "Global favorite" # Default
        
        if artist_avg is not None:
             diff = artist_avg - 5.0 
             artist_bonus = diff * 0.6 
             match_reason = f"You rated {a.artist} {artist_avg:.1f} avg"
        
        # C. Genre Affinity & Spotify Popularity
        spotify_bonus = 0
        
        if a.spotify_data:
             try:
                 idata = json.loads(a.spotify_data)
                 
                 # 1. Popularity (minor boost)
                 pop = idata.get('popularity', 0)
                 spotify_bonus += (pop / 100.0) * 0.3
                 
                 # 2. Genre Match
                 candidate_genres = idata.get('genres', [])
                 matching_genres = [g for g in candidate_genres if g in top_user_genres]
                 
                 if matching_genres and artist_bonus <= 0:
                     # Only apply genre boost if artist affinity isn't already driving the score
                     # (or simpler: always add it but cap it)
                     count_match = len(matching_genres)
                     genre_boost = min(1.5, count_match * 0.5) # 0.5 per matching genre, max 1.5
                     spotify_bonus += genre_boost
                     
                     # Update reason if it's currently generic
                     if match_reason == "Global favorite":
                         # Capitalize genres
                         display_genres = ", ".join([g.title() for g in matching_genres[:2]])
                         match_reason = f"Matches your taste in {display_genres}"
                         
             except:
                 pass

        predicted = base_score + artist_bonus + spotify_bonus
        
        # Cap at 10
        predicted = min(9.9, max(0.1, predicted)) # keep within 0.1-9.9 usually
        
        recommendations.append({
            'album': a,
            'predicted': predicted,
            'reason': match_reason,
            'base': base_score
        })
    
    # Sort by predicted desc
    recommendations.sort(key=lambda x: x['predicted'], reverse=True)
    
    return render_template('retro_hub.html', recommendations=recommendations)


@bp.route('/retro_suggestion')
@login_required
def retro_suggestion():
    """Redirect legacy suggestion link to the new Hub."""
    return redirect(url_for('user.retro_hub'))


@bp.route('/retro_vote/<int:album_id>', methods=['GET', 'POST'])
@login_required
def retro_vote(album_id):
    """Allow retro voting on a past album if the user hasn't already voted on it."""
    album = Album.query.options(joinedload(Album.songs)).get(album_id)
    if not album:
        flash('Album not found.', 'error')
        return redirect(url_for('user.index'))

    current = Album.query.filter_by(is_current=True).first()
    # Only allow retro voting on albums earlier than current
    if not current or album.queue_order >= current.queue_order:
        flash('Retro voting is only allowed on earlier albums.', 'error')
        return redirect(url_for('user.index'))

    # Prevent voting if user already has votes/scores for this album
    existing_score = AlbumScore.query.filter_by(user_id=current_user.id, album_id=album.id).first()
    song_ids = [s.id for s in album.songs]
    existing_vote = Vote.query.filter(Vote.user_id==current_user.id, Vote.song_id.in_(song_ids)).first()
    if existing_score or existing_vote:
        flash('You have already voted on this album and cannot change your votes.', 'info')
        return redirect(url_for('user.results'))

    if request.method == 'POST':
        # Process retro votes similarly to normal vote, but mark retroactive=True
        for song in album.songs:
            score = request.form.get(f'score_{song.id}')
            if score:
                try:
                    score = float(score)
                except ValueError:
                    continue
                # ensure no existing vote (shouldn't be one)
                if not Vote.query.filter_by(user_id=current_user.id, song_id=song.id).first():
                    # Auto-ignore new votes for ignored songs
                    db.session.add(Vote(user_id=current_user.id, song_id=song.id, score=score, retroactive=True, ignored=song.ignored))

        personal_score = request.form.get('personal_score')
        if personal_score:
            if not AlbumScore.query.filter_by(user_id=current_user.id, album_id=album.id).first():
                db.session.add(AlbumScore(user_id=current_user.id, album_id=album.id, personal_score=float(personal_score), retroactive=True))

        db.session.commit()
        flash('Your retroactive votes have been recorded.', 'success')
        return redirect(url_for('user.results'))

    # GET -> render a voting page using the same vote UI but in retro mode
    user_votes = {}
    personal_score = None
    return render_template('retro_vote.html', album=album, user_votes=user_votes, personal_score=personal_score)

@bp.route('/vote_distribution/<int:album_id>')
def vote_distribution(album_id):
    song_ids = [s.id for s in Song.query.filter_by(album_id=album_id).all()]
    vote_counts = [0, 0, 0, 0, 0]  # index 0 = 1-star, index 4 = 5-star

    votes = db.session.query(Vote.score, func.count(Vote.id))\
        .filter(Vote.song_id.in_(song_ids), Vote.ignored == False)\
        .group_by(Vote.score).all()

    for score, count in votes:
        if 1 <= score <= 5:
            vote_counts[int(score) - 1] += count

    return jsonify(vote_counts)

@bp.route('/top_albums')
def top_albums():
    q = request.args.get('q', '').strip().lower()

    current_album = Album.query.filter_by(is_current=True).first()
    if not current_album:
        flash("No current album is set. Cannot determine top albums.")
        return redirect(url_for('user.index'))

    albums = Album.query.filter(
        Album.is_current == False,
        Album.queue_order > 0,
        Album.queue_order < current_album.queue_order
    ).all()

    album_data = []
    for album in albums:
        songs = album.songs
        song_ids = [song.id for song in songs]

        # Only include albums with votes
        vote_count = db.session.query(func.count(Vote.id)).filter(Vote.song_id.in_(song_ids), Vote.ignored==False).scalar()
        score_count = db.session.query(func.count(AlbumScore.id)).filter_by(album_id=album.id, ignored=False).scalar()

        if vote_count == 0 and score_count == 0:
            continue

        avg_song_score = db.session.query(func.avg(Vote.score))\
            .filter(Vote.song_id.in_(song_ids), Vote.ignored==False).scalar()

        avg_album_score = db.session.query(func.avg(AlbumScore.personal_score))\
            .filter_by(album_id=album.id, ignored=False).scalar()
        
        album_data.append({
            'id': album.id,
            'title': album.title,
            'artist': album.artist,
            'release_date': album.release_date,
            'cover_url': album.cover_url,
            'avg_song_score': round(avg_song_score, 2) if avg_song_score else "N/A",
            'avg_album_score': round(avg_album_score, 2) if avg_album_score else "N/A",
        })

    # sort by song score
    album_data.sort(key=lambda x: (x['avg_song_score'] if isinstance(x['avg_song_score'], float) else 0), reverse=True)

    # filter by search term
    if q:
        album_data = [
            a for a in album_data
            if q in a['title'].lower() or q in a['artist'].lower()
        ]

    return render_template('top_albums.html', album_data=album_data, q=q)

from ..utils import fetch_artist_image

@bp.route('/top_artists')
def top_artists():
    """Fast Top Artists with filters, caching, and pagination."""
    # Get the current album
    current_album = Album.query.filter_by(is_current=True).first()
    if not current_album:
        flash("No current album is set. Cannot determine top artists.")
        return redirect(url_for('user.index'))

    # Filters
    q = request.args.get('q', '', type=str).strip()
    min_ratings = request.args.get('min_ratings', type=int)
    min_avg = request.args.get('min_avg', type=float)

    # Pagination
    page = max(request.args.get('page', 1, type=int), 1)
    per_page = min(max(request.args.get('per_page', 25, type=int), 5), 100)

    # Base aggregated query
    base = db.session.query(
        Album.artist.label('artist'),
        func.avg(Vote.score).label('avg_song_score'),
        func.count(Vote.id).label('num_ratings')
    ).join(Song, Song.album_id == Album.id) \
     .join(Vote, Vote.song_id == Song.id) \
     .filter(
         Album.queue_order > 0,
         Album.queue_order < current_album.queue_order,
         Vote.ignored == False
     ) \
     .group_by(Album.artist)

    # Apply filters
    if q:
        base = base.filter(Album.artist.ilike(f"%{q}%"))
    if min_ratings is not None:
        base = base.having(func.count(Vote.id) >= min_ratings)
    else:
        base = base.having(func.count(Vote.id) > 0)
    if min_avg is not None:
        base = base.having(func.avg(Vote.score) >= min_avg)

    base = base.order_by(func.avg(Vote.score).desc())

    # Count via subquery
    subq = base.subquery()
    total = db.session.query(func.count()).select_from(subq).scalar() or 0

    # Page slice
    rows = db.session.query(
        subq.c.artist, subq.c.avg_song_score, subq.c.num_ratings
    ).order_by(subq.c.avg_song_score.desc()) \
     .offset((page - 1) * per_page).limit(per_page).all()

    # Cache artist images using Setting KV store
    enhanced = []
    for artist, avg, cnt in rows:
        cache_key = f"artist_image:{artist}"
        setting = Setting.query.filter_by(key=cache_key).first()
        if setting and setting.value:
            img = setting.value
        else:
            img = fetch_artist_image(artist)
            # cache non-empty result to avoid repeated lookups
            try:
                if img:
                    if setting:
                        setting.value = img
                    else:
                        db.session.add(Setting(key=cache_key, value=img))
                    db.session.commit()
            except Exception:
                db.session.rollback()
        enhanced.append({
            'artist': artist,
            'avg': round(avg, 2) if isinstance(avg, (int, float)) else avg,
            'count': cnt,
            'image_url': img or url_for('static', filename='favicon_64x64.png')
        })

    has_prev = page > 1
    has_next = (page * per_page) < total

    return render_template('top_artists.html',
                           stats=enhanced,
                           page=page,
                           per_page=per_page,
                           total=total,
                           has_prev=has_prev,
                           has_next=has_next,
                           q=q,
                           min_ratings=min_ratings if min_ratings is not None else '',
                           min_avg=min_avg if min_avg is not None else '')


@bp.route('/artist/<artist_name>/top_songs')
def artist_top_songs(artist_name):
    # pull the 3 highest-rated songs for that artist
    try:
        rows = db.session.query(
            Song.id,
            Song.title,
            Song.spotify_url,
            func.avg(Vote.score).label('avg_score'),
            func.count(Vote.id).label('count')
        ).join(Album, Album.id == Song.album_id) \
         .join(Vote, Vote.song_id == Song.id) \
         .filter(Album.artist == artist_name, Vote.ignored == False) \
         .group_by(Song.id) \
         .order_by(func.avg(Vote.score).desc()) \
         .limit(3).all()

        payload = []
        for r in rows:
            avg = float(r.avg_score) if r.avg_score is not None else None
            payload.append({
                'id':    r.id,
                'title': r.title,
                'avg':   round(avg, 2) if isinstance(avg, (int, float)) else None,
                'count': int(r.count) if r.count is not None else 0,
                'spotify_url': r.spotify_url
            })
        return jsonify(payload)
    except Exception:
        # Never error; return empty list so UI can retry later
        return jsonify([]), 200

@bp.route('/artist/<artist_name>/bio')
def artist_bio(artist_name):
        # Try cache first (Setting key/value)
        try:
            cache_key = f"artist_bio:{artist_name}"
            setting = Setting.query.filter_by(key=cache_key).first()
            if setting and setting.value:
                return jsonify({'bio': setting.value})
        except Exception:
            pass

        # fetch from Wikipedia with error handling and timeout
        try:
            # 1) REST summary API (more reliable for intros)
            import urllib.parse as urlparse
            rest_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urlparse.quote(artist_name)}"
            resp = requests.get(rest_url, timeout=6, headers={'accept':'application/json','user-agent':'vinyl-vote/1.0'})
            if resp.ok:
                data = resp.json()
                extract = data.get('extract') or data.get('description')
                if extract:
                    # Truncate to fit settings.value column (256)
                    if len(extract) > 250:
                        extract = extract[:247] + '...'
                    # cache
                    try:
                        if setting:
                            setting.value = extract
                        else:
                            db.session.add(Setting(key=cache_key, value=extract))
                        db.session.commit()
                    except Exception:
                        db.session.rollback()
                    return jsonify({'bio': extract})
        except Exception:
            pass

        # 2) Fallback to MediaWiki extracts API
        WAPI = 'https://en.wikipedia.org/w/api.php'
        params = {
            'action': 'query',
            'format': 'json',
            'prop':   'extracts',
            'exintro': True,
            'explaintext': True,
            'titles': artist_name
        }
        try:
            resp = requests.get(WAPI, params=params, timeout=6)
            if resp.ok:
                data = resp.json()
                page = next(iter(data.get('query', {}).get('pages', {}).values()), {})
                extract = page.get('extract')
                if extract:
                    if len(extract) > 250:
                        extract = extract[:247] + '...'
                    try:
                        if setting:
                            setting.value = extract
                        else:
                            db.session.add(Setting(key=cache_key, value=extract))
                        db.session.commit()
                    except Exception:
                        db.session.rollback()
                    return jsonify({'bio': extract})
        except Exception:
            pass

        # Always return success with default text
        return jsonify({'bio': 'No bio found.'}), 200

@bp.route('/top_songs')
def top_songs():
    q = request.args.get('q', '').strip().lower()
    
    current_album = Album.query.filter_by(is_current=True).first()
    if not current_album:
        flash("No current album is set. Cannot determine top songs.")
        return redirect(url_for('user.index'))

    # Base query
    query = db.session.query(
        Song.title,
        Album.artist,
        Album.title.label('album_title'),
        func.avg(Vote.score).label('avg_score'),
        func.count(Vote.id).label('vote_count'),
        Song.spotify_url,
        Song.apple_url,
        Song.youtube_url
    ).join(Album, Album.id == Song.album_id)\
     .join(Vote, Vote.song_id == Song.id)\
     .filter(
         Album.queue_order > 0,
         Album.queue_order < current_album.queue_order,
         Vote.ignored == False
     )\
     .group_by(Song.id)\
     .having(func.count(Vote.id) >= 3)  # Require at least 3 ratings

    # Apply search filter
    if q:
        query = query.filter(
            db.or_(
                Song.title.ilike(f'%{q}%'),
                Album.artist.ilike(f'%{q}%'),
                Album.title.ilike(f'%{q}%')
            )
        )

    songs = query.order_by(func.avg(Vote.score).desc()).all()

    return render_template('top_songs.html', 
                         songs=songs,
                         q=q)


from ..models import SongRequest
from ..utils import send_push, search_album

@bp.route('/song-requests', methods=['GET', 'POST'])
@login_required
def song_requests():
    if request.method == 'POST':
        # Check if this is a search request
        album_query = request.form.get('album_query', '').strip()
        if album_query:
            # Search for albums on Spotify
            albums = search_album(album_query)
            return render_template('request_album_results.html', albums=albums, query=album_query)
        
        # Otherwise, this is a confirmed album selection
        title = request.form.get('title', '').strip()
        artist = request.form.get('artist', '').strip()
        spotify_id = request.form.get('spotify_id', '').strip()
        cover_url = request.form.get('cover_url', '').strip()
        release_date = request.form.get('release_date', '').strip()
        spotify_url = request.form.get('spotify_url', '').strip()
        
        if not title or not artist:
            flash('Both album title and artist are required.', 'error')
        else:
            req = SongRequest(
                user_id=current_user.id, 
                title=title, 
                artist=artist,
                spotify_id=spotify_id or None,
                cover_url=cover_url or None,
                release_date=release_date or None,
                spotify_url=spotify_url or None
            )
            db.session.add(req)
            db.session.commit()
            flash('Your request has been submitted!', 'success')

            # Send push notification to admins
            admins = User.query.filter_by(is_admin=True).all()
            for admin in admins:
                if admin.push_subscription:
                    try:
                        subs = json.loads(admin.push_subscription)
                    except Exception:
                        subs = []
                    for sub in subs:
                        try:
                            send_push(
                                subscription_info=json.dumps(sub),
                                title="New Album Request",
                                body=f'{current_user.username} requested "{title}" by {artist}.',
                                url=url_for('admin.admin_song_requests', _external=True)
                            )
                        except WebPushException as ex:
                            current_app.logger.error(f"Web push failed: {ex}")
        return redirect(url_for('user.song_requests'))

    # Show current user's requests, newest first
    requests = SongRequest.query \
        .filter_by(user_id=current_user.id) \
        .order_by(SongRequest.timestamp.desc()) \
        .all()

    return render_template('song_requests.html', requests=requests)

@bp.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    username_form = ChangeUsernameForm(prefix='username')
    password_form = ChangePasswordForm(prefix='password')
    email_form = UpdateEmailForm(prefix='email')

    # If user is KeyN-managed, block local modifications (read-only here)
    if current_user.keyn_migrated:
        # Skip processing local change forms
        pass
    elif username_form.submit.data and username_form.validate_on_submit():
        existing = User.query.filter_by(username=username_form.new_username.data).first()
        if existing:
            flash('Username already taken.', 'error')
        else:
            current_user.username = username_form.new_username.data
            db.session.commit()
            flash('Username updated!', 'success')
        return redirect(url_for('user.profile'))

    if (not current_user.keyn_migrated) and password_form.submit.data and password_form.validate_on_submit():
        if check_password_hash(current_user.password_hash, password_form.current_password.data):
            current_user.password_hash = generate_password_hash(password_form.new_password.data)
            db.session.commit()
            flash('Password updated!', 'success')
        else:
            flash('Current password is incorrect.', 'error')
        return redirect(url_for('user.profile'))

    if (not current_user.keyn_migrated) and email_form.submit.data and email_form.validate_on_submit():
        token = generate_email_change_token(current_user, email_form.email.data)
        confirm_url = url_for('user.confirm_email_change', token=token, _external=True)
        
        # Use Nolofication for users with KeyN IDs
        if current_user.keyn_id:
            from app.nolofication import nolofication
            html_msg = f'''
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color: #2196f3;">📧 Confirm Email Change</h2>
                <p>You requested to change your email address for your Vinyl Vote account.</p>
                <p>Click the button below to confirm your new email address:</p>
                <a href="{confirm_url}" 
                   style="display: inline-block; padding: 12px 24px; background: #2196f3; 
                          color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">
                    Confirm Email
                </a>
                <p style="margin-top: 20px; font-size: 14px; color: #666;">
                    If you didn't request this, you can safely ignore this email.
                </p>
            </div>
            '''
            nolofication.send_notification(
                user_id=current_user.keyn_id,
                title='Confirm Email Change',
                message=f'Click the link to confirm your new email: {confirm_url}',
                html_message=html_msg,
                notification_type='info',
                category='security'
            )
        else:
            # Legacy email for non-KeyN users
            send_email(
                subject='Confirm Email Change',
                sender_email=current_app.config['MAIL_DEFAULT_SENDER_EMAIL'],
                sender_name=current_app.config['MAIL_DEFAULT_SENDER_NAME'],
                recipients=[email_form.email.data],
                text_body=f'Click the link to confirm your new email: {confirm_url}',
                html_body=f'<p>Click <a href="{confirm_url}">here</a> to confirm your new email.</p>'
            )
        flash('A confirmation link has been sent to your new email.', 'info')
        return redirect(url_for('user.profile'))

    # Gather previous votes
    album_ids_votes = [a[0] for a in db.session.query(Album.id)
                       .join(Song)
                       .join(Vote, Vote.song_id == Song.id)
                       .filter(Vote.user_id == current_user.id)
                       .distinct()
                       .all()]
    album_ids_scores = [a[0] for a in db.session.query(AlbumScore.album_id)
                        .filter_by(user_id=current_user.id)
                        .distinct()
                        .all()]
    album_ids = set(album_ids_votes + album_ids_scores)
    albums = Album.query.filter(Album.id.in_(album_ids)).order_by(Album.queue_order.desc()).all()

    album_votes = []
    for album in albums:
        song_votes = {v.song.track_number: v.score for v in db.session.query(Vote)
                      .join(Song)
                      .filter(Vote.user_id == current_user.id, Song.album_id == album.id)
                      .all()}
        album_score_obj = AlbumScore.query.filter_by(user_id=current_user.id, album_id=album.id).first()
        # Calculate average song score for this user on this album
        user_song_scores = list(song_votes.values())
        avg_song_score = round(sum(user_song_scores) / len(user_song_scores), 2) if user_song_scores else None
        album_votes.append({
            'album': album,
            'songs': sorted(album.songs, key=lambda s: s.track_number),
            'song_votes': song_votes,
            'album_score': album_score_obj.personal_score if album_score_obj else None,
            'song_score': avg_song_score,
        })
    
    # --- Battle Stats ---
    battle_count = BattleVote.query.filter_by(user_id=current_user.id).count()
    favorite_gladiator = None
    
    if battle_count > 0:
        from sqlalchemy import func, desc
        # Find song ID with most wins by this user
        top_winner_id = db.session.query(BattleVote.winner_id, func.count(BattleVote.winner_id).label('wins')) \
            .filter_by(user_id=current_user.id) \
            .group_by(BattleVote.winner_id) \
            .order_by(desc('wins')) \
            .first()
            
        if top_winner_id:
            fav_song = Song.query.get(top_winner_id[0])
            favorite_gladiator = {
                'song': fav_song,
                'wins': top_winner_id[1]
            }

    # --- Lightweight personal analytics ---
    # Totals and averages'''
    total_albums_scored = db.session.query(func.count(AlbumScore.id)).filter_by(user_id=current_user.id, ignored=False).scalar() or 0
    total_song_votes = db.session.query(func.count(Vote.id)).filter_by(user_id=current_user.id, ignored=False).scalar() or 0
    avg_album_score_user = db.session.query(func.avg(AlbumScore.personal_score)).filter_by(user_id=current_user.id, ignored=False).scalar()
    avg_song_score_user = db.session.query(func.avg(Vote.score)).filter_by(user_id=current_user.id, ignored=False).scalar()

    # Votes per day (last 60 days)
    now_utc = datetime.now(timezone.utc)
    since = now_utc - timedelta(days=60)
    rows = (
        db.session.query(func.date(Vote.timestamp), func.count(Vote.id))
        .filter(Vote.user_id == current_user.id, Vote.ignored == False, Vote.timestamp >= since)
        .group_by(func.date(Vote.timestamp))
        .order_by(func.date(Vote.timestamp))
        .all()
    )
    counts_by_date = {str(d): c for d, c in rows}
    labels = []
    data = []
    for i in range(60, -1, -1):
        day = (now_utc - timedelta(days=i)).date()
        key = str(day)
        labels.append(key)
        data.append(int(counts_by_date.get(key, 0)))

    profile_stats = {
        'total_albums_scored': int(total_albums_scored),
        'total_song_votes': int(total_song_votes),
        'avg_album_score': round(float(avg_album_score_user), 2) if avg_album_score_user is not None else None,
        'avg_song_score': round(float(avg_song_score_user), 2) if avg_song_score_user is not None else None,
    }
    votes_timeseries = { 'labels': labels, 'data': data }

    # --- Weekly streaks (based on album schedule) ---
    # Consider a week "active" if the user cast any non-retroactive song vote or album score for that album's week.
    # We use album queue order as the weekly sequence.
    song_album_ids = [a[0] for a in db.session.query(Song.album_id)
                                        .join(Vote, Vote.song_id == Song.id)
                                        .filter(Vote.user_id == current_user.id, Vote.ignored == False, Vote.retroactive == False)
                                        .distinct()
                                        .all()]
    score_album_ids = [a[0] for a in db.session.query(AlbumScore.album_id)
                                         .filter(AlbumScore.user_id == current_user.id, AlbumScore.ignored == False, AlbumScore.retroactive == False)
                                         .distinct()
                                         .all()]
    # Exclude the current week from streak calculations
    current_album = Album.query.filter_by(is_current=True).first()
    albums_query = Album.query.filter(Album.queue_order > 0)
    if current_album and current_album.queue_order:
        albums_query = albums_query.filter(Album.queue_order < current_album.queue_order)
    albums_ordered = albums_query.order_by(Album.queue_order).all()
    ordered_ids = [a.id for a in albums_ordered]
    participated_all = set(song_album_ids + score_album_ids)
    participated = participated_all.intersection(set(ordered_ids))

    # Current streak: walk from most recent album backwards until a gap
    current_streak = 0
    for aid in reversed(ordered_ids):
        if aid in participated:
            current_streak += 1
        else:
            break

    # Longest streak across history
    longest_streak = 0
    run = 0
    for aid in ordered_ids:
        if aid in participated:
            run += 1
            if run > longest_streak:
                longest_streak = run
        else:
            run = 0

    profile_streaks = { 'current': current_streak, 'longest': longest_streak }

    # Additional profile stats
    active_weeks = len(participated)
    last_song_ts = db.session.query(func.max(Vote.timestamp)) \
        .join(Song, Vote.song_id == Song.id) \
        .filter(Vote.user_id == current_user.id, Vote.ignored == False, Vote.retroactive == False) \
        .scalar()
    last_score_ts = db.session.query(func.max(AlbumScore.timestamp)) \
        .filter(AlbumScore.user_id == current_user.id, AlbumScore.ignored == False, AlbumScore.retroactive == False) \
        .scalar()
    def _aware(dt):
        if not dt:
            return None
        return dt if getattr(dt, 'tzinfo', None) else dt.replace(tzinfo=timezone.utc)
    last_candidates = list(filter(None, [_aware(last_song_ts), _aware(last_score_ts)]))
    if last_candidates:
        last_ts = max(last_candidates)
        days = (now_utc - last_ts).days
        last_vote_label = 'today' if days <= 0 else ('1 d' if days == 1 else f'{days} d')
        last_vote_full = last_ts.strftime('%Y-%m-%d %H:%M UTC')
        last_vote_iso = last_ts.isoformat()
    else:
        last_vote_label = '—'
        last_vote_full = '—'
        last_vote_iso = None
    profile_extras = { 'active_weeks': active_weeks, 'last_on_time_vote': last_vote_label, 'last_on_time_vote_full': last_vote_full, 'last_on_time_vote_iso': last_vote_iso }

    keyn_auth_server_url = current_app.config.get('KEYN_AUTH_SERVER_URL')
    keyn_profile_url = current_app.config.get('KEYN_PROFILE_URL')
    keyn_edit_profile_url = current_app.config.get('KEYN_EDIT_PROFILE_URL')
    keyn_change_password_url = current_app.config.get('KEYN_CHANGE_PASSWORD_URL')
    nolofication_preferences_url = current_app.config.get('NOLOFICATION_PREFERENCES_URL')
    keyn_profile = None
    if current_user.keyn_migrated and current_user.keyn_profile_json:
        import json
        try:
            keyn_profile = json.loads(current_user.keyn_profile_json)
        except Exception:
            keyn_profile = None
    return render_template('profile.html',
                           username_form=username_form,
                           password_form=password_form,
                           email_form=email_form,
                           album_votes=album_votes,
                           keyn_auth_server_url=keyn_auth_server_url,
                           keyn_profile_url=keyn_profile_url,
                           keyn_edit_profile_url=keyn_edit_profile_url,
                           keyn_change_password_url=keyn_change_password_url,
                           nolofication_preferences_url=nolofication_preferences_url,
                           keyn_profile=keyn_profile,
                           profile_stats=profile_stats,
                           votes_timeseries=votes_timeseries,
                           profile_streaks=profile_streaks,
                           profile_extras=profile_extras,
                           battle_stats={'count': battle_count, 'top_pick': favorite_gladiator})


def generate_email_change_token(user, new_email):
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    return serializer.dumps({'username': user.username, 'new_email': new_email}, salt='change-email-salt')


@bp.route('/confirm_email_change/<token>')
def confirm_email_change(token):
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        data = serializer.loads(token, salt='change-email-salt', max_age=3600)
    except Exception:
        flash('The confirmation link is invalid or has expired.', 'error')
        return redirect(url_for('user.index'))

    user = User.query.filter_by(username=data.get('username')).first()
    if not user:
        flash('User not found.', 'error')
        return redirect(url_for('user.index'))

    user.email = data.get('new_email')
    db.session.commit()
    flash('Email updated successfully!', 'success')
    return redirect(url_for('user.profile'))

@bp.route('/next_album_vote', methods=['GET', 'POST'])
@login_required
def next_album_vote():
    current = Album.query.filter_by(is_current=True).first()
    vote_period = VotePeriod.query.first()
    option_count = current_app.config.get('NEXT_ALBUM_OPTION_COUNT', 3)

    albums = []
    if current:
        albums = (
            Album.query
            .filter(Album.queue_order > current.queue_order)
            .order_by(Album.queue_order)
            .limit(option_count)
            .all()
        )

    if request.method == 'POST':
        album_id = request.form.get('album_id', type=int)
        if album_id:
            existing = NextAlbumVote.query.filter_by(user_id=current_user.id, vote_period_id=vote_period.id).first()
            if existing:
                existing.album_id = album_id
            else:
                db.session.add(NextAlbumVote(user_id=current_user.id, album_id=album_id, vote_period_id=vote_period.id))
            db.session.commit()
            flash('Your choice for next week has been recorded.', 'success')
            # After choosing the next album, suggest retro voting (Hub)
            return redirect(url_for('user.retro_hub'))

    selected = None
    if vote_period:
        existing = NextAlbumVote.query.filter_by(user_id=current_user.id, vote_period_id=vote_period.id).first()
        selected = existing.album_id if existing else None

    return render_template('next_album_vote.html', albums=albums, selected=selected)

@bp.route('/share-card/<int:album_id>')
@login_required
def share_vote_card(album_id):
    """Generate and return a shareable vote card for an album."""
    from ..vote_card import generate_vote_card
    from pathlib import Path
    import os
    from glob import glob
    
    # Check if album exists
    album = Album.query.get_or_404(album_id)
    
    # Check if user has voted on this album
    album_score = AlbumScore.query.filter_by(user_id=current_user.id, album_id=album.id).first()
    if not album_score:
        flash("You haven't voted on this album yet.", "error")
        return redirect(url_for('user.album_results', album_id=album_id))
    
    # Rate limiting: Check how many cards user has generated today
    temp_dir = Path(current_app.root_path).parent / 'temp' / 'vote_cards'
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    # Count cards generated by this user today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    user_cards_today = glob(str(temp_dir / f"{current_user.id}_*"))
    user_cards_today = [
        f for f in user_cards_today 
        if os.path.getmtime(f) > today_start.timestamp()
    ]
    
    if len(user_cards_today) >= 10:
        flash("You've reached the daily limit for generating vote cards (10 per day). Try again tomorrow!", "warning")
        return redirect(url_for('user.album_results', album_id=album_id))
    
    # Check total cards in folder (global limit)
    all_cards = glob(str(temp_dir / "*"))
    if len(all_cards) >= 100:
        # Delete oldest cards
        all_cards.sort(key=os.path.getmtime)
        for old_card in all_cards[:20]:  # Delete oldest 20
            try:
                os.remove(old_card)
            except Exception:
                pass
    
    # Limit user to 5 stored cards at once
    user_all_cards = glob(str(temp_dir / f"{current_user.id}_*"))
    if len(user_all_cards) >= 5:
        # Delete oldest user card
        user_all_cards.sort(key=os.path.getmtime)
        try:
            os.remove(user_all_cards[0])
        except Exception:
            pass
    
    # Get user's votes for this album
    votes = Vote.query.filter_by(user_id=current_user.id).join(Song).filter(Song.album_id == album.id).all()
    user_votes = {v.song_id: v.score for v in votes}
    
    # Generate the card
    try:
        card_img = generate_vote_card(album, current_user, user_votes)
        if not card_img:
            flash("Could not generate vote card.", "error")
            return redirect(url_for('user.album_results', album_id=album_id))
        
        # Save to temp folder
        timestamp = int(datetime.now(timezone.utc).timestamp())
        filename = f"{current_user.id}_{album.id}_{timestamp}.png"
        filepath = temp_dir / filename
        
        card_img.save(filepath, 'PNG', optimize=True)
        
        # Return the image file
        from flask import send_file
        return send_file(
            filepath,
            mimetype='image/png',
            as_attachment=True,
            download_name=f"vinylvote_{album.title.replace(' ', '_')}_{current_user.username}.png"
        )
    except Exception as e:
        current_app.logger.error(f"Failed to generate vote card: {e}")
        flash("An error occurred while generating your vote card.", "error")
        return redirect(url_for('user.album_results', album_id=album_id))
