import { describe, expect, it, beforeEach } from "vitest";
import { recordPlay, getPlayHistory } from "./history";

describe("play history", () => {
  beforeEach(() => localStorage.clear());

  it("records a daily play", () => {
    recordPlay("2026-07-12", "daily");
    expect(getPlayHistory()["2026-07-12"]).toBe("daily");
  });

  it("records an archive play", () => {
    recordPlay("2026-07-10", "archive");
    expect(getPlayHistory()["2026-07-10"]).toBe("archive");
  });

  it("daily mode wins if re-recorded over archive", () => {
    recordPlay("2026-07-11", "archive");
    recordPlay("2026-07-11", "daily");
    expect(getPlayHistory()["2026-07-11"]).toBe("daily");
  });

  it("returns empty object when nothing recorded", () => {
    expect(getPlayHistory()).toEqual({});
  });
});
