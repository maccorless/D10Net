import { describe, expect, it, vi } from "vitest";
import { buildShareText, shareResult } from "./share";
import {render,screen} from "@testing-library/react";import {Results} from "./Results";

const result = { score: 11, answersFound: 10, hintMode: "on" as const, hintUsed: false, strikes: 0, elapsedMs: 42_000 };

describe("result sharing", () => {
  it("labels the result and emits a ten-cell grid without answer names", () => {
    const text = buildShareText({ ...result, answerNames: ["SECRET"] } as never);
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
  it("puts streaks before countdown and reveals misses distinctly under reduced motion",()=>{vi.stubGlobal("matchMedia",()=>({matches:true}));render(<Results result={result} streak={3} bestStreak={8} nextBoardAt={new Date(Date.now()+10_000)} missedAnswers={["Missed"]}/>);const streak=screen.getByText(/Streak 3/),countdown=screen.getByText(/Next board/);expect(streak.compareDocumentPosition(countdown)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();expect(screen.getByText("Missed")).toHaveClass("revealed-immediately");vi.unstubAllGlobals()});
});
