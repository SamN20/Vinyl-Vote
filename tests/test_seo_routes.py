from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree

from flask import Flask

from app import db
from app.models import Album, VotePeriod
from app.routes import user


def _build_app():
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SECRET_KEY="test-secret",
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        PUBLIC_SITE_URL="https://vinylvote.bynolo.ca",
    )

    db.init_app(app)
    app.register_blueprint(user.bp)

    return app


def test_robots_txt_points_to_public_sitemap_and_discourages_private_routes():
    app = _build_app()
    client = app.test_client()

    response = client.get("/robots.txt")

    assert response.status_code == 200
    assert response.mimetype == "text/plain"

    body = response.get_data(as_text=True)
    assert "Allow: /" in body
    assert "Disallow: /admin" in body
    assert "Disallow: /api/" in body
    assert "Disallow: /retro-hub" in body
    assert "Disallow: /vote" in body
    assert "Sitemap: https://vinylvote.bynolo.ca/sitemap.xml" in body


def test_sitemap_xml_includes_public_pages_and_album_results():
    app = _build_app()
    with app.app_context():
        db.create_all()
        db.session.add(
            VotePeriod(
                id=1,
                end_time=datetime.now(timezone.utc) + timedelta(days=1),
            )
        )
        db.session.add_all(
            [
                Album(title="Current Album", artist="Current Artist", queue_order=3, is_current=True),
                Album(title="Past Album", artist="Past Artist", queue_order=2, is_current=False),
                Album(title="Unscheduled Album", artist="Hidden Artist", queue_order=0, is_current=False),
            ]
        )
        db.session.commit()

    client = app.test_client()
    response = client.get("/sitemap.xml")

    assert response.status_code == 200
    assert response.mimetype == "application/xml"

    root = ElementTree.fromstring(response.get_data(as_text=True))
    namespace = {"sitemap": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locs = [loc.text for loc in root.findall(".//sitemap:loc", namespace)]

    assert "https://vinylvote.bynolo.ca/" in locs
    assert "https://vinylvote.bynolo.ca/results" in locs
    assert "https://vinylvote.bynolo.ca/top-albums" in locs
    assert "https://vinylvote.bynolo.ca/top-artists" in locs
    assert "https://vinylvote.bynolo.ca/top-songs" in locs
    assert "https://vinylvote.bynolo.ca/faceoff-leaderboard" in locs
    assert "https://vinylvote.bynolo.ca/results/1" in locs
    assert "https://vinylvote.bynolo.ca/results/2" in locs
    assert "https://vinylvote.bynolo.ca/results/3" not in locs

    with app.app_context():
        db.drop_all()
