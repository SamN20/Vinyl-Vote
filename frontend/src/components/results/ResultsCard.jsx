import "./ResultsCard.css";

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "N/A";
  }
  return Number(value).toFixed(2);
}

function getDistributionPercentages(distribution = []) {
  const total = distribution.reduce((sum, value) => sum + Number(value || 0), 0);
  if (!total) {
    return distribution.map(() => 0);
  }

  return distribution.map((value) => Math.round((Number(value || 0) / total) * 100));
}

function DeltaBadge({ userScore, avgScore }) {
  if (userScore === null || userScore === undefined || avgScore === null || avgScore === undefined) {
    return null;
  }

  const delta = Number(userScore) - Number(avgScore);
  const deltaAbs = Math.abs(delta);
  if (deltaAbs < 0.1) {
    return <span className="delta-badge neutral">0.0</span>;
  }

  const sign = delta > 0 ? "+" : "";
  const variant = delta >= 1 ? "pos" : delta <= -1 ? "neg" : "neutral";
  return <span className={`delta-badge ${variant}`}>{`${sign}${delta.toFixed(1)}`}</span>;
}

export default function ResultsCard({ payload }) {
  const album = payload?.album || {};
  const summary = payload?.summary || {};
  const songs = payload?.songs || [];

  return (
    <>
      <section className="card results-album-card">
        {album.cover_url ? <img src={album.cover_url} alt={`${album.title} cover`} className="results-album-cover" /> : null}
        <div className="results-meta">
          <p className="results-kicker">Album Recap</p>
          <h2>{album.title || "Weekly Results"}</h2>
          <p className="results-artist">{album.artist || "Unknown Artist"}</p>

          <div className="results-kpi-grid">
            <article className="results-kpi">
              <p className="kpi-label">Average Song Rating</p>
              <p className="kpi-value">{formatScore(summary.avg_song_score)} / 5</p>
            </article>
            <article className="results-kpi">
              <p className="kpi-label">Average Album Score</p>
              <p className="kpi-value">{formatScore(summary.avg_album_score)} / 5</p>
            </article>
            <article className="results-kpi">
              <p className="kpi-label">Total Voters</p>
              <p className="kpi-value">{summary.voter_count || 0}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="card results-table-card">
        <h3>Track Ratings</h3>
        <div className="results-table-wrapper">
          <table className="results-table">
            <thead>
              <tr>
                <th>Track</th>
                <th>Title</th>
                <th>Group Avg</th>
                <th className="spark-col">Dist</th>
                <th>Your Rating</th>
                <th>Votes</th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song) => {
                const percentages = getDistributionPercentages(song.distribution || [0, 0, 0, 0, 0]);
                return (
                  <tr key={song.id} className={song.ignored ? "ignored-song-row" : ""}>
                    <td>{song.track_number || "-"}</td>
                    <td className="results-song-title">
                      {song.title}
                      {song.ignored ? <span className="ignored-badge">IGNORED</span> : null}
                    </td>
                    <td>
                      {song.ignored ? (
                        <span className="muted-label">Excluded</span>
                      ) : song.avg_score !== null && song.avg_score !== undefined ? (
                        <span className="song-rating-badge">{Number(song.avg_score).toFixed(2)}</span>
                      ) : (
                        <span className="muted-label">N/A</span>
                      )}
                    </td>
                    <td className="spark-col">
                      {song.ignored ? (
                        <span className="muted-label">-</span>
                      ) : (
                        <div className="sparkline" aria-label="Score distribution">
                          {percentages.map((value, index) => (
                            <span
                              key={`${song.id}-${index}`}
                              className="spark-bar"
                              style={{ height: `${Math.max(10, value)}%` }}
                              title={`${index + 1} star: ${song.distribution[index] || 0}`}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {song.ignored ? (
                        <span className="muted-label">Not counted</span>
                      ) : song.user_score !== null && song.user_score !== undefined ? (
                        <>
                          <span className="user-rating-badge">{Number(song.user_score).toFixed(1)}</span>
                          <DeltaBadge userScore={song.user_score} avgScore={song.avg_score} />
                        </>
                      ) : (
                        <span className="muted-label">Not rated</span>
                      )}
                    </td>
                    <td>{song.vote_count || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
