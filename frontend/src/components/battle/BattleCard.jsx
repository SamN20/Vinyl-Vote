import React, { useState } from "react";
import StreamingLinks from "../common/StreamingLinks";
import { getSpotifyTrackId } from "../../utils/spotify";

export default function BattleCard({ song, onVote, disabled, id, theme }) {
  if (!song) return null;

  const [iframeLoaded, setIframeLoaded] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    onVote && onVote(song.id);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (e.key === "Enter") {
      onVote && onVote(song.id);
    } else if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      onVote && onVote(song.id);
    }
  };

  return (
    <div
      className="battle-card"
      id={id}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={onKeyDown}
      aria-disabled={disabled}
      aria-label={`Vote for ${song.title} by ${song.album?.artist || "unknown"}`}
    >
      <div className="battle-cover">
        {song.album?.cover_url ? <img src={song.album.cover_url} alt={song.album.title} /> : null}
        <div className="battle-overlay">
          <span className="vote-text">VOTE</span>
        </div>
      </div>

      <div className="battle-info">
        <h3>{song.title}</h3>
        <p>{song.album?.artist}</p>
        <div className="song-links">
          <StreamingLinks
            spotifyUrl={song.spotify_url}
            appleUrl={song.apple_url}
            youtubeUrl={song.youtube_url}
            mode="icons"
          />
        </div>

        {song.spotify_url ? (
          <div className="spotify-embed-container">
            <div className={`spotify-embed-wrapper ${iframeLoaded ? "loaded" : "loading"}`}>
              <div className="spotify-skeleton" role="img" aria-label="Loading player" aria-hidden={iframeLoaded}>
                <div className="sk-thumb" />
                <div className="sk-body">
                  <div className="sk-line sk-short" />
                  <div className="sk-line sk-long" />
                  <div className="sk-progress" />
                </div>
              </div>
              {/* Use passed theme when available, fallback to document attribute */}
              {(() => {
                const docTheme = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : "dark";
                const useTheme = theme || docTheme || "dark";
                // Spotify embed expects theme=1 for light, 0 for dark; map accordingly
                const spotifyTheme = useTheme === "light" ? "1" : "0";
                const trackId = getSpotifyTrackId(song.spotify_url);
                const src = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=${spotifyTheme}`;
                return (
                  <iframe
                    src={src}
                    width="100%"
                    height="80"
                    frameBorder="0"
                    onLoad={() => setIframeLoaded(true)}
                    allowFullScreen=""
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    style={{ display: "block", borderRadius: "12px", border: "none", background: "transparent", opacity: iframeLoaded ? 1 : 0, transition: "opacity .18s ease" }}
                  />
                );
              })()}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
