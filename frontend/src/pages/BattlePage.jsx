import { useEffect, useState } from "react";
import { getBattle, submitBattleVote } from "../api";
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

  async function loadPair() {
    setState("loading");
    setError(null);
    try {
      const payload = await getBattle();
      setSong1(payload.song1);
      setSong2(payload.song2);
      setState("ready");
    } catch (err) {
      setError(err.message || String(err));
      setState("error");
    }
  }

  async function handleVote(winnerId, loserId) {
    if (submitting) return;
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
    loadPair();
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
                  disabled={submitting}
                  onVote={(id) => handleVote(id, song2?.id)}
                  theme={theme}
                />
              ) : null}

              <div className="vs-badge">VS</div>

              {song2 ? (
                <BattleCard
                  song={song2}
                  id="card-2"
                  disabled={submitting}
                  onVote={(id) => handleVote(id, song1?.id)}
                  theme={theme}
                />
              ) : null}
            </>
          )}
        </div>

        {sessionState !== "authenticated" ? (
          <div className="login-suggestion fade-in">
            <p style={{ margin: 0, marginBottom: 8, fontWeight: "bold" }}>Want to track your voting history?</p>
            <a className="btn btn-primary" href={legacyPageHref("/login")}>Log In Now</a>
          </div>
        ) : null}

        <div className="skip-container">
          <button className="btn btn-secondary" type="button" onClick={loadPair}>Skip this match</button>
          <a className="muted-link" href="#/faceoff-leaderboard">View Face-Off Leaderboard</a>
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
