import { notFound } from 'next/navigation';
import { products } from '../../../lib/catalogue';
import { ProductArt } from '../../ProductArt';
import { ProductForm } from './ProductForm';
export function generateStaticParams(){return products.map(p=>({slug:p.slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const p=products.find(p=>p.slug===slug);return {title:p?.name??'Product'};}
export default async function Product({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const p=products.find(p=>p.slug===slug);if(!p)notFound();return <section className="product-detail"><ProductArt kind={p.art}/><div><p className="eyebrow">{p.category}</p><h1>{p.name}</h1><p className="lede">{p.description}</p><p>{p.detail}</p><ProductForm product={p}/><p className="fine">Fictional product. This test order will not be shipped.</p></div></section>;}
