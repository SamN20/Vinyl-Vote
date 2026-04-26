from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
import pytz
from .models import Album, VotePeriod, NextAlbumVote
from . import db
from flask import current_app

from app.utils import send_push
from app.models import User, Album, Song, Vote
import json

# Global variable to store app reference
_app = None

def set_app(app):
    global _app
    _app = app

def get_vote_end_time():
    """Return the end of the current voting week (Sun 23:59:59 America/Toronto) as aware dt."""
    eastern = pytz.timezone('America/Toronto')
    now = datetime.now(eastern)
    days_ahead = 6 - now.weekday()  # Sunday = 6
    if days_ahead < 0:
        days_ahead += 7
    end_of_week = now + timedelta(days=days_ahead)
    end_of_week = end_of_week.replace(hour=23, minute=59, second=59, microsecond=0)
    return end_of_week


def _select_next_album(current: Album | None) -> Album | None:
    """Pick the next album by queue_order: the smallest order greater than current, else wrap to smallest > 0."""
    if current and current.queue_order is not None:
        nxt = Album.query.filter(Album.queue_order > 0, Album.queue_order > current.queue_order) \
            .order_by(Album.queue_order.asc()).first()
        if nxt:
            return nxt
    # wrap to smallest scheduled album
    return Album.query.filter(Album.queue_order > 0).order_by(Album.queue_order.asc()).first()

def _ensure_single_current(new_current: Album | None):
    """Ensure exactly one current album is selected."""
    # Clear all current flags
    Album.query.filter_by(is_current=True).update({'is_current': False})
    if new_current:
        new_current.is_current = True
    db.session.commit()

def _update_vote_period_end_time():
    from config import Config
    new_vote_end_iso = Config.get_vote_end_time()
    new_vote_end_dt = datetime.fromisoformat(new_vote_end_iso)
    vp = VotePeriod.query.first()
    if not vp:
        vp = VotePeriod(id=1, end_time=new_vote_end_dt)
        db.session.add(vp)
    else:
        vp.end_time = new_vote_end_dt
    db.session.commit()
    current_app.config['VOTE_END_TIME'] = new_vote_end_iso
    return new_vote_end_iso

def reorder_next_albums_for_period(limit_count: int):
    """Reorder only the next `limit_count` albums AFTER the current album based on NextAlbumVote results
    for the active period. Only the segment of the queue (the next X albums) is reordered; all others remain
    untouched. Within the segment, albums are sorted by vote count desc; ties and non-voted albums retain
    their original relative order within the segment.
    """
    from sqlalchemy.sql import func
    vote_period = VotePeriod.query.first()
    if not vote_period:
        return

    # Current album defines the starting position
    current = Album.query.filter_by(is_current=True).first()
    current_order = current.queue_order if current and current.queue_order else 0
    start_order = current_order + 1

    # Determine the next X albums in the queue
    segment = Album.query \
        .filter(Album.queue_order > 0, Album.queue_order > current_order) \
        .order_by(Album.queue_order.asc()) \
        .limit(limit_count) \
        .all()

    if not segment:
        return

    # Get vote counts for albums in this segment
    segment_ids = [a.id for a in segment]
    vote_counts = dict(
        db.session.query(NextAlbumVote.album_id, func.count(NextAlbumVote.id))
        .filter(NextAlbumVote.vote_period_id == vote_period.id,
                NextAlbumVote.album_id.in_(segment_ids))
        .group_by(NextAlbumVote.album_id)
        .all()
    )

    # Stable sort: by (-votes, original index)
    original_index = {a.id: i for i, a in enumerate(segment)}
    segment_sorted = sorted(
        segment,
        key=lambda a: (
            -(vote_counts.get(a.id, 0)),  # more votes first
            original_index[a.id]          # preserve original order on ties / zero votes
        )
    )

    # Assign new sequential orders only within the segment
    for i, a in enumerate(segment_sorted):
        a.queue_order = start_order + i
    db.session.commit()

    # Clear next-album votes for this period now that they've been applied
    NextAlbumVote.query.filter_by(vote_period_id=vote_period.id).delete()
    db.session.commit()

def compute_weekly_rollover_plan(limit_count: int, force: bool = False):
    """Compute what the weekly rollover would do, without performing changes.
    Returns a dict describing:
      - can_run (bool) and reason if not
      - current album and planned next album title
      - planned segment reordering (list of {id,title,artist,old_order,votes,new_order})
      - new_vote_end_iso
      - notification_scope and estimated recipient_count
    """
    tz = pytz.timezone('America/Toronto')
    now = datetime.now(tz)
    vp = VotePeriod.query.first()
    vote_end = vp.end_time if vp else get_vote_end_time()
    if vote_end.tzinfo is None:
        vote_end = tz.localize(vote_end)
    if not force and now <= vote_end:
        return {
            'can_run': False,
            'reason': 'Voting period has not ended yet.',
            'now': now.isoformat(),
            'vote_end': vote_end.isoformat()
        }

    # Settings
    limit = int(current_app.config.get('NEXT_ALBUM_OPTION_COUNT', 3)) if not limit_count else limit_count
    scope = current_app.config.get('AUTO_SWITCH_NOTIFICATION_SCOPE')
    if scope is None:
        from .models import Setting
        opt = Setting.query.filter_by(key='AUTO_SWITCH_NOTIFICATION_SCOPE').first()
        scope = opt.value if opt else 'all'

    current = Album.query.filter_by(is_current=True).first()
    current_order = (current.queue_order or 0) if current else 0
    start_order = current_order + 1

    # Pull the segment
    segment = Album.query \
        .filter(Album.queue_order > 0, Album.queue_order > current_order) \
        .order_by(Album.queue_order.asc()) \
        .limit(limit) \
        .all()
    segment_ids = [a.id for a in segment]

    # Votes within segment
    from sqlalchemy.sql import func
    vote_counts = dict(
        db.session.query(NextAlbumVote.album_id, func.count(NextAlbumVote.id))
        .filter(NextAlbumVote.vote_period_id == (vp.id if vp else 1),
                NextAlbumVote.album_id.in_(segment_ids))
        .group_by(NextAlbumVote.album_id)
        .all()
    ) if segment_ids else {}

    original_index = {a.id: i for i, a in enumerate(segment)}
    segment_sorted = sorted(
        segment,
        key=lambda a: (-(vote_counts.get(a.id, 0)), original_index[a.id])
    )

    planned = []
    for i, a in enumerate(segment_sorted):
        planned.append({
            'id': a.id,
            'title': a.title,
            'artist': a.artist,
            'cover_url': a.cover_url,
            'old_order': a.queue_order,
            'votes': vote_counts.get(a.id, 0),
            'new_order': start_order + i
        })

    # Determine planned next album after reordering
    planned_next = None
    if planned:
        # the one that gets new_order == start_order
        first = min(planned, key=lambda x: x['new_order'])
        planned_next = first
    else:
        # fallback: use current DB state selection
        nxt = _select_next_album(current)
        if nxt:
            planned_next = {
                'id': nxt.id,
                'title': nxt.title,
                'artist': nxt.artist,
                'cover_url': nxt.cover_url,
                'old_order': nxt.queue_order,
                'votes': None,
                'new_order': nxt.queue_order
            }

    # Estimate recipients
    recipient_count = 0
    if scope != 'none':
        q = User.query.filter(User.push_subscription.isnot(None))
        if scope == 'admin':
            q = q.filter(User.is_admin == True)
        recipient_count = q.count()

    # Next vote end time (preview)
    from config import Config
    new_vote_end_iso = Config.get_vote_end_time()

    return {
        'can_run': True,
        'now': now.isoformat(),
        'vote_end': vote_end.isoformat(),
        'current': {
            'id': current.id if current else None,
            'title': current.title if current else None,
            'artist': current.artist if current else None,
            'cover_url': current.cover_url if current else None,
            'order': current.queue_order if current else None,
        },
        'planned_next': planned_next,
        'segment': planned,
        'limit': limit,
        'notification_scope': scope,
        'estimated_recipients': recipient_count,
        'new_vote_end_iso': new_vote_end_iso,
    }

def weekly_rollover_job(force: bool = False):
    """Runs early Monday (Toronto) or on-demand: apply next-album votes to reorder next N, then switch to next album,
    update vote period end time, and send notifications.

    Returns a short status message for UI consumption when invoked manually.
    """
    with _app.app_context():
        tz = pytz.timezone('America/Toronto')
        now = datetime.now(tz)
        current_app.logger.info(f"Weekly rollover job running at {now.isoformat()}")

        # Only proceed if voting period ended
        vp = VotePeriod.query.first()
        vote_end = vp.end_time if vp else get_vote_end_time()
        if vote_end.tzinfo is None:
            vote_end = tz.localize(vote_end)
        if not force and now <= vote_end:
            msg = "Voting period has not ended yet; skipping rollover."
            current_app.logger.info(msg)
            return msg

        # Reorder next N albums according to votes (from admin setting or default)
        limit_count = int(current_app.config.get('NEXT_ALBUM_OPTION_COUNT', 3))
        try:
            reorder_next_albums_for_period(limit_count)
        except Exception as e:
            current_app.logger.error(f"Reorder failed: {e}")

        # Switch to next album
        current = Album.query.filter_by(is_current=True).first()
        next_album = _select_next_album(current)
        if not next_album:
            current_app.logger.warning("No next album found; leaving current as is.")
        _ensure_single_current(next_album if next_album else current)

        # Update vote period end time for the new week
        new_vote_end_iso = _update_vote_period_end_time()

        # Notify users only after the switch is complete and new period is set
        if next_album:
            current_app.logger.info(f"Switched to: {next_album.title}")
            try:
                scope = current_app.config.get('AUTO_SWITCH_NOTIFICATION_SCOPE')
                if scope is None:
                    # pull from Setting if not in config
                    from .models import Setting
                    opt = Setting.query.filter_by(key='AUTO_SWITCH_NOTIFICATION_SCOPE').first()
                    scope = opt.value if opt else 'all'
                    current_app.config['AUTO_SWITCH_NOTIFICATION_SCOPE'] = scope

                if scope != 'none':
                    # Get users to notify based on scope
                    user_query = User.query
                    if scope == 'admin':
                        user_query = user_query.filter(User.is_admin == True)
                    
                    # Send via Nolofication to all users with KeyN IDs
                    from app.nolofication import nolofication
                    users = user_query.filter(User.keyn_id.isnot(None)).all()
                    
                    if users:
                        keyn_ids = [u.keyn_id for u in users]
                        
                        site_url = current_app.config.get('PUBLIC_SITE_URL', 'https://vinylvote.bynolo.ca').rstrip('/')

                        # Create HTML message
                        html_msg = f"""
                        <div style="font-family: Arial, sans-serif; max-width: 600px;">
                            <h2 style="color: #00c853;">🎶 New Album of the Week!</h2>
                            <p><strong>{next_album.title}</strong> by <strong>{next_album.artist}</strong> is now live!</p>
                            <p>Head over to Vinyl Vote and start rating tracks.</p>
                            <a href="{site_url}/vote"
                               style="display: inline-block; padding: 12px 24px; background: #00c853; 
                                      color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">
                                Vote Now
                            </a>
                        </div>
                        """
                        
                        nolofication.send_bulk_notification(
                            user_ids=keyn_ids,
                            title="🎶 New Album of the Week!",
                            message=f"{next_album.title} by {next_album.artist} is now live!",
                            html_message=html_msg,
                            notification_type='success',
                            category='album_updates',
                            metadata={
                                'album_id': next_album.id,
                                'album_title': next_album.title,
                                'artist': next_album.artist,
                                'action_url': '/vote'
                            }
                        )
                        current_app.logger.info(f"Sent album update notification to {len(keyn_ids)} users via Nolofication")
                    
                    # Also send legacy web push for users without KeyN migration
                    legacy_users = user_query.filter(
                        User.push_subscription.isnot(None),
                        User.keyn_id.is_(None)
                    ).all()
                    
                    for user in legacy_users:
                        try:
                            subs = json.loads(user.push_subscription)
                        except Exception:
                            subs = []
                        for sub in subs:
                            try:
                                send_push(
                                    subscription_info=json.dumps(sub),
                                    title="🎶 New Album of the Week!",
                                    body=f"{next_album.title} by {next_album.artist} is now live!",
                                    url="/vote"
                                )
                            except Exception as e:
                                current_app.logger.info(f"Push send failed for legacy user {user.id}: {e}")
                    
            except Exception as e:
                current_app.logger.error(f"Notification loop error: {e}")
        current_app.logger.info(f"📅 New vote end time: {new_vote_end_iso}")
        if next_album:
            return f"Rolled over to: {next_album.title} — next vote end: {new_vote_end_iso}"
        else:
            return "No next album found; kept current. Vote end time updated."

def apply_next_album_votes():
    """Legacy: kept for admin manual trigger. Now delegates to reorder_next_albums_for_period using configured limit.
    This function no longer sends notifications or switches albums.
    """
    with _app.app_context():
        limit_count = int(current_app.config.get('NEXT_ALBUM_OPTION_COUNT', 3))
        reorder_next_albums_for_period(limit_count)

def remind_unvoted_users():
    """Send vote reminders on Thursday, Saturday, and Sunday via Nolofication to users who haven't voted on current album."""
    with _app.app_context():
        # Only send reminders on Thursday (3), Saturday (5), and Sunday (6)
        tz = pytz.timezone('America/Toronto')
        now = datetime.now(tz)
        current_weekday = now.weekday()
        
        if current_weekday not in [3, 5, 6]:  # Thursday=3, Saturday=5, Sunday=6
            current_app.logger.info(f"Skipping vote reminders - not a reminder day (current: {now.strftime('%A')})")
            return
        
        current_album = Album.query.filter_by(is_current=True).first()
        if not current_album:
            return

        # Get users who have already voted on this album
        voted_user_ids = db.session.query(Vote.user_id)\
            .join(Song).filter(Song.album_id == current_album.id).distinct().all()
        voted_user_ids = {uid for (uid,) in voted_user_ids}

        # Get users who haven't voted and have KeyN IDs
        users_to_remind = User.query.filter(
            User.keyn_id.isnot(None),
            ~User.id.in_(voted_user_ids)
        ).all()

        if users_to_remind:
            from app.nolofication import nolofication
            keyn_ids = [u.keyn_id for u in users_to_remind]
            
            # Get vote end time for message
            from .models import VotePeriod
            vote_period = VotePeriod.query.first()
            vote_end_str = vote_period.end_time.strftime('%A, %B %d') if vote_period else 'this week'
            
            site_url = current_app.config.get('PUBLIC_SITE_URL', 'https://vinylvote.bynolo.ca').rstrip('/')

            # Create HTML reminder
            html_msg = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color: #ff9800;">🕒 Vote Reminder</h2>
                <p>Don't forget to rate this week's album:</p>
                <p><strong>{current_album.title}</strong> by <strong>{current_album.artist}</strong></p>
                <p>Voting ends on <strong>{vote_end_str}</strong>.</p>
                <a href="{site_url}/vote"
                   style="display: inline-block; padding: 12px 24px; background: #ff9800; 
                          color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">
                    Vote Now
                </a>
            </div>
            """
            
            nolofication.send_bulk_notification(
                user_ids=keyn_ids,
                title="🕒 Vote Reminder",
                message=f"Don't forget to rate this week's album: {current_album.title}!",
                html_message=html_msg,
                notification_type='info',
                category='vote_reminders',
                metadata={
                    'album_id': current_album.id,
                    'album_title': current_album.title,
                    'action_url': '/vote'
                }
            )
            current_app.logger.info(f"🔔 Sent vote reminders to {len(keyn_ids)} user(s) via Nolofication.")
        
        # Also send legacy web push for users without KeyN migration
        legacy_users_to_remind = User.query.filter(
            User.push_subscription.isnot(None),
            User.keyn_id.is_(None),
            ~User.id.in_(voted_user_ids)
        ).all()

        for user in legacy_users_to_remind:
            try:
                subs = json.loads(user.push_subscription)
            except Exception:
                subs = []
            for sub in subs:
                send_push(
                    subscription_info=json.dumps(sub),
                    title="🕒 Vote Reminder",
                    body=f"Don't forget to rate this week's album: {current_album.title}!",
                    url="/vote"
                )
        
        if legacy_users_to_remind:
            current_app.logger.info(f"🔔 Sent legacy push reminders to {len(legacy_users_to_remind)} user(s).")

from pywebpush import WebPushException
from sqlalchemy.sql import func

def clean_invalid_subscriptions(user):
    """Clean invalid push subscriptions for a user."""
    current_app.logger.info(f"Cleaning invalid subscriptions for user {user.username}")

    valid_subscriptions = []
    seen_endpoints = set()
    if not user.push_subscription:
        return

    try:
        subscriptions = json.loads(user.push_subscription)
    except Exception:
        subscriptions = []

    for subscription in subscriptions:
        endpoint = subscription.get("endpoint")
        if endpoint in seen_endpoints:
            continue  # skip duplicates
        try:
            send_push(
                subscription_info=json.dumps(subscription),
                title="",
                body="",
                url="/"
            )
        except WebPushException as e:
            current_app.logger.info(f"Removing invalid subscription for user {user.username}: {str(e)}")
            continue  # skip adding this subscription
        valid_subscriptions.append(subscription)
        seen_endpoints.add(endpoint)

    # Always update, even if valid_subscriptions is empty
    user.push_subscription = json.dumps(valid_subscriptions) if valid_subscriptions else None
    db.session.add(user)
    db.session.commit()

# Clean all invalid subscriptions helper remains available but is not scheduled by default
def clean_all_invalid_subscriptions():
    return

def cleanup_vote_cards_job():
    """Clean up vote card images older than 24 hours. Runs every 6 hours."""
    with _app.app_context():
        from pathlib import Path
        import os
        from glob import glob
        from datetime import datetime, timezone, timedelta
        
        try:
            temp_dir = Path(current_app.root_path).parent / 'temp' / 'vote_cards'
            
            # Create directory if it doesn't exist
            if not temp_dir.exists():
                return
            
            # Get all card files
            all_cards = glob(str(temp_dir / "*.png"))
            
            # Calculate cutoff time (24 hours ago)
            cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            cutoff_timestamp = cutoff.timestamp()
            
            deleted_count = 0
            for card_path in all_cards:
                try:
                    # Check if file is older than 24 hours
                    if os.path.getmtime(card_path) < cutoff_timestamp:
                        os.remove(card_path)
                        deleted_count += 1
                except Exception as e:
                    current_app.logger.warning(f"Failed to delete vote card {card_path}: {e}")
            
            if deleted_count > 0:
                current_app.logger.info(f"Cleaned up {deleted_count} expired vote card(s)")
        except Exception as e:
            current_app.logger.error(f"Vote card cleanup job failed: {e}")

# Initialize scheduler with explicit timezone to align with Toronto time
scheduler = BackgroundScheduler(timezone=pytz.timezone('America/Toronto'))
scheduler_app = None  # will be set by __init__.py
