import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

const player = "00000000-0000-4000-8000-000000000001";
const services = { start: vi.fn(async () => ({ ok: true })), finish: vi.fn(async () => ({ ok: true })), rankings: vi.fn(async () => []), createSession: vi.fn(async () => ({ playerId: player, token: "token" })) };
const app = () => createApp(services, { origins: ["https://daily.test"], limits: { rankings: 1 }, authenticate: async token => token === "good" ? player : null, remoteAddress: () => "203.0.113.8" });

describe("API boundary", () => {
  it("returns a stable typed clock rollback error", async () => {
    const instance = createApp({ ...services, start: vi.fn(async () => { throw new Error("CLOCK_ROLLBACK"); }) }, { origins: [], authenticate: async () => player });
    const response = await instance.request("/v1/plays/start", { method: "POST", headers: { authorization: "Bearer x", "content-type": "application/json" }, body: JSON.stringify({ mode: "daily", hintMode: "off" }) });
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "TIME_CHECK_REQUIRED", code: "CLOCK_ROLLBACK" });
  });
  it("allows only configured CORS origins and sends restrictive headers", async () => {
    const response = await app().request("/v1/rankings/2026-07-11?hintMode=off", { headers: { origin: "https://daily.test" } });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://daily.test");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    const denied = await app().request("/v1/rankings/2026-07-11?hintMode=off", { headers: { origin: "https://evil.test" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects malformed JSON and unauthenticated play starts", async () => {
    const response = await app().request("/v1/plays/start", { method: "POST", headers: { authorization: "Bearer bad", "content-type": "application/json" }, body: "{" });
    expect(response.status).toBe(400);
  });

  it("uses endpoint-specific buckets and returns Retry-After", async () => {
    const instance = app();
    expect((await instance.request("/v1/rankings/2026-07-11?hintMode=off")).status).toBe(200);
    const limited = await instance.request("/v1/rankings/2026-07-11?hintMode=off");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("1");
    const start = await instance.request("/v1/plays/start", { method: "POST", headers: { authorization: "Bearer good", "content-type": "application/json" }, body: JSON.stringify({ mode: "daily", hintMode: "off" }) });
    expect(start.status).toBe(200);
  });

  it("caps bodies even without trusting Content-Length", async () => {
    const instance = createApp(services, { origins: [], bodyLimit: 16 });
    const response = await instance.request("/v1/plays/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "daily", hintMode: "off" }) });
    expect(response.status).toBe(413);
  });

  it("discriminates daily and archive start bodies", async () => {
    const instance = app(); const headers = { authorization: "Bearer good", "content-type": "application/json" };
    expect((await instance.request("/v1/plays/start", { method: "POST", headers, body: JSON.stringify({ mode: "daily", hintMode: "off", boardId: "secret" }) })).status).toBe(400);
    expect((await instance.request("/v1/plays/start", { method: "POST", headers, body: JSON.stringify({ mode: "archive", hintMode: "off" }) })).status).toBe(400);
  });

  it("ignores forwarded addresses unless the direct peer is trusted", async () => {
    const instance = createApp(services, { origins: [], limits: { rankings: 1 }, remoteAddress: () => "203.0.113.8", trustProxy: ip => ip === "10.0.0.1" });
    const path = "/v1/rankings/2026-07-11?hintMode=off";
    expect((await instance.request(path, { headers: { "x-forwarded-for": "1.1.1.1" } })).status).toBe(200);
    expect((await instance.request(path, { headers: { "x-forwarded-for": "2.2.2.2" } })).status).toBe(429);
  });

  it("rate limits session creation independently", async () => {
    const instance = createApp(services, { origins: [], limits: { session: 1 }, remoteAddress: () => "192.0.2.9" });
    expect((await instance.request("/v1/sessions", { method: "POST" })).status).toBe(201);
    expect((await instance.request("/v1/sessions", { method: "POST" })).status).toBe(429);
    expect((await instance.request("/missing")).status).toBe(404);
  });

  it("mints an HttpOnly guest cookie without returning its secret and accepts it for play calls", async () => {
    const instance = createApp({ ...services, createSession: vi.fn(async () => ({ playerId: player, token: "good" })) }, { origins: [], authenticate: async token => token === "good" ? player : null, production: true });
    const session = await instance.request("/v1/sessions", { method: "POST" });
    expect(await session.json()).toEqual({ playerId: player });
    const cookie = session.headers.get("set-cookie")!;
    expect(cookie).toMatch(/d10_session=good/); expect(cookie).toMatch(/HttpOnly/); expect(cookie).toMatch(/Secure/); expect(cookie).toMatch(/SameSite=Lax/);
    const start = await instance.request("/v1/plays/start", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ mode: "daily", hintMode: "off" }) });
    expect(start.status).toBe(200);
    const finish = await instance.request(`/v1/plays/${player}/finish`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ playId: player, guesses: [], hintUsed: false, finishedAt: "2026-07-11T12:01:00.000Z" }) });
    expect(finish.status).toBe(200);
  });
  it("requires simultaneous account and guest proof and clears guest only after merge",async()=>{const mergeGuest=vi.fn(async()=>({sessionToken:"rotated",result:{merged:true}}));const instance=createApp({...services,mergeGuest},{origins:["https://daily.test"],authenticateAccount:async t=>t==="account"?"acct":null});const missing=await instance.request("/v1/auth/merge-guest",{method:"POST",headers:{origin:"https://daily.test",cookie:"d10_account=account"}});expect(missing.status).toBe(401);expect(mergeGuest).not.toHaveBeenCalled();const ok=await instance.request("/v1/auth/merge-guest",{method:"POST",headers:{origin:"https://daily.test",cookie:"d10_account=account; d10_session=guest"}});expect(ok.status).toBe(200);expect(mergeGuest).toHaveBeenCalledWith("acct","guest","account");expect(ok.headers.get("set-cookie")).toContain("d10_account=rotated");expect(ok.headers.get("set-cookie")).toContain("d10_session=")});
  it("replays a lost merge response only through its exact bounded receipt",async()=>{let active=true;const mergeGuest=vi.fn(async()=>{active=false;return {sessionToken:"same-new-token",result:{merged:true}}}),resolveMergeRetry=vi.fn(async(a,g)=>a==="old"&&g==="guest"?"acct":null);const instance=createApp({...services,mergeGuest,resolveMergeRetry},{origins:["https://daily.test"],authenticateAccount:async t=>active&&t==="old"?"acct":t==="same-new-token"?"acct":null});const request=()=>instance.request("/v1/auth/merge-guest",{method:"POST",headers:{origin:"https://daily.test",cookie:"d10_account=old; d10_session=guest"}});const first=await request(),retry=await request();expect(first.headers.get("set-cookie")).toContain("d10_account=same-new-token");expect(retry.headers.get("set-cookie")).toContain("d10_account=same-new-token");expect(resolveMergeRetry).toHaveBeenCalledWith("old","guest");expect(await instance.request("/v1/auth/merge-guest",{method:"POST",headers:{origin:"https://daily.test",cookie:"d10_account=old; d10_session=wrong"}})).toHaveProperty("status",401)});
  it("limits magic links by normalized email and emits uniform responses",async()=>{const requestMagicLink=vi.fn(async()=>({}));const instance=createApp({...services,requestMagicLink},{origins:["https://daily.test"],limits:{magicLink:1},remoteAddress:()=>"ip"});const request=(email:string)=>instance.request("/v1/auth/magic-link",{method:"POST",headers:{origin:"https://daily.test","content-type":"application/json"},body:JSON.stringify({email})});expect((await request("A@EXAMPLE.COM")).status).toBe(200);expect((await request("a@example.com")).status).toBe(200);expect(requestMagicLink).toHaveBeenCalledTimes(1)});
  it("sets secure account cookie only after single-use callback succeeds",async()=>{const consumeMagicLink=vi.fn(async t=>t==="once"?{sessionToken:"session"}:null);const instance=createApp({...services,consumeMagicLink},{origins:[]});const bad=await instance.request("/v1/auth/callback?token=expired");expect(bad.status).toBe(400);expect(bad.headers.get("set-cookie")).toBeNull();const ok=await instance.request("/v1/auth/callback?token=once");expect(ok.headers.get("set-cookie")).toMatch(/d10_account=session.*HttpOnly.*Secure.*SameSite=Lax/)});
  it("returns 404 when archive detail service withholds a future day",async()=>{const instance=createApp({...services,archiveDay:vi.fn(async()=>undefined)},{origins:[],authenticate:async()=>player});expect((await instance.request("/v1/archive/2099-01-01",{headers:{authorization:"Bearer x"}})).status).toBe(404)});
});
