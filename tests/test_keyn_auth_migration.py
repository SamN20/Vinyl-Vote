from pathlib import Path

from flask import Blueprint, Flask

from app import db, login_manager
from app.models import User
from app.oauth import bp_oauth
from app.routes import user as user_routes


def _build_app(force_login=True, force_registration=True, dev_auth_bypass=False):
    templates = Path(__file__).resolve().parents[1] / "app" / "templates"
    app = Flask(__name__, template_folder=str(templates))
    app.config.update(
        TESTING=True,
        SECRET_KEY="test-secret",
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        WTF_CSRF_ENABLED=False,
        FORCE_KEYN_LOGIN=force_login,
        FORCE_KEYN_REGISTRATION=force_registration,
        KEYN_AUTH_SERVER_URL="https://auth-keyn.bynolo.ca",
        KEYN_CLIENT_ID="test-client-id",
        KEYN_CLIENT_SECRET="test-client-secret",
        KEYN_CLIENT_REDIRECT="http://localhost/oauth/callback",
        DEV_AUTH_BYPASS=dev_auth_bypass,
        DEV_AUTH_BYPASS_DEFAULT_USERNAME="dev-user",
    )

    db.init_app(app)
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    app.register_blueprint(user_routes.bp)
    app.register_blueprint(bp_oauth)

    battle_bp = Blueprint("battle", __name__, url_prefix="/battle")

    @battle_bp.route("/")
    def index():
        return "battle"

    @battle_bp.route("/leaderboard")
    def leaderboard():
        return "leaderboard"

    app.register_blueprint(battle_bp)
    return app


def test_login_redirects_to_keyn_by_default():
    app = _build_app(force_login=True)
    client = app.test_client()

    response = client.get("/login")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/oauth/login")


def test_register_redirects_to_keyn_by_default():
    app = _build_app(force_registration=True)
    client = app.test_client()

    response = client.get("/register")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/oauth/login")


def test_legacy_login_route_remains_available():
    app = _build_app(force_login=True)
    client = app.test_client()

    response = client.get("/legacy/login")

    assert response.status_code == 200


def test_keyn_user_reset_request_redirects_to_oauth():
    app = _build_app(force_login=True)
    with app.app_context():
        db.create_all()
        user = User(
            username="keyn-user",
            email="keyn@example.com",
            password_hash="legacy-hash",
            keyn_id="keyn-123",
            keyn_migrated=True,
        )
        db.session.add(user)
        db.session.commit()

    client = app.test_client()
    response = client.post(
        "/reset_password_request",
        data={"username": "keyn-user", "submit": "Request Password Reset"},
    )

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/oauth/login")

    with app.app_context():
        db.drop_all()


def test_keyn_user_reset_token_redirects_to_oauth():
    app = _build_app(force_login=True)
    with app.app_context():
        db.create_all()
        user = User(
            username="keyn-user-token",
            email="keyn2@example.com",
            password_hash="legacy-hash",
            keyn_id="keyn-999",
            keyn_migrated=True,
        )
        db.session.add(user)
        db.session.commit()
        token = user_routes.generate_reset_token(user)

    client = app.test_client()
    response = client.get(f"/reset_password/{token}")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/oauth/login")

    with app.app_context():
        db.drop_all()


def test_oauth_error_redirects_to_legacy_login_when_keyn_forced():
    app = _build_app(force_login=True)
    client = app.test_client()

    response = client.get("/oauth/callback?error=access_denied")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/legacy/login")


def test_dev_login_bypass_disabled_by_default():
    app = _build_app()
    with app.app_context():
        db.create_all()

    client = app.test_client()
    response = client.get("/dev/login")

    assert response.status_code == 404

    with app.app_context():
        db.drop_all()


def test_dev_login_bypass_creates_local_user_and_logs_in():
    app = _build_app(dev_auth_bypass=True)
    with app.app_context():
        db.create_all()

    client = app.test_client()
    response = client.get("/dev/login?username=localdev&next=/")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/")

    with client.session_transaction() as session:
        assert session.get("_user_id") is not None

    with app.app_context():
        user = User.query.filter_by(username="localdev").first()
        assert user is not None
        assert user.keyn_id is None
        db.drop_all()
