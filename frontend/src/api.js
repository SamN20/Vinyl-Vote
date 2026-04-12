const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

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

export function submitVotes(payload) {
  return request("/api/v1/votes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function oauthLoginHref() {
  return buildUrl("/oauth/login");
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
