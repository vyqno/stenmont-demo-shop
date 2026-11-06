import { environment } from '../../../lib/server';
import { sessionResponse } from '../../../lib/guards';
export async function GET(request:Request){try{const env=await environment();return sessionResponse(request,env,env.DB);}catch{return Response.json({error:'Session service unavailable.'},{status:503});}}
