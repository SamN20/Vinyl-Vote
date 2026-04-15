/**
 * Parse song duration into whole seconds.
 *
 * Supported inputs:
 * - number: treated as seconds (e.g. 245)
 * - numeric string seconds: "245"
 * - "MM:SS" string (e.g. "4:05")
 * - "HH:MM:SS" string (e.g. "1:04:32")
 *
 * Returns 0 for empty/invalid values.
 */
export function parseDurationToSeconds(duration) {
  if (duration === null || duration === undefined || duration === "") {
    return 0;
  }

  if (typeof duration === "number" && Number.isFinite(duration)) {
    return Math.max(0, Math.floor(duration));
  }

  const text = String(duration).trim();
  if (!text) {
    return 0;
  }

  if (/^\d+$/.test(text)) {
    return Math.max(0, Number(text));
  }

  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (parts.length === 2) {
    return Math.max(0, parts[0] * 60 + parts[1]);
  }

  if (parts.length === 3) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  return 0;
}

export function formatAlbumLength(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "Unknown";
  }

  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${totalMinutes}m`;
}

export function formatCountdown(value) {
  if (!value) {
    return "No deadline";
  }

  const end = new Date(value);
  if (Number.isNaN(end.getTime())) {
    return "Unknown deadline";
  }

  const diff = end.getTime() - Date.now();
  if (diff <= 0) {
    return "Voting closed";
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${mins}m ${secs}s`;
  }
  return `${hours}h ${mins}m ${secs}s`;
}
