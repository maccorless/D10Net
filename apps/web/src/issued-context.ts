import { StartedGameSchema, type StartedGame } from "@daily/contracts";
import { openDb } from "./db";
export async function saveIssuedGame(game: StartedGame) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("issuedGames", "readwrite");
    tx.objectStore("issuedGames").put(game, game.play.gameDay);
    tx.objectStore("issuedGames").put(game.play.gameDay, "latestDay");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function loadLatestIssuedGame(): Promise<StartedGame | undefined> {
  const db = await openDb();
  const get = (key: string) =>
    new Promise<unknown>((resolve, reject) => {
      const r = db
        .transaction("issuedGames")
        .objectStore("issuedGames")
        .get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  const day = await get("latestDay");
  if (typeof day !== "string") return;
  const parsed = StartedGameSchema.safeParse(await get(day));
  return parsed.success && parsed.data.play.gameDay === day
    ? parsed.data
    : undefined;
}
