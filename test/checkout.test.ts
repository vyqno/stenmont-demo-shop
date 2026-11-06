import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startCheckout, acceptWebhook } from '../lib/checkout.ts';
import { signature } from '../lib/commerce.ts';
const env:any={ENVIRONMENT:'staging',CHECKOUT_ENABLED:'yes',RAZORPAY_KEY_ID:['rzp','test','fixture'].join('_'),RAZORPAY_KEY_SECRET:'fixture-secret',RAZORPAY_WEBHOOK_SECRET:'fixture-webhook'};
const order:any={id:'local-order',ownerHash:'owner',providerOrderId:null,status:'creating',amount:120000,currency:'INR'};
function setup(){let calls=0,claimed=false,captures=0;const current={...order};const store:any={async create(){return current;},async claimCreation(){if(claimed)return false;claimed=true;return true;},async finishCreation(_id:string,pid:string){current.providerOrderId=pid;current.status='awaiting_payment';},async byProvider(id:string){return id===current.providerOrderId?current:null;},async capture(){captures++;return true;}};const fetcher:typeof fetch=async(_url,init)=>{calls++;assert.equal(init?.redirect,'manual');return Response.json({id:'provider-order',amount:120000,currency:'INR'});};return {store,fetcher,calls:()=>calls,captures:()=>captures,current};}
const request=(body:unknown={items:[{sku:'folio-a5-ink',quantity:1}],key:'12345678-1234-4123-8123-123456789abc'},origin='https://demo-shop-staging.stenmont.com')=>new Request('https://demo-shop-staging.stenmont.com/api/checkout',{method:'POST',headers:{origin,'cf-connecting-ip':'203.0.113.1','content-type':'application/json'},body:JSON.stringify(body)});
test('checkout creates one provider order across retries, with server amount and stored binding',async()=>{
 const t=setup();const a=await startCheckout(request(),'owner',env,t.store,t.fetcher);assert.equal(a.status,200);const b=await startCheckout(request(),'owner',env,t.store,t.fetcher);assert.equal(b.status,200);assert.equal(t.calls(),1);assert.equal((await b.json()).providerOrderId,'provider-order');
});
test('missing keys, production, live keys, missing owner and foreign origin never call a provider',async()=>{
 for(const [e,owner,req] of [[{...env,CHECKOUT_ENABLED:undefined},'owner',request()],[{...env,CHECKOUT_ENABLED:'no'},'owner',request()],[{...env,RAZORPAY_KEY_SECRET:undefined},'owner',request()],[{...env,ENVIRONMENT:'production'},'owner',request()],[{...env,RAZORPAY_KEY_ID:['rzp','live','fixture'].join('_')},'owner',request()],[env,null,request()],[env,'owner',request(undefined,'https://evil.example')]] as const){const t=setup();assert.ok((await startCheckout(req as Request,owner as any,e as any,t.store,t.fetcher)).status>=400);assert.equal(t.calls(),0);}
});
test('uncertain provider creation is not retried automatically',async()=>{
 const t=setup();let calls=0;const down:typeof fetch=async()=>{calls++;throw Error('timeout');};
 const first=await startCheckout(request(),'owner',env,t.store,down);assert.equal(first.status,502);assert.equal((await first.json()).id,'local-order');
 const retry=await startCheckout(request(),'owner',env,t.store,down);assert.equal(retry.status,202);assert.equal((await retry.json()).id,'local-order');assert.equal(calls,1);
});
test('webhook needs signature, exact captured binding and only accepts matching order',async()=>{
 const t=setup();t.current.providerOrderId='provider-order';
 const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'payment-fixture',order_id:'provider-order',amount:120000,currency:'INR',status:'captured'}}}});
 const req=async(secret:string)=>new Request('https://demo-shop-staging.stenmont.com/api/webhooks/razorpay',{method:'POST',headers:{'x-razorpay-signature':await signature(raw,secret),'x-razorpay-event-id':'fixture-event'},body:raw});
 assert.equal((await acceptWebhook(await req('wrong'),env,t.store)).status,401);assert.equal(t.captures(),0);
 assert.equal((await acceptWebhook(await req('fixture-webhook'),env,t.store)).status,200);assert.equal(t.captures(),1);
});
