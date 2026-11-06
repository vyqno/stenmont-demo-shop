import { CART_KEY } from './cart.ts';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Receipt={id:string;status:string;items:unknown};
function signature(items:unknown){
 if(!Array.isArray(items))return null;const counts=new Map<string,number>();
 for(const row of items){if(!row||typeof row.sku!=='string'||!Number.isSafeInteger(row.quantity)||row.quantity<1)return null;counts.set(row.sku,(counts.get(row.sku)??0)+row.quantity);}
 return JSON.stringify([...counts].sort(([a],[b])=>a.localeCompare(b)));
}
/** Call only after the owned order API succeeds. Never release an unpaid or different pending order. */
export function clearPaidPendingCheckout(order:Receipt,session:Store=sessionStorage,local:Store=localStorage){
 if(order.status!=='paid')return false;
 try{
  if(session.getItem('fieldwork.pending-order')!==order.id)return false;
  const paid=signature(order.items);if(paid===null)return false;
  const saved=JSON.parse(session.getItem('fieldwork.checkout')??'null');
  const cart=signature(JSON.parse(local.getItem(CART_KEY)??'[]'));if(cart===null)return false;
  if(!saved){if(cart!=='[]')return false;}
  else {
   const savedItems=typeof saved.fingerprint==='string'?signature(JSON.parse(saved.fingerprint)):null;
   if(savedItems===null)return false;
   const matching=saved.orderId===order.id||(!saved.orderId&&savedItems===paid);
   if(matching&&savedItems===paid&&cart===paid){
    // Empty the paid basket before removing its retry key; a failed storage write cannot enable a duplicate charge.
    local.setItem(CART_KEY,'[]');session.removeItem('fieldwork.checkout');
   }
  }
  session.removeItem('fieldwork.pending-order');return true;
 }catch{return false;}
}
