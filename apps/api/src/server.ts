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
import { readFileSync, existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";
import { runMigrations } from "./migrations.js";

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

  // Run migrations before starting server
  console.log("Running database migrations...");
  await runMigrations(databaseUrl);

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
  const publisherDistPath = join(__dirname, "../../publisher/dist");

  console.log(`Server directory: ${__dirname}`);
  console.log(
    `Web dist path: ${webDistPath} - exists: ${existsSync(webDistPath)}`,
  );
  console.log(
    `Publisher dist path: ${publisherDistPath} - exists: ${existsSync(publisherDistPath)}`,
  );

  // Serve API routes
  app.route("/v1", apiApp);

  // Static file middleware for web & publisher assets
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
  };

  app.use("*", async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/v1/")) return next();

    let distPath = webDistPath;
    let filePath: string;

    // Route /publisher/* to publisher app
    if (path.startsWith("/publisher")) {
      distPath = publisherDistPath;
      filePath = join(
        distPath,
        path === "/publisher" || path === "/publisher/"
          ? "index.html"
          : path.slice("/publisher".length),
      );
    } else {
      filePath = join(distPath, path === "/" ? "index.html" : path);
    }

    // Serve static files
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      c.header("Content-Type", mimeTypes[ext] || "application/octet-stream");
      return c.body(content);
    }

    // SPA fallback: serve index.html from appropriate dist
    const indexPath = join(distPath, "index.html");
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, "utf-8");
      return c.html(html);
    }

    return next();
  });

  serve({ fetch: app.fetch, port });
  console.log(`API listening on http://127.0.0.1:${port}`);
}
