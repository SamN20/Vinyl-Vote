import { useEffect, useMemo, useState } from "react";
import {
  getSongRequests,
  searchSongRequestAlbums,
  submitSongRequest,
} from "../api";
import StatusCard from "../components/common/StatusCard";
import StreamingLinks from "../components/common/StreamingLinks";
import "./SongRequestsPage.css";

function formatRequestTime(timestamp) {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export default function SongRequestsPage() {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState("idle");
  const [searchError, setSearchError] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [requestsState, setRequestsState] = useState("loading");
  const [requestsError, setRequestsError] = useState(null);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ total: 0, fulfilled: 0, pending: 0 });
  const [submittingKey, setSubmittingKey] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setRequestsState("loading");
    setRequestsError(null);
    try {
      const payload = await getSongRequests();
      setRequests(payload.requests || []);
      setStats(payload.stats || { total: 0, fulfilled: 0, pending: 0 });
      setRequestsState((payload.requests || []).length ? "ready" : "empty");
    } catch (err) {
      setRequestsError(err.message || String(err));
      setRequestsState("error");
    }
  }

  async function onSearchSubmit(event) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSuccessMessage("");
    setSearchError(null);
    setSearchState("loading");

    try {
      const payload = await searchSongRequestAlbums(trimmed);
      const albums = payload.albums || [];
      setSearchResults(albums);
      setSearchState(albums.length ? "ready" : "empty");
    } catch (err) {
      setSearchError(err.message || String(err));
      setSearchState("error");
    }
  }

  async function onRequestAlbum(album) {
    const key = album.id || `${album.title}-${album.artist}`;
    setSubmittingKey(key);
    setSearchError(null);
    setSuccessMessage("");

    try {
      await submitSongRequest({
        title: album.title,
        artist: album.artist,
        spotify_id: album.id,
        cover_url: album.cover_url,
        release_date: album.release_date,
        spotify_url: album.spotify_url,
      });

      setSuccessMessage(`Requested "${album.title}" by ${album.artist}.`);
      setSearchResults([]);
      setSearchState("idle");
      setQuery("");
      await loadRequests();
    } catch (err) {
      setSearchError(err.message || String(err));
    } finally {
      setSubmittingKey(null);
    }
  }

  const requestCards = useMemo(
    () =>
      requests.map((req) => (
        <article key={req.id} className={`sr-request-card ${req.fulfilled ? "fulfilled" : "pending"}`}>
          {req.cover_url ? (
            <img className="sr-cover" src={req.cover_url} alt={`${req.title} cover`} loading="lazy" />
          ) : (
            <div className="sr-cover sr-cover-placeholder" aria-hidden="true">♪</div>
          )}

          <div className="sr-request-content">
            <h3>{req.title}</h3>
            <p className="sr-artist">{req.artist}</p>
            {req.release_date ? <p className="sr-meta">Released: {req.release_date}</p> : null}
            <p className="sr-meta">Requested: {formatRequestTime(req.timestamp)}</p>

            <div className="sr-request-footer">
              <span className={`sr-badge ${req.fulfilled ? "ok" : "wait"}`}>
                {req.fulfilled ? "Fulfilled" : "Pending"}
              </span>
              {req.spotify_url ? (
                <StreamingLinks spotifyUrl={req.spotify_url} mode="icons" />
              ) : null}
            </div>
          </div>
        </article>
      )),
    [requests],
  );

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Vinyl Vote</p>
        <h1>Album Requests</h1>
        <p className="subtitle">Search Spotify, submit requests, and track what has been fulfilled.</p>
      </section>

      <section className="card sr-search-card">
        <h2>Request an album</h2>
        <form className="sr-search-form" onSubmit={onSearchSubmit}>
          <label htmlFor="albumQuery">Search for an album</label>
          <div className="sr-search-row">
            <input
              id="albumQuery"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Blonde Frank Ocean"
              required
              aria-describedby="sr-query-help"
            />
            <button type="submit" className="btn btn-primary" disabled={searchState === "loading"}>
              {searchState === "loading" ? "Searching..." : "Search"}
            </button>
          </div>
          <p id="sr-query-help" className="sr-help">Pick the correct result below and submit it.</p>
        </form>
      </section>

      {successMessage ? <StatusCard title="Request sent" message={successMessage} /> : null}
      {searchState === "error" ? <StatusCard title="Search failed" message={searchError} variant="error" /> : null}

      {searchState === "ready" || searchState === "empty" ? (
        <section className="card sr-results-card">
          <h2>Search Results</h2>
          {searchState === "empty" ? (
            <p className="sr-empty">No albums found. Try a different search.</p>
          ) : (
            <div className="sr-results-grid">
              {searchResults.map((album) => {
                const key = album.id || `${album.title}-${album.artist}`;
                const isSubmitting = submittingKey === key;
                return (
                  <article key={key} className="sr-album-card">
                    {album.cover_url ? (
                      <img className="sr-cover" src={album.cover_url} alt={`${album.title} cover`} loading="lazy" />
                    ) : (
                      <div className="sr-cover sr-cover-placeholder" aria-hidden="true">♪</div>
                    )}
                    <h3>{album.title}</h3>
                    <p className="sr-artist">{album.artist}</p>
                    {album.release_date ? <p className="sr-meta">Released: {album.release_date}</p> : null}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!!submittingKey}
                      onClick={() => onRequestAlbum(album)}
                    >
                      {isSubmitting ? "Requesting..." : "Request this album"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <section className="card sr-stats-card">
        <h2>Your requests</h2>

        {requestsState === "loading" ? <p className="sr-empty">Loading your requests...</p> : null}
        {requestsState === "error" ? <StatusCard title="Could not load requests" message={requestsError} variant="error" /> : null}

        {requestsState === "ready" || requestsState === "empty" ? (
          <>
            <div className="sr-stats-row" aria-label="request stats">
              <div className="sr-stat">
                <span className="sr-stat-value">{stats.total}</span>
                <span className="sr-stat-label">Total</span>
              </div>
              <div className="sr-stat">
                <span className="sr-stat-value">{stats.fulfilled}</span>
                <span className="sr-stat-label">Fulfilled</span>
              </div>
              <div className="sr-stat">
                <span className="sr-stat-value">{stats.pending}</span>
                <span className="sr-stat-label">Pending</span>
              </div>
            </div>

            {requestsState === "empty" ? (
              <p className="sr-empty">You have not submitted any requests yet.</p>
            ) : (
              <div className="sr-requests-grid">{requestCards}</div>
            )}
          </>
        ) : null}
      </section>
    </>
  );
}
