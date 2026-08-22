from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Optional

import requests
from flask import current_app


@dataclass
class AudioMatchResult:
    provider: str
    provider_track_id: Optional[str]
    match_status: str
    match_confidence: float
    preview_available: bool
    isrc: Optional[str] = None
    matched_title: Optional[str] = None
    matched_artist: Optional[str] = None
    matched_album: Optional[str] = None
    matched_duration: Optional[int] = None


class AudioProvider:
    name = "abstract"

    def resolve_track(self, *, title, artist, album=None, duration_seconds=None, isrc=None):
        raise NotImplementedError

    def resolve_track_id(self, provider_track_id, *, title, artist, album=None, duration_seconds=None, isrc=None):
        raise NotImplementedError

    def search_tracks(self, query, limit=8):
        raise NotImplementedError

    def search_albums(self, query, limit=8):
        raise NotImplementedError

    def album_tracks(self, provider_album_id):
        raise NotImplementedError

    def preview_url(self, provider_track_id):
        raise NotImplementedError


def _norm(value):
    return " ".join((value or "").lower().strip().split())


def _ratio(left, right):
    return SequenceMatcher(None, _norm(left), _norm(right)).ratio()


class DeezerAudioProvider(AudioProvider):
    name = "deezer"
    base_url = "https://api.deezer.com"

    def _get(self, path, params=None):
        timeout = current_app.config.get("DEEZER_API_TIMEOUT", 8)
        response = requests.get(f"{self.base_url}{path}", params=params, timeout=timeout)
        response.raise_for_status()
        return response.json()

    def resolve_track(self, *, title, artist, album=None, duration_seconds=None, isrc=None):
        if isrc:
            try:
                data = self._get(f"/track/isrc:{isrc}")
                if data and not data.get("error") and data.get("id"):
                    return self._result_from_track(data, title, artist, album, duration_seconds, isrc=isrc)
            except Exception:
                current_app.logger.info("Deezer ISRC lookup failed", exc_info=True)

        query_bits = [f'track:"{title}"', f'artist:"{artist}"']
        if album:
            query_bits.append(f'album:"{album}"')

        try:
            data = self._get("/search/track", params={"q": " ".join(query_bits), "limit": 5})
            candidates = data.get("data") or []
        except Exception:
            current_app.logger.info("Deezer search failed", exc_info=True)
            candidates = []

        if not candidates:
            return AudioMatchResult(
                provider=self.name,
                provider_track_id=None,
                match_status="missing",
                match_confidence=0.0,
                preview_available=False,
                isrc=isrc,
            )

        best = max(
            candidates,
            key=lambda item: self._confidence(item, title, artist, album, duration_seconds),
        )
        return self._result_from_track(best, title, artist, album, duration_seconds, isrc=isrc)

    def preview_url(self, provider_track_id):
        if not provider_track_id:
            return None
        try:
            data = self._get(f"/track/{provider_track_id}")
        except Exception:
            current_app.logger.info("Deezer preview lookup failed", exc_info=True)
            return None
        return data.get("preview") or None

    def resolve_track_id(self, provider_track_id, *, title, artist, album=None, duration_seconds=None, isrc=None):
        if not provider_track_id:
            return AudioMatchResult(
                provider=self.name,
                provider_track_id=None,
                match_status="missing",
                match_confidence=0.0,
                preview_available=False,
                isrc=isrc,
            )
        try:
            data = self._get(f"/track/{provider_track_id}")
        except Exception:
            current_app.logger.info("Deezer track lookup failed", exc_info=True)
            return AudioMatchResult(
                provider=self.name,
                provider_track_id=str(provider_track_id),
                match_status="missing",
                match_confidence=0.0,
                preview_available=False,
                isrc=isrc,
            )
        if not data or data.get("error") or not data.get("id"):
            return AudioMatchResult(
                provider=self.name,
                provider_track_id=str(provider_track_id),
                match_status="missing",
                match_confidence=0.0,
                preview_available=False,
                isrc=isrc,
            )
        return self._result_from_track(data, title, artist, album, duration_seconds, isrc=isrc)

    def search_tracks(self, query, limit=8):
        if not query:
            return []
        try:
            data = self._get("/search/track", params={"q": query, "limit": limit})
        except Exception:
            current_app.logger.info("Deezer track search failed", exc_info=True)
            return []
        return data.get("data") or []

    def search_albums(self, query, limit=8):
        if not query:
            return []
        try:
            data = self._get("/search/album", params={"q": query, "limit": limit})
        except Exception:
            current_app.logger.info("Deezer album search failed", exc_info=True)
            return []
        return data.get("data") or []

    def album_tracks(self, provider_album_id):
        if not provider_album_id:
            return None
        try:
            data = self._get(f"/album/{provider_album_id}")
        except Exception:
            current_app.logger.info("Deezer album lookup failed", exc_info=True)
            return None
        if not data or data.get("error"):
            return None

        album_stub = {
            "id": data.get("id"),
            "title": data.get("title"),
            "artist": data.get("artist") or {},
            "cover_medium": data.get("cover_medium"),
            "cover_big": data.get("cover_big"),
            "track_count": data.get("nb_tracks"),
        }
        tracks = []
        for track in (data.get("tracks") or {}).get("data") or []:
            normalized = dict(track)
            normalized.setdefault("album", album_stub)
            tracks.append(normalized)
        album_stub["tracks"] = tracks
        return album_stub

    def confidence_for_track(self, track, *, title, artist, album=None, duration_seconds=None):
        return self._confidence(track, title, artist, album, duration_seconds)

    def result_from_track(self, track, *, title, artist, album=None, duration_seconds=None, isrc=None):
        return self._result_from_track(track, title, artist, album, duration_seconds, isrc=isrc)

    def _confidence(self, track, title, artist, album, duration_seconds):
        title_score = max(_ratio(track.get("title"), title), _ratio(track.get("title_short"), title))
        artist_score = _ratio((track.get("artist") or {}).get("name"), artist)
        album_score = _ratio((track.get("album") or {}).get("title"), album) if album else 0.75
        duration_score = 0.75
        if duration_seconds and track.get("duration"):
            delta = abs(int(track.get("duration") or 0) - int(duration_seconds))
            duration_score = max(0.0, 1.0 - min(delta, 45) / 45)
        return (title_score * 0.42) + (artist_score * 0.32) + (album_score * 0.16) + (duration_score * 0.10)

    def _result_from_track(self, track, title, artist, album, duration_seconds, isrc=None):
        confidence = self._confidence(track, title, artist, album, duration_seconds)
        preview = bool(track.get("preview"))
        status = "matched" if preview and confidence >= 0.82 else ("review" if preview else "missing_preview")
        return AudioMatchResult(
            provider=self.name,
            provider_track_id=str(track.get("id")) if track.get("id") else None,
            match_status=status,
            match_confidence=round(confidence, 4),
            preview_available=preview,
            isrc=isrc,
            matched_title=track.get("title") or track.get("title_short"),
            matched_artist=(track.get("artist") or {}).get("name"),
            matched_album=(track.get("album") or {}).get("title"),
            matched_duration=track.get("duration"),
        )


def get_audio_provider(name="deezer"):
    if name != "deezer":
        raise ValueError(f"Unsupported audio provider: {name}")
    return DeezerAudioProvider()
