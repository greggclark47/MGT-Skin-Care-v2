import express from 'express';
import {randomUUID} from 'node:crypto';
import type Stripe from 'stripe';
import type {Store} from './store';
import {account,check,Fault,hash,wrap} from './security';
import {confirmSubscriptionCommand} from './subscriptions';
import {BILLING_CYCLES,PLAN_COMPARISON_ROWS,PLAN_DEFINITIONS,defaultPlanForAudience,planById,planPriceMatch,priceIdFor,recommendPlan,type BillingCycle,type PlanDefinition} from './plans';
export function installBilling(app:express.Express,db:Store,stripe:Stripe|undefined,env:NodeJS.ProcessEnv,origin:string){
 const selectedPlan=(value:unknown,audience:unknown):PlanDefinition=>{if(value!==undefined){const selected=planById(value);check(!!selected,400,'plan_missing','Choose one of the listed plans.');return selected!;}return defaultPlanForAudience(audience);};
 const selectedCycle=(value:unknown):BillingCycle=>{if(value===undefined)return'monthly';check(value==='monthly'||value==='annual',400,'cycle_invalid','Choose monthly or annual billing.');return value as BillingCycle;};
 const priceId=(plan:PlanDefinition,cycle:BillingCycle)=>priceIdFor(env,plan,cycle);
 const validatePrice=(p:Stripe.Price,cycle:string)=>check(p.active&&p.unit_amount!==null&&p.recurring?.interval===(cycle==='annual'?'year':'month')&&p.recurring!.interval_count===1,503,'plan_invalid','Subscription pricing needs review.');
 const configured=()=>env.SUBSCRIPTIONS_ENABLED==='true'&&!!stripe&&PLAN_DEFINITIONS.some(plan=>BILLING_CYCLES.some(cycle=>!!priceId(plan,cycle)))&&!!env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
 const ready=()=>check(configured(),503,'billing_unconfigured','Subscriptions are awaiting plan and payment setup.');
 app.get('/api/hub/billing/plans',wrap(async(req,res)=>{
  const cycle=selectedCycle(req.query.cycle);
  const {profile,company}=await db.tx(async r=>({profile:await r.get<any>('profiles',req.actor),company:await r.get<any>('settings','company')}));
  const recommendation=recommendPlan(profile);
  const legalReady=env.SUBSCRIPTION_TERMS_APPROVED==='true'&&!!company?.policies_published&&!!company?.legal_name&&!!company?.support_email;
  const plans=await Promise.all(PLAN_DEFINITIONS.map(async definition=>{
   const id=priceId(definition,cycle);let pricing=null,pricing_status=id?'needs_review':'pending';
   if(stripe&&id){try{const price=await stripe.prices.retrieve(id);validatePrice(price,cycle);pricing={amount:price.unit_amount,currency:price.currency,interval:price.recurring!.interval,interval_count:price.recurring!.interval_count};pricing_status='configured';}catch{pricing=null;pricing_status='needs_review';}}
   return{id:definition.id,name:definition.name,audience:definition.audience,summary:definition.summary,best_for:definition.best_for,features:definition.features,comparison:definition.comparison,provisional:true,pricing,pricing_status,enrollment_open:configured()&&legalReady&&pricing_status==='configured'};
  }));
  res.json({catalog_status:'provisional',cycle,plans,comparison_rows:PLAN_COMPARISON_ROWS,recommendation:{...recommendation,method:'transparent_rules_v1'},notice:'Plan names, benefits, limits, and prices are placeholders until commercial and policy approval. A recommendation is guidance, not an enrollment or charge.'});
 }));
 app.get('/api/hub/billing',wrap(async(req,res)=>{
  const selection=selectedPlan(req.query.plan,req.query.audience),audience=selection.audience;
  const membership=await db.tx(r=>r.get('subscriptions',req.actor+':'+audience));
  let trialEligible=!membership?.trial_used;let pendingCheckout=false;
  if(configured()&&membership?.customer_id){const history=await stripe!.subscriptions.list({customer:membership.customer_id,status:'all',limit:100});trialEligible=trialEligible&&!history.has_more&&!history.data.some(s=>s.trial_start);const attempt=await db.tx(r=>r.get('billing_attempts',req.actor+':'+audience));if(attempt?.session_id){const checkout=await stripe!.checkout.sessions.retrieve(attempt.session_id);pendingCheckout=checkout.status==='open';}}
  const cycle=selectedCycle(req.query.cycle);let plan=null;
  if(configured()&&priceId(selection,cycle)){const p=await stripe!.prices.retrieve(priceId(selection,cycle)!);validatePrice(p,cycle);plan={amount:p.unit_amount,currency:p.currency,interval:p.recurring!.interval,interval_count:p.recurring!.interval_count};}
  res.json({configured:configured()&&!!priceId(selection,cycle),plan_id:selection.id,offer:{id:selection.id,name:selection.name,provisional:true},audience,cycle,trial_days:14,trial_eligible:trialEligible,pending_checkout:pendingCheckout,plan,subscription:membership?{status:membership.status,active:membership.active,cancel_at_period_end:membership.cancel_at_period_end,trial_end:membership.trial_end,current_period_end:membership.current_period_end,cycle:membership.cycle,plan_id:membership.plan_id||null}:null,can_manage:!!membership?.customer_id});
 }));
 app.get('/api/hub/billing/activity',wrap(async(req,res)=>{account(req);const audience=req.query.audience;check(['consumer','vendor'].includes(audience as string),400,'invalid_audience','Choose a subscription audience.');const events=await db.tx(async r=>(await r.list('billing_activity')).filter(e=>e.actor===req.actor+':'+audience).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,30));res.json({audience,events:events.map(({id,at,status,cycle,plan_id,cancel_at_period_end})=>({id,at,status,cycle,plan_id:planById(plan_id)?.id||null,cancel_at_period_end}))});}));
 app.post('/api/hub/billing/checkout',wrap(async(req,res)=>{
  const user=account(req);ready();const selection=selectedPlan(req.body.plan,req.body.audience),audience=selection.audience,cycle=selectedCycle(req.body.cycle);check(priceId(selection,cycle),400,'plan_missing','This plan is not configured yet.');check(req.body.recurring_consent===true,400,'consent_required','Confirm the recurring subscription.');
  const company=await db.tx(r=>r.get('settings','company'));check(company?.policies_published&&company.legal_name&&company.support_email&&env.SUBSCRIPTION_TERMS_APPROVED==='true',503,'terms_pending','Subscription details and terms must be finalized first.');
  const price=await stripe!.prices.retrieve(priceId(selection,cycle)!);validatePrice(price,cycle);
  await db.tx(async r=>{const key=req.actor+':'+audience;await r.lock('billing:'+key);if(!await r.get('billing_attempts',key))await r.put('billing_attempts',key,{id:randomUUID()});});
  // Persist one customer and one checkout attempt per actor under the store lock.
  const result=await db.tx(async r=>{
   const key=req.actor+':'+audience;await r.lock('billing:'+key);let record=await r.get('subscriptions',key)||{};
   if(!record.customer_id){const customer=await stripe!.customers.create({email:user.email,metadata:{actor:key,kind:'mgt_subscription',audience}},{idempotencyKey:'mgt_customer_'+key});record.customer_id=customer.id;await r.put('subscriptions',key,record);}
   const existing=await stripe!.subscriptions.list({customer:record.customer_id,status:'all',limit:100});
   check(!existing.has_more&&!existing.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)),409,'subscription_exists','Manage your existing subscription in billing.');
   let attempt=await r.get('billing_attempts',key);
   if(attempt?.session_id){const previous=await stripe!.checkout.sessions.retrieve(attempt.session_id);if(previous.status==='open'){check((!attempt.price_id||attempt.price_id===price.id)&&(!attempt.plan_id||attempt.plan_id===selection.id),409,'checkout_open','An unfinished checkout uses another plan or cycle. Complete or discard it before changing your selection.');return{url:previous.url};}const settled=previous.status==='complete'&&existing.data.some(s=>s.id===(typeof previous.subscription==='string'?previous.subscription:previous.subscription?.id)&&['canceled','incomplete_expired'].includes(s.status));check(previous.status==='expired'||settled,409,'billing_pending','Payment is being reconciled. Refresh your subscription status shortly.');attempt={id:'replacement_'+previous.id};}
   if(!attempt){attempt={id:'renew_'+req.actor+'_'+audience+'_'+Math.floor(Date.now()/1800000)};await r.put('billing_attempts',key,attempt);}
   const checkout=await stripe!.checkout.sessions.create({mode:'subscription',customer:record.customer_id,line_items:[{price:price.id,quantity:1}],metadata:{actor:key,kind:'mgt_subscription',audience,plan:selection.id},payment_method_collection:'always',subscription_data:{metadata:{actor:key,kind:'mgt_subscription',audience,plan:selection.id},...(!record.trial_used&&!existing.data.some(s=>s.trial_start)?{trial_period_days:14,trial_settings:{end_behavior:{missing_payment_method:'cancel' as const}}}:{})},success_url:origin+'/membership?checkout=returned&plan='+selection.id+'&cycle='+cycle,cancel_url:origin+'/membership?plan='+selection.id+'&cycle='+cycle,consent_collection:{terms_of_service:'required'}},{idempotencyKey:attempt.id});
   await r.put('billing_attempts',key,{...attempt,session_id:checkout.id,price_id:price.id,plan_id:selection.id});return{url:checkout.url};
  });res.json(result);
 }));
 app.post('/api/hub/billing/discard-checkout',wrap(async(req,res)=>{
  account(req);ready();const selection=selectedPlan(req.body.plan,req.body.audience),audience=selection.audience;
  await db.tx(async r=>{const key=req.actor+':'+audience;await r.lock('billing:'+key);const attempt=await r.get('billing_attempts',key);if(!attempt?.session_id)return;const session=await stripe!.checkout.sessions.retrieve(attempt.session_id);check(session.status!=='complete',409,'checkout_complete','Checkout has completed. Refresh billing status instead.');if(session.status==='open')await stripe!.checkout.sessions.expire(attempt.session_id);await r.put('billing_attempts',key,{id:'replacement_'+attempt.session_id});});res.json({discarded:true});
 }));
 app.post('/api/hub/billing/trial-cycle',wrap(async(req,res)=>{
  account(req);ready();const selection=selectedPlan(req.body.plan,req.body.audience),audience=selection.audience,cycle=selectedCycle(req.body.cycle);check(req.body.recurring_consent===true,400,'invalid_change','Choose and confirm a billing cycle.');
  const target=priceId(selection,cycle);check(target,400,'plan_missing','This rate is not configured.');const price=await stripe!.prices.retrieve(target);validatePrice(price,cycle);
  await db.tx(async r=>{const record=await r.get('subscriptions',req.actor+':'+audience);check(record?.subscription_id,404,'subscription_missing','No subscription found.');const sub=await stripe!.subscriptions.retrieve(record.subscription_id);check(sub.status==='trialing'&&!sub.cancel_at_period_end&&sub.items.data.length===1&&(typeof sub.customer==='string'?sub.customer:sub.customer.id)===record.customer_id,409,'trial_change_invalid','Refresh billing status before changing this subscription.');await stripe!.subscriptions.update(sub.id,{items:[{id:sub.items.data[0].id,price:target}],metadata:{...sub.metadata,plan:selection.id},proration_behavior:'none'});});res.json({saved:true});
 }));
 app.post('/api/hub/billing/portal',wrap(async(req,res)=>{
  account(req);ready();const selection=selectedPlan(req.body.plan,req.body.audience),audience=selection.audience;const record=await db.tx(r=>r.get('subscriptions',req.actor+':'+audience));check(record?.customer_id,404,'billing_missing','No billing account exists yet.');
  const subscription=record.subscription_id?await stripe!.subscriptions.retrieve(record.subscription_id):null;
  const prices:Stripe.Price[]=[];for(const plan of PLAN_DEFINITIONS.filter(item=>item.audience===audience))for(const cycle of BILLING_CYCLES){const id=priceId(plan,cycle);if(id&&!prices.some(item=>item.id===id)){const price=await stripe!.prices.retrieve(id);validatePrice(price,cycle);prices.push(price);}}
  const products:Record<string,string[]>={};for(const p of prices){const id=typeof p.product==='string'?p.product:p.product.id;(products[id]||=[]).push(p.id);}
  const configuration=await stripe!.billingPortal.configurations.create({business_profile:{headline:'MGT subscription billing'},features:{customer_update:{enabled:true,allowed_updates:['email','address']},invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:subscription?.status==='active'?{enabled:true,default_allowed_updates:['price'],proration_behavior:'always_invoice',products:Object.entries(products).map(([product,prices])=>({product,prices}))}:{enabled:false}}});
  res.json(await stripe!.billingPortal.sessions.create({customer:record.customer_id,configuration:configuration.id,return_url:origin+'/membership?billing=returned&plan='+(record.plan_id||selection.id)}));
 }));
}
export function installSubscriptionWebhook(app:express.Express,db:Store,stripe:Stripe|undefined,env:NodeJS.ProcessEnv){
 app.post('/webhooks/subscriptions',express.raw({type:'application/json',limit:'256kb'}),wrap(async(req,res)=>{
  check(stripe&&env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET,503,'billing_unconfigured','Subscription webhook is not configured.');
  let event:Stripe.Event;try{event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'] as string,env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET,300);}catch{throw new Fault(400,'invalid_signature','Invalid webhook signature.');}
  check(typeof event.id==='string'&&event.id.length>0&&event.id.length<=255&&typeof event.type==='string'&&event.type.length<=200,400,'invalid_event','Invalid subscription event.');
  const received_at=new Date().toISOString();
  await db.tx(async r=>{await r.lock('subscription-receipt:'+event.id);const prior=await r.get<any>('subscription_webhook_receipts',event.id);await r.put('subscription_webhook_receipts',event.id,{id:event.id,type:event.type,status:prior?.status==='processed'?'processed':'processing',attempts:(prior?.attempts||0)+1,duplicate_count:prior?.duplicate_count||0,first_received_at:prior?.first_received_at||received_at,last_received_at:received_at,processed_at:prior?.processed_at||null,last_error_code:null});});
  try{
   check(event.livemode===(env.STRIPE_SECRET_KEY?.startsWith('sk_live_')===true),400,'mode_mismatch','Payment mode mismatch.');
   const allowed=['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','checkout.session.completed'];
   let outcome:{processed?:boolean;duplicate?:boolean;ignored?:boolean};
   if(!allowed.includes(event.type))outcome={ignored:true};
   else outcome=await db.tx(async r=>{
    await r.lock('subscription-event:'+hash(event.id));
    if(await r.get('subscription_events',event.id))return{duplicate:true};
    const object=event.data.object as any;
    const id=event.type==='checkout.session.completed'?object.subscription:object.id;
    if(!id)return{ignored:true};
    // Discover the account, then re-read current state while holding its billing lock.
    const discovered=await stripe!.subscriptions.retrieve(typeof id==='string'?id:id.id);
    if(discovered.metadata.kind!=='mgt_subscription')return{ignored:true};
    const actor=discovered.metadata.actor;check(['consumer','vendor'].includes(discovered.metadata.audience)&&actor?.endsWith(':'+discovered.metadata.audience),409,'audience_mismatch','Subscription audience could not be verified.');await r.lock('billing:'+actor);
    const subscription=await stripe!.subscriptions.retrieve(discovered.id);
    check(subscription.metadata.actor===actor&&subscription.metadata.audience===discovered.metadata.audience&&subscription.metadata.kind==='mgt_subscription',409,'owner_mismatch','Subscription ownership could not be verified.');
    const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer.id;
    const record=await r.get('subscriptions',actor);check(record?.customer_id===customer,409,'owner_mismatch','Subscription ownership could not be verified.');
    const audience=subscription.metadata.audience as 'consumer'|'vendor',currentPrice=subscription.items.data[0]?.price.id,matched=planPriceMatch(env,audience,currentPrice);const declaredPlan=subscription.metadata.plan;const valid=subscription.items.data.length===1&&!!matched&&(!declaredPlan||declaredPlan===matched.plan.id);
    const confirmed={...record,source:'stripe',plan_id:matched?.plan.id||record.plan_id||null,trial_used:record.trial_used||!!subscription.trial_start,trial_end:subscription.trial_end,current_period_end:subscription.current_period_end,cycle:matched?.cycle||record.cycle||null,subscription_id:subscription.id,status:subscription.status,active:valid&&['active','trialing'].includes(subscription.status),cancel_at_period_end:subscription.cancel_at_period_end,updated_at:new Date().toISOString()};
    await r.put('subscriptions',actor,confirmed);
    await confirmSubscriptionCommand(r,'subscriptions',actor,confirmed,event.created);
    await r.put('billing_activity',event.id,{id:event.id,actor,at:new Date().toISOString(),status:subscription.status,cycle:matched?.cycle||null,plan_id:matched?.plan.id||null,cancel_at_period_end:subscription.cancel_at_period_end});
    await r.put('subscription_events',event.id,{type:event.type,at:new Date().toISOString()});return{processed:true};
   });
   await db.tx(async r=>{await r.lock('subscription-receipt:'+event.id);const receipt=await r.get<any>('subscription_webhook_receipts',event.id);if(receipt)await r.put('subscription_webhook_receipts',event.id,{...receipt,status:outcome.ignored?'ignored':'processed',last_outcome:outcome.duplicate?'duplicate':outcome.ignored?'ignored':'processed',duplicate_count:(receipt.duplicate_count||0)+(outcome.duplicate?1:0),processed_at:outcome.processed?new Date().toISOString():receipt.processed_at,last_error_code:null});});
   res.json(outcome);
  }catch(error){
   await db.tx(async r=>{await r.lock('subscription-receipt:'+event.id);const receipt=await r.get<any>('subscription_webhook_receipts',event.id);if(receipt&&receipt.status!=='processed')await r.put('subscription_webhook_receipts',event.id,{...receipt,status:'failed',last_outcome:'failed',last_error_code:error instanceof Fault?error.code:'service_error',failed_at:new Date().toISOString()});});
   throw error;
  }
 }));
}
