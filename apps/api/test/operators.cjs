const assert=require('node:assert/strict');
const {createPortal}=require('../dist/portal/server');
const {LocalStore}=require('../dist/portal/store');

(async()=>{
 const db=new LocalStore(':memory:');
 const app=await createPortal({store:db,env:{NODE_ENV:'test',DEMO_MODE:'true',PUBLIC_ORIGIN:'http://localhost:3000'},verifyOtp:async(email)=>({id:email.split('@')[0],email})});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/api/hub';
 function client(){let cookie='',csrf='';return async(path,body,extra={})=>{
  const response=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json','x-csrf-token':csrf,...extra},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const data=await response.json();if(data.csrf)csrf=data.csrf;return{status:response.status,data};
 };}
 async function signIn(request,email){await request('/session');assert.equal((await request('/auth/verify',{email,code:'123456'})).status,200);await request('/session');}
 const admin=client(),target=client(),compliance=client(),guest=client();
 try{
  await db.tx(async r=>{
   await r.put('accounts','admin',{id:'admin',email:'admin@example.test',roles:['superadmin']});
   await r.put('accounts','compliance',{id:'compliance',email:'compliance@example.test',roles:['compliance']});
   await r.put('tickets','private_ticket',{id:'private_ticket',actor:'user_private',email:'private@example.test',subject:'Private',message:'Private support text',status:'open',replies:[],created_at:new Date().toISOString()});
   await r.put('orders','private_order',{id:'private_order',actor:'user_private',email:'private@example.test',status:'fulfilled'});
   await r.put('partners','private_partner',{id:'private_partner',email:'private@example.test',account_id:'acct_private'});
   await r.put('audit','private_audit',{id:'private_audit',actor:'user_private',target:'private_target',action:'private.action',at:new Date().toISOString()});
  });
  await guest('/session');
  assert.equal((await guest('/admin/operators/lookup',{email:'target@example.test'})).status,401);
  await signIn(admin,'admin@example.test');
  await signIn(target,'target@example.test');
  await signIn(compliance,'compliance@example.test');
  assert.equal((await guest('/admin/deletions')).status,401);
  assert.equal((await compliance('/admin/deletions')).status,200);
  assert.equal((await target('/admin/deletions')).status,403);
  assert.equal((await guest('/admin/subscription-webhooks')).status,401);
  assert.equal((await compliance('/admin/subscription-webhooks')).status,200);
  assert.equal((await target('/admin/subscription-webhooks')).status,403);
  assert.equal((await guest('/admin/support-metrics')).status,401);
  const supportMetrics=await compliance('/admin/support-metrics');assert.equal(supportMetrics.status,200);assert.equal(supportMetrics.data.total_requests,1);assert.equal(supportMetrics.data.request_types.portal_help,1);assert(!JSON.stringify(supportMetrics.data).includes('Private support text'));assert(!JSON.stringify(supportMetrics.data).includes('private@example.test'));
  assert.equal((await target('/admin/support-metrics')).status,403);
  assert.equal((await guest('/admin/referral-metrics')).status,401);
  const referralMetrics=await compliance('/admin/referral-metrics');assert.equal(referralMetrics.status,200);assert.equal(referralMetrics.data.commercial_agreements,'pending');assert(!JSON.stringify(referralMetrics.data).includes('Private support text'));assert(!JSON.stringify(referralMetrics.data).includes('private@example.test'));
  assert.equal((await target('/admin/referral-metrics')).status,403);
  assert.equal((await compliance('/admin/operators/lookup',{email:'target@example.test'})).status,403);
  assert.equal((await compliance('/admin/operators/roles',{id:'target',email:'target@example.test',roles:['viewer'],expected_roles:[],expected_revision:0,confirm:true})).status,403);
  assert.equal((await admin('/admin/operators/lookup',{email:'target@example.test'},{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await admin('/admin/operators/lookup',{email:'target@example.test'},{origin:'https://wrong.example'})).status,403);
  assert.equal((await admin('/admin/operators/lookup',{email:'missing@example.test'})).status,404);
  assert.equal((await admin('/admin/operators/lookup',{email:'admin@example.test'})).status,409);
  const found=await admin('/admin/operators/lookup',{email:'target@example.test'});
  assert.equal(found.status,200);
  assert.deepEqual(found.data.account,{id:'target',email:'target@example.test',roles:[],revision:0});
  const change={id:'target',email:'target@example.test',roles:['viewer'],expected_roles:[],expected_revision:0,confirm:true};
  assert.equal((await admin('/admin/operators/roles',{...change,confirm:false})).status,400);
  assert.equal((await admin('/admin/operators/roles',{...change,roles:['superadmin','not_a_role']})).status,400);
  assert.equal((await admin('/admin/operators/roles',{...change,roles:['viewer','viewer']})).status,400);
  assert.equal((await admin('/admin/operators/roles',{...change,id:'admin',email:'admin@example.test'})).status,409);
  assert.equal((await admin('/admin/operators/roles',{...change,email:'wrong@example.test'})).status,404);
  const saved=await admin('/admin/operators/roles',change);
  assert.equal(saved.status,200,JSON.stringify(saved));
  assert.deepEqual(saved.data.account.roles,['viewer']);
  assert.equal(saved.data.account.revision,1);
  const viewerAdmin=await target('/admin');assert.equal(viewerAdmin.status,200,'existing target session picks up new roles');assert.deepEqual(viewerAdmin.data.tickets,[]);assert.deepEqual(viewerAdmin.data.orders,[]);assert.deepEqual(viewerAdmin.data.partners,[]);assert(!JSON.stringify(viewerAdmin.data).includes('private@example.test'));assert(!JSON.stringify(viewerAdmin.data).includes('user_private'));const safeAudit=viewerAdmin.data.audit.find(entry=>entry.id==='private_audit');assert.deepEqual(safeAudit,{id:'private_audit',action:'private.action',at:safeAudit.at});
  assert.equal((await admin('/admin/operators/roles',{...change,roles:[]})).status,409,'stale revision cannot overwrite roles');
  assert.equal((await admin('/admin/operators/roles',{...change,expected_roles:['viewer'],expected_revision:1})).status,409,'unchanged role sets are rejected');
  await db.tx(async r=>{const account=await r.get('accounts','target');await r.put('accounts','target',{...account,roles:['compliance']});});
  assert.equal((await admin('/admin/operators/roles',{...change,roles:[],expected_roles:['viewer'],expected_revision:1})).status,409,'out-of-band changes are detected even without a revision bump');
  await db.tx(async r=>{const account=await r.get('accounts','target');await r.put('accounts','target',{...account,roles:['viewer']});});
  assert.equal((await admin('/admin/operators/roles',{...change,roles:[],expected_roles:['viewer'],expected_revision:1})).status,200);
  assert.equal((await target('/admin')).status,403,'removed role takes effect on the next request');
  const changes=await db.tx(r=>r.list('operator_role_changes'));
  assert.equal(changes.length,2);
  const grant=changes.find(entry=>entry.next_roles.includes('viewer'));
  assert.deepEqual(grant.previous_roles,[]);
  assert.deepEqual(grant.next_roles,['viewer']);
  assert.equal(grant.operator_id,'admin');
  const audits=await db.tx(r=>r.list('audit'));
  assert.equal(audits.filter(entry=>entry.action==='operator.roles_changed'&&entry.target==='target').length,2);
  await db.tx(r=>r.put('accounts','duplicate',{id:'duplicate',email:'target@example.test',roles:[]}));
  assert.equal((await admin('/admin/operators/lookup',{email:'target@example.test'})).status,409);
  console.log('Operator role lookup, authorization, CSRF/origin, revision, live revocation and audit passed.');
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
