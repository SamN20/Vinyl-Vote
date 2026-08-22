import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getLeaderboardNeedleDrop } from "../api";
import LeaderboardPagination from "../components/common/LeaderboardPagination";
import LeaderboardTable from "../components/common/LeaderboardTable";
import LeaderboardTableSkeleton from "../components/common/LeaderboardTableSkeleton";
import LeaderboardToolbar from "../components/common/LeaderboardToolbar";
import StatusCard from "../components/common/StatusCard";
import StreamingLinks from "../components/common/StreamingLinks";
import { useLeaderboardCollection } from "../hooks/useLeaderboardCollection";
import "./LeaderboardPages.css";

function percent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

export default function NeedleDropLeaderboardPage() {
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
    routePath: "/needle-drop-leaderboard",
    fetcher: getLeaderboardNeedleDrop,
    defaults: {
      page: 1,
      per_page: 50,
      q: "",
      sort_by: "date",
      sort_dir: "desc",
    },
  });

  const [searchDraft, setSearchDraft] = useState(query.q || "");
  const [sortDraft, setSortDraft] = useState(query.sort_by || "date");

  useEffect(() => {
    setSearchDraft(query.q || "");
    setSortDraft(query.sort_by || "date");
  }, [query.q, query.sort_by]);

  function applyFilters() {
    updateQuery({ q: searchDraft, sort_by: sortDraft }, { resetPage: true });
  }

  function resetFilters() {
    setSearchDraft("");
    setSortDraft("date");
    resetQuery();
  }

  const columns = useMemo(
    () => [
      {
        key: "date",
        label: "Date",
        width: "128px",
        sortable: true,
        sortKey: "date",
        render: (row) => <strong>{row.date}</strong>,
      },
      {
        key: "song",
        label: "Daily Song",
        width: "44%",
        sortable: true,
        sortKey: "song",
        render: (row) => (
          <div className="song-cell needle-daily-song-cell">
            {row.song?.album?.cover_url ? (
              <img
                className="leaderboard-thumb needle-daily-cover"
                src={row.song.album.cover_url}
                alt={`${row.song.album.title || row.song.title} cover`}
                width="52"
                height="52"
                loading="lazy"
              />
            ) : null}
            <div className="song-cell-meta">
              <p className="song-title">{row.song?.title}</p>
              <p className="muted-text">{row.song?.album?.artist} · {row.song?.album?.title}</p>
              <StreamingLinks
                spotifyUrl={row.song?.spotify_url}
                appleUrl={row.song?.apple_url}
                youtubeUrl={row.song?.youtube_url}
                mode="icons"
              />
            </div>
          </div>
        ),
      },
      {
        key: "players",
        label: "Players",
        sortable: true,
        sortKey: "rounds",
        align: "right",
      },
      {
        key: "win_rate",
        label: "Win Rate",
        sortable: true,
        sortKey: "win_rate",
        align: "right",
        render: (row) => percent(row.win_rate),
      },
      {
        key: "avg_win_attempt",
        label: "Avg Solve",
        sortable: true,
        sortKey: "avg_win_attempt",
        align: "right",
        render: (row) => row.avg_win_attempt ? `${row.avg_win_attempt}` : "—",
      },
      {
        key: "wrong_guesses",
        label: "Wrong",
        sortable: true,
        sortKey: "wrong_guesses",
        align: "right",
      },
      {
        key: "skips",
        label: "More Clips",
        sortable: true,
        sortKey: "skips",
        align: "right",
      },
      {
        key: "artist_recognitions",
        label: "Artist Hits",
        sortable: true,
        sortKey: "artist_recognitions",
        align: "right",
      },
    ],
    [],
  );

  return (
    <>
      <section className="hero leaderboard-hero-row">
        <div>
          <p className="eyebrow">Needle Drop</p>
          <h1>Daily Archive</h1>
          <p className="subtitle">Past Daily songs and spoiler-safe community results after each Toronto day expires.</p>
        </div>
        <Link className="btn btn-primary" to="/needle-drop">Play Needle Drop</Link>
      </section>

      <LeaderboardToolbar
        title="Archive Controls"
        subtitle="Search previous Daily songs, artists, albums, or dates."
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onApply={applyFilters}
        onReset={resetFilters}
        searchPlaceholder="Search song, artist, album, or date"
      >
        <label className="toolbar-filter-field">
          <span className="toolbar-filter-label">Sort By</span>
          <select
            className="toolbar-filter-select"
            value={sortDraft}
            onChange={(event) => setSortDraft(event.target.value)}
          >
            <option value="date">Date</option>
            <option value="song">Song</option>
            <option value="artist">Artist</option>
            <option value="rounds">Players</option>
            <option value="win_rate">Win Rate</option>
            <option value="avg_win_attempt">Avg Solve</option>
            <option value="skips">More Clips</option>
            <option value="artist_recognitions">Artist Hits</option>
          </select>
        </label>
      </LeaderboardToolbar>

      {state === "loading" ? <LeaderboardTableSkeleton /> : null}
      {state === "error" ? <StatusCard title="Could not load Daily archive" message={error} variant="error" /> : null}

      {state === "ready" || state === "empty" ? (
        <section className="card leaderboard-card needle-drop-board">
          <LeaderboardTable
            columns={columns}
            rows={items}
            rowKey="id"
            sortBy={query.sort_by}
            sortDir={query.sort_dir}
            onSort={toggleSort}
            emptyMessage="No expired Needle Drop Dailies yet."
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
