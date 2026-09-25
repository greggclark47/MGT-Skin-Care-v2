// Verification v1.2: real portal HTTP and signatures; external billing/auth are test doubles.
const {test}=require('node:test');const assert=require('node:assert/strict');
const Stripe=require('stripe');const {createPortal}=require('../dist/portal/server');const {LocalStore}=require('../dist/portal/store');
async function fixture(t){
 const db=new LocalStore(':memory:'),signer=new Stripe('sk_test_fixture');
 const env={NODE_ENV:'test',PUBLIC_ORIGIN:'http://portal.test',SUBSCRIPTIONS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_SUBSCRIPTION_WEBHOOK_SECRET:'whsec_fixture',STRIPE_CONSUMER_PRICE_ID:'price_test'};
 let remote={id:'sub_private',customer:'cus_private',metadata:{kind:'mgt_subscription',actor:'user_owner:consumer',audience:'consumer'},items:{data:[{price:{id:'price_test'}}]},status:'active',cancel_at_period_end:false,current_period_end:Math.floor(Date.now()/1000)+3600},updates=0,fail=false;
 const stripe={webhooks:signer.webhooks,subscriptions:{retrieve:async()=>structuredClone(remote),update:async(_id,patch)=>{if(fail)throw Error('private upstream credential error');updates++;remote={...remote,...patch};return structuredClone(remote);}}};
 const app=await createPortal({store:db,env,stripe,verifyOtp:async email=>({id:email.startsWith('owner')?'owner':'other',email})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();});
 function client(){let cookie='',csrf='';const call=async(route,method='GET',body,extra={})=>{const r=await fetch(base+route,{method,headers:{cookie,origin:env.PUBLIC_ORIGIN,'content-type':'application/json','x-csrf-token':csrf,...extra},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=await r.json();if(data.csrf)csrf=data.csrf;return{status:r.status,data};};return{call,login:async(email='owner@test.invalid')=>{await call('/api/hub/session');assert.equal((await call('/api/hub/auth/verify','POST',{email,code:'123456'})).status,200);await call('/api/hub/session');}};}
 const owner=client();await owner.login();
 await db.tx(r=>r.put('subscriptions','user_owner:consumer',{subscription_id:remote.id,customer_id:remote.customer,active:true,status:'active',current_period_end:remote.current_period_end,cancel_at_period_end:false}));
 const id=(await owner.call('/api/v1/subscriptions')).data.subscriptions[0].id;
 async function webhook(eventId='evt_fixture',created=Math.floor(Date.now()/1000)){
  const payload=JSON.stringify({id:eventId,created,livemode:false,type:'customer.subscription.updated',data:{object:{id:remote.id}}});
  const r=await fetch(base+'/webhooks/subscriptions',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signer.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET})},body:payload});return{status:r.status,data:await r.json()};
 }
 return{db,owner,id,client,webhook,remote:patch=>{remote={...remote,...patch};},updates:()=>updates,fail:()=>{fail=true;}};
}
test('subscriptions: session-bound list/get/entitlement; cross-account and forged-header rejection; neutral response',async t=>{
 const f=await fixture(t),guest=f.client(),other=f.client();await other.login('other@test.invalid');
 assert.equal((await guest.call('/api/v1/subscriptions','GET',undefined,{'x-user-id':'owner'})).status,401);
 assert.equal((await other.call('/api/v1/subscriptions/'+f.id)).status,404);
 const listed=await f.owner.call('/api/v1/subscriptions');assert.equal(listed.status,200);assert.equal(listed.data.entitlement.premium,true);
 assert.doesNotMatch(JSON.stringify(listed.data),/stripe|supabase|revenuecat|cus_private|sub_private|price_test|user_owner/i);
 assert.deepEqual((await f.owner.call('/api/v1/entitlement')).data,listed.data.entitlement);
 assert.deepEqual((await f.owner.call('/api/hub/session')).data.membership,listed.data.entitlement);
 assert.equal((await f.owner.call('/api/v1/subscriptions/'+f.id)).data.subscription.id,f.id);
 assert.equal((await f.owner.call('/api/v1/subscriptions','POST',{})).status,503);
 assert.equal((await f.owner.call('/api/v1/checkout/confirm','POST',{})).status,409);
});
test('subscriptions: cancel and resume change billing but stay pending locally until a verified webhook',async t=>{
 const f=await fixture(t),url='/api/v1/subscriptions/'+f.id;
 for(const [cancel,key,event] of [[true,'cancel-12345','evt_cancel'],[false,'resume-12345','evt_resume']]){
  const result=await f.owner.call(url,'DELETE',{cancel_at_period_end:cancel},{'idempotency-key':key});assert.equal(result.status,202);
  assert.equal(result.data.status,'pending_confirmation');
  assert.equal((await f.owner.call(url)).data.subscription.cancel_at_period_end,!cancel);
  assert.equal((await f.owner.call(url,'DELETE',{cancel_at_period_end:cancel},{'idempotency-key':key})).data.id,result.data.id);
  assert.equal((await f.owner.call('/api/v1/subscriptions/commands/'+result.data.id)).data.status,'pending_confirmation');
  assert.equal((await f.webhook(event)).status,200);
  assert.equal((await f.owner.call('/api/v1/subscriptions/commands/'+result.data.id)).data.status,'confirmed');
  assert.equal((await f.owner.call(url)).data.subscription.cancel_at_period_end,cancel);
  assert.equal((await f.webhook(event)).data.duplicate,true);
 }
 assert.equal(f.updates(),2);
});
test('subscriptions: malformed flags, idempotency conflicts, CSRF, ownership, and managed records fail closed',async t=>{
 const f=await fixture(t),url='/api/v1/subscriptions/'+f.id;
 assert.equal((await f.owner.call(url,'DELETE',{cancel_at_period_end:'yes'},{'idempotency-key':'test-12345'})).status,400);
 assert.equal((await f.owner.call(url,'DELETE',{cancel_at_period_end:true})).status,400);
 assert.equal((await f.owner.call(url,'DELETE',{cancel_at_period_end:true},{'idempotency-key':'test-12345','x-csrf-token':'wrong'})).status,403);
 f.remote({customer:'cus_wrong'});assert.equal((await f.owner.call(url,'DELETE',{cancel_at_period_end:true},{'idempotency-key':'test-12345'})).status,409);
 assert.equal(f.updates(),0);
 await f.db.tx(async r=>{const old=await r.get('subscriptions','user_owner:consumer');await r.put('subscriptions','user_owner:consumer',{...old,source:'revenuecat'});});
 const managed=(await f.owner.call(url)).data.subscription;assert.equal(managed.can_cancel,false);assert.equal(managed.can_resume,false);
 assert.equal((await f.owner.call(url,'DELETE',{cancel_at_period_end:true},{'idempotency-key':'test-12345'})).data.error.code,'platform_managed');
 assert.equal((await f.owner.call(url,'PUT',{})).data.error.code,'platform_managed');
});
test('subscriptions: upstream errors reveal no details and commit no command or changed entitlement',async t=>{
 const f=await fixture(t);f.fail();
 const result=await f.owner.call('/api/v1/subscriptions/'+f.id,'DELETE',{cancel_at_period_end:true},{'idempotency-key':'failure-12345'});
 assert.equal(result.status,500);assert.doesNotMatch(JSON.stringify(result.data),/credential|upstream|stripe/i);
 assert.deepEqual(await f.db.tx(r=>r.list('subscription_commands')),[]);
 assert.equal((await f.owner.call('/api/v1/entitlement')).data.premium,true);
});
test('subscriptions: stale events cannot confirm commands; past-due entitlement follows the three-day grace',async t=>{
 const f=await fixture(t);
 const command=await f.owner.call('/api/v1/subscriptions/'+f.id,'DELETE',{cancel_at_period_end:true},{'idempotency-key':'stale-12345'});
 assert.equal((await f.webhook('evt_old',1)).status,200);
 assert.equal((await f.owner.call('/api/v1/subscriptions/commands/'+command.data.id)).data.status,'pending_confirmation');
 const other=f.client();await other.login('other@test.invalid');assert.equal((await other.call('/api/v1/subscriptions/commands/'+command.data.id)).status,404);
 f.remote({status:'past_due'});await f.webhook('evt_due');
 assert.equal((await f.owner.call('/api/v1/entitlement')).data.premium,true);
 assert.equal((await f.owner.call('/api/hub/session')).data.membership.premium,true);
});
