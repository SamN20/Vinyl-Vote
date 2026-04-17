from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from flask import Flask

from app import db, login_manager
from app.models import Album, AlbumScore, BattleVote, Setting, Song, SongRequest, User, Vote, VotePeriod
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


def test_home_contract_matches_v1_and_includes_expected_sections():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        current_album = Album.query.filter_by(is_current=True).first()
        current_song = Song.query.filter_by(album_id=current_album.id).first()

        past_album = Album(
            title="Past Favorite",
            artist="Favorite Artist",
            is_current=False,
            queue_order=9,
        )
        db.session.add(past_album)
        db.session.flush()
        past_song = Song(album_id=past_album.id, title="Past Track", track_number=1)
        db.session.add(past_song)
        db.session.flush()

        db.session.add_all(
            [
                Vote(user_id=user_id, song_id=current_song.id, score=4.0, ignored=False),
                Vote(user_id=user_id, song_id=past_song.id, score=5.0, ignored=False),
                AlbumScore(user_id=user_id, album_id=current_album.id, personal_score=4.5, ignored=False),
                AlbumScore(user_id=user_id, album_id=past_album.id, personal_score=5.0, ignored=False),
            ]
        )

        vote_period = VotePeriod.query.first()
        vote_period.end_time = datetime.now(timezone.utc) - timedelta(hours=1)
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    legacy = client.get("/api/home")
    v1 = client.get("/api/v1/home")

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert v1.get_json() == legacy.get_json()

    payload = v1.get_json()
    assert set(payload.keys()) == {"current_album", "top_albums", "recent_history", "user"}
    assert payload["current_album"] is not None
    assert payload["current_album"]["stats_locked"] is False
    assert payload["current_album"]["voter_count"] == 1
    assert payload["user"]["is_authenticated"] is True
    assert payload["user"]["streak"] == 1

    with app.app_context():
        db.drop_all()


def test_home_anonymous_and_home_seo_contract_matches_v1():
    app = _build_app()
    with app.app_context():
        db.create_all()

    _seed_authenticated_user_and_album(app)
    client = app.test_client()

    home_legacy = client.get("/api/home")
    home_v1 = client.get("/api/v1/home")

    assert home_legacy.status_code == 200
    assert home_v1.status_code == 200
    assert home_v1.get_json() == home_legacy.get_json()
    assert home_v1.get_json()["user"]["is_authenticated"] is False
    assert home_v1.get_json()["user"]["streak"] is None
    assert home_v1.get_json()["current_album"]["stats_locked"] is True
    assert home_v1.get_json()["current_album"]["voter_count"] is None
    assert home_v1.get_json()["current_album"]["avg_song_score"] is None
    assert home_v1.get_json()["current_album"]["avg_album_score"] is None

    seo_legacy = client.get("/api/home-seo")
    seo_v1 = client.get("/api/v1/home-seo")

    assert seo_legacy.status_code == 200
    assert seo_v1.status_code == 200
    assert seo_v1.get_json() == seo_legacy.get_json()

    seo_payload = seo_v1.get_json()
    assert set(seo_payload.keys()) == {
        "title",
        "description",
        "canonical_url",
        "robots",
        "open_graph",
        "twitter",
        "schema",
    }
    assert seo_payload["title"]
    assert seo_payload["description"]
    assert seo_payload["canonical_url"].endswith("/")
    assert seo_payload["open_graph"]["title"] == seo_payload["title"]
    assert seo_payload["twitter"]["title"] == seo_payload["title"]

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


def test_results_contract_matches_v1_for_latest_and_album_routes():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        current_album = Album.query.filter_by(is_current=True).first()
        current_album.is_current = False

        previous = Album(
            title="Previous Album",
            artist="Previous Artist",
            is_current=False,
            queue_order=9,
        )
        db.session.add(previous)
        db.session.flush()

        song_a = Song(album_id=previous.id, title="Old Track A", track_number=1)
        song_b = Song(album_id=previous.id, title="Old Track B", track_number=2)
        db.session.add_all([song_a, song_b])
        db.session.flush()

        current_album.queue_order = 10
        current_album.is_current = True

        db.session.add_all(
            [
                Vote(user_id=user_id, song_id=song_a.id, score=4),
                Vote(user_id=user_id, song_id=song_b.id, score=5),
                AlbumScore(user_id=user_id, album_id=previous.id, personal_score=4.5),
            ]
        )
        db.session.commit()

        previous_id = previous.id

    client = app.test_client()
    _login(client, user_id)

    legacy_latest = client.get("/api/results/latest")
    v1_latest = client.get("/api/v1/results/latest")

    assert legacy_latest.status_code == 200
    assert v1_latest.status_code == 200
    assert v1_latest.get_json() == legacy_latest.get_json()
    assert set(v1_latest.get_json().keys()) == {"album", "summary", "songs"}

    legacy_album = client.get(f"/api/results/album/{previous_id}")
    v1_album = client.get(f"/api/v1/results/album/{previous_id}")

    assert legacy_album.status_code == 200
    assert v1_album.status_code == 200
    assert v1_album.get_json() == legacy_album.get_json()

    with app.app_context():
        db.drop_all()


def test_results_exclude_ignored_votes_and_scores_from_summary():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        current_album = Album.query.filter_by(is_current=True).first()
        songs = Song.query.filter_by(album_id=current_album.id).order_by(Song.track_number.asc()).all()
        song_a, song_b = songs[0], songs[1]
        song_b_id = song_b.id

        db.session.add_all(
            [
                Vote(user_id=user_id, song_id=song_a.id, score=5, ignored=False),
                Vote(user_id=user_id, song_id=song_b.id, score=1, ignored=True),
                AlbumScore(user_id=user_id, album_id=current_album.id, personal_score=4.0, ignored=False),
                AlbumScore(user_id=user_id, album_id=current_album.id, personal_score=1.0, ignored=True),
            ]
        )
        db.session.commit()

        target_album_id = current_album.id

    client = app.test_client()
    _login(client, user_id)

    response = client.get(f"/api/v1/results/album/{target_album_id}")
    assert response.status_code == 200

    payload = response.get_json()
    assert payload["summary"]["counted_votes"] == 1
    assert payload["summary"]["ignored_votes"] == 1
    assert payload["summary"]["avg_song_score"] == 5.0
    assert payload["summary"]["avg_album_score"] == 4.0

    song_b_row = next(row for row in payload["songs"] if row["id"] == song_b_id)
    assert song_b_row["user_score"] is None
    assert song_b_row["vote_count"] == 0

    with app.app_context():
        db.drop_all()


def test_leaderboard_artists_contract_matches_v1():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        current_album = Album.query.filter_by(is_current=True).first()
        past_album = Album(title="Past", artist="Legacy Artist", is_current=False, queue_order=7)
        db.session.add(past_album)
        db.session.flush()

        past_song = Song(album_id=past_album.id, title="Past Song", track_number=1)
        db.session.add(past_song)
        db.session.flush()

        db.session.add(Vote(user_id=user_id, song_id=past_song.id, score=4.0, ignored=False))
        db.session.add(Setting(key="artist_image:Legacy Artist", value="https://example.com/image.png"))
        current_album.queue_order = 10
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    legacy = client.get("/api/leaderboard/artists?page=1&per_page=25&q=Legacy")
    v1 = client.get("/api/v1/leaderboard/artists?page=1&per_page=25&q=Legacy")

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert v1.get_json() == legacy.get_json()
    payload = v1.get_json()
    assert set(payload.keys()) == {"items", "pagination", "filters"}
    assert payload["items"][0]["artist"] == "Legacy Artist"

    with app.app_context():
        db.drop_all()


def test_leaderboard_battle_contract_matches_v1_and_user_counts():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        songs = Song.query.order_by(Song.track_number.asc()).all()
        song_a, song_b = songs[0], songs[1]
        song_a.match_count = 5
        song_b.match_count = 3
        song_a.elo_rating = 1225.0
        song_b.elo_rating = 1100.0

        db.session.add_all(
            [
                BattleVote(user_id=user_id, winner_id=song_a.id, loser_id=song_b.id),
                BattleVote(user_id=user_id, winner_id=song_a.id, loser_id=song_b.id),
            ]
        )
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    legacy = client.get("/api/leaderboard/battle?page=1&per_page=50")
    v1 = client.get("/api/v1/leaderboard/battle?page=1&per_page=50")

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert v1.get_json() == legacy.get_json()
    payload = v1.get_json()
    assert set(payload.keys()) == {"items", "pagination", "filters"}
    assert payload["items"][0]["user_winner_count"] >= 0

    with app.app_context():
        db.drop_all()


def test_battle_pair_contract_returns_expected_shape_and_distinct_songs():
    app = _build_app()
    with app.app_context():
        db.create_all()

    _seed_authenticated_user_and_album(app)
    client = app.test_client()

    response = client.get("/api/v1/battle")

    assert response.status_code == 200
    payload = response.get_json()
    assert set(payload.keys()) == {"song1", "song2"}

    for key in ("song1", "song2"):
        song = payload[key]
        assert set(song.keys()) == {"id", "title", "spotify_url", "apple_url", "youtube_url", "album"}
        assert set(song["album"].keys()) == {"id", "title", "artist", "cover_url"}

    assert payload["song1"]["id"] != payload["song2"]["id"]

    with app.app_context():
        db.drop_all()


def test_battle_vote_happy_path_updates_elo_and_returns_payload():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)
    client = app.test_client()
    _login(client, user_id)

    with app.app_context():
        songs = Song.query.order_by(Song.track_number.asc()).all()
        winner_song = songs[0]
        loser_song = songs[1]
        winner_id = winner_song.id
        loser_id = loser_song.id
        winner_before = float(winner_song.elo_rating)
        loser_before = float(loser_song.elo_rating)
        winner_match_before = int(winner_song.match_count or 0)
        loser_match_before = int(loser_song.match_count or 0)

    response = client.post("/api/v1/battle/vote", json={"winner_id": winner_id, "loser_id": loser_id})
    assert response.status_code == 200

    payload = response.get_json()
    assert set(payload.keys()) == {"winner", "loser"}
    assert set(payload["winner"].keys()) == {"id", "new_rating", "gain"}
    assert set(payload["loser"].keys()) == {"id", "new_rating", "loss"}
    assert payload["winner"]["id"] == winner_id
    assert payload["loser"]["id"] == loser_id

    with app.app_context():
        winner_after = db.session.get(Song, winner_id)
        loser_after = db.session.get(Song, loser_id)
        vote_rows = BattleVote.query.all()

        assert len(vote_rows) == 1
        assert winner_after.elo_rating > winner_before
        assert loser_after.elo_rating < loser_before
        assert winner_after.match_count == winner_match_before + 1
        assert loser_after.match_count == loser_match_before + 1

    with app.app_context():
        db.drop_all()


def test_battle_vote_rejects_same_winner_and_loser_ids():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)
    client = app.test_client()
    _login(client, user_id)

    with app.app_context():
        song = Song.query.order_by(Song.track_number.asc()).first()
        song_id = song.id
        elo_before = float(song.elo_rating)
        match_before = int(song.match_count or 0)

    response = client.post("/api/v1/battle/vote", json={"winner_id": song_id, "loser_id": song_id})
    assert response.status_code == 400
    assert response.get_json() == {"error": "winner_id and loser_id must be different"}

    with app.app_context():
        song_after = db.session.get(Song, song_id)
        vote_count = BattleVote.query.count()
        assert song_after.elo_rating == elo_before
        assert song_after.match_count == match_before
        assert vote_count == 0

    with app.app_context():
        db.drop_all()


def test_song_requests_list_and_create_contract():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)
    client = app.test_client()
    _login(client, user_id)

    initial = client.get("/api/v1/song-requests")
    assert initial.status_code == 200
    assert initial.get_json() == {
        "requests": [],
        "stats": {"total": 0, "fulfilled": 0, "pending": 0},
    }

    invalid = client.post("/api/v1/song-requests", json={"title": "", "artist": ""})
    assert invalid.status_code == 400
    assert invalid.get_json() == {"error": "Both album title and artist are required."}

    create_payload = {
        "title": "Discovery",
        "artist": "Daft Punk",
        "spotify_id": "abc123",
        "cover_url": "https://example.com/discovery.jpg",
        "release_date": "2001-03-07",
        "spotify_url": "https://open.spotify.com/album/abc123",
    }
    created = client.post("/api/v1/song-requests", json=create_payload)
    assert created.status_code == 201
    created_json = created.get_json()
    assert created_json["message"] == "Your request has been submitted!"
    assert created_json["request"]["title"] == "Discovery"
    assert created_json["request"]["artist"] == "Daft Punk"
    assert created_json["request"]["fulfilled"] is False

    after = client.get("/api/v1/song-requests")
    assert after.status_code == 200
    after_payload = after.get_json()
    assert after_payload["stats"] == {"total": 1, "fulfilled": 0, "pending": 1}
    assert len(after_payload["requests"]) == 1
    assert after_payload["requests"][0]["title"] == "Discovery"

    with app.app_context():
        db.drop_all()


def test_song_requests_search_contract_and_validation():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)
    client = app.test_client()
    _login(client, user_id)

    invalid = client.post("/api/v1/song-requests/search", json={"album_query": ""})
    assert invalid.status_code == 400
    assert invalid.get_json() == {"error": "album_query is required"}

    mocked_albums = [
        {
            "id": "spotify-album-1",
            "name": "Random Access Memories",
            "artists": [{"name": "Daft Punk"}],
            "release_date": "2013-05-17",
            "images": [{"url": "https://example.com/ram.jpg"}],
            "external_urls": {"spotify": "https://open.spotify.com/album/spotify-album-1"},
        }
    ]

    with patch("app.routes.api.search_album", return_value=mocked_albums):
        response = client.post("/api/v1/song-requests/search", json={"album_query": "daft punk ram"})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["query"] == "daft punk ram"
    assert len(payload["albums"]) == 1
    assert payload["albums"][0] == {
        "id": "spotify-album-1",
        "title": "Random Access Memories",
        "artist": "Daft Punk",
        "release_date": "2013-05-17",
        "cover_url": "https://example.com/ram.jpg",
        "spotify_url": "https://open.spotify.com/album/spotify-album-1",
    }

    with app.app_context():
        db.drop_all()


def test_leaderboard_artist_bio_contract_matches_v1_with_cache():
    app = _build_app()
    with app.app_context():
        db.create_all()
        db.session.add(Setting(key="artist_bio:Legacy Artist", value="Cached bio text"))
        db.session.commit()

    client = app.test_client()
    legacy = client.get("/api/leaderboard/artists/Legacy%20Artist/bio")
    v1 = client.get("/api/v1/leaderboard/artists/Legacy%20Artist/bio")

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert v1.get_json() == legacy.get_json()
    assert v1.get_json()["bio"] == "Cached bio text"

    with app.app_context():
        db.drop_all()


def test_leaderboard_artists_handles_image_fetch_failure_without_500():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        current_album = Album.query.filter_by(is_current=True).first()
        past_album = Album(title="Past", artist="Uncached Artist", is_current=False, queue_order=7)
        db.session.add(past_album)
        db.session.flush()

        past_song = Song(album_id=past_album.id, title="Past Song", track_number=1)
        db.session.add(past_song)
        db.session.flush()

        db.session.add(Vote(user_id=user_id, song_id=past_song.id, score=4.0, ignored=False))
        current_album.queue_order = 10
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    with patch("app.routes.api.fetch_artist_image", side_effect=RuntimeError("spotify lookup failed")):
        response = client.get("/api/v1/leaderboard/artists?page=1&per_page=25&sort_by=avg_score&sort_dir=asc")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["items"]
    assert payload["items"][0]["image_url"]

    with app.app_context():
        db.drop_all()


def test_leaderboard_albums_contract_matches_v1():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        current_album = Album.query.filter_by(is_current=True).first()
        past_album = Album(title="Past Album", artist="Past Artist", is_current=False, queue_order=7)
        db.session.add(past_album)
        db.session.flush()

        past_song = Song(album_id=past_album.id, title="Past Track", track_number=1)
        db.session.add(past_song)
        db.session.flush()

        db.session.add(Vote(user_id=user_id, song_id=past_song.id, score=4.25, ignored=False))
        db.session.add(AlbumScore(user_id=user_id, album_id=past_album.id, personal_score=4.5, ignored=False))
        current_album.queue_order = 10
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    legacy = client.get("/api/leaderboard/albums?page=1&per_page=25&sort_by=avg_song_score&sort_dir=desc")
    v1 = client.get("/api/v1/leaderboard/albums?page=1&per_page=25&sort_by=avg_song_score&sort_dir=desc")

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert v1.get_json() == legacy.get_json()

    payload = v1.get_json()
    assert set(payload.keys()) == {"items", "pagination", "filters"}
    assert payload["items"]
    assert payload["items"][0]["title"] == "Past Album"

    with app.app_context():
        db.drop_all()


def test_leaderboard_songs_contract_matches_v1():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        current_album = Album.query.filter_by(is_current=True).first()
        past_album = Album(title="Legacy Album", artist="Legacy Artist", is_current=False, queue_order=7)
        db.session.add(past_album)
        db.session.flush()

        past_song = Song(
            album_id=past_album.id,
            title="Legacy Track",
            track_number=1,
            spotify_url="https://open.spotify.com/track/abc",
        )
        db.session.add(past_song)
        db.session.flush()

        db.session.add(Vote(user_id=user_id, song_id=past_song.id, score=4.1, ignored=False))
        current_album.queue_order = 10
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    legacy = client.get("/api/leaderboard/songs?page=1&per_page=25&min_ratings=1&sort_by=avg_score")
    v1 = client.get("/api/v1/leaderboard/songs?page=1&per_page=25&min_ratings=1&sort_by=avg_score")

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert v1.get_json() == legacy.get_json()

    payload = v1.get_json()
    assert set(payload.keys()) == {"items", "pagination", "filters"}
    assert payload["items"]
    assert payload["items"][0]["title"] == "Legacy Track"

    with app.app_context():
        db.drop_all()


def test_leaderboard_songs_respects_min_ratings_threshold():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        user_two = User(username="tester-two", password_hash="hash")
        db.session.add(user_two)
        db.session.flush()
        user_two_id = user_two.id

        current_album = Album.query.filter_by(is_current=True).first()
        past_album = Album(title="Threshold Album", artist="Threshold Artist", is_current=False, queue_order=7)
        db.session.add(past_album)
        db.session.flush()

        popular_song = Song(album_id=past_album.id, title="Popular Track", track_number=1)
        niche_song = Song(album_id=past_album.id, title="Niche Track", track_number=2)
        db.session.add_all([popular_song, niche_song])
        db.session.flush()

        db.session.add_all(
            [
                Vote(user_id=user_id, song_id=popular_song.id, score=4.2, ignored=False),
                Vote(user_id=user_two_id, song_id=popular_song.id, score=4.0, ignored=False),
                Vote(user_id=user_id, song_id=niche_song.id, score=5.0, ignored=False),
            ]
        )

        current_album.queue_order = 10
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    response = client.get("/api/v1/leaderboard/songs?page=1&per_page=25&min_ratings=2&sort_by=avg_score")
    assert response.status_code == 200
    payload = response.get_json()
    titles = [item["title"] for item in payload["items"]]
    assert titles == ["Popular Track"]

    with app.app_context():
        db.drop_all()


def test_leaderboard_albums_search_matches_title_and_artist():
    app = _build_app()
    with app.app_context():
        db.create_all()

    user_id = _seed_authenticated_user_and_album(app)

    with app.app_context():
        current_album = Album.query.filter_by(is_current=True).first()

        first_album = Album(title="Electric Feelings", artist="Neon Waves", is_current=False, queue_order=7)
        second_album = Album(title="Concrete Nights", artist="Metro Pulse", is_current=False, queue_order=8)
        db.session.add_all([first_album, second_album])
        db.session.flush()

        first_song = Song(album_id=first_album.id, title="Spark", track_number=1)
        second_song = Song(album_id=second_album.id, title="Subway Echo", track_number=1)
        db.session.add_all([first_song, second_song])
        db.session.flush()

        db.session.add_all(
            [
                Vote(user_id=user_id, song_id=first_song.id, score=4.0, ignored=False),
                Vote(user_id=user_id, song_id=second_song.id, score=4.0, ignored=False),
                AlbumScore(user_id=user_id, album_id=first_album.id, personal_score=4.1, ignored=False),
                AlbumScore(user_id=user_id, album_id=second_album.id, personal_score=4.1, ignored=False),
            ]
        )

        current_album.queue_order = 10
        db.session.commit()

    client = app.test_client()
    _login(client, user_id)

    by_title = client.get("/api/v1/leaderboard/albums?page=1&per_page=25&q=Electric")
    by_artist = client.get("/api/v1/leaderboard/albums?page=1&per_page=25&q=Metro")

    assert by_title.status_code == 200
    assert by_artist.status_code == 200

    title_items = by_title.get_json()["items"]
    artist_items = by_artist.get_json()["items"]

    assert len(title_items) == 1
    assert title_items[0]["title"] == "Electric Feelings"
    assert len(artist_items) == 1
    assert artist_items[0]["artist"] == "Metro Pulse"

    with app.app_context():
        db.drop_all()
