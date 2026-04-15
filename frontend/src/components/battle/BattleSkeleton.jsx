import "./BattleSkeleton.css";

export default function BattleSkeleton() {
  return (
    <div className="battle-skeleton" role="status" aria-live="polite" aria-label="Loading face-off pair">
      <div className="battle-skel-card">
        <div className="battle-skel-cover battle-skel-shimmer" />
        <div className="battle-skel-meta">
          <div className="battle-skel-title battle-skel-shimmer" />
          <div className="battle-skel-artist battle-skel-shimmer" />
          <div className="battle-skel-links">
            <div className="battle-skel-chip battle-skel-shimmer" />
            <div className="battle-skel-chip battle-skel-shimmer" />
            <div className="battle-skel-chip battle-skel-shimmer" />
          </div>
          <div className="battle-skel-embed battle-skel-shimmer" />
        </div>
      </div>

      <div className="vs-skel-badge battle-skel-shimmer" aria-hidden="true">VS</div>

      <div className="battle-skel-card">
        <div className="battle-skel-cover battle-skel-shimmer" />
        <div className="battle-skel-meta">
          <div className="battle-skel-title battle-skel-shimmer" />
          <div className="battle-skel-artist battle-skel-shimmer" />
          <div className="battle-skel-links">
            <div className="battle-skel-chip battle-skel-shimmer" />
            <div className="battle-skel-chip battle-skel-shimmer" />
            <div className="battle-skel-chip battle-skel-shimmer" />
          </div>
          <div className="battle-skel-embed battle-skel-shimmer" />
        </div>
      </div>
    </div>
  );
}
