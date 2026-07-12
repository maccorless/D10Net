import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { readFile } from "node:fs/promises";
import { validCitiesBoard } from "@daily/test-data/boards";
import { createPostgresAuthServices, createPostgresServices } from "./postgres-service.js";
import {createPublisherService} from "./publisher.js";import {DrizzlePublisherRepository as PostgresPublisherRepository} from "./publisher-repository.js";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL authoritative integration", () => {
  const schema = `d10_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const players = Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  let admin: Sql; let sql: Sql; let clock = new Date("2026-07-11T12:00:00Z");
  const services = () => createPostgresServices(sql, { now: () => clock, zone: "America/New_York" });
  const guesses = validCitiesBoard.ranked.map((candidateId, atMs) => ({ candidateId, calledNumberOne: false, atMs }));
  const result = (playId: string) => ({ playId, guesses, hintUsed: false, finishedAt: clock.toISOString() });

  beforeAll(async () => {
    admin = postgres(url!, { max: 1 });
    await admin.unsafe(`create schema "${schema}"`);
    sql = postgres(url!, { max: 8, connection: { search_path: schema } });
    const migration = (await readFile(new URL("./db/migrations/0001_initial.sql", import.meta.url), "utf8")).replaceAll('"public".',`"${schema}".`);
    for (const statement of migration.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await sql.unsafe(statement);
    const publisherMigration=await readFile(new URL("./db/migrations/0002_publisher.sql",import.meta.url),"utf8");for(const statement of publisherMigration.split(";").map(s=>s.trim()).filter(Boolean))await sql.unsafe(statement);
    await sql.unsafe(await readFile(new URL("./db/migrations/0003_hint_used.sql",import.meta.url),"utf8"));
    for (const id of players) await sql`insert into players (id) values (${id})`;
    await sql`insert into boards (id,title) values ('largest-cities','Cities'),('future-board','Future'),('past-board','Past'),('null-board','Null'),('mismatch-board','Mismatch')`;
    await sql`insert into board_versions (board_id,version,game_day,payload,published_at) values ('largest-cities',1,'2026-07-11',${sql.json(validCitiesBoard)},'2026-07-10T00:00:00Z'),('future-board',1,'2026-07-12',${sql.json({ ...validCitiesBoard, id: "future-board", gameDay: "2026-07-12" })},'2026-07-12T00:00:00Z'),('past-board',1,'2026-07-10',${sql.json({...validCitiesBoard,id:"past-board",gameDay:"2026-07-10"})},'2026-07-09T00:00:00Z')`;
    await sql`insert into schedule_assignments (game_day,board_id,board_version,published) values ('2026-07-11','largest-cities',1,true),('2026-07-12','future-board',1,false),('2026-07-10','past-board',1,true)`;
    await sql`insert into board_versions(board_id,version,game_day,payload,published_at) values('null-board',1,null,${sql.json({...validCitiesBoard,id:'null-board'})},'2026-07-01'),('mismatch-board',1,'2026-07-09',${sql.json({...validCitiesBoard,id:'mismatch-board',gameDay:'2026-07-09'})},'2026-07-01')`;
    await sql`insert into schedule_assignments(game_day,board_id,board_version,published) values('2026-07-08','null-board',1,true),('2026-07-07','mismatch-board',1,true)`;
  });
  afterAll(async () => { await sql?.end(); await admin?.unsafe(`drop schema if exists "${schema}" cascade`); await admin?.end(); });

  it("applies the migration in an isolated empty schema", async () => {
    const rows = await sql`select constraint_name from information_schema.table_constraints where table_schema=${schema} and table_name='plays' and constraint_type='FOREIGN KEY'`;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect((await sql`select column_name from information_schema.columns where table_schema=${schema} and table_name='plays' and column_name='hint_used'`)).toHaveLength(1);
  });

  it("makes concurrent/retried Daily start idempotent", async () => {
    const service = services(); const input = { mode: "daily" as const, hintMode: "off" as const };
    const [a, b] = await Promise.all([service.start(players[0]!, input), service.start(players[0]!, input)]);
    expect(b.play.playId).toBe(a.play.playId);
    expect((await service.start(players[0]!, input)).play.playId).toBe(a.play.playId);
    expect(a.board.id).toBe("largest-cities");
    expect(Number((await sql`select count(*) n from plays where player_id=${players[0]!}`)[0]!.n)).toBe(1);
  });

  it("returns deeply equal full results for concurrent/retried finish and mutates once", async () => {
    const service = services(); const play = await service.start(players[1]!, { mode: "daily", hintMode: "off" });
    clock = new Date("2026-07-11T12:01:00Z");
    const [a, b] = await Promise.all([service.finish(players[1]!, play.play.playId, result(play.play.playId)), service.finish(players[1]!, play.play.playId, result(play.play.playId))]);
    expect(b).toEqual(a); expect(await service.finish(players[1]!, play.play.playId, result(play.play.playId))).toEqual(a);
    expect(Number((await sql`select count(*) n from streaks where player_id=${players[1]!}`)[0]!.n)).toBe(4);
    expect((await sql`select authoritative_result from plays where id=${play.play.playId}`)[0]!.authoritative_result).toEqual(a.finished);
    expect((await sql`select hint_used from plays where id=${play.play.playId}`)[0]!.hint_used).toBe(false);
  });

  it("uses server elapsed time and issued start day across midnight", async () => {
    clock = new Date("2026-07-12T03:59:30Z"); const service = services();
    const play = await service.start(players[2]!, { mode: "daily", hintMode: "off" });
    clock = new Date("2026-07-12T04:00:30Z"); const finished = await service.finish(players[2]!, play.play.playId, result(play.play.playId));
    expect(finished.finished?.elapsedMs).toBe(60_000); expect(finished.finished?.gameDay).toBe("2026-07-11");
  });

  it("does not leak future or unpublished boards", async () => {
    clock = new Date("2026-07-11T12:00:00Z"); const service = services();
    await expect(service.start(players[3]!, { mode: "archive", hintMode: "off", boardId: "future-board", boardVersion: 1 })).rejects.toThrow("Board not found");
    expect(Number((await sql`select count(*) n from plays where player_id=${players[3]!}`)[0]!.n)).toBe(0);
  });
  it("lists and starts only strictly past published matching Archive boards",async()=>{clock=new Date("2026-07-11T12:00:00Z");const service=services();expect((await service.archive(players[3]!)).map(r=>String(r.game_day))).toEqual(["2026-07-10"]);expect(await service.archiveDay(players[3]!,"2026-07-11")).toBeUndefined();expect(await service.archiveDay(players[3]!,"2026-07-10")).toMatchObject({status:"playable"});const started=await service.start(players[3]!,{mode:"archive",hintMode:"off",boardId:"past-board",boardVersion:1});expect(started.play.mode).toBe("archive");for(const [boardId,boardVersion] of [["largest-cities",1],["future-board",1],["null-board",1],["mismatch-board",1]] as const)await expect(service.start(players[3]!,{mode:"archive",hintMode:"off",boardId,boardVersion})).rejects.toThrow("Board not found")});

  it("excludes anomalies, audits them, separates hint pools, and persists all streaks", async () => {
    const service = services(); clock = new Date("2026-07-11T12:00:00Z");
    const off = await service.start(players[4]!, { mode: "daily", hintMode: "off" });
    const on = await service.start(players[5]!, { mode: "daily", hintMode: "on" });
    clock = new Date("2026-07-11T12:00:01Z"); await service.finish(players[4]!, off.play.playId, result(off.play.playId));
    clock = new Date("2026-07-11T12:01:00Z"); await service.finish(players[5]!, on.play.playId, result(on.play.playId));
    expect((await service.rankings("2026-07-11", "off", 100)).some(row => row.player_id === players[4])).toBe(false);
    expect((await service.rankings("2026-07-11", "on", 100)).filter(row => row.player_id === players[5])).toHaveLength(1);
    expect(Number((await sql`select count(*) n from audit_events where play_id=${off.play.playId} and kind='impossible_time'`)[0]!.n)).toBe(1);
    expect((await sql`select kind,current from streaks where player_id=${players[4]!} order by kind`).map(r => [r.kind, r.current])).toEqual([["fivePlus",1],["noHint",1],["perfect",1],["played",1]]);
  });

  it("rolls back a failing immutable-board replay", async () => {
    clock = new Date("2026-07-11T12:00:00Z"); const service = services(); const play = await service.start(players[6]!, { mode: "daily", hintMode: "off" });
    await expect(service.finish(players[6]!, play.play.playId, { ...result(play.play.playId), guesses: [] })).rejects.toThrow(/not complete/i);
    expect((await sql`select finished_at from plays where id=${play.play.playId}`)[0]!.finished_at).toBeNull();
    const invalid = { ...result(play.play.playId), guesses: [...guesses, guesses[0]!] };
    await expect(service.finish(players[6]!, play.play.playId, invalid)).rejects.toThrow(/unavailable|guess count/i);
    const row = (await sql`select finished_at,authoritative_result from plays where id=${play.play.playId}`)[0]!;
    expect(row.finished_at).toBeNull(); expect(row.authoritative_result).toBeNull();
    expect(Number((await sql`select count(*) n from streaks where player_id=${players[6]!}`)[0]!.n)).toBe(0);
  });
  it("persists publisher lifecycle, actor audits, immutable versions, and corrections",async()=>{const actor=crypto.randomUUID(),player=crypto.randomUUID();await sql`insert into players(id) values(${player})`;await sql`insert into accounts(id,email,player_id) values(${actor},${`publisher-${actor}@example.test`},${player})`;await sql`insert into account_roles(account_id,role) values(${actor},'publisher')`;const service=createPublisherService(new PostgresPublisherRepository(sql)),draft={...validCitiesBoard,id:`publisher-${actor}`,gameDay:"2026-07-20"};await service.import(actor,draft);await service.validate(actor,draft.id,1);await service.schedule(actor,draft.id,1,"2026-07-20");await service.publish(actor,draft.id,1);await expect(service.edit(actor,draft.id,1,{title:"forbidden"})).rejects.toThrow(/immutable/);expect((await service.correct(actor,draft.id,1,{...draft,title:"corrected"})).version).toBe(2);expect((await sql`select kind from audit_events where actor_account_id=${actor} order by created_at`).map(x=>x.kind)).toEqual(["import","validate","schedule","publish","denied","correct"])});

  it("persists single-use and expiring magic links in the isolated schema",async()=>{let delivered="";const auth=createPostgresAuthServices(sql,{pepper:"integration-pepper",now:()=>clock,email:{async sendMagicLink(_email,token){delivered=token}}});await auth.requestMagicLink(" Person@Example.COM ","192.0.2.1");expect(delivered).not.toBe("");const signedIn=await auth.consumeMagicLink(delivered);expect(signedIn?.sessionToken).toBeTruthy();expect(await auth.consumeMagicLink(delivered)).toBeNull();expect(await auth.authenticateAccount(signedIn!.sessionToken)).toBeTruthy();await auth.requestMagicLink("expired@example.com","192.0.2.1");const expired=delivered;clock=new Date(clock.getTime()+900_001);expect(await auth.consumeMagicLink(expired)).toBeNull()});
  it("atomically merges and returns one valid session across concurrent retries",async()=>{clock=new Date("2026-07-11T12:00:00Z");let link="";const auth=createPostgresAuthServices(sql,{pepper:"merge-pepper",now:()=>clock,email:{async sendMagicLink(_e,t){link=t}}}),game=createPostgresServices(sql,{now:()=>clock,pepper:"merge-pepper"});await auth.requestMagicLink("merge@example.com","ip");const login=await auth.consumeMagicLink(link),accountId=await auth.authenticateAccount(login!.sessionToken),guest=await game.createSession(null);await sql`insert into achievement_unlocks(player_id,achievement_id) values(${guest.playerId},'guest-achievement')`;await sql`insert into streaks(player_id,kind,current,best,last_game_day) values(${guest.playerId},'played',2,4,'2026-07-10')`;const [a,b]=await Promise.all([auth.mergeGuest(accountId!,guest.token,login!.sessionToken),auth.mergeGuest(accountId!,guest.token,login!.sessionToken)]);expect(b.sessionToken).toBe(a.sessionToken);expect(await auth.resolveMergeRetry(login!.sessionToken,guest.token)).toBe(accountId);expect(await auth.resolveMergeRetry("wrong",guest.token)).toBeNull();expect(await auth.authenticateAccount(a.sessionToken)).toBe(accountId);const accountPlayer=String((await sql`select player_id from accounts where id=${accountId!}`)[0]!.player_id);expect(await sql`select achievement_id from achievement_unlocks where player_id=${accountPlayer}`).toMatchObject([{achievement_id:'guest-achievement'}]);expect((await sql`select revoked_at from guest_credentials where player_id=${guest.playerId}`)[0]!.revoked_at).not.toBeNull();clock=new Date(clock.getTime()+300_001);expect(await auth.resolveMergeRetry(login!.sessionToken,guest.token)).toBeNull();await expect(auth.mergeGuest(accountId!,"wrong-proof",login!.sessionToken)).rejects.toThrow();expect(await sql`select kind,best from streaks where player_id=${accountPlayer}`).toMatchObject([{kind:'played',best:4}])});
});
