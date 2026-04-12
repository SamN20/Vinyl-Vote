import { useMemo, useState } from "react";
import RetroVoteCard from "../components/retro/RetroVoteCard";
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

  function selectAlbum(albumId) {
    retro.setSelectedAlbumId(String(albumId));
    const card = document.getElementById("retro-vote-card");
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <>
      <section className="hero retro-hero">
        <p className="eyebrow">Vinyl Vote V2</p>
        <h1>Retro Vote Hub</h1>
        <p className="subtitle">
          Catch up on albums you missed. Pick a record from the grid, then submit retro votes below.
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
                  </div>
                  <button className="btn btn-secondary" type="button" onClick={() => selectAlbum(album.id)}>
                    {selected ? "Selected" : "Vote This Album"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <div id="retro-vote-card">
        <RetroVoteCard
          albumPayload={retro.albumPayload}
          albumScore={retro.albumScore}
          albums={retro.albums}
          albumsError={retro.albumsError}
          albumsState={retro.albumsState}
          albumState={retro.albumState}
          error={retro.error}
          feedback={retro.feedback}
          loadAlbums={retro.loadAlbums}
          saveVotes={retro.saveVotes}
          selectedAlbumId={retro.selectedAlbumId}
          setAlbumScore={retro.setAlbumScore}
          setSelectedAlbumId={retro.setSelectedAlbumId}
          setSongScore={retro.setSongScore}
          songScores={retro.songScores}
          songs={retro.songs}
          submitState={retro.submitState}
          title="Retro Album Voting"
          subtitle="Submit your retro scores for the selected missed album."
        />
      </div>
    </>
  );
}
