import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoteCard from "./VoteCard";

function renderReadyVoteCard(overrides = {}) {
  const props = {
    albumPayload: {
      album: {
        id: 1,
        title: "Test Pressing",
        artist: "The Fixtures",
        release_date: "2026",
        songs: [
          { id: 10, title: "First Track", track_number: 1, duration: "3:12" },
        ],
      },
      user: { has_voted: false },
      vote_end: "2026-05-01T04:00:00Z",
    },
    albumScore: "",
    albumState: "ready",
    error: "",
    feedback: "",
    hasSavedVotes: false,
    hasUnsavedChanges: false,
    loadAlbum: vi.fn(),
    progressPercent: 0,
    ratedTracks: 0,
    remainingTracks: 1,
    saveVotes: vi.fn(),
    setAlbumScore: vi.fn(),
    setSongScore: vi.fn(),
    songScores: { 10: "" },
    songs: [
      { id: 10, title: "First Track", track_number: 1, duration: "3:12" },
    ],
    statusLabel: "No votes submitted",
    submitState: "idle",
    ...overrides,
  };

  render(<VoteCard {...props} />);
  return props;
}

describe("VoteCard pop-out", () => {
  afterEach(() => {
    delete window.documentPictureInPicture;
    vi.restoreAllMocks();
  });

  it("uses Document Picture-in-Picture for a compact vote card instead of opening the full page", async () => {
    const pipDocument = document.implementation.createHTMLDocument("Vote PiP");
    const pipWindow = {
      closed: false,
      document: pipDocument,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(() => {
        pipWindow.closed = true;
      }),
      focus: vi.fn(),
    };
    const requestWindow = vi.fn().mockResolvedValue(pipWindow);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: { requestWindow },
    });

    renderReadyVoteCard();

    fireEvent.click(await screen.findByRole("button", { name: "Pop out voting window" }));

    await waitFor(() => expect(requestWindow).toHaveBeenCalledWith({ width: 360, height: 620 }));
    await waitFor(() => expect(pipDocument.body.textContent).toContain("First Track"));

    expect(openSpy).not.toHaveBeenCalled();
    expect(pipDocument.body.textContent).toContain("Album score");
    expect(pipDocument.body.textContent).not.toContain("Refresh");
  });
});
