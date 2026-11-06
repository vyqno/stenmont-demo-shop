import { environment, owner } from '../../../lib/server';
import { OrderStore } from '../../../lib/orders';
import { startCheckout } from '../../../lib/checkout';
export async function POST(request:Request){try{const env=await environment();return startCheckout(request,await owner(env),env,new OrderStore(env.DB));}catch{return Response.json({error:'Checkout is unavailable. No payment was taken.'},{status:503});}}
