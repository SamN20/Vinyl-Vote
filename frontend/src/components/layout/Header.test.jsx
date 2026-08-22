import { fireEvent, render } from "@testing-library/react";
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
  it("hides after a meaningful downward scroll and returns on the way back up", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 220 });
    renderHeader();

    fireEvent.scroll(window);
    expect(document.querySelector(".site-header")).toHaveClass("is-hidden");

    Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
    fireEvent.scroll(window);
    expect(document.querySelector(".site-header")).not.toHaveClass("is-hidden");
  });
});
