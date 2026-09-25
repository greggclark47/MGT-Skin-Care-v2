const assert=require('node:assert/strict');
const {hub,resetSession}=require('../../.smoke-build/lib/hub');
global.window=new EventTarget();let changes=0;window.addEventListener('hub:changed',()=>changes++);
let queue=[],calls=[];global.fetch=async(url,options)=>{calls.push({url,options});const next=queue.shift();if(next instanceof Error)throw next;if(!next)throw Error('Unexpected request');return next;};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
(async()=>{
 resetSession();queue=[json({csrf:'first'}),json({cart:{items:[]}})];await hub('/cart');assert.equal(calls.length,2);
 queue=[json({saved:true})];await hub('/cart',{quantity:1});assert.equal(calls.at(-1).options.headers['x-csrf-token'],'first');assert.equal(changes,1);
 queue=[json({error:{code:'csrf_rejected',message:'Refresh this page'}},403)];await assert.rejects(hub('/cart',{quantity:2}),/Refresh this page/);
 queue=[json({csrf:'fresh'}),json({saved:true})];await hub('/cart',{quantity:2});assert.equal(calls.at(-1).options.headers['x-csrf-token'],'fresh');
 queue=[new Response('<html>unavailable</html>',{status:502})];await assert.rejects(hub('/profile'),/temporarily unavailable/);
 const count=calls.length;queue=[new Error('offline')];await assert.rejects(hub('/support',{message:'test'}),/Check whether your change was saved/);assert.equal(calls.length,count+1,'Do not automatically repeat an uncertain write');
 console.log('Client recovery checks passed: session renewal, mutation notification, non-JSON outages and no automatic write retries.');
})().catch(e=>{console.error(e);process.exitCode=1;});

