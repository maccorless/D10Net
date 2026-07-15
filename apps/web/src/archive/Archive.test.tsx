import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Archive, type ArchiveEntry } from "./Archive";

const entries: ArchiveEntry[] = [
  { gameDay: "2026-07-10", status: "played-daily", result: { score: 10 } },
  { gameDay: "2026-07-11", status: "played-archive", result: { score: 7 } },
  { gameDay: "2026-07-12", status: "playable" },
];

describe("Archive calendar", () => {
  it("renders a month heading", () => {
    render(<Archive entries={entries} onPlay={vi.fn()} onReview={vi.fn()} />);
    expect(screen.getByText(/July 2026/i)).toBeInTheDocument();
  });

  it("marks played-daily days with a distinct class", () => {
    const { container } = render(
      <Archive entries={entries} onPlay={vi.fn()} onReview={vi.fn()} />,
    );
    const dailyCell = container.querySelector('[data-status="played-daily"]');
    expect(dailyCell).toBeInTheDocument();
  });

  it("marks played-archive days with a distinct class", () => {
    const { container } = render(
      <Archive entries={entries} onPlay={vi.fn()} onReview={vi.fn()} />,
    );
    const archiveCell = container.querySelector(
      '[data-status="played-archive"]',
    );
    expect(archiveCell).toBeInTheDocument();
  });

  it("calls onPlay when a playable day is clicked", () => {
    const onPlay = vi.fn();
    render(<Archive entries={entries} onPlay={onPlay} onReview={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /play.*jul.*12/i }));
    expect(onPlay).toHaveBeenCalledWith("2026-07-12");
  });

  it("calls onReview when a played-daily day is clicked", () => {
    const onReview = vi.fn();
    render(<Archive entries={entries} onPlay={vi.fn()} onReview={onReview} />);
    fireEvent.click(screen.getByRole("button", { name: /review.*jul.*10/i }));
    expect(onReview).toHaveBeenCalledWith("2026-07-10");
  });
});
