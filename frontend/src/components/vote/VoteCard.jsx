import { useEffect, useState, useRef } from "react";
import { legacyPageHref } from "../../api";
import StreamingLinks from "../common/StreamingLinks";
import { formatVoteEnd } from "../../hooks/useVotingFlow";
import "./VoteCard.css";

function StarRatingInput({ value, onChange, disabled = false }) {
  const numeric = Number(value || 0);
  const normalized = Number.isNaN(numeric) ? 0 : numeric;
  const base = Math.max(0, Math.min(5, Math.floor(normalized)));
  const hasHalf = Math.abs(normalized - base - 0.5) < 0.01;

  function setScore(next) {
    const clamped = Math.max(0, Math.min(5, next));
    onChange(clamped.toFixed(1).replace(/\.0$/, ""));
  }

  return (
    <div className={`lazy-stars ${disabled ? "disabled" : ""}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-btn ${star <= base ? "active" : ""}`}
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
          aria-label={`Set score ${star}`}
        >
          ★
        </button>
      ))}
      <button
        type="button"
        className={`half-btn ${hasHalf ? "active" : ""}`}
        disabled={disabled || base >= 5}
        onClick={() => setScore(base + (hasHalf ? 0 : 0.5))}
      >
        1/2
      </button>
    </div>
  );
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
}) {
  const [lazyMode, setLazyMode] = useState(false);
  const submitRef = useRef(null);
  const [isDocked, setIsDocked] = useState(true);
  const [pipSupported, setPipSupported] = useState(false);
  const [popoutHint, setPopoutHint] = useState("");

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
        // Keep footer fixed while voting through tracks, then release it
        // when the submit area is visible to match V1 behavior.
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
        <div>
          <h2>{title}</h2>
          <p className="vote-end">Voting closes: {formatVoteEnd(albumPayload?.vote_end)}</p>
        </div>
        {showRefreshButton ? (
          <button className="btn btn-ghost" type="button" onClick={loadAlbum}>Refresh</button>
        ) : null}
      </header>

      {albumState === "loading" && <p>Loading current album and your saved votes...</p>}
      {albumState === "error" && <p className="error-text">{error || "Could not load voting data right now."}</p>}
      {albumState === "empty" && <p className="empty-text">{error || "No album is currently open for voting."}</p>}

      {albumState === "ready" && albumPayload?.album && (
        <>
          <article className="album-panel">
            {albumPayload.album.cover_url && (
              <img
                src={albumPayload.album.cover_url}
                alt={`${albumPayload.album.title} cover`}
                className="cover"
              />
            )}
            <div>
              <h3>{albumPayload.album.title}</h3>
              <p className="artist">{albumPayload.album.artist}</p>
              {albumPayload.album.release_date ? (
                <p className="meta">Release date: {albumPayload.album.release_date}</p>
              ) : null}
              <p className="meta">{songs.length} tracks</p>
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
              <span className="lazy-checkbox" aria-hidden="true">✓</span>
              <span>Lazy vote mode</span>
            </label>

            <div className="tracks-grid">
              {songs.map((song) => (
                <label className={`track-row ${lazyMode ? "lazy" : ""}`} key={song.id}>
                  <span className="track-name">
                    <strong>{song.track_number ? `${song.track_number}. ` : ""}</strong>
                    {song.title}
                  </span>
                  <input
                    className={`score-input ${lazyMode ? "visually-hidden" : ""}`}
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={songScores[song.id] ?? ""}
                    onChange={(event) => setSongScore(song.id, event.target.value)}
                    placeholder="0-5"
                  />
                  {lazyMode ? (
                    <StarRatingInput
                      value={songScores[song.id] ?? ""}
                      onChange={(next) => setSongScore(song.id, next)}
                    />
                  ) : null}
                </label>
              ))}
            </div>

            <label className={`album-score-row ${lazyMode ? "lazy" : ""}`}>
              <span>Album score</span>
              <input
                className={`score-input ${lazyMode ? "visually-hidden" : ""}`}
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={albumScore}
                onChange={(event) => setAlbumScore(event.target.value)}
                placeholder="0-5"
              />
              {lazyMode ? (
                <StarRatingInput
                  value={albumScore}
                  onChange={(next) => setAlbumScore(next)}
                />
              ) : null}
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
      )}
    </section>
  );
}
