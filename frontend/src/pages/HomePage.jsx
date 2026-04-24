import { useEffect, useMemo, useState } from "react";
import { getHomeData, getHomeSeo } from "../api";
import StatusCard from "../components/common/StatusCard";
import StreamingLinks from "../components/common/StreamingLinks";
import "./HomePage.css";

const defaultCardPalette = {
  primary: "56 209 153",
  secondary: "10 16 20",
};

const albumPaletteCache = new Map();

/**
 * Round and clamp an RGB channel value to the valid CSS color range [0, 255].
 *
 * @param {number} value - The channel value to normalize.
 * @returns {number} The rounded channel value constrained to the range 0-255.
 */
function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbArrayToCss(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) {
    return "56 209 153";
  }
  return `${clampChannel(rgb[0])} ${clampChannel(rgb[1])} ${clampChannel(rgb[2])}`;
}

function colorDistance(a, b) {
  return Math.sqrt(
    (a[0] - b[0]) * (a[0] - b[0]) +
      (a[1] - b[1]) * (a[1] - b[1]) +
      (a[2] - b[2]) * (a[2] - b[2])
  );
}

function blendToward(color, toward, ratio) {
  return [
    color[0] * (1 - ratio) + toward[0] * ratio,
    color[1] * (1 - ratio) + toward[1] * ratio,
    color[2] * (1 - ratio) + toward[2] * ratio,
  ];
}

function averageRgbFromImageData(imageData) {
  const { data } = imageData;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  // Step by 16 bytes (4 pixels) to reduce work while keeping a stable palette.
  for (let index = 0; index < data.length; index += 16) {
    const alpha = data[index + 3];
    if (alpha < 64) {
      continue;
    }
    totalR += data[index];
    totalG += data[index + 1];
    totalB += data[index + 2];
    count += 1;
  }

  if (!count) {
    return null;
  }

  return [totalR / count, totalG / count, totalB / count];
}

async function extractHeroPalette(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.referrerPolicy = "no-referrer";

  const loaded = await new Promise((resolve, reject) => {
    image.onload = () => resolve(true);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = imageUrl;
  });

  if (!loaded) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  canvas.width = 32;
  canvas.height = 32;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const average = averageRgbFromImageData(imageData);
  if (!average) {
    return null;
  }

  const darkReference = [18, 18, 20];
  let primary = blendToward(average, [46, 190, 130], 0.24);
  if (colorDistance(primary, darkReference) < 75) {
    primary = blendToward(primary, [72, 214, 158], 0.28);
  }

  const secondary = blendToward(primary, [13, 23, 31], 0.65);

  return {
    primary: rgbArrayToCss(primary),
    secondary: rgbArrayToCss(secondary),
  };
}

function formatCountdown(voteEnd, nowMs) {
  if (!voteEnd) {
    return "Voting window is not scheduled yet.";
  }

  const targetMs = Date.parse(voteEnd);
  if (!Number.isFinite(targetMs)) {
    return "Voting window is not scheduled yet.";
  }

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    return "Voting closed";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  return `${hours}h ${minutes}m ${seconds}s`;
}

function getCountdownParts(voteEnd, nowMs) {
  if (!voteEnd) {
    return { status: "unscheduled", days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const targetMs = Date.parse(voteEnd);
  if (!Number.isFinite(targetMs)) {
    return { status: "unscheduled", days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    return { status: "closed", days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  return {
    status: "active",
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function getCountdownFluidLevel(voteEnd, nowMs) {
  if (!voteEnd) {
    return 0;
  }

  const targetMs = Date.parse(voteEnd);
  if (!Number.isFinite(targetMs)) {
    return 0;
  }

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    return 0;
  }

  // Voting rounds are weekly, so map remaining time to a 7-day fluid level.
  const maxWindowMs = 7 * 24 * 60 * 60 * 1000;
  const linearRatio = Math.max(0, Math.min(1, diffMs / maxWindowMs));

  // Non-linear drain: fuller early in the week, then falls off faster near deadline.
  return Math.pow(linearRatio, 1.35);
}

function upsertMetaTag({ name, property, content }) {
  if (!content) {
    return;
  }

  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    if (name) {
      element.setAttribute("name", name);
    }
    if (property) {
      element.setAttribute("property", property);
    }
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function upsertCanonicalLink(url) {
  if (!url) {
    return;
  }

  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

function upsertSchema(schemaPayload) {
  if (!schemaPayload) {
    return;
  }

  let script = document.getElementById("home-seo-schema");
  if (!script) {
    script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.id = "home-seo-schema";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schemaPayload);
}

function applyHomeSeoPayload(payload) {
  if (!payload) {
    return;
  }

  if (payload.title) {
    document.title = payload.title;
  }

  upsertMetaTag({ name: "description", content: payload.description });
  upsertMetaTag({ name: "robots", content: payload.robots });

  const og = payload.open_graph || {};
  upsertMetaTag({ property: "og:type", content: og.type });
  upsertMetaTag({ property: "og:site_name", content: og.site_name });
  upsertMetaTag({ property: "og:title", content: og.title });
  upsertMetaTag({ property: "og:description", content: og.description });
  upsertMetaTag({ property: "og:image", content: og.image });
  upsertMetaTag({ property: "og:url", content: og.url });

  const twitter = payload.twitter || {};
  upsertMetaTag({ name: "twitter:card", content: twitter.card });
  upsertMetaTag({ name: "twitter:title", content: twitter.title });
  upsertMetaTag({ name: "twitter:description", content: twitter.description });
  upsertMetaTag({ name: "twitter:image", content: twitter.image });

  upsertCanonicalLink(payload.canonical_url);
  upsertSchema(payload.schema);
}

function HomePageSkeleton() {
  return (
    <>
      <section className="hero home-hero home-skeleton" aria-hidden="true">
        <div className="skeleton-line skeleton-eyebrow" />
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line skeleton-subtitle" />
        <div className="home-hero-grid">
          <div className="home-hero-media">
            <div className="skeleton-block skeleton-cover" />
          </div>
          <div className="home-hero-details">
            <div className="skeleton-line skeleton-artist" />
            <div className="skeleton-countdown-wrap">
              <div className="skeleton-countdown-card">
                <div className="skeleton-line skeleton-countdown" />
                <div className="skeleton-countdown-grid">
                  <div className="skeleton-countdown-item" />
                  <div className="skeleton-countdown-item" />
                  <div className="skeleton-countdown-item" />
                  <div className="skeleton-countdown-item" />
                </div>
              </div>
            </div>
            <div className="button-row home-cta-row">
              <div className="skeleton-btn" />
              <div className="skeleton-btn" />
            </div>
          </div>
        </div>
      </section>

      <section className="card home-section home-skeleton" aria-hidden="true">
        <div className="skeleton-line skeleton-section-title" />
        <div className="skeleton-line skeleton-section-subtitle" />
        <div className="home-two-column">
          <div className="home-tile-grid">
            <div className="skeleton-tile" />
            <div className="skeleton-tile" />
            <div className="skeleton-tile" />
          </div>
          <div className="home-tile-grid">
            <div className="skeleton-tile" />
            <div className="skeleton-tile" />
            <div className="skeleton-tile" />
          </div>
        </div>
      </section>
    </>
  );
}

function AlbumTile({ album, metricLabel }) {
  const [tilePalette, setTilePalette] = useState(defaultCardPalette);
  const albumResultsHref = `/results/${album.id}`;

  useEffect(() => {
    let cancelled = false;
    const coverUrl = album?.cover_url;

    if (!coverUrl) {
      setTilePalette(defaultCardPalette);
      return () => {
        cancelled = true;
      };
    }

    const cached = albumPaletteCache.get(coverUrl);
    if (cached) {
      setTilePalette(cached);
      return () => {
        cancelled = true;
      };
    }

    extractHeroPalette(coverUrl)
      .then((palette) => {
        if (cancelled || !palette) {
          return;
        }
        albumPaletteCache.set(coverUrl, palette);
        setTilePalette(palette);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setTilePalette(defaultCardPalette);
      });

    return () => {
      cancelled = true;
    };
  }, [album?.cover_url]);

  return (
    <a
      className="home-tile home-tile-link"
      href={albumResultsHref}
      aria-label={`View results for ${album.title} by ${album.artist}`}
      style={{
        "--home-tile-primary": tilePalette.primary,
        "--home-tile-secondary": tilePalette.secondary,
      }}
    >
      <div className="home-tile-cover-wrap">
        {album.cover_url ? (
          <img
            src={album.cover_url}
            alt={`${album.title} cover`}
            className="home-tile-cover"
            loading="lazy"
            width="140"
            height="140"
          />
        ) : (
          <div className="home-tile-fallback">No Cover</div>
        )}
      </div>
      <div className="home-tile-content">
        <h3>{album.title}</h3>
        <p>{album.artist}</p>
        <p className="home-tile-metric">
          <strong>{metricLabel}:</strong> {album.avg_song_score ?? "N/A"}
        </p>
        <p className="home-tile-metric">
          <strong>Album Avg:</strong> {album.avg_album_score ?? "N/A"}
        </p>
      </div>
    </a>
  );
}

export default function HomePage({ loginHref, legacyLoginHref }) {
  const [dataState, setDataState] = useState("loading");
  const [error, setError] = useState("");
  const [homeData, setHomeData] = useState(null);
  const [countdownText, setCountdownText] = useState("Voting window is not scheduled yet.");
  const [countdownParts, setCountdownParts] = useState({ status: "unscheduled", days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [countdownFluidLevel, setCountdownFluidLevel] = useState(0);
  const [countdownAnnouncement, setCountdownAnnouncement] = useState("");
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [heroPalette, setHeroPalette] = useState(defaultCardPalette);

  useEffect(() => {
    let cancelled = false;
    setDataState("loading");
    setError("");

    getHomeData()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setHomeData(payload);
        setDataState("ready");
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        setError(fetchError.message || "Could not load landing data.");
        setDataState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getHomeSeo()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        applyHomeSeoPayload(payload);
      })
      .catch(() => {
        // Keep static fallback metadata from index.html.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPromptEvent(event);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  const currentAlbum = homeData?.current_album || null;
  const topAlbums = homeData?.top_albums || [];
  const recentHistory = homeData?.recent_history || [];

  useEffect(() => {
    if (!currentAlbum?.vote_end) {
      setCountdownText("Voting window is not scheduled yet.");
      setCountdownParts({ status: "unscheduled", days: 0, hours: 0, minutes: 0, seconds: 0 });
      setCountdownFluidLevel(0);
      setCountdownAnnouncement("Voting window is not scheduled yet.");
      return;
    }

    let ticks = 0;
    const tick = () => {
      const nowMs = Date.now();
      const value = formatCountdown(currentAlbum.vote_end, nowMs);
      const parts = getCountdownParts(currentAlbum.vote_end, nowMs);
      const fluidLevel = getCountdownFluidLevel(currentAlbum.vote_end, nowMs);
      setCountdownText(value);
      setCountdownParts(parts);
      setCountdownFluidLevel(fluidLevel);
      if (ticks % 10 === 0 || value === "Voting closed") {
        setCountdownAnnouncement(value);
      }
      ticks += 1;
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentAlbum?.vote_end]);

  useEffect(() => {
    let cancelled = false;
    const coverUrl = currentAlbum?.cover_url;

    if (!coverUrl) {
      setHeroPalette(defaultCardPalette);
      return () => {
        cancelled = true;
      };
    }

    extractHeroPalette(coverUrl)
      .then((palette) => {
        if (cancelled || !palette) {
          return;
        }
        setHeroPalette(palette);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setHeroPalette(defaultCardPalette);
      });

    return () => {
      cancelled = true;
    };
  }, [currentAlbum?.cover_url]);

  const homeActions = useMemo(() => {
    const actions = [
      { href: "/results", label: "Latest Results" },
      { href: "/battle", label: "Face-Off" },
      { href: "/top-albums", label: "Top Albums" },
      { href: "/top-artists", label: "Top Artists" },
      { href: "/top-songs", label: "Top Songs" },
    ];

    if (homeData?.user?.is_authenticated) {
      actions.unshift({ href: "/vote", label: "Resume Voting" });
      actions.push({ href: "/retro-hub", label: "Retro Hub" });
      actions.push({ href: "/song-requests", label: "Request an Album" });
    }

    return actions;
  }, [homeData?.user?.is_authenticated]);

  const howItWorks = [
    {
      title: "Listen",
      copy: "Every week features one album. Play it in full and rate each track from 1 to 5.",
    },
    {
      title: "Vote",
      copy: "Submit your song ratings plus your overall album score before the weekly deadline.",
    },
    {
      title: "Compare",
      copy: "Once voting closes, results unlock and you can compare your taste with everyone else.",
    },
  ];

  const joinReasons = [
    "Fast weekly format that takes minutes, not hours",
    "Track personal taste with streaks and long-term rankings",
    "Discover classics and hidden gems through community picks",
  ];

  async function handleInstallPrompt() {
    if (!installPromptEvent) {
      return;
    }

    installPromptEvent.prompt();
    try {
      await installPromptEvent.userChoice;
    } catch (error) {
      // Ignore install prompt cancellation.
    }
    setInstallPromptEvent(null);
  }

  if (dataState === "loading") {
    return <HomePageSkeleton />;
  }

  if (dataState === "error") {
    return <StatusCard title="Landing page unavailable" message={error} variant="error" />;
  }

  return (
    <>
      <section
        className="hero home-hero"
        style={{
          "--home-hero-primary": heroPalette.primary,
          "--home-hero-secondary": heroPalette.secondary,
        }}
      >
        <p className="eyebrow">Vinyl Vote</p>
        {currentAlbum ? (
          <>
            <h1>Now Voting: {currentAlbum.title}</h1>
            <p className="home-now-playing-byline">by {currentAlbum.artist}</p>
          </>
        ) : (
          <h1>Welcome to Vinyl Vote</h1>
        )}
        <p className="subtitle">
          Weekly album ratings, long-term score tracking, and a living leaderboard.
        </p>

        <div className="home-hero-grid">
          <div className="home-hero-media">
            {currentAlbum?.cover_url ? (
              <img
                src={currentAlbum.cover_url}
                alt={`${currentAlbum.title} cover art`}
                className="home-hero-cover"
                width="220"
                height="220"
                loading="eager"
                fetchPriority="high"
              />
            ) : (
              <div className="home-hero-fallback">No album art available</div>
            )}
          </div>

          <div className="home-hero-details">
            <div
              className="home-countdown-card"
              style={{ "--home-countdown-fluid-level": countdownFluidLevel }}
              aria-live="off"
            >
              <p className="home-countdown-label">Voting countdown</p>
              {countdownParts.status === "active" ? (
                <div className="home-countdown-grid" role="group" aria-label="Voting countdown">
                  <div className="home-countdown-unit">
                    <span className="home-countdown-value">{String(countdownParts.days).padStart(2, "0")}</span>
                    <span className="home-countdown-unit-label">Days</span>
                  </div>
                  <div className="home-countdown-unit">
                    <span className="home-countdown-value">{String(countdownParts.hours).padStart(2, "0")}</span>
                    <span className="home-countdown-unit-label">Hours</span>
                  </div>
                  <div className="home-countdown-unit">
                    <span className="home-countdown-value">{String(countdownParts.minutes).padStart(2, "0")}</span>
                    <span className="home-countdown-unit-label">Minutes</span>
                  </div>
                  <div className="home-countdown-unit">
                    <span className="home-countdown-value">{String(countdownParts.seconds).padStart(2, "0")}</span>
                    <span className="home-countdown-unit-label">Seconds</span>
                  </div>
                </div>
              ) : (
                <p className="home-countdown-fallback">{countdownText}</p>
              )}
            </div>
            <p className="sr-only" aria-live="polite">{countdownAnnouncement}</p>

            <StreamingLinks
              spotifyUrl={currentAlbum?.spotify_url}
              appleUrl={currentAlbum?.apple_url}
              youtubeUrl={currentAlbum?.youtube_url}
            />

            <div className="button-row home-cta-row">
              {homeData?.user?.is_authenticated ? (
                <a className="btn btn-primary" href="/vote">Go Vote</a>
              ) : (
                <>
                  <a className="btn btn-primary" href={loginHref}>Log In to Vote</a>
                  {/* <a className="btn btn-secondary" href={legacyLoginHref}>Legacy Login</a> */}
                </>
              )}
              <a className="btn btn-secondary" href="/battle">Face-Off</a>
            </div>
          </div>
        </div>
      </section>

      <section className="card home-section home-discovery-section">
        <header className="home-section-header">
          <p className="home-section-kicker">Discovery</p>
        </header>

        <div className="home-two-column">
          <div>
            <h3 className="home-subheading home-subheading-featured">Top Albums</h3>
            {topAlbums.length > 0 ? (
              <div className="home-tile-grid">
                {topAlbums.map((album) => (
                  <AlbumTile key={`top-${album.id}`} album={album} metricLabel="Song Avg" />
                ))}
              </div>
            ) : (
              <p className="empty-text">Top albums will appear once enough rounds are complete.</p>
            )}
          </div>

          <div>
            <h3 className="home-subheading home-subheading-featured">Recent History</h3>
            {recentHistory.length > 0 ? (
              <div className="home-tile-grid">
                {recentHistory.map((album) => (
                  <AlbumTile key={`recent-${album.id}`} album={album} metricLabel="Song Avg" />
                ))}
              </div>
            ) : (
              <p className="empty-text">Recent rounds will populate here after voting cycles close.</p>
            )}
          </div>
        </div>
      </section>

      <section className="card home-section retention-section">
        <header className="home-section-header">
          <h2>Why Join Vinyl Vote</h2>
          <p>Built for listeners who want better music discovery and better weekly habits.</p>
        </header>

        <div className="home-conversion-grid">
          <div className="home-steps" role="list" aria-label="How Vinyl Vote works">
            {howItWorks.map((step, index) => (
              <article key={step.title} className="home-step-card" role="listitem">
                <span className="home-step-number">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>

          <aside className="home-join-panel" aria-label="Reasons to join">
            <h3>New here?</h3>
            <ul className="home-join-list">
              {joinReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </aside>
        </div>

        <div className="button-row home-join-actions">
          {homeData?.user?.is_authenticated ? (
            <a className="btn btn-primary" href="/vote">Start This Week's Vote</a>
          ) : (
            <a className="btn btn-primary" href={loginHref}>Create or Use Your Account</a>
          )}
          <a className="btn btn-ghost" href="/results">See Past Results</a>
        </div>
      </section>

      <section className="card home-section retention-section">
        <header className="home-section-header">
          <h2>Quick Actions</h2>
          <p>Jump straight into the parts of Vinyl Vote you use most.</p>
        </header>

        {homeData?.user?.is_authenticated ? (
          <p className="home-streak">Current streak: <strong>{homeData.user.streak ?? 0}</strong> completed weekly rounds.</p>
        ) : null}

        <div className="home-action-grid" role="group" aria-label="Quick action links">
          {homeActions.map((action) => (
            <a key={action.href} className="home-action" href={action.href}>{action.label}</a>
          ))}
          {installPromptEvent ? (
            <button className="home-action home-action-button" type="button" onClick={handleInstallPrompt}>
              Install App
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
