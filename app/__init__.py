from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from config import Config
from flask import render_template
from datetime import datetime
from flask_mail import Mail
from flask_migrate import Migrate
import fcntl
import os

db = SQLAlchemy()
login_manager = LoginManager()
mail = Mail() 
migrate = Migrate()

from . import models

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Cache-busting for static assets: bump version each app start
    try:
        # Prefer env override, else timestamp
        from datetime import datetime
        app.config['ASSET_VERSION'] = os.environ.get('ASSET_VERSION') or datetime.utcnow().strftime('%Y%m%d%H%M%S')
    except Exception:
        app.config['ASSET_VERSION'] = '1'

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    mail.init_app(app)

    # Configure Flask-Login for better mobile persistence
    login_manager.login_view = 'user.login'
    login_manager.login_message = 'Please log in to access this page.'
    login_manager.login_message_category = 'info'
    login_manager.session_protection = 'basic'  # Less strict for mobile web apps
    login_manager.remember_cookie_name = 'remember_token'
    login_manager.remember_cookie_duration = app.config['REMEMBER_COOKIE_DURATION']

    from .models import User, VotePeriod, Setting

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    with app.app_context():
        try:
            vote_period = VotePeriod.query.first()
            # Initialize a vote period if table exists but is empty
            if not vote_period:
                vote_end_iso = Config.get_vote_end_time()
                vote_end_dt = datetime.fromisoformat(vote_end_iso)
                vote_period = VotePeriod(id=1, end_time=vote_end_dt)
                db.session.add(vote_period)
                db.session.commit()
        except Exception:
            # Tables don't exist yet, skip vote period initialization
            vote_period = None
            
        if vote_period:
            app.config['VOTE_END_TIME'] = vote_period.end_time.isoformat()
        else:
            # Fallback to config method when tables don't exist
            app.config['VOTE_END_TIME'] = Config.get_vote_end_time()

        try:
            setting = Setting.query.filter_by(key='NEXT_ALBUM_OPTION_COUNT').first()
            if setting:
                app.config['NEXT_ALBUM_OPTION_COUNT'] = int(setting.value)
            else:
                app.config['NEXT_ALBUM_OPTION_COUNT'] = Config.NEXT_ALBUM_OPTION_COUNT
        except Exception:
            app.config['NEXT_ALBUM_OPTION_COUNT'] = Config.NEXT_ALBUM_OPTION_COUNT

    from .routes import user, admin, api, comments, battle
    app.register_blueprint(user.bp)
    app.register_blueprint(admin.bp)
    app.register_blueprint(api.bp)
    app.register_blueprint(api.bp_v1)
    app.register_blueprint(comments.bp)
    app.register_blueprint(battle.bp)
    # OAuth blueprint for KeyN integration
    from .oauth import bp_oauth
    app.register_blueprint(bp_oauth)

    if app.config.get('ENABLE_SCHEDULER', True):
        from .scheduler import scheduler, set_app, weekly_rollover_job, remind_unvoted_users, cleanup_vote_cards_job
        set_app(app)

        # Start APScheduler with DB jobstore, timezone and a single-process lock to prevent duplicates
        lock_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scheduler.lock')
        lock_file_path = os.path.abspath(lock_file_path)
        # Keep a reference on the app object to avoid GC releasing the lock
        app._SCHEDULER_LOCK_HANDLE = None  # type: ignore[attr-defined]
        try:
            # Create/open the lock file and try to acquire an exclusive non-blocking lock
            app._SCHEDULER_LOCK_HANDLE = open(lock_file_path, 'w')  # type: ignore[attr-defined]
            fcntl.flock(app._SCHEDULER_LOCK_HANDLE, fcntl.LOCK_EX | fcntl.LOCK_NB)  # type: ignore[arg-type]

            try:
                # Ensure jobstore exists before adding jobs
                scheduler.add_jobstore('sqlalchemy', url=app.config['SQLALCHEMY_DATABASE_URI'], alias='default')

                # Single weekly rollover job: Monday 00:01 Toronto time
                scheduler.add_job(
                    weekly_rollover_job,
                    trigger='cron',
                    day_of_week='mon', hour=0, minute=1,
                    id='weekly-rollover',
                    replace_existing=True,
                    max_instances=1,
                    coalesce=True,
                )

                # Daily vote reminders check (logic inside function handles Thu/Sat/Sun check)
                # Run at 8:00 AM Toronto time so Nolofication can queue it for user's preferred time (default 18:00)
                scheduler.add_job(
                    remind_unvoted_users,
                    trigger='cron',
                    hour=8, minute=0,
                    id='vote-reminders',
                    replace_existing=True,
                    max_instances=1,
                    coalesce=True,
                )

                # Vote card cleanup: run every 6 hours to delete cards older than 24 hours
                scheduler.add_job(
                    cleanup_vote_cards_job,
                    trigger='cron',
                    hour='*/6',  # Every 6 hours
                    id='vote-card-cleanup',
                    replace_existing=True,
                    max_instances=1,
                    coalesce=True,
                )

                scheduler.start()
                app.logger.info("✅ Scheduler started (with lock and DB jobstore).")
            except Exception as e:
                app.logger.error(f"Failed to start scheduler: {e}")
        except BlockingIOError:
            # Another process holds the lock; do not start another scheduler instance
            app.logger.info("⏭️ Scheduler not started in this process (lock held by another instance).")
        except Exception as e:
            app.logger.error(f"Scheduler lock/setup error: {e}")
    else:
        app.logger.info("Scheduler disabled by ENABLE_SCHEDULER configuration.")

    from .models import Notification

    @app.context_processor
    def inject_notifications():
        now = datetime.utcnow()
        active = Notification.query.filter(
            Notification.is_active == True,
            Notification.start_time <= now,
            Notification.end_time >= now
        ).all()
        return dict(notifications=active)

    @app.context_processor
    def inject_vote_end():
        from .models import VotePeriod
        vote_period = VotePeriod.query.first()
        vote_end = vote_period.end_time.isoformat() if vote_period else None
        return dict(vote_end=vote_end)

    @app.context_processor
    def inject_update_email_form():
        from flask_login import current_user
        from .forms import UpdateEmailForm
        if current_user.is_authenticated and not current_user.email:
            return dict(update_email_form=UpdateEmailForm())
        return dict(update_email_form=None)

    @app.context_processor
    def inject_next_album_option_count():
        return dict(NEXT_ALBUM_OPTION_COUNT=app.config.get('NEXT_ALBUM_OPTION_COUNT'))

    @app.context_processor
    def inject_now():
        return {'current_year': datetime.utcnow().year}

    @app.context_processor
    def inject_asset_version():
        # Expose asset version for cache-busting in templates
        return {'asset_version': app.config.get('ASSET_VERSION', '1')}

    @app.get('/health')
    def health_check():
        return jsonify({'status': 'ok'}), 200

    @app.errorhandler(401)
    def unauthorized(e):
        return render_template('errors/401.html'), 401

    @app.errorhandler(403)
    def forbidden(e):
        return render_template('errors/403.html'), 403
    
    @app.errorhandler(404)
    def not_found(e):
        return render_template('errors/404.html'), 404
    
    @app.errorhandler(500)
    def internal_server_error(e):
        return render_template('errors/500.html'), 500

    # Remove explicit Document Picture-in-Picture policy to avoid console warnings
    # in browsers that don't recognize the token (e.g., Opera). Modern Chromium
    # allows document PiP by default for same-origin, so no header is required.

    return app

