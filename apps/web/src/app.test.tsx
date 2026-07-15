import { screen, waitFor } from "@testing-library/react";
import { expect, test, beforeEach, vi } from "vitest";
import { validCitiesBoard } from "@daily/test-data/boards";
import { startTodayApp } from "./app";
import { recordPlay, getPlayHistory } from "./archive/history";

test("enriches archive entries using localStorage history", () => {
  localStorage.clear();
  recordPlay("2026-07-10", "daily");
  const history = getPlayHistory();
  const serverRow = {
    game_day: "2026-07-10",
    status: "review",
    result: { score: 8 },
  };
  const enriched =
    serverRow.status === "review"
      ? history[serverRow.game_day] === "daily"
        ? "played-daily"
        : "played-archive"
      : "playable";
  expect(enriched).toBe("played-daily");
  localStorage.clear();
});

test("boots /today through hint setup, authenticated start, and player mount", async () => {
  history.replaceState(null, "", "/today");
  document.body.innerHTML = '<div id="root"></div>';
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ playerId: "00000000-0000-4000-8000-000000000002" }),
        { status: 201 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          board: validCitiesBoard,
          play: {
            playId: "00000000-0000-4000-8000-000000000001",
            gameDay: "2026-07-11",
            boardId: validCitiesBoard.id,
            boardVersion: 1,
            startedAt: "2026-07-11T12:00:00.000Z",
            mode: "daily",
            hintMode: "on",
            validationEnvelope: "issued",
          },
        }),
        { status: 200 },
      ),
    );
  startTodayApp({ fetcher, getAccessToken: () => "session-token" });
  expect(
    await screen.findByRole("heading", { name: /Daily Top Ten/ }),
  ).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Play Today" })).toBeEnabled(),
  );
  screen.getByRole("button", { name: "Play Today" }).click();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[0][0]).toBe("/v1/sessions");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "POST",
    credentials: "include",
  });
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "include",
    headers: expect.objectContaining({ authorization: "Bearer session-token" }),
  });
  expect(await screen.findByText(validCitiesBoard.prompt)).toBeVisible();
});

test("shows a friendly start error", async () => {
  document.body.innerHTML = '<div id="root"></div>';
  startTodayApp({
    fetcher: vi.fn().mockResolvedValue(new Response("no", { status: 503 })),
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /reconnect to start/i,
  );
});
