import { legacyPageHref } from "../../api";

function formatScore(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }
  return Number(value).toFixed(1);
}

export default function ProfileAlbumHistory({ albumVotes, search, onSearchChange }) {
  const desktopColumns = [[], []];
  albumVotes.forEach((item, index) => {
    desktopColumns[index % 2].push(item);
  });

  function renderAlbumCard(item) {
    const voteCardHref = item.vote_card_href?.startsWith("http")
      ? item.vote_card_href
      : legacyPageHref(item.vote_card_href || "");

    return (
      <article key={item.album.id} className="profile-history-card">
        <div className="profile-history-top">
          {item.album.cover_url ? (
            <img
              src={item.album.cover_url}
              alt={`${item.album.title} cover`}
              width="88"
              height="88"
              loading="lazy"
            />
          ) : (
            <div className="profile-history-fallback">No Cover</div>
          )}
          <div>
            <h3>
              <a href={item.results_href}>{item.album.title}</a>
            </h3>
            <p>{item.album.artist}</p>
            <p>Your album score: <strong>{formatScore(item.album_score)}</strong></p>
            <p>Your average song score: <strong>{formatScore(item.song_score)}</strong></p>
          </div>
        </div>

        <div className="profile-history-table-wrap">
          <table className="profile-history-table">
            <thead>
              <tr>
                <th>Track</th>
                <th>Title</th>
                <th>Your Rating</th>
              </tr>
            </thead>
            <tbody>
              {item.songs.map((song) => (
                <tr key={song.id}>
                  <td>{song.track_number || "—"}</td>
                  <td>{song.title}</td>
                  <td>{song.user_rating === null || song.user_rating === undefined ? "N/A" : song.user_rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="profile-history-actions">
          <a className="btn btn-secondary" href={item.results_href}>View Results</a>
          <a className="btn btn-ghost" href={voteCardHref} target="_blank" rel="noopener noreferrer">Download Vote Card</a>
        </div>
      </article>
    );
  }

  return (
    <section className="profile-section card">
      <div className="profile-history-header">
        <div>
          <h2>Your Previous Votes</h2>
          <p className="profile-section-subtitle">Search by album or artist to quickly revisit your ratings.</p>
        </div>
        <input
          className="profile-search-input"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search albums or artists"
          aria-label="Search previous votes"
        />
      </div>

      {!albumVotes.length ? (
        <p className="empty-text">No matching albums found.</p>
      ) : (
        <>
          <div className="profile-history-grid profile-history-grid-desktop">
            {desktopColumns.map((column, columnIndex) => (
              <div key={`column-${columnIndex}`} className="profile-history-column">
                {column.map((item) => renderAlbumCard(item))}
              </div>
            ))}
          </div>

          <div className="profile-history-grid-mobile">
            {albumVotes.map((item) => renderAlbumCard(item))}
          </div>
        </>
      )}
    </section>
  );
}