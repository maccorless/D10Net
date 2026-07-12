import { BoardSchema, type Board } from "@daily/contracts";
import type { Sql } from "postgres";
export type Lifecycle =
  "Draft" | "Validated" | "Scheduled" | "Published" | "Retired";
export type StoredBoard = Board & { state: Lifecycle };
export type Audit = {
  actorId: string | null;
  action: string;
  at: Date;
  boardId?: string;
  detail?: unknown;
};
export interface PublisherRepository {
  get(id: string, version: number): Promise<StoredBoard | undefined>;
  save(board: StoredBoard): Promise<void>;
  versions(id: string): Promise<StoredBoard[]>;
  dateConflict(day: string, id: string): Promise<boolean>;
  auditEvent(event: Audit): Promise<void>;
  deleteAll(): Promise<void>;
}
export class InMemoryPublisherRepository implements PublisherRepository {
  boards: StoredBoard[] = [];
  audit: Audit[] = [];
  async get(id: string, v: number) {
    return this.boards.find((b) => b.id === id && b.version === v);
  }
  async save(b: StoredBoard) {
    const i = this.boards.findIndex(
      (x) => x.id === b.id && x.version === b.version,
    );
    i < 0
      ? this.boards.push(structuredClone(b))
      : (this.boards[i] = structuredClone(b));
  }
  async versions(id: string) {
    return this.boards.filter((b) => b.id === id);
  }
  async dateConflict(d: string, id: string) {
    return this.boards.some(
      (b) =>
        b.id !== id &&
        b.gameDay === d &&
        ["Scheduled", "Published"].includes(b.state),
    );
  }
  async auditEvent(e: Audit) {
    this.audit.push(e);
  }
  async deleteAll() {
    this.boards = [];
  }
}
export class PostgresPublisherRepository implements PublisherRepository {
  constructor(private sql: Sql) {}
  async get(id: string, v: number) {
    const r = await this
      .sql`select payload,state,game_day from board_versions where board_id=${id} and version=${v}`;
    return r[0]
      ? {
          ...BoardSchema.parse(r[0].payload),
          state: String(r[0].state) as Lifecycle,
          gameDay: r[0].game_day ? String(r[0].game_day) : null,
        }
      : undefined;
  }
  async save(b: StoredBoard) {
    await this.sql.begin(async (tx) => {
      await tx`insert into boards(id,title) values(${b.id},${b.title}) on conflict(id) do update set title=excluded.title`;
      if (b.gameDay && ["Scheduled", "Published"].includes(b.state))
        await tx`delete from schedule_assignments where board_id=${b.id} and board_version=${b.version} and game_day<>${b.gameDay}`;
      await tx`insert into board_versions(board_id,version,game_day,payload,state,published_at) values(${b.id},${b.version},${b.gameDay},${tx.json(b)},${b.state},${b.state === "Published" ? new Date() : null}) on conflict(board_id,version) do update set game_day=excluded.game_day,payload=excluded.payload,state=excluded.state,published_at=case when excluded.state='Published' then coalesce(board_versions.published_at,now()) else board_versions.published_at end`;
      if (b.gameDay && ["Scheduled", "Published"].includes(b.state))
        await tx`insert into schedule_assignments(game_day,board_id,board_version,published) values(${b.gameDay},${b.id},${b.version},${b.state === "Published"}) on conflict(game_day) do update set board_id=excluded.board_id,board_version=excluded.board_version,published=excluded.published`;
    });
  }
  async versions(id: string) {
    const r = await this
      .sql`select version from board_versions where board_id=${id}`;
    return (
      await Promise.all(r.map((x) => this.get(id, Number(x.version))))
    ).filter((x): x is StoredBoard => !!x);
  }
  async dateConflict(day: string, id: string) {
    return !!(
      await this
        .sql`select 1 from schedule_assignments where game_day=${day} and board_id<>${id} limit 1`
    ).length;
  }
  async auditEvent(e: Audit) {
    await this
      .sql`insert into audit_events(id,actor_account_id,kind,payload,created_at) values(${crypto.randomUUID()},${e.actorId},${e.action},${this.sql.json({ boardId: e.boardId, detail: e.detail } as any)},${e.at})`;
  }
  async deleteAll() {
    await this.sql.begin(async (tx) => {
      await tx`delete from plays`;
      await tx`delete from schedule_assignments`;
      await tx`delete from board_versions`;
      await tx`delete from boards`;
    });
  }
}
export function createPublisherService(repo: PublisherRepository) {
  const audit = (
    actorId: string | null,
    action: string,
    boardId?: string,
    detail?: unknown,
  ) => repo.auditEvent({ actorId, action, boardId, detail, at: new Date() });
  return {
    auditDenied: (actorId: string | null, detail: unknown) =>
      repo.auditEvent({ actorId, action: "denied", detail, at: new Date() }),
    async validateImport(actorId: string, input: unknown) {
      const values = Array.isArray(input) ? input : [input],
        validBoards: Board[] = [],
        errors: unknown[] = [];
      for (const [index, value] of values.entries()) {
        const parsed = BoardSchema.safeParse(value);
        parsed.success
          ? validBoards.push(parsed.data)
          : errors.push({ index, issues: parsed.error.issues });
      }
      await audit(actorId, "import_validation", undefined, {
        valid: validBoards.length,
        invalid: errors.length,
      });
      return { validBoards, errors };
    },
    async read(id: string, v: number) {
      const board = await repo.get(id, v);
      if (!board) throw Error("Board not found");
      return board;
    },
    async import(actorId: string, input: unknown) {
      const board = BoardSchema.parse(input),
        stored = { ...board, state: "Draft" as const };
      await repo.save(stored);
      await audit(actorId, "import", board.id);
      return stored;
    },
    async edit(
      actorId: string,
      id: string,
      version: number,
      patch: Partial<Board>,
    ) {
      const b = await repo.get(id, version);
      if (!b) throw Error("Board not found");
      if (b.state === "Published" || b.state === "Retired") {
        await audit(actorId, "denied", id, { reason: "immutable" });
        throw Error("Published versions are immutable");
      }
      const next = BoardSchema.parse({ ...b, ...patch });
      const saved = { ...next, state: "Draft" as const };
      await repo.save(saved);
      await audit(actorId, "edit", id);
      return saved;
    },
    async validate(actorId: string, id: string, v: number) {
      const b = await repo.get(id, v);
      if (!b) throw Error("Board not found");
      BoardSchema.parse(b);
      if (b.gameDay && (await repo.dateConflict(b.gameDay, id)))
        throw Error("Publication date conflict");
      b.state = "Validated";
      await repo.save(b);
      await audit(actorId, "validate", id);
      return b;
    },
    async schedule(actorId: string, id: string, v: number, day: string) {
      const b = await repo.get(id, v);
      if (!b || b.state !== "Validated") throw Error("Board must be validated");
      if (await repo.dateConflict(day, id))
        throw Error("Publication date conflict");
      b.gameDay = day;
      b.state = "Scheduled";
      await repo.save(b);
      await audit(actorId, "schedule", id);
      return b;
    },
    async overrideSchedule(
      actorId: string,
      id: string,
      v: number,
      day: string,
    ) {
      const b = await repo.get(id, v);
      if (!b || !["Validated", "Scheduled", "Published"].includes(b.state))
        throw Error("Board must be validated, scheduled, or published");
      if (await repo.dateConflict(day, id))
        throw Error("Publication date conflict");
      const state = b.state;
      b.gameDay = day;
      b.state = state === "Published" ? "Published" : "Scheduled";
      await repo.save(b);
      await audit(actorId, "schedule_override", id, { gameDay: day });
      return b;
    },
    async publish(actorId: string, id: string, v: number) {
      const b = await repo.get(id, v);
      if (!b || b.state !== "Scheduled") throw Error("Board must be scheduled");
      b.state = "Published";
      await repo.save(b);
      await audit(actorId, "publish", id);
      return b;
    },
    async correct(actorId: string, id: string, v: number, input: unknown) {
      const prior = await repo.get(id, v);
      if (!prior || prior.state !== "Published")
        throw Error("Only published boards can be corrected");
      const parsed = BoardSchema.parse(input),
        versions = await repo.versions(id),
        next = {
          ...parsed,
          id,
          version: Math.max(...versions.map((x) => x.version)) + 1,
          state: "Draft" as const,
        };
      await repo.save(next);
      await audit(actorId, "correct", id, { from: v, to: next.version });
      return next;
    },
    async retire(actorId: string, id: string, v: number) {
      const b = await repo.get(id, v);
      if (!b || b.state !== "Published") throw Error("Board not published");
      b.state = "Retired";
      await repo.save(b);
      await audit(actorId, "retire", id);
      return b;
    },
    async deleteAll(actorId: string | null) {
      await repo.deleteAll();
      await audit(actorId, "delete_all");
    },
    async importBulkPublished(actorId: string | null, inputs: unknown[]) {
      let count = 0;
      for (const input of inputs) {
        const board = BoardSchema.parse(input);
        await repo.save({ ...board, state: "Published" });
        await audit(actorId, "import_publish", board.id);
        count++;
      }
      return { count };
    },
  };
}
