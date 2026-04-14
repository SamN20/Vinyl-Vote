export default function LeaderboardTableSkeleton({ rows = 4 }) {
  return (
    <section className="card leaderboard-card" aria-hidden="true">
      <div className="table-skeleton">
        <div className="table-skeleton-head" />
        {Array.from({ length: rows }).map((_, index) => (
          <div key={`skeleton-row-${index}`} className="table-skeleton-row" />
        ))}
      </div>
    </section>
  );
}
