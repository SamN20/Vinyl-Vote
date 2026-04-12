import os

from dotenv import load_dotenv
load_dotenv()

from datetime import datetime, timedelta
import pytz

basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SQLALCHEMY_DATABASE_URI = os.environ.get('SQLALCHEMY_DATABASE_URI') or 'sqlite:///' + os.path.join(basedir, 'album_vote.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Session configuration for better mobile persistence
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)  # 30 days for remember me
    REMEMBER_COOKIE_DURATION = timedelta(days=30)    # 30 days for remember me
    REMEMBER_COOKIE_SECURE = os.environ.get('REMEMBER_COOKIE_SECURE', 'False').lower() == 'true'
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = 'Lax'  # Better for mobile web apps
    SESSION_COOKIE_SAMESITE = 'Lax'   # Better for mobile web apps
    ENABLE_SCHEDULER = os.getenv('ENABLE_SCHEDULER', 'True').lower() == 'true'

    SPOTIPY_CLIENT_ID = os.getenv('SPOTIPY_CLIENT_ID')
    SPOTIPY_CLIENT_SECRET = os.getenv('SPOTIPY_CLIENT_SECRET')
    
    VAPID_PUBLIC_KEY = os.getenv('VAPID_PUBLIC_KEY')
    VAPID_PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY')

    VOTE_ACTIVE = os.getenv('VOTE_ACTIVE', 'True').lower() == 'true' # Default to True
    NEXT_ALBUM_OPTION_COUNT = int(os.getenv('NEXT_ALBUM_OPTION_COUNT', 3))

    # Email settings
    MAIL_SERVER = os.getenv('MAIL_SERVER', 'smtp.example.com')
    MAIL_PORT = os.getenv('MAIL_PORT', 587)
    MAIL_USE_TLS = os.getenv('MAIL_USE_TLS', 'True').lower() == 'true'
    MAIL_USE_SSL = os.getenv('MAIL_USE_SSL', 'False').lower() == 'true'
    MAIL_USERNAME = os.getenv('MAIL_USERNAME')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER_EMAIL = os.getenv('MAIL_DEFAULT_SENDER_EMAIL', 'noreply@example.com')
    MAIL_DEFAULT_SENDER_NAME = os.getenv('MAIL_DEFAULT_SENDER_NAME', 'Album Vote')

    VINYL_VOTE_API_ALLOWED_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            'VINYL_VOTE_API_ALLOWED_ORIGINS',
            'http://127.0.0.1:5000,http://localhost:5000'
        ).split(',')
        if origin.strip()
    ]

    # --- KeyN OAuth settings ---
    KEYN_AUTH_SERVER_URL = os.getenv('KEYN_AUTH_SERVER_URL', 'https://auth-keyn.bynolo.ca')
    KEYN_CLIENT_ID = os.getenv('KEYN_CLIENT_ID')
    KEYN_CLIENT_SECRET = os.getenv('KEYN_CLIENT_SECRET')
    KEYN_CLIENT_REDIRECT = os.getenv('KEYN_CLIENT_REDIRECT')  # full URL to /oauth/callback on this site
    # Comma separated default scopes to request
    KEYN_DEFAULT_SCOPES = os.getenv('KEYN_DEFAULT_SCOPES', 'id,username,email,display_name,is_verified')
    # If True, /register will redirect immediately to KeyN OAuth
    FORCE_KEYN_REGISTRATION = os.environ.get('FORCE_KEYN_REGISTRATION', 'false').lower() in ('1','true','yes')
    # If True, /login will redirect immediately to KeyN OAuth (phase out legacy login)
    FORCE_KEYN_LOGIN = os.environ.get('FORCE_KEYN_LOGIN', 'false').lower() in ('1','true','yes')

    # --- Nolofication settings ---
    NOLOFICATION_URL = os.getenv('NOLOFICATION_URL', 'https://nolofication.bynolo.ca')
    NOLOFICATION_SITE_ID = os.getenv('NOLOFICATION_SITE_ID', 'vinylvote')
    NOLOFICATION_API_KEY = os.getenv('NOLOFICATION_API_KEY')

    @staticmethod
    def get_vote_end_time():
        """ Calculate the end time for voting. """
        # Find the next Sunday at 11:59 PM Eastern
        eastern = pytz.timezone('America/Toronto')
        now = datetime.now(eastern)

        days_ahead = 6 - now.weekday()  # Sunday = 6
        if days_ahead < 0:
            days_ahead += 7

        end_of_week = now + timedelta(days=days_ahead)
        end_of_week = end_of_week.replace(hour=23, minute=59, second=59, microsecond=0)

        return end_of_week.isoformat()

    # VOTE_END_TIME = get_vote_end_time.__func__()