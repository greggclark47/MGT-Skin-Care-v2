import Stripe from 'stripe';
import type {Store} from './store';
import {check,Fault} from './security';
export type StripeClient=Stripe;
export function stripeFromEnv(env:NodeJS.ProcessEnv){return env.STRIPE_SECRET_KEY?new Stripe(env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:15000}):undefined;}
export async function processStripeEvent(store:Store,stripe:Stripe,event:Stripe.Event,env:NodeJS.ProcessEnv){
 check(event.id&&event.type,400,'invalid_event','Invalid payment event.');
 const live=env.STRIPE_SECRET_KEY?.startsWith('sk_live_')===true;
 check(event.livemode===live,400,'mode_mismatch','Payment mode mismatch.');
 // Provider retrieval is OUTSIDE the DB transaction. All local mutations + processed marker
 // commit together; a retrieval/handler failure leaves the event retryable.
 let session:any,subscription:any,charge:any;
 if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(event.type)){
  session=await stripe.checkout.sessions.retrieve((event.data.object as any).id,{expand:['payment_intent.latest_charge','subscription']});
  if(session.mode==='subscription'&&session.subscription)subscription=typeof session.subscription==='string'?await stripe.subscriptions.retrieve(session.subscription):session.subscription;
 }else if(event.type.startsWith('customer.subscription.'))subscription=await stripe.subscriptions.retrieve((event.data.object as any).id);
 else if(event.type==='charge.refunded')charge=await stripe.charges.retrieve((event.data.object as any).id);
 return store.tx(async db=>{
  if(await db.get('events',event.id))return{processed:false};
  if(session?.mode==='payment'){
   const id=session.metadata?.order_id;const o=id?await db.get('orders',id):undefined;
   check(o,409,'unknown_order','Payment does not match a pending order.');
   check(session.metadata.actor===o.actor&&session.currency==='usd'&&session.amount_subtotal===o.total_cents,409,'amount_mismatch','Payment does not match the order.');
   if(session.payment_status==='paid'&&!['paid','fulfilled','refunding','refunded'].includes(o.status)){
    check(!['cancelled','expired'].includes(o.status),409,'late_payment','Payment requires manual reconciliation.');
    o.status='paid';o.paid_at=new Date().toISOString();o.paid_total_cents=session.amount_total;o.stripe_session_id=session.id;
    o.payment_intent_id=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
    o.charge_id=typeof session.payment_intent?.latest_charge==='string'?session.payment_intent.latest_charge:session.payment_intent?.latest_charge?.id;
    o.shipping=session.collected_information?.shipping_details||session.shipping_details||null;
    await db.put('orders',o.id,o);await db.put('jobs','fulfill_'+o.id,{id:'fulfill_'+o.id,kind:'fulfillment',order_id:o.id,status:'pending',created_at:new Date().toISOString()});
   }else if(event.type==='checkout.session.expired'&&o.status==='pending'){
    for(const i of o.items){const p=await db.get('products',i.product_id);if(p){p.stock+=i.quantity;await db.put('products',p.id,p);}}
    o.status='expired';await db.put('orders',o.id,o);
   }
  }
  if(subscription&&subscription.metadata?.kind==='premium'){
   const owner=subscription.metadata?.actor;check(owner,409,'subscription_owner','Subscription owner not recognized.');
   const premiumPrice=env.STRIPE_PREMIUM_PRICE_ID;
   const valid=subscription.items?.data?.some((i:any)=>i.price?.id===premiumPrice);
   const active=!!valid&&['active','trialing'].includes(subscription.status);
   const prior=await db.get('memberships',owner);
   if(!prior||prior.subscription_id===subscription.id||active){
    await db.put('memberships',owner,{actor:owner,premium:active,status:subscription.status,subscription_id:subscription.id,customer_id:typeof subscription.customer==='string'?subscription.customer:subscription.customer.id,updated_at:new Date().toISOString()});
   }
  }
  if(charge?.refunded){
   const orders=await db.list('orders');const o=orders.find(o=>o.payment_intent_id===(typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id));
   if(o){o.status='refunded';await db.put('orders',o.id,o);}
  }
  await db.put('events',event.id,{id:event.id,type:event.type,processed_at:new Date().toISOString()});return{processed:true};
 });
}
