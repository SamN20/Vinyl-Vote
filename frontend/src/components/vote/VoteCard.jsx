import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { legacyPageHref } from "../../api";
import StreamingLinks from "../common/StreamingLinks";
import { formatVoteEnd } from "../../hooks/useVotingFlow";
import StarRatingInput from "./StarRatingInput";
import VoteCardLoadingSkeleton from "./VoteCardLoadingSkeleton";
import { formatAlbumLength, formatCountdown, parseDurationToSeconds } from "./voteCardUtils";
import "./VoteCard.css";

const VOTE_PIP_STYLES = `
  :root {
    color-scheme: dark light;
    --bg: #0f1115;
    --card-bg: #171a21;
    --input-bg: #10131a;
    --text: #f3f5f7;
    --muted: #aeb6c4;
    --accent: #1db954;
    --border-color: rgba(255, 255, 255, 0.14);
    --success-color: #2ecc71;
  }

  [data-theme="light"] {
    --bg: #f6f7f9;
    --card-bg: #ffffff;
    --input-bg: #f2f4f7;
    --text: #15171c;
    --muted: #5c6675;
    --border-color: rgba(16, 24, 40, 0.14);
  }

  * {
    box-sizing: border-box;
  }

  html,
  body,
  #vote-pip-root {
    height: 100%;
  }

  body {
    margin: 0;
    background: var(--card-bg);
    color: var(--text);
    font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: hidden;
  }

  button,
  input {
    font: inherit;
  }

  .vote-pip-shell {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--card-bg);
  }

  .vote-pip-topbar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.55rem;
    padding: 0.7rem 0.75rem;
    border-bottom: 1px solid var(--border-color);
    background: var(--card-bg);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  }

  .vote-pip-title {
    min-width: 0;
  }

  .vote-pip-title strong,
  .vote-pip-title span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vote-pip-title span {
    color: var(--muted);
    font-size: 0.78rem;
    margin-top: 0.1rem;
  }

  .vote-pip-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--muted);
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .vote-pip-toggle input {
    accent-color: var(--accent);
  }

  .vote-pip-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }

  .vote-pip-form {
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .vote-pip-list {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    display: grid;
    align-content: start;
    gap: 0.45rem;
    padding: 0.65rem 0.7rem;
  }

  .vote-pip-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.55rem;
    align-items: center;
    padding: 0.55rem 0.6rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg);
  }

  .vote-pip-track {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vote-pip-control {
    width: 82px;
  }

  .vote-pip-row.lazy .vote-pip-control {
    width: 202px;
  }

  .vote-pip-control .score-input {
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--input-bg);
    color: var(--text);
    border-radius: 6px;
    padding: 0.45rem 0.5rem;
  }

  .vote-pip-control .score-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .lazy-stars {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 202px;
    max-width: 100%;
    overflow: hidden;
  }

  .lazy-stars.disabled {
    pointer-events: none;
  }

  .star-btn,
  .half-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg);
    color: var(--muted);
    padding: 0.2rem;
    line-height: 1;
    cursor: pointer;
  }

  .star-btn.active,
  .half-btn.active {
    color: var(--accent);
    border-color: var(--accent);
  }

  .half-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .vote-pip-footer {
    display: grid;
    gap: 0.45rem;
    padding: 0.65rem 0.7rem;
    border-top: 1px solid var(--border-color);
    background: color-mix(in oklab, var(--card-bg) 94%, transparent);
  }

  .vote-pip-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    color: var(--muted);
    font-size: 0.82rem;
  }

  .vote-pip-status strong {
    color: var(--text);
  }

  .vote-pip-bar {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--input-bg);
  }

  .vote-pip-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }

  .vote-pip-submit {
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: var(--accent);
    color: #07110a;
    font-weight: 800;
    padding: 0.72rem 0.9rem;
    cursor: pointer;
  }

  .vote-pip-submit:disabled {
    opacity: 0.64;
    cursor: wait;
  }
`;

function VotePopoutContent({
  albumPayload,
  albumScore,
  closePopout,
  lazyMode,
  onSubmit,
  progressPercent,
  ratedTracks,
  remainingTracks,
  setAlbumScore,
  setSongScore,
  songScores,
  songs,
  statusLabel,
  submitState,
  toggleLazyMode,
}) {
  const album = albumPayload?.album;

  return (
    <section className="vote-pip-shell" aria-label="Voting pop-out">
      <header className="vote-pip-topbar">
        <div className="vote-pip-title">
          <strong>{album?.title || "Voting"}</strong>
          <span>{album?.artist || "Vinyl Vote"}</span>
        </div>
        <label className="vote-pip-toggle">
          <input type="checkbox" checked={lazyMode} onChange={toggleLazyMode} />
          <span>Lazy</span>
        </label>
        <button className="vote-pip-close" type="button" onClick={closePopout} aria-label="Close pop-out">
          x
        </button>
      </header>

      <form className="vote-pip-form" onSubmit={onSubmit}>
        <div className="vote-pip-list">
          {songs.map((song) => (
            <label className={`vote-pip-row ${lazyMode ? "lazy" : ""}`} key={song.id}>
              <span className="vote-pip-track">
                <strong>{song.track_number ? `${song.track_number}. ` : ""}</strong>
                {song.title}
              </span>
              <span className="vote-pip-control">
                {lazyMode ? (
                  <StarRatingInput
                    value={songScores[song.id] ?? ""}
                    onChange={(next) => setSongScore(song.id, next)}
                  />
                ) : (
                  <input
                    className="score-input"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={songScores[song.id] ?? ""}
                    onChange={(event) => setSongScore(song.id, event.target.value)}
                    placeholder="0-5"
                  />
                )}
              </span>
            </label>
          ))}

          <label className={`vote-pip-row ${lazyMode ? "lazy" : ""}`}>
            <span className="vote-pip-track">
              <strong>Album score</strong>
            </span>
            <span className="vote-pip-control">
              {lazyMode ? (
                <StarRatingInput value={albumScore} onChange={setAlbumScore} />
              ) : (
                <input
                  className="score-input"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={albumScore}
                  onChange={(event) => setAlbumScore(event.target.value)}
                  placeholder="0-5"
                />
              )}
            </span>
          </label>
        </div>

        <footer className="vote-pip-footer">
          <div className="vote-pip-status">
            <strong>{statusLabel}</strong>
            <span>{remainingTracks > 0 ? `${ratedTracks}/${songs.length} rated` : "Ready"}</span>
          </div>
          <div
            className="vote-pip-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent)}
            aria-label="Track rating progress"
          >
            <div className="vote-pip-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <button className="vote-pip-submit" type="submit" disabled={submitState === "saving"}>
            {submitState === "saving" ? "Saving..." : "Submit"}
          </button>
        </footer>
      </form>
    </section>
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
  showDeadlineStatusBar = true,
}) {
  const [lazyMode, setLazyMode] = useState(false);
  const submitRef = useRef(null);
  const [isDocked, setIsDocked] = useState(true);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipRoot, setPipRoot] = useState(null);
  const [pipWindow, setPipWindow] = useState(null);
  const [popoutHint, setPopoutHint] = useState("");
  const [countdownText, setCountdownText] = useState("No deadline");
  const pipCleanupRef = useRef(null);

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

  const closePopout = useCallback(() => {
    if (pipCleanupRef.current) {
      pipCleanupRef.current();
      pipCleanupRef.current = null;
    }

    setPipWindow((currentWindow) => {
      if (currentWindow && !currentWindow.closed) {
        currentWindow.close();
      }
      return null;
    });
    setPipRoot(null);
  }, []);

  useEffect(() => closePopout, [closePopout]);

  async function openPopout() {
    if (typeof window === "undefined") {
      return;
    }

    if (!pipSupported) {
      setPopoutHint("Pop-out is not supported in this browser.");
      return;
    }

    try {
      if (pipWindow && !pipWindow.closed) {
        pipWindow.focus();
        setPopoutHint("Pop-out is already open.");
        return;
      }

      closePopout();

      const nextWindow = await window.documentPictureInPicture.requestWindow({
        width: 360,
        height: 620,
      });
      const { document: pipDocument } = nextWindow;
      pipDocument.title = "Vinyl Vote - Pop-out";
      pipDocument.body.textContent = "";
      pipDocument.documentElement.setAttribute(
        "data-theme",
        document.documentElement.getAttribute("data-theme") || "dark"
      );

      const style = pipDocument.createElement("style");
      style.textContent = VOTE_PIP_STYLES;
      pipDocument.head.appendChild(style);

      const root = pipDocument.createElement("div");
      root.id = "vote-pip-root";
      pipDocument.body.appendChild(root);

      const syncTheme = () => {
        pipDocument.documentElement.setAttribute(
          "data-theme",
          document.documentElement.getAttribute("data-theme") || "dark"
        );
      };
      const themeObserver = new MutationObserver(syncTheme);
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      const handleClose = () => {
        themeObserver.disconnect();
        setPipWindow(null);
        setPipRoot(null);
        pipCleanupRef.current = null;
      };

      nextWindow.addEventListener("pagehide", handleClose, { once: true });
      pipCleanupRef.current = () => {
        nextWindow.removeEventListener("pagehide", handleClose);
        themeObserver.disconnect();
      };

      setPipWindow(nextWindow);
      setPipRoot(root);
      setPopoutHint("Opened in pop-out.");
    } catch {
      setPopoutHint("Could not open pop-out.");
    }
  }

  function renderProgressFooter(linkTabIndex) {
    const isComplete = remainingTracks <= 0;
    return (
      <>
        <div className="vpf-left">
          <strong>Tracks rated: {ratedTracks}/{songs.length}</strong>
          <span className={`muted vpf-secondary ${isComplete ? "vpf-complete-text" : ""}`}>
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

      {albumState === "loading" && <VoteCardLoadingSkeleton />}
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

          {pipRoot ? createPortal(
            <VotePopoutContent
              albumPayload={albumPayload}
              albumScore={albumScore}
              closePopout={closePopout}
              lazyMode={lazyMode}
              onSubmit={onSubmit}
              progressPercent={progressPercent}
              ratedTracks={ratedTracks}
              remainingTracks={remainingTracks}
              setAlbumScore={setAlbumScore}
              setSongScore={setSongScore}
              songScores={songScores}
              songs={songs}
              statusLabel={statusLabel}
              submitState={submitState}
              toggleLazyMode={toggleLazyMode}
            />,
            pipRoot
          ) : null}
        </>
      ) : null}
    </section>
  );
}
