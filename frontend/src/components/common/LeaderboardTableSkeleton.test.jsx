import { render } from "@testing-library/react";
import LeaderboardTableSkeleton from "./LeaderboardTableSkeleton";

describe("LeaderboardTableSkeleton", () => {
  it("renders default number of skeleton rows", () => {
    const { container } = render(<LeaderboardTableSkeleton />);
    expect(container.querySelectorAll(".table-skeleton-row")).toHaveLength(4);
  });

  it("renders configured number of skeleton rows", () => {
    const { container } = render(<LeaderboardTableSkeleton rows={3} />);
    expect(container.querySelectorAll(".table-skeleton-row")).toHaveLength(3);
  });
});
