import "./LeaderboardToolbar.css";

export default function LeaderboardToolbar({
  title,
  subtitle,
  searchValue,
  onSearchChange,
  onApply,
  onReset,
  searchPlaceholder = "Search",
  children,
}) {
  function handleSubmit(event) {
    event.preventDefault();
    if (onApply) {
      onApply();
    }
  }

  return (
    <section className="card leaderboard-toolbar-card">
      {title ? <h2 className="leaderboard-toolbar-title">{title}</h2> : null}
      {subtitle ? <p className="leaderboard-toolbar-subtitle">{subtitle}</p> : null}

      <form className="leaderboard-toolbar" onSubmit={handleSubmit}>
        <label className="toolbar-search-wrap">
          <span className="sr-only">Search</span>
          <input
            className="toolbar-search"
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>

        {children ? <div className="toolbar-filters">{children}</div> : null}

        <div className="toolbar-actions">
          <button type="submit" className="btn btn-primary">Apply</button>
          <button type="button" className="btn btn-secondary" onClick={onReset}>Reset</button>
        </div>
      </form>
    </section>
  );
}
