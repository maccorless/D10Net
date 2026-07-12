import { describe, expect, it } from "vitest";
import { evaluateAchievements } from "./achievements";

describe("evaluateAchievements", () => {
  it("unlocks perfect finish achievements", () => {
    expect(evaluateAchievements([], { score: 11, answersFound: 10, hintMode: "off", hintUsed: false, strikes: 0, elapsedMs: 42_000, mode: "daily", tags: ["geography"] }))
      .toEqual(expect.arrayContaining(["it-goes-to-11", "first-perfect-ten", "perfect-hints-off", "five-strikes-remaining"]));
  });
  it("does not award daily achievements for archive play", () => {
    expect(evaluateAchievements([], { score: 10, answersFound: 10, hintMode: "on", hintUsed: true, strikes: 1, elapsedMs: 60_000, mode: "archive", tags: ["sports"] })).not.toContain("daily-perfect");
  });
  it("is idempotent against already unlocked achievements", () => {
    expect(evaluateAchievements([{ achievementId: "it-goes-to-11" }], { score: 11, answersFound: 10, hintMode: "off", hintUsed: false, strikes: 0, elapsedMs: 1, mode: "daily", tags: [] })).not.toContain("it-goes-to-11");
  });
});
