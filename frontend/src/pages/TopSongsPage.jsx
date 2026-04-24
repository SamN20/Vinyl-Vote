import { useEffect, useMemo, useState } from "react";
import { getLeaderboardSongs } from "../api";
import LeaderboardPagination from "../components/common/LeaderboardPagination";
import LeaderboardTableSkeleton from "../components/common/LeaderboardTableSkeleton";
import LeaderboardTable from "../components/common/LeaderboardTable";
import LeaderboardToolbar from "../components/common/LeaderboardToolbar";
import StatusCard from "../components/common/StatusCard";
import StreamingLinks from "../components/common/StreamingLinks";
import { useLeaderboardCollection } from "../hooks/useLeaderboardCollection";
import "./LeaderboardPages.css";

export default function TopSongsPage() {
  const {
    query,
    state,
    error,
    items,
    pagination,
    updateQuery,
    setPage,
    resetQuery,
    toggleSort,
    reload,
  } = useLeaderboardCollection({
    routePath: "/top-songs",
    fetcher: getLeaderboardSongs,
    defaults: {
      page: 1,
      per_page: 25,
      q: "",
      min_ratings: 3,
      sort_by: "avg_score",
      sort_dir: "desc",
    },
  });

  const [searchDraft, setSearchDraft] = useState(query.q || "");
  const [minRatingsDraft, setMinRatingsDraft] = useState(query.min_ratings || 3);
  const [sortDraft, setSortDraft] = useState(query.sort_by || "avg_score");

  useEffect(() => {
    setSearchDraft(query.q || "");
    setMinRatingsDraft(query.min_ratings || 3);
    setSortDraft(query.sort_by || "avg_score");
  }, [query.min_ratings, query.q, query.sort_by]);

  function applyFilters() {
    updateQuery(
      {
        q: searchDraft,
        min_ratings: minRatingsDraft,
        sort_by: sortDraft,
      },
      { resetPage: true },
    );
  }

  function resetFilters() {
    setSearchDraft("");
    setMinRatingsDraft(3);
    setSortDraft("avg_score");
    resetQuery();
  }

  const columns = useMemo(
    () => [
      {
        key: "rank",
        label: "#",
        width: "64px",
        sortable: false,
        render: (row) => <span className="rank-number">#{row.rank}</span>,
      },
      {
        key: "title",
        label: "Song",
        width: "44%",
        sortable: true,
        sortKey: "title",
        render: (row) => (
          <div className="song-cell">
            <img
              className="leaderboard-thumb"
              src={row.album?.cover_url || "/static/favicon_64x64.png"}
              alt={`${row.album?.title || row.title} cover`}
              loading="lazy"
            />
            <div className="song-cell-meta">
              <p className="song-title">{row.title}</p>
              <p className="muted-copy">{row.album?.title || "Unknown Album"}</p>
              <StreamingLinks
                spotifyUrl={row.spotify_url}
                appleUrl={row.apple_url}
                youtubeUrl={row.youtube_url}
                mode="icons"
              />
            </div>
          </div>
        ),
      },
      {
        key: "artist",
        label: "Artist",
        sortable: true,
        sortKey: "artist",
        render: (row) => (
          <a className="bare-link" href={`/top-artists?q=${encodeURIComponent(row.album?.artist || "")}`}>
            {row.album?.artist || "Unknown"}
          </a>
        ),
      },
      {
        key: "album",
        label: "Album",
        sortable: true,
        sortKey: "album",
        render: (row) => (
          row.album?.id ? <a className="bare-link" href={`/results/${row.album.id}`}>{row.album.title}</a> : "-"
        ),
      },
      {
        key: "avg_score",
        label: "Avg",
        sortable: true,
        sortKey: "avg_score",
        align: "right",
        render: (row) => (row.avg_score ?? "N/A"),
      },
      {
        key: "rating_count",
        label: "Ratings",
        sortable: true,
        sortKey: "rating_count",
        align: "right",
      },
    ],
    [],
  );

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Vinyl Vote V2</p>
        <h1>Top Songs</h1>
        <p className="subtitle">
          Explore highest-rated tracks with streaming links and configurable thresholds.
        </p>
      </section>

      <LeaderboardToolbar
        title="Song Filters"
        subtitle="Search by song, artist, or album and tune minimum ratings."
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onApply={applyFilters}
        onReset={resetFilters}
        searchPlaceholder="Search song, artist, album"
      >
        <label className="toolbar-filter-field">
          <span className="toolbar-filter-label">Min Ratings</span>
          <input
            className="toolbar-filter-input"
            type="number"
            min="1"
            value={minRatingsDraft}
            onChange={(event) => {
              const rawValue = Number(event.target.value);
              if (Number.isNaN(rawValue)) {
                return;
              }
              setMinRatingsDraft(Math.max(1, rawValue));
            }}
          />
        </label>

        <label className="toolbar-filter-field">
          <span className="toolbar-filter-label">Sort By</span>
          <select
            className="toolbar-filter-select"
            value={sortDraft}
            onChange={(event) => setSortDraft(event.target.value)}
          >
            <option value="avg_score">Average Score</option>
            <option value="rating_count">Ratings</option>
            <option value="title">Song Title</option>
            <option value="artist">Artist</option>
            <option value="album">Album</option>
          </select>
        </label>
      </LeaderboardToolbar>

      {state === "loading" ? <LeaderboardTableSkeleton /> : null}
      {state === "error" ? <StatusCard title="Could not load top songs" message={error} variant="error" /> : null}

      {state === "ready" || state === "empty" ? (
        <section className="card leaderboard-card top-songs-board">
          <LeaderboardTable
            columns={columns}
            rows={items}
            rowKey="id"
            sortBy={query.sort_by}
            sortDir={query.sort_dir}
            onSort={toggleSort}
            emptyMessage="No songs matched your filters."
          />
          <LeaderboardPagination pagination={pagination} onPageChange={setPage} />
        </section>
      ) : null}

      {state === "ready" || state === "empty" ? (
        <div className="button-row">
          <button type="button" className="btn btn-ghost" onClick={reload}>Refresh</button>
        </div>
      ) : null}
    </>
  );
}
