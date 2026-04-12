import StreamingLinks from "../common/StreamingLinks";
import "./RetroVoteCard.css";

export default function RetroVoteCard({
  albumPayload,
  albumScore,
  albums,
  albumsError,
  albumsState,
  albumState,
  error,
  feedback,
  loadAlbums,
  saveVotes,
  selectedAlbumId,
  setAlbumScore,
  setSelectedAlbumId,
  setSongScore,
  songScores,
  songs,
  submitState,
  title = "Retro Hub (Preview)",
  subtitle = "Vote on missed albums from earlier weeks.",
}) {
  async function onSubmit(event) {
    event.preventDefault();
    await saveVotes();
  }

  const hasAlbums = albums.length > 0;

  return (
    <section className="card retro-card">
      <header className="retro-header">
        <div>
          <h2>{title}</h2>
          <p className="retro-subtitle">{subtitle}</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={loadAlbums}>Refresh Retro List</button>
      </header>

      {albumsState === "loading" ? <p>Loading eligible retro albums...</p> : null}
      {albumsState === "error" ? <p className="error-text">{albumsError}</p> : null}

      {albumsState === "ready" && !hasAlbums ? (
        <p className="empty-text">No retro albums are currently eligible for your account.</p>
      ) : null}

      {hasAlbums ? (
        <label className="retro-select-row">
          <span>Album</span>
          <select
            className="retro-select"
            value={selectedAlbumId}
            onChange={(event) => setSelectedAlbumId(event.target.value)}
          >
            {albums.map((album) => (
              <option key={album.id} value={String(album.id)}>
                {album.title} - {album.artist}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {albumState === "loading" ? <p>Loading retro album details...</p> : null}
      {albumState === "error" ? <p className="error-text">{error}</p> : null}

      {albumState === "ready" && albumPayload?.album ? (
        <>
          <article className="retro-album-panel">
            {albumPayload.album.cover_url ? (
              <img
                src={albumPayload.album.cover_url}
                alt={`${albumPayload.album.title} cover`}
                className="retro-cover"
              />
            ) : null}
            <div>
              <h3>{albumPayload.album.title}</h3>
              <p className="retro-meta">{albumPayload.album.artist}</p>
              <p className="retro-meta">{songs.length} tracks</p>
              <StreamingLinks
                spotifyUrl={albumPayload.album.spotify_url}
                appleUrl={albumPayload.album.apple_url}
                youtubeUrl={albumPayload.album.youtube_url}
              />
            </div>
          </article>

          <form className="retro-form" onSubmit={onSubmit}>
            <div className="retro-tracks-grid">
              {songs.map((song) => (
                <label className="retro-track-row" key={song.id}>
                  <span className="retro-track-name">
                    <strong>{song.track_number ? `${song.track_number}. ` : ""}</strong>
                    {song.title}
                  </span>
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
                </label>
              ))}
            </div>

            <label className="retro-album-score-row">
              <span>Album score</span>
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
            </label>

            {feedback ? <p className="success-text">{feedback}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}

            <button className="btn btn-primary" type="submit" disabled={submitState === "saving"}>
              {submitState === "saving" ? "Saving..." : "Save Retro Votes"}
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}
