import { legacyLoginHref, oauthLoginHref } from "./api";
import AuthCard from "./components/auth/AuthCard";
import CommentsCard from "./components/comments/CommentsCard";
import ExtensionInstallChip from "./components/common/ExtensionInstallChip";
import InstallBanner from "./components/common/InstallBanner";
import Seo from "./components/common/Seo";
import StatusCard from "./components/common/StatusCard";
import SiteNotifications from "./components/common/SiteNotifications";
import { ToastProvider } from "./components/common/ToastProvider";
import Footer from "./components/layout/Footer";
import Header from "./components/layout/Header";
import RetroVoteCard from "./components/retro/RetroVoteCard";
import VoteCard from "./components/vote/VoteCard";
import FaceoffLeaderboardPage from "./pages/FaceoffLeaderboardPage";
import BattlePage from "./pages/BattlePage";
import ExtensionPage from "./pages/ExtensionPage";
import HomePage from "./pages/HomePage";
import NextAlbumVotePage from "./pages/NextAlbumVotePage";
import PrivacyPage from "./pages/PrivacyPage";
import ProfilePage from "./pages/ProfilePage";
import ResultsPage from "./pages/ResultsPage";
import RetroHubPage from "./pages/RetroHubPage";
import RetroVotePage from "./pages/RetroVotePage";
import SongRequestsPage from "./pages/SongRequestsPage";
import TopAlbumsPage from "./pages/TopAlbumsPage";
import TopArtistsPage from "./pages/TopArtistsPage";
import TopSongsPage from "./pages/TopSongsPage";
import TermsPage from "./pages/TermsPage";
import { useRetroVotingFlow } from "./hooks/useRetroVotingFlow";
import { useNextAlbumVoteFlow } from "./hooks/useNextAlbumVoteFlow";
import { useThemePreference } from "./hooks/useThemePreference";
import { useVotingFlow } from "./hooks/useVotingFlow";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function parsePathRoute(pathname) {
  if (!pathname || pathname === "/") {
    return { page: "/home", albumId: null };
  }

  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const pathOnly = normalized;

  const retroVoteMatch = pathOnly.match(/^\/retro-vote\/(\d+)$/);
  if (retroVoteMatch) {
    return { page: "/retro-vote", albumId: retroVoteMatch[1] };
  }

  const resultsMatch = pathOnly.match(/^\/results(?:\/(\d+))?$/);
  if (resultsMatch) {
    return { page: "/results", albumId: resultsMatch[1] || null };
  }

  if (pathOnly === "/top-artists") {
    return { page: "/top-artists", albumId: null };
  }

  if (pathOnly === "/vote") {
    return { page: "/vote", albumId: null };
  }

  if (pathOnly === "/next-album-vote") {
    return { page: "/next-album-vote", albumId: null };
  }

  if (pathOnly === "/home") {
    return { page: "/home", albumId: null };
  }

  if (pathOnly === "/faceoff-leaderboard") {
    return { page: "/faceoff-leaderboard", albumId: null };
  }

  if (pathOnly === "/battle") {
    return { page: "/battle", albumId: null };
  }

  if (pathOnly === "/top-albums") {
    return { page: "/top-albums", albumId: null };
  }

  if (pathOnly === "/top-songs") {
    return { page: "/top-songs", albumId: null };
  }

  if (pathOnly === "/song-requests") {
    return { page: "/song-requests", albumId: null };
  }

  if (pathOnly === "/profile") {
    return { page: "/profile", albumId: null };
  }

  if (pathOnly === "/retro-hub") {
    return { page: "/retro-hub", albumId: null };
  }

  if (pathOnly === "/terms") {
    return { page: "/terms", albumId: null };
  }

  if (pathOnly === "/privacy") {
    return { page: "/privacy", albumId: null };
  }

  if (pathOnly === "/extension") {
    return { page: "/extension", albumId: null };
  }

  return { page: "/home", albumId: null };
}

const routeSeo = {
  "/top-albums": {
    title: "Top Albums",
    description: "Browse Vinyl Vote's community-ranked album leaderboard, sorted by average song score, album score, and total votes.",
    path: "/top-albums",
  },
  "/top-artists": {
    title: "Top Artists",
    description: "Discover the highest-rated artists on Vinyl Vote based on community song ratings across featured albums.",
    path: "/top-artists",
  },
  "/top-songs": {
    title: "Top Songs",
    description: "Explore Vinyl Vote's highest-rated tracks with album context, artist links, rating counts, and streaming shortcuts.",
    path: "/top-songs",
  },
  "/faceoff-leaderboard": {
    title: "Face-Off Leaderboard",
    description: "See the songs fans keep choosing in Vinyl Vote's head-to-head Face-Off rankings.",
    path: "/faceoff-leaderboard",
  },
  "/battle": {
    title: "Song Face-Off",
    description: "Pick between two songs and help shape Vinyl Vote's community Face-Off song rankings.",
    path: "/battle",
  },
  "/terms": {
    title: "Terms of Use",
    description: "Read the terms that apply when using Vinyl Vote.",
    path: "/terms",
  },
  "/privacy": {
    title: "Privacy Policy",
    description: "Learn how Vinyl Vote handles account, voting, and notification data.",
    path: "/privacy",
  },
  "/extension": {
    title: "Browser Extension",
    description: "Install the Vinyl Vote browser extension for quicker access to weekly album voting.",
    path: "/extension",
  },
};

const privateRouteSeo = {
  title: "Vinyl Vote",
  description: "Vinyl Vote account and voting tools.",
  robots: "noindex,nofollow",
};

function App() {
  const showDevLogin = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";
  const showRetroPreviewOnHome = (import.meta.env.VITE_SHOW_RETRO_PREVIEW_ON_HOME || "false") === "true";
  const devLoginUsername = import.meta.env.VITE_DEV_LOGIN_USERNAME || "dev-user";
  const location = useLocation();
  const route = parsePathRoute(location.pathname);
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
  const nextAlbum = useNextAlbumVoteFlow(sessionState === "authenticated" && route.page === "/next-album-vote");
  const { setSelectedAlbumId } = retro;
  const isPublicDataPage = [
    "/home",
    "/results",
    "/top-artists",
    "/faceoff-leaderboard",
    "/top-albums",
    "/top-songs",
    "/battle",
    "/terms",
    "/privacy",
    "/extension",
  ].includes(route.page);
  const showGlobalSessionStatus = route.page !== "/home";
  const seo = routeSeo[route.page] || (!isPublicDataPage && route.page !== "/home" && route.page !== "/results" ? privateRouteSeo : null);

  useEffect(() => {
    if (route.page === "/retro-vote" && route.albumId) {
      setSelectedAlbumId(route.albumId);
    }
  }, [route.albumId, route.page, setSelectedAlbumId]);

  return (
    <ToastProvider>
      <div className="app-shell">
        <Header
          loginHref={oauthLoginHref()}
          sessionInfo={sessionInfo}
          sessionState={sessionState}
          theme={theme}
          toggleTheme={toggleTheme}
          route={route.page}
        />

        {seo ? (
          <Seo
            title={seo.title}
            description={seo.description}
            path={seo.path || route.page}
            robots={seo.robots}
          />
        ) : null}

        <SiteNotifications />

        <main className="page">
        {route.page === "/vote" ? (
          <section className="hero">
            <p className="eyebrow">Weekly Album</p>
            <h1>Cast Your Vote</h1>
            <p className="subtitle">
              Rate each track, give the album an overall score, and save your picks for this week's record.
            </p>
          </section>
        ) : null}

        {sessionState === "loading" && showGlobalSessionStatus ? (
          <StatusCard message="Checking your session..." />
        ) : null}

        {sessionState === "error" && showGlobalSessionStatus ? (
          <StatusCard
            title="Session check failed"
            message={error || "Could not validate your session."}
            variant="error"
          />
        ) : null}

        {route.page === "/home" ? (
          <HomePage
            loginHref={oauthLoginHref()}
            sessionState={sessionState}
          />
        ) : null}

        {sessionState === "anonymous" ? (
          isPublicDataPage ? null : (
            <AuthCard
              devLoginUsername={devLoginUsername}
              legacyLoginHref={legacyLoginHref()}
              loginHref={oauthLoginHref()}
              showDevLogin={showDevLogin}
            />
          )
        ) : null}

        {route.page === "/results" && sessionState !== "loading" && sessionState !== "error" ? (
          <ResultsPage routeAlbumId={route.albumId} />
        ) : null}

        {route.page === "/top-artists" && sessionState !== "loading" && sessionState !== "error" ? (
          <TopArtistsPage />
        ) : null}

        {route.page === "/faceoff-leaderboard" && sessionState !== "loading" && sessionState !== "error" ? (
          <FaceoffLeaderboardPage />
        ) : null}

        {route.page === "/battle" && sessionState !== "loading" && sessionState !== "error" ? (
          <BattlePage sessionState={sessionState} theme={theme} />
        ) : null}

        {route.page === "/top-albums" && sessionState !== "loading" && sessionState !== "error" ? (
          <TopAlbumsPage />
        ) : null}

        {route.page === "/top-songs" && sessionState !== "loading" && sessionState !== "error" ? (
          <TopSongsPage />
        ) : null}

        {route.page === "/terms" ? <TermsPage /> : null}

        {route.page === "/privacy" ? <PrivacyPage /> : null}

        {route.page === "/extension" ? <ExtensionPage /> : null}

        {sessionState === "authenticated" && route.page === "/song-requests" ? (
          <SongRequestsPage />
        ) : null}

        {sessionState === "authenticated" && route.page === "/profile" ? (
          <ProfilePage />
        ) : null}

        {sessionState === "authenticated" && route.page === "/next-album-vote" ? (
          <NextAlbumVotePage nextAlbum={nextAlbum} />
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

        <Footer />

        <ExtensionInstallChip route={route.page} />

        <InstallBanner />
      </div>
    </ToastProvider>
  );
}

export default App;
