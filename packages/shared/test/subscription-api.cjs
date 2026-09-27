// Public client contract v1.2: injectable transport, neutral errors, and no identity header.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {SubscriptionApi}=require('../dist/subscription-api');
const id='ss_'+'a'.repeat(40),commandId='cmd_'+'b'.repeat(40);
const row={id,audience:'consumer',status:'active',current_period_end:null,cancel_at_period_end:false,platform_managed:false,can_cancel:true,can_resume:false,pending_command:null};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('subscription client: list/get/setRenewal/command validate responses and use cookie/CSRF transport',async()=>{
 const calls=[];const queue=[{subscriptions:[{...row,private_field:'never exported'}],entitlement:{premium:true,valid_until:null},enrollment_available:false},{subscription:row},{id:commandId,status:'pending_confirmation'},{id:commandId,status:'confirmed'}];
 const api=new SubscriptionApi('',async(url,options)=>{calls.push({url,options});return response(queue.shift());},async()=>'csrf_test');
 const list=await api.list();assert.equal(list.subscriptions[0].private_field,undefined);assert.deepEqual(await api.get(id),row);
 assert.equal((await api.setRenewal(id,true,'retry-reference')).status,'pending_confirmation');assert.equal((await api.command(commandId)).status,'confirmed');
 assert.equal(calls[2].options.headers['x-csrf-token'],'csrf_test');assert.equal(calls[2].options.headers['idempotency-key'],'retry-reference');assert.equal(calls[2].options.credentials,'same-origin');
 assert(calls.every(c=>!('x-user-id' in c.options.headers)));
});
test('subscription client: encoded paths, unknown errors, non-JSON failures, and malformed success never leak upstream details',async()=>{
 let path;const api=new SubscriptionApi('',async(url)=>{path=url;return response({subscription:row});});await api.get('a/b?c');assert(path.endsWith('a%2Fb%3Fc'));
 for(const getResponse of [()=>response({error:{code:'private_engine',message:'provider secret'}},502),()=>new Response('<secret>',{status:502}),()=>response({subscriptions:[{...row,status:'provider_name'}],entitlement:{premium:true,valid_until:null},enrollment_available:false})]){
  const client=new SubscriptionApi('',async()=>getResponse());await assert.rejects(client.list(),error=>!error.message.includes('secret')&&!error.message.includes('provider')&&error.name==='SubscriptionApiError');
 }
 const offline=new SubscriptionApi('',async()=>{throw Error('private network details');});await assert.rejects(offline.list(),error=>error.code==='connection_failed'&&!error.message.includes('private'));
});
