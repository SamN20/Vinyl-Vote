export default function VoteCardLoadingSkeleton() {
  return (
    <section className="vote-loading-skeleton" role="status" aria-live="polite" aria-label="Loading current album and your saved votes">
      <article className="album-panel vote-skeleton-panel" aria-hidden="true">
        <div className="vote-skeleton-cover vote-skeleton-shimmer" />
        <div className="vote-skeleton-meta">
          <div className="vote-skeleton-line vote-skeleton-title vote-skeleton-shimmer" />
          <div className="vote-skeleton-line vote-skeleton-artist vote-skeleton-shimmer" />
          <div className="vote-skeleton-stats">
            <div className="vote-skeleton-stat vote-skeleton-shimmer" />
            <div className="vote-skeleton-stat vote-skeleton-shimmer" />
            <div className="vote-skeleton-stat vote-skeleton-shimmer" />
          </div>
          <div className="vote-skeleton-links">
            <div className="vote-skeleton-chip vote-skeleton-shimmer" />
            <div className="vote-skeleton-chip vote-skeleton-shimmer" />
            <div className="vote-skeleton-chip vote-skeleton-shimmer" />
          </div>
        </div>
      </article>

      <div className="vote-skeleton-form" aria-hidden="true">
        <div className="vote-skeleton-toggle vote-skeleton-shimmer" />
        <div className="vote-skeleton-track vote-skeleton-shimmer" />
        <div className="vote-skeleton-track vote-skeleton-shimmer" />
        <div className="vote-skeleton-track vote-skeleton-shimmer" />
        <div className="vote-skeleton-track vote-skeleton-shimmer" />
        <div className="vote-skeleton-track vote-skeleton-shimmer" />
        <div className="vote-skeleton-album-score vote-skeleton-shimmer" />
        <div className="vote-skeleton-button vote-skeleton-shimmer" />
      </div>

      <p className="muted vote-skeleton-loading-text">Loading current album and your saved votes...</p>
    </section>
  );
}
