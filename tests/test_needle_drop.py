from datetime import datetime, timedelta, timezone

from flask import Flask

from app import db, login_manager
from app.models import (
    Album,
    NeedleDropDailyChallenge,
    NeedleDropAttempt,
    NeedleDropRecognitionStat,
    NeedleDropSession,
    Song,
    SongAudioMatch,
    User,
)
from app.routes import api
from app.services.audio_providers import DeezerAudioProvider
from app.services import needle_drop


def _build_app():
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SECRET_KEY="needle-test",
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


def _login(client, user_id):
    with client.session_transaction() as session:
        session["_user_id"] = str(user_id)
        session["_fresh"] = True


def _seed_catalog():
    user = User(username="needle-user", password_hash="hash")
    db.session.add(user)
    current = Album(title="Current", artist="Now Band", queue_order=3, is_current=True)
    past = Album(title="Past", artist="The Needles", queue_order=1, is_current=False)
    other_past = Album(title="Other Past", artist="The Needles", queue_order=2, is_current=False)
    future = Album(title="Future", artist="Later Band", queue_order=4, is_current=False)
    db.session.add_all([current, past, other_past, future])
    db.session.flush()

    eligible = Song(album_id=past.id, title="Drop One", track_number=1, duration="3:30")
    same_artist = Song(album_id=other_past.id, title="Wrong Needle", track_number=1, duration="2:45")
    future_song = Song(album_id=future.id, title="Future Drop", track_number=1, duration="3:00")
    missing_preview = Song(album_id=past.id, title="Silent Drop", track_number=2, duration="4:00")
    db.session.add_all([eligible, same_artist, future_song, missing_preview])
    db.session.flush()

    db.session.add_all(
        [
            SongAudioMatch(song_id=eligible.id, provider="deezer", provider_track_id="111", match_status="matched", match_confidence=0.95, preview_available=True),
            SongAudioMatch(song_id=same_artist.id, provider="deezer", provider_track_id="222", match_status="matched", match_confidence=0.95, preview_available=True),
            SongAudioMatch(song_id=future_song.id, provider="deezer", provider_track_id="333", match_status="matched", match_confidence=0.95, preview_available=True),
            SongAudioMatch(song_id=missing_preview.id, provider="deezer", provider_track_id="444", match_status="missing_preview", match_confidence=0.95, preview_available=False),
        ]
    )
    db.session.commit()
    return user.id, eligible.id, same_artist.id, future_song.id, missing_preview.id


def test_daily_uses_only_completed_playable_catalog_and_is_stable():
    app = _build_app()
    with app.app_context():
        db.create_all()
        user_id, eligible_id, same_artist_id, future_id, missing_id = _seed_catalog()
        challenge = needle_drop.ensure_daily_challenge(local_date=datetime(2026, 8, 21).date())
        again = needle_drop.ensure_daily_challenge(local_date=datetime(2026, 8, 21).date())

        assert challenge.id == again.id
        assert challenge.song_id in {eligible_id, same_artist_id}
        assert challenge.song_id not in {future_id, missing_id}

        db.drop_all()


def test_daily_attempts_track_artist_recognition_and_correct_result():
    app = _build_app()
    with app.app_context():
        db.create_all()
        user_id, eligible_id, same_artist_id, _, _ = _seed_catalog()
        challenge = NeedleDropDailyChallenge(
            local_date="2026-08-21",
            song_id=eligible_id,
            provider="deezer",
            provider_track_id="111",
            clip_offset_seconds=4.0,
            selection_seed="fixed",
            published_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
        db.session.add(challenge)
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    first = client.post("/api/v1/needle-drop/daily/attempt", json={"guess_type": "song", "song_id": same_artist_id})
    assert first.status_code == 200
    assert first.get_json()["result"] == "artist_recognized"

    second = client.post("/api/v1/needle-drop/daily/attempt", json={"guess_type": "song", "song_id": eligible_id})
    assert second.status_code == 200
    payload = second.get_json()
    assert payload["result"] == "correct"
    assert payload["status"] == "won"
    assert payload["reveal"]["song"]["title"] == "Drop One"

    with app.app_context():
        stat = NeedleDropRecognitionStat.query.filter_by(user_id=user_id, song_id=eligible_id).first()
        assert stat.exact_correct_count == 1
        assert stat.artist_recognition_count == 1
        db.drop_all()


def test_skip_consumes_attempt_without_wrong_guess_or_reveal():
    app = _build_app()
    with app.app_context():
        db.create_all()
        user_id, eligible_id, _, _, _ = _seed_catalog()
        db.session.add(
            NeedleDropDailyChallenge(
                local_date="2026-08-21",
                song_id=eligible_id,
                provider="deezer",
                provider_track_id="111",
                clip_offset_seconds=4.0,
                selection_seed="fixed",
                published_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            )
        )
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)
    response = client.post("/api/v1/needle-drop/daily/attempt", json={"guess_type": "skip"})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["result"] == "skipped"
    assert payload["status"] == "active"
    assert payload["attempts_used"] == 1
    assert payload["next_clip_length"] == 1.5
    assert "reveal" not in payload

    with app.app_context():
        session = NeedleDropSession.query.filter_by(user_id=user_id).first()
        attempt = NeedleDropAttempt.query.filter_by(session_id=session.id).first()
        assert attempt.guess_type == "skip"
        assert attempt.result == "skipped"
        assert attempt.guessed_song_id is None
        db.drop_all()


def test_daily_stats_are_locked_until_expiry():
    app = _build_app()
    with app.app_context():
        db.create_all()
        user_id, eligible_id, _, _, _ = _seed_catalog()
        db.session.add(
            NeedleDropDailyChallenge(
                local_date="2026-08-21",
                song_id=eligible_id,
                provider="deezer",
                provider_track_id="111",
                clip_offset_seconds=0,
                selection_seed="fixed",
                published_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )
        )
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)
    locked = client.get("/api/v1/needle-drop/daily/stats/2026-08-21")
    assert locked.status_code == 403

    with app.app_context():
        challenge = NeedleDropDailyChallenge.query.filter_by(local_date="2026-08-21").first()
        challenge.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.session.commit()

    unlocked = client.get("/api/v1/needle-drop/daily/stats/2026-08-21")
    assert unlocked.status_code == 200
    assert set(unlocked.get_json().keys()) == {"players", "wins", "failures", "win_rate", "by_attempt"}

    with app.app_context():
        db.drop_all()


def test_endless_avoids_previously_correct_songs_when_pool_allows():
    app = _build_app()
    with app.app_context():
        db.create_all()
        user_id, eligible_id, same_artist_id, _, _ = _seed_catalog()
        db.session.add(
            NeedleDropRecognitionStat(
                user_id=user_id,
                song_id=eligible_id,
                exact_correct_count=1,
            )
        )
        db.session.commit()
        session = needle_drop.create_endless_round(user_id)
        assert session.song_id == same_artist_id
        db.drop_all()


def test_autocomplete_returns_database_songs_and_artists_only():
    app = _build_app()
    with app.app_context():
        db.create_all()
        user_id, eligible_id, _, _, _ = _seed_catalog()

    client = app.test_client()
    _login(client, user_id)
    response = client.get("/api/v1/needle-drop/autocomplete?q=Needle")
    assert response.status_code == 200
    labels = [item["label"] for item in response.get_json()["items"]]
    assert any("Drop One" in label for label in labels)
    assert any("The Needles" in label for label in labels)
    assert labels[0] == "The Needles"

    with app.app_context():
        db.drop_all()


def test_deezer_provider_prefers_isrc_and_falls_back_to_search(monkeypatch):
    app = _build_app()
    provider = DeezerAudioProvider()
    calls = []

    def fake_get(path, params=None):
        calls.append((path, params))
        if path.startswith("/track/isrc:"):
            return {
                "id": 123,
                "title": "Drop One",
                "artist": {"name": "The Needles"},
                "album": {"title": "Past"},
                "duration": 210,
                "preview": "https://cdn.example/preview.mp3",
            }
        raise AssertionError("Search should not be called after an ISRC match")

    monkeypatch.setattr(provider, "_get", fake_get)
    with app.app_context():
        result = provider.resolve_track(
            title="Drop One",
            artist="The Needles",
            album="Past",
            duration_seconds=210,
            isrc="USVV10000001",
        )

    assert result.provider_track_id == "123"
    assert result.preview_available is True
    assert calls[0][0] == "/track/isrc:USVV10000001"

    fallback = DeezerAudioProvider()

    def fake_fallback_get(path, params=None):
        if path.startswith("/track/isrc:"):
            raise RuntimeError("No ISRC match")
        assert path == "/search/track"
        return {
            "data": [
                {
                    "id": 456,
                    "title": "Drop One",
                    "artist": {"name": "The Needles"},
                    "album": {"title": "Past"},
                    "duration": 209,
                    "preview": "https://cdn.example/fallback.mp3",
                }
            ]
        }

    monkeypatch.setattr(fallback, "_get", fake_fallback_get)
    with app.app_context():
        fallback_result = fallback.resolve_track(
            title="Drop One",
            artist="The Needles",
            album="Past",
            duration_seconds=210,
            isrc="USVV10000002",
        )

    assert fallback_result.provider_track_id == "456"
    assert fallback_result.match_status == "matched"


def test_deezer_provider_admin_lookup_helpers(monkeypatch):
    app = _build_app()
    provider = DeezerAudioProvider()

    def fake_get(path, params=None):
        if path == "/search/album":
            assert params == {"q": "Taylor Swift folklore", "limit": 8}
            return {
                "data": [
                    {
                        "id": 100,
                        "title": "folklore",
                        "artist": {"name": "Taylor Swift"},
                        "nb_tracks": 16,
                    }
                ]
            }
        if path == "/album/100":
            return {
                "id": 100,
                "title": "folklore",
                "artist": {"name": "Taylor Swift"},
                "tracks": {
                    "data": [
                        {
                            "id": 200,
                            "title": "cardigan",
                            "artist": {"name": "Taylor Swift"},
                            "duration": 239,
                            "preview": "https://cdn.example/cardigan.mp3",
                        }
                    ]
                },
            }
        if path == "/search/track":
            assert params == {"q": "cardigan Taylor Swift", "limit": 10}
            return {
                "data": [
                    {
                        "id": 200,
                        "title": "cardigan",
                        "artist": {"name": "Taylor Swift"},
                        "album": {"title": "folklore"},
                        "duration": 239,
                        "preview": "https://cdn.example/cardigan.mp3",
                    }
                ]
            }
        if path == "/track/200":
            return {
                "id": 200,
                "title": "cardigan",
                "artist": {"name": "Taylor Swift"},
                "album": {"title": "folklore"},
                "duration": 239,
                "preview": "https://cdn.example/cardigan.mp3",
            }
        raise AssertionError(f"Unexpected Deezer path: {path}")

    monkeypatch.setattr(provider, "_get", fake_get)
    with app.app_context():
        albums = provider.search_albums("Taylor Swift folklore")
        album = provider.album_tracks("100")
        tracks = provider.search_tracks("cardigan Taylor Swift", limit=10)
        result = provider.resolve_track_id(
            "200",
            title="cardigan",
            artist="Taylor Swift",
            album="folklore",
            duration_seconds=239,
        )

    assert albums[0]["id"] == 100
    assert album["tracks"][0]["album"]["title"] == "folklore"
    assert tracks[0]["id"] == 200
    assert result.provider_track_id == "200"
    assert result.preview_available is True
