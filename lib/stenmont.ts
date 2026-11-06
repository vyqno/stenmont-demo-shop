import { runtimeFetch } from './http.ts';
import { verifySignature } from './commerce.ts';
import { decimalAmount,decimalUnits } from './pricebook.ts';
import { boundedText,type ShopEnv } from './checkout.ts';
import type { Order,OrderStore } from './orders.ts';
const validMerchant=(value:unknown):value is string=>typeof value==='string'&&/^m_[a-f0-9]+$/.test(value);
export function stenmontEnabled(env:ShopEnv){return ['staging','local'].includes(env.ENVIRONMENT)&&env.STENMONT_CHECKOUT_ENABLED==='yes'&&env.STENMONT_API_URL==='https://api-staging.stenmont.com'&&!!env.STENMONT_API_KEY&&validMerchant(env.STENMONT_MERCHANT_ID);}
type Diagnostic={stage:'api_http';status:number;code:string}|{stage:'api_fetch'|'binding_write';reason:string};
const safeCodes=new Set(['unauthorized','insufficient_scope','payments_paused','idempotency_conflict','idempotency_in_progress','invalid_request','rate_limited','chain_error','forbidden']);
const httpDiagnostic=(response:Response,payload:any):Diagnostic=>({stage:'api_http',status:response.status,code:typeof payload?.error?.code==='string'&&safeCodes.has(payload.error.code)?payload.error.code:payload===null?'non_json_response':'other'});
function fetchDiagnostic(error:unknown):Diagnostic {const name=error instanceof Error?error.name:'';const message=error instanceof Error?error.message:'';return {stage:'api_fetch',reason:name==='TimeoutError'?'timeout':name==='AbortError'?'aborted':name==='TypeError'&&/Illegal invocation|wrong this|WorkerGlobalScope/i.test(message)?'native_fetch_context':name==='TypeError'&&/invalid header|valid header|ByteString/i.test(message)?'invalid_header_value':name==='TypeError'?'fetch_type_error':'upstream_failure'};}
const failure=(id:string,error:string,status:number,diagnostic?:Diagnostic)=>Response.json({id,error,status:'submitting',...(diagnostic?{diagnostic}:{})},{status,headers:{'cache-control':'private, no-store'}});
export async function createStenmontInvoice(order:Order,env:ShopEnv,store:OrderStore,fetcher:typeof fetch=runtimeFetch){
 if(!stenmontEnabled(env))return failure(order.id,'USDT test checkout is not configured. No payment was taken.',503);
 if(order.rail!=='stenmont'||order.currency!=='USDT')return failure(order.id,'Payment rail mismatch.',409);
 const response=()=>Response.json({id:order.id,rail:'stenmont',currency:'USDT',amount:order.amount,invoiceId:order.invoiceId,payUrl:order.payUrl,status:order.status},{headers:{'cache-control':'private, no-store'}});
 if(order.invoiceId&&order.merchantId!==env.STENMONT_MERCHANT_ID)return failure(order.id,'This saved invoice belongs to a different merchant configuration.',409);
 if(order.invoiceId&&order.payUrl)return response();
 if(!await store.claimCreation(order.id))return failure(order.id,'Checkout is pending reconciliation. Open this order; do not create another.',202);
 let stage:'api_fetch'|'binding_write'='api_fetch';
 try{
  const r=await fetcher(env.STENMONT_API_URL+'/v1/invoices',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{authorization:`Bearer ${env.STENMONT_API_KEY}`,'content-type':'application/json','idempotency-key':order.id},body:JSON.stringify({amount:decimalAmount(order.amount),successUrl:`https://demo-shop-staging.stenmont.com/orders/${order.id}`,cancelUrl:`https://demo-shop-staging.stenmont.com/orders/${order.id}`,metadata:{order:order.id,merchant:env.STENMONT_MERCHANT_ID}})});
  const p:any=await r.json().catch(()=>null);
  if(r.status===403&&p?.error?.code==='payments_paused'&&await store.rearmCreation(order.id))return Response.json({id:order.id,status:'creating',retryable:true,error:'Payments are temporarily unavailable.'},{status:403,headers:{'cache-control':'private, no-store'}});
  if(!r.ok)return failure(order.id,r.status===403&&p?.error?.code==='payments_paused'?'Payments are temporarily unavailable.':'Invoice creation could not be confirmed. Open this order before retrying.',r.status===403?403:502,httpDiagnostic(r,p));
  if(!/^0x[0-9a-fA-F]{64}$/.test(p?.id??'')||p?.payUrl!==`https://app-staging.stenmont.com/pay/${p.id}`)return failure(order.id,'Invoice response could not be verified.',502,{stage:'api_http',status:r.status,code:'invalid_response'});
  stage='binding_write';
  await store.finishStenmontCreation(order.id,p.id,p.payUrl,env.STENMONT_MERCHANT_ID!);
  return Response.json({id:order.id,rail:'stenmont',currency:'USDT',amount:order.amount,invoiceId:p.id,payUrl:p.payUrl,status:'awaiting_payment'},{headers:{'cache-control':'private, no-store'}});
 }catch(error){return failure(order.id,'Invoice creation could not be confirmed. Open this order; do not create another.',502,stage==='binding_write'?{stage:'binding_write',reason:'persistence_error'}:fetchDiagnostic(error));}
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

/** Read-only provider reconciliation. No POST, new invoice, payment or manual row edit. */
export async function reconcileStenmontInvoice(order:Order,invoiceId:string,env:ShopEnv,store:OrderStore,fetcher:typeof fetch=runtimeFetch){
 if(!['staging','local'].includes(env.ENVIRONMENT)||env.STENMONT_API_URL!=='https://api-staging.stenmont.com'||!env.STENMONT_API_KEY||!validMerchant(env.STENMONT_MERCHANT_ID))return failure(order.id,'Reconciliation is unavailable.',503);
 if(order.rail!=='stenmont'||order.currency!=='USDT'||!/^0x[0-9a-fA-F]{64}$/.test(invoiceId))return failure(order.id,'Invalid saved order or invoice.',409);
 if(order.invoiceId)return order.invoiceId===invoiceId&&order.merchantId===env.STENMONT_MERCHANT_ID?Response.json({id:order.id,invoiceId:order.invoiceId,payUrl:order.payUrl,status:order.status}):failure(order.id,'A different invoice is already saved.',409);
 if(order.status!=='submitting')return failure(order.id,'This order is not held for reconciliation.',409);
 let stage:'api_fetch'|'binding_write'='api_fetch';
 try{
  const response=await fetcher(env.STENMONT_API_URL+'/v1/invoices/'+invoiceId,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${env.STENMONT_API_KEY}`}});
  const invoice:any=await response.json().catch(()=>null);if(!response.ok)return failure(order.id,'Existing invoice lookup failed.',502,httpDiagnostic(response,invoice));
  const expectedReturn=`https://demo-shop-staging.stenmont.com/orders/${order.id}`;
  let valid=false;try{valid=invoice?.id===invoiceId&&invoice?.metadata?.order===order.id&&invoice?.metadata?.merchant===env.STENMONT_MERCHANT_ID&&invoice?.currency==='USDT'&&decimalUnits(invoice.amount)===BigInt(order.amount)&&['open','partially_paid','paid'].includes(invoice.status)&&invoice.successUrl===expectedReturn&&(!invoice.cancelUrl||invoice.cancelUrl===expectedReturn)&&invoice.payUrl===`https://app-staging.stenmont.com/pay/${invoiceId}`;}catch{}
  if(!valid)return failure(order.id,'Existing invoice does not match this saved order.',409);
  stage='binding_write';await store.finishStenmontCreation(order.id,invoiceId,invoice.payUrl,env.STENMONT_MERCHANT_ID!);
  return Response.json({id:order.id,invoiceId,payUrl:invoice.payUrl,status:'awaiting_payment',reconciled:true},{headers:{'cache-control':'private, no-store'}});
 }catch(error){return failure(order.id,'Existing invoice reconciliation could not be confirmed.',502,stage==='binding_write'?{stage:'binding_write',reason:'persistence_error'}:fetchDiagnostic(error));}
}
