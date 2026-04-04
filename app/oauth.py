import secrets
import requests
from flask import Blueprint, current_app, session, redirect, request, url_for, flash
from flask_login import login_user, current_user
from .models import User, db
from werkzeug.security import generate_password_hash
from datetime import datetime

bp_oauth = Blueprint('oauth', __name__, url_prefix='/oauth')


def _scopes_list():
    scopes = current_app.config.get('KEYN_DEFAULT_SCOPES', 'id,username,email').split(',')
    return [s.strip() for s in scopes if s.strip()]


def _auth_server():
    return current_app.config['KEYN_AUTH_SERVER_URL'].rstrip('/')


@bp_oauth.route('/login')
def oauth_login():
    if current_user.is_authenticated:
        return redirect(url_for('user.index'))
    
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state
    
    # Store mobile/PWA context for better handling
    session['oauth_mobile_context'] = request.headers.get('User-Agent', '').lower()
    
    params = {
        'client_id': current_app.config['KEYN_CLIENT_ID'],
        'redirect_uri': current_app.config['KEYN_CLIENT_REDIRECT'],
        'scope': ','.join(_scopes_list()),
        'state': state
    }
    from urllib.parse import urlencode
    auth_url = f"{_auth_server()}/oauth/authorize?{urlencode(params)}"
    return redirect(auth_url)


@bp_oauth.route('/callback')
def oauth_callback():
    error = request.args.get('error')
    if error:
        flash(f'OAuth error: {error}', 'error')
        return redirect(url_for('user.login'))

    state = request.args.get('state')
    if not state or state != session.get('oauth_state'):
        flash('Invalid OAuth state, please try again.', 'error')
        return redirect(url_for('user.login'))

    code = request.args.get('code')
    if not code:
        flash('Missing authorization code.', 'error')
        return redirect(url_for('user.login'))

    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': current_app.config['KEYN_CLIENT_ID'],
        'client_secret': current_app.config['KEYN_CLIENT_SECRET'],
        'redirect_uri': current_app.config['KEYN_CLIENT_REDIRECT']
    }
    try:
        token_resp = requests.post(f"{_auth_server()}/oauth/token", data=data, timeout=10)
    except requests.RequestException as e:
        current_app.logger.error(f'KeyN token exchange error: {e}')
        flash('Network error during authentication. Please try again.', 'error')
        return redirect(url_for('user.login'))

    if token_resp.status_code != 200:
        current_app.logger.error(f'KeyN token response error: {token_resp.status_code} - {token_resp.text}')
        flash('Authentication failed. Please try again.', 'error')
        return redirect(url_for('user.login'))

    access_token = token_resp.json().get('access_token')
    if not access_token:
        current_app.logger.error('KeyN token response missing access_token')
        flash('Authentication failed. Please try again.', 'error')
        return redirect(url_for('user.login'))

    # Fetch user scoped data
    try:
        user_resp = requests.get(f"{_auth_server()}/api/user-scoped", headers={'Authorization': f'Bearer {access_token}'}, timeout=10)
    except requests.RequestException as e:
        current_app.logger.error(f'KeyN user profile error: {e}')
        flash('Failed to retrieve user profile. Please try again.', 'error')
        return redirect(url_for('user.login'))

    if user_resp.status_code != 200:
        current_app.logger.error(f'KeyN user profile response error: {user_resp.status_code} - {user_resp.text}')
        flash('Failed to retrieve user profile. Please try again.', 'error')
        return redirect(url_for('user.login'))

    data = user_resp.json()
    keyn_id = str(data.get('id')) if data.get('id') is not None else None
    keyn_username = data.get('username') or data.get('display_name') or data.get('email') or f'user_{keyn_id}'

    if not keyn_id:
        current_app.logger.error('KeyN response missing id scope')
        flash('KeyN response missing required information. Please ensure all permissions are granted.', 'error')
        return redirect(url_for('user.login'))

    # Migration / linking logic:
    user = None
    # 1. If a user already has this keyn_id linked
    if keyn_id:
        user = User.query.filter_by(keyn_id=keyn_id).first()

    # 2. If not found, try to match existing account by email (preferred) then username
    import json
    profile_json = json.dumps(data)

    if not user:
        email = data.get('email')
        if email:
            user = User.query.filter_by(email=email).first()
    if not user:
        # fallback on username
        user = User.query.filter_by(username=keyn_username).first()

    created_new = False
    if not user:
        # Create a new local user. password_hash placeholder since legacy code expects non-null.
        # Use a random hash; user will not use local password anymore.
        random_pw = secrets.token_hex(32)
        user = User(
            username=keyn_username[:64],
            email=data.get('email'),
            password_hash=generate_password_hash(random_pw),
            keyn_id=keyn_id,
            keyn_username=keyn_username,
            keyn_migrated=True,
            last_login=datetime.utcnow(),
            keyn_profile_json=profile_json,
        )
        db.session.add(user)
        created_new = True
    else:
        # Link existing
        user.keyn_id = user.keyn_id or keyn_id
        user.keyn_username = keyn_username
        user.keyn_migrated = True
        if not user.email and data.get('email'):
            user.email = data.get('email')
        user.keyn_profile_json = profile_json  # update snapshot each login
        user.last_login = datetime.utcnow()

    db.session.commit()

    # Always remember OAuth users for better mobile persistence
    login_user(user, remember=True)
    session.permanent = True
    
    # Clear OAuth session data
    session.pop('oauth_state', None)
    session.pop('oauth_mobile_context', None)
    
    if created_new:
        flash('Account created via KeyN.', 'success')
    else:
        flash('Successfully logged in with KeyN.', 'success')
    return redirect(url_for('user.index'))


@bp_oauth.route('/logout')
def oauth_logout():
    # Keep local logout logic in existing user.logout route.
    return redirect(url_for('user.logout'))
