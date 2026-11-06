import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { OrderStore } from '../lib/orders.ts';
import { quote, fingerprint, signature } from '../lib/commerce.ts';
import { acceptStenmontWebhook, createStenmontInvoice, stenmontEnabled, reconcileStenmontInvoice } from '../lib/stenmont.ts';
const invoiceId='0x'+'ab'.repeat(32),tx='0x'+'cd'.repeat(32),now=1793970000;
function database(){const sql=new DatabaseSync(':memory:');for(const f of ['0001_shop.sql','0002_shop_limits.sql','0003_stenmont_orders.sql'])sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));const db:any={prepare(text:string){let values:any[]=[];return {bind(...v:any[]){values=v;return this;},async first(){return sql.prepare(text).get(...values)??null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const r=sql.prepare(text).run(...values);return {meta:{changes:Number(r.changes)}};}};},async batch(stmts:any[]){sql.exec('BEGIN');try{const a=[];for(const s of stmts)a.push(await s.run());sql.exec('COMMIT');return a;}catch(e){sql.exec('ROLLBACK');throw e;}}};return new OrderStore(db);}
const FIELDWORK_MERCHANT_ID='m_1ec90bb421cce5b2';
const env:any={STENMONT_MERCHANT_ID:FIELDWORK_MERCHANT_ID,ENVIRONMENT:'staging',STENMONT_CHECKOUT_ENABLED:'yes',STENMONT_API_URL:'https://api-staging.stenmont.com',STENMONT_API_KEY:'fixture-only',STENMONT_WEBHOOK_SECRET:'fixture-webhook'};
async function order(store:OrderStore){const q=quote([{sku:'folio-a5-ink',quantity:1}],'stenmont');return store.create('owner','saved-browser-key',await fingerprint(q),q);}
const event=(orderId:string,changes:Record<string,unknown>={})=>({id:'evt-fixture',type:'invoice.paid',created:now,livemode:false,data:{invoice:{id:invoiceId,status:'paid',currency:'USDT',amount:'1',amountPaid:'1',metadata:{order:orderId,merchant:FIELDWORK_MERCHANT_ID},...changes},payment:{txHash:tx,value:'1'}}});
async function request(payload:unknown,t=now,rotate=false){const raw=JSON.stringify(payload),sig=await signature(`${t}.${raw}`,'fixture-webhook');return new Request('https://demo-shop-staging.stenmont.com/api/webhooks/stenmont',{method:'POST',headers:{'Stenmont-Signature':`t=${t},${rotate?'v1='+ '00'.repeat(32)+',':''}v1=${sig}`},body:raw});}
test('USDT price book is independent of INR and rail is part of the fingerprint',async()=>{const items=[{sku:'folio-a5-ink',quantity:1}];assert.equal(quote(items).amount,120000);assert.equal(quote(items,'stenmont').amount,1000000);assert.equal(quote(items,'stenmont').currency,'USDT');assert.notEqual(await fingerprint(quote(items)),await fingerprint(quote(items,'stenmont')));});
test('invoice creation saves binding before returning trusted pay URL and reuses saved UUID',async()=>{const store=database(),o=await order(store);let calls=0;const transport:typeof fetch=async(_url,init)=>{calls++;assert.equal(init?.redirect,'manual');assert.equal(new Headers(init?.headers).get('idempotency-key'),o.id);const body=JSON.parse(init!.body as string);assert.equal(body.amount,'1');assert.equal(body.metadata.order,o.id);assert.equal(body.metadata.merchant,FIELDWORK_MERCHANT_ID);return Response.json({id:invoiceId,payUrl:`https://app-staging.stenmont.com/pay/${invoiceId}`});};const a=await createStenmontInvoice(o,env,store,transport);assert.equal(a.status,200);assert.equal((await store.get(o.id,'owner'))?.invoiceId,invoiceId);const b=await createStenmontInvoice((await store.get(o.id,'owner'))!,env,store,transport);assert.equal(b.status,200);assert.equal(calls,1);});
test('signed current HTTP-shaped payment settles once, rotation works, early binding retries',async()=>{const store=database(),o=await order(store);assert.equal((await acceptStenmontWebhook(await request(event(o.id)),env,store,now)).status,409);await store.claimCreation(o.id);await store.finishStenmontCreation(o.id,invoiceId,`https://app-staging.stenmont.com/pay/${invoiceId}`,FIELDWORK_MERCHANT_ID);assert.equal((await acceptStenmontWebhook(await request(event(o.id),now,true),env,store,now)).status,200);assert.equal((await store.get(o.id,'owner'))?.status,'paid');assert.equal((await store.get(o.id,'owner'))?.paymentId,tx);assert.equal((await acceptStenmontWebhook(await request(event(o.id)),env,store,now)).status,200);assert.equal((await store.db.prepare('SELECT count(*) n FROM payment_events').first<any>()).n,1);});
test('wrong signature, stale/future timestamp and altered invoice metadata/status/amount refuse payment',async()=>{const store=database(),o=await order(store);await store.claimCreation(o.id);await store.finishStenmontCreation(o.id,invoiceId,'https://app-staging.stenmont.com/pay/'+invoiceId,FIELDWORK_MERCHANT_ID);for(const changes of [{id:'0x'+'ee'.repeat(32)},{amount:'0.01'},{amountPaid:'0.99'},{status:'open'},{currency:'INR'},{metadata:{order:o.id,merchant:'foreign-merchant'}}])assert.equal((await acceptStenmontWebhook(await request(event(o.id,changes)),env,store,now)).status,409);assert.equal((await acceptStenmontWebhook(await request(event(o.id),now-301),env,store,now)).status,400);assert.equal((await acceptStenmontWebhook(await request(event(o.id),now+301),env,store,now)).status,400);const bad=await request(event(o.id));bad.headers.set('Stenmont-Signature',`t=${now},v1=${'00'.repeat(32)}`);assert.equal((await acceptStenmontWebhook(bad,env,store,now)).status,400);assert.notEqual((await store.get(o.id,'owner'))?.status,'paid');});
test('site.test is accepted only after signature verification, disabled creation does not block receipts',async()=>{const store=database();assert.equal((await acceptStenmontWebhook(await request({type:'site.test',id:'test-event'}),{...env,STENMONT_CHECKOUT_ENABLED:undefined},store,now)).status,200);});
test('a known paused refusal can resume the same checkout UUID after unpause without reserving stock twice',async()=>{
 const store=database(),q=quote([{sku:'folio-a5-ink',quantity:1}],'stenmont'),fp=await fingerprint(q);const o=await store.create('owner','paused-key',fp,q,{ip:'ip',now:new Date()});let calls=0;
 const paused:typeof fetch=async()=>{calls++;return Response.json({error:{code:'payments_paused',message:'Paused'}},{status:403});};
 const first=await createStenmontInvoice(o,env,store,paused);assert.equal(first.status,403);const body=await first.json();assert.match(body.error,/temporarily/);assert.equal(body.retryable,true);assert.equal((await store.get(o.id,'owner'))?.status,'creating');
 const same=await store.create('owner','paused-key',fp,q,{ip:'ip',now:new Date()});assert.equal(same.id,o.id);
 const ready:typeof fetch=async(_url,init)=>{calls++;assert.equal(init?.redirect,'manual');assert.equal(new Headers(init?.headers).get('idempotency-key'),o.id);return Response.json({id:invoiceId,payUrl:`https://app-staging.stenmont.com/pay/${invoiceId}`});};
 assert.equal((await createStenmontInvoice(same,env,store,ready)).status,200);assert.equal(calls,2);
 assert.equal((await store.db.prepare('SELECT remaining FROM stock WHERE sku=?').bind('folio-a5-ink').first<any>()).remaining,19);
 assert.equal((await store.db.prepare("SELECT used FROM shop_limits WHERE scope='order-owner-hour'").first<any>()).used,1);
});
test('a saved checkout key cannot change rail, and Razorpay cannot settle a USDT order',async()=>{
 const store=database(),o=await order(store),inr=quote([{sku:'folio-a5-ink',quantity:1}]);
 const inrFingerprint=await fingerprint(inr);
 await assert.rejects(()=>store.create('owner','saved-browser-key',inrFingerprint,inr),/different basket/);
 await assert.rejects(()=>store.capture(o.id,'provider-order','payment','event'),/binding/);
 assert.notEqual((await store.get(o.id,'owner'))?.status,'paid');
});
test('migration preserves paid Razorpay receipts and their session ownership',()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_shop.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO orders(id,owner_hash,request_key,fingerprint,items,amount,currency,status,provider_order_id,payment_id,created_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('legacy','owner','key','legacy-fingerprint','[]',120000,'INR','paid','old-provider','old-payment','2026-11-06T00:00:00Z','2026-11-06T01:00:00Z');
 for(const f of ['0002_shop_limits.sql','0003_stenmont_orders.sql'])sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const row:any=sql.prepare('SELECT * FROM orders WHERE id=?').get('legacy');assert.equal(row.rail,'razorpay');assert.equal(row.currency,'INR');assert.equal(row.status,'paid');assert.equal(row.payment_id,'old-payment');assert.equal(row.owner_hash,'owner');assert.equal(row.amount,120000);assert.ok(sql.prepare('SELECT owner_hash FROM shop_sessions WHERE owner_hash=?').get('owner'));
});
test('the shared HTTP checkout dispatches the selected USDT rail and rejects browser price fields',async()=>{
 const { startCheckout }=await import('../lib/checkout.ts');const store=database();let calls=0;const transport:typeof fetch=async()=>{calls++;return Response.json({id:invoiceId,payUrl:`https://app-staging.stenmont.com/pay/${invoiceId}`});};
 const req=(extra:Record<string,unknown>={})=>new Request('https://demo-shop-staging.stenmont.com/api/checkout',{method:'POST',headers:{origin:'https://demo-shop-staging.stenmont.com','cf-connecting-ip':'203.0.113.5'},body:JSON.stringify({items:[{sku:'folio-a5-ink',quantity:1}],key:'12345678-1234-4123-8123-123456789abc',rail:'stenmont',...extra})});
 assert.equal((await startCheckout(req({amount:'0.01'}),'owner',env,store,transport)).status,400);assert.equal(calls,0);
 assert.equal((await startCheckout(req(),'owner',{...env,STENMONT_CHECKOUT_ENABLED:undefined},store,transport)).status,503);assert.equal(calls,0);
 const response=await startCheckout(req(),'owner',env,store,transport);assert.equal(response.status,200);const data=await response.json();assert.equal(data.rail,'stenmont');assert.equal(data.amount,1000000);assert.equal(data.invoiceId,invoiceId);assert.equal(calls,1);
});
test('an uncertain Stenmont send stays bound to its owned order and is never resent automatically',async()=>{
 const store=database(),o=await order(store);let calls=0;const lost:typeof fetch=async()=>{calls++;throw Error('fixture receipt timeout');};
 const first=await createStenmontInvoice(o,env,store,lost);assert.equal(first.status,502);assert.equal((await first.json()).id,o.id);
 const retry=await createStenmontInvoice((await store.get(o.id,'owner'))!,env,store,lost);assert.equal(retry.status,202);assert.equal((await retry.json()).id,o.id);assert.equal(calls,1);
});

test('merchant binding is configurable and missing or malformed merchant config fails closed',async()=>{
 const store=database(),o=await order(store),merchant='m_'+ '34'.repeat(8);const configured={...env,STENMONT_MERCHANT_ID:merchant};let called=0;
 const transport:typeof fetch=async(_url,init)=>{called++;assert.equal(JSON.parse(init!.body as string).metadata.merchant,merchant);return Response.json({id:invoiceId,payUrl:`https://app-staging.stenmont.com/pay/${invoiceId}`});};
 for(const value of [undefined,'','foreign','m_invalid']){assert.equal(stenmontEnabled({...env,STENMONT_MERCHANT_ID:value}),false);assert.equal((await createStenmontInvoice(o,{...env,STENMONT_MERCHANT_ID:value},store,transport)).status,503);}
 assert.equal(called,0);assert.equal((await createStenmontInvoice(o,configured,store,transport)).status,200);assert.equal((await store.get(o.id,'owner'))?.merchantId,merchant);assert.equal((await createStenmontInvoice((await store.get(o.id,'owner'))!,env,store,transport)).status,409);
 const paid=event(o.id,{metadata:{order:o.id,merchant}});assert.equal((await acceptStenmontWebhook(await request(paid),configured,store,now)).status,200);assert.equal((await store.get(o.id,'owner'))?.status,'paid');
});
test('other403,5xx and invalid responses remain held rather than rearmed',async()=>{
 for(const [status,payload] of [[403,{error:{code:'different_refusal'}}],[500,{error:{code:'payments_paused'}}],[200,{id:invoiceId,payUrl:'https://wrong.example/pay'}]] as const){
  const store=database(),o=await order(store);let calls=0;const transport:typeof fetch=async()=>{calls++;return Response.json(payload,{status});};
  assert.ok((await createStenmontInvoice(o,env,store,transport)).status>=400);
  assert.equal((await store.get(o.id,'owner'))?.status,'submitting');assert.equal((await createStenmontInvoice((await store.get(o.id,'owner'))!,env,store,transport)).status,202);assert.equal(calls,1);
 }
});

test('a held order reconciles only an existing matching invoice through a read request',async()=>{
 const store=database(),o=await order(store);await store.claimCreation(o.id);let calls=0;
 const current={id:invoiceId,payUrl:`https://app-staging.stenmont.com/pay/${invoiceId}`,successUrl:`https://demo-shop-staging.stenmont.com/orders/${o.id}`,currency:'USDT',amount:'1.00',status:'open',metadata:{order:o.id,merchant:env.STENMONT_MERCHANT_ID}};
 const read:typeof fetch=async(url,init)=>{calls++;assert.equal(init?.method,'GET');assert.equal(init?.redirect,'manual');assert.equal(url,env.STENMONT_API_URL+'/v1/invoices/'+invoiceId);return Response.json(current);};
 const response=await reconcileStenmontInvoice((await store.get(o.id,'owner'))!,invoiceId,env,store,read);assert.equal(response.status,200);assert.equal(calls,1);assert.equal((await store.get(o.id,'owner'))?.invoiceId,invoiceId);assert.equal((await store.get(o.id,'owner'))?.status,'awaiting_payment');
 assert.equal((await store.db.prepare('SELECT remaining FROM stock WHERE sku=?').bind('folio-a5-ink').first<any>()).remaining,19);
});
test('reconciliation rejects a wrong order, merchant, amount or return URL without changing the hold',async()=>{
 for(const change of [{metadata:{order:'other',merchant:env.STENMONT_MERCHANT_ID}},{metadata:{order:'unused',merchant:'m_ff'}},{amount:'0.01'},{successUrl:'https://other.example/receipt'}]){
  const store=database(),o=await order(store);await store.claimCreation(o.id);const current={id:invoiceId,payUrl:`https://app-staging.stenmont.com/pay/${invoiceId}`,successUrl:`https://demo-shop-staging.stenmont.com/orders/${o.id}`,currency:'USDT',amount:'1',status:'open',metadata:{order:o.id,merchant:env.STENMONT_MERCHANT_ID},...change};
  const response=await reconcileStenmontInvoice((await store.get(o.id,'owner'))!,invoiceId,env,store,async()=>Response.json(current));assert.equal(response.status,409);assert.equal((await store.get(o.id,'owner'))?.invoiceId,null);assert.equal((await store.get(o.id,'owner'))?.status,'submitting');
 }
});
test('upstream diagnostics expose only allowlisted status and error classes, never body or exception secrets',async()=>{
 const store=database(),o=await order(store);await store.claimCreation(o.id);
 const secret='fixture-credential-must-not-leak';
 const denied=await reconcileStenmontInvoice((await store.get(o.id,'owner'))!,invoiceId,env,store,async()=>Response.json({error:{code:secret,message:secret}},{status:401}));
 const data=await denied.json();assert.deepEqual(data.diagnostic,{stage:'api_http',status:401,code:'other'});assert.ok(!JSON.stringify(data).includes(secret));
 const exception=await reconcileStenmontInvoice((await store.get(o.id,'owner'))!,invoiceId,env,store,async()=>{throw new TypeError('Illegal invocation '+secret);});const detail=await exception.json();assert.deepEqual(detail.diagnostic,{stage:'api_fetch',reason:'native_fetch_context'});assert.ok(!JSON.stringify(detail).includes(secret));
});
test('default outbound transport preserves the native global fetch receiver',async()=>{
 const store=database(),o=await order(store),original=globalThis.fetch;let calls=0;
 globalThis.fetch=function(this:unknown,_input:Parameters<typeof fetch>[0],_init?:Parameters<typeof fetch>[1]){assert.equal(this,globalThis);calls++;return Promise.resolve(Response.json({id:invoiceId,payUrl:`https://app-staging.stenmont.com/pay/${invoiceId}`}));};
 try{assert.equal((await createStenmontInvoice(o,env,store)).status,200);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

test('Worker transport uses manual redirect mode and refuses an upstream redirect without following it',async()=>{
 const store=database(),o=await order(store);let calls=0;const transport:typeof fetch=async(url,init)=>{calls++;assert.equal(url,env.STENMONT_API_URL+'/v1/invoices');assert.equal(init?.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://untrusted.example/capture'}});};
 const response=await createStenmontInvoice(o,env,store,transport);assert.equal(response.status,502);assert.equal(calls,1);assert.equal((await store.get(o.id,'owner'))?.invoiceId,null);assert.equal((await store.get(o.id,'owner'))?.status,'submitting');
});
