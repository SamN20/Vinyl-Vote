import { useEffect, useMemo, useState } from "react";
import {
  getCurrentAlbum,
  legacyLoginHref,
  oauthLoginHref,
  sessionCheck,
  submitVotes,
} from "./api";

function formatVoteEnd(value) {
  if (!value) {
    return "No vote deadline is currently set.";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function readScore(song, songVotes) {
  const byPayload = song?.score;
  if (byPayload !== undefined && byPayload !== null && byPayload !== "") {
    return String(byPayload);
  }

  const byUserMap = songVotes?.[String(song.id)];
  if (byUserMap !== undefined && byUserMap !== null && byUserMap !== "") {
    return String(byUserMap);
  }

  return "";
}

function App() {
  const [sessionState, setSessionState] = useState("loading");
  const [albumState, setAlbumState] = useState("idle");
  const [albumPayload, setAlbumPayload] = useState(null);
  const [songScores, setSongScores] = useState({});
  const [albumScore, setAlbumScore] = useState("");
  const [submitState, setSubmitState] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const songs = useMemo(() => albumPayload?.album?.songs || [], [albumPayload]);

  useEffect(() => {
    async function bootstrap() {
      setError("");
      try {
        const session = await sessionCheck();
        if (!session.authenticated) {
          setSessionState("anonymous");
          setAlbumState("idle");
          return;
        }

        setSessionState("authenticated");
        await loadAlbum();
      } catch (loadError) {
        setSessionState("error");
        setError(loadError.message || "Failed to validate session.");
      }
    }

    bootstrap();
  }, []);

  async function loadAlbum() {
    setAlbumState("loading");
    setFeedback("");
    setError("");

    try {
      const payload = await getCurrentAlbum();
      setAlbumPayload(payload);

      const nextScores = {};
      const songVotes = payload?.user?.song_votes || {};
      for (const song of payload?.album?.songs || []) {
        nextScores[song.id] = readScore(song, songVotes);
      }
      setSongScores(nextScores);

      const initialAlbumScore = payload?.user?.album_score;
      setAlbumScore(initialAlbumScore === null || initialAlbumScore === undefined ? "" : String(initialAlbumScore));

      setAlbumState("ready");
    } catch (loadError) {
      const status = loadError.status;
      if (status === 404) {
        setAlbumState("empty");
        setError(loadError.message || "No current album is available right now.");
      } else {
        setAlbumState("error");
        setError(loadError.message || "Failed to load the active album.");
      }
    }
  }

  function updateSongScore(songId, value) {
    setSongScores((prev) => ({
      ...prev,
      [songId]: value,
    }));
  }

  function buildVotePayload() {
    const compactSongScores = {};

    for (const song of songs) {
      const raw = songScores[song.id];
      if (raw === undefined || raw === null || raw === "") {
        continue;
      }

      const numeric = Number(raw);
      if (Number.isNaN(numeric) || numeric < 1 || numeric > 5) {
        throw new Error(`Song \"${song.title}\" needs a score between 1 and 5.`);
      }
      compactSongScores[String(song.id)] = numeric;
    }

    const payload = { song_scores: compactSongScores };

    if (albumScore !== "") {
      const numericAlbumScore = Number(albumScore);
      if (Number.isNaN(numericAlbumScore) || numericAlbumScore < 1 || numericAlbumScore > 5) {
        throw new Error("Album score must be between 1 and 5.");
      }
      payload.album_score = numericAlbumScore;
    }

    return payload;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setFeedback("");

    let payload;
    try {
      payload = buildVotePayload();
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setSubmitState("saving");
    try {
      const result = await submitVotes(payload);
      setAlbumPayload(result);

      const nextScores = {};
      const savedVotes = result?.user?.song_votes || {};
      for (const song of result?.album?.songs || []) {
        nextScores[song.id] = readScore(song, savedVotes);
      }
      setSongScores(nextScores);
      setAlbumScore(result?.user?.album_score === null || result?.user?.album_score === undefined ? "" : String(result.user.album_score));

      setFeedback(result.message || "Votes saved.");
      setSubmitState("saved");
    } catch (saveError) {
      setSubmitState("error");
      setError(saveError.message || "Failed to save your votes.");
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Vinyl Vote V2</p>
        <h1>Vote Flow Migration</h1>
        <p className="subtitle">
          This screen is wired to the versioned API and KeyN session flow. It is the first
          production-facing V2 slice for authenticated voting.
        </p>
      </section>

      {sessionState === "loading" && (
        <section className="card status-card">
          <p>Checking your session...</p>
        </section>
      )}

      {sessionState === "error" && (
        <section className="card status-card error-card">
          <h2>Session check failed</h2>
          <p>{error || "Could not validate your session."}</p>
        </section>
      )}

      {sessionState === "anonymous" && (
        <section className="card auth-card">
          <h2>Sign in to vote</h2>
          <p>
            Vinyl Vote V2 uses KeyN as the default authentication flow. If you are still on a
            legacy account, you can use the fallback login route.
          </p>
          <div className="button-row">
            <a className="btn btn-primary" href={oauthLoginHref()}>
              Continue with KeyN
            </a>
            <a className="btn btn-secondary" href={legacyLoginHref()}>
              Legacy Login
            </a>
          </div>
        </section>
      )}

      {sessionState === "authenticated" && (
        <section className="card vote-card">
          <header className="vote-header">
            <div>
              <h2>Current Album</h2>
              <p className="vote-end">Voting closes: {formatVoteEnd(albumPayload?.vote_end)}</p>
            </div>
            <button className="btn btn-ghost" type="button" onClick={loadAlbum}>
              Refresh
            </button>
          </header>

          {albumState === "loading" && <p>Loading current album and your saved votes...</p>}

          {albumState === "error" && (
            <p className="error-text">{error || "Could not load voting data right now."}</p>
          )}

          {albumState === "empty" && (
            <p className="empty-text">{error || "No album is currently open for voting."}</p>
          )}

          {albumState === "ready" && albumPayload?.album && (
            <>
              <article className="album-panel">
                {albumPayload.album.cover_url && (
                  <img
                    src={albumPayload.album.cover_url}
                    alt={`${albumPayload.album.title} cover`}
                    className="cover"
                  />
                )}
                <div>
                  <h3>{albumPayload.album.title}</h3>
                  <p className="artist">{albumPayload.album.artist}</p>
                  <p className="meta">{songs.length} tracks</p>
                  {albumPayload.user?.has_voted && (
                    <span className="badge">You have already submitted votes</span>
                  )}
                </div>
              </article>

              <form className="vote-form" onSubmit={handleSubmit}>
                <div className="tracks-grid">
                  {songs.map((song) => (
                    <label className="track-row" key={song.id}>
                      <span className="track-name">
                        <strong>{song.track_number ? `${song.track_number}. ` : ""}</strong>
                        {song.title}
                      </span>
                      <input
                        className="score-input"
                        type="number"
                        min="1"
                        max="5"
                        step="0.5"
                        value={songScores[song.id] ?? ""}
                        onChange={(event) => updateSongScore(song.id, event.target.value)}
                        placeholder="1-5"
                      />
                    </label>
                  ))}
                </div>

                <label className="album-score-row">
                  <span>Album score</span>
                  <input
                    className="score-input"
                    type="number"
                    min="1"
                    max="5"
                    step="0.5"
                    value={albumScore}
                    onChange={(event) => setAlbumScore(event.target.value)}
                    placeholder="1-5"
                  />
                </label>

                {feedback && <p className="success-text">{feedback}</p>}
                {error && <p className="error-text">{error}</p>}

                <button className="btn btn-primary" type="submit" disabled={submitState === "saving"}>
                  {submitState === "saving" ? "Saving..." : "Save Votes"}
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
