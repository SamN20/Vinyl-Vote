import { FaApple, FaSpotify, FaYoutube } from "react-icons/fa";
import "./StreamingLinks.css";

export default function StreamingLinks({ spotifyUrl, appleUrl, youtubeUrl }) {
  if (!spotifyUrl && !appleUrl && !youtubeUrl) {
    return null;
  }

  return (
    <div className="streaming-links">
      {spotifyUrl ? (
        <a className="stream-btn" href={spotifyUrl} target="_blank" rel="noopener noreferrer">
          <FaSpotify aria-hidden="true" />
          <span>Spotify</span>
        </a>
      ) : null}

      {appleUrl ? (
        <a className="stream-btn" href={appleUrl} target="_blank" rel="noopener noreferrer">
          <FaApple aria-hidden="true" />
          <span>Apple Music</span>
        </a>
      ) : null}

      {youtubeUrl ? (
        <a className="stream-btn" href={youtubeUrl} target="_blank" rel="noopener noreferrer">
          <FaYoutube aria-hidden="true" />
          <span>YouTube Music</span>
        </a>
      ) : null}
    </div>
  );
}
