import { legacyLoginHref, oauthLoginHref } from "./api";
import AuthCard from "./components/auth/AuthCard";
import CommentsCard from "./components/comments/CommentsCard";
import StatusCard from "./components/common/StatusCard";
import Header from "./components/layout/Header";
import RetroVoteCard from "./components/retro/RetroVoteCard";
import VoteCard from "./components/vote/VoteCard";
import RetroHubPage from "./pages/RetroHubPage";
import RetroVotePage from "./pages/RetroVotePage";
import { useRetroVotingFlow } from "./hooks/useRetroVotingFlow";
import { useThemePreference } from "./hooks/useThemePreference";
import { useVotingFlow } from "./hooks/useVotingFlow";
import { useEffect, useState } from "react";

function parseHashRoute(hash) {
  const raw = (hash || "").replace(/^#/, "").trim();
  if (!raw || raw === "/") {
    return { page: "/vote", albumId: null };
  }

  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  const retroVoteMatch = normalized.match(/^\/retro-vote\/(\d+)$/);
  if (retroVoteMatch) {
    return { page: "/retro-vote", albumId: retroVoteMatch[1] };
  }

  if (normalized === "/retro-hub") {
    return { page: "/retro-hub", albumId: null };
  }

  return { page: "/vote", albumId: null };
}

function App() {
  const showDevLogin = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";
  const showRetroPreviewOnHome = (import.meta.env.VITE_SHOW_RETRO_PREVIEW_ON_HOME || "false") === "true";
  const devLoginUsername = import.meta.env.VITE_DEV_LOGIN_USERNAME || "dev-user";
  const [route, setRoute] = useState(parseHashRoute(window.location.hash));
  const { theme, toggleTheme } = useThemePreference("dark");
  const {
    albumPayload,
    albumScore,
    albumState,
    error,
    feedback,
    hasSavedVotes,
    hasUnsavedChanges,
    loadAlbum,
    progressPercent,
    ratedTracks,
    remainingTracks,
    saveVotes,
    sessionInfo,
    sessionState,
    setAlbumScore,
    setSongScore,
    songScores,
    songs,
    statusLabel,
    submitState,
  } = useVotingFlow();
  const retro = useRetroVotingFlow(sessionState === "authenticated");
  const { setSelectedAlbumId } = retro;

  useEffect(() => {
    function onHashChange() {
      setRoute(parseHashRoute(window.location.hash));
    }

    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    if (route.page === "/retro-vote" && route.albumId) {
      setSelectedAlbumId(route.albumId);
    }
  }, [route.albumId, route.page, setSelectedAlbumId]);

  return (
    <div className="app-shell">
      <Header
        loginHref={oauthLoginHref()}
        legacyLoginHref={legacyLoginHref()}
        sessionInfo={sessionInfo}
        sessionState={sessionState}
        theme={theme}
        toggleTheme={toggleTheme}
        route={route.page}
      />

      <main className="page">
        {route.page !== "/retro-hub" && route.page !== "/retro-vote" ? (
          <section className="hero">
            <p className="eyebrow">Vinyl Vote V2</p>
            <h1>Vote Flow Migration</h1>
            <p className="subtitle">
              V2 keeps the V1 visual shell while this React page incrementally replaces server-rendered
              voting screens. Theme preference persists across refreshes.
            </p>
          </section>
        ) : null}

        {sessionState === "loading" ? (
          <StatusCard message="Checking your session..." />
        ) : null}

        {sessionState === "error" ? (
          <StatusCard
            title="Session check failed"
            message={error || "Could not validate your session."}
            variant="error"
          />
        ) : null}

        {sessionState === "anonymous" ? (
          <AuthCard
            devLoginUsername={devLoginUsername}
            legacyLoginHref={legacyLoginHref()}
            loginHref={oauthLoginHref()}
            showDevLogin={showDevLogin}
          />
        ) : null}

        {sessionState === "authenticated" && route.page === "/vote" ? (
          <>
            <VoteCard
              albumPayload={albumPayload}
              albumScore={albumScore}
              albumState={albumState}
              error={error}
              feedback={feedback}
              hasSavedVotes={hasSavedVotes}
              hasUnsavedChanges={hasUnsavedChanges}
              loadAlbum={loadAlbum}
              progressPercent={progressPercent}
              ratedTracks={ratedTracks}
              remainingTracks={remainingTracks}
              saveVotes={saveVotes}
              setAlbumScore={setAlbumScore}
              setSongScore={setSongScore}
              songScores={songScores}
              songs={songs}
              statusLabel={statusLabel}
              submitState={submitState}
            />

            {showRetroPreviewOnHome ? (
              <RetroVoteCard
                albumPayload={retro.albumPayload}
                albumScore={retro.albumScore}
                albums={retro.albums}
                albumsError={retro.albumsError}
                albumsState={retro.albumsState}
                albumState={retro.albumState}
                error={retro.error}
                feedback={retro.feedback}
                loadAlbums={retro.loadAlbums}
                saveVotes={retro.saveVotes}
                selectedAlbumId={retro.selectedAlbumId}
                setAlbumScore={retro.setAlbumScore}
                setSelectedAlbumId={retro.setSelectedAlbumId}
                setSongScore={retro.setSongScore}
                songScores={retro.songScores}
                songs={retro.songs}
                submitState={retro.submitState}
              />
            ) : null}

            <CommentsCard
              albumId={albumPayload?.album?.id}
              currentUserId={sessionInfo?.user_id}
            />
          </>
        ) : null}

        {sessionState === "authenticated" && route.page === "/retro-hub" ? (
          <RetroHubPage retro={retro} />
        ) : null}

        {sessionState === "authenticated" && route.page === "/retro-vote" ? (
          <RetroVotePage retro={retro} />
        ) : null}
      </main>
    </div>
  );
}

export default App;
