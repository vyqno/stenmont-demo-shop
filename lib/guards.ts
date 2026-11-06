import { hash } from './commerce.ts';
import type { Database } from './orders.ts';
export class RateLimitError extends Error { constructor(){super('Checkout request limit reached. Try later or open your existing order.');} }
export type Admission={ip:string;now:Date};
export function limitStatements(db:Database,limits:{actor:string;scope:string;bucket:number;cap:number}[],orderId?:string){
 return limits.map(l=>db.prepare(`INSERT INTO shop_limits(actor,scope,bucket,used,cap) SELECT ?,?,?,1,? WHERE ${orderId?'EXISTS(SELECT 1 FROM orders WHERE id=?)':'1'} ON CONFLICT(actor,scope,bucket) DO UPDATE SET used=used+1`).bind(l.actor,l.scope,l.bucket,l.cap,...(orderId?[orderId]:[])));
}
export function creationLimits(owner:string,{ip,now}:Admission){const hour=Math.floor(now.getTime()/3600000),day=Math.floor(now.getTime()/86400000);return [
 {actor:owner,scope:'order-owner-hour',bucket:hour,cap:5},{actor:owner,scope:'order-owner-day',bucket:day,cap:20},
 {actor:ip,scope:'order-ip-hour',bucket:hour,cap:10},{actor:ip,scope:'order-ip-day',bucket:day,cap:30},
];}
export async function requestIp(request:Request,environment:string){
 const value=request.headers.get('cf-connecting-ip');
 if(value&&value.length<=64&&/^[a-fA-F0-9:.]+$/.test(value))return hash('shop-ip/v1:'+value);
 if(environment==='local')return hash('shop-ip/v1:local');
 throw Error('Trusted request address unavailable.');
}
export async function sessionResponse(request:Request,env:{ENVIRONMENT:string},db:Database,now=new Date()){
 const json=(error:string,status:number)=>Response.json({error},{status,headers:{'cache-control':'private, no-store'}});
 if(!['staging','local'].includes(env.ENVIRONMENT))return json('Demo sessions unavailable.',503);
 const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
 if((origin&&origin!==new URL(request.url).origin)||site==='cross-site')return json('Open this shop directly.',403);
 const existing=request.headers.get('cookie')?.match(/(?:^|;\s*)shop_session=([0-9a-f]{64})(?:;|$)/);
 if(existing&&await db.prepare('SELECT owner_hash FROM shop_sessions WHERE owner_hash=? AND expires_at>?').bind(await hash(existing[1]),now.getTime()).first())return Response.json({ready:true},{headers:{'cache-control':'private, no-store'}});
 const value=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 let ip:string;try{ip=await requestIp(request,env.ENVIRONMENT);}catch{return json('Session unavailable.',503);}
 const hour=Math.floor(now.getTime()/3600000),day=Math.floor(now.getTime()/86400000);
 try{await db.batch([...limitStatements(db,[{actor:ip,scope:'session-ip-hour',bucket:hour,cap:5},{actor:ip,scope:'session-ip-day',bucket:day,cap:20}]),db.prepare('INSERT INTO shop_sessions(owner_hash,expires_at) VALUES(?,?)').bind(await hash(value),now.getTime()+1209600000)]);}
 catch(e){return json(e instanceof Error&&/shop_limit_ceiling/.test(e.message)?'New session limit reached. Keep using your existing browser session.':'Session unavailable.',e instanceof Error&&/shop_limit_ceiling/.test(e.message)?429:503);}
 return Response.json({ready:true},{headers:{'cache-control':'private, no-store','set-cookie':`shop_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1209600`}});
}
