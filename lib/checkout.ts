import { runtimeFetch } from './http.ts';
import { quote, fingerprint, verifySignature, verifyCaptured } from './commerce.ts';
import type { OrderStore, Database } from './orders.ts';
import { RateLimitError,requestIp } from './guards.ts';
import { createStenmontInvoice,stenmontEnabled } from './stenmont.ts';
export type ShopEnv={ENVIRONMENT:string;DB:Database;CHECKOUT_ENABLED?:string;STENMONT_CHECKOUT_ENABLED?:string;STENMONT_API_URL?:string;STENMONT_MERCHANT_ID?:string;STENMONT_API_KEY?:string;STENMONT_WEBHOOK_SECRET?:string;RAZORPAY_KEY_ID?:string;RAZORPAY_KEY_SECRET?:string;RAZORPAY_WEBHOOK_SECRET?:string};
const json=(error:string,status:number)=>Response.json({error},{status,headers:{'cache-control':'private, no-store'}});
export function testMode(env:ShopEnv){return ['staging','local'].includes(env.ENVIRONMENT)&&env.RAZORPAY_KEY_ID?.startsWith(['rzp','test',''].join('_'))&&!!env.RAZORPAY_KEY_SECRET;}
export async function boundedText(request:Request,limit:number){
 const reader=request.body?.getReader();if(!reader)return '';let bytes=0,out='';const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit){await reader.cancel();throw Error('Body too large.');}out+=decoder.decode(value,{stream:true});}return out+decoder.decode();}finally{reader.releaseLock();}
}
export async function startCheckout(request:Request,owner:string|null,env:ShopEnv,store:OrderStore,fetcher:typeof fetch=runtimeFetch){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json('Checkout must start from this shop.',403);
 if(!owner)return json('Open your basket again to start a private session.',401);
 let data:any;try{data=JSON.parse(await boundedText(request,8000));}catch{return json('Invalid checkout body.',400);}
 if(!data||!['items,key','items,key,rail'].includes(Object.keys(data).sort().join(','))||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/.test(data.key))return json('Invalid checkout key.',400);
 const rail=data.rail??'razorpay';if(!['razorpay','stenmont'].includes(rail))return json('Choose a supported payment option.',400);
 if(rail==='stenmont'?!stenmontEnabled(env):(env.CHECKOUT_ENABLED!=='yes'||!testMode(env)))return json('The selected test checkout is not configured. No payment was taken.',503);
 let order;try{const q=quote(data.items,rail);order=await store.create(owner,data.key,await fingerprint(q),q,{ip:await requestIp(request,env.ENVIRONMENT),now:new Date()});}catch(e){if(e instanceof RateLimitError)return json(e.message,429);return json('Basket unavailable or checkout key belongs to a different basket.',409);}
 if(order.status==='paid')return Response.json({id:order.id,status:'paid'});
 if(rail==='stenmont')return createStenmontInvoice(order,env,store,fetcher);
 const response=(providerOrderId:string)=>Response.json({id:order.id,keyId:env.RAZORPAY_KEY_ID,providerOrderId,amount:order.amount,currency:order.currency,status:'awaiting_payment'},{headers:{'cache-control':'private, no-store'}});
 if(order.providerOrderId)return response(order.providerOrderId);
 if(!await store.claimCreation(order.id))return Response.json({id:order.id,status:'submitting',error:'Checkout creation is pending. Open your order; do not create another.'},{status:202});
 try{
  const r=await fetcher('https://api.razorpay.com/v1/orders',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),headers:{authorization:`Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,'content-type':'application/json'},body:JSON.stringify({amount:order.amount,currency:order.currency,receipt:order.id,partial_payment:false})});
  if(!r.ok)throw Error('Provider refused');const p:any=await r.json();
  if(typeof p.id!=='string'||!p.id||p.amount!==order.amount||p.currency!==order.currency)throw Error('Provider mismatch');
  await store.finishCreation(order.id,p.id);return response(p.id);
 }catch{return Response.json({id:order.id,status:'submitting',error:'Checkout creation could not be confirmed. Open your order; do not create another.'},{status:502});}
}
export async function acceptWebhook(request:Request,env:ShopEnv,store:OrderStore){
 if(!testMode(env)||!env.RAZORPAY_WEBHOOK_SECRET)return json('Test webhook is not configured.',503);
 let raw:string;try{raw=await boundedText(request,32768);}catch{return json('Webhook too large.',413);}
 if(!await verifySignature(raw,request.headers.get('x-razorpay-signature')??'',env.RAZORPAY_WEBHOOK_SECRET))return json('Invalid signature.',401);
 let event:any;try{event=JSON.parse(raw);}catch{return json('Invalid event.',400);}
 if(event.event!=='payment.captured')return Response.json({ignored:true});
 const eventId=request.headers.get('x-razorpay-event-id');if(!eventId||eventId.length>200)return json('Missing event id.',400);
 const providerId=event?.payload?.payment?.entity?.order_id;if(typeof providerId!=='string')return json('Missing order binding.',400);
 const order=await store.byProvider(providerId);if(!order)return json('Unknown order. Retry after checkout reconciliation.',409);
 try{const p=verifyCaptured(raw,{providerOrderId:providerId,amount:order.amount,currency:order.currency});const changed=await store.capture(order.id,providerId,p.paymentId,eventId);return Response.json({received:true,changed});}catch{return json('Captured payment does not match this order.',409);}
}
