import { environment } from '../../../../lib/server';
import { OrderStore } from '../../../../lib/orders';
import { acceptWebhook } from '../../../../lib/checkout';
export async function POST(request:Request){try{const env=await environment();return acceptWebhook(request,env,new OrderStore(env.DB));}catch{return Response.json({error:'Webhook could not be recorded. Retry delivery.'},{status:503});}}
