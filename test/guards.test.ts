import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { OrderStore } from '../lib/orders.ts';
import { quote, fingerprint } from '../lib/commerce.ts';
import { sessionResponse } from '../lib/guards.ts';
export function database(){
 const sql=new DatabaseSync(':memory:');for(const f of ['0001_shop.sql','0002_shop_limits.sql','0003_stenmont_orders.sql'])sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 let tail:Promise<unknown>=Promise.resolve();const db:any={prepare(text:string){let values:any[]=[];return {bind(...v:any[]){values=v;return this;},async first(){return sql.prepare(text).get(...values)??null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const r=sql.prepare(text).run(...values);return {meta:{changes:Number(r.changes)}};}};},batch(stmts:any[]){const task=tail.then(async()=>{sql.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}});tail=task.catch(()=>{});return task;}};return db;
}
const q=quote([{sku:'cards-ivory',quantity:1}]),now=new Date('2026-11-06T12:00:00Z');
test('concurrent new orders obey owner limit atomically, retries cost no additional allowance or stock',async()=>{
 const store=new OrderStore(database()),fp=await fingerprint(q);
 const results=await Promise.allSettled(Array.from({length:8},(_,i)=>store.create('owner',`req-${i}`,fp,q,{ip:'ip-a',now})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
 const saved=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value;
 const retried=await store.create('owner','req-0',fp,q,{ip:'ip-a',now});assert.equal(retried.id,saved.id);
 assert.equal((await store.db.prepare('SELECT remaining FROM stock WHERE sku=?').bind('cards-ivory').first<any>()).remaining,25);
});
test('IP limits resist rotating owners, isolate other IPs and reset by UTC hour',async()=>{
 const store=new OrderStore(database()),fp=await fingerprint(q);
 for(let i=0;i<10;i++)await store.create(`owner-${i}`,`a-${i}`,fp,q,{ip:'ip-a',now});
 await assert.rejects(()=>store.create('rotated','blocked',fp,q,{ip:'ip-a',now}),/limit/i);
 await store.create('other','new-ip',fp,q,{ip:'ip-b',now});
 await store.create('reset','new-hour',fp,q,{ip:'ip-a',now:new Date('2026-11-06T13:00:00Z')});
});
test('new session limit is per IP, existing sessions remain usable, production fails closed',async()=>{
 const db=database(),env:any={ENVIRONMENT:'staging'};
 const request=(ip:string,cookie?:string)=>new Request('https://demo-shop-staging.stenmont.com/api/session',{headers:{'cf-connecting-ip':ip,...(cookie?{cookie}: {})}});
 let cookie='';for(let i=0;i<5;i++){const response=await sessionResponse(request('203.0.113.1'),env,db,now);assert.equal(response.status,200);cookie=response.headers.get('set-cookie')!.split(';')[0];}
 assert.equal((await sessionResponse(request('203.0.113.1'),env,db,now)).status,429);
 assert.equal((await sessionResponse(request('203.0.113.1',cookie),env,db,now)).status,200);
 assert.equal((await sessionResponse(request('203.0.113.1','shop_session='+ 'ab'.repeat(32)),env,db,now)).status,429);
 assert.equal((await sessionResponse(request('203.0.113.2'),env,db,now)).status,200);
 assert.equal((await sessionResponse(request('203.0.113.1'),{ENVIRONMENT:'production'} as any,db,now)).status,503);
 assert.equal((await sessionResponse(request('203.0.113.1'),env,db,new Date('2026-11-06T13:00:00Z'))).status,200);
});
test('daily owner and IP ceilings survive hourly resets and reopen the next UTC day',async()=>{
 const store=new OrderStore(database()),fp=await fingerprint(q);
 for(let hour=12;hour<16;hour++)for(let i=0;i<5;i++)await store.create('daily-owner',`${hour}-${i}`,fp,q,{ip:'daily-ip',now:new Date(`2026-11-06T${hour}:00:00Z`)});
 await assert.rejects(()=>store.create('daily-owner','owner-excess',fp,q,{ip:'daily-ip',now:new Date('2026-11-06T16:00:00Z')}),/limit/i);
 await store.create('daily-owner','tomorrow',fp,q,{ip:'daily-ip',now:new Date('2026-11-07T12:00:00Z')});
 const other=new OrderStore(database());
 for(let hour=12;hour<15;hour++)for(let i=0;i<10;i++)await other.create(`ip-owner-${hour}-${i}`,`${hour}-${i}`,fp,q,{ip:'capped-ip',now:new Date(`2026-11-06T${hour}:00:00Z`)});
 const pen=quote([{sku:'pen-brass',quantity:1}]),penFp=await fingerprint(pen);
 await assert.rejects(()=>other.create('new-owner','ip-excess',penFp,pen,{ip:'capped-ip',now:new Date('2026-11-06T15:00:00Z')}),/limit/i);
 await other.create('new-owner','next-day',penFp,pen,{ip:'capped-ip',now:new Date('2026-11-07T12:00:00Z')});
});
test('simultaneous session creation cannot race past a shared IP cap',async()=>{
 const db=database();const request=()=>new Request('https://demo-shop-staging.stenmont.com/api/session',{headers:{'cf-connecting-ip':'203.0.113.3'}});
 const responses=await Promise.all(Array.from({length:9},()=>sessionResponse(request(),{ENVIRONMENT:'staging'},db,now)));
 assert.equal(responses.filter(r=>r.status===200).length,5);assert.equal(responses.filter(r=>r.status===429).length,4);
});
