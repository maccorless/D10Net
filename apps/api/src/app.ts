import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { PlayResultSchema, type StartedGame } from "@daily/contracts";
import type { createPublisherService } from "./publisher.js";
import { timingSafeEqual } from "node:crypto";

const Id = z.string().max(128);
const StartBody = z.discriminatedUnion("mode", [
  z
    .object({ mode: z.literal("daily"), hintMode: z.enum(["on", "off"]) })
    .strict(),
  z
    .object({
      mode: z.literal("archive"),
      hintMode: z.enum(["on", "off"]),
      boardId: Id,
      boardVersion: z.number().int().positive(),
    })
    .strict(),
]);
const RankingParams = z.object({ gameDay: z.string().date() });
const RankingQuery = z.object({
  hintMode: z.enum(["on", "off"]),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
export type ApiServices = {
  start(
    playerId: string,
    input: z.infer<typeof StartBody>,
  ): Promise<StartedGame | unknown>;
  finish(
    playerId: string,
    playId: string,
    input: z.infer<typeof PlayResultSchema>,
  ): Promise<unknown>;
  rankings(
    gameDay: string,
    hintMode: "on" | "off",
    limit: number,
  ): Promise<unknown>;
  publisher?: ReturnType<typeof createPublisherService>;
  publicBoard?(day: string): Promise<unknown>;
  createSession?(
    playerId: string | null,
  ): Promise<{ playerId: string; token: string }>;
  archive?(playerId: string): Promise<unknown>;
  archiveDay?(playerId: string, gameDay: string): Promise<unknown>;
  resetTodayPlay?(playerId: string): Promise<void>;
  requestMagicLink?(email: string, ip: string): Promise<unknown>;
  consumeMagicLink?(token: string): Promise<{ sessionToken: string } | null>;
  resolveMergeRetry?(
    accountToken: string,
    guestToken: string,
  ): Promise<string | null>;
  mergeGuest?(
    accountId: string,
    guestToken: string,
    priorAccountToken: string,
  ): Promise<{ sessionToken: string; result: unknown }>;
};

type Bucket = { tokens: number; updated: number };
function limiter(capacity = 30, refillPerSecond = 1) {
  const buckets = new Map<string, Bucket>();
  return (key: string, now = Date.now()) => {
    const old = buckets.get(key) ?? { tokens: capacity, updated: now };
    const tokens = Math.min(
      capacity,
      old.tokens + ((now - old.updated) / 1000) * refillPerSecond,
    );
    if (tokens < 1) {
      buckets.set(key, { tokens, updated: now });
      return false;
    }
    buckets.set(key, { tokens: tokens - 1, updated: now });
    return true;
  };
}

export function createApp(
  services: ApiServices,
  options: {
    origins: string[];
    production?: boolean;
    bodyLimit?: number;
    authenticate?: (token: string | undefined) => Promise<string | null>;
    authenticateAccount?: (token: string | undefined) => Promise<string | null>;
    accountRoles?: (accountId: string) => Promise<string[]>;
    csrfToken?: (session: string) => string;
    publisherSecret?: string;
    canonicalDay?: () => string;
    remoteAddress?: (request: Request) => string;
    trustProxy?: (address: string) => boolean;
    limits?: Partial<
      Record<"start" | "finish" | "rankings" | "session" | "magicLink", number>
    >;
  } = { origins: [] },
) {
  const app = new Hono();
  app.onError(async (error, c) => {
    if (error.message === "CLOCK_ROLLBACK")
      return c.json(
        { error: "TIME_CHECK_REQUIRED", code: "CLOCK_ROLLBACK" },
        409,
      );
    if (c.req.path.startsWith("/v1/publisher/"))
      await services.publisher?.auditDenied(
        (c.get("accountId" as never) as string | undefined) ?? null,
        { path: c.req.path, method: c.req.method, reason: error.message },
      );
    return error.message === "Board not found" ||
      error.message === "Play not found"
      ? c.json({ error: "Not found" }, 404)
      : c.json({ error: "Request failed" }, 400);
  });
  const endpointLimits = {
    start: limiter(options.limits?.start ?? 10),
    finish: limiter(options.limits?.finish ?? 20),
    rankings: limiter(options.limits?.rankings ?? 60),
    session: limiter(options.limits?.session ?? 5),
  };
  const magicIp = limiter(options.limits?.magicLink ?? 5),
    magicEmail = limiter(options.limits?.magicLink ?? 5);
  app.use(
    "/v1/*",
    secureHeaders({
      strictTransportSecurity: options.production
        ? "max-age=31536000; includeSubDomains"
        : false,
      contentSecurityPolicy: undefined,
      referrerPolicy: "strict-origin-when-cross-origin",
      xContentTypeOptions: "nosniff",
    }),
  );
  app.use(
    "*",
    cors({
      origin: (origin) => (options.origins.includes(origin) ? origin : ""),
      credentials: true,
    }),
  );
  app.use(
    "/v1/*",
    bodyLimit({
      maxSize: options.bodyLimit ?? 65_536,
      onError: (c) => c.json({ error: "Request body too large" }, 413),
    }),
  );
  app.use("/v1/*", async (c, next) => {
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > (options.bodyLimit ?? 65_536))
      return c.json({ error: "Request body too large" }, 413);
    const cookieToken = c.req
      .header("cookie")
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("d10_session="))
      ?.slice("d10_session=".length);
    const token =
      c.req.header("authorization")?.replace(/^Bearer /, "") ?? cookieToken;
    const player = options.authenticate
      ? await options.authenticate(token)
      : null;
    const direct = options.remoteAddress?.(c.req.raw) ?? "unknown";
    const chain =
      c.req
        .header("x-forwarded-for")
        ?.split(",")
        .map((v) => v.trim())
        .filter(Boolean) ?? [];
    let ip = direct;
    if (options.trustProxy?.(direct))
      for (const candidate of chain.reverse()) {
        ip = candidate;
        if (!options.trustProxy(candidate)) break;
      }
    c.set("playerId" as never, player as never);
    const endpoint =
      c.req.path === "/v1/sessions"
        ? "session"
        : c.req.path.endsWith("/start")
          ? "start"
          : c.req.path.includes("/finish")
            ? "finish"
            : c.req.path.startsWith("/v1/rankings/")
              ? "rankings"
              : null;
    if (!endpoint) {
      await next();
      return;
    }
    const allow = endpointLimits[endpoint];
    if (!allow(`ip:${ip}`) || (player && !allow(`player:${player}`))) {
      c.header("Retry-After", "1");
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    await next();
  });
  app.post("/v1/sessions", async (c) => {
    if (!services.createSession)
      return c.json({ error: "Session service unavailable" }, 501);
    const session = await services.createSession(
      c.get("playerId" as never) as string | null,
    );
    c.header(
      "Set-Cookie",
      `d10_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${options.production ? "; Secure" : ""}`,
    );
    return c.json({ playerId: session.playerId }, 201);
  });
  app.post("/v1/plays/start", async (c) => {
    const parsed = StartBody.safeParse(await c.req.json().catch(() => null));
    const player = z
      .string()
      .uuid()
      .safeParse(c.get("playerId" as never));
    if (!parsed.success || !player.success)
      return c.json({ error: "Invalid request" }, 400);
    return c.json(await services.start(player.data, parsed.data));
  });
  app.post("/v1/plays/:id/finish", async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    const player = z
      .string()
      .uuid()
      .safeParse(c.get("playerId" as never));
    const parsed = PlayResultSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!id.success || !player.success || !parsed.success)
      return c.json({ error: "Invalid request" }, 400);
    return c.json(await services.finish(player.data, id.data, parsed.data));
  });
  app.delete("/v1/plays/today", async (c) => {
    const player = c.get("playerId" as never) as string | null;
    if (!player || !services.resetTodayPlay)
      return c.json({ error: "Not found" }, 404);
    await services.resetTodayPlay(player);
    return c.json({ ok: true });
  });
  app.get("/test", async (c) => {
    if (services.resetTodayPlay && options.authenticate) {
      const cookieToken = c.req
        .header("cookie")
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("d10_session="))
        ?.slice("d10_session=".length);
      const player = await options.authenticate(cookieToken);
      if (player) await services.resetTodayPlay(player);
    }
    return c.redirect("/today");
  });
  app.get("/v1/rankings/:gameDay", async (c) => {
    const params = RankingParams.safeParse(c.req.param());
    const query = RankingQuery.safeParse(c.req.query());
    if (!params.success || !query.success)
      return c.json({ error: "Invalid request" }, 400);
    return c.json(
      await services.rankings(
        params.data.gameDay,
        query.data.hintMode,
        query.data.limit,
      ),
    );
  });
  app.get("/v1/archive", async (c) => {
    const player = c.get("playerId" as never) as string | null;
    if (!player || !services.archive)
      return c.json({ error: "Not found" }, 404);
    return c.json(await services.archive(player));
  });
  app.get("/v1/archive/:gameDay", async (c) => {
    const player = c.get("playerId" as never) as string | null,
      day = z.string().date().safeParse(c.req.param("gameDay"));
    if (!player || !day.success || !services.archiveDay)
      return c.json({ error: "Not found" }, 404);
    const value = await services.archiveDay(player, day.data);
    return value === undefined
      ? c.json({ error: "Not found" }, 404)
      : c.json(value);
  });
  app.get("/v1/boards/:gameDay", async (c) => {
    const day = z.string().date().safeParse(c.req.param("gameDay"));
    if (
      !day.success ||
      day.data >
        (options.canonicalDay?.() ?? new Date().toISOString().slice(0, 10)) ||
      !services.publicBoard
    )
      return c.json({ error: "Not found" }, 404);
    const board = await services.publicBoard(day.data);
    return board === undefined
      ? c.json({ error: "Not found" }, 404)
      : c.json(board);
  });
  app.use("/v1/publisher/*", async (c, next) => {
    const bearer = (c.req.header("authorization") ?? "").trim();
    const secret = options.publisherSecret?.trim();
    console.log(
      `[publisher] path=${c.req.path} secret_set=${!!secret} bearer_prefix=${bearer.slice(0, 10)}`,
    );
    if (secret && bearer === `Bearer ${secret}`) {
      c.set("accountId" as never, null as never);
      await next();
      return;
    }
    const cookies = Object.fromEntries(
      (c.req.header("cookie") ?? "")
        .split(";")
        .map((x) => x.trim().split("=", 2)),
    );
    const actor =
      (await options.authenticateAccount?.(cookies.d10_account)) ?? null;
    const roles = actor ? ((await options.accountRoles?.(actor)) ?? []) : [];
    const header = c.req.header("x-csrf-token") ?? "",
      expected = options.csrfToken?.(cookies.d10_account ?? "") ?? header,
      cookie = cookies.d10_csrf ?? header,
      same = (a: string, b: string) => {
        const x = Buffer.from(a),
          y = Buffer.from(b);
        return x.length === y.length && timingSafeEqual(x, y);
      },
      csrf = !!header && same(header, cookie) && same(header, expected);
    if (
      !actor ||
      !roles.includes("publisher") ||
      !options.origins.includes(c.req.header("origin") ?? "") ||
      !csrf
    ) {
      await services.publisher?.auditDenied(actor, {
        path: c.req.path,
        method: c.req.method,
      });
      return c.json({ error: "Forbidden" }, 403);
    }
    c.set("accountId" as never, actor as never);
    await next();
  });
  app.get("/v1/publisher/ping", (c) => c.json({ ok: true }));
  app.post("/v1/publisher/boards", async (c) =>
    c.json(
      await services.publisher!.import(
        c.get("accountId" as never) as string,
        await c.req.json(),
      ),
      201,
    ),
  );
  app.delete("/v1/publisher/boards", async (c) => {
    await services.publisher!.deleteAll(
      c.get("accountId" as never) as string | null,
    );
    return c.json({ ok: true });
  });
  app.post("/v1/publisher/boards/bulk", async (c) =>
    c.json(
      await services.publisher!.importBulkPublished(
        c.get("accountId" as never) as string | null,
        await c.req.json(),
      ),
      201,
    ),
  );
  app.post("/v1/publisher/import/validate", async (c) =>
    c.json(
      await services.publisher!.validateImport(
        c.get("accountId" as never) as string,
        await c.req.json(),
      ),
    ),
  );
  app.get("/v1/publisher/boards/:id/:version", async (c) =>
    c.json(
      await services.publisher!.read(
        c.req.param("id"),
        Number(c.req.param("version")),
      ),
    ),
  );
  app.patch("/v1/publisher/boards/:id/:version", async (c) =>
    c.json(
      await services.publisher!.edit(
        c.get("accountId" as never) as string,
        c.req.param("id"),
        Number(c.req.param("version")),
        await c.req.json(),
      ),
    ),
  );
  app.post("/v1/publisher/boards/:id/:version/validate", async (c) =>
    c.json(
      await services.publisher!.validate(
        c.get("accountId" as never) as string,
        c.req.param("id"),
        Number(c.req.param("version")),
      ),
    ),
  );
  app.post("/v1/publisher/boards/:id/:version/schedule", async (c) => {
    const b = await c.req.json();
    return c.json(
      await services.publisher!.schedule(
        c.get("accountId" as never) as string,
        c.req.param("id"),
        Number(c.req.param("version")),
        String(b.gameDay),
      ),
    );
  });
  app.put("/v1/publisher/boards/:id/:version/schedule", async (c) => {
    const b = await c.req.json();
    return c.json(
      await services.publisher!.overrideSchedule(
        c.get("accountId" as never) as string,
        c.req.param("id"),
        Number(c.req.param("version")),
        String(b.gameDay),
      ),
    );
  });
  app.post("/v1/publisher/boards/:id/:version/publish", async (c) =>
    c.json(
      await services.publisher!.publish(
        c.get("accountId" as never) as string,
        c.req.param("id"),
        Number(c.req.param("version")),
      ),
    ),
  );
  app.post("/v1/publisher/boards/:id/:version/correct", async (c) =>
    c.json(
      await services.publisher!.correct(
        c.get("accountId" as never) as string,
        c.req.param("id"),
        Number(c.req.param("version")),
        await c.req.json(),
      ),
      201,
    ),
  );
  app.post("/v1/publisher/boards/:id/:version/retire", async (c) =>
    c.json(
      await services.publisher!.retire(
        c.get("accountId" as never) as string,
        c.req.param("id"),
        Number(c.req.param("version")),
      ),
    ),
  );
  app.post("/v1/auth/magic-link", async (c) => {
    if (!services.requestMagicLink) return c.json({ error: "Not found" }, 404);
    if (!options.origins.includes(c.req.header("origin") ?? ""))
      return c.json({ error: "Invalid origin" }, 403);
    const body = z
      .object({ email: z.string().email().max(320) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Invalid request" }, 400);
    const email = body.data.email.trim().toLowerCase(),
      ip = options.remoteAddress?.(c.req.raw) ?? "unknown",
      response = {
        message: "If the address is eligible, a sign-in link has been sent.",
      };
    if (!magicIp(ip) || !magicEmail(email)) return c.json(response);
    await services.requestMagicLink(email, ip);
    return c.json(response);
  });
  app.get("/v1/auth/callback", async (c) => {
    const token = c.req.query("token");
    if (!token || !services.consumeMagicLink)
      return c.json({ error: "Invalid or expired link" }, 400);
    const consumed = await services.consumeMagicLink(token);
    if (!consumed) return c.json({ error: "Invalid or expired link" }, 400);
    c.header(
      "Set-Cookie",
      `d10_account=${consumed.sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    );
    if (options.csrfToken)
      c.header(
        "Set-Cookie",
        `d10_csrf=${options.csrfToken(consumed.sessionToken)}; Path=/; Secure; SameSite=Strict`,
        { append: true },
      );
    return c.redirect("/publisher/");
  });
  app.post("/v1/auth/merge-guest", async (c) => {
    if (!services.mergeGuest) return c.json({ error: "Not found" }, 404);
    if (!options.origins.includes(c.req.header("origin") ?? ""))
      return c.json({ error: "Invalid origin" }, 403);
    const cookies = Object.fromEntries(
      (c.req.header("cookie") ?? "")
        .split(";")
        .map((x) => x.trim().split("=", 2)),
    );
    if (!cookies.d10_account || !cookies.d10_session)
      return c.json({ error: "Authentication required" }, 401);
    const account =
      (await options.authenticateAccount?.(cookies.d10_account)) ??
      (await services.resolveMergeRetry?.(
        cookies.d10_account,
        cookies.d10_session,
      ));
    if (!account) return c.json({ error: "Authentication required" }, 401);
    const merged = await services.mergeGuest(
      account,
      cookies.d10_session,
      cookies.d10_account,
    );
    c.header(
      "Set-Cookie",
      `d10_account=${merged.sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    );
    c.header(
      "Set-Cookie",
      `d10_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      { append: true },
    );
    return c.json(merged.result);
  });
  return app;
}
