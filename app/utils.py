import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from flask import current_app
from ytmusicapi import YTMusic
import requests
from urllib.parse import quote

def get_spotify_client():
    return spotipy.Spotify(auth_manager=SpotifyClientCredentials(
        client_id=current_app.config['SPOTIPY_CLIENT_ID'],
        client_secret=current_app.config['SPOTIPY_CLIENT_SECRET']
    ))

def search_album(query):
    sp = get_spotify_client()
    results = sp.search(q=query, type='album', limit=5)
    return results['albums']['items']

def fetch_album_details(spotify_id):
    sp = get_spotify_client()
    album = sp.album(spotify_id)
    return {
        'title': album['name'],
        'artist': album['artists'][0]['name'],
        'release_date': album['release_date'],
        'cover_url': album['images'][0]['url'] if album['images'] else '',
        'spotify_url': album['external_urls']['spotify'],
        'tracks': [
            {
                'title': t['name'],
                'track_number': t['track_number'],
                'duration': t['duration_ms'] // 1000,  # seconds
                'spotify_url': t['external_urls']['spotify']
            } for t in album['tracks']['items']
        ]
    }

def get_album_spotify_data(spotify_id):
    """
    Fetch genres (from artist) and average audio features (from tracks).
    Returns a dict suitable for storage in Album.spotify_data.
    """
    sp = get_spotify_client()
    try:
        album = sp.album(spotify_id)
        artist_id = album['artists'][0]['id']
        artist = sp.artist(artist_id)
        genres = artist.get('genres', [])

        # Get tracks
        tracks = album['tracks']['items']
        track_ids = [t['id'] for t in tracks if t.get('id')]
        
        # Audio features (can fetch up to 100 at once)
        audio_features = []
        try:
            audio_features = sp.audio_features(track_ids)
        except Exception as e:
            print(f"Failed to fetch audio features (likely 403): {e}")
            # Continue without audio features
            
        # Calculate averages
        features_sum = {'valence': 0, 'energy': 0, 'danceability': 0, 'acousticness': 0, 'instrumentalness': 0, 'liveness': 0, 'speechiness': 0}
        count = 0
        
        if audio_features:
            for f in audio_features:
                if f:
                    count += 1
                    for key in features_sum:
                        features_sum[key] += f.get(key, 0)
        
        avgs = {k: (v / count if count > 0 else 0) for k, v in features_sum.items()}
        
        return {
            'genres': genres,
            'audio_features': avgs if count > 0 else None,
            'popularity': album.get('popularity', 0)
        }
    except Exception as e:
        print(f"Error fetching Spotify data: {e}")
        return None

ytmusic = YTMusic()

def search_youtube_music(song_title, artist):
    query = f"{song_title} {artist}"
    results = ytmusic.search(query, filter="songs", limit=1)
    if results:
        return f"https://music.youtube.com/watch?v={results[0]['videoId']}"
    return None

def search_apple_music(song_title, artist):
    query = quote(f"{song_title} {artist}")
    url = f"https://music.apple.com/us/search?term={query}"
    return url  # opens the top search result in Apple Music


import json
from pywebpush import webpush, WebPushException
from flask import current_app

def send_push(subscription_info, title, body, url="/"):
    # If subscription_info is a string, decode it; otherwise assume it's a dict
    if isinstance(subscription_info, str):
        subscription = json.loads(subscription_info)
    else:
        subscription = subscription_info
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps({
                "title": title,
                "body": body,
                "url": url
            }),
            vapid_private_key=current_app.config["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": "mailto:admin@yourdomain.com"}
        )
    except WebPushException as ex:
        print(f"Push failed: {repr(ex)}")


def fetch_artist_image(artist_name):
    """
    Search Spotify for an artist and return their first image URL,
    or a default placeholder if none found.
    """
    sp = get_spotify_client()
    token = sp.auth_manager.get_access_token(as_dict=False)
    headers = {'Authorization': f'Bearer {token}'}
    params = {'q': f'artist:{artist_name}', 'type': 'artist', 'limit': 1}
    resp = requests.get('https://api.spotify.com/v1/search', headers=headers, params=params)
    data = resp.json()

    try:
        images = data['artists']['items'][0]['images']
        return images[0]['url'] if images else current_app.config['DEFAULT_ARTIST_IMAGE']
    except Exception:
        return current_app.config['DEFAULT_ARTIST_IMAGE']