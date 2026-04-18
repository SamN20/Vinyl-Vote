export default function ProfileSkeleton() {
  return (
    <section className="card profile-skeleton" aria-hidden="true">
      <div className="profile-skeleton-header">
        <div className="profile-skeleton-avatar" />
        <div className="profile-skeleton-lines">
          <div className="profile-skeleton-line long" />
          <div className="profile-skeleton-line medium" />
          <div className="profile-skeleton-line short" />
        </div>
      </div>

      <div className="profile-skeleton-grid">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="profile-skeleton-tile" />
        ))}
      </div>

      <div className="profile-skeleton-chart" />

      <div className="profile-skeleton-grid">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`album-${index}`} className="profile-skeleton-history" />
        ))}
      </div>
    </section>
  );
}