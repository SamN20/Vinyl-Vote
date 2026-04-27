import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Header from "./Header";

function renderHeader(overrides = {}) {
  return render(
    <MemoryRouter>
      <Header
        loginHref="/login"
        route="/home"
        sessionInfo={null}
        sessionState="anonymous"
        theme="dark"
        toggleTheme={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("Header", () => {
  it("opens the site search palette from the header icon", () => {
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Open site search" }));

    expect(screen.getByRole("dialog", { name: "Find music" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });
});
