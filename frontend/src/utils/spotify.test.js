import { getSpotifyTrackId } from "./spotify";

describe("getSpotifyTrackId", () => {
  it("extracts track id from spotify URL with query params", () => {
    const id = getSpotifyTrackId("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123");
    expect(id).toBe("4cOdK2wGLETKBW3PvgPWqT");
  });

  it("returns empty string for empty values", () => {
    expect(getSpotifyTrackId("")).toBe("");
    expect(getSpotifyTrackId(null)).toBe("");
    expect(getSpotifyTrackId(undefined)).toBe("");
  });
});
