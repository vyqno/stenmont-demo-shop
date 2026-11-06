import { hash,type Quote,type Line } from './commerce.ts';
import { creationLimits,limitStatements,RateLimitError,type Admission } from './guards.ts';
export type Statement={bind(...values:unknown[]):Statement;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<{results:T[]}>;run():Promise<{meta:{changes:number}}>};
export type Database={prepare(sql:string):Statement;batch(statements:Statement[]):Promise<{meta:{changes:number}}[]>};
export type Order={id:string;ownerHash:string;items:Line[];amount:number;currency:'INR'|'USDT';rail:'razorpay'|'stenmont';invoiceId:string|null;payUrl:string|null;merchantId:string|null;status:string;providerOrderId:string|null;paymentId:string|null;createdAt:string;paidAt:string|null};
function view(row:any):Order {return {id:row.id,ownerHash:row.owner_hash,items:JSON.parse(row.items),amount:row.amount,currency:row.currency,rail:row.rail??'razorpay',invoiceId:row.invoice_id??null,payUrl:row.pay_url??null,merchantId:row.merchant_id??null,status:row.status,providerOrderId:row.provider_order_id,paymentId:row.payment_id,createdAt:row.created_at,paidAt:row.paid_at};}
export class OrderStore {
 db:Database;
 constructor(db:Database){this.db=db;}
 async create(owner:string,key:string,fingerprint:string,quote:Quote,admission?:Admission):Promise<Order>{
  const id=crypto.randomUUID(),now=new Date().toISOString();
  try{await this.db.batch([
   this.db.prepare('INSERT OR IGNORE INTO orders(id,owner_hash,request_key,fingerprint,items,amount,currency,rail,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,owner,key,fingerprint,JSON.stringify(quote.lines),quote.amount,quote.currency,quote.rail,now),
   ...(admission?limitStatements(this.db,creationLimits(owner,admission),id):[]),
   ...quote.lines.map(l=>this.db.prepare('UPDATE stock SET remaining=remaining-? WHERE sku=? AND EXISTS(SELECT 1 FROM orders WHERE id=?)').bind(l.quantity,l.sku,id)),
  ]);}catch(e){if(e instanceof Error&&/shop_limit_ceiling/.test(e.message))throw new RateLimitError();throw e;}
  const row=await this.db.prepare('SELECT * FROM orders WHERE owner_hash=? AND request_key=?').bind(owner,key).first<any>();
  const legacy=row&&quote.rail==='razorpay'&&row.rail==='razorpay'&&row.fingerprint===await hash(JSON.stringify({lines:quote.lines,amount:quote.amount,currency:quote.currency}));
  if(!row||(row.fingerprint!==fingerprint&&!legacy))throw Error('This checkout key belongs to a different basket.');
  return view(row);
 }
 async rearmCreation(id:string){return (await this.db.prepare("UPDATE orders SET status='creating' WHERE id=? AND rail='stenmont' AND status='submitting' AND invoice_id IS NULL AND provider_order_id IS NULL").bind(id).run()).meta.changes===1;}
 async finishStenmontCreation(id:string,invoiceId:string,payUrl:string,merchantId:string){const r=await this.db.prepare("UPDATE orders SET invoice_id=?,pay_url=?,merchant_id=?,status='awaiting_payment' WHERE id=? AND rail='stenmont' AND status='submitting' AND invoice_id IS NULL").bind(invoiceId,payUrl,merchantId,id).run();if(r.meta.changes!==1)throw Error('Invoice binding was not stored.');}
 async byId(id:string){const row=await this.db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();return row?view(row):null;}
 async get(id:string,owner:string){const row=await this.db.prepare('SELECT * FROM orders WHERE id=? AND owner_hash=?').bind(id,owner).first();return row?view(row):null;}
 async byProvider(id:string){const row=await this.db.prepare('SELECT * FROM orders WHERE provider_order_id=?').bind(id).first();return row?view(row):null;}
 async bindProvider(id:string,providerId:string){await this.db.prepare("UPDATE orders SET provider_order_id=? WHERE id=? AND status='creating' AND provider_order_id IS NULL").bind(providerId,id).run();}
 async claimCreation(id:string){return (await this.db.prepare("UPDATE orders SET status='submitting' WHERE id=? AND status='creating' AND provider_order_id IS NULL").bind(id).run()).meta.changes===1;}
 async finishCreation(id:string,providerId:string){await this.db.prepare("UPDATE orders SET provider_order_id=?,status='awaiting_payment' WHERE id=? AND status='submitting'").bind(providerId,id).run();}
 async captureInvoice(id:string,invoiceId:string,paymentId:string,eventId:string){
  const row=await this.db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first<any>();
  if(!row||row.rail!=='stenmont'||row.invoice_id!==invoiceId)throw Error('Invoice binding refused.');
  if(row.status==='paid')return false;
  const now=new Date().toISOString();const r=await this.db.batch([
   this.db.prepare('INSERT OR IGNORE INTO payment_events(id,order_id,payment_id,created_at) VALUES(?,?,?,?)').bind(eventId,id,paymentId,now),
   this.db.prepare("UPDATE orders SET status='paid',payment_id=?,paid_at=? WHERE id=? AND rail='stenmont' AND invoice_id=? AND status='awaiting_payment' AND EXISTS(SELECT 1 FROM payment_events WHERE id=? AND order_id=? AND payment_id=?)").bind(paymentId,now,id,invoiceId,eventId,id,paymentId),
  ]);return r[1].meta.changes===1;
 }
 async capture(id:string,providerId:string,paymentId:string,eventId:string){
  const row=await this.db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first<any>();
  if(!row||row.rail!=='razorpay'||row.provider_order_id!==providerId)throw Error('Payment binding refused.');
  if(row.status==='paid'){if(row.payment_id!==paymentId)throw Error('Payment binding refused.');return false;}
  const now=new Date().toISOString();
  const result=await this.db.batch([
   this.db.prepare('INSERT OR IGNORE INTO payment_events(id,order_id,payment_id,created_at) VALUES(?,?,?,?)').bind(eventId,id,paymentId,now),
   this.db.prepare("UPDATE orders SET status='paid',payment_id=?,paid_at=? WHERE id=? AND provider_order_id=? AND status!='paid' AND EXISTS(SELECT 1 FROM payment_events WHERE id=? AND order_id=? AND payment_id=?)").bind(paymentId,now,id,providerId,eventId,id,paymentId),
  ]);
  return result[1].meta.changes===1;
 }
}
