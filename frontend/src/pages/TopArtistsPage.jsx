import { useEffect, useMemo, useState } from "react";
import {
  getLeaderboardArtistBio,
  getLeaderboardArtistTopSongs,
  getLeaderboardArtists,
} from "../api";
import LeaderboardPagination from "../components/common/LeaderboardPagination";
import LeaderboardTable from "../components/common/LeaderboardTable";
import LeaderboardToolbar from "../components/common/LeaderboardToolbar";
import StatusCard from "../components/common/StatusCard";
import StreamingLinks from "../components/common/StreamingLinks";
import { useLeaderboardCollection } from "../hooks/useLeaderboardCollection";
import { getSpotifyTrackId } from "../utils/spotify";
import "./LeaderboardPages.css";

function ArtistDetails({ details, isExpanded }) {
  if (!details && !isExpanded) {
    return null;
  }

  if (details?.state === "loading") {
    return (
      <div className="artist-details-skeleton" aria-hidden="true">
        <div className="skeleton-line skeleton-bio" />
        <div className="skeleton-line skeleton-bio short" />
        <div className="skeleton-line skeleton-track-head" />
        <div className="skeleton-line skeleton-track-embed" />
        <div className="skeleton-line skeleton-track-head" />
        <div className="skeleton-line skeleton-track-embed" />
      </div>
    );
  }

  if (details?.state === "error") {
    return <p className="error-text">Could not load artist details.</p>;
  }

  const songs = details?.songs || [];

  return (
    <div className="artist-details">
      <article className="artist-bio-card">
        <p className="artist-bio-label">Bio</p>
        <p className="artist-bio-text">{details?.bio || "No bio found."}</p>
      </article>

      <h4 className="artist-top-title">Top Tracks</h4>
      {songs.length ? (
        <ul className="artist-top-tracks">
          {songs.map((song, index) => (
            <li key={song.id} className="artist-track-item">
              <div className="artist-track-head">
                <div className="track-title-wrap">
                  <span className="track-index">#{index + 1}</span>
                  <span className="track-name">{song.title}</span>
                </div>
                <span className="track-stat-chip">{song.avg_score ?? "N/A"}★ · {song.rating_count || 0} ratings</span>
              </div>
              <div className="artist-track-links">
                <StreamingLinks
                  spotifyUrl={song.spotify_url}
                  appleUrl={song.apple_url}
                  youtubeUrl={song.youtube_url}
                />
              </div>
              {getSpotifyTrackId(song.spotify_url) ? (
                <iframe
                  className="track-embed"
                  src={`https://open.spotify.com/embed/track/${getSpotifyTrackId(song.spotify_url)}`}
                  loading="lazy"
                  title={`${song.title} Spotify preview`}
                  allow="encrypted-media"
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-copy">No top tracks available yet.</p>
      )}
    </div>
  );
}

export default function TopArtistsPage() {
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
    routePath: "/top-artists",
    fetcher: getLeaderboardArtists,
    defaults: {
      page: 1,
      per_page: 25,
      q: "",
      min_ratings: "",
      min_avg: "",
      sort_by: "avg_score",
      sort_dir: "desc",
    },
  });

  const [searchDraft, setSearchDraft] = useState(query.q || "");
  const [minRatingsDraft, setMinRatingsDraft] = useState(query.min_ratings || "");
  const [minAvgDraft, setMinAvgDraft] = useState(query.min_avg || "");
  const [expanded, setExpanded] = useState(() => new Set());
  const [detailsMap, setDetailsMap] = useState({});

  useEffect(() => {
    setSearchDraft(query.q || "");
    setMinRatingsDraft(query.min_ratings || "");
    setMinAvgDraft(query.min_avg || "");
  }, [query.min_avg, query.min_ratings, query.q]);

  async function loadDetails(artist) {
    setDetailsMap((prev) => ({
      ...prev,
      [artist]: { ...(prev[artist] || {}), state: "loading", bio: "", songs: [] },
    }));

    try {
      const [bio, songs] = await Promise.all([
        getLeaderboardArtistBio(artist),
        getLeaderboardArtistTopSongs(artist),
      ]);
      setDetailsMap((prev) => ({
        ...prev,
        [artist]: {
          state: "ready",
          bio: bio?.bio || "No bio found.",
          songs: songs?.items || [],
        },
      }));
    } catch {
      setDetailsMap((prev) => ({
        ...prev,
        [artist]: { ...(prev[artist] || {}), state: "error", bio: "", songs: [] },
      }));
    }
  }

  function toggleArtist(artist) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(artist)) {
        next.delete(artist);
        return next;
      }

      next.add(artist);
      if (!detailsMap[artist]) {
        loadDetails(artist);
      }
      return next;
    });
  }

  function applyFilters() {
    updateQuery(
      {
        q: searchDraft,
        min_ratings: minRatingsDraft,
        min_avg: minAvgDraft,
      },
      { resetPage: true },
    );
  }

  function resetFilters() {
    setSearchDraft("");
    setMinRatingsDraft("");
    setMinAvgDraft("");
    setExpanded(new Set());
    resetQuery();
  }

  const columns = useMemo(
    () => [
      {
        key: "rank",
        label: "Rank",
        width: "72px",
        sortable: false,
        render: (row) => (
          <span className={row.rank === 1 ? "rank-badge crown" : "rank-number"}>
            {row.rank === 1 ? "👑" : `#${row.rank}`}
          </span>
        ),
      },
      {
        key: "image_url",
        label: "Photo",
        width: "72px",
        sortable: false,
        render: (row) => (
          <img
            className="leaderboard-thumb"
            src={row.image_url || "/static/favicon_64x64.png"}
            alt={`${row.artist} photo`}
            width="46"
            height="46"
            loading="lazy"
          />
        ),
      },
      {
        key: "artist",
        label: "Artist",
        sortable: true,
        sortKey: "artist",
        render: (row) => (
          <div className="artist-row-btn">
            <span>{row.artist}</span>
            <span className="muted-copy">{expanded.has(row.artist) ? "Hide" : "View"} details</span>
          </div>
        ),
      },
      {
        key: "avg_score",
        label: "Avg Rating",
        sortable: true,
        sortKey: "avg_score",
        align: "right",
        render: (row) => row.avg_score?.toFixed ? row.avg_score.toFixed(2) : "N/A",
      },
      {
        key: "rating_count",
        label: "Ratings",
        sortable: true,
        sortKey: "rating_count",
        align: "right",
      },
    ],
    [expanded],
  );

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Vinyl Vote V2</p>
        <h1>Top Artists</h1>
        <p className="subtitle">
          Ranked artist leaderboard with filters, pagination, and expandable artist details.
        </p>
      </section>

      <LeaderboardToolbar
        title="Artist Filters"
        subtitle="Search and tune thresholds without leaving the page."
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onApply={applyFilters}
        onReset={resetFilters}
        searchPlaceholder="Search artist name"
      >
        <label className="toolbar-filter-field">
          <span className="toolbar-filter-label">Min Ratings</span>
          <input
            className="toolbar-filter-input"
            type="number"
            min="1"
            value={minRatingsDraft}
            onChange={(event) => setMinRatingsDraft(event.target.value)}
          />
        </label>

        <label className="toolbar-filter-field">
          <span className="toolbar-filter-label">Min Avg</span>
          <input
            className="toolbar-filter-input"
            type="number"
            step="0.1"
            min="1"
            max="5"
            value={minAvgDraft}
            onChange={(event) => setMinAvgDraft(event.target.value)}
          />
        </label>
      </LeaderboardToolbar>

      {state === "loading" ? (
        <section className="card leaderboard-card" aria-hidden="true">
          <div className="table-skeleton">
            <div className="table-skeleton-head" />
            <div className="table-skeleton-row" />
            <div className="table-skeleton-row" />
            <div className="table-skeleton-row" />
            <div className="table-skeleton-row" />
          </div>
        </section>
      ) : null}
      {state === "error" ? (
        <StatusCard title="Could not load artists" message={error} variant="error" />
      ) : null}

      {state === "ready" || state === "empty" ? (
        <section className="card leaderboard-card">
          <LeaderboardTable
            columns={columns}
            rows={items}
            rowKey="artist"
            sortBy={query.sort_by}
            sortDir={query.sort_dir}
            onSort={toggleSort}
            emptyMessage="No artists matched your filters."
            onRowClick={(row) => toggleArtist(row.artist)}
            expandedRowIds={expanded}
            renderExpandedRow={(row, isExpanded) => (
              <ArtistDetails details={detailsMap[row.artist]} isExpanded={isExpanded} />
            )}
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
