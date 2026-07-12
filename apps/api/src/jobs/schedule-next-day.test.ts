import {describe,expect,it} from "vitest";
import {nextGameDay} from "./schedule-next-day.js";

describe("schedule-next-day date policy",()=>{
  it("uses the default New York canonical day before 05:00Z",()=>{expect(nextGameDay(new Date("2026-01-15T04:59:59Z"))).toBe("2026-01-15")});
  it("advances after New York midnight",()=>{expect(nextGameDay(new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-16")});
  it("honors daylight-saving midnight",()=>{expect(nextGameDay(new Date("2026-07-11T03:59:59Z"))).toBe("2026-07-11");expect(nextGameDay(new Date("2026-07-11T04:00:00Z"))).toBe("2026-07-12")});
  it("honors a configured canonical timezone",()=>{expect(nextGameDay(new Date("2026-07-11T06:30:00Z"),"America/Los_Angeles")).toBe("2026-07-11")});
  it("increments month and year boundaries as calendar dates",()=>{expect(nextGameDay(new Date("2026-12-31T17:00:00Z"),"UTC")).toBe("2027-01-01")});
});
