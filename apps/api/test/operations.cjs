const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {LocalStore}=require('../dist/portal/store.js');
const {OperationalWorker,InAppNotificationDelivery,operationalReadiness,writeWorkerHeartbeat}=require('../dist/portal/operations.js');

(async()=>{
 const store=new LocalStore(':memory:');
 const at=Date.parse('2026-09-12T12:00:00.000Z');
 await store.tx(async records=>{
  await records.put('sessions','expired',{expires:at-1});
  await records.put('sessions','active',{expires:at+86400000});
  await records.put('rate','expired',{reset:at-1});
  await records.put('profile_merge_pending','guest_expired',{account_id:'other',guest_actor:'guest_expired',expires_at:new Date(at-1).toISOString()});
  await records.put('ai_routing_log','old',{at:'2026-07-01T00:00:00.000Z'});
  await records.put('ai_routing_log','recent',{at:'2026-09-11T00:00:00.000Z'});
  await records.put('deletion_completions','old_proof',{completed_at:'2024-01-01T00:00:00.000Z'});
  await records.put('subscription_webhook_receipts','old_receipt',{last_received_at:'2024-01-01T00:00:00.000Z'});
 await records.put('reminders','user_1',[{product_id:'cleanser',due_at:'2026-09-12T11:00:00.000Z',paused:false},{product_id:'serum',due_at:'2026-09-13T11:00:00.000Z',paused:false}]);
 await records.put('backup_status','latest',{completed_at:'2026-09-12T10:00:00.000Z',location_identifier:'encrypted-offsite',checksum:'abc'});
  await records.put('accounts','erase_me',{id:'erase_me',email:'erase@example.test',roles:[]});
  await records.put('profiles','user_erase_me',{input:{skin_type:'dry'}});
  await records.put('sessions','erase_session',{actor:'user_erase_me',userId:'erase_me',expires:at+86400000});
  await records.put('tickets','erase_ticket',{id:'erase_ticket',actor:'user_erase_me',email:'erase@example.test',status:'open'});
  await records.put('orders','erase_order',{id:'erase_order',actor:'user_erase_me',email:'erase@example.test',status:'fulfilled'});
  await records.put('audit','erase_audit',{id:'erase_audit',actor:'user_erase_me',action:'profile.saved',target:'self',at:'2026-09-01T00:00:00.000Z'});
  await records.put('deletion_requests','user_erase_me',{request_id:'request_erase',actor:'user_erase_me',user_id:'erase_me',requested_at:'2026-08-01T00:00:00.000Z',not_before:'2026-09-01T00:00:00.000Z',status:'pending'});
  await records.put('accounts','blocked',{id:'blocked',email:'blocked@example.test',roles:[]});
  await records.put('subscriptions','user_blocked:consumer',{customer_id:'cus_blocked',subscription_id:'sub_blocked',status:'active'});
  await records.put('deletion_requests','user_blocked',{request_id:'request_blocked',actor:'user_blocked',user_id:'blocked',requested_at:'2026-08-01T00:00:00.000Z',not_before:'2026-09-01T00:00:00.000Z',status:'pending'});
 });
 const identities=[];
 const worker=new OperationalWorker(store,{env:{BACKUP_MAX_AGE_HOURS:'26'},delivery:new InAppNotificationDelivery(),identityDeletion:{kind:'test',remove:async id=>identities.push(id)}});
 const result=await worker.runOnce(at);
 assert.equal(result.created,1);assert.equal(result.delivered,1);assert.equal(result.backup_status,'healthy');
 assert.equal(result.deletions_completed,1);assert.equal(result.deletions_blocked,1);assert.deepEqual(identities,['erase_me']);
 await store.tx(async records=>{
  assert.equal(await records.get('sessions','expired'),undefined);
  assert.ok(await records.get('sessions','active'));
  assert.equal(await records.get('rate','expired'),undefined);
  assert.equal(await records.get('profile_merge_pending','guest_expired'),undefined);
  assert.equal(await records.get('ai_routing_log','old'),undefined);
  assert.ok(await records.get('ai_routing_log','recent'));
  assert.equal(await records.get('deletion_completions','old_proof'),undefined);
  assert.equal(await records.get('subscription_webhook_receipts','old_receipt'),undefined);
  const reminders=await records.get('reminders','user_1');assert.ok(reminders[0].notification_id);
  const notifications=await records.entries('notifications');assert.equal(notifications.length,1);assert.equal(notifications[0].value.status,'delivered');
  assert.equal(await records.get('accounts','erase_me'),undefined);assert.equal(await records.get('profiles','user_erase_me'),undefined);assert.equal(await records.get('sessions','erase_session'),undefined);assert.equal(await records.get('tickets','erase_ticket'),undefined);
  assert.equal((await records.get('orders','erase_order')).email,null);assert.match((await records.get('orders','erase_order')).actor,/^deleted_/);
  assert.match((await records.get('audit','erase_audit')).actor,/^deleted_/);assert.ok(await records.get('deletion_completions','request_erase'));
  assert((await records.get('deletion_requests','user_blocked')).blocked_reasons.includes('active_consumer_subscription'));
 });
 const next=await worker.runOnce(at+60000);assert.equal(next.created,0);assert.equal(next.delivered,0);assert.equal(next.deletions_completed,0);assert.equal(next.deletions_blocked,1);
 const healthy=operationalReadiness(
  {status:'healthy',last_success_at:new Date(at-3600000).toISOString()},
  [{id:'newer',value:{completed_at:new Date(at-60000).toISOString()}},{id:'older',value:{completed_at:new Date(at-120000).toISOString()}}],
  at,300000);
 assert.equal(healthy.healthy,true);assert.equal(healthy.last_run.completed_at,new Date(at-60000).toISOString());
 assert.deepEqual(operationalReadiness({status:'stale',last_success_at:new Date(at-3600000).toISOString()},[],at).issues,
  ['operations_worker_stale','backup_unhealthy']);
 assert.equal(operationalReadiness({status:'healthy',last_success_at:new Date(at+60000).toISOString()},
  [{id:'future',value:{completed_at:new Date(at+60000).toISOString()}}],at).healthy,false);
 const heartbeatFile=path.resolve('tmp','worker-heartbeat-test.json');
 await fs.mkdir(path.dirname(heartbeatFile),{recursive:true});
 await writeWorkerHeartbeat(heartbeatFile,{run_id:'test'});
 assert.equal(JSON.parse(await fs.readFile(heartbeatFile,'utf8')).result.run_id,'test');
 await fs.unlink(heartbeatFile);
 await store.close();console.log('operations smoke passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
