import { describe, expect, it, vi } from "vitest";
import { buildShareText, shareResult } from "./share";
import { render, screen } from "@testing-library/react";
import { Results } from "./Results";

const result = {
  score: 11,
  answersFound: 10,
  hintMode: "on" as const,
  hintUsed: false,
  strikes: 0,
  elapsedMs: 42_000,
  title: "Greatest Billboard #1 Singles of All Time",
};

describe("result sharing", () => {
  it("labels the result, includes the board title, and emits a ten-cell grid without answer names", () => {
    const text = buildShareText({
      ...result,
      answerNames: ["SECRET"],
    } as never);
    expect(text).toContain("Greatest Billboard #1 Singles of All Time");
    expect(text).toContain("11 points · 10/10 · Hints On—Unused");
    expect(text).toContain("🏆 It Goes to 11");
    expect(text).not.toContain("SECRET");
    expect(text.match(/[🟩⬜]/gu)).toHaveLength(10);
  });

  it("copies the identical share text when Web Share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await shareResult(result, { clipboard: { writeText } });
    expect(writeText).toHaveBeenCalledWith(buildShareText(result));
  });
  it("puts streaks before countdown and reveals misses distinctly under reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(
      <Results
        result={result}
        streak={3}
        bestStreak={8}
        nextBoardAt={new Date(Date.now() + 10_000)}
        missedAnswers={[{ label: "Missed", rank: 3 }]}
      />,
    );
    const streak = screen.getByText(/Streak 3/),
      countdown = screen.getByText(/Next board/);
    expect(
      streak.compareDocumentPosition(countdown) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Missed").closest("li")).toHaveClass(
      "revealed-immediately",
    );
    vi.unstubAllGlobals();
  });

  it("renders wrong guesses with their correct rank position", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(
      <Results
        result={result}
        streak={0}
        bestStreak={0}
        nextBoardAt={new Date(Date.now() + 10_000)}
        wrongGuesses={[
          { label: "Wrong Song", rank: 14 },
          { label: "Off List Song", rank: null },
        ]}
      />,
    );
    expect(screen.getByText("Wrong Song")).toBeInTheDocument();
    expect(screen.getByText("#14")).toBeInTheDocument();
    expect(screen.getByText("Off List Song")).toBeInTheDocument();
    expect(screen.getByText("Not in top 10")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders found answers in guess order", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(
      <Results
        result={{ ...result, answersFound: 2, score: 2 }}
        streak={0}
        bestStreak={0}
        nextBoardAt={new Date(Date.now() + 10_000)}
        foundInOrder={[
          { label: "Blinding Lights", rank: 1 },
          { label: "Shape of You", rank: 2 },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    const labels = items.map((li) => li.textContent ?? "");
    const blinding = labels.findIndex((t) => t.includes("Blinding Lights"));
    const shape = labels.findIndex((t) => t.includes("Shape of You"));
    expect(blinding).toBeLessThan(shape);
    vi.unstubAllGlobals();
  });
});
