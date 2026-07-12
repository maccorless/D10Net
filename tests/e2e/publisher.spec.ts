import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { createScheduler } from "../../apps/api/src/scheduler";
import { validCitiesBoard } from "@daily/test-data/boards";
import { assertKeyboardAccessible } from "./accessibility";

test.use({ baseURL: "http://127.0.0.1:4174", storageState: "tests/e2e/.auth/account.json" });
const header = "board_id\ttitle\tmetric\ttags\tsource_name\tsource_url\tpublish_date\trank\tcanonical_id\tlabel\taliases";
const rows = (id: string, day: string) => validCitiesBoard.universe.map((candidate, index) => `${id}\t${id} title\tpopulation\tgeo|cities\tCensus\thttps://example.gov\t${day}\t${index < 10 ? index + 1 : ""}\t${candidate.id}-${id}\t${candidate.label}\t${candidate.aliases.join("|")}`);

test("pastes partial-valid TSV, publishes override, and randomly schedules an unused board", async ({ page }) => {
  const bad = rows("bad-board", "2026-07-21");
  bad[2] = bad[2]!.replace("bad-board title", "mismatched title");
  await page.goto("/");
  await page.getByRole("textbox", { name: "Paste Excel rows" }).fill([header, ...rows("browser-board", "2026-07-20"), ...bad].join("\n"));
  await page.getByRole("button", { name: "Validate paste" }).click();
  await expect(page.getByRole("heading", { name: "browser-board title" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("bad-board");
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await assertKeyboardAccessible(page);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("State: Published")).toBeVisible();
  await assertKeyboardAccessible(page);
  const sql = postgres(process.env.TEST_DATABASE_URL!);
  expect((await sql`select board_id,published from schedule_assignments where game_day='2026-07-20'`)[0]).toMatchObject({ board_id: "browser-board", published: true });
  await page.getByRole("textbox", { name: "Publish date" }).fill("2026-07-22");
  await page.getByRole("button", { name: "Override schedule" }).click();
  await expect(page.getByText("State: Published")).toBeVisible();
  await expect.poll(async () => Number((await sql`select count(*) n from schedule_assignments where game_day='2026-07-20' and board_id='browser-board'`)[0].n)).toBe(0);
  expect((await sql`select board_id,published from schedule_assignments where game_day='2026-07-22'`)[0]).toMatchObject({ board_id: "browser-board", published: true });
  await assertKeyboardAccessible(page);
  const pool = { ...validCitiesBoard, id: "scheduler-browser-pool", gameDay: null };
  await sql`insert into boards(id,title) values(${pool.id},${pool.title})`;
  await sql`insert into board_versions(board_id,version,game_day,payload,state) values(${pool.id},1,null,${sql.json(pool)},'Validated')`;
  const scheduled = await createScheduler(sql, {}).ensureNextBoard("2026-07-23", () => 0);
  expect(scheduled).toMatchObject({ source: "random", boardId: pool.id });
  expect((await sql`select kind,payload from audit_events where kind='publisher_board_scheduled' and payload->>'gameDay'='2026-07-23'`)[0]).toMatchObject({ kind: "publisher_board_scheduled", payload: expect.objectContaining({ source: "random", boardId: pool.id }) });
  await sql.end();
});

test("sign-in has no serious axe violations and keyboard-named controls", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/sign-in");
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await assertKeyboardAccessible(page);
});
