import { environment, owner } from '../../../../lib/server';
import { OrderStore } from '../../../../lib/orders';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{const key=await owner();if(!key)return Response.json({error:'Order not found.'},{status:404});const order=await new OrderStore((await environment()).DB).get((await params).id,key);
  if(!order)return Response.json({error:'Order not found.'},{status:404});const {ownerHash:_,...safe}=order;
  return Response.json(safe,{headers:{'cache-control':'private, no-store'}});
 }catch{return Response.json({error:'Order service is temporarily unavailable.'},{status:503});}
}
