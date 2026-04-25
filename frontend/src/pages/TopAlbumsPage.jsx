import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getLeaderboardAlbums } from "../api";
import LeaderboardPagination from "../components/common/LeaderboardPagination";
import LeaderboardTableSkeleton from "../components/common/LeaderboardTableSkeleton";
import LeaderboardTable from "../components/common/LeaderboardTable";
import LeaderboardToolbar from "../components/common/LeaderboardToolbar";
import StatusCard from "../components/common/StatusCard";
import { useLeaderboardCollection } from "../hooks/useLeaderboardCollection";
import "./LeaderboardPages.css";

export default function TopAlbumsPage() {
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
    routePath: "/top-albums",
    fetcher: getLeaderboardAlbums,
    defaults: {
      page: 1,
      per_page: 25,
      q: "",
      sort_by: "avg_song_score",
      sort_dir: "desc",
    },
  });

  const [searchDraft, setSearchDraft] = useState(query.q || "");
  const [sortDraft, setSortDraft] = useState(query.sort_by || "avg_song_score");

  useEffect(() => {
    setSearchDraft(query.q || "");
    setSortDraft(query.sort_by || "avg_song_score");
  }, [query.q, query.sort_by]);

  function applyFilters() {
    updateQuery(
      {
        q: searchDraft,
        sort_by: sortDraft,
      },
      { resetPage: true },
    );
  }

  function resetFilters() {
    setSearchDraft("");
    setSortDraft("avg_song_score");
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
        key: "cover_url",
        label: "Cover",
        width: "72px",
        sortable: false,
        render: (row) => (
          <img
            className="leaderboard-thumb"
            src={row.cover_url || "/static/favicon_64x64.png"}
            alt={`${row.title} cover`}
            loading="lazy"
          />
        ),
      },
      {
        key: "title",
        label: "Album",
        sortable: true,
        sortKey: "title",
        render: (row) => (
          <div className="album-cell">
            <Link className="bare-link" to={`/results/${row.id}`}>{row.title}</Link>
            <p className="muted-copy">{row.artist}</p>
          </div>
        ),
      },
      {
        key: "release_date",
        label: "Release",
        sortable: false,
        render: (row) => row.release_date || "-",
      },
      {
        key: "avg_song_score",
        label: "Avg Song",
        sortable: true,
        sortKey: "avg_song_score",
        align: "right",
        render: (row) => (row.avg_song_score ?? "N/A"),
      },
      {
        key: "avg_album_score",
        label: "Avg Album",
        sortable: true,
        sortKey: "avg_album_score",
        align: "right",
        render: (row) => (row.avg_album_score ?? "N/A"),
      },
      {
        key: "vote_count",
        label: "Votes",
        sortable: true,
        sortKey: "vote_count",
        align: "right",
      },
    ],
    [],
  );

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Vinyl Vote</p>
        <h1>Top Albums</h1>
        <p className="subtitle">
          Explore all-time album rankings with server-side search, sort, and pagination.
        </p>
      </section>

      <LeaderboardToolbar
        title="Album Filters"
        subtitle="Search by title or artist and choose the ranking metric."
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onApply={applyFilters}
        onReset={resetFilters}
        searchPlaceholder="Search albums or artists"
      >
        <label className="toolbar-filter-field">

          <select
            className="toolbar-filter-select"
            value={sortDraft}
            onChange={(event) => setSortDraft(event.target.value)}
          >
            <option value="avg_song_score">Avg Song Score</option>
            <option value="avg_album_score">Avg Album Score</option>
            <option value="vote_count">Vote Count</option>
            <option value="title">Album Title</option>
            <option value="artist">Artist</option>
          </select>
        </label>
      </LeaderboardToolbar>

      {state === "loading" ? <LeaderboardTableSkeleton /> : null}
      {state === "error" ? <StatusCard title="Could not load top albums" message={error} variant="error" /> : null}

      {state === "ready" || state === "empty" ? (
        <section className="card leaderboard-card">
          <LeaderboardTable
            columns={columns}
            rows={items}
            rowKey="id"
            sortBy={query.sort_by}
            sortDir={query.sort_dir}
            onSort={toggleSort}
            emptyMessage="No albums matched your filters."
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
