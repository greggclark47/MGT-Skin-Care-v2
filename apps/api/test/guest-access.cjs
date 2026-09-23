// Guest access v1.3: real HTTP, isolated records, mocked identity and coach generation.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPortal}=require('../dist/portal/server'),{LocalStore}=require('../dist/portal/store');
const {StoreBudgetStore}=require('../dist/portal/ai');
const profile={skin_type:'dry',concerns:['hydration'],sensitivity:'none',age_band:'26_35',current_routine:'basic',desired_outcome:'glow',budget_range:'between_25_50',ingredient_avoidances:[],consent:true};
async function fixture(t){
 const db=new LocalStore(':memory:'),calls=[],budget=new StoreBudgetStore(db);
 const coach={configured:true,answer:async(_message,_articles,actor,premium)=>{calls.push({actor,premium});if(premium)await budget.record(actor,'tier3_premium',1);return {kind:'guidance',text:'Test response only.',citations:[]};}};
 const app=await createPortal({store:db,coach,env:{NODE_ENV:'test',DEMO_MODE:'true',PUBLIC_ORIGIN:'http://portal.test'},verifyOtp:async email=>({id:email.split('@')[0],email})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();});
 async function client(name){let cookie='',csrf='';const send=async(route,body,headers={})=>{const r=await fetch(base+'/api/hub'+route,{method:body===undefined?'GET':'POST',headers:{cookie,origin:'http://portal.test','content-type':'application/json','x-csrf-token':csrf,...headers},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=await r.json();if(data.csrf)csrf=data.csrf;return {status:r.status,data};};await send('/session');if(name){assert.equal((await send('/auth/verify',{email:name+'@test.invalid',code:'123456'})).status,200);await send('/session');}return send;}
 const owner=await client('owner'),guest=await client('guest'),other=await client('other');
 await db.tx(r=>r.put('subscriptions','user_owner:consumer',{subscription_id:'private_sub',customer_id:'private_customer',active:true,status:'active',current_period_end:Math.floor(Date.now()/1000)+90*86400}));
 const invite=async(mode='basic')=>{const response=await owner('/guest-access/invite',{email:'guest@test.invalid',mode,confirm:true});assert.equal(response.status,201);return {...response.data,token:response.data.invite_path.split('=')[1]};};
 return{db,calls,budget,owner,guest,other,client,invite};
}
test('guest invitations: verified intended email, 30-day acceptance, private profiles, no billing/admin access',async t=>{
 const f=await fixture(t),inv=await f.invite('match_owner');
 await f.owner('/profile',profile);await f.guest('/profile',{...profile,skin_type:'oily'});
 assert.equal((await f.other('/guest-access/accept',{token:inv.token,confirm:true})).status,404);
 assert.equal((await f.guest('/guest-access/accept',{token:inv.token,confirm:true})).status,200);
 const access=(await f.guest('/guest-access')).data.access;const remaining=Date.parse(access.expires_at)-Date.now();assert(remaining>30*86400000-5000&&remaining<=30*86400000);
 assert.equal(access.mode,'match_owner');assert.equal((await f.guest('/session')).data.membership.premium,true);
 assert.equal((await f.guest('/profile')).data.profile.input.skin_type,'oily');assert.equal((await f.owner('/profile')).data.profile.input.skin_type,'dry');
 assert.equal((await f.guest('/admin')).status,403);assert.equal((await f.guest('/billing?audience=consumer')).data.subscription,null);
 assert.equal((await f.guest('/guest-access/invite',{email:'other@test.invalid',mode:'match_owner',confirm:true})).status,403);
 const serialized=JSON.stringify((await f.guest('/guest-access')).data);assert(!serialized.includes('user_owner'));assert(!serialized.includes('private_'));assert(!serialized.includes(inv.token));
 const again=await f.guest('/guest-access/accept',{token:inv.token,confirm:true});assert.equal(again.data.access.expires_at,access.expires_at,'replay never extends access');
});
test('guest invitations: matching plan uses owner AI budget and shared rate limit; downgrade removes paid access',async t=>{
 const f=await fixture(t),inv=await f.invite('match_owner');await f.guest('/guest-access/accept',{token:inv.token,confirm:true});
 assert.equal((await f.guest('/coach',{message:'How do I simplify a cosmetic routine?',ai_consent:true})).status,200);
 assert.deepEqual(f.calls[0],{actor:'user_owner',premium:true});assert.equal(await f.budget.spentToday('user_owner','tier3_premium'),1);assert.equal(await f.budget.spentToday('user_guest','tier3_premium'),0);
 await f.db.tx(r=>r.put('rate','ai-user:owner',{count:20,reset:Date.now()+86400000}));
 assert.equal((await f.guest('/coach',{message:'Routine tips?',ai_consent:true})).status,429);
 assert.equal((await f.owner('/coach',{message:'Routine tips?',ai_consent:true})).status,429);
 await f.db.tx(async r=>{const s=await r.get('subscriptions','user_owner:consumer');await r.put('subscriptions','user_owner:consumer',{...s,active:false,status:'canceled'});});
 assert.equal((await f.guest('/session')).data.membership.premium,false);
});
test('guest invitations: basic mode never inherits paid access; owner-only revocation ends access without deleting profile',async t=>{
 const f=await fixture(t),inv=await f.invite('basic');await f.guest('/guest-access/accept',{token:inv.token,confirm:true});await f.guest('/profile',profile);
 assert.equal((await f.guest('/session')).data.membership.premium,false);
 assert.equal((await f.other('/guest-access/revoke',{id:inv.invitation.id,confirm:true})).status,404);
 assert.equal((await f.owner('/guest-access/revoke',{id:inv.invitation.id,confirm:true})).status,200);
 assert.equal((await f.guest('/profile')).status,403);assert.equal((await f.guest('/profile',profile)).status,403);
 assert.equal((await f.guest('/account/export')).data.profile.input.skin_type,'dry');
 assert.equal((await f.guest('/guest-access/accept',{token:inv.token,confirm:true})).status,410);
});
test('guest invitations: expiry, malformed input, consent, CSRF, anonymous calls and concurrent one-guest limit',async t=>{
 const f=await fixture(t),anonymous=await f.client();assert.equal((await anonymous('/guest-access')).status,401);
 for(const body of [{},{email:'owner@test.invalid',mode:'basic',confirm:true},{email:'guest@test.invalid',mode:'admin',confirm:true},{email:'guest@test.invalid',mode:'basic',confirm:false}])assert.equal((await f.owner('/guest-access/invite',body)).status,400);
 assert.equal((await f.owner('/guest-access/invite',{email:'guest@test.invalid',mode:'basic',confirm:true},{'x-csrf-token':'bad'})).status,403);
 const replies=await Promise.all(['guest','other'].map(name=>f.owner('/guest-access/invite',{email:name+'@test.invalid',mode:'basic',confirm:true})));assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);
 const record=replies.find(r=>r.status===201).data;const recipient=record.invitation.email.startsWith('guest')?f.guest:f.other;
 await recipient('/guest-access/accept',{token:record.invite_path.split('=')[1],confirm:true});
 await f.db.tx(async r=>{const invite=await r.get('guest_invitations',record.invitation.id);await r.put('guest_invitations',invite.id,{...invite,expires_at:new Date(Date.now()-1).toISOString()});});
 assert.equal((await recipient('/profile')).status,403);assert.equal((await recipient('/session')).data.membership.premium,false);
});
