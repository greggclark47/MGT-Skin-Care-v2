const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {createPortal}=require('../dist/portal/server');
const {LocalStore}=require('../dist/portal/store');
const {SafeCoach}=require('../dist/portal/ai');

const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'assistant-policy-cases.json'),'utf8'));

test('assistant candidate policy cases stay bounded before model and payment routing',async()=>{
 assert.equal(fixture.review_status,'engineering_candidate_sme_review_pending');
 assert.equal(new Set(fixture.cases.map(item=>item.id)).size,fixture.cases.length);
 const db=new LocalStore(':memory:');let modelCalls=0,paymentCalls=0;
 const quote='A moisturizer helps support the skin barrier and retain moisture.';
 const provider={name:'fixture',model:'fixture',call:async(_system,prompt)=>{
  modelCalls++;
  const input=JSON.parse(prompt);
  assert(input.documents.length<=8);
  if(input.question.includes('bad quote'))return JSON.stringify({excerpts:[{knowledge_id:'moisturizer_approved',quote:'An invented treatment claim that was never reviewed.'}]});
  return JSON.stringify({excerpts:[{knowledge_id:'moisturizer_approved',quote}]});
 }};
 const stripe=new Proxy({}, {get(){paymentCalls++;throw Error('A payment provider must not be called by assistant guidance.');}});
 const app=await createPortal({store:db,coach:new SafeCoach([provider]),stripe,env:{NODE_ENV:'test',DEMO_MODE:'true',PUBLIC_ORIGIN:'http://localhost:3000'}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let cookie='',csrf='';
 async function call(path,body){
  const response=await fetch(origin+'/api/hub'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const data=await response.json();if(data.csrf)csrf=data.csrf;
  return {status:response.status,data};
 }
 try{
  assert.equal((await call('/session')).status,200);
  for(const item of fixture.cases){
   const result=await call('/assistant',{role:item.role,message:item.message,ai_consent:false});
   assert.equal(result.status,200,item.id+': '+JSON.stringify(result.data));
   assert.equal(result.data.role,item.role,item.id);
   assert.equal(result.data.kind,item.kind,item.id);
   assert.equal(result.data.category,item.category,item.id);
   assert.equal(result.data.next_step?.path??null,item.path,item.id);
   if(item.contains)assert(result.data.text.includes(item.contains),item.id);
   assert.deepEqual(result.data.citations,[],item.id);
   assert.equal(modelCalls,0,item.id+' reached the model');
   assert.equal(paymentCalls,0,item.id+' reached payments');
  }
  assert.equal((await call('/assistant',{role:'routine_guidance',message:'What does a moisturizer do?',ai_consent:true})).status,401);
  await db.tx(async r=>{
   const user={id:'assistant-review-user',email:'assistant-review@example.test',roles:[]};
   await r.put('accounts',user.id,user);
   for(const session of await r.entries('sessions'))await r.put('sessions',session.id,{...session.value,userId:user.id});
  });
  const withoutConsent=await call('/assistant',{role:'routine_guidance',message:'What does a moisturizer do?',ai_consent:false});
  assert.equal(withoutConsent.status,400);assert.equal(withoutConsent.data.error.code,'ai_consent');
  const unavailable=await call('/assistant',{role:'routine_guidance',message:'What does a moisturizer do?',ai_consent:true});
  assert.equal(unavailable.status,200);assert.equal(unavailable.data.category,'reviewed_unavailable');assert.equal(unavailable.data.next_step.path,'/support');assert.equal(modelCalls,0);
  await db.tx(r=>r.put('knowledge','moisturizer_approved',{id:'moisturizer_approved',title:'Moisturizer',body:quote,source_url:'https://example.test/reviewed',status:'approved',approved_by:'fixture-reviewer',version:1}));
  const noMatch=await call('/assistant',{role:'product_referral',message:'What is azelaic acid?',ai_consent:true});
  assert.equal(noMatch.status,200);assert.equal(noMatch.data.kind,'no_match');assert.equal(noMatch.data.next_step.path,'/support');assert.equal(modelCalls,0);
  const reviewed=await call('/assistant',{role:'routine_guidance',message:'What does a moisturizer do?',ai_consent:true});
  assert.equal(reviewed.status,200);assert.equal(reviewed.data.kind,'reviewed_excerpts');assert.equal(reviewed.data.citations[0].text,quote);assert.equal(modelCalls,1);
  const rejected=await call('/assistant',{role:'routine_guidance',message:'Give me a moisturizer bad quote',ai_consent:true});
  assert.equal(rejected.status,200);assert.equal(rejected.data.category,'reviewed_unavailable');assert.equal(rejected.data.next_step.path,'/support');assert.equal(modelCalls,2);
  assert.equal(paymentCalls,0);
  assert.equal((await call('/support')).data.tickets.length,0);
  assert(!JSON.stringify(rejected.data).includes('invented treatment claim'));
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
});
