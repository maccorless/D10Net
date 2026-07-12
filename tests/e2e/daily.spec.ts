import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { submitAllTenWithNumberOneCall } from "./helpers";
import { assertKeyboardAccessible } from "./accessibility";

test("plays an 11-point Hints Off Daily in one viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/today");
  await expect(page.getByRole("button", { name: "Hints Off" })).toBeEnabled();
  await page.getByRole("button", { name: "Hints Off" }).click();
  await expect(page.getByText("0 / 10")).toBeVisible();
  await expect(page.getByTestId("rank-slot")).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await submitAllTenWithNumberOneCall(page);
  await expect(page.getByText("11 points")).toBeVisible();
  await expect(page.getByText("Hints Off")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await assertKeyboardAccessible(page);
  const sql = postgres(process.env.TEST_DATABASE_URL!);
  await expect.poll(async () => Number((await sql`select score from plays where mode='daily' and finished_at is not null order by finished_at desc limit 1`)[0]?.score)).toBe(11);
  await sql.end();
});
test("setup and active board have no serious or critical axe violations and named controls", async ({ page }) => {
  await page.goto("/today");
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await assertKeyboardAccessible(page);
  await page.getByRole("button", { name: "Hints On" }).press("Enter");
  await expect(page.getByRole("searchbox", { name: "Guess an answer" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await assertKeyboardAccessible(page);
  await page.getByRole("searchbox", { name: "Guess an answer" }).fill("new");
  await expect(page.getByRole("button", { name: /New York/ })).toBeVisible();
  await assertKeyboardAccessible(page);
});

test("continues offline after start and retries the queued finish on reconnect", async ({ page }) => {
  const sql = postgres(process.env.TEST_DATABASE_URL!);
  await page.context().clearCookies();
  await page.goto("/today");
  await page.getByRole("button", { name: "Hints Off" }).click();
  await page.context().setOffline(true);
  await submitAllTenWithNumberOneCall(page);
  await expect(page.getByText("11 points")).toBeVisible();
  const before = Number((await sql`select count(*) n from plays where mode='daily' and finished_at is not null`)[0].n);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => Number((await sql`select count(*) n from plays where mode='daily' and finished_at is not null`)[0].n)).toBe(before + 1);
  await sql.end();
});
