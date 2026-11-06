import { environment } from '../../../../lib/server';
import { OrderStore } from '../../../../lib/orders';
import { acceptStenmontWebhook } from '../../../../lib/stenmont';
export async function POST(request:Request){try{const env=await environment();return acceptStenmontWebhook(request,env,new OrderStore(env.DB));}catch{return Response.json({error:'Webhook not recorded. Retry delivery.'},{status:503});}}
