import { verifySignature } from './commerce.ts';
import { decimalAmount,decimalUnits } from './pricebook.ts';
import { boundedText,type ShopEnv } from './checkout.ts';
import type { Order,OrderStore } from './orders.ts';
const validMerchant=(value:unknown):value is string=>typeof value==='string'&&/^m_[a-f0-9]+$/.test(value);
export function stenmontEnabled(env:ShopEnv){return ['staging','local'].includes(env.ENVIRONMENT)&&env.STENMONT_CHECKOUT_ENABLED==='yes'&&env.STENMONT_API_URL==='https://api-staging.stenmont.com'&&!!env.STENMONT_API_KEY&&validMerchant(env.STENMONT_MERCHANT_ID);}
const failure=(id:string,error:string,status:number)=>Response.json({id,error,status:'submitting'},{status,headers:{'cache-control':'private, no-store'}});
export async function createStenmontInvoice(order:Order,env:ShopEnv,store:OrderStore,fetcher:typeof fetch=fetch){
 if(!stenmontEnabled(env))return failure(order.id,'USDT test checkout is not configured. No payment was taken.',503);
 if(order.rail!=='stenmont'||order.currency!=='USDT')return failure(order.id,'Payment rail mismatch.',409);
 const response=()=>Response.json({id:order.id,rail:'stenmont',currency:'USDT',amount:order.amount,invoiceId:order.invoiceId,payUrl:order.payUrl,status:order.status},{headers:{'cache-control':'private, no-store'}});
 if(order.invoiceId&&order.merchantId!==env.STENMONT_MERCHANT_ID)return failure(order.id,'This saved invoice belongs to a different merchant configuration.',409);
 if(order.invoiceId&&order.payUrl)return response();
 if(!await store.claimCreation(order.id))return failure(order.id,'Checkout is pending reconciliation. Open this order; do not create another.',202);
 try{
  const r=await fetcher(env.STENMONT_API_URL+'/v1/invoices',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{authorization:`Bearer ${env.STENMONT_API_KEY}`,'content-type':'application/json','idempotency-key':order.id},body:JSON.stringify({amount:decimalAmount(order.amount),successUrl:`https://demo-shop-staging.stenmont.com/orders/${order.id}`,cancelUrl:`https://demo-shop-staging.stenmont.com/orders/${order.id}`,metadata:{order:order.id,merchant:env.STENMONT_MERCHANT_ID}})});
  const p:any=await r.json().catch(()=>null);
  if(!r.ok)return failure(order.id,r.status===403&&p?.error?.code==='payments_paused'?'Payments are temporarily unavailable.':'Invoice creation could not be confirmed. Open this order before retrying.',r.status===403?403:502);
  if(!/^0x[0-9a-fA-F]{64}$/.test(p?.id??'')||p?.payUrl!==`https://app-staging.stenmont.com/pay/${p.id}`)throw Error('Invalid checkout response');
  await store.finishStenmontCreation(order.id,p.id,p.payUrl,env.STENMONT_MERCHANT_ID!);
  return Response.json({id:order.id,rail:'stenmont',currency:'USDT',amount:order.amount,invoiceId:p.id,payUrl:p.payUrl,status:'awaiting_payment'},{headers:{'cache-control':'private, no-store'}});
 }catch{return failure(order.id,'Invoice creation could not be confirmed. Open this order; do not create another.',502);}
}
async function authentic(raw:string,header:string,secret:string,now:number){
 if(header.length>2048)return false;const parts=header.split(',').map(s=>s.trim()),times=parts.filter(p=>p.startsWith('t='));
 if(times.length!==1||!/^t=\d{1,12}$/.test(times[0]))return false;const t=times[0].slice(2);if(Math.abs(now-Number(t))>300)return false;
 const signatures=parts.filter(p=>p.startsWith('v1=')).map(p=>p.slice(3));
 for(const sig of signatures)if(await verifySignature(`${t}.${raw}`,sig,secret))return true;return false;
}
export async function acceptStenmontWebhook(request:Request,env:ShopEnv,store:OrderStore,now=Math.floor(Date.now()/1000)){
 const error=(message:string,status:number)=>Response.json({error:message},{status});
 if(!['staging','local'].includes(env.ENVIRONMENT)||!env.STENMONT_WEBHOOK_SECRET||!validMerchant(env.STENMONT_MERCHANT_ID))return error('Webhook unavailable.',503);
 let raw:string;try{raw=await boundedText(request,32768);}catch{return error('Webhook too large.',413);}
 if(!await authentic(raw,request.headers.get('stenmont-signature')??'',env.STENMONT_WEBHOOK_SECRET,now))return error('Invalid webhook signature or timestamp.',400);
 let event:any;try{event=JSON.parse(raw);}catch{return error('Invalid event.',400);}
 if(event.type!=='invoice.paid')return Response.json({received:true});
 if(typeof event.id!=='string'||!event.id||event.id.length>200||event.livemode!==false)return error('Invalid test event.',409);
 const inv=event.data?.invoice,orderId=inv?.metadata?.order;if(typeof orderId!=='string')return error('Missing order binding.',409);
 const order=await store.byId(orderId);
 if(!order||!order.invoiceId)return error('Invoice binding not saved yet. Retry delivery.',409);
 try{
  if(order.rail!=='stenmont'||order.currency!=='USDT'||inv.id!==order.invoiceId||inv.status!=='paid'||inv.currency!=='USDT'||inv.metadata.merchant!==order.merchantId||order.merchantId!==env.STENMONT_MERCHANT_ID||decimalUnits(inv.amount)!==BigInt(order.amount)||decimalUnits(inv.amountPaid)<BigInt(order.amount))throw Error('Binding mismatch');
  const tx=event.data?.payment?.txHash;if(typeof tx!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(tx))throw Error('Missing payment receipt');
  const changed=await store.captureInvoice(order.id,order.invoiceId,tx,`stenmont:${event.id}`);return Response.json({received:true,changed});
 }catch{return error('Paid invoice does not match the saved order.',409);}
}
