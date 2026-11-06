import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export async function registerStenmontEndpoint(options:{apiKey:string;registrationKey:string;fetcher:typeof fetch;saveSecret:(value:string)=>Promise<void>}){
 if(typeof options.apiKey!=='string'||options.apiKey.length<16||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/.test(options.registrationKey))throw Error('Supply a private API key and saved registration UUID.');
 const response=await options.fetcher('https://api-staging.stenmont.com/v1/webhook-endpoints',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{authorization:`Bearer ${options.apiKey}`,'content-type':'application/json','idempotency-key':options.registrationKey},body:JSON.stringify({url:'https://demo-shop-staging.stenmont.com/api/webhooks/stenmont'})});
 if(!response.ok)throw Error('Webhook registration refused. Retry using the same registration UUID.');
 const data:any=await response.json();if(typeof data.id!=='string'||typeof data.secret!=='string'||data.secret.length<16)throw Error('Invalid registration response.');
 await options.saveSecret(data.secret);
 return {endpointId:data.id,secretStored:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]!=='--staging')throw Error('Explicit --staging is required. Input credentials through a private stdin pipe.');
 try{const input=JSON.parse(await readFile('/dev/stdin','utf8'));const result=await registerStenmontEndpoint({...input,fetcher:fetch,saveSecret:async(value:string)=>{
  const output=spawnSync('pnpm',['exec','wrangler','secret','put','STENMONT_WEBHOOK_SECRET','--env','staging'],{input:value,encoding:'utf8'});
  if(output.status!==0)throw Error('Secret storage failed. Retry registration with the same UUID.');
 }});console.log(JSON.stringify(result));}catch{console.error('Registration or secret storage failed; no credential was printed. Reuse the saved registration UUID.');process.exitCode=1;}
}
