import { products } from './catalogue.ts';
export type Line={sku:string;name:string;variant:string;quantity:number;unitAmount:number};
export type Quote={lines:Line[];amount:number;currency:'INR'};
export function quote(input:unknown):Quote {
 if(!Array.isArray(input)||input.length<1||input.length>12)throw Error('Choose between one and twelve items.');
 const counts=new Map<string,number>();
 for(const row of input){
  if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!=='quantity,sku'||typeof row.sku!=='string'||!Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>10)throw Error('Invalid basket.');
  counts.set(row.sku,(counts.get(row.sku)??0)+row.quantity);
 }
 const lines=[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([sku,quantity])=>{
  const product=products.find(p=>p.variants.some(v=>v.sku===sku));const variant=product?.variants.find(v=>v.sku===sku);
  if(!product||!variant||quantity>10||quantity>variant.stock)throw Error('This quantity is unavailable.');
  return {sku,name:product.name,variant:variant.label,quantity,unitAmount:variant.paise};
 });
 return {lines,amount:lines.reduce((n,l)=>n+l.unitAmount*l.quantity,0),currency:'INR'};
}
const bytes=(s:string)=>new TextEncoder().encode(s);
export async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(s))),b=>b.toString(16).padStart(2,'0')).join('');}
export const fingerprint=(q:Quote)=>hash(JSON.stringify(q));
export async function signature(raw:string,secret:string){
 const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(raw))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifySignature(raw:string,sig:string,secret:string){
 if(!/^[0-9a-f]{64}$/i.test(sig))return false;
 const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(sig.match(/../g)!,h=>parseInt(h,16)),bytes(raw));
}
export const checkoutSignature=(storedOrderId:string,paymentId:string,secret:string)=>signature(`${storedOrderId}|${paymentId}`,secret);
export function verifyCaptured(raw:string,order:{providerOrderId:string;amount:number;currency:string}){
 const event=JSON.parse(raw);const p=event?.payload?.payment?.entity;
 if(event?.event!=='payment.captured'||!p||p.order_id!==order.providerOrderId||p.amount!==order.amount||p.currency!==order.currency||p.status!=='captured'||typeof p.id!=='string'||!p.id)throw Error('Payment does not match the order.');
 return {paymentId:p.id,providerOrderId:p.order_id};
}
