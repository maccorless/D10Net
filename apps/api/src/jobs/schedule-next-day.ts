import {ensureNextBoard} from "../scheduler.js";
import {canonicalGameDay} from "../date-policy.js";

export function nextGameDay(now=new Date(),zone="America/New_York"){const day=canonicalGameDay(now,zone),[year,month,date]=day.split("-").map(Number),next=new Date(Date.UTC(year!,month!-1,date!+1));return next.toISOString().slice(0,10)}

export async function main(){const result=await ensureNextBoard(nextGameDay(new Date(),process.env.GAME_TIME_ZONE??"America/New_York"));process.stdout.write(`${JSON.stringify(result)}\n`)}

if(import.meta.url===`file://${process.argv[1]}`)main().catch(error=>{process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1});
