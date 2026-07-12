import type { Page } from "@playwright/test";
import { validCitiesBoard } from "@daily/test-data/boards";

export const playId = "00000000-0000-4000-8000-000000000010";
export async function mockDailyApi(page: Page) {
  await page.route("**/v1/sessions", route => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ playerId: playId }) }));
  await page.route("**/v1/plays/start", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ board: validCitiesBoard, play: { playId, gameDay: "2026-07-11", boardId: validCitiesBoard.id, boardVersion: 1, startedAt: new Date().toISOString(), mode: "daily", hintMode: JSON.parse(route.request().postData()!).hintMode, validationEnvelope: "test" } }) }));
  await page.route("**/v1/plays/*/finish", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
}
export async function submitAllTenWithNumberOneCall(page: Page) {
  await page.getByRole("button", { name: /Call #1/ }).click();
  for (const id of validCitiesBoard.ranked) {
    const label = validCitiesBoard.universe.find(item => item.id === id)!.label;
    await page.getByRole("searchbox", { name: "Guess an answer" }).fill(label);
    await page.getByRole("button", { name: new RegExp(label) }).click();
  }
}
