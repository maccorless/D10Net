import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { createScheduler } from "../../apps/api/src/scheduler";
import { validCitiesBoard } from "@daily/test-data/boards";
import { assertKeyboardAccessible } from "./accessibility";

test.use({ baseURL: "http://127.0.0.1:4174" });

const PUBLISHER_KEY = "e2e-publisher-key";

const BOARDS_HEADER =
  "board_id,title,prompt,metric_desc,theme_tags,ranking_source_name,ranking_source_url,universe_source_name,universe_source_url,data_as_of,universe_as_of,universe_description,universe_size,metric_format,notes";

const ITEMS_HEADER =
  "board_id,row_type,rank,canonical_value,aliases,metric_value,notes";

function boardRow(id: string): string {
  return [
    id,
    `${id} title`,
    validCitiesBoard.prompt,
    validCitiesBoard.metricDesc,
    validCitiesBoard.tags.join("|"),
    validCitiesBoard.rankingSource.name,
    validCitiesBoard.rankingSource.url,
    validCitiesBoard.universeSource.name,
    validCitiesBoard.universeSource.url,
    "",
    "",
    "",
    "",
    "",
    "",
  ].join(",");
}

function itemRows(boardId: string): string[] {
  return validCitiesBoard.universe.map((c, i) =>
    [
      boardId,
      i < 10 ? "TOP10" : "UNIVERSE",
      i < 10 ? i + 1 : "",
      c.id,
      c.aliases.join("|"),
      c.metricValue ?? "",
      "",
    ].join(","),
  );
}

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Publisher key").fill(PUBLISHER_KEY);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Board publisher" }),
  ).toBeVisible();
}

test("signs in, imports valid and invalid boards, and shows correct status", async ({
  page,
}) => {
  await signIn(page);

  const boardsCsv = [
    BOARDS_HEADER,
    boardRow("browser-board"),
    boardRow("bad-board"),
  ].join("\n");
  // bad-board has no items → will fail validation with "Expected at least 10 TOP10 rows"
  const itemsCsv = [ITEMS_HEADER, ...itemRows("browser-board")].join("\n");

  // fill() doesn't always trigger React 19 onChange on controlled textareas;
  // use native value setter + input event to reliably update state.
  for (const [id, value] of [
    ["boards-csv", boardsCsv],
    ["items-csv", itemsCsv],
  ]) {
    await page.evaluate(
      ([id, value]) => {
        const el = document.getElementById(id) as HTMLTextAreaElement;
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      [id, value] as [string, string],
    );
  }

  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await assertKeyboardAccessible(page);

  await page.getByRole("button", { name: "Validate & Import" }).click();
  await expect(page.getByRole("status")).toContainText("1 board saved");
  await expect(page.getByRole("alert")).toContainText("bad-board");
});

test("sign-in has no serious axe violations and keyboard-named controls", async ({
  page,
}) => {
  await page.goto("/");
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await assertKeyboardAccessible(page);
});

test("scheduler assigns a random validated board to an unscheduled day", async () => {
  const sql = postgres(process.env.TEST_DATABASE_URL!);
  const pool = {
    ...validCitiesBoard,
    id: "scheduler-browser-pool",
    gameDay: null,
  };
  await sql`insert into boards(id,title) values(${pool.id},${pool.title}) on conflict do nothing`;
  await sql`insert into board_versions(board_id,version,game_day,payload,state) values(${pool.id},1,null,${sql.json(pool)},'Validated') on conflict(board_id,version) do nothing`;
  const scheduled = await createScheduler(sql, {}).ensureNextBoard(
    "2026-07-26",
    () => 0,
  );
  expect(scheduled).toMatchObject({ source: "random", boardId: pool.id });
  expect(
    (
      await sql`select kind,payload from audit_events where kind='publisher_board_scheduled' and payload->>'gameDay'='2026-07-26'`
    )[0],
  ).toMatchObject({
    kind: "publisher_board_scheduled",
    payload: expect.objectContaining({ source: "random", boardId: pool.id }),
  });
  await sql.end();
});
