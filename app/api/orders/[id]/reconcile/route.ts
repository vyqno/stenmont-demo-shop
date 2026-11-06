import { environment,owner } from '../../../../../lib/server';
import { boundedText } from '../../../../../lib/checkout';
import { OrderStore } from '../../../../../lib/orders';
import { reconcileStenmontInvoice } from '../../../../../lib/stenmont';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Open this order from its shop.'},{status:403});
 try{const env=await environment(),key=await owner(env);if(!key)return Response.json({error:'Order not found.'},{status:404});
  const store=new OrderStore(env.DB),order=await store.get((await params).id,key);if(!order)return Response.json({error:'Order not found.'},{status:404});
  let body:any;try{body=JSON.parse(await boundedText(request,1024));}catch{return Response.json({error:'Invalid reconciliation request.'},{status:400});}
  if(!body||Object.keys(body).join(',')!=='invoiceId'||typeof body.invoiceId!=='string')return Response.json({error:'Supply only the existing invoice id.'},{status:400});
  return reconcileStenmontInvoice(order,body.invoiceId,env,store);
 }catch{return Response.json({error:'Reconciliation unavailable.'},{status:503});}
}
