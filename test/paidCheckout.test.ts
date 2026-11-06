import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearPaidPendingCheckout } from '../lib/paidCheckout.ts';
function storage(initial:Record<string,string>={}){const map=new Map(Object.entries(initial));return {getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);},removeItem:(key:string)=>{map.delete(key);}};}
const items=[{sku:'folio-a5-ink',quantity:1}],fingerprint=JSON.stringify(items),order={id:'owned-order',status:'paid',items};
const session=(overrides:Record<string,string>={})=>storage({'fieldwork.pending-order':order.id,'fieldwork.checkout':JSON.stringify({key:'saved-key',fingerprint,orderId:order.id}),...overrides});
test('owned paid receipt clears only its matching pending order, saved checkout and unchanged paid cart',()=>{
 const s=session(),local=storage({'fieldwork.cart.v1':fingerprint});assert.equal(clearPaidPendingCheckout(order,s,local),true);assert.equal(s.getItem('fieldwork.pending-order'),null);assert.equal(s.getItem('fieldwork.checkout'),null);assert.equal(local.getItem('fieldwork.cart.v1'),'[]');
});
test('unpaid or another pending order is never cleared',()=>{
 for(const current of [{...order,status:'submitting'},{...order,status:'awaiting_payment'},{...order,id:'different-order'}]){const s=session(),local=storage({'fieldwork.cart.v1':fingerprint});assert.equal(clearPaidPendingCheckout(current,s,local),false);assert.equal(s.getItem('fieldwork.pending-order'),order.id);assert.equal(local.getItem('fieldwork.cart.v1'),fingerprint);assert.ok(s.getItem('fieldwork.checkout'));}
});
test('a changed basket or another saved checkout is preserved while its paid pending marker is released',()=>{
 const changed=JSON.stringify([{sku:'pen-brass',quantity:1}]);const s=session(),local=storage({'fieldwork.cart.v1':changed});assert.equal(clearPaidPendingCheckout(order,s,local),true);assert.equal(s.getItem('fieldwork.pending-order'),null);assert.equal(local.getItem('fieldwork.cart.v1'),changed);assert.ok(s.getItem('fieldwork.checkout'));
 const other=session({'fieldwork.checkout':JSON.stringify({key:'other-key',orderId:'other-order',fingerprint})}),sameCart=storage({'fieldwork.cart.v1':fingerprint});assert.equal(clearPaidPendingCheckout(order,other,sameCart),true);assert.ok(other.getItem('fieldwork.checkout'));assert.equal(sameCart.getItem('fieldwork.cart.v1'),fingerprint);
});
test('legacy checkout fingerprint without orderId is matched against the actual paid order items',()=>{
 const s=session({'fieldwork.checkout':JSON.stringify({key:'saved-key',fingerprint})}),local=storage({'fieldwork.cart.v1':fingerprint});assert.equal(clearPaidPendingCheckout(order,s,local),true);assert.equal(s.getItem('fieldwork.checkout'),null);assert.equal(local.getItem('fieldwork.cart.v1'),'[]');
});
test('cart storage failure does not remove retry key or pending guard',()=>{
 const s=session(),local={getItem:()=>fingerprint,setItem:()=>{throw Error('storage refused');},removeItem:()=>{}};assert.equal(clearPaidPendingCheckout(order,s,local),false);assert.ok(s.getItem('fieldwork.checkout'));assert.equal(s.getItem('fieldwork.pending-order'),order.id);
});
