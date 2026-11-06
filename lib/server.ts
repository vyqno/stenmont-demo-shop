import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cookies } from 'next/headers';
import { hash } from './commerce';
import type { ShopEnv } from './checkout';
export async function environment(){return (await getCloudflareContext({async:true})).env as unknown as ShopEnv;}
export async function owner(){const value=(await cookies()).get('shop_session')?.value;return value&&/^[0-9a-f]{64}$/.test(value)?hash(value):null;}
