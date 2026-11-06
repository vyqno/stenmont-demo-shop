import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerStenmontEndpoint } from '../scripts/register-stenmont-webhook.ts';
test('registration sends the saved UUID and stores a returned secret without including it in the result',async()=>{
 let secret='',calls=0;const fetcher:typeof fetch=async(url,init)=>{calls++;assert.equal(url,'https://api-staging.stenmont.com/v1/webhook-endpoints');assert.equal(new Headers(init?.headers).get('idempotency-key'),'12345678-1234-4123-8123-123456789abc');assert.deepEqual(JSON.parse(init?.body as string),{url:'https://demo-shop-staging.stenmont.com/api/webhooks/stenmont'});return Response.json({id:'endpoint-fixture',secret:'fixture-signing-secret'},{status:201});};
 const result=await registerStenmontEndpoint({apiKey:'fixture-server-key-only',registrationKey:'12345678-1234-4123-8123-123456789abc',fetcher,saveSecret:async value=>{secret=value;}});
 assert.equal(calls,1);assert.equal(secret,'fixture-signing-secret');assert.deepEqual(result,{endpointId:'endpoint-fixture',secretStored:true});assert.ok(!JSON.stringify(result).includes(secret));
});
test('registration failure never calls the secret store',async()=>{let stored=false;await assert.rejects(()=>registerStenmontEndpoint({apiKey:'fixture-server-key-only',registrationKey:'12345678-1234-4123-8123-123456789abc',fetcher:async()=>Response.json({error:'refused'},{status:403}),saveSecret:async()=>{stored=true;}}));assert.equal(stored,false);});
