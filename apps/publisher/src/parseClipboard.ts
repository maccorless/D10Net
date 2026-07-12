import {BoardSchema,type Board} from "@daily/contracts";
const columns=["board_id","title","metric","tags","source_name","source_url","publish_date","rank","canonical_id","label","aliases"] as const;
export type ImportError={boardId:string;row:number;column:string;message:string};
export type ParseResult={validBoards:Board[];errors:ImportError[]};
export function parseClipboard(tsv:string):ParseResult{
 const lines=tsv.replace(/\r/g,"").split("\n").filter(Boolean), header=lines.shift()?.split("\t")??[];
 if(header.length!==columns.length||columns.some((c,i)=>header[i]!==c))return {validBoards:[],errors:[{boardId:"",row:1,column:"header",message:`Header must exactly match: ${columns.join(", ")}`}]};
 const groups=new Map<string,{row:number;v:string[]}[]>(); lines.forEach((line,i)=>{const v=line.split("\t"),id=v[0]??"";groups.set(id,[...(groups.get(id)??[]),{row:i+2,v}])});
 const validBoards:Board[]=[],errors:ImportError[]=[];
 for(const [id,rows] of groups){const first=rows[0].v;for(const {row,v} of rows)for(const [index,column] of columns.entries())if(index<=6&&v[index]!==first[index])errors.push({boardId:id,row,column,message:`Board metadata must match first row (${column})`});
  const ranked=rows.filter(x=>x.v[7]).sort((a,b)=>Number(a.v[7])-Number(b.v[7])).map(x=>x.v[8]);
  const board={id,version:1,gameDay:first[6]||null,title:first[1],metric:first[2],tags:first[3].split("|").filter(Boolean),sources:[{name:first[4],url:first[5]}],universe:rows.map(({v})=>({id:v[8],label:v[9],aliases:(v[10]??"").split("|").filter(Boolean),...(v[7]?{metricValue:v[2]}:{})})),ranked};
  const parsed=BoardSchema.safeParse(board);if(parsed.success&&!errors.some(e=>e.boardId===id))validBoards.push(parsed.data);else if(!parsed.success)for(const issue of parsed.error.issues)errors.push({boardId:id,row:rows[0].row,column:issue.path.join("."),message:issue.message});
 }
 return {validBoards,errors};
}
