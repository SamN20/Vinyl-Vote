import "./AdditionalInsights.css";

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function StarDistributionChart({ distribution }) {
  const labels = ["1 Star", "2 Star", "3 Star", "4 Star", "5 Star"];
  const total = distribution.reduce((sum, value) => sum + safeNumber(value), 0);

  return (
    <div className="insight-chart" role="img" aria-label="Overall star rating distribution">
      {labels.map((label, index) => {
        const count = safeNumber(distribution[index]);
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={label} className="insight-row">
            <span className="insight-label">{label}</span>
            <div className="insight-bar-track">
              <div className="insight-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="insight-value">{count}</span>
            <span className="insight-percent">{percent}%</span>
          </div>
        );
      })}
    </div>
  );
}

function TopTracksChart({ songs }) {
  const ranked = [...songs]
    .filter((song) => !song.ignored && song.avg_score !== null && song.avg_score !== undefined)
    .sort((a, b) => safeNumber(b.avg_score) - safeNumber(a.avg_score))
    .slice(0, 5);

  return (
    <div className="insight-chart" role="img" aria-label="Top track average ratings">
      {ranked.length === 0 ? (
        <p className="empty-text">No ranked tracks available yet.</p>
      ) : (
        ranked.map((song) => {
          const score = safeNumber(song.avg_score);
          const percent = Math.round((score / 5) * 100);
          return (
            <div key={song.id} className="insight-row">
              <span className="insight-label track-label">{song.title}</span>
              <div className="insight-bar-track">
                <div className="insight-bar-fill accent" style={{ width: `${percent}%` }} />
              </div>
              <span className="insight-value">{score.toFixed(2)}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function AdditionalInsights({ payload }) {
  const summary = payload?.summary || {};
  const songs = payload?.songs || [];
  const distribution = summary.vote_distribution || [0, 0, 0, 0, 0];
  const totalVotes = distribution.reduce((sum, value) => sum + safeNumber(value), 0);
  const ignoredSongs = songs.filter((song) => song.ignored).length;
  const countedSongs = Math.max(songs.length - ignoredSongs, 0);

  return (
    <details className="card additional-insights" open={false}>
      <summary>
        Additional Insights and Graphs
        <span className="summary-meta">{totalVotes} total ratings captured</span>
      </summary>

      <div className="insights-grid">
        <section className="insight-panel">
          <h3>Overall Star Distribution</h3>
          <StarDistributionChart distribution={distribution} />
        </section>

        <section className="insight-panel">
          <h3>Top Rated Tracks</h3>
          <TopTracksChart songs={songs} />
        </section>

        <section className="insight-panel insight-kpis">
          <h3>Quick Stats</h3>
          <div className="kpi-grid">
            <article>
              <p className="kpi-label">Tracks Counted</p>
              <p className="kpi-value">{countedSongs}</p>
            </article>
            <article>
              <p className="kpi-label">Tracks Ignored</p>
              <p className="kpi-value">{ignoredSongs}</p>
            </article>
            <article>
              <p className="kpi-label">Avg Song Score</p>
              <p className="kpi-value">{summary.avg_song_score ?? "N/A"}</p>
            </article>
            <article>
              <p className="kpi-label">Avg Album Score</p>
              <p className="kpi-value">{summary.avg_album_score ?? "N/A"}</p>
            </article>
          </div>
        </section>
      </div>
    </details>
  );
}
