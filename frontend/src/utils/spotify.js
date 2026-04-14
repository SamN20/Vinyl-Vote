export function getSpotifyTrackId(url) {
  if (!url) {
    return "";
  }

  const parts = url.split("/");
  const last = parts[parts.length - 1] || "";
  return last.split("?")[0] || "";
}
