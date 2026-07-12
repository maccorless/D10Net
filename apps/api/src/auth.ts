import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
export const normalizeEmail=(email:string)=>email.trim().toLowerCase();
export const tokenHash=(token:string,pepper:string)=>createHmac("sha256",pepper).update(token).digest("hex");
export const newOpaqueCredential=()=>randomBytes(32).toString("base64url");
export const secureCookie=(name:string,value:string,maxAge=2_592_000)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const expiredCookie=(name:string)=>`${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export function verifyOrigin(origin:string|undefined,allowed:string[]){return !!origin&&allowed.includes(origin)}
export function verifyCredential(raw:string,storedHash:string,pepper:string){const actual=Buffer.from(tokenHash(raw,pepper)),expected=Buffer.from(storedHash);return actual.length===expected.length&&timingSafeEqual(actual,expected)}
export type MergePlay={id:string;gameDay:string;mode:"daily"|"archive";completed:boolean;[key:string]:unknown};export type MergeRecords={plays:MergePlay[];achievements:string[]};
export function mergeGuestRecords(account:MergeRecords,guest:MergeRecords){const result=[...account.plays],ids=new Set(result.map(p=>p.id));let duplicates=0;for(const p of guest.plays){if(ids.has(p.id))continue;if(p.mode==="daily"){const i=result.findIndex(a=>a.mode==="daily"&&a.gameDay===p.gameDay);if(i>=0){if(p.completed&&!result[i].completed)result[i]=p;else if(p.completed&&result[i].completed)duplicates++;continue}}result.push(p);ids.add(p.id)}return {plays:result,achievements:[...new Set([...account.achievements,...guest.achievements])],duplicateDailyResults:duplicates}}
export type MagicLinkStore={put(input:{email:string;tokenHash:string;expiresAt:Date}):Promise<void>;consume(hash:string,now:Date):Promise<{accountId:string}|null>};
export type EmailAdapter={sendMagicLink(email:string,token:string):Promise<void>};
export async function issueMagicLink(email:string,store:MagicLinkStore,mailer:EmailAdapter,pepper:string,now=new Date()){const normalized=normalizeEmail(email),token=newOpaqueCredential();await store.put({email:normalized,tokenHash:tokenHash(token,pepper),expiresAt:new Date(now.getTime()+900_000)});await mailer.sendMagicLink(normalized,token);return {message:"If the address is eligible, a sign-in link has been sent."}}
export async function consumeMagicLink(raw:string,store:MagicLinkStore,pepper:string,now=new Date()){return store.consume(tokenHash(raw,pepper),now)}
