import { useMemo, useState } from "react";
import "./RetroHubPage.css";

export default function RetroHubPage({ retro }) {
  const [query, setQuery] = useState("");

  const filteredAlbums = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return retro.albums;
    }
    return retro.albums.filter((album) => {
      return album.title.toLowerCase().includes(q) || album.artist.toLowerCase().includes(q);
    });
  }, [query, retro.albums]);

  function openRetroVote(albumId) {
    window.location.hash = `#/retro-vote/${albumId}`;
  }

  return (
    <>
      <section className="hero retro-hero">
        <p className="eyebrow">Vinyl Vote V2</p>
        <h1>Retro Vote Hub</h1>
        <p className="subtitle">
          Catch up on albums you missed. Recommendations are sorted by predicted taste match.
        </p>
      </section>

      <section className="card retro-grid-card">
        <header className="retro-grid-header">
          <h2>Missed Albums</h2>
          <input
            className="retro-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or artist"
          />
        </header>

        {retro.albumsState === "loading" ? <p>Loading missed albums...</p> : null}
        {retro.albumsState === "error" ? <p className="error-text">{retro.albumsError}</p> : null}

        {retro.albumsState === "ready" && retro.albums.length === 0 ? (
          <div className="retro-empty">
            <h3>You are all caught up</h3>
            <p className="empty-text">You have already voted on every eligible past album.</p>
          </div>
        ) : null}

        {filteredAlbums.length > 0 ? (
          <div className="retro-grid">
            {filteredAlbums.map((album) => {
              const selected = String(album.id) === String(retro.selectedAlbumId);
              return (
                <article key={album.id} className={`retro-tile ${selected ? "selected" : ""}`}>
                  <div className="retro-cover-wrap">
                    {album.cover_url ? (
                      <img src={album.cover_url} alt={`${album.title} cover`} className="retro-tile-cover" />
                    ) : null}
                  </div>
                  <div className="retro-tile-content">
                    <h3>{album.title}</h3>
                    <p>{album.artist}</p>
                    <small>{album.song_count || 0} tracks</small>
                    <p className="retro-match">{album.match_percent || 0}% Match</p>
                    {album.reason ? <p className="retro-why">Why: {album.reason}</p> : null}
                  </div>
                  <button className="btn btn-secondary" type="button" onClick={() => openRetroVote(album.id)}>
                    {selected ? "Continue Voting" : "Vote This Album"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </>
  );
}
