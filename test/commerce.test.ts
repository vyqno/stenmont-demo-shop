import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote, fingerprint, verifyCaptured, signature, verifySignature, checkoutSignature } from '../lib/commerce.ts';
const body=(changes:Record<string,unknown>={})=>JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_fixture',order_id:'order_fixture',amount:120000,currency:'INR',status:'captured',...changes}}}});
test('server prices variants and combines identical items',()=>{
 const q=quote([{sku:'folio-a5-ink',quantity:2},{sku:'folio-a5-ink',quantity:1}]);
 assert.equal(q.amount,360000);assert.equal(q.currency,'INR');assert.equal(q.lines.length,1);assert.equal(q.lines[0].quantity,3);
});
test('unknown variants, noninteger counts, too many items and client price fields are refused',()=>{
 for(const input of [[{sku:'fake',quantity:1}],[{sku:'folio-a5-ink',quantity:1.5}],[{sku:'folio-a5-ink',quantity:0}],[{sku:'folio-a5-ink',quantity:11}],[{sku:'folio-a5-ink',quantity:1,price:1}],[]]) assert.throws(()=>quote(input));
});
test('fingerprint is order independent but quantity bound',async()=>{
 assert.equal(await fingerprint(quote([{sku:'folio-a5-ink',quantity:1},{sku:'pen-brass',quantity:1}])),await fingerprint(quote([{sku:'pen-brass',quantity:1},{sku:'folio-a5-ink',quantity:1}])));
 assert.notEqual(await fingerprint(quote([{sku:'folio-a5-ink',quantity:1}])),await fingerprint(quote([{sku:'folio-a5-ink',quantity:2}])));
});
test('raw body HMAC verifies and refuses changed whitespace, wrong key and malformed signature',async()=>{
 const raw=body(),s=await signature(raw,'fixture-secret');
 assert.equal(await verifySignature(raw,s,'fixture-secret'),true);
 assert.equal(await verifySignature(raw+' ',s,'fixture-secret'),false);
 assert.equal(await verifySignature(raw,s,'other-secret'),false);
 assert.equal(await verifySignature(raw,'not-a-signature','fixture-secret'),false);
});
test('only full captured INR payments for the stored provider order are accepted',()=>{
 const expected={providerOrderId:'order_fixture',amount:120000,currency:'INR'};
 assert.equal(verifyCaptured(body(),expected).paymentId,'pay_fixture');
 for(const change of [{order_id:'other'},{amount:1},{currency:'USD'},{status:'authorized'},{id:''}]) assert.throws(()=>verifyCaptured(body(change),expected));
 assert.throws(()=>verifyCaptured(JSON.stringify({event:'payment.authorized'}),expected));
});
test('checkout callback signature uses stored order id and cannot mark captured',async()=>{
 const s=await checkoutSignature('order_fixture','pay_fixture','fixture-secret');
 assert.equal(s,await signature('order_fixture|pay_fixture','fixture-secret'));
 assert.notEqual(s,await checkoutSignature('attacker','pay_fixture','fixture-secret'));
});
