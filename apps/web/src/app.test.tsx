import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { validCitiesBoard } from "@daily/test-data/boards";
import { startTodayApp } from "./app";

test("boots /today through hint setup, authenticated start, and player mount", async () => {
  history.replaceState(null, "", "/today");
  document.body.innerHTML = '<div id="root"></div>';
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ playerId: "00000000-0000-4000-8000-000000000002" }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ board: validCitiesBoard, play: { playId: "00000000-0000-4000-8000-000000000001", gameDay: "2026-07-11", boardId: validCitiesBoard.id, boardVersion: 1, startedAt: "2026-07-11T12:00:00.000Z", mode: "daily", hintMode: "on", validationEnvelope: "issued" } }), { status: 200 }));
  startTodayApp({ fetcher, getAccessToken: () => "session-token" });
  expect(await screen.findByRole("heading", { name: /Daily Top Ten/ })).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: "Hints On" })).toBeEnabled());
  screen.getByRole("button", { name: "Hints On" }).click();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[0][0]).toBe("/v1/sessions");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include" });
  expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: "include", headers: expect.objectContaining({ authorization: "Bearer session-token" }) });
  expect(await screen.findByText("Largest Cities")).toBeVisible();
});

test("shows a friendly start error", async () => {
  document.body.innerHTML = '<div id="root"></div>';
  startTodayApp({ fetcher: vi.fn().mockResolvedValue(new Response("no", { status: 503 })) });
  (await screen.findByRole("button", { name: "Hints Off" })).click();
  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t start/i);
});
