import { expect, test } from "vitest";
import { isCookieOnlyFinishRequest, isPublishedBoardRequest } from "./pwa-cache";

test("caches the real published board endpoint", () => {
  const get = new Request("https://daily.test/v1/boards/2026-07-11");
  expect(isPublishedBoardRequest({ url: new URL(get.url), request: get })).toBe(true);
  expect(isPublishedBoardRequest({ url: new URL(get.url), request: new Request(get.url, { method: "POST" }) })).toBe(false);
});

test("background sync never persists an Authorization secret", () => {
  const url = new URL("https://daily.test/v1/plays/00000000-0000-4000-8000-000000000009/finish");
  expect(isCookieOnlyFinishRequest({ url, request: new Request(url, { method: "POST" }) })).toBe(true);
  expect(isCookieOnlyFinishRequest({ url, request: new Request(url, { method: "POST", headers: { authorization: "Bearer secret" } }) })).toBe(false);
});
