import { render, screen } from "@testing-library/react";
import StreamingLinks from "./StreamingLinks";

describe("StreamingLinks", () => {
  it("renders full label buttons by default", () => {
    render(
      <StreamingLinks
        spotifyUrl="https://example.com/spotify"
        appleUrl="https://example.com/apple"
        youtubeUrl="https://example.com/youtube"
      />,
    );

    expect(screen.getByText("Spotify")).toBeInTheDocument();
    expect(screen.getByText("Apple Music")).toBeInTheDocument();
    expect(screen.getByText("YouTube Music")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("renders icon-only links in compact mode", () => {
    render(
      <StreamingLinks
        spotifyUrl="https://example.com/spotify"
        appleUrl="https://example.com/apple"
        mode="icons"
      />,
    );

    expect(screen.queryByText("Spotify")).not.toBeInTheDocument();
    expect(screen.queryByText("Apple Music")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open on Spotify" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open on Apple Music" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
