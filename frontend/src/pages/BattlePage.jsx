import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getBattle, legacyPageHref, submitBattleVote } from "../api";
import StatusCard from "../components/common/StatusCard";
import BattleCard from "../components/battle/BattleCard";
import BattleSkeleton from "../components/battle/BattleSkeleton";
import "./BattlePage.css";

export default function BattlePage({ sessionState, theme }) {
  const [state, setState] = useState("loading");
  const [song1, setSong1] = useState(null);
  const [song2, setSong2] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const requestSeq = useRef(0);
  const canVote = state === "ready" && !!song1 && !!song2 && !submitting;

  useEffect(() => {
    loadPair();
  }, []);

  // Add preconnect hints to Spotify domains to reduce embed load time (reduces white flash)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const addPreconnect = (href) => {
      if (document.querySelector(`link[rel=\"preconnect\"][href=\"${href}\"]`)) return;
      const l = document.createElement("link");
      l.rel = "preconnect";
      l.href = href;
      l.crossOrigin = "anonymous";
      document.head.appendChild(l);
    };

    addPreconnect("https://open.spotify.com");
    addPreconnect("https://i.scdn.co");
  }, []);

  async function loadPair(options = {}) {
    const { force = false } = options;
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;

    setState("loading");
    setError(null);
    try {
      const payload = await getBattle({ force });
      if (seq !== requestSeq.current) {
        return;
      }
      setSong1(payload.song1);
      setSong2(payload.song2);
      setState("ready");
    } catch (err) {
      if (seq !== requestSeq.current) {
        return;
      }
      setError(err.message || String(err));
      setState("error");
    }
  }

  async function handleVote(winnerId, loserId) {
    if (submitting) return;
    if (!winnerId || !loserId) {
      setError("Battle pair is still loading. Please wait a moment and try again.");
      return;
    }
    if (winnerId === loserId) {
      setError("Invalid vote: winner and loser cannot be the same song.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const data = await submitBattleVote({ winner_id: winnerId, loser_id: loserId });
      setResult(data);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function closeResult() {
    setResult(null);
    loadPair({ force: true });
  }

  if (state === "error") return <StatusCard title="Could not load battle" message={error} variant="error" />;

  return (
    <section className="battle-card-page">
      <div className="battle-container">
        <div className="battle-arena">
          {state === "loading" ? (
            <BattleSkeleton />
          ) : (
            <>
              {song1 ? (
                <BattleCard
                  song={song1}
                  id="card-1"
                  disabled={!canVote}
                  onVote={(id) => handleVote(id, song2?.id)}
                  theme={theme}
                />
              ) : null}

              <div className="vs-badge">VS</div>

              {song2 ? (
                <BattleCard
                  song={song2}
                  id="card-2"
                  disabled={!canVote}
                  onVote={(id) => handleVote(id, song1?.id)}
                  theme={theme}
                />
              ) : null}
            </>
          )}
        </div>

        {state === "ready" && error ? (
          <p className="battle-inline-error" role="alert">{error}</p>
        ) : null}

        {sessionState !== "authenticated" ? (
          <div className="login-suggestion fade-in">
            <p style={{ margin: 0, marginBottom: 8, fontWeight: "bold" }}>Want to track your voting history?</p>
            <a className="btn btn-primary" href={legacyPageHref("/login")}>Log In Now</a>
          </div>
        ) : null}

        <div className="skip-container">
          <button className="btn btn-secondary" type="button" onClick={() => loadPair({ force: true })}>Skip this match</button>
          <Link className="muted-link" to="/faceoff-leaderboard">View Face-Off Leaderboard</Link>
        </div>

        {result ? (
          <div id="result-overlay" className="result-overlay">
            <div className="result-modal pop-in" role="dialog" aria-modal="true" aria-labelledby="result-heading">
              <h2 id="result-heading">Winner!</h2>
              <div className="result-content" aria-live="polite">
                <div id="winner-display">
                  <p style={{ fontWeight: 800, fontSize: "1.1rem" }}>
                    New rating: {result.winner?.new_rating}
                  </p>
                </div>
                <div className="rating-change">

                  <span id="rating-diff" className="diff-positive">+{result.winner?.gain}</span>
                </div>
              </div>
              <button className="btn btn-primary" onClick={closeResult}>Next Battle</button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
