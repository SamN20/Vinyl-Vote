import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusCard from "../components/common/StatusCard";
import StreamingLinks from "../components/common/StreamingLinks";
import { defaultCardPalette, extractAlbumPalette } from "../utils/albumPalette";
import "./NextAlbumVotePage.css";

function NextAlbumCandidate({ album, isSelected, onSelect }) {
  const [palette, setPalette] = useState(defaultCardPalette);

  useEffect(() => {
    let cancelled = false;
    const coverUrl = album?.cover_url;

    if (!coverUrl) {
      setPalette(defaultCardPalette);
      return () => {
        cancelled = true;
      };
    }

    extractAlbumPalette(coverUrl)
      .then((nextPalette) => {
        if (!cancelled && nextPalette) {
          setPalette(nextPalette);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPalette(defaultCardPalette);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [album?.cover_url]);

  return (
    <label
      className={`next-album-option ${isSelected ? "selected" : ""}`}
      style={{
        "--next-album-primary": palette.primary,
        "--next-album-secondary": palette.secondary,
      }}
    >
      <input
        type="radio"
        name="next-album"
        value={String(album.id)}
        checked={isSelected}
        onChange={() => onSelect(String(album.id))}
      />
      <span className="next-album-cover-wrap">
        {album.cover_url ? (
          <img src={album.cover_url} alt={`${album.title} cover`} className="next-album-cover" />
        ) : (
          <span className="next-album-cover-fallback">No Cover</span>
        )}
        <span className="next-album-selected-mark" aria-hidden="true">OK</span>
      </span>
      <span className="next-album-option-body">
        {/* <span className="next-album-option-meta">Queue #{album.queue_order || "Next"}</span> */}
        <strong>{album.title}</strong>
        <span>{album.artist}</span>
        <small>{album.song_count || 0} tracks</small>
        <StreamingLinks
          spotifyUrl={album.spotify_url}
          appleUrl={album.apple_url}
          youtubeUrl={album.youtube_url}
          mode="icons"
        />
      </span>
    </label>
  );
}

export default function NextAlbumVotePage({ nextAlbum }) {
  const navigate = useNavigate();

  async function onSubmit(event) {
    event.preventDefault();
    const result = await nextAlbum.saveChoice();
    if (result) {
      navigate("/retro-hub");
    }
  }

  return (
    <>
      {/* <section className="hero next-album-hero">
        <p className="eyebrow">Step 2 of 3</p>
        <h1>Pick Next Week's Album</h1>
        <p className="subtitle">
          Choose what the group rates after this week's record, then keep moving into retro voting.
        </p>
      </section> */}

      <section className="next-album-flow card" aria-label="Voting flow">
        <div className="next-album-flow-step complete">
          <span>1</span>
          <strong>Weekly vote</strong>
          <small>Complete</small>
        </div>
        <div className="next-album-flow-step active">
          <span>2</span>
          <strong>Next week</strong>
          <small>Choose one album</small>
        </div>
        <div className="next-album-flow-step">
          <span>3</span>
          <strong>Retro</strong>
          <small>Up next after submit</small>
        </div>
      </section>

      <section className="card next-album-card">
        <header className="next-album-card-header">
          <div>
            <p className="vote-kicker">Next Week</p>
            <h2>{nextAlbum.currentAlbum ? `After ${nextAlbum.currentAlbum.title}` : "Next Album Vote"}</h2>
          </div>
          <button className="btn btn-ghost" type="button" onClick={nextAlbum.loadOptions}>
            Refresh
          </button>
        </header>

        {nextAlbum.state === "loading" ? <StatusCard message="Loading next-week choices..." /> : null}
        {nextAlbum.state === "error" ? (
          <StatusCard title="Next-week vote unavailable" message={nextAlbum.error} variant="error" />
        ) : null}

        {nextAlbum.state === "ready" && nextAlbum.albums.length === 0 ? (
          <div className="next-album-empty">
            <h3>No albums are queued yet</h3>
            <p className="empty-text">There are no next-week candidates available right now.</p>
          </div>
        ) : null}

        {nextAlbum.state === "ready" && nextAlbum.albums.length > 0 ? (
          <form className="next-album-form" onSubmit={onSubmit}>
            <div className="next-album-options">
              {nextAlbum.albums.map((album) => (
                <NextAlbumCandidate
                  album={album}
                  isSelected={String(album.id) === String(nextAlbum.selectedAlbumId)}
                  key={album.id}
                  onSelect={nextAlbum.setSelectedAlbumId}
                />
              ))}
            </div>

            <div className="next-album-submit-panel">
              <div>
                <strong>
                  {nextAlbum.selectedAlbum
                    ? `${nextAlbum.selectedAlbum.title} is your pick`
                    : "Choose an album to continue"}
                </strong>
                <p>
                  After this is saved, you will head to the retro hub to catch up on older records.
                </p>
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!nextAlbum.selectedAlbumId || nextAlbum.submitState === "saving"}
              >
                {nextAlbum.submitState === "saving" ? "Saving..." : "Save & Continue to Retro"}
              </button>
            </div>

            {nextAlbum.feedback ? <p className="success-text">{nextAlbum.feedback}</p> : null}
            {nextAlbum.error ? <p className="error-text">{nextAlbum.error}</p> : null}
          </form>
        ) : null}
      </section>
    </>
  );
}
