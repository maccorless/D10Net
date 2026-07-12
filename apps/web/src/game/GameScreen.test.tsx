import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { validCitiesBoard } from "@daily/test-data/boards";
import type { PlayStart } from "@daily/contracts";
import { GameScreen } from "./GameScreen";

const playStart: PlayStart = {
  playId: "00000000-0000-4000-8000-000000000001",
  gameDay: "2026-07-11",
  boardId: validCitiesBoard.id,
  boardVersion: validCitiesBoard.version,
  startedAt: "2026-07-11T12:00:00.000Z",
  mode: "daily",
  hintMode: "on",
  validationEnvelope: "signed"
};
const readyPersistence = { load: async () => undefined, save: vi.fn() };

test("shows the active answer counter and exactly ten rank slots", async () => {
  render(<GameScreen board={validCitiesBoard} start={playStart} persistence={readyPersistence} />);
  expect(await screen.findByText("0 / 10")).toBeVisible();
  expect(screen.getAllByTestId("rank-slot")).toHaveLength(10);
  expect(screen.queryByText("0 / 11")).not.toBeInTheDocument();
});

test("submits a tapped suggestion immediately and never renders a submit button", async () => {
  render(<GameScreen board={validCitiesBoard} start={playStart} persistence={readyPersistence} />);
  fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "Tokyo" } });
  fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
  expect(await screen.findByText("1 / 10")).toBeVisible();
  expect(screen.getByText("Tokyo")).toBeVisible();
  expect(screen.queryByRole("button", { name: /^submit$/i })).not.toBeInTheDocument();
});

test("arms the explicit number-one call and exposes the one free hint", async () => {
  render(<GameScreen board={validCitiesBoard} start={playStart} persistence={readyPersistence} />);
  const call = await screen.findByRole("button", { name: /Call #1/ });
  expect(call).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(call);
  expect(call).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/Free hint \(1×\)/)).toBeVisible();
});
test("lets Hints On players choose and see either reveal type", async () => {
  render(<GameScreen board={validCitiesBoard} start={playStart} persistence={readyPersistence} />);
  expect(await screen.findByRole("button", { name: /First letter/i })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Metric value/i }));
  expect(screen.getByText(/million/, { exact: false })).toBeVisible();
});

test("keeps the server-issued timer origin when the component remounts", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-11T12:01:05.000Z"));
  const first = render(<GameScreen board={validCitiesBoard} start={playStart} persistence={readyPersistence} />);
  await act(async () => {});
  expect(screen.getByText("1:05")).toBeVisible();
  first.unmount();
  render(<GameScreen board={validCitiesBoard} start={playStart} persistence={readyPersistence} />);
  await act(async () => {});
  expect(screen.getByText("1:05")).toBeVisible();
  vi.useRealTimers();
});

test("restores guesses from IndexedDB by play ID", async () => {
  const first = render(<GameScreen board={validCitiesBoard} start={playStart} />);
  fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "Tokyo" } });
  fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
  await waitFor(() => expect(screen.getByText("1 / 10")).toBeVisible());
  await new Promise((resolve) => setTimeout(resolve, 0));
  first.unmount();
  render(<GameScreen board={validCitiesBoard} start={playStart} />);
  expect(await screen.findByText("1 / 10")).toBeVisible();
});

test("gates game controls until delayed persistence restore completes", async () => {
  let release!: (value: undefined) => void;
  const load = new Promise<undefined>((resolve) => { release = resolve; });
  render(<GameScreen board={validCitiesBoard} start={playStart} persistence={{ load: () => load, save: vi.fn() }} />);
  expect(screen.getByRole("status")).toHaveTextContent(/restoring/i);
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  await act(async () => release(undefined));
  expect(await screen.findByRole("searchbox")).toBeVisible();
});

test("uses compact semantic structure and keyboard-operable controls", async () => {
  const { container } = render(<GameScreen board={validCitiesBoard} start={playStart} persistence={readyPersistence} />);
  await screen.findByRole("searchbox");
  expect(container.querySelector("main.game-shell")).toBeTruthy();
  expect(container.querySelector("ol.rank-grid")).toBeTruthy();
  expect(screen.getByLabelText("Guess an answer")).toHaveAttribute("type", "search");
  expect(screen.getByRole("button", { name: /Call #1/ }).tagName).toBe("BUTTON");
});

test("shows an 11-point Hints Off result after calling number one and finding all ten", async () => {
  render(<GameScreen board={validCitiesBoard} start={{ ...playStart, hintMode: "off" }} persistence={readyPersistence} />);
  fireEvent.click(await screen.findByRole("button", { name: /Call #1/ }));
  for (const id of validCitiesBoard.ranked) {
    const candidate = validCitiesBoard.universe.find(item => item.id === id)!;
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: candidate.label } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(candidate.label) }));
  }
  expect(await screen.findByText("11 points")).toBeVisible();
  expect(screen.getByText("Hints Off")).toBeVisible();
});
