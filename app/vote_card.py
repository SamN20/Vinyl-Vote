"""
Vote Card Generator
Generates shareable image cards for user album ratings.
"""

from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import requests
from pathlib import Path
from datetime import datetime, timezone
import os


class VoteCardGenerator:
    """Generates shareable vote card images."""
    
    # Card dimensions (Instagram optimized)
    WIDTH = 1080
    HEIGHT = 1080
    
    # Colors
    BG_COLOR = (18, 18, 18)  # Dark background
    TEXT_COLOR = (238, 238, 238)  # Light text
    ACCENT_COLOR = (29, 185, 84)  # Spotify green
    
    def __init__(self):
        """Initialize the vote card generator."""
        self.font_cache = {}
        
    def _get_font(self, size, bold=False):
        """Get a font with caching. Falls back to default if custom fonts unavailable."""
        cache_key = f"{size}_{bold}"
        if cache_key in self.font_cache:
            return self.font_cache[cache_key]
        
        try:
            # Try to use a nice font if available
            font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
            font = ImageFont.truetype(font_path, size)
        except Exception:
            # Fall back to default font
            font = ImageFont.load_default()
        
        self.font_cache[cache_key] = font
        return font
    
    def _download_album_art(self, url):
        """Download album art from URL and return PIL Image."""
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return Image.open(BytesIO(response.content))
        except Exception as e:
            print(f"Failed to download album art: {e}")
            # Return a placeholder
            placeholder = Image.new('RGB', (400, 400), self.BG_COLOR)
            return placeholder
    
    def generate_card(self, album_data, user_data, top_song_data):
        """
        Generate a vote card image.
        
        Args:
            album_data: dict with 'title', 'artist', 'cover_url'
            user_data: dict with 'username', 'album_score'
            top_song_data: dict with 'title', 'score'
        
        Returns:
            PIL Image object
        """
        # Create base image
        img = Image.new('RGB', (self.WIDTH, self.HEIGHT), self.BG_COLOR)
        draw = ImageDraw.Draw(img)
        
        # Add branding at top
        brand_font = self._get_font(36, bold=True)
        brand_text = "VINYL VOTE"
        brand_bbox = draw.textbbox((0, 0), brand_text, font=brand_font)
        brand_width = brand_bbox[2] - brand_bbox[0]
        brand_x = (self.WIDTH - brand_width) // 2
        draw.text((brand_x, 50), brand_text, fill=self.ACCENT_COLOR, font=brand_font)
        
        # Download and add album art (smaller size)
        album_art = self._download_album_art(album_data['cover_url'])
        art_size = 320
        album_art = album_art.resize((art_size, art_size), Image.Resampling.LANCZOS)
        
        # Position album art (centered horizontally)
        art_x = (self.WIDTH - art_size) // 2
        art_y = 140
        img.paste(album_art, (art_x, art_y))
        
        # Add user's album score (large, prominent) - below album art
        score_font = self._get_font(80, bold=True)
        score_text = f"{user_data['album_score']:.1f}★"
        score_bbox = draw.textbbox((0, 0), score_text, font=score_font)
        score_width = score_bbox[2] - score_bbox[0]
        score_x = (self.WIDTH - score_width) // 2
        score_y = art_y + art_size + 40
        draw.text((score_x, score_y), score_text, fill=self.ACCENT_COLOR, font=score_font)
        
        # Add album title and artist - below score
        title_font = self._get_font(32, bold=True)
        artist_font = self._get_font(26)
        
        # Truncate if too long
        album_title = album_data['title']
        if len(album_title) > 30:
            album_title = album_title[:27] + "..."
        
        title_bbox = draw.textbbox((0, 0), album_title, font=title_font)
        title_width = title_bbox[2] - title_bbox[0]
        title_x = (self.WIDTH - title_width) // 2
        title_y = score_y + 110
        draw.text((title_x, title_y), album_title, fill=self.TEXT_COLOR, font=title_font)
        
        artist_text = f"by {album_data['artist']}"
        if len(artist_text) > 35:
            artist_text = artist_text[:32] + "..."
        artist_bbox = draw.textbbox((0, 0), artist_text, font=artist_font)
        artist_width = artist_bbox[2] - artist_bbox[0]
        artist_x = (self.WIDTH - artist_width) // 2
        draw.text((artist_x, title_y + 48), artist_text, fill=(180, 180, 180), font=artist_font)
        
        # Add top track info - below artist
        if top_song_data:
            top_label_font = self._get_font(22)
            top_song_font = self._get_font(26, bold=True)
            
            top_label = "Top Track"
            top_label_bbox = draw.textbbox((0, 0), top_label, font=top_label_font)
            top_label_width = top_label_bbox[2] - top_label_bbox[0]
            top_label_x = (self.WIDTH - top_label_width) // 2
            top_y = title_y + 120
            draw.text((top_label_x, top_y), top_label, fill=(160, 160, 160), font=top_label_font)
            
            song_title = top_song_data['title']
            if len(song_title) > 30:
                song_title = song_title[:27] + "..."
            song_text = f'"{song_title}" ({top_song_data["score"]:.1f}★)'
            song_bbox = draw.textbbox((0, 0), song_text, font=top_song_font)
            song_width = song_bbox[2] - song_bbox[0]
            song_x = (self.WIDTH - song_width) // 2
            draw.text((song_x, top_y + 35), song_text, fill=self.TEXT_COLOR, font=top_song_font)
        
        # Add date/week info at bottom
        date_font = self._get_font(20)
        date_text = datetime.now(timezone.utc).strftime("Week of %b %d, %Y")
        date_bbox = draw.textbbox((0, 0), date_text, font=date_font)
        date_width = date_bbox[2] - date_bbox[0]
        date_x = (self.WIDTH - date_width) // 2
        draw.text((date_x, self.HEIGHT - 120), date_text, fill=(140, 140, 140), font=date_font)
        
        # Add footer branding
        footer_font = self._get_font(24, bold=True)
        footer_text = "VinylVote.byNolo.ca"
        footer_bbox = draw.textbbox((0, 0), footer_text, font=footer_font)
        footer_width = footer_bbox[2] - footer_bbox[0]
        footer_x = (self.WIDTH - footer_width) // 2
        draw.text((footer_x, self.HEIGHT - 80), footer_text, fill=self.ACCENT_COLOR, font=footer_font)
        
        return img
    
    def save_card(self, img, output_path):
        """Save the generated card to a file."""
        img.save(output_path, 'PNG', optimize=True)
        return output_path


def generate_vote_card(album, user, user_votes):
    """
    High-level function to generate a vote card.
    
    Args:
        album: Album model instance
        user: User model instance
        user_votes: dict of {song_id: score}
    
    Returns:
        PIL Image object
    """
    from .models import AlbumScore, Song
    
    # Get user's album score
    album_score = AlbumScore.query.filter_by(user_id=user.id, album_id=album.id).first()
    if not album_score:
        return None
    
    # Find user's top-rated song
    top_song = None
    top_score = 0
    for song in album.songs:
        if song.id in user_votes and user_votes[song.id] > top_score:
            top_score = user_votes[song.id]
            top_song = song
    
    # Prepare data
    album_data = {
        'title': album.title,
        'artist': album.artist,
        'cover_url': album.cover_url
    }
    
    user_data = {
        'username': user.username,
        'album_score': album_score.personal_score
    }
    
    top_song_data = None
    if top_song:
        top_song_data = {
            'title': top_song.title,
            'score': top_score
        }
    
    # Generate card
    generator = VoteCardGenerator()
    return generator.generate_card(album_data, user_data, top_song_data)
