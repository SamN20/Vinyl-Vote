import { useEffect, useMemo, useRef, useState } from "react";
import { FaForwardStep, FaInfinity, FaPlay, FaShareNodes, FaVolumeHigh } from "react-icons/fa6";
import {
  createNeedleDropEndlessRound,
  getNeedleDropDaily,
  getNeedleDropEndlessOptions,
  searchNeedleDropCatalog,
  submitNeedleDropDailyAttempt,
  submitNeedleDropEndlessAttempt,
} from "../api";
import StatusCard from "../components/common/StatusCard";
import StreamingLinks from "../components/common/StreamingLinks";
import { getSpotifyTrackId } from "../utils/spotify";
import "./NeedleDropPage.css";

function clipLabel(seconds) {
  return `${seconds < 1 ? seconds.toFixed(2) : seconds}s`;
}

function ResultCard({ payload, shareText }) {
  const reveal = payload?.reveal;
  if (!reveal) return null;
  const song = reveal.song;
  const spotifyId = getSpotifyTrackId(song.spotify_url);
  const attempts = payload.attempts || [];
  const skips = attempts.filter((attempt) => attempt.result === "skipped").length;
  const wrongGuesses = attempts.filter((attempt) => attempt.result === "wrong").length;
  const artistHits = attempts.filter((attempt) => attempt.result === "artist_recognized").length;
  const won = payload.status === "won";
  const resultLabel = won
    ? `Solved in ${payload.attempts_used} of ${payload.max_attempts}.`
    : `Revealed after ${payload.attempts_used} of ${payload.max_attempts}.`;
  const attemptDetails = `${wrongGuesses} wrong guess${wrongGuesses === 1 ? "" : "es"} · ${skips} more clip${skips === 1 ? "" : "s"} · ${artistHits} artist hit${artistHits === 1 ? "" : "s"}`;

  return (
    <article className="needle-result">
      <div className="needle-result-cover">
        <img
          className="needle-result-art"
          src={song.album?.cover_url || "/static/favicon_180x180.png"}
          alt={`${song.album?.title || "Album"} cover`}
        />
      </div>
      <div className="needle-result-body">
        <div className="needle-result-heading">
          <p className="eyebrow">Answer</p>
          <h2>{song.title}</h2>
          <p className="needle-answer-meta">{song.artist} · {song.album?.title}</p>
        </div>
        <p className="needle-attempt-summary">{resultLabel} {attemptDetails}</p>
        <p className="needle-message">{reveal.user_context?.message}</p>
        <div className="needle-context-grid">
          <span>Song rating <strong>{reveal.user_context?.song_rating ?? "Not rated"}</strong></span>
          <span>Album rating <strong>{reveal.user_context?.album_rating ?? "Not rated"}</strong></span>
          <span>Face-Off <strong>{reveal.user_context?.faceoff?.wins || 0}W / {reveal.user_context?.faceoff?.losses || 0}L</strong></span>
        </div>
        <div className="needle-result-links">
          <StreamingLinks
            spotifyUrl={song.spotify_url}
            appleUrl={song.apple_url}
            youtubeUrl={song.youtube_url}
            mode="icons"
          />
        </div>
        <div className="needle-spotify-wrap">
          {spotifyId ? (
            <iframe
              className="needle-spotify"
              src={`https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0`}
              title={`${song.title} Spotify player`}
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            />
          ) : (
            <p className="needle-listen-empty">No Spotify embed is available for this track.</p>
          )}
        </div>
        {shareText ? (
          <button
            className="btn btn-secondary needle-share"
            type="button"
            onClick={() => navigator.clipboard?.writeText(shareText)}
          >
            <FaShareNodes aria-hidden="true" /> Copy Share
          </button>
        ) : null}
        {reveal.community_stats ? (
          <div className="needle-stats">
            <span>{reveal.community_stats.players} players</span>
            <span>{Math.round((reveal.community_stats.win_rate || 0) * 100)}% win rate</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function NeedleDropPage() {
  const [mode, setMode] = useState("daily");
  const [state, setState] = useState("loading");
  const [payload, setPayload] = useState(null);
  const [options, setOptions] = useState(null);
  const [filterKey, setFilterKey] = useState("everything");
  const [selectedGenre, setSelectedGenre] = useState("");
  const [genrePickerOpen, setGenrePickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const audioRef = useRef(null);
  const stopTimerRef = useRef(null);

  const isDone = payload?.status === "won" || payload?.status === "failed" || payload?.status === "revealed";
  const attempts = payload?.attempts || [];
  const lastAttemptClip = attempts.length ? attempts[attempts.length - 1]?.clip_length : null;
  const currentClip = isDone
    ? lastAttemptClip || payload?.clip_lengths?.[Math.max(0, (payload?.attempts_used || 1) - 1)] || payload?.clip_lengths?.[0] || 0.75
    : payload?.next_clip_length || payload?.clip_lengths?.[0] || 0.75;
  const activeClipIndex = payload?.clip_lengths?.findIndex((clip) => Number(clip) === Number(currentClip)) ?? -1;
  const offset = payload?.daily?.clip_offset_seconds || 0;

  useEffect(() => {
    loadDaily();
    getNeedleDropEndlessOptions().then(setOptions).catch(() => {});
    return () => clearTimeout(stopTimerRef.current);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const data = await searchNeedleDropCatalog(query);
        setSuggestions(data.items || []);
      } catch {
        setSuggestions([]);
      }
    }, 160);
    return () => clearTimeout(handle);
  }, [query]);

  async function loadDaily() {
    setMode("daily");
    setState("loading");
    setError("");
    try {
      setPayload(await getNeedleDropDaily());
      setState("ready");
    } catch (err) {
      setError(err.message || String(err));
      setState("error");
    }
  }

  async function startEndless(nextFilter = filterKey, nextGenre = selectedGenre) {
    setMode("endless");
    setState("loading");
    setError("");
    setFeedback("");
    setSelected(null);
    setQuery("");
    try {
      const body = { filter_key: nextFilter };
      if (nextFilter === "genre" && nextGenre) {
        body.genre = nextGenre;
      }
      setPayload(await createNeedleDropEndlessRound(body));
      setState("ready");
    } catch (err) {
      setError(err.message || String(err));
      setState("error");
    }
  }

  function choosePreset(preset) {
    if (preset.key === "genre") {
      setGenrePickerOpen(true);
      return;
    }
    setSelectedGenre("");
    setFilterKey(preset.key);
    startEndless(preset.key, "");
  }

  function chooseGenre(genre) {
    setSelectedGenre(genre);
    setFilterKey("genre");
    setGenrePickerOpen(false);
    startEndless("genre", genre);
  }

  function playClip() {
    const audio = audioRef.current;
    if (!audio) return;
    clearTimeout(stopTimerRef.current);
    audio.currentTime = offset;
    audio.play();
    stopTimerRef.current = setTimeout(() => {
      audio.pause();
      audio.currentTime = offset;
    }, currentClip * 1000);
  }

  async function submitAttempt(kind) {
    if (submitting || isDone) return;
    if (kind !== "skip" && !selected) {
      setFeedback("Pick a song or artist from the list first.");
      return;
    }
    setSubmitting(true);
    setFeedback("");
    try {
      const body = kind === "skip"
        ? { guess_type: "skip" }
        : selected.type === "artist"
          ? { guess_type: "artist", artist: selected.artist }
          : { guess_type: "song", song_id: selected.id };
      const data = mode === "daily"
        ? await submitNeedleDropDailyAttempt(body)
        : await submitNeedleDropEndlessAttempt({ ...body, session_id: payload.session_id });
      setPayload(data);
      setSelected(null);
      setQuery("");
      setSuggestions([]);
      const labels = {
        correct: "Correct.",
        artist_recognized: "Right artist. Track still needed.",
        wrong: "Not this one.",
        skipped: "Skipped. More of the clip unlocked.",
        failed: "That was the last attempt.",
        revealed: "Revealed.",
      };
      setFeedback(labels[data.result] || "");
    } catch (err) {
      setFeedback(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const presetButtons = useMemo(() => options?.presets || [], [options]);

  if (state === "error") {
    return <StatusCard title="Needle Drop is quiet" message={error} variant="error" />;
  }

  return (
    <section className="needle-page">
      <div className="needle-shell">
        <div className="needle-topbar">
          <div>
            <p className="eyebrow">Needle Drop</p>
            <h1>{mode === "daily" ? "Daily Drop" : "Endless Drop"}</h1>
            <p className="needle-subtitle">
              {mode === "daily"
                ? "Six tries. Same drop for everyone."
                : "Personalized rounds from the Vinyl Vote catalog."}
            </p>
          </div>
          <div className="needle-mode-tabs" role="tablist" aria-label="Needle Drop mode">
            <button className={mode === "daily" ? "active" : ""} onClick={loadDaily} type="button">Daily</button>
            <button className={mode === "endless" ? "active" : ""} onClick={() => startEndless()} type="button">
              <FaInfinity aria-hidden="true" /> Endless
            </button>
          </div>
        </div>

        {state === "loading" ? <StatusCard message="Dropping the needle..." /> : null}

        {state === "ready" ? (
          <>
            {mode === "endless" ? (
              <div className="needle-presets">
                {presetButtons.map((preset) => (
                  <button
                    key={preset.key}
                    className={filterKey === preset.key ? "active" : ""}
                    type="button"
                    onClick={() => choosePreset(preset)}
                  >
                    {preset.key === "genre" && selectedGenre ? `Genre: ${selectedGenre}` : preset.label}
                  </button>
                ))}
              </div>
            ) : null}

            {genrePickerOpen ? (
              <div className="needle-modal-backdrop" role="presentation" onMouseDown={() => setGenrePickerOpen(false)}>
                <div
                  className="needle-genre-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="needle-genre-title"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="needle-genre-heading">
                    <div>
                      <p className="eyebrow">Genre Challenge</p>
                      <h2 id="needle-genre-title">Pick a genre</h2>
                    </div>
                    <button type="button" onClick={() => setGenrePickerOpen(false)} aria-label="Close genre picker">Close</button>
                  </div>
                  <div className="needle-genre-grid">
                    {(options?.genres || []).map((genre) => (
                      <button
                        key={genre}
                        className={selectedGenre === genre ? "active" : ""}
                        type="button"
                        onClick={() => chooseGenre(genre)}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                  {!(options?.genres || []).length ? (
                    <p className="needle-genre-empty">No genres are available from the completed catalog yet.</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className={`needle-stage ${isDone ? "is-complete" : ""}`}>
              <div className="needle-player">
                <audio ref={audioRef} src={payload.preview_url} preload="metadata" />
                <div className="needle-player-meta">
                  <span>{mode === "daily" ? payload.daily?.date : "Endless round"}</span>
                  <strong>{payload.attempts_used} / {payload.max_attempts} attempts used</strong>
                </div>
                <button className="needle-play" type="button" onClick={playClip}>
                  <FaPlay aria-hidden="true" />
                  <span>{clipLabel(currentClip)}</span>
                </button>
                <div className="needle-progress" aria-label="Attempts">
                  {payload.clip_lengths.map((clip, index) => (
                    <span
                      key={clip}
                      className={index === activeClipIndex ? "current" : index < activeClipIndex ? "used" : ""}
                    >
                      {clipLabel(clip)}
                    </span>
                  ))}
                </div>
              </div>

              {!isDone ? (
                <div className="needle-guess">
                  <div>
                    <p className="eyebrow">Your call</p>
                    <label htmlFor="needle-guess-input">Guess</label>
                  </div>
                  <div className="needle-combobox">
                    <input
                      id="needle-guess-input"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setSelected(null);
                      }}
                      placeholder="Song or artist"
                      autoComplete="off"
                    />
                    {suggestions.length ? (
                      <div className="needle-suggestions">
                        {suggestions.map((item, index) => (
                          <button
                            type="button"
                            key={`${item.type}-${item.id || item.artist}-${index}`}
                            onClick={() => {
                              setSelected(item);
                              setQuery(item.label);
                              setSuggestions([]);
                            }}
                          >
                            <span>{item.label}</span>
                            <small>{item.type}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="needle-actions">
                    <button className="btn btn-primary" type="button" onClick={() => submitAttempt("guess")} disabled={submitting}>
                      <FaVolumeHigh aria-hidden="true" /> Guess
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => submitAttempt("skip")} disabled={submitting}>
                      <FaForwardStep aria-hidden="true" /> More Clip
                    </button>
                  </div>
                </div>
              ) : null}

              {isDone ? <ResultCard payload={payload} shareText={payload.share_text} /> : null}
            </div>

            {feedback && !isDone ? <p className="needle-feedback" role="status">{feedback}</p> : null}

            {mode === "endless" && isDone ? (
              <button className="btn btn-primary needle-next" type="button" onClick={() => startEndless()}>
                Next Drop
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
