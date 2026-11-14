import { fetchProducts } from '../src/shopify';
(async()=>{
 for (const l of ['EN','AR'] as const) {
  const r:any = await fetchProducts({query:'(product_type:Eyeglasses OR product_type:"Optical Frame") AND available_for_sale:true', first:3, lang:l}).catch((e:any)=>String(e));
  console.log(l, JSON.stringify(r).slice(0,300));
 }
})();
