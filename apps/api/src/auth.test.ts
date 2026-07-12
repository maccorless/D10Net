import {describe,expect,it} from "vitest";
import {mergeGuestRecords,normalizeEmail,tokenHash} from "./auth.js";
describe("auth",()=>{
 it("normalizes email and hashes tokens without retaining raw credentials",()=>{expect(normalizeEmail(" A@Example.COM ")).toBe("a@example.com");expect(tokenHash("secret","pepper")).not.toContain("secret")});
 it("merges append-only records by play id and player/day",()=>{const account={plays:[{id:"a",gameDay:"2026-07-01",mode:"daily" as const,completed:true}],achievements:["one"]};const guest={plays:[{id:"g",gameDay:"2026-07-01",mode:"daily" as const,completed:false},{id:"z",gameDay:"2026-06-30",mode:"archive" as const,completed:true}],achievements:["one","two"]};expect(mergeGuestRecords(account,guest)).toMatchObject({duplicateDailyResults:0,plays:[account.plays[0],guest.plays[1]],achievements:["one","two"]})});
});
