'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { products } from '../../lib/catalogue';
import { readCart,saveCart,type CartItem } from '../../lib/cart';
import { displayAmount,usdtUnits,type Rail } from '../../lib/pricebook';
import { ProductArt } from '../ProductArt';
type Checkout={id:string;keyId:string;providerOrderId:string;amount:number;currency:string;status:string;rail?:Rail;payUrl?:string;retryable?:boolean};
declare global {interface Window {Razorpay?:new(options:Record<string,unknown>)=>{open():void};}}
function loadCheckout(){if(window.Razorpay)return Promise.resolve();return new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.onload=()=>resolve();script.onerror=()=>reject(Error('Could not load the test checkout.'));document.body.append(script);});}
export default function Basket(){
 const [items,setItems]=useState<CartItem[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pendingOrder,setPendingOrder]=useState(''),[rail,setRail]=useState<Rail>('stenmont');
 useEffect(()=>{setItems(readCart());setPendingOrder(sessionStorage.getItem('fieldwork.pending-order')??'');void fetch('/api/session',{credentials:'same-origin'}).catch(()=>{});},[]);
 function change(sku:string,n:number){const next=(items??[]).map(i=>i.sku===sku?{...i,quantity:n}:i).filter(i=>i.quantity>0);setItems(next);saveCart(next);sessionStorage.removeItem('fieldwork.checkout');}
 const lines=(items??[]).flatMap(i=>{const product=products.find(p=>p.variants.some(v=>v.sku===i.sku));const variant=product?.variants.find(v=>v.sku===i.sku);return product&&variant?[{...i,product,variant}]:[];});
 const currency=rail==='stenmont'?'USDT':'INR';const unit=(sku:string,paise:number)=>rail==='stenmont'?usdtUnits[sku]!:paise;
 const total=lines.reduce((n,l)=>n+unit(l.sku,l.variant.paise)*l.quantity,0);
 async function pay(){if(busy)return;setBusy(true);setError('');try{
  await fetch('/api/session',{credentials:'same-origin'});
  const fingerprint=JSON.stringify(items);let saved:any;try{saved=JSON.parse(sessionStorage.getItem('fieldwork.checkout')??'null');}catch{}
  const key=saved?.fingerprint===fingerprint?saved.key:crypto.randomUUID();sessionStorage.setItem('fieldwork.checkout',JSON.stringify({fingerprint,key}));
  const response=await fetch('/api/checkout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({items,key,rail})});const data=await response.json() as Checkout&{error?:string};
  if(data.id){const orders=JSON.parse(localStorage.getItem('fieldwork.orders')??'[]');if(!orders.includes(data.id))localStorage.setItem('fieldwork.orders',JSON.stringify([...orders,data.id]));}
  if(!response.ok||response.status===202){if(data.id&&!data.retryable){setPendingOrder(data.id);sessionStorage.setItem('fieldwork.pending-order',data.id);}throw Error(data.error??'Checkout could not start.');}
  if(data.status==='paid'){location.assign(`/orders/${data.id}`);return;}
  if(data.rail==='stenmont'&&data.payUrl){location.assign(data.payUrl);return;}
  await loadCheckout();if(!window.Razorpay)throw Error('Test checkout unavailable.');
  new window.Razorpay({key:data.keyId,amount:data.amount,currency:data.currency,order_id:data.providerOrderId,name:'Fieldwork Supply Co.',description:'TEST ORDER · No goods shipped',handler:()=>location.assign(`/orders/${data.id}`),modal:{ondismiss:()=>setBusy(false)},theme:{color:'#293c2f'}}).open();
 }catch(e){setError(e instanceof Error?e.message:'Checkout could not start.');setBusy(false);}}
 return <section className="basket-page"><p className="eyebrow">YOUR EVERYDAY KIT</p><h1>Your basket.</h1>{items===null?<p role="status">Loading your basket…</p>:!lines.length?<div className="empty"><h2>A little room for something useful.</h2><p>Your basket is empty.</p><Link className="button" href="/#collection">Explore the collection ↗</Link></div>:<div className="basket-layout"><div>{lines.map(l=><article className="basket-line" key={l.sku}><ProductArt kind={l.product.art}/><div><Link href={`/products/${l.product.slug}`}><h2>{l.product.name}</h2></Link><p>{l.variant.label}</p><label>Quantity <input aria-label={`Quantity for ${l.product.name}`} type="number" min="1" max="10" value={l.quantity} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=10)change(l.sku,n);}}/></label><button className="text-button" onClick={()=>change(l.sku,0)}>Remove</button></div><strong>{displayAmount(unit(l.sku,l.variant.paise)*l.quantity,currency)}</strong></article>)}</div><aside className="order-summary"><p className="eyebrow">ORDER SUMMARY</p><label>Payment option<select value={rail} disabled={busy||!!pendingOrder} onChange={e=>setRail(e.target.value as Rail)}><option value="stenmont">Stenmont · Test USDT</option><option value="razorpay">Razorpay · Test INR</option></select></label><p className="total"><span>Total</span><strong>{displayAmount(total,currency)}</strong></p><p>{currency} · Independent fictional test price books. These prices are not currency conversions. No goods will ship.</p><button className="button" disabled={busy||!!pendingOrder} onClick={()=>void pay()}>{busy?'Opening checkout…':rail==='stenmont'?'Pay with Stenmont · Test USDT ↗':'Pay with Razorpay · Test INR ↗'}</button><p className="fine">A successful checkout window is not a receipt. Your order becomes paid only after a verified payment webhook, bound to this order and the full amount.</p>{error&&<p role="alert" className="error">{error}</p>}{pendingOrder&&<p role="status">Checkout needs reconciliation. <Link href={`/orders/${pendingOrder}`}>Open your pending order ↗</Link>. A new payment will not be started.</p>}</aside></div>}<Link href="/orders">View orders on this browser ↗</Link></section>;
}
