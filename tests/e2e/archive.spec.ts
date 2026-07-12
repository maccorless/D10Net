import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { submitAllTenWithNumberOneCall } from "./helpers";
import { assertKeyboardAccessible } from "./accessibility";

const player = "00000000-0000-4000-8000-000000000001";
const serious = (
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) => violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));

test("played review and missed Archive play do not mutate streaks or rankings", async ({
  page,
}) => {
  const sql = postgres(process.env.TEST_DATABASE_URL!);
  const before =
    await sql`select kind,current,best,last_game_day from streaks where player_id=${player} order by kind`;
  await page.goto("/archive");
  await expect(page.getByRole("heading", { name: "Archive" })).toBeVisible();
  expect(
    serious((await new AxeBuilder({ page }).analyze()).violations),
  ).toEqual([]);
  await assertKeyboardAccessible(page);
  await page.getByRole("button", { name: /Review · 7 points/ }).click();
  await expect(page.getByText("7 points", { exact: true })).toBeVisible();
  await assertKeyboardAccessible(page);
  await page.getByRole("button", { name: "Back to Archive" }).click();
  await page.getByRole("button", { name: "Play" }).first().click();
  await expect(
    page.getByRole("searchbox", { name: "Guess an answer" }),
  ).toBeVisible();
  await submitAllTenWithNumberOneCall(page);
  await expect(page.getByText("11 points", { exact: true })).toBeVisible();
  await assertKeyboardAccessible(page);
  await expect
    .poll(async () =>
      Number(
        (
          await sql`select count(*) n from plays where player_id=${player} and mode='archive' and finished_at is not null`
        )[0].n,
      ),
    )
    .toBe(2);
  expect(
    await sql`select kind,current,best,last_game_day from streaks where player_id=${player} order by kind`,
  ).toEqual(before);
  expect(
    Number(
      (
        await sql`select count(*) n from plays where player_id=${player} and mode='archive' and ranking_eligible=true`
      )[0].n,
    ),
  ).toBe(0);
  await sql.end();
});

test("date mismatch is friendly and failed start rolls back", async ({
  page,
}) => {
  const sql = postgres(process.env.TEST_DATABASE_URL!);
  await sql`delete from audit_events where play_id in (select id from plays where player_id=${player} and board_id='missed-cities')`;
  await sql`delete from plays where player_id=${player} and board_id='missed-cities'`;
  await sql`update players set latest_game_day='2026-07-13' where id=${player}`;
  const before = Number(
    (await sql`select count(*) n from plays where player_id=${player}`)[0].n,
  );
  await page.goto("/archive");
  await page.getByRole("button", { name: "Play" }).first().click();
  await expect(page.getByRole("alert")).toContainText("device date");
  expect(
    Number(
      (await sql`select count(*) n from plays where player_id=${player}`)[0].n,
    ),
  ).toBe(before);
  await sql`update players set latest_game_day=null where id=${player}`;
  await sql.end();
});

test("invalid replay submission rolls back the finish transaction", async ({
  request,
}) => {
  const sql = postgres(process.env.TEST_DATABASE_URL!);
  await sql`update players set latest_game_day=null where id=${player}`;
  await sql`delete from audit_events where play_id in (select id from plays where player_id=${player} and board_id='missed-cities')`;
  await sql`delete from plays where player_id=${player} and board_id='missed-cities'`;
  const started = await request.post("/v1/plays/start", {
    data: {
      mode: "archive",
      hintMode: "off",
      boardId: "missed-cities",
      boardVersion: 1,
    },
  });
  expect(started.ok()).toBe(true);
  const { play } = await started.json();
  const rejected = await request.post(`/v1/plays/${play.playId}/finish`, {
    data: {
      playId: "00000000-0000-4000-8000-000000000099",
      guesses: [],
      hintUsed: false,
      finishedAt: new Date().toISOString(),
    },
  });
  expect(rejected.status()).toBe(400);
  const row = (
    await sql`select finished_at,score,authoritative_result from plays where id=${play.playId}`
  )[0];
  expect(row).toMatchObject({
    finished_at: null,
    score: null,
    authoritative_result: null,
  });
  await sql.end();
});
