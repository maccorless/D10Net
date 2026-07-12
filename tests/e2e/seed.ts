import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validCitiesBoard } from "@daily/test-data/boards";
import { tokenHash } from "../../apps/api/src/auth";

export async function resetTestDatabase() {
if (process.env.NODE_ENV !== "test") throw new Error("The deterministic seed is test-only");
const connection = process.env.TEST_DATABASE_URL;
if (!connection) throw new Error("TEST_DATABASE_URL is required");
const sql = postgres(connection, { max: 1 });
const migrations = ["0001_initial.sql", "0002_publisher.sql", "0003_hint_used.sql"];
await sql.unsafe("drop schema public cascade; create schema public");
for (const name of migrations) {
  const source = await readFile(resolve(process.cwd(), `apps/api/src/db/migrations/${name}`), "utf8");
  for (const statement of source.split(name === "0001_initial.sql" ? "--> statement-breakpoint" : ";").map(value => value.trim()).filter(Boolean)) await sql.unsafe(statement);
}
const player = "00000000-0000-4000-8000-000000000001";
const account = "00000000-0000-4000-8000-000000000002";
await sql`insert into players(id) values(${player})`;
await sql`insert into guest_credentials(player_id,token_hash) values(${player},${tokenHash("e2e-guest-token", "test-pepper")})`;
await sql`insert into accounts(id,email,player_id) values(${account},'publisher@example.test',${player})`;
await sql`insert into account_roles(account_id,role) values(${account},'publisher')`;
await sql`insert into account_sessions(id,account_id,token_hash,expires_at) values('00000000-0000-4000-8000-000000000030',${account},${tokenHash("e2e-account-token", "test-pepper")},'2027-07-11T00:00:00Z')`;
for (const [id, day] of [["largest-cities", "2026-07-11"], ["past-cities", "2026-07-10"], ["missed-cities", "2026-07-09"], ["emergency-cities", "2026-07-12"]] as const) {
  const board = { ...validCitiesBoard, id, gameDay: day };
  await sql`insert into boards(id,title) values(${id},${board.title})`;
  await sql`insert into board_versions(board_id,version,game_day,payload,published_at,state) values(${id},1,${day},${sql.json(board)},'2026-07-01T00:00:00Z','Published')`;
  await sql`insert into schedule_assignments(game_day,board_id,board_version,published) values(${day},${id},1,true)`;
}
await sql`insert into plays(id,player_id,board_id,board_version,game_day,board_game_day,played_at,mode,hint_mode,started_at,finished_at,score,elapsed_ms,authoritative_result,ranking_eligible) values('00000000-0000-4000-8000-000000000020',${player},'past-cities',1,'2026-07-11','2026-07-10','2026-07-11T10:00:00Z','archive','off','2026-07-11T10:00:00Z','2026-07-11T10:01:00Z',7,60000,${sql.json({score:7,answersFound:6,elapsedMs:60000,acceptedAt:'2026-07-11T10:01:00Z',rankingEligible:false})},false)`;
await sql.end();
console.log("Seeded canonical day 2026-07-11, publisher, daily, archive, and emergency boards");
}
if (process.argv[1]?.endsWith("seed.ts")) void resetTestDatabase();
