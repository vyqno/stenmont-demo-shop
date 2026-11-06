import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { OrderStore } from '../lib/orders.ts';
import { quote, fingerprint } from '../lib/commerce.ts';
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_shop.sql',import.meta.url),'utf8'));
 const db:any={prepare(text:string){let values:any[]=[];return {bind(...v:any[]){values=v;return this;},async first(){return sql.prepare(text).get(...values)??null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const r=sql.prepare(text).run(...values);return {meta:{changes:Number(r.changes)}};}};},async batch(stmts:any[]){sql.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return new OrderStore(db);
}
const cart=quote([{sku:'folio-a5-ink',quantity:1}]);
test('retries return same order but changed cart conflicts and foreign owners cannot read it',async()=>{
 const s=database(),fp=await fingerprint(cart);const a=await s.create('owner-a','request-a',fp,cart),b=await s.create('owner-a','request-a',fp,cart);
 assert.equal(a.id,b.id);assert.equal(await s.get(a.id,'owner-b'),null);
 await assert.rejects(()=>s.create('owner-a','request-a','changed',cart),/different/);
 assert.notEqual((await s.create('owner-b','request-a',fp,cart)).id,a.id);
});
test('inventory reservation and checkout retries are atomic',async()=>{
 const s=database(),fp=await fingerprint(cart);for(let i=0;i<20;i++)await s.create('owner',`request-${i}`,fp,cart);
 await assert.rejects(()=>s.create('owner','overflow',fp,cart));
 assert.equal((await s.create('owner','request-0',fp,cart)).amount,120000);
});
test('captured payment replay is a no-op, never changes another order and does not replace a recorded payment',async()=>{
 const s=database(),fp=await fingerprint(cart),a=await s.create('owner','a',fp,cart),b=await s.create('owner','b',fp,cart);
 await s.bindProvider(a.id,'provider-a');await s.bindProvider(b.id,'provider-b');
 assert.equal(await s.capture(a.id,'provider-a','payment-a','event-a'),true);
 assert.equal(await s.capture(a.id,'provider-a','payment-a','event-a'),false);
 assert.equal(await s.capture(a.id,'provider-a','payment-a','another-event'),false);
 assert.equal((await s.get(b.id,'owner'))?.status,'creating');
 assert.equal((await s.get(a.id,'owner'))?.status,'paid');
 await assert.rejects(()=>s.capture(b.id,'provider-a','payment-a','evil-event'),/binding/);
});
