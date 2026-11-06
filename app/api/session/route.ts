import { cookies } from 'next/headers';
export async function GET(){
 const jar=await cookies();const old=jar.get('shop_session')?.value;
 if(!old||!/^[0-9a-f]{64}$/.test(old)){const value=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');jar.set('shop_session',value,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:60*60*24*14});}
 return Response.json({ready:true},{headers:{'cache-control':'private, no-store'}});
}
