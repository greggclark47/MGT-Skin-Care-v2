import assert from 'node:assert/strict';
import {AiGateway} from '../router';
import {InMemoryBudgetStore} from '../budget';
import type {ProviderAdapter} from '../adapters';

async function main(){
 let calls=0;
 const adapter:ProviderAdapter={name:'openai',async complete(config){calls++;return {text:'{"blurb":"Reviewed copy"}',provider:'openai',model:config.model,input_tokens:100,output_tokens:50};}};
 const request={task_type:'product_why' as const,user_id:'account',system_prompt:'s',user_prompt:'u'};
 const gateway=new AiGateway({adapters:{openai:adapter}});
 assert.equal((await gateway.execute(request)).ok,false);
 assert.equal(calls,0,'A free request cannot escalate to hosted inference');
 assert.equal((await gateway.execute({...request,user_id:null,has_premium_entitlement:true})).ok,false);
 assert.equal(calls,0,'Anonymous callers cannot bypass accounting');
 assert.equal((await gateway.execute({...request,has_premium_entitlement:true})).ok,true);
 assert.equal(calls,1);
 const brokenLog=new AiGateway({adapters:{openai:adapter},logSink:{async write(){throw Error('log unavailable');}}});
 await assert.rejects(brokenLog.execute({...request,has_premium_entitlement:true}),/log unavailable/);
 assert.equal(calls,2,'Logging failure must not replay paid inference');
 const brokenBudget=new InMemoryBudgetStore();
 brokenBudget.settle=async()=>{throw Error('accounting unavailable');};
 const brokenAccounting=new AiGateway({adapters:{openai:adapter},budgetStore:brokenBudget});
 await assert.rejects(brokenAccounting.execute({...request,has_premium_entitlement:true}),/accounting unavailable/);
 assert.equal(calls,3,'Accounting failure must not replay paid inference');
 let release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 let entered!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const concurrentStore=new InMemoryBudgetStore();
 let concurrentCalls=0;
 const concurrent=new AiGateway({budgetStore:concurrentStore,
  budgetCaps:{per_user_daily_cents:{tier1_copy:5,tier2_vision:5,tier3_premium:5,embedding:5}},
  adapters:{openai:{name:'openai',async complete(config){concurrentCalls++;entered();await pending;return adapter.complete(config,'','',new AbortController().signal);}}}});
 const inFlight=concurrent.execute({...request,has_premium_entitlement:true});
 await started;
 assert.equal((await concurrent.execute({...request,has_premium_entitlement:true})).failure_reason,'budget_exceeded');
 assert.equal(concurrentCalls,1);
 release();assert.equal((await inFlight).ok,true);
 const uncertainStore=new InMemoryBudgetStore();
 const uncertain=new AiGateway({budgetStore:uncertainStore,adapters:{openai:{name:'openai',async complete(){throw Error('unknown billing');}}}});
 await uncertain.execute({...request,has_premium_entitlement:true});
 assert.ok(await uncertainStore.spentToday('account','tier1_copy')>0,'unknown failures retain their reservations');
 console.log('Release controls passed: entitlement, accounting replay prevention, concurrent admission and uncertain billing holds.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
