import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cookies } from 'next/headers';
import { hash } from './commerce';
import type { ShopEnv } from './checkout';
export async function environment(){return (await getCloudflareContext({async:true})).env as unknown as ShopEnv;}
export async function owner(env?:ShopEnv){const value=(await cookies()).get('shop_session')?.value;if(!value||!/^[0-9a-f]{64}$/.test(value))return null;const key=await hash(value);const db=(env??await environment()).DB;return await db.prepare('SELECT owner_hash FROM shop_sessions WHERE owner_hash=? AND expires_at>?').bind(key,Date.now()).first()?key:null;}
