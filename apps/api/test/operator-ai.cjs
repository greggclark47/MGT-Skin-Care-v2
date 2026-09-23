const assert=require('node:assert/strict');
const {createPortal}=require('../dist/portal/server');
const {LocalStore}=require('../dist/portal/store');
const {AiGateway,NoopLogSink}=require('../../../packages/ai-gateway/dist');
const {StoreBudgetStore}=require('../dist/portal/ai');

(async()=>{
 const db=new LocalStore(':memory:');
 let calls=0;
 const log=new NoopLogSink();
 const gateway=new AiGateway({logSink:log,adapters:{openai:{name:'openai',async complete(config){
  calls++;
  return {text:JSON.stringify({analysis:'Review the migration order.',risks:['A stale schema may block startup.'],recommendations:['Run staging checks.']}),
   provider:'openai',model:config.model,input_tokens:100,output_tokens:120};
 }}}});
 const app=await createPortal({store:db,analysisGateway:gateway,env:{NODE_ENV:'test',DEMO_MODE:'true',PUBLIC_ORIGIN:'http://localhost:3000'}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/api/hub';
 let cookie='',csrf='';
 async function request(path,body,headers={}){
  const res=await fetch(url+path,{method:body?'POST':'GET',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json','x-csrf-token':csrf,...headers},body:body?JSON.stringify(body):undefined});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  const data=await res.json();if(data.csrf)csrf=data.csrf;return {status:res.status,data};
 }
 try{
  await request('/session');
  const body={question:'How should we sequence the portal database migration?',ai_consent:true};
  assert.equal((await request('/admin/ai/analyze',body)).status,401);
  assert.equal((await request('/admin/ai/reservations')).status,401);
  await db.tx(async r=>{
   const account={id:'operator',email:'operator@example.test',roles:['superadmin']};
   await r.put('accounts',account.id,account);
   for(const session of await r.entries('sessions'))await r.put('sessions',session.id,{...session.value,userId:account.id});
  });
  assert.equal((await request('/admin/ai/analyze',body,{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await request('/admin/ai/analyze',{...body,ai_consent:false})).status,400);
  assert.equal((await request('/admin/ai/analyze',{...body,question:'Can you diagnose a rash?'})).status,400);
  const result=await request('/admin/ai/analyze',body);
  assert.equal(result.status,200,JSON.stringify(result));
  assert.equal('model' in result.data,false);
  assert.equal(result.data.analysis.recommendations[0],'Run staging checks.');
  assert.ok(result.data.cost_cents>0);
  await request('/admin/ai/analyze',body);
  await request('/admin/ai/analyze',body);
  assert.equal((await request('/admin/ai/analyze',body)).status,429);
  assert.equal(calls,3);
  assert.equal(log.entries.filter(x=>x.task_type==='operator_analysis').length,3);
  const budget=new StoreBudgetStore(db);
  const reservation=await budget.reserve('other-account','tier1_copy',5,25);
  await db.tx(async r=>{const hold=await r.get('ai_budget_reservations',reservation);await r.put('ai_budget_reservations',reservation,{...hold,created_at:new Date(Date.now()-660000).toISOString()});});
  const before=await request('/admin/ai/reservations');
  assert.equal(before.data.pending.some(row=>row.id===reservation),true);
  assert.deepEqual(before.data.recent,[]);
 assert.equal((await request('/admin/ai/reservations/reconcile',{id:reservation,actual_cents:0,billing_reference:'billing-check-001'})).status,400);
 assert.equal((await request('/admin/ai/reservations/reconcile',{id:reservation,actual_cents:0,billing_reference:'billing-check-001',confirm:true})).status,400);
  await db.tx(async r=>{const account=await r.get('accounts','operator');await r.put('accounts','operator',{...account,roles:['compliance']});});
  assert.equal((await request('/admin/ai/reservations')).status,200);
 assert.equal((await request('/admin/ai/reservations/reconcile',{id:reservation,actual_cents:2,billing_reference:'billing-check-001',confirm:true})).status,403);
  await db.tx(async r=>{const account=await r.get('accounts','operator');await r.put('accounts','operator',{...account,roles:['superadmin']});});
 assert.equal((await request('/admin/ai/reservations/reconcile',{id:reservation,actual_cents:2,billing_reference:'billing-check-001',confirm:true})).status,200);
 assert.equal((await request('/admin/ai/reservations/reconcile',{id:reservation,actual_cents:0,billing_reference:'billing-check-001',confirm:true,confirmed_no_charge:true})).status,409);
  assert.equal((await budget.spentToday('other-account','tier1_copy')),2);
  const after=await request('/admin/ai/reservations');
  assert.equal(after.data.pending.some(row=>row.id===reservation),false);
  assert.equal(after.data.recent.length,1);
 assert.deepEqual({...after.data.recent[0],reconciled_at:undefined},{id:reservation,budget_key:before.data.pending.find(row=>row.id===reservation).budget_key,reserved_cents:5,actual_cents:2,operator_id:'operator',billing_reference:'billing-check-001',reconciled_at:undefined});
  await db.tx(async r=>{const account=await r.get('accounts','operator');await r.put('accounts','operator',{...account,roles:['compliance']});});
  assert.equal((await request('/admin/ai/reservations')).data.recent[0].id,reservation);
  console.log('Operator analysis auth, consent, scope, CSRF, neutral output, budget and daily rate passed.');
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
