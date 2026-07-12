import { describe, expect, it } from "vitest";
import { applyDailyResult, emptyStreaks } from "./streaks.js";

describe("applyDailyResult", () => {
  it("increments each qualifying daily streak", () => {
    const next = applyDailyResult(emptyStreaks, { score: 10, answersFound: 10, hintMode: "off" }, "2026-07-11");
    expect(next.played.current).toBe(1);
    expect(next.fivePlus.current).toBe(1);
    expect(next.perfect.current).toBe(1);
    expect(next.noHint.current).toBe(1);
  });

  it("does not count archive results", () => {
    expect(applyDailyResult(emptyStreaks, { score: 10, answersFound: 10, hintMode: "off" }, "archive").played.current).toBe(0);
  });
  it("requires a perfect Hints Off result for No-Hint Perfect", () => {
    expect(applyDailyResult(emptyStreaks, { score: 4, answersFound: 4, hintMode: "off" }, "2026-07-11").noHint.current).toBe(0);
  });

  it("resets missed calendar-day streaks and is idempotent for a day", () => {
    const first = applyDailyResult(emptyStreaks, { score: 5, answersFound: 5, hintMode: "on" }, "2026-07-09");
    const duplicate = applyDailyResult(first, { score: 5, answersFound: 5, hintMode: "on" }, "2026-07-09");
    const missed = applyDailyResult(duplicate, { score: 1, answersFound: 1, hintMode: "on" }, "2026-07-11");
    expect(duplicate.played.current).toBe(1);
    expect(missed.played.current).toBe(1);
    expect(missed.fivePlus.current).toBe(0);
  });
});
