export interface RetailerListing {
 id:string;name:string;url:string;region:'South Korea'|'US'|'EU';focus:string;description:string;
 type:'Multi-brand retailer'|'Brand store';relationship:'independent';source_url:string;checked_at:string;
 segments?:string[];specialty?:string;
}
const ORIGINAL_RETAILERS:RetailerListing[]=[
 {id:'olive-young',name:'OLIVE YOUNG Global',url:'https://global.oliveyoung.com/',region:'South Korea',focus:'K-beauty',description:'A multi-brand destination for Korean skincare, makeup and beauty discovery.',type:'Multi-brand retailer',relationship:'independent',source_url:'https://global.oliveyoung.com/',checked_at:'2026-09-06'},
 {id:'stylekorean',name:'STYLEKOREAN',url:'https://www.stylekorean.com/',region:'South Korea',focus:'K-beauty',description:'Explore Korean skincare and beauty brands through its international storefront.',type:'Multi-brand retailer',relationship:'independent',source_url:'https://www.stylekorean.com/',checked_at:'2026-09-06'},
 {id:'beauty-of-joseon',name:'Beauty of Joseon',url:'https://beautyofjoseon.com/',region:'South Korea',focus:'K-beauty',description:'Visit the brand’s own storefront to explore its skincare collection.',type:'Brand store',relationship:'independent',source_url:'https://beautyofjoseon.com/',checked_at:'2026-09-06'},
 {id:'cosrx',name:'COSRX',url:'https://www.cosrx.com/',region:'South Korea',focus:'K-beauty',description:'Browse skincare directly on the COSRX brand storefront.',type:'Brand store',relationship:'independent',source_url:'https://www.cosrx.com/',checked_at:'2026-09-06'},
 {id:'soko-glam',name:'Soko Glam',url:'https://sokoglam.com/',region:'US',focus:'K-beauty',description:'A US-based destination focused on Korean skincare and beauty.',type:'Multi-brand retailer',relationship:'independent',source_url:'https://sokoglam.com/pages/why-soko',checked_at:'2026-09-06'},
 {id:'douglas',name:'DOUGLAS Germany',url:'https://www.douglas.de/de',region:'EU',focus:'Global beauty',description:'A German beauty storefront with skincare, cosmetics and fragrance across brands.',type:'Multi-brand retailer',relationship:'independent',source_url:'https://www.douglas.de/de',checked_at:'2026-09-06'}
];
export const SHOP_SEGMENTS=[
 {id:'skincare',label:'Skincare',studio:'/skin-match'},
 {id:'makeup',label:'Makeup Artist',studio:'/studio/makeup'},
 {id:'haircare',label:'Haircare Artist',studio:'/studio/haircare'},
 {id:'hair-color',label:'Hair Color',studio:'/studio/hair-color'},
 {id:'style',label:'Style Artist',studio:'/studio/style'},
 {id:'clothing',label:'Clothing & Style',studio:'/studio/clothing'},
 {id:'personal-color',label:'Personal Color',studio:'/studio/personal-color'},
];
export const RETAILERS:RetailerListing[]=[
 ...ORIGINAL_RETAILERS.map(r=>({...r,segments:['olive-young','stylekorean','douglas'].includes(r.id)?['skincare','makeup']:['skincare'],specialty:r.focus})),
 {id:'mented',name:'Mented Cosmetics',url:'https://www.mentedcosmetics.com/',region:'US',focus:'Makeup',specialty:'Makeup color ranges',segments:['makeup','personal-color'],description:'A specialist cosmetics storefront with lip, complexion and eye makeup collections.',type:'Brand store',relationship:'independent',source_url:'https://www.mentedcosmetics.com/collections',checked_at:'2026-09-07'},
 {id:'pattern',name:'PATTERN Beauty',url:'https://patternbeauty.com/',region:'US',focus:'Haircare',specialty:'Curly & coily hair',segments:['haircare'],description:'Haircare and styling collections focused on curly, coily and tight-textured hair.',type:'Brand store',relationship:'independent',source_url:'https://patternbeauty.com/',checked_at:'2026-09-07'},
 {id:'overtone',name:'Overtone',url:'https://overtone.co/',region:'US',focus:'Hair color',specialty:'Color-depositing hair products',segments:['hair-color','haircare'],description:'Explore color-depositing masks, conditioners and hair-color ranges. Review the brand’s guidance for your starting color and chosen product.',type:'Brand store',relationship:'independent',source_url:'https://overtone.co/',checked_at:'2026-09-07'},
 {id:'universal-standard',name:'Universal Standard',url:'https://www.universalstandard.com/',region:'US',focus:'Clothing',specialty:'Extended clothing sizes',segments:['clothing','style'],description:'Clothing collections with an extended size range. Check each item’s measurements, sizing and availability on the retailer’s site.',type:'Brand store',relationship:'independent',source_url:'https://www.universalstandard.com/',checked_at:'2026-09-07'},
 {id:'haute-hijab',name:'Haute Hijab',url:'https://www.hautehijab.com/',region:'US',focus:'Headwear',specialty:'Hijabs & accessories',segments:['clothing','style','personal-color'],description:'A specialist destination for hijabs and accessories in a range of fabrics and colors, for people who choose to wear them.',type:'Brand store',relationship:'independent',source_url:'https://www.hautehijab.com/',checked_at:'2026-09-07'},
];
export const COMMERCE_MODEL={mode:'external_referral',consumer_checkout:false,merchant_of_record:'external_vendor',billing:'external_vendor',shipping:'external_vendor',returns:'external_vendor',mgt_fee_rates:null,commercial_agreements:'pending'};
