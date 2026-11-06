export type CartItem={sku:string;quantity:number};
export const CART_KEY='fieldwork.cart.v1';
export function readCart():CartItem[]{try{const value=JSON.parse(localStorage.getItem(CART_KEY)??'[]');return Array.isArray(value)?value.filter(i=>typeof i.sku==='string'&&Number.isInteger(i.quantity)&&i.quantity>0):[];}catch{return [];}}
export function saveCart(cart:CartItem[]){localStorage.setItem(CART_KEY,JSON.stringify(cart));window.dispatchEvent(new Event('cart-changed'));}
export function addCart(sku:string,quantity:number){const cart=readCart();const found=cart.find(i=>i.sku===sku);if(found)found.quantity=Math.min(10,found.quantity+quantity);else cart.push({sku,quantity});saveCart(cart);}
