export type Rail='razorpay'|'stenmont';
/** Independent fictional test prices. These are not INR currency conversions. */
export const usdtUnits:Readonly<Record<string,number>>={
 'folio-a5-ink':1000000,'folio-a5-stone':1000000,'pen-brass':1800000,'pen-graphite':1800000,
 'tray-cloud':950000,'tray-ink':950000,'cards-ivory':450000,'case-sand':1600000,'case-ink':1600000,'pad-weekly':650000,
};
export function decimalAmount(units:number){if(!Number.isSafeInteger(units)||units<0)throw Error('Invalid amount');return (BigInt(units)/1000000n).toString()+((units%1000000)?'.'+(units%1000000).toString().padStart(6,'0').replace(/0+$/,''):'');}
export function decimalUnits(value:unknown){if(typeof value!=='string'||!/^\d{1,12}(\.\d{1,6})?$/.test(value))throw Error('Invalid decimal amount');const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));}
export function displayAmount(units:number,currency:string){return currency==='USDT'?`${decimalAmount(units)} USDT`:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(units/100);}
