import { useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StartedGameSchema, type Board, type HintMode, type PlayStart } from "@daily/contracts";
import { GameScreen } from "./game/GameScreen";
import { Archive, type ArchiveEntry } from "./archive/Archive";
import { SignIn } from "./account/SignIn";
import { setAccessTokenProvider } from "./game/useGame";
import { loadLatestIssuedGame, saveIssuedGame } from "./issued-context";
import "./styles/tokens.css";
import "./styles/game.css";

export { GameScreen };
type BootstrapOptions = { fetcher?: typeof fetch; getAccessToken?: () => string | undefined; root?: HTMLElement };

function authHeaders(getAccessToken: () => string | undefined) {
  const token = getAccessToken();
  return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

function TodaySetup({ fetcher, getAccessToken }: Required<Pick<BootstrapOptions, "fetcher" | "getAccessToken">>) {
  const [player, setPlayer] = useState<{ board: Board; start: PlayStart }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [cached, setCached] = useState<{ board: Board; play: PlayStart }>();
  const [clockError, setClockError] = useState(false);
  useEffect(() => {
    fetcher("/v1/sessions", { method: "POST", credentials: "include", headers: authHeaders(getAccessToken) })
      .then(response => { if (!response.ok) throw new Error("session unavailable"); setSessionReady(true); })
      .catch(async () => { setCached(await loadLatestIssuedGame().catch(()=>undefined)); setError(true); });
  }, [fetcher, getAccessToken]);
  async function begin(hintMode: HintMode) {
    setLoading(true); setError(false);
    try {
      const common: RequestInit = { credentials: "include", headers: authHeaders(getAccessToken) };
      const startResponse = await fetcher("/v1/plays/start", { ...common, method: "POST", body: JSON.stringify({ mode: "daily", hintMode }) });
      if (!startResponse.ok) { const problem=await startResponse.json().catch(()=>({})); if(problem?.code==="CLOCK_ROLLBACK")setClockError(true); throw new Error("start unavailable"); }
      const started = StartedGameSchema.parse(await startResponse.json());
      await saveIssuedGame(started);
      setPlayer({ board: started.board, start: started.play });
    } catch { setCached(await loadLatestIssuedGame().catch(()=>undefined)); setError(true); } finally { setLoading(false); }
  }
  if (player) return <GameScreen board={player.board} start={player.start} />;
  return <main className="setup-shell"><h1>Daily Top Ten</h1><p>Find the top 10. Five wrong guesses ends it.</p>
    <div className="setup-actions" aria-label="Choose hint mode"><button disabled={loading || !sessionReady} onClick={() => void begin("on")}>Hints On</button><button disabled={loading || !sessionReady} onClick={() => void begin("off")}>Hints Off</button></div>
    {(loading || !sessionReady) && !error && <p role="status">Loading today’s game…</p>}{error && <><p role="alert">{clockError ? "Your device date seems to have traveled backward. We’ve kept your progress safe, but today’s game needs a quick time check before it can open." : "Reconnect to start today’s game."}</p>{cached && <button onClick={()=>setPlayer(cached)}>Resume your issued game</button>}<a href="/archive">Open Archive</a></>}
  </main>;
}

function ArchivePage({ fetcher }: { fetcher: typeof fetch }) {
  const [entries, setEntries] = useState<(ArchiveEntry & { boardId: string; version: number })[]>([]);
  const [game, setGame] = useState<{ board: Board; start: PlayStart }>();
  const [review, setReview] = useState<{ gameDay: string; score: number }>();
  const [error, setError] = useState("");
  useEffect(() => { fetcher("/v1/archive", { credentials: "include" }).then(async r => { if (!r.ok) throw Error(); return r.json(); }).then((rows: any[]) => setEntries(rows.map(row => ({ gameDay: String(row.game_day), status: row.status, result: row.result, boardId: row.board_id, version: Number(row.version) })))).catch(() => setError("We couldn’t load the Archive.")); }, [fetcher]);
  async function play(day: string) { const entry = entries.find(e => e.gameDay === day)!; try { const response = await fetcher("/v1/plays/start", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "archive", hintMode: "off", boardId: entry.boardId, boardVersion: entry.version }) }); if (!response.ok) throw Error(); const started = StartedGameSchema.parse(await response.json()); setGame({ board: started.board, start: started.play }); } catch { setError("We couldn’t start that Archive game. Check your device date and try again."); } }
  if (game) return <GameScreen board={game.board} start={game.start} />;
  if (review) return <main><h1>Archive result</h1><p>{review.gameDay}</p><p>{review.score} points</p><button onClick={() => setReview(undefined)}>Back to Archive</button></main>;
  return <main>{error && <p role="alert">{error}</p>}<Archive entries={entries} onPlay={day => void play(day)} onReview={day => { const e = entries.find(x => x.gameDay === day); setReview({ gameDay: day, score: e?.result?.score ?? 0 }); }} /></main>;
}

function mount(element: ReactNode) { const root = document.getElementById("root"); if (!root) throw new Error("Missing #root"); mountedRoot?.unmount(); mountedRoot = createRoot(root); mountedRoot.render(element); }

let mountedRoot: Root | undefined;
export function startTodayApp(options: BootstrapOptions = {}) {
  const root = options.root ?? document.getElementById("root");
  if (!root) throw new Error("Missing #root");
  const getAccessToken = options.getAccessToken ?? (() => undefined);
  setAccessTokenProvider(getAccessToken);
  mountedRoot?.unmount(); mountedRoot = createRoot(root);
  mountedRoot.render(<TodaySetup fetcher={options.fetcher ?? fetch} getAccessToken={getAccessToken} />);
}
export function mountToday(board: Board, start: PlayStart) {
  const root = document.getElementById("root"); if (!root) throw new Error("Missing #root");
  mountedRoot?.unmount(); mountedRoot = createRoot(root); mountedRoot.render(<GameScreen board={board} start={start} />);
}
if (!import.meta.env.VITEST) {
  if (location.pathname === "/today") startTodayApp();
  else if (location.pathname === "/archive") mount(<ArchivePage fetcher={fetch} />);
  else if (location.pathname === "/sign-in") mount(<main><h1>Sign in</h1><SignIn requestMagicLink={email => fetch("/v1/auth/magic-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) })} /></main>);
}
