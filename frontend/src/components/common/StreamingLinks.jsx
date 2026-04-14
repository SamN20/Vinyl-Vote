import { FaApple, FaSpotify, FaYoutube } from "react-icons/fa";
import "./StreamingLinks.css";

export default function StreamingLinks({ spotifyUrl, appleUrl, youtubeUrl, mode = "full" }) {
  if (!spotifyUrl && !appleUrl && !youtubeUrl) {
    return null;
  }

  const compact = mode === "icons";

  return (
    <div className={`streaming-links ${compact ? "compact" : ""}`.trim()}>
      {spotifyUrl ? (
        <a
          className="stream-btn"
          href={spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open on Spotify"
          title="Spotify"
        >
          <FaSpotify aria-hidden="true" />
          {compact ? null : <span>Spotify</span>}
        </a>
      ) : null}

      {appleUrl ? (
        <a
          className="stream-btn"
          href={appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open on Apple Music"
          title="Apple Music"
        >
          <FaApple aria-hidden="true" />
          {compact ? null : <span>Apple Music</span>}
        </a>
      ) : null}

      {youtubeUrl ? (
        <a
          className="stream-btn"
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open on YouTube Music"
          title="YouTube Music"
        >
          <FaYoutube aria-hidden="true" />
          {compact ? null : <span>YouTube Music</span>}
        </a>
      ) : null}
    </div>
  );
}
