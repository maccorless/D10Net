import {describe,expect,it} from "vitest";
import {createPublisherService,InMemoryPublisherRepository} from "./publisher.js";
import {createApp} from "./app.js";

const board={id:"cities",version:1,gameDay:"2026-07-12",title:"Cities",metric:"population",tags:["cities"],sources:[{name:"Census",url:"https://example.gov"}],universe:Array.from({length:10},(_,i)=>({id:`c${i}`,label:`City ${i}`,aliases:[],metricValue:String(10-i)})),ranked:Array.from({length:10},(_,i)=>`c${i}`)};
describe("publisher lifecycle",()=>{
  it("makes published versions immutable and corrections increment version",async()=>{
    const repo=new InMemoryPublisherRepository(), service=createPublisherService(repo);
    await service.import("actor",board); await service.validate("actor","cities",1); await service.schedule("actor","cities",1,"2026-07-12"); await service.publish("actor","cities",1);
    await expect(service.edit("actor","cities",1,{title:"Changed"})).rejects.toThrow(/immutable/i);
    expect((await service.correct("actor","cities",1,{...board,title:"Corrected"})).version).toBe(2);
    expect(repo.audit.some(e=>e.actorId==="actor"&&e.action==="correct")).toBe(true);
  });
  it("role gates mutations, validates origin and audits denials",async()=>{
    const repo=new InMemoryPublisherRepository(), publisher=createPublisherService(repo);
    const app=createApp({start:async()=>({}),finish:async()=>({}),rankings:async()=>({}),publisher},{origins:["https://desk.test"],authenticateAccount:async token=>token==="pub"?"actor":token==="player"?"ordinary":null,accountRoles:async id=>id==="actor"?["publisher"]:[]});
    for(const token of [undefined,"player"]){const response=await app.request("/v1/publisher/boards",{method:"POST",headers:{...(token?{cookie:`d10_account=${token}`}:{ }),origin:"https://desk.test","x-csrf-token":"yes","content-type":"application/json"},body:JSON.stringify(board)});expect(response.status).toBe(403)}
    expect(repo.audit.filter(e=>e.action==="denied")).toHaveLength(2);
  });
  it("returns 404 for a future public board without calling a future-leaking fetch",async()=>{
    let called=false;
    const app=createApp({start:async()=>({}),finish:async()=>({}),rankings:async()=>({}),publicBoard:async()=>{called=true;return board}},{origins:[],canonicalDay:()=>"2026-07-11"});
    expect((await app.request("/v1/boards/2026-07-12")).status).toBe(404); expect(called).toBe(false);
  });
  it("exposes the complete lifecycle only to a publisher and audits every transition",async()=>{const repo=new InMemoryPublisherRepository(),publisher=createPublisherService(repo),app=createApp({start:async()=>({}),finish:async()=>({}),rankings:async()=>({}),publisher},{origins:["https://desk.test"],authenticateAccount:async()=>"actor",accountRoles:async()=>["publisher"]}),headers={cookie:"d10_account=pub",origin:"https://desk.test","x-csrf-token":"token","content-type":"application/json"},call=(path:string,body?:unknown,method="POST")=>app.request(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});expect((await call("/v1/publisher/boards",board)).status).toBe(201);expect((await call("/v1/publisher/boards/cities/1/validate")).status).toBe(200);expect((await call("/v1/publisher/boards/cities/1/schedule",{gameDay:"2026-07-12"})).status).toBe(200);expect((await call("/v1/publisher/boards/cities/1/publish")).status).toBe(200);expect((await call("/v1/publisher/boards/cities/1/correct",{...board,title:"Correction"})).status).toBe(201);expect((await call("/v1/publisher/boards/cities/1/retire")).status).toBe(200);expect(repo.audit.map(x=>x.action)).toEqual(["import","validate","schedule","publish","correct","retire"])});
  it("requires a session-bound double-submit CSRF token",async()=>{const repo=new InMemoryPublisherRepository(),publisher=createPublisherService(repo),app=createApp({start:async()=>({}),finish:async()=>({}),rankings:async()=>({}),publisher},{origins:["https://desk.test"],authenticateAccount:async token=>token?"actor":null,accountRoles:async()=>["publisher"],csrfToken:session=>`csrf-${session}`}),send=(cookie:string,header?:string,origin="https://desk.test")=>app.request("/v1/publisher/boards",{method:"POST",headers:{cookie,origin,"content-type":"application/json",...(header?{"x-csrf-token":header}:{})},body:JSON.stringify(board)});expect((await send("d10_account=a; d10_csrf=csrf-a")).status).toBe(403);expect((await send("d10_account=a; d10_csrf=forged","forged")).status).toBe(403);expect((await send("d10_account=a; d10_csrf=csrf-b","csrf-b")).status).toBe(403);expect((await send("d10_account=a; d10_csrf=csrf-a","csrf-a","https://evil.test")).status).toBe(403);expect((await send("d10_account=a; d10_csrf=csrf-a","csrf-a")).status).toBe(201);expect(repo.audit.filter(x=>x.action==="denied")).toHaveLength(4)});
});
