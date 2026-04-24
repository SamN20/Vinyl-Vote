import { pushToast } from "./utils/toastBus";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const LEGACY_BASE_URL = (
  import.meta.env.VITE_LEGACY_BASE_URL || (import.meta.env.DEV ? "http://127.0.0.1:5000" : "")
).replace(/\/$/, "");

function buildUrl(path) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

function formatErrorMessage(path, status, payload) {
  if (payload && typeof payload === "object" && payload.error) {
    return payload.error;
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  return `Request to ${path} failed (${status})`;
}

function buildQueryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    query.set(key, String(value));
  });
  return query.toString();
}

function leaderboardRequest(path, params = {}) {
  const query = buildQueryString(params);
  return request(query ? `${path}?${query}` : path);
}

async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  let payload;

  if (contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    const error = new Error(formatErrorMessage(path, response.status, payload));
    error.status = response.status;
    error.payload = payload;

    const requestMethod = (options.method || "GET").toUpperCase();
    const shouldToastError = options.toastOnError ?? (requestMethod !== "GET");
    if (shouldToastError) {
      pushToast({
        title: "Request failed",
        message: error.message,
        variant: "error",
      });
    }

    throw error;
  }

  if (!contentType.includes("application/json")) {
    const error = new Error(`Expected JSON response from ${path}`);
    error.status = 500;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function sessionCheck() {
  return request("/api/v1/session-check");
}

export function getCurrentAlbum() {
  return request("/api/v1/current-album");
}

export function getHomeData() {
  return request("/api/v1/home");
}

export function getHomeSeo() {
  return request("/api/v1/home-seo");
}

export function getActiveNotifications() {
  return request("/api/v1/notifications/active", { toastOnError: false });
}

export function getProfileData() {
  return request("/api/v1/profile");
}

export function submitVotes(payload) {
  return request("/api/v1/votes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRetroAlbums() {
  return request("/api/v1/retro-albums");
}

export function getRetroRecommendations() {
  return request("/api/v1/retro-recommendations");
}

export function getRetroAlbum(albumId) {
  return request(`/api/v1/retro-album/${albumId}`);
}

export function submitRetroVotes(albumId, payload) {
  return request(`/api/v1/retro-votes/${albumId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getLatestResults() {
  return request("/api/v1/results/latest");
}

export function getResultsForAlbum(albumId) {
  return request(`/api/v1/results/album/${albumId}`);
}

export function getLeaderboardArtists(params = {}) {
  return leaderboardRequest("/api/v1/leaderboard/artists", params);
}

export function getLeaderboardArtistBio(artistName) {
  return request(`/api/v1/leaderboard/artists/${encodeURIComponent(artistName)}/bio`);
}

export function getLeaderboardArtistTopSongs(artistName) {
  return request(`/api/v1/leaderboard/artists/${encodeURIComponent(artistName)}/top-songs`);
}

export function getLeaderboardBattle(params = {}) {
  return leaderboardRequest("/api/v1/leaderboard/battle", params);
}

export function getLeaderboardAlbums(params = {}) {
  return leaderboardRequest("/api/v1/leaderboard/albums", params);
}

export function getLeaderboardSongs(params = {}) {
  return leaderboardRequest("/api/v1/leaderboard/songs", params);
}

export function getAlbumComments(albumId) {
  return request(`/api/comments/${albumId}`);
}

export function postAlbumComment(albumId, text, parentId = null) {
  return request(`/api/comments/${albumId}`, {
    method: "POST",
    body: JSON.stringify({ text, parent_id: parentId }),
  });
}

export function deleteAlbumComment(commentId) {
  return request(`/api/comments/${commentId}`, {
    method: "DELETE",
  });
}

export function flagAlbumComment(commentId) {
  return request(`/api/comments/${commentId}/flag`, {
    method: "POST",
  });
}

export function oauthLoginHref() {
  return buildUrl("/oauth/login");
}

export function logoutHref() {
  return buildUrl("/logout");
}

let battleInFlightRequest = null;

export function getBattle(options = {}) {
  const { force = false } = options;

  // Deduplicate concurrent battle fetches so initial render doesn't swap pairs
  // when React dev mode invokes effects more than once.
  if (!force && battleInFlightRequest) {
    return battleInFlightRequest;
  }

  battleInFlightRequest = request("/api/v1/battle").finally(() => {
    battleInFlightRequest = null;
  });

  return battleInFlightRequest;
}

export function submitBattleVote(payload) {
  return request(`/api/v1/battle/vote`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSongRequests() {
  return request("/api/v1/song-requests");
}

export function searchSongRequestAlbums(albumQuery) {
  return request("/api/v1/song-requests/search", {
    method: "POST",
    body: JSON.stringify({ album_query: albumQuery }),
  });
}

export function submitSongRequest(payload) {
  return request("/api/v1/song-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function legacyLoginHref() {
  return buildUrl("/legacy/login");
}

export function devLoginHref(username = "") {
  const query = new URLSearchParams();
  query.set("next", "/");
  if (username) {
    query.set("username", username);
  }
  return `${buildUrl("/dev/login")}?${query.toString()}`;
}

export function legacyPageHref(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!LEGACY_BASE_URL) {
    return normalizedPath;
  }
  return `${LEGACY_BASE_URL}${normalizedPath}`;
}
