import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resetTestDatabase } from "./seed";
import { tokenHash } from "../../apps/api/src/auth";

const authDir = resolve(process.cwd(), "tests/e2e/.auth");

export default async function globalSetup() {
  process.env.NODE_ENV = "test";
  await resetTestDatabase();
  await mkdir(authDir, { recursive: true });
  const state = { cookies: [{ name: "d10_session", value: "e2e-guest-token", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const }], origins: [] };
  await writeFile(resolve(authDir, "guest.json"), JSON.stringify(state));
  const account = { cookies: [
    { name: "d10_account", value: "e2e-account-token", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const },
    { name: "d10_csrf", value: tokenHash("csrf:e2e-account-token", "test-pepper"), domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Strict" as const }
  ], origins: [] };
  await writeFile(resolve(authDir, "account.json"), JSON.stringify(account));
}
