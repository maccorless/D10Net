import { and, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
import { BoardSchema } from "@daily/contracts";
import {
  auditEvents,
  boards,
  boardVersions,
  plays,
  scheduleAssignments,
} from "./db/schema.js";
import type {
  Audit,
  Lifecycle,
  PublisherRepository,
  StoredBoard,
} from "./publisher.js";
export class DrizzlePublisherRepository implements PublisherRepository {
  private db;
  constructor(sql: Sql) {
    this.db = drizzle(sql);
  }
  async get(id: string, version: number) {
    const [r] = await this.db
      .select()
      .from(boardVersions)
      .where(
        and(eq(boardVersions.boardId, id), eq(boardVersions.version, version)),
      )
      .limit(1);
    return r
      ? {
          ...BoardSchema.parse(r.payload),
          gameDay: r.gameDay,
          state: r.state as Lifecycle,
        }
      : undefined;
  }
  async save(b: StoredBoard) {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(boards)
        .values({ id: b.id, title: b.title })
        .onConflictDoUpdate({ target: boards.id, set: { title: b.title } });
      await tx
        .insert(boardVersions)
        .values({
          boardId: b.id,
          version: b.version,
          gameDay: b.gameDay,
          payload: b,
          state: b.state,
          publishedAt: b.state === "Published" ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [boardVersions.boardId, boardVersions.version],
          set: {
            gameDay: b.gameDay,
            payload: b,
            state: b.state,
            ...(b.state === "Published" ? { publishedAt: new Date() } : {}),
          },
        });
      await tx
        .delete(scheduleAssignments)
        .where(
          and(
            eq(scheduleAssignments.boardId, b.id),
            eq(scheduleAssignments.boardVersion, b.version),
          ),
        );
      if (b.gameDay && ["Scheduled", "Published"].includes(b.state))
        await tx
          .insert(scheduleAssignments)
          .values({
            gameDay: b.gameDay,
            boardId: b.id,
            boardVersion: b.version,
            published: b.state === "Published",
          })
          .onConflictDoUpdate({
            target: scheduleAssignments.gameDay,
            set: {
              boardId: b.id,
              boardVersion: b.version,
              published: b.state === "Published",
            },
          });
    });
  }
  async versions(id: string) {
    return (
      await this.db
        .select()
        .from(boardVersions)
        .where(eq(boardVersions.boardId, id))
    ).map((r) => ({
      ...BoardSchema.parse(r.payload),
      gameDay: r.gameDay,
      state: r.state as Lifecycle,
    }));
  }
  async dateConflict(day: string, id: string) {
    return (
      (
        await this.db
          .select({ day: scheduleAssignments.gameDay })
          .from(scheduleAssignments)
          .where(
            and(
              eq(scheduleAssignments.gameDay, day),
              ne(scheduleAssignments.boardId, id),
            ),
          )
          .limit(1)
      ).length > 0
    );
  }
  async auditEvent(e: Audit) {
    await this.db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      actorAccountId: e.actorId,
      kind: e.action,
      payload: { boardId: e.boardId, detail: e.detail } as any,
      createdAt: e.at,
    });
  }
  async deleteAll() {
    await this.db.transaction(async (tx) => {
      await tx.delete(plays);
      await tx.delete(scheduleAssignments);
      await tx.delete(boardVersions);
      await tx.delete(boards);
    });
  }
}
