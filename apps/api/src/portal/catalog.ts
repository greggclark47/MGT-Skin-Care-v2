import {classify,buildRoutine,scoreProduct,compileMatrix,ingredientAllowedByMatrix,SEED_INGREDIENT_RULES,type CandidateProduct,type SkinProfileInput,type RoutineSlot,type ScoreResult} from '@mgt/domain';
import {SEED_CATALOG} from '../modules/catalog/store';
import {check} from './security';
import type {Records,Store} from './store';
export interface Product extends CandidateProduct {name:string;description:string;sample:boolean;stock:number;merchant_id:string;image_url?:string;approved:boolean;approved_by?:string;updated_by?:string}
export const names:Record<string,string>={'cleanser-gentle':'Gentle daily cleanser','cleanser-salicylic':'Clarifying cleanser','treatment-niacinamide':'Niacinamide concentrate','treatment-retinol':'Retinol night treatment','moisturizer-gel':'Lightweight moisture gel','moisturizer-rich':'Rich barrier cream','spf-lightweight':'Daily sun protection','toner-hydrating':'Hydrating toner','eye-cream-basic':'Everyday eye cream'};
export async function initializeCatalog(store:Store,demo:boolean){await store.tx(async db=>{if(demo){
 for(const p of SEED_CATALOG){const existing=await db.get<Product>('products',p.id);if(!existing||existing.sample)await db.put('products',p.id,{...p,name:names[p.id],description:'Sample catalog item from the MGT v2 blueprint. Not available for purchase.',sample:true,stock:100,merchant_id:'sample',approved:false});}
 for(const r of SEED_INGREDIENT_RULES){const existing=await db.get<any>('rules',r.ingredient_key);if(!existing||existing.sample)await db.put('rules',r.ingredient_key,{...r,status:'draft',sample:true});}
}});}
export async function match(db:Records,input:SkinProfileInput,demo:boolean){
 const c=classify(input);
 // v2 used conflicting ceiling definitions. The portal applies the user tolerance directly:
 // lower means more reactive. All ingredient eligibility uses the versioned matrix, never the old constant loader.
 c.profile_vector.sensitivity_ceiling={none:.9,mild:.65,moderate:.4,high:.15}[input.sensitivity];
 let rules=await db.list('rules');rules=rules.filter(r=>demo?r.sample||r.status==='approved':r.status==='approved'&&r.sme_approved_by&&!r.sample);
 check(rules.length,503,'safety_review_pending','Recommendations are awaiting ingredient review.');
 const matrix=compileMatrix(rules.map(r=>({...r,status:'approved'})));
 const products=(await db.list<Product>('products')).filter(p=>p.status==='active'&&p.stock>0&&(demo||p.approved&&!p.sample));
 const eligible=products.filter(p=>p.ingredients.length>0&&p.ingredients.every(i=>matrix.rules.has(i)&&ingredientAllowedByMatrix(i,matrix,c.profile_vector.sensitivity_ceiling,c.avoid_flags,input.ingredient_avoidances)));
 const slots=new Map<RoutineSlot,ScoreResult[]>();const ingredients=new Map<string,string[]>();
 for(const p of eligible){
  // Safety is already applied by the reviewed matrix. The legacy scorer is used for ranking only.
  const scored=scoreProduct({...p,ingredients:[]},c.profile_vector,{fragrance:false,essential_oils:false,alcohol_denat:false,physical_exfoliants:false,high_strength_actives:false},[],input.budget_range);
  if(!scored.excluded){slots.set(p.slot,[...(slots.get(p.slot)||[]),scored].sort((a,b)=>b.score-a.score));ingredients.set(p.id,p.ingredients);}
 }
 let routine=buildRoutine(slots,ingredients);
 if(input.current_routine!=='advanced')routine={...routine,steps:routine.steps.filter(s=>!s.is_optional)};
 // No unreviewed pairing advice or photos in this release. Full label directions remain authoritative.
 return {input,...c,routine,matrix_version:matrix.matrix_version,results:[...slots.values()].flat(),created_at:new Date().toISOString(),sample:demo};
}
export function quote(cart:{items:{product_id:string,quantity:number}[]},products:Product[],premium:boolean,strict=true){
 const items=cart.items.map(i=>{const p=products.find(p=>p.id===i.product_id);const available=!!p&&p.status==='active'&&p.stock>=i.quantity;if(strict)check(available,409,'product_unavailable','A product is no longer available in that quantity.');return {product_id:i.product_id,name:p?.name||'Unavailable product',quantity:i.quantity,unit_price_cents:p?.price_cents||0,merchant_id:p?.merchant_id||'',sample:p?.sample||false,approved:p?.approved||false,available};});
 const subtotal=items.reduce((s,i)=>s+i.unit_price_cents*i.quantity,0);
 if(premium)for(const item of items)item.unit_price_cents-=Math.round(item.unit_price_cents*.05);
 const total=items.reduce((s,i)=>s+i.unit_price_cents*i.quantity,0);
 return {items,subtotal_cents:subtotal,discount_cents:subtotal-total,total_cents:total,currency:'usd',tax_shipping_at_checkout:true};
}
