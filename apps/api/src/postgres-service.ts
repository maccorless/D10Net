import postgres, { type Sql } from "postgres";
import {
  BoardSchema,
  type HintMode,
  type PlayResult,
  type PlayStart,
  type StartedGame,
} from "@daily/contracts";
import { canonicalGameDay } from "./date-policy.js";
import { verifySubmission, type StartedPlay } from "./plays.js";
import {
  newOpaqueCredential,
  normalizeEmail,
  tokenHash,
  verifyCredential,
  type EmailAdapter,
} from "./auth.js";

type StartInput = {
  mode: "daily" | "archive";
  hintMode: HintMode;
  boardId?: string;
  boardVersion?: number;
};
const dateOnly = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
const instant = (value: unknown) =>
  value instanceof Date ? value : new Date(String(value));
const asPlay = (r: Record<string, unknown>): StartedPlay => ({
  id: String(r.id),
  playerId: String(r.player_id),
  boardId: String(r.board_id),
  boardVersion: Number(r.board_version),
  boardGameDay: dateOnly(r.board_game_day),
  gameDay: dateOnly(r.game_day),
  mode: r.mode as "daily" | "archive",
  hintMode: r.hint_mode as HintMode,
  startedAt: instant(r.started_at),
  finished: r.authoritative_result as StartedPlay["finished"],
});

export function createPostgresServices(
  connection: string | Sql,
  options: { zone?: string; now?: () => Date; pepper?: string } = {},
) {
  const sql =
    typeof connection === "string" ? postgres(connection) : connection;
  const now = options.now ?? (() => new Date());
  return {
    async createSession(playerId: string | null) {
      const id = playerId ?? crypto.randomUUID();
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      );
      const sessionHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      await sql.begin(async (tx) => {
        if (!playerId) await tx`insert into players (id) values (${id})`;
        await tx`insert into sessions (id,player_id,token_hash,expires_at) values (${crypto.randomUUID()},${id},${sessionHash},${new Date(now().getTime() + 30 * 86_400_000).toISOString()})`;
        if (options.pepper)
          await tx`insert into guest_credentials(player_id,token_hash) values(${id},${tokenHash(token, options.pepper)}) on conflict(player_id) do update set token_hash=excluded.token_hash,revoked_at=null`;
      });
      return { playerId: id, token };
    },
    async start(playerId: string, input: StartInput): Promise<StartedGame> {
      const current = now();
      const day = canonicalGameDay(current, options.zone);
      return sql.begin(async (tx) => {
        const player =
          await tx`select latest_game_day from players where id=${playerId} for update`;
        if (!player.length) throw new Error("Player not found");
        if (
          player[0]!.latest_game_day &&
          dateOnly(player[0]!.latest_game_day) > day
        )
          throw new Error("CLOCK_ROLLBACK");
        const assignment =
          input.mode === "daily"
            ? await tx`select sa.game_day, bv.board_id, bv.version, bv.payload from schedule_assignments sa join board_versions bv on (bv.board_id, bv.version)=(sa.board_id,sa.board_version) where sa.game_day=${day} and sa.published=true and bv.published_at<=${current} and sa.game_day<=${day} limit 1`
            : await tx`select bv.game_day, bv.board_id, bv.version, bv.payload from board_versions bv join schedule_assignments sa on (sa.board_id,sa.board_version)=(bv.board_id,bv.version) where bv.board_id=${input.boardId!} and bv.version=${input.boardVersion!} and sa.published=true and bv.published_at<=${current} and bv.game_day is not null and sa.game_day=bv.game_day and sa.game_day<${day} limit 1`;
        if (!assignment.length) throw new Error("Board not found");
        const a = assignment[0]!;
        const id = crypto.randomUUID();
        const inserted =
          await tx`insert into plays (id,player_id,board_id,board_version,game_day,board_game_day,played_at,mode,hint_mode,started_at) values (${id},${playerId},${a.board_id},${a.version},${day},${a.game_day},${current},${input.mode},${input.hintMode},${current}) on conflict do nothing returning *`;
        let started: StartedPlay;
        if (inserted.length) {
          await tx`update players set latest_game_day=${day} where id=${playerId}`;
          started = asPlay(inserted[0]!);
        } else {
          const existing =
            input.mode === "daily"
              ? await tx`select * from plays where player_id=${playerId} and game_day=${day} and mode='daily'`
              : await tx`select * from plays where player_id=${playerId} and board_id=${a.board_id} and board_version=${a.version} and mode='archive'`;
          started = asPlay(existing[0]!);
        }
        const board = BoardSchema.parse(a.payload);
        const play: PlayStart = {
          playId: started.id,
          gameDay: started.gameDay,
          boardId: started.boardId,
          boardVersion: started.boardVersion,
          startedAt: started.startedAt.toISOString(),
          mode: started.mode,
          hintMode: started.hintMode,
          validationEnvelope: `${started.id}.${started.boardId}.${started.boardVersion}`,
        };
        return { play, board };
      });
    },
    async finish(playerId: string, playId: string, input: PlayResult) {
      return sql.begin(async (tx) => {
        const rows =
          await tx`select * from plays where id=${playId} and player_id=${playerId} for update`;
        if (!rows.length) throw new Error("Play not found");
        const play = asPlay(rows[0]!);
        if (rows[0]!.finished_at) return play;
        const boards =
          await tx`select payload from board_versions where board_id=${play.boardId} and version=${play.boardVersion}`;
        const board = BoardSchema.parse(boards[0]?.payload);
        if (input.guesses.length > board.universe.length)
          throw new Error("Impossible guess count");
        const result = verifySubmission(play, input, board, now());
        await tx`update plays set finished_at=${new Date(result.acceptedAt)},score=${result.score},elapsed_ms=${result.elapsedMs},hint_used=${result.hintUsed},authoritative_result=${tx.json(result)},ranking_eligible=${result.rankingEligible} where id=${playId}`;
        if (result.anomaly)
          await tx`insert into audit_events (id,player_id,play_id,kind,payload) values (${crypto.randomUUID()},${playerId},${playId},${result.anomaly},${tx.json({ elapsedMs: result.elapsedMs, answersFound: result.answersFound })})`;
        if (play.mode === "daily")
          for (const [kind, qualifies] of Object.entries({
            played: true,
            fivePlus: result.answersFound >= 5,
            perfect: result.answersFound === 10,
            noHint: result.answersFound === 10 && play.hintMode === "off",
          }))
            await tx`insert into streaks (player_id,kind,current,best,last_game_day) values (${playerId},${kind},${qualifies ? 1 : 0},${qualifies ? 1 : 0},${play.gameDay}) on conflict (player_id,kind) do update set current=case when streaks.last_game_day=${play.gameDay} then streaks.current when ${qualifies} and streaks.last_game_day=${previousDay(play.gameDay)} then streaks.current+1 when ${qualifies} then 1 else 0 end,best=greatest(streaks.best,case when ${qualifies} and streaks.last_game_day=${previousDay(play.gameDay)} then streaks.current+1 when ${qualifies} then 1 else streaks.best end),last_game_day=${play.gameDay}`;
        return { ...play, finished: result };
      });
    },
    async rankings(gameDay: string, hintMode: HintMode, limit: number) {
      const currentDay = canonicalGameDay(now(), options.zone);
      if (gameDay > currentDay) throw new Error("Board not found");
      return sql`select player_id,score,elapsed_ms,finished_at from plays where game_day=${gameDay} and mode='daily' and hint_mode=${hintMode} and ranking_eligible=true and finished_at is not null order by score desc,elapsed_ms asc,finished_at asc limit ${Math.min(limit, 100)}`;
    },
    async publicBoard(gameDay: string) {
      const ts = now().toISOString();
      const scheduled = () =>
        sql`select bv.payload from schedule_assignments sa join board_versions bv on (bv.board_id,bv.version)=(sa.board_id,sa.board_version) where sa.game_day=${gameDay} and sa.published=true and bv.state='Published' and bv.published_at<=${ts} limit 1`;
      let rows = await scheduled();
      if (rows[0]) return rows[0].payload;
      // Pool path: assign a Published board that has never been scheduled
      await sql`insert into schedule_assignments(game_day,board_id,board_version,published) select ${gameDay},bv.board_id,bv.version,true from board_versions bv where bv.state='Published' and bv.game_day is null and not exists(select 1 from schedule_assignments sa where sa.board_id=bv.board_id and sa.board_version=bv.version) order by random() limit 1 on conflict(game_day) do nothing`;
      rows = await scheduled();
      if (rows[0]) return rows[0].payload;
      // Rerun fallback: pool is empty — pick a past board, version it as "(Rerun)"
      return sql.begin(async (tx) => {
        const r2 =
          await tx`select bv.payload from schedule_assignments sa join board_versions bv on (bv.board_id,bv.version)=(sa.board_id,sa.board_version) where sa.game_day=${gameDay} and sa.published=true and bv.state='Published' and bv.published_at<=${ts} limit 1`;
        if (r2[0]) return r2[0].payload;
        const [src] =
          await tx`select board_id,payload from board_versions where state='Published' and game_day is not null order by random() limit 1 for update skip locked`;
        if (!src) return undefined;
        const [{ v }] =
          await tx`select max(version) v from board_versions where board_id=${src.board_id}`;
        const nextVer = Number(v) + 1;
        const p = {
          ...src.payload,
          version: nextVer,
          gameDay,
          title: src.payload.title + " (Rerun)",
        };
        await tx`insert into board_versions(board_id,version,game_day,payload,state,published_at) values(${src.board_id},${nextVer},${gameDay},${tx.json(p)},'Published',${now()}) on conflict do nothing`;
        await tx`insert into schedule_assignments(game_day,board_id,board_version,published) values(${gameDay},${src.board_id},${nextVer},true) on conflict(game_day) do nothing`;
        return (
          await tx`select bv.payload from schedule_assignments sa join board_versions bv on (bv.board_id,bv.version)=(sa.board_id,sa.board_version) where sa.game_day=${gameDay} and sa.published=true and bv.state='Published' and bv.published_at<=${ts} limit 1`
        )[0]?.payload;
      });
    },
    async archive(playerId: string) {
      const day = canonicalGameDay(now(), options.zone);
      const rows =
        await sql`select sa.game_day,case when p.finished_at is null then 'playable' else 'review' end status,case when p.finished_at is null then null else p.authoritative_result end result,bv.board_id,bv.version from schedule_assignments sa join board_versions bv on (bv.board_id,bv.version)=(sa.board_id,sa.board_version) left join plays p on p.player_id=${playerId} and p.board_id=bv.board_id and p.board_version=bv.version where sa.published=true and sa.game_day=bv.game_day and bv.published_at<=${now().toISOString()} and sa.game_day<${day} order by sa.game_day desc`;
      return rows.map((row) => ({ ...row, game_day: dateOnly(row.game_day) }));
    },
    async archiveDay(playerId: string, gameDay: string) {
      const day = canonicalGameDay(now(), options.zone);
      if (gameDay >= day) return undefined;
      const rows =
        await sql`select sa.game_day,case when p.finished_at is null then 'playable' else 'review' end status,case when p.finished_at is null then null else p.authoritative_result end result,bv.board_id,bv.version from schedule_assignments sa join board_versions bv on (bv.board_id,bv.version)=(sa.board_id,sa.board_version) left join plays p on p.player_id=${playerId} and p.board_id=bv.board_id and p.board_version=bv.version where sa.game_day=${gameDay} and sa.published=true and sa.game_day=bv.game_day and bv.published_at<=${now()} and bv.game_day is not null and bv.game_day<${day} limit 1`;
      return rows[0];
    },
  };
}

export function createPostgresAuthServices(
  connection: string | Sql,
  options: { pepper: string; email: EmailAdapter; now?: () => Date },
) {
  const sql =
      typeof connection === "string" ? postgres(connection) : connection,
    now = options.now ?? (() => new Date());
  const hash = (v: string) => tokenHash(v, options.pepper);
  const rotate = async (tx: any, accountId: string) => {
    await tx`delete from account_sessions where account_id=${accountId}`;
    const raw = newOpaqueCredential();
    await tx`insert into account_sessions(id,account_id,token_hash,expires_at) values(${crypto.randomUUID()},${accountId},${hash(raw)},${new Date(now().getTime() + 30 * 86_400_000).toISOString()})`;
    return raw;
  };
  return {
    csrfToken(raw: string) {
      return hash(`csrf:${raw}`);
    },
    async authenticateGuest(raw: string | undefined) {
      if (!raw) return null;
      const rows =
        await sql`select player_id from guest_credentials where token_hash=${hash(raw)} and revoked_at is null`;
      return rows[0] ? String(rows[0].player_id) : null;
    },
    async authenticateAccount(raw: string | undefined) {
      if (!raw) return null;
      const rows =
        await sql`select account_id from account_sessions where token_hash=${hash(raw)} and expires_at>${now().toISOString()}`;
      return rows[0] ? String(rows[0].account_id) : null;
    },
    async accountRoles(accountId: string) {
      const rows =
        await sql`select role from account_roles where account_id=${accountId}`;
      return rows.map((r) => String(r.role));
    },
    async resolveMergeRetry(accountRaw: string, guestRaw: string) {
      const rows =
        await sql`select merged_account_id,prior_account_token_hash,merge_receipt_expires_at from guest_credentials where token_hash=${hash(guestRaw)} and revoked_at is not null`;
      const row = rows[0];
      if (
        !row ||
        !row.merged_account_id ||
        !row.prior_account_token_hash ||
        new Date(String(row.merge_receipt_expires_at)) <= now()
      )
        return null;
      return verifyCredential(
        accountRaw,
        String(row.prior_account_token_hash),
        options.pepper,
      )
        ? String(row.merged_account_id)
        : null;
    },
    async requestMagicLink(email: string, _ip: string) {
      const normalized = normalizeEmail(email),
        raw = newOpaqueCredential();
      await sql`insert into magic_links(id,email,token_hash,expires_at) values(${crypto.randomUUID()},${normalized},${hash(raw)},${new Date(now().getTime() + 900_000).toISOString()})`;
      await options.email.sendMagicLink(normalized, raw);
      return {
        message: "If the address is eligible, a sign-in link has been sent.",
      };
    },
    async consumeMagicLink(raw: string) {
      const current = now().toISOString();
      return sql.begin(async (tx) => {
        const rows =
          await tx`update magic_links set consumed_at=${current} where token_hash=${hash(raw)} and consumed_at is null and expires_at>${current} returning email`;
        if (!rows.length) return null;
        const email = String(rows[0]!.email);
        let accounts =
          await tx`select id from accounts where email=${email} for update`;
        let accountId: string;
        if (!accounts.length) {
          const playerId = crypto.randomUUID();
          accountId = crypto.randomUUID();
          await tx`insert into players(id) values(${playerId})`;
          await tx`insert into accounts(id,email,player_id) values(${accountId},${email},${playerId})`;
        } else accountId = String(accounts[0]!.id);
        return { sessionToken: await rotate(tx, accountId) };
      });
    },
    async mergeGuest(
      accountId: string,
      guestRaw: string,
      priorAccountRaw: string,
    ) {
      return sql.begin(async (tx) => {
        const current = now().toISOString();
        const accounts =
          await tx`select player_id from accounts where id=${accountId} for update`;
        if (!accounts.length) throw new Error("Authentication required");
        const guestDigest = hash(guestRaw),
          mergeToken = tokenHash(
            `merge:${guestDigest}:${accountId}`,
            options.pepper,
          ),
          mergeHash = hash(mergeToken);
        const guests =
          await tx`select player_id,revoked_at,merged_account_id from guest_credentials where token_hash=${guestDigest} for update`;
        if (
          !guests.length ||
          (guests[0]!.revoked_at &&
            String(guests[0]!.merged_account_id) !== accountId)
        )
          throw new Error("Invalid guest credential");
        if (guests[0]!.revoked_at) {
          const receipt =
            await tx`select 1 from account_sessions where account_id=${accountId} and token_hash=${mergeHash} and expires_at>${current}`;
          if (!receipt.length) throw new Error("Merge receipt expired");
          return { sessionToken: mergeToken, result: { merged: true } };
        }
        const guestId = String(guests[0]!.player_id),
          playerId = String(accounts[0]!.player_id);
        if (guestId !== playerId) {
          await tx`delete from plays a using plays g where a.player_id=${playerId} and g.player_id=${guestId} and a.mode='daily' and g.mode='daily' and a.game_day=g.game_day and a.finished_at is null and g.finished_at is not null`;
          await tx`delete from plays g using plays a where g.player_id=${guestId} and a.player_id=${playerId} and g.mode='daily' and a.mode='daily' and g.game_day=a.game_day`;
          await tx`delete from plays g using plays a where g.player_id=${guestId} and a.player_id=${playerId} and g.mode='archive' and a.mode='archive' and g.board_id=a.board_id and g.board_version=a.board_version`;
          await tx`update plays set player_id=${playerId} where player_id=${guestId}`;
          await tx`insert into achievement_unlocks(player_id,achievement_id,unlocked_at) select ${playerId},achievement_id,unlocked_at from achievement_unlocks where player_id=${guestId} on conflict do nothing`;
          await tx`delete from achievement_unlocks where player_id=${guestId}`;
          await tx`insert into streaks(player_id,kind,current,best,last_game_day) select ${playerId},kind,current,best,last_game_day from streaks where player_id=${guestId} on conflict(player_id,kind) do update set best=greatest(streaks.best,excluded.best),current=greatest(streaks.current,excluded.current),last_game_day=greatest(streaks.last_game_day,excluded.last_game_day)`;
          await tx`delete from streaks where player_id=${guestId}`;
        }
        await tx`update guest_credentials set revoked_at=${current},merged_account_id=${accountId},prior_account_token_hash=${hash(priorAccountRaw)},merge_receipt_expires_at=${new Date(now().getTime() + 300_000).toISOString()} where player_id=${guestId}`;
        await tx`delete from account_sessions where account_id=${accountId}`;
        await tx`insert into account_sessions(id,account_id,token_hash,expires_at) values(${crypto.randomUUID()},${accountId},${mergeHash},${new Date(now().getTime() + 30 * 86_400_000).toISOString()})`;
        return { sessionToken: mergeToken, result: { merged: true } };
      });
    },
  };
}
const previousDay = (day: string) =>
  new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
