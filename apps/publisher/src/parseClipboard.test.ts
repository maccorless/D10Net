import {describe,expect,it} from "vitest";
import {parseClipboard} from "./parseClipboard";

const header="board_id\ttitle\tmetric\ttags\tsource_name\tsource_url\tpublish_date\trank\tcanonical_id\tlabel\taliases";
const rows=(id:string,count=10)=>Array.from({length:count},(_,i)=>`${id}\t${id} title\tpopulation\tgeo|cities\tCensus\thttps://example.gov\t2026-07-10\t${i<10?i+1:""}\t${id}-${i}\tCity ${i}\tAlias ${i}|Other ${i}`);

describe("parseClipboard",()=>{
  it("groups an Excel paste containing multiple boards",()=>{
    const result=parseClipboard([header,...rows("one"),...rows("two")].join("\n"));
    expect(result.validBoards).toHaveLength(2);
    expect(result.validBoards[0].universe).toHaveLength(10);
    expect(result.validBoards[0].ranked).toHaveLength(10);
  });
  it("retains valid groups when another board is invalid",()=>{
    const bad=rows("bad"); bad[2]=bad[2].replace("bad title","different title");
    const result=parseClipboard([header,...rows("good"),...bad].join("\n"));
    expect(result.validBoards.map(b=>b.id)).toEqual(["good"]);
    expect(result.errors).toContainEqual(expect.objectContaining({boardId:"bad",row:14,column:"title"}));
  });
  it("requires exact template headers",()=>{
    const result=parseClipboard([header.replace("canonical_id","candidate_id"),...rows("one")].join("\n"));
    expect(result.validBoards).toEqual([]);
    expect(result.errors[0].message).toMatch(/header/i);
  });
});
