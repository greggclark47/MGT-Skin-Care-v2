const assert=require('node:assert/strict');
const {createPortal}=require('../dist/portal/server');
const {LocalStore}=require('../dist/portal/store');

(async()=>{
 const store=new LocalStore(':memory:');
 store.kind='postgres';
 const app=await createPortal({store,env:{NODE_ENV:'production',DEMO_MODE:'false',PUBLIC_ORIGIN:'https://portal.example',WORKER_READINESS_MAX_AGE_SECONDS:'300',OLLAMA_ENABLED:'false'}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 try{
  let response=await fetch(url+'/readyz');assert.equal(response.status,503);let body=await response.json();
  assert.deepEqual(body.operations.issues,['operations_worker_stale','backup_unhealthy']);
  assert.equal((await fetch(url+'/healthz')).status,200);
  const current=Date.now();
  await store.tx(async records=>{
   await records.put('operations','backup_health',{status:'healthy',last_success_at:new Date(current-60000).toISOString()});
   await records.put('operation_runs','latest',{completed_at:new Date(current-30000).toISOString()});
  });
  response=await fetch(url+'/readyz');assert.equal(response.status,200);body=await response.json();
  assert.equal(body.operations.healthy,true);
  await store.tx(records=>records.put('operation_runs','latest',{completed_at:new Date(current-600000).toISOString()}));
  response=await fetch(url+'/readyz');assert.equal(response.status,503);
  assert((await response.json()).operations.issues.includes('operations_worker_stale'));
  console.log('Production liveness and operational readiness checks passed.');
 }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
