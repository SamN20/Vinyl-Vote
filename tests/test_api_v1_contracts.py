from datetime import datetime, timedelta, timezone

from flask import Flask

from app import db, login_manager
from app.models import Album, Song, User, VotePeriod
from app.routes import api


def _build_app():
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SECRET_KEY="test-secret",
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        VINYL_VOTE_API_ALLOWED_ORIGINS=["http://localhost:3000"],
    )

    db.init_app(app)
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    app.register_blueprint(api.bp)
    app.register_blueprint(api.bp_v1)

    return app


def _seed_authenticated_user_and_album(app):
    with app.app_context():
        user = User(username="tester", password_hash="hash")
        db.session.add(user)
        db.session.flush()

        album = Album(
            title="Test Album",
            artist="Test Artist",
            is_current=True,
            queue_order=10,
        )
        db.session.add(album)
        db.session.flush()

        db.session.add_all(
            [
                Song(album_id=album.id, title="Track A", track_number=1),
                Song(album_id=album.id, title="Track B", track_number=2),
            ]
        )

        db.session.add(
            VotePeriod(
                id=1,
                end_time=datetime.now(timezone.utc) + timedelta(days=1),
            )
        )
        db.session.commit()
        return user.id


def _login(client, user_id):
    with client.session_transaction() as session:
        session["_user_id"] = str(user_id)
        session["_fresh"] = True


def test_session_check_anonymous_contract_matches_v1():
    app = _build_app()
    with app.app_context():
        db.create_all()

    client = app.test_client()

    legacy = client.get("/api/session-check")
    v1 = client.get("/api/v1/session-check")

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert legacy.get_json() == {"authenticated": False}
    assert v1.get_json() == legacy.get_json()

    with app.app_context():
        db.drop_all()


def test_current_album_contract_matches_v1_for_authenticated_user():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)
    client = app.test_client()
    _login(client, user_id)

    legacy = client.get("/api/current-album")
    v1 = client.get("/api/v1/current-album")

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert v1.get_json() == legacy.get_json()
    assert set(v1.get_json().keys()) == {"album", "vote_end", "user"}

    with app.app_context():
        db.drop_all()


def test_votes_validation_error_contract_matches_v1():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)
    client = app.test_client()
    _login(client, user_id)

    payload = {"song_scores": []}
    legacy = client.post("/api/votes", json=payload)
    v1 = client.post("/api/v1/votes", json=payload)

    assert legacy.status_code == 400
    assert v1.status_code == 400
    assert v1.get_json() == legacy.get_json()

    with app.app_context():
        db.drop_all()


def test_retro_recommendations_contract_matches_v1():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        past = Album(
            title="Past Album",
            artist="Past Artist",
            is_current=False,
            queue_order=5,
        )
        db.session.add(past)
        db.session.flush()
        db.session.add(Song(album_id=past.id, title="Past Track", track_number=1))
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    legacy = client.get("/api/retro-recommendations")
    v1 = client.get("/api/v1/retro-recommendations")

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert v1.get_json() == legacy.get_json()
    assert "albums" in v1.get_json()

    with app.app_context():
        db.drop_all()


def test_v1_session_check_allows_configured_cors_origin():
    app = _build_app()
    with app.app_context():
        db.create_all()

    client = app.test_client()
    response = client.get(
        "/api/v1/session-check",
        headers={"Origin": "http://localhost:3000"},
    )

    assert response.status_code == 200
    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"
    assert response.headers.get("Access-Control-Allow-Credentials") == "true"

    preflight = client.options(
        "/api/v1/session-check",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )

    assert preflight.status_code == 204
    assert preflight.headers.get("Access-Control-Allow-Methods") == "GET"

    with app.app_context():
        db.drop_all()
