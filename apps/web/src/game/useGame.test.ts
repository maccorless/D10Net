import { expect, test, vi } from "vitest";
import type { PlayResult } from "@daily/contracts";
import { flushFinishQueue, queueFinishResult, setAccessTokenProvider } from "./useGame";

const result: PlayResult = { playId: "00000000-0000-4000-8000-000000000009", guesses: [], hintUsed: false, finishedAt: "2026-07-11T12:01:00.000Z" };

test("foreground finish retry includes cookies and current authorization", async () => {
  setAccessTokenProvider(() => "fresh-token");
  await queueFinishResult(result);
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  await flushFinishQueue(fetcher);
  expect(fetcher).toHaveBeenCalledWith(`/v1/plays/${result.playId}/finish`, expect.objectContaining({
    credentials: "include", headers: expect.objectContaining({ authorization: "Bearer fresh-token" })
  }));
});

test("queued retries retrieve rotated auth instead of persisting a secret", async () => {
  let token = "old-token";
  setAccessTokenProvider(() => token);
  await queueFinishResult(result);
  token = "rotated-token";
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  await flushFinishQueue(fetcher);
  expect(fetcher.mock.calls[0][1].headers.authorization).toBe("Bearer rotated-token");
});
