import { useEffect, useMemo, useRef, useState } from "react";
import { legacyPageHref } from "../../api";
import StreamingLinks from "../common/StreamingLinks";
import { formatVoteEnd } from "../../hooks/useVotingFlow";
import "./VoteCard.css";

function StarRatingInput({ value, onChange, disabled = false, className = "", ariaHidden = false }) {
  const numeric = Number(value || 0);
  const normalized = Number.isNaN(numeric) ? 0 : numeric;
  const base = Math.max(0, Math.min(5, Math.floor(normalized)));
  const hasHalf = Math.abs(normalized - base - 0.5) < 0.01;

  function setScore(next) {
    const clamped = Math.max(0, Math.min(5, next));
    onChange(clamped.toFixed(1).replace(/\.0$/, ""));
  }

  return (
    <div
      className={`lazy-stars ${disabled ? "disabled" : ""} ${className}`.trim()}
      aria-hidden={ariaHidden ? "true" : undefined}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-btn ${star <= base ? "active" : ""}`}
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return;
            }
            if (star === base && !hasHalf) {
              setScore(0);
            } else {
              setScore(star + (hasHalf ? 0.5 : 0));
            }
          }}
          aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
        >
          ★
        </button>
      ))}
      <button
        type="button"
        className={`half-btn ${hasHalf ? "active" : ""}`}
        disabled={disabled || base >= 5}
        onClick={() => setScore(base + (hasHalf ? 0 : 0.5))}
        aria-label="Toggle half-star increment"
      >
        1/2
      </button>
    </div>
  );
}

/**
 * Parse song duration into whole seconds.
 *
 * Supported inputs:
 * - number: treated as seconds (e.g. 245)
 * - numeric string seconds: "245"
 * - "MM:SS" string (e.g. "4:05")
 * - "HH:MM:SS" string (e.g. "1:04:32")
 *
 * Returns 0 for empty/invalid values.
 */
function parseDurationToSeconds(duration) {
  if (duration === null || duration === undefined || duration === "") {
    return 0;
  }

  if (typeof duration === "number" && Number.isFinite(duration)) {
    return Math.max(0, Math.floor(duration));
  }

  const text = String(duration).trim();
  if (!text) {
    return 0;
  }

  if (/^\d+$/.test(text)) {
    return Math.max(0, Number(text));
  }

  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (parts.length === 2) {
    return Math.max(0, parts[0] * 60 + parts[1]);
  }

  if (parts.length === 3) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  return 0;
}

function formatAlbumLength(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "Unknown";
  }

  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${totalMinutes}m`;
}

function formatCountdown(value) {
  if (!value) {
    return "No deadline";
  }

  const end = new Date(value);
  if (Number.isNaN(end.getTime())) {
    return "Unknown deadline";
  }

  const diff = end.getTime() - Date.now();
  if (diff <= 0) {
    return "Voting closed";
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${mins}m ${secs}s`;
  }
  return `${hours}h ${mins}m ${secs}s`;
}

export default function VoteCard({
  albumPayload,
  albumScore,
  albumState,
  error,
  feedback,
  hasSavedVotes,
  hasUnsavedChanges,
  loadAlbum,
  progressPercent,
  ratedTracks,
  remainingTracks,
  saveVotes,
  setAlbumScore,
  setSongScore,
  songScores,
  songs,
  statusLabel,
  submitState,
  title = "Current Album",
  submitLabel = "Save Votes",
  showPostVoteActions = true,
  showRefreshButton = true,
  showDeadlineStatusBar = true,
}) {
  const [lazyMode, setLazyMode] = useState(false);
  const submitRef = useRef(null);
  const [isDocked, setIsDocked] = useState(true);
  const [pipSupported, setPipSupported] = useState(false);
  const [popoutHint, setPopoutHint] = useState("");
  const [countdownText, setCountdownText] = useState("No deadline");

  const albumLength = useMemo(() => {
    const total = songs.reduce((sum, song) => sum + parseDurationToSeconds(song.duration), 0);
    return formatAlbumLength(total);
  }, [songs]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("v2_lazy_mode");
      setLazyMode(saved === "true");
    } catch {
      setLazyMode(false);
    }
  }, []);

  useEffect(() => {
    const supported =
      typeof window.documentPictureInPicture === "object"
      && typeof window.documentPictureInPicture.requestWindow === "function";
    setPipSupported(Boolean(supported));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !submitRef.current) return;
    if (typeof IntersectionObserver === "undefined") return;

    const submitButton = submitRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setIsDocked(false);
          return;
        }
        setIsDocked(true);
      },
      {
        threshold: 0,
        rootMargin: "0px 0px -20% 0px",
      }
    );

    observer.observe(submitButton);

    return () => {
      observer.disconnect();
    };
  }, [albumState, songs.length]);

  useEffect(() => {
    setCountdownText(formatCountdown(albumPayload?.vote_end));

    if (!albumPayload?.vote_end) {
      return;
    }

    const timer = window.setInterval(() => {
      setCountdownText(formatCountdown(albumPayload?.vote_end));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [albumPayload?.vote_end]);

  async function onSubmit(event) {
    event.preventDefault();
    await saveVotes();
  }

  function toggleLazyMode() {
    setLazyMode((prev) => {
      const next = !prev;
      localStorage.setItem("v2_lazy_mode", String(next));
      return next;
    });
  }

  function openPopout() {
    if (typeof window === "undefined") {
      return;
    }
    window.open(window.location.href, "vinyl-vote-popout", "width=980,height=920,resizable=yes,scrollbars=yes");
    setPopoutHint("Opened in a new window.");
  }

  function renderProgressFooter(linkTabIndex) {
    const isComplete = remainingTracks <= 0;
    return (
      <>
        <div className="vpf-left">
          <strong>Tracks rated: {ratedTracks}/{songs.length}</strong>
          <span className={`muted ${isComplete ? "vpf-complete-text" : ""}`} style={{ marginLeft: 8 }}>
            {remainingTracks > 0 ? `${remainingTracks} remaining` : "Ready to submit"}
          </span>
          <div
            className={`vpf-bar ${isComplete ? "complete" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent)}
            aria-label="Track rating progress"
          >
            <div className="vpf-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <a
          href="#vote-submit"
          className="btn btn-ghost"
          style={{ whiteSpace: "nowrap" }}
          tabIndex={linkTabIndex}
        >
          Review &amp; Submit
        </a>
      </>
    );
  }

  return (
    <section className="card vote-card">
      <header className="vote-header">
        <div className="vote-header-copy">
          <p className="vote-kicker">Now Voting</p>
          <h2>{title}</h2>
        </div>
        {showRefreshButton ? (
          <button className="btn btn-ghost" type="button" onClick={loadAlbum}>Refresh</button>
        ) : null}
      </header>

      {albumState === "loading" && <p>Loading current album and your saved votes...</p>}
      {albumState === "error" && <p className="error-text">{error || "Could not load voting data right now."}</p>}
      {albumState === "empty" && <p className="empty-text">{error || "No album is currently open for voting."}</p>}

      {albumState === "ready" && albumPayload?.album ? (
        <>
          <article className="album-panel">
            {showDeadlineStatusBar && albumPayload?.vote_end ? (
              <div className="album-status-bar" role="list" aria-label="Voting window status">
                <p className="album-status-item" role="listitem">
                  <span className="album-status-label">Voting Closes</span>
                  <span className="album-status-value">{formatVoteEnd(albumPayload?.vote_end)}</span>
                </p>
                <span className="album-status-divider" aria-hidden="true" />
                <p className="album-status-item" role="listitem">
                  <span className="album-status-label">Time Remaining</span>
                  <span className="album-status-value remaining" aria-live="polite">{countdownText}</span>
                </p>
              </div>
            ) : null}

            {albumPayload.album.cover_url && (
              <img
                src={albumPayload.album.cover_url}
                alt={`${albumPayload.album.title} cover`}
                className="cover"
              />
            )}
            <div className="album-panel-content">
              <h3>{albumPayload.album.title}</h3>
              <p className="artist">{albumPayload.album.artist}</p>
              <ul className="album-stats-grid" aria-label="Album details">
                <li className="album-stat">
                  <span className="meta-label">Release</span>
                  <span className="meta-value">{albumPayload.album.release_date || "Unknown"}</span>
                </li>
                <li className="album-stat">
                  <span className="meta-label">Tracks</span>
                  <span className="meta-value">{songs.length}</span>
                </li>
                <li className="album-stat">
                  <span className="meta-label">Length</span>
                  <span className="meta-value">{albumLength}</span>
                </li>
              </ul>
              <StreamingLinks
                spotifyUrl={albumPayload.album.spotify_url}
                appleUrl={albumPayload.album.apple_url}
                youtubeUrl={albumPayload.album.youtube_url}
              />
              {albumPayload.user?.has_voted && (
                <span className="badge">You have already submitted votes</span>
              )}
              {pipSupported ? (
                <div className="pip-action-row">
                  <button className="btn btn-secondary" type="button" onClick={openPopout}>Pop out voting window</button>
                  {popoutHint ? <span className="muted">{popoutHint}</span> : null}
                </div>
              ) : null}
            </div>
          </article>

          <form className={`vote-form ${isDocked ? "with-fixed-footer" : "with-inline-footer"}`} onSubmit={onSubmit}>
            <label className={`lazy-toggle-row ${lazyMode ? "active" : ""}`}>
              <input type="checkbox" checked={lazyMode} onChange={toggleLazyMode} />
              <span className="lazy-toggle-switch" aria-hidden="true">
                <span className="lazy-toggle-knob" />
              </span>
              <span className="lazy-toggle-copy">
                <strong>Lazy vote mode</strong>
                <small>{lazyMode ? "Star controls" : "Numeric controls"}</small>
              </span>
            </label>

            <div className="tracks-grid">
              {songs.map((song) => (
                <label className={`track-row ${lazyMode ? "lazy" : ""}`} key={song.id}>
                  <span className="track-name">
                    <strong>{song.track_number ? `${song.track_number}. ` : ""}</strong>
                    {song.title}
                  </span>
                  <div className="score-control-stack">
                    <input
                      className="score-input score-input-numeric"
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      value={songScores[song.id] ?? ""}
                      onChange={(event) => setSongScore(song.id, event.target.value)}
                      placeholder="0-5"
                      tabIndex={lazyMode ? -1 : 0}
                      aria-hidden={lazyMode ? "true" : undefined}
                    />
                    <StarRatingInput
                      className="score-input-stars"
                      value={songScores[song.id] ?? ""}
                      onChange={(next) => setSongScore(song.id, next)}
                      disabled={!lazyMode}
                      ariaHidden={!lazyMode}
                    />
                  </div>
                </label>
              ))}
            </div>

            <label className={`album-score-row ${lazyMode ? "lazy" : ""}`}>
              <span><strong>Album score</strong></span>
              <div className="score-control-stack">
                <input
                  className="score-input score-input-numeric"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={albumScore}
                  onChange={(event) => setAlbumScore(event.target.value)}
                  placeholder="0-5"
                  tabIndex={lazyMode ? -1 : 0}
                  aria-hidden={lazyMode ? "true" : undefined}
                />
                <StarRatingInput
                  className="score-input-stars"
                  value={albumScore}
                  onChange={(next) => setAlbumScore(next)}
                  disabled={!lazyMode}
                  ariaHidden={!lazyMode}
                />
              </div>
            </label>

            <div className={`vote-status ${hasUnsavedChanges ? "unsaved" : hasSavedVotes ? "voted" : "not-voted"}`}>
              {statusLabel}
            </div>

            {feedback && <p className="success-text">{feedback}</p>}
            {feedback && albumPayload?.album?.id && showPostVoteActions ? (
              <div className="post-vote-actions">
                <a className="btn btn-secondary" href={legacyPageHref(`/share-card/${albumPayload.album.id}`)}>
                  Download Vote Card
                </a>
                <a className="btn btn-secondary" href={legacyPageHref("/next_album_vote")}>
                  Pick Next Week Album
                </a>
              </div>
            ) : null}
            {error && <p className="error-text">{error}</p>}

            <button
              ref={submitRef}
              className="btn btn-primary"
              id="vote-submit"
              type="submit"
              disabled={submitState === "saving"}
            >
              {submitState === "saving" ? "Saving..." : submitLabel}
            </button>
          </form>

          <div
            className={`vote-progress-footer fixed ${isDocked ? "is-visible" : "is-hidden"}`}
            aria-live={isDocked ? "polite" : "off"}
            aria-hidden={!isDocked}
          >
            {renderProgressFooter(isDocked ? 0 : -1)}
          </div>

          <div
            className={`vote-progress-footer in-flow ${isDocked ? "is-hidden" : "is-visible"}`}
            aria-live={!isDocked ? "polite" : "off"}
            aria-hidden={isDocked}
          >
            {renderProgressFooter(isDocked ? -1 : 0)}
          </div>
        </>
      ) : null}
    </section>
  );
}
