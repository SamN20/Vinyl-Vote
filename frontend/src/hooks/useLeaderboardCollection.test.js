import { parseInitialQuery } from "./useLeaderboardCollection";

describe("parseInitialQuery", () => {
  const defaults = {
    page: 1,
    per_page: 25,
    q: "",
    sort_by: "avg_score",
    sort_dir: "desc",
    min_ratings: 3,
  };

  afterEach(() => {
    window.location.hash = "";
  });

  it("parses numeric parameters as numbers", () => {
    window.location.hash = "#/top-songs?page=2&per_page=10&min_ratings=5";

    const parsed = parseInitialQuery("/top-songs", defaults);

    expect(parsed.page).toBe(2);
    expect(parsed.per_page).toBe(10);
    expect(parsed.min_ratings).toBe(5);
  });

  it("parses string parameters", () => {
    window.location.hash = "#/top-songs?q=metallica&sort_by=title&sort_dir=asc";

    const parsed = parseInitialQuery("/top-songs", defaults);

    expect(parsed.q).toBe("metallica");
    expect(parsed.sort_by).toBe("title");
    expect(parsed.sort_dir).toBe("asc");
  });

  it("uses defaults for missing parameters", () => {
    window.location.hash = "#/top-songs?q=power";

    const parsed = parseInitialQuery("/top-songs", defaults);

    expect(parsed.q).toBe("power");
    expect(parsed.page).toBe(defaults.page);
    expect(parsed.per_page).toBe(defaults.per_page);
    expect(parsed.min_ratings).toBe(defaults.min_ratings);
  });

  it("falls back to default for invalid numeric parameters", () => {
    window.location.hash = "#/top-songs?page=not-a-number&per_page=oops&min_ratings=NaN";

    const parsed = parseInitialQuery("/top-songs", defaults);

    expect(parsed.page).toBe(defaults.page);
    expect(parsed.per_page).toBe(defaults.per_page);
    expect(parsed.min_ratings).toBe(defaults.min_ratings);
  });

  it("returns defaults when hash path does not match route", () => {
    window.location.hash = "#/top-artists?page=3&q=abc";

    const parsed = parseInitialQuery("/top-songs", defaults);

    expect(parsed).toEqual(defaults);
  });
});
