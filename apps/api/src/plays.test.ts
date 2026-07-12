import { describe, expect, it } from "vitest";
import { validCitiesBoard } from "@daily/test-data/boards";
import { canonicalGameDay } from "./date-policy.js";
import { verifySubmission } from "./plays.js";
import { sortRankings } from "./rankings.js";

const play = { id: "00000000-0000-4000-8000-000000000001", startedAt: new Date("2026-07-11T12:00:00Z"), hintMode: "off" as const, gameDay: "2026-07-11" };

describe("authoritative play verification", () => {
  const event = (candidateId: string, atMs: number) => ({ candidateId, calledNumberOne: false, atMs });
  it("rejects unfinished replays and validates actual hint use", () => {
    expect(() => verifySubmission(play, { playId: play.id, guesses: [], hintUsed: false, finishedAt: "2026-07-11T12:01:00Z" }, validCitiesBoard, new Date())).toThrow(/not complete/i);
    expect(() => verifySubmission(play, { playId: play.id, guesses: [event(validCitiesBoard.ranked[0]!, 1)], hintUsed: false, finishedAt: "2026-07-11T12:01:00Z" }, validCitiesBoard, new Date())).toThrow(/not complete/i);
    const all = validCitiesBoard.ranked.map(event);
    expect(() => verifySubmission(play, { playId: play.id, guesses: all, hintUsed: true, finishedAt: "2026-07-11T12:01:00Z" }, validCitiesBoard, new Date())).toThrow(/hint/i);
    const on = { ...play, hintMode: "on" as const };
    expect(verifySubmission(on, { playId: play.id, guesses: all, hintUsed: true, finishedAt: "2026-07-11T12:01:00Z" }, validCitiesBoard, new Date()).hintUsed).toBe(true);
    expect(verifySubmission(on, { playId: play.id, guesses: all, hintUsed: false, finishedAt: "2026-07-11T12:01:00Z" }, validCitiesBoard, new Date()).hintUsed).toBe(false);
  });
  it("uses server elapsed time and replayed score", () => {
    const guesses = validCitiesBoard.ranked.map((candidateId, index) => ({ candidateId, calledNumberOne: index === 0, atMs: index * 100 }));
    const result = verifySubmission(play, { playId: play.id, guesses, hintUsed: false, finishedAt: "2026-07-11T12:00:01Z", score: 0, elapsedMs: 1 } as never, validCitiesBoard, new Date("2026-07-11T12:01:00Z"));
    expect(result.score).toBe(11);
    expect(result.elapsedMs).toBe(60_000);
    expect(result.gameDay).toBe("2026-07-11");
  });

  it("rejects non-monotonic timestamps and too many guesses", () => {
    const event = (candidateId: string, atMs: number) => ({ candidateId, calledNumberOne: false, atMs });
    expect(() => verifySubmission(play, { playId: play.id, guesses: [event(validCitiesBoard.universe[0]!.id, 2), event(validCitiesBoard.universe[1]!.id, 1)], hintUsed: false, finishedAt: "2026-07-11T12:01:00Z" }, validCitiesBoard, new Date())).toThrow(/monotonic/i);
    const guesses = Array.from({ length: validCitiesBoard.universe.length + 1 }, (_, i) => event(String(i), i));
    expect(() => verifySubmission(play, { playId: play.id, guesses, hintUsed: false, finishedAt: "2026-07-11T12:01:00Z" }, validCitiesBoard, new Date())).toThrow(/guess count/i);
  });
});

it("excludes impossible-time results while retaining an audit reason", () => {
  const guesses = validCitiesBoard.ranked.map((candidateId, atMs) => ({ candidateId, calledNumberOne: false, atMs }));
  const result = verifySubmission(play, { playId: play.id, guesses, hintUsed: false, finishedAt: "2026-07-11T12:00:01Z" }, validCitiesBoard, new Date("2026-07-11T12:00:01Z"));
  expect(result.rankingEligible).toBe(false);
  expect(result.anomaly).toBe("impossible_time");
});

it("uses the configured server zone", () => expect(canonicalGameDay(new Date("2026-07-11T03:00:00Z"))).toBe("2026-07-10"));
it("sorts by score, elapsed time, then acceptance", () => expect(sortRankings([{ score: 10, elapsedMs: 20_000, acceptedAt: 3 }, { score: 11, elapsedMs: 40_000, acceptedAt: 2 }, { score: 10, elapsedMs: 10_000, acceptedAt: 1 }]).map(r => r.score)).toEqual([11, 10, 10]));
