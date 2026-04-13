import { useState } from "react";
import "./AdditionalInsights.css";

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function StarDistributionChart({ distribution, isOpen }) {
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
              <div
                className="insight-bar-fill"
                style={{
                  "--bar-width": `${isOpen ? percent : 0}%`,
                  "--bar-delay": isOpen ? `${index * 55}ms` : `${(labels.length - 1 - index) * 45}ms`,
                }}
              />
            </div>
            <span className="insight-value">{count}</span>
            <span className="insight-percent">{percent}%</span>
          </div>
        );
      })}
    </div>
  );
}

function TopTracksChart({ songs, isOpen }) {
  const ranked = [...songs]
    .filter((song) => !song.ignored && song.avg_score !== null && song.avg_score !== undefined)
    .sort((a, b) => safeNumber(b.avg_score) - safeNumber(a.avg_score))
    .slice(0, 5);

  return (
    <div className="insight-chart" role="img" aria-label="Top track average ratings">
      {ranked.length === 0 ? (
        <p className="empty-text">No ranked tracks available yet.</p>
      ) : (
        ranked.map((song, rankIndex) => {
          const score = safeNumber(song.avg_score);
          const percent = Math.round((score / 5) * 100);
          const showFullTitleOnHover = (song.title || "").length > 20;
          return (
            <div key={song.id} className="insight-row">
              <span
                className="insight-label track-label"
                title={showFullTitleOnHover ? song.title : undefined}
              >
                {song.title}
              </span>
              <div className="insight-bar-track">
                <div
                  className="insight-bar-fill accent"
                  style={{
                    "--bar-width": `${isOpen ? percent : 0}%`,
                    "--bar-delay": isOpen ? `${Math.max(80, rankIndex * 70)}ms` : `${Math.max(40, (ranked.length - 1 - rankIndex) * 55)}ms`,
                  }}
                />
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
  const [isOpen, setIsOpen] = useState(false);
  const summary = payload?.summary || {};
  const songs = payload?.songs || [];
  const distribution = summary.vote_distribution || [0, 0, 0, 0, 0];
  const totalVotes = distribution.reduce((sum, value) => sum + safeNumber(value), 0);
  const countedVotes = summary.counted_votes;
  const ignoredVotes = summary.ignored_votes;
  const ignoredSongs = songs.filter((song) => song.ignored).length;
  const countedSongs = Math.max(songs.length - ignoredSongs, 0);

  return (
    <section className={`card additional-insights ${isOpen ? "open" : ""}`}>
      <button
        type="button"
        className="insights-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen ? "true" : "false"}
        aria-controls="additional-insights-content"
      >
        <span className="summary-title">Additional Insights and Graphs</span>
        <span className="summary-meta">{totalVotes} total ratings captured</span>
        <span className="toggle-chevron" aria-hidden="true">▾</span>
      </button>

      <div
        id="additional-insights-content"
        className="insights-content"
        aria-hidden={isOpen ? "false" : "true"}
      >
        <div className="insights-grid">
        <section className="insight-panel" style={{ "--panel-delay-open": "0ms", "--panel-delay-close": "120ms" }}>
          <h3>Overall Star Distribution</h3>
          <StarDistributionChart distribution={distribution} isOpen={isOpen} />
        </section>

        <section className="insight-panel" style={{ "--panel-delay-open": "60ms", "--panel-delay-close": "60ms" }}>
          <h3>Top Rated Tracks</h3>
          <TopTracksChart songs={songs} isOpen={isOpen} />
        </section>

        <section className="insight-panel insight-kpis" style={{ "--panel-delay-open": "120ms", "--panel-delay-close": "0ms" }}>
          <h3>Quick Stats</h3>
          <div className="kpi-grid">
            <article>
              <p className="kpi-label">Votes Counted</p>
              <p className="kpi-value">{countedVotes ?? countedSongs}</p>
            </article>
            <article>
              <p className="kpi-label">Votes Ignored</p>
              <p className="kpi-value">{ignoredVotes ?? ignoredSongs}</p>
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
      </div>
    </section>
  );
}
