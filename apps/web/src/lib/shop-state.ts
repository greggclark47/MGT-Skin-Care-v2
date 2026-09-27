export type ShopListing = {id:string;region:string;specialty:string;segments:string[]};
export function readShopState(search:string,listings:ShopListing[],segments:{id:string}[]){
 const params=new URLSearchParams(search);
 const segment=segments.some(s=>s.id===params.get('segment'))?params.get('segment')!:'all';
 const region=listings.some(r=>r.region===params.get('region'))?params.get('region')!:'All';
 const specialty=listings.some(r=>(segment==='all'||r.segments.includes(segment))&&r.specialty===params.get('specialty'))?params.get('specialty')!:'All';
 const compare=[...new Set((params.get('compare')||'').split(','))].filter(id=>listings.some(r=>r.id===id)).slice(0,3);
 return {query:(params.get('q')||'').slice(0,160),region,specialty,segment,compare};
}
export function updateShopUrl(href:string,values:Record<string,string>){
 const url=new URL(href);
 for(const [key,value] of Object.entries(values)){
  if(!value||((key==='segment'||key==='region'||key==='specialty')&&value.toLowerCase()==='all'))url.searchParams.delete(key);
  else url.searchParams.set(key,value);
 }
 return url;
}
export function shareShopUrl(href:string,compare?:string[]){
 const current=new URL(href),url=new URL('/shop',current.origin);
 for(const key of ['q','region','specialty','segment','compare']){
  const value=current.searchParams.get(key);if(value)url.searchParams.set(key,value);
 }
 if(compare!==undefined){if(compare.length)url.searchParams.set('compare',compare.join(','));else url.searchParams.delete('compare');}
 return url.href;
}
