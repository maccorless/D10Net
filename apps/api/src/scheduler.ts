import postgres,{type Sql} from "postgres";

export type ScheduleResult={source:"explicit"|"random"|"emergency";boardId:string;boardVersion:number;gameDay:string};
export type SchedulerOptions={emergencyBoard?:{id:string;version:number}};
type Row={board_id:string;board_version:number};

export function createScheduler(sql:Sql,options:SchedulerOptions){
  return {async ensureNextBoard(gameDay:string,random:()=>number=Math.random):Promise<ScheduleResult>{
    const result=await sql.begin(async tx=>{
      await tx`select pg_advisory_xact_lock(hashtext(${`publisher-schedule:${gameDay}`}))`;
      const existing=await tx<Row[]>`select board_id,board_version from schedule_assignments where game_day=${gameDay} for update`;
      if(existing[0])return {source:"explicit" as const,boardId:existing[0].board_id,boardVersion:existing[0].board_version,gameDay};
      const rows=await tx<Row[]>`select bv.board_id,bv.version as board_version from board_versions bv where bv.state='Validated' and bv.game_day is null and not exists(select 1 from schedule_assignments sa where sa.board_id=bv.board_id and sa.board_version=bv.version) order by bv.board_id,bv.version`,emergency=options.emergencyBoard,candidates=rows.filter(row=>!emergency||(row.board_id!==emergency.id||row.board_version!==emergency.version));
      let selected:Row|undefined,source:"random"|"emergency"="random";
      if(candidates.length){const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw new Error("Random source must return a number in [0, 1)");selected=candidates[Math.floor(value*candidates.length)]}
      if(!selected){
        await tx`insert into audit_events(id,kind,payload) values(${crypto.randomUUID()},'publisher_pool_empty',${tx.json({gameDay})})`;
        if(emergency){const rows=await tx<Row[]>`select bv.board_id,bv.version as board_version from board_versions bv where bv.board_id=${emergency.id} and bv.version=${emergency.version} and bv.state='Validated' and bv.game_day is null and not exists(select 1 from schedule_assignments sa where sa.board_id=bv.board_id and sa.board_version=bv.version) for update`;selected=rows[0]}
        if(!selected)return null;
        source="emergency";
      }
      await tx`insert into schedule_assignments(game_day,board_id,board_version) values(${gameDay},${selected.board_id},${selected.board_version})`;
      await tx`update board_versions set game_day=${gameDay},state='Scheduled' where board_id=${selected.board_id} and version=${selected.board_version}`;
      await tx`insert into audit_events(id,kind,payload) values(${crypto.randomUUID()},'publisher_board_scheduled',${tx.json({gameDay,boardId:selected.board_id,boardVersion:selected.board_version,source})})`;
      return {source,boardId:selected.board_id,boardVersion:selected.board_version,gameDay};
    });
    if(!result)throw new Error("Publisher pool empty and emergency board unavailable");
    return result;
  }};
}

export async function ensureNextBoard(gameDay:string,random:()=>number=Math.random):Promise<ScheduleResult>{
  const databaseUrl=process.env.DATABASE_URL;
  if(!databaseUrl)throw new Error("DATABASE_URL is required");
  const emergencyId=process.env.EMERGENCY_BOARD_ID,emergencyVersion=Number(process.env.EMERGENCY_BOARD_VERSION??"1"),sql=postgres(databaseUrl);
  try{return await createScheduler(sql,{emergencyBoard:emergencyId?{id:emergencyId,version:emergencyVersion}:undefined}).ensureNextBoard(gameDay,random)}finally{await sql.end()}
}
