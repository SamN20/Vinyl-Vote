import { useEffect, useMemo, useState } from "react";
import { getLeaderboardBattle, legacyPageHref } from "../api";
import LeaderboardPagination from "../components/common/LeaderboardPagination";
import LeaderboardTableSkeleton from "../components/common/LeaderboardTableSkeleton";
import LeaderboardTable from "../components/common/LeaderboardTable";
import LeaderboardToolbar from "../components/common/LeaderboardToolbar";
import StatusCard from "../components/common/StatusCard";
import StreamingLinks from "../components/common/StreamingLinks";
import { useLeaderboardCollection } from "../hooks/useLeaderboardCollection";
import "./LeaderboardPages.css";

function rankBadge(rank) {
  if (rank === 1) {
    return <span className="rank-medal gold">1</span>;
  }
  if (rank === 2) {
    return <span className="rank-medal silver">2</span>;
  }
  if (rank === 3) {
    return <span className="rank-medal bronze">3</span>;
  }
  return <span className="rank-number">#{rank}</span>;
}

export default function FaceoffLeaderboardPage() {
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
    routePath: "/faceoff-leaderboard",
    fetcher: getLeaderboardBattle,
    defaults: {
      page: 1,
      per_page: 50,
      q: "",
      sort_by: "elo_rating",
      sort_dir: "desc",
    },
  });

  const [searchDraft, setSearchDraft] = useState(query.q || "");
  const [sortDraft, setSortDraft] = useState(query.sort_by || "elo_rating");

  useEffect(() => {
    setSearchDraft(query.q || "");
    setSortDraft(query.sort_by || "elo_rating");
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
    setSortDraft("elo_rating");
    resetQuery();
  }

  const columns = useMemo(
    () => [
      {
        key: "rank",
        label: "#",
        width: "76px",
        sortable: false,
        render: (row) => rankBadge(row.rank),
      },
      {
        key: "title",
        label: "Song",
        width: "52%",
        sortable: true,
        sortKey: "title",
        render: (row) => (
          <div className="song-cell faceoff-song-cell">
            {row.album?.cover_url ? (
              <img
                className="leaderboard-thumb faceoff-cover"
                src={row.album.cover_url}
                alt={`${row.album.title || row.title} cover`}
                width="46"
                height="46"
                loading="lazy"
              />
            ) : null}
            <div className="faceoff-song-meta">
              <div className="faceoff-title-row">
                <p className="song-title">{row.title}</p>
                {row.user_winner_count > 0 ? (
                  <span className="user-vote-chip">Voted {row.user_winner_count}x</span>
                ) : null}
              </div>
              <div className="faceoff-links-wrap">
                <StreamingLinks
                  spotifyUrl={row.spotify_url}
                  appleUrl={row.apple_url}
                  youtubeUrl={row.youtube_url}
                  mode="icons"
                />
              </div>
            </div>
          </div>
        ),
      },
      {
        key: "artist",
        label: "Artist",
        sortable: true,
        sortKey: "artist",
        width: "220px",
        render: (row) => (
          <a className="bare-link" href={`/top-artists?q=${encodeURIComponent(row.album?.artist || "")}`}>
            {row.album?.artist || "Unknown"}
          </a>
        ),
      },
      {
        key: "elo_rating",
        label: "Rating",
        sortable: true,
        sortKey: "elo_rating",
        width: "126px",
        align: "right",
        render: (row) => <span className="elo-value">{Math.round(row.elo_rating || 0)}</span>,
      },
      {
        key: "match_count",
        label: "Matches",
        sortable: true,
        sortKey: "match_count",
        width: "108px",
        align: "right",
      },
    ],
    [],
  );

  return (
    <>
      <section className="hero leaderboard-hero-row">
        <div>
          <p className="eyebrow">Vinyl Vote V2</p>
          <h1>Face-Off Leaderboard</h1>
          <p className="subtitle">Elo-based fan favorites ranked by battle outcomes.</p>
        </div>
        <a className="btn btn-primary" href="/battle">Play Face-Off</a>
      </section>

      <LeaderboardToolbar
        title="Leaderboard Controls"
        subtitle="Search songs or artists and change ranking sort."
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onApply={applyFilters}
        onReset={resetFilters}
        searchPlaceholder="Search song, artist, or album"
      >
        <label className="toolbar-filter-field">
          <span className="toolbar-filter-label">Sort By</span>
          <select
            className="toolbar-filter-select"
            value={sortDraft}
            onChange={(event) => setSortDraft(event.target.value)}
          >
            <option value="elo_rating">Rating</option>
            <option value="match_count">Matches</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
          </select>
        </label>
      </LeaderboardToolbar>

      {state === "loading" ? <LeaderboardTableSkeleton /> : null}
      {state === "error" ? (
        <StatusCard title="Could not load leaderboard" message={error} variant="error" />
      ) : null}

      {state === "ready" || state === "empty" ? (
        <section className="card leaderboard-card faceoff-board">
          <LeaderboardTable
            columns={columns}
            rows={items}
            rowKey="id"
            sortBy={query.sort_by}
            sortDir={query.sort_dir}
            onSort={toggleSort}
            rowClassName={() => "faceoff-row"}
            emptyMessage="No battle rankings yet. Play a face-off to generate rankings."
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
