'use client';
import { useState } from 'react';
import Link from 'next/link';
import { money,type Product } from '../../../lib/catalogue';
import { addCart } from '../../../lib/cart';
export function ProductForm({product}:{product:Product}){const [sku,setSku]=useState(product.variants[0].sku),[quantity,setQuantity]=useState(1),[added,setAdded]=useState(false);const variant=product.variants.find(v=>v.sku===sku)!;
 return <form className="product-form" onSubmit={e=>{e.preventDefault();addCart(sku,quantity);setAdded(true);}}><strong className="price">{money(variant.paise)}</strong><label>Choose a finish<select value={sku} onChange={e=>{setSku(e.target.value);setAdded(false);}}>{product.variants.map(v=><option key={v.sku} value={v.sku}>{v.label}</option>)}</select></label><label>Quantity<input type="number" min="1" max="10" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label><button className="button">Add to basket ↗</button>{added&&<p role="status">Added to your basket. <Link href="/cart">View basket ↗</Link></p>}</form>;
}
