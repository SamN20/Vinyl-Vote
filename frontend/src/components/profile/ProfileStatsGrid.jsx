function formatNumber(value) {
  if (value === null || value === undefined) {
    return "—";
  }
  return Number(value).toLocaleString();
}

function formatAverage(value) {
  if (value === null || value === undefined) {
    return "—";
  }
  return Number(value).toFixed(2);
}

export default function ProfileStatsGrid({ stats, streaks, extras, battleStats }) {
  const cards = [
    { label: "Albums Scored", value: formatNumber(stats?.total_albums_scored), hint: "Total album score submissions" },
    { label: "Songs Rated", value: formatNumber(stats?.total_song_votes), hint: "All submitted song ratings" },
    { label: "Avg Album Score", value: formatAverage(stats?.avg_album_score), hint: "Average of your album-level scores" },
    { label: "Avg Song Score", value: formatAverage(stats?.avg_song_score), hint: "Average of your song-level scores" },
    { label: "Current Streak", value: `${formatNumber(streaks?.current)} wk`, hint: "Consecutive completed weeks with on-time participation" },
    { label: "Longest Streak", value: `${formatNumber(streaks?.longest)} wk`, hint: "Best historical run of consecutive weeks" },
    { label: "Active Weeks", value: formatNumber(extras?.active_weeks), hint: "Past weeks with on-time participation" },
    { label: "Battles Fought", value: formatNumber(battleStats?.count), hint: "Face-Off rounds you judged" },
  ];

  return (
    <section className="profile-section card">
      <h2>Profile Stats</h2>
      <p className="profile-section-subtitle">Your participation snapshot across weekly voting and Face-Off rounds.</p>
      <div className="profile-stats-grid">
        {cards.map((card) => (
          <article key={card.label} className="profile-stat-card" title={card.hint}>
            <p className="profile-stat-label">{card.label}</p>
            <p className="profile-stat-value">{card.value}</p>
          </article>
        ))}
      </div>
      <p className="profile-microcopy">Last on-time vote: {extras?.last_on_time_vote || "—"}</p>
    </section>
  );
}