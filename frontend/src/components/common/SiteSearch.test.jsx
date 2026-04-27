import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteSearch from "./SiteSearch";
import { siteSearch } from "../../api";

vi.mock("../../api", () => ({
  siteSearch: vi.fn(),
}));

function renderSearch(props = {}) {
  return render(
    <MemoryRouter>
      <SiteSearch isOpen onClose={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

describe("SiteSearch", () => {
  beforeEach(() => {
    siteSearch.mockReset();
  });

  it("calls site search and renders grouped results", async () => {
    siteSearch.mockResolvedValue({
      query: "radio",
      items: {
        albums: [
          {
            type: "album",
            id: 1,
            title: "Radio Memories",
            subtitle: "The Searchers",
            url: "/results/1",
          },
        ],
        songs: [
          {
            type: "song",
            id: 7,
            title: "Signal Song",
            subtitle: "The Searchers - Radio Memories",
            url: "/results/1",
          },
        ],
        artists: [
          {
            type: "artist",
            title: "The Searchers",
            subtitle: "1 album",
            url: "/top-artists?q=The%20Searchers",
          },
        ],
      },
    });

    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "radio" } });

    await waitFor(() => expect(siteSearch).toHaveBeenCalledWith("radio"));
    expect(await screen.findByText("Albums")).toBeInTheDocument();
    expect(screen.getByText("Radio Memories")).toBeInTheDocument();
    expect(screen.getByText("Signal Song")).toBeInTheDocument();
    expect(screen.getAllByText("The Searchers").length).toBeGreaterThan(0);
  });

  it("renders an empty state", async () => {
    siteSearch.mockResolvedValue({
      query: "zzzz",
      items: { albums: [], songs: [], artists: [] },
    });

    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz" } });

    expect(await screen.findByText('No results found for "zzzz".')).toBeInTheDocument();
  });

  it("closes with Escape and the close button", () => {
    const onClose = vi.fn();
    renderSearch({ onClose });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes after selecting a result", async () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    siteSearch.mockResolvedValue({
      query: "radio",
      items: {
        albums: [{ type: "album", id: 1, title: "Radio Memories", url: "/results/1" }],
        songs: [],
        artists: [],
      },
    });

    renderSearch({ onClose, onNavigate });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "radio" } });

    fireEvent.click(await screen.findByRole("link", { name: "Radio Memories" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
