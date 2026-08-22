import os
import sys
from urllib.parse import urlparse

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from app.models import Song, SongAudioMatch
from app.services.audio_providers import get_audio_provider
from app.services.needle_drop import parse_duration_seconds
from app.utils import get_spotify_client


def spotify_track_id(url):
    if not url:
        return None
    parts = [part for part in urlparse(url).path.split('/') if part]
    if len(parts) >= 2 and parts[-2] == 'track':
        return parts[-1]
    return None


def main(limit=100, dry_run=False, skip_spotify=False, batch_size=50):
    app = create_app()
    with app.app_context():
        provider = get_audio_provider('deezer')
        sp = None if skip_spotify else get_spotify_client()
        songs = Song.query.order_by(Song.id).limit(limit).all()
        for index, song in enumerate(songs, start=1):
            if not song.spotify_track_id:
                song.spotify_track_id = spotify_track_id(song.spotify_url)

            if sp and song.spotify_track_id and not song.isrc:
                try:
                    track = sp.track(song.spotify_track_id)
                    song.isrc = (track.get('external_ids') or {}).get('isrc')
                except Exception as exc:
                    print(f"Spotify lookup failed for {song.id}: {exc}")

            existing = SongAudioMatch.query.filter_by(song_id=song.id, provider='deezer').first()
            if existing and existing.override:
                continue

            result = provider.resolve_track(
                title=song.title,
                artist=song.album.artist,
                album=song.album.title,
                duration_seconds=parse_duration_seconds(song.duration),
                isrc=song.isrc,
            )
            match = existing or SongAudioMatch(song_id=song.id, provider='deezer')
            db.session.add(match)
            match.provider_track_id = result.provider_track_id
            match.match_status = result.match_status
            match.match_confidence = result.match_confidence
            match.preview_available = result.preview_available
            match.isrc = result.isrc or song.isrc
            match.matched_title = result.matched_title
            match.matched_artist = result.matched_artist
            match.matched_album = result.matched_album
            match.matched_duration = result.matched_duration
            print(f"{song.id}: {song.title} -> {result.match_status} {result.provider_track_id or ''}")

            if not dry_run and index % batch_size == 0:
                db.session.commit()
                print(f"Committed {index} songs.")

        if dry_run:
            db.session.rollback()
            print("Dry run complete; rolled back.")
        else:
            db.session.commit()
            print("Needle Drop backfill complete.")


if __name__ == '__main__':
    limit_arg = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    dry = '--dry-run' in sys.argv
    skip_spotify_arg = '--skip-spotify' in sys.argv
    main(limit=limit_arg, dry_run=dry, skip_spotify=skip_spotify_arg)
