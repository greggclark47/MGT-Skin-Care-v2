// Verification v1.2: real HTTP + persistent local store; identity service is a test double.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {createPortal}=require('../dist/portal/server');
const {LocalStore}=require('../dist/portal/store');
const {hash}=require('../dist/portal/security');
const input={skin_type:'dry',concerns:['hydration'],sensitivity:'none',age_band:'26_35',current_routine:'basic',desired_outcome:'glow',budget_range:'between_25_50',ingredient_avoidances:[],consent:true};
async function fixture(t){
 const root=path.resolve(__dirname,'../../..','work/verification');fs.mkdirSync(root,{recursive:true});
 const dir=fs.mkdtempSync(path.join(root,'profile-'));const file=path.join(dir,'store.sqlite');
 const db=new LocalStore(file);let failAudit=false;
 const store={kind:db.kind,close:()=>db.close(),tx:fn=>db.tx(r=>fn({...r,put:async(scope,id,value)=>{if(failAudit&&scope==='audit')throw Error('Injected mid-write failure');return r.put(scope,id,value);}}))};
 const app=await createPortal({store,env:{NODE_ENV:'test',DEMO_MODE:'true',PUBLIC_ORIGIN:'http://portal.test'},verifyOtp:async email=>({id:email,email})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();});
 function client(initialCookie=''){
  let cookie=initialCookie,csrf='';
  const send=async(route,body,headers={})=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{cookie,origin:'http://portal.test','content-type':'application/json','x-csrf-token':csrf,...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
   if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
   const data=await response.json();if(data.csrf)csrf=data.csrf;return{status:response.status,data};};
  return{send,cookie:()=>cookie,login:async(email='owner@test.invalid')=>{await send('/api/hub/session');const login=await send('/api/hub/auth/verify',{email,code:'123456'});assert.equal(login.status,200);await send('/api/hub/session');}};
 }
 return {db,file,client,fail:()=>{failAudit=true;}};
}
test('profile: malformed JSON is a client error, not an internal failure',async t=>{
 const f=await fixture(t),c=f.client();await c.login();
 assert.equal((await c.send('/api/hub/profile','{')).status,400);
 assert.equal((await c.send('/api/hub/profile','null')).status,400);
 assert.equal((await c.send('/api/hub/profile',{})).status,400);
 assert.equal((await c.send('/api/hub/profile',{...input,concerns:[]})).status,400);
 assert.equal((await c.send('/api/hub/profile',{...input,ingredient_avoidances:Array(31).fill('fragrance')})).status,400);
 assert.equal((await c.send('/api/hub/profile')).data.profile,null);
});
test('profile: create/read are identical; exact concurrent revision admits one writer and rejects the stale writer',async t=>{
 const f=await fixture(t),a=f.client();await a.login();
 const created=await a.send('/api/hub/profile',input);assert.equal(created.status,200);
 const read=await a.send('/api/hub/profile');assert.deepEqual(created.data.profile,read.data.profile);
 assert.equal(typeof read.data.revision,'string');
 const results=await Promise.all(['oily','combination'].map(skin_type=>a.send('/api/hub/profile',{...input,skin_type,expected_revision:read.data.revision})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const winner=results.find(r=>r.status===200).data.profile;
 assert.deepEqual((await a.send('/api/hub/profile')).data.profile,winner);
 assert.equal((await a.send('/api/hub/profile/feedback',{feedback:'irritation',expected_revision:read.data.revision})).status,409);
 assert.equal((await a.send('/api/hub/routine/simplify',{expected_revision:read.data.revision})).status,409);
});
test('profile: failed write rolls back profile, revision, and audit together',async t=>{
 const f=await fixture(t),c=f.client();await c.login();const created=await c.send('/api/hub/profile',input);
 const before=await c.send('/api/hub/profile'),audits=await f.db.tx(r=>r.list('audit'));f.fail();
 assert.equal((await c.send('/api/hub/profile',{...input,skin_type:'oily',expected_revision:before.data.revision})).status,500);
 assert.deepEqual((await c.send('/api/hub/profile')).data,before.data);
 assert.deepEqual(await f.db.tx(r=>r.list('audit')),audits);
 assert.equal(created.status,200);
});
test('profile: stale concurrent clients cannot both overwrite the same version',async t=>{
 const f=await fixture(t),c=f.client();await c.login();await c.send('/api/hub/profile',input);
 const read=await c.send('/api/hub/profile');
 const results=await Promise.all(['oily','combination'].map(skin_type=>c.send('/api/hub/profile',{...input,skin_type,expected_revision:read.data.revision||'missing-revision'})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
test('profile: sign-in never silently discards a different guest profile when the account has preferences',async t=>{
 const f=await fixture(t),owner=f.client(),guest=f.client();await owner.login();await owner.send('/api/hub/profile',input);
 await guest.send('/api/hub/session');await guest.send('/api/hub/profile',{...input,skin_type:'oily'});
 const before=await f.db.tx(r=>r.entries('profiles'));
 const linked=await guest.send('/api/hub/auth/verify',{email:'owner@test.invalid',code:'123456'});
 assert.equal(linked.status,409,'conflicting profiles require an explicit choice rather than silent deletion');
 assert.deepEqual(await f.db.tx(r=>r.entries('profiles')),before);
});
test('profile: explicit merge choice links the guest without reusing the verification code',async t=>{
 const f=await fixture(t),owner=f.client(),guest=f.client();await owner.login();await owner.send('/api/hub/profile',input);
 await guest.send('/api/hub/session');const guestProfile=await guest.send('/api/hub/profile',{...input,skin_type:'oily'});
 assert.equal((await guest.send('/api/hub/auth/verify',{email:'owner@test.invalid',code:'123456'})).status,409);
 const merged=await guest.send('/api/hub/auth/merge',{choice:'guest'});assert.equal(merged.status,200);assert.equal(merged.data.merged,'guest');
 const session=await guest.send('/api/hub/session');assert.equal(session.data.account.email,'owner@test.invalid');
 assert.deepEqual((await guest.send('/api/hub/profile')).data.profile,guestProfile.data.profile);
 assert.equal((await f.db.tx(r=>r.list('profile_merge_pending'))).length,0);
});
test('session: removed account cannot retain its old actor through a stale cookie',async t=>{
 const f=await fixture(t),c=f.client();await c.login();await c.send('/api/hub/profile',input);
 await f.db.tx(r=>r.remove('accounts','owner@test.invalid'));
 assert.equal((await c.send('/api/hub/session')).data.account,null);
 assert.equal((await c.send('/api/hub/profile')).data.profile,null);
});
test('profile: cookie reload, persisted second connection, expiry, re-login, deletion, and stale recreation',async t=>{
 const f=await fixture(t),c=f.client();await c.login();await c.send('/api/hub/profile',input);
 const before=await c.send('/api/hub/profile'),reload=f.client(c.cookie());await reload.send('/api/hub/session');assert.deepEqual((await reload.send('/api/hub/profile')).data,before.data);
 const second=new LocalStore(f.file);try{assert.deepEqual(await second.tx(r=>r.get('profiles','user_owner@test.invalid')),before.data.profile);}finally{await second.close();}
 await f.db.tx(async r=>{const id=hash(c.cookie().split('=')[1]),s=await r.get('sessions',id);await r.put('sessions',id,{...s,expires:Date.now()-1});});
 assert.equal((await c.send('/api/hub/session')).data.account,null);
 assert.equal((await c.send('/api/hub/profile')).data.profile,null);
 await c.login();assert.deepEqual((await c.send('/api/hub/profile')).data,before.data);
 const other=f.client();await other.login('other@test.invalid');assert.equal((await other.send('/api/hub/profile')).data.profile,null);
 const removed=await c.send('/api/hub/profile/remove',{confirm:true,expected_revision:before.data.revision});assert.equal(removed.status,200);
 assert.equal((await c.send('/api/hub/profile')).data.profile,null);
 assert.equal(await f.db.tx(r=>r.get('profiles','user_owner@test.invalid')),undefined);
 assert.equal((await c.send('/api/hub/profile',{...input,expected_revision:before.data.revision})).status,409);
 const empty=await c.send('/api/hub/profile');assert.equal((await c.send('/api/hub/profile',{...input,expected_revision:empty.data.revision})).status,200);
});
