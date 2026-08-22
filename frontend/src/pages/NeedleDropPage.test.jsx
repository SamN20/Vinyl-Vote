import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NeedleDropPage from "./NeedleDropPage";

vi.mock("../api", () => ({
  createNeedleDropEndlessRound: vi.fn(),
  getNeedleDropDaily: vi.fn(),
  getNeedleDropEndlessOptions: vi.fn(),
  searchNeedleDropCatalog: vi.fn(),
  submitNeedleDropDailyAttempt: vi.fn(),
  submitNeedleDropEndlessAttempt: vi.fn(),
}));

import {
  createNeedleDropEndlessRound,
  getNeedleDropDaily,
  getNeedleDropEndlessOptions,
  searchNeedleDropCatalog,
  submitNeedleDropDailyAttempt,
} from "../api";

const dailyPayload = {
  session_id: 7,
  mode: "daily",
  status: "active",
  attempts_used: 0,
  max_attempts: 6,
  clip_lengths: [0.75, 1.5, 3, 6, 12, 20],
  next_clip_length: 0.75,
  attempts: [],
  preview_url: "/api/v1/needle-drop/preview/7",
  daily: {
    date: "2026-08-21",
    expired: false,
    clip_offset_seconds: 4,
    stats_available: false,
  },
};

describe("NeedleDropPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNeedleDropDaily.mockResolvedValue(dailyPayload);
    getNeedleDropEndlessOptions.mockResolvedValue({ presets: [], genres: [], difficulties: [] });
    createNeedleDropEndlessRound.mockResolvedValue({ ...dailyPayload, mode: "endless" });
    searchNeedleDropCatalog.mockResolvedValue({
      items: [{ type: "song", id: 42, label: "Drop One — The Needles", title: "Drop One", artist: "The Needles" }],
    });
    submitNeedleDropDailyAttempt.mockResolvedValue({
      ...dailyPayload,
      status: "won",
      attempts_used: 1,
      attempts: [{ attempt_number: 1, guess_type: "song", result: "correct", clip_length: 0.75 }],
      result: "correct",
      share_text: "Needle Drop 2026-08-21 1/6",
      reveal: {
        song: {
          id: 42,
          title: "Drop One",
          artist: "The Needles",
          spotify_url: "https://open.spotify.com/track/abc123",
          album: { id: 2, title: "Past", artist: "The Needles", cover_url: "" },
        },
        user_context: {
          song_rating: 5,
          album_rating: 4,
          faceoff: { wins: 2, losses: 1, total: 3 },
          message: "You had this one rated high.",
        },
      },
    });
  });

  it("submits a daily guess and shows the reveal card", async () => {
    render(<NeedleDropPage />);

    expect(await screen.findByText("Daily Drop")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Guess"), { target: { value: "Drop" } });
    fireEvent.click(await screen.findByText("Drop One — The Needles"));
    fireEvent.click(screen.getByRole("button", { name: /Guess/i }));

    await waitFor(() => expect(submitNeedleDropDailyAttempt).toHaveBeenCalledWith({ guess_type: "song", song_id: 42 }));
    expect(await screen.findByText("Answer")).toBeInTheDocument();
    expect(screen.getByText("Drop One")).toBeInTheDocument();
    expect(screen.getByText(/Copy Share/)).toBeInTheDocument();
  });

  it("keeps the winning clip length highlighted after a correct guess", async () => {
    submitNeedleDropDailyAttempt.mockResolvedValueOnce({
      ...dailyPayload,
      status: "won",
      attempts_used: 4,
      next_clip_length: 12,
      result: "correct",
      attempts: [
        { attempt_number: 1, guess_type: "skip", result: "skipped", clip_length: 0.75 },
        { attempt_number: 2, guess_type: "skip", result: "skipped", clip_length: 1.5 },
        { attempt_number: 3, guess_type: "skip", result: "skipped", clip_length: 3 },
        { attempt_number: 4, guess_type: "song", result: "correct", clip_length: 6 },
      ],
      reveal: {
        song: {
          id: 42,
          title: "Drop One",
          artist: "The Needles",
          spotify_url: "",
          album: { id: 2, title: "Past", artist: "The Needles", cover_url: "" },
        },
        user_context: {
          song_rating: null,
          album_rating: null,
          faceoff: { wins: 0, losses: 0, total: 0 },
          message: "Fresh pull from the catalog.",
        },
      },
    });

    render(<NeedleDropPage />);

    expect(await screen.findByText("Daily Drop")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Guess"), { target: { value: "Drop" } });
    fireEvent.click(await screen.findByText("Drop One — The Needles"));
    fireEvent.click(screen.getByRole("button", { name: /Guess/i }));

    await screen.findByText("Answer");
    expect(document.querySelector(".needle-progress .current")?.textContent).toBe("6s");
  });

  it("submits a skipped attempt for more clip length", async () => {
    submitNeedleDropDailyAttempt.mockResolvedValueOnce({
      ...dailyPayload,
      attempts_used: 1,
      next_clip_length: 1.5,
      result: "skipped",
      attempts: [{ attempt_number: 1, guess_type: "skip", result: "skipped", clip_length: 0.75 }],
    });

    render(<NeedleDropPage />);

    expect(await screen.findByText("Daily Drop")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /More Clip/i }));

    await waitFor(() => expect(submitNeedleDropDailyAttempt).toHaveBeenCalledWith({ guess_type: "skip" }));
    expect(await screen.findByText("Skipped. More of the clip unlocked.")).toBeInTheDocument();
  });

  it("opens a genre picker and starts endless with the selected genre", async () => {
    getNeedleDropEndlessOptions.mockResolvedValueOnce({
      presets: [
        { key: "everything", label: "Everything" },
        { key: "genre", label: "Genre Challenge" },
      ],
      genres: ["rock", "synth-pop"],
      difficulties: [],
    });
    createNeedleDropEndlessRound.mockResolvedValue({ ...dailyPayload, mode: "endless" });

    render(<NeedleDropPage />);

    expect(await screen.findByText("Daily Drop")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Endless/i }));
    expect(await screen.findByText("Genre Challenge")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Genre Challenge" }));

    expect(await screen.findByRole("dialog", { name: /Pick a genre/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "rock" }));

    await waitFor(() => expect(createNeedleDropEndlessRound).toHaveBeenLastCalledWith({ filter_key: "genre", genre: "rock" }));
  });
});
