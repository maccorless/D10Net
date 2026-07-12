import { createApp } from "./app.js";
import {
  createPostgresAuthServices,
  createPostgresServices,
} from "./postgres-service.js";
import type { EmailAdapter } from "./auth.js";
import postgres from "postgres";
import { createPublisherService } from "./publisher.js";
import { DrizzlePublisherRepository } from "./publisher-repository.js";
import { serve } from "@hono/node-server";
import { serveStatic } from "hono/node";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

export function composeApp(config: {
  databaseUrl: string;
  origins: string[];
  authenticate: (token: string | undefined) => Promise<string | null>;
  production?: boolean;
  remoteAddress: (request: Request) => string;
  trustProxy?: (address: string) => boolean;
}) {
  return createApp(createPostgresServices(config.databaseUrl), config);
}

export function composeProductionApp(config: {
  databaseUrl: string;
  origins: string[];
  pepper: string;
  email: EmailAdapter;
  production?: boolean;
  remoteAddress: (request: Request) => string;
  trustProxy?: (address: string) => boolean;
}) {
  const game = createPostgresServices(config.databaseUrl, {
      pepper: config.pepper,
    }),
    auth = createPostgresAuthServices(config.databaseUrl, {
      pepper: config.pepper,
      email: config.email,
    }),
    publisher = createPublisherService(
      new DrizzlePublisherRepository(postgres(config.databaseUrl)),
    );
  return createApp(
    { ...game, ...auth, publisher },
    {
      ...config,
      authenticate: auth.authenticateGuest,
      authenticateAccount: auth.authenticateAccount,
      accountRoles: auth.accountRoles,
      csrfToken: auth.csrfToken,
    },
  );
}

if (
  process.argv[1]?.endsWith("server.ts") ||
  process.argv[1]?.endsWith("server.js")
) {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const port = Number(process.env.PORT ?? 8787);
  const apiApp = composeProductionApp({
    databaseUrl,
    origins: (
      process.env.ORIGINS ?? "http://127.0.0.1:4173,http://127.0.0.1:4174"
    ).split(","),
    pepper: process.env.AUTH_PEPPER ?? "test-pepper",
    email: { sendMagicLink: async () => undefined },
    remoteAddress: () => "127.0.0.1",
  });

  // Create wrapper app to serve web frontend + API
  const { Hono } = await import("hono");
  const app = new Hono();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDistPath = join(__dirname, "../../web/dist");

  // Serve API routes
  app.route("/v1", apiApp);

  // Serve web frontend as static files
  try {
    app.use("*", serveStatic({ root: webDistPath }));
    // SPA fallback: serve index.html for unmatched routes
    app.all("*", async (c) => {
      const indexPath = join(webDistPath, "index.html");
      const html = readFileSync(indexPath, "utf-8");
      return c.html(html);
    });
  } catch {
    // Web dist not available, continue with API only
    console.warn("Web app dist not found, serving API only");
  }

  serve({ fetch: app.fetch, port });
  console.log(`API listening on http://127.0.0.1:${port}`);
}
