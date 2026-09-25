const assert=require('node:assert/strict');
const {createPortal}=require('../dist/portal/server');
const {LocalStore}=require('../dist/portal/store');
const {DEFAULT_STYLE,STYLE_SECTIONS,stylePlan}=require('@mgt/domain');
(async()=>{
 const db=new LocalStore(':memory:');
 const app=await createPortal({store:db,env:{NODE_ENV:'test',DEMO_MODE:'true',PUBLIC_ORIGIN:'http://localhost:3000'},verifyOtp:async email=>({id:'style-user',email})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 function client(){let cookie='',csrf='';return async(path,body,headers={})=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/hub'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json','x-csrf-token':csrf,...headers},body:body===undefined?undefined:JSON.stringify(body)});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];const data=await res.json();if(data.csrf)csrf=data.csrf;return {status:res.status,data};};}
 try{
  const a=client(),b=client();await a('/session');await b('/session');
  assert.equal((await a('/style-profile')).data.profile,null);
  const preferences={...DEFAULT_STYLE,palette:'cool',texture:'coily',occasion:'work',consent:true};
  assert.equal((await a('/style-profile',preferences,{'x-csrf-token':'bad'})).status,403);
  assert.equal((await a('/style-profile',preferences,{origin:'https://wrong.example'})).status,403);
  assert.equal((await a('/style-profile',{...preferences,consent:false})).status,400);
  assert.equal((await a('/style-profile',{...preferences,palette:'invented'})).status,400);
  assert.equal((await a('/style-profile',preferences)).status,200);
  assert.equal((await b('/style-profile')).data.profile,null);
  const saved=(await a('/style-profile')).data.profile;
  assert.equal(saved.input.palette,'cool');assert.equal(saved.input.texture,'coily');assert(!('consent' in saved.input));
  assert.equal((await a('/style-profile',{...preferences,texture:null})).status,400);
  assert.deepEqual((await a('/style-profile')).data.profile,saved);
  assert.equal((await a('/account/export')).status,401);
  assert.equal((await a('/auth/verify',{email:'style@example.com',code:'123456'})).status,200);await a('/session');
  assert.deepEqual((await a('/style-profile')).data.profile,saved);
  assert.deepEqual((await a('/account/export')).data.style_profile,saved);
  assert.equal((await db.tx(r=>r.list('style_profiles'))).length,1,'Guest profile migrates without a duplicate');
  await b('/style-profile',{...preferences,palette:'warm'});
  const conflict=await b('/auth/verify',{email:'style@example.com',code:'123456'});assert.equal(conflict.status,409);assert.equal(conflict.data.error.code,'profile_merge_conflict');await b('/session');
  assert.equal((await b('/style-profile')).data.profile.input.palette,'warm','Guest preferences survive a conflicting sign-in');
  assert.equal((await a('/style-profile')).data.profile.input.palette,'cool','Existing account preferences remain unchanged');
  const cool=stylePlan(preferences),warm=stylePlan({...preferences,palette:'warm'});
  for(const section of STYLE_SECTIONS){assert(cool.cards[section.id].length>=3);}
  assert.notDeepEqual(cool.cards.makeup,warm.cards.makeup);assert.notDeepEqual(cool.cards.clothing,warm.cards.clothing);
  assert.notDeepEqual(cool.cards.haircare,stylePlan({...preferences,texture:'straight'}).cards.haircare);
  assert.notDeepEqual(cool.cards['hair-color'],stylePlan({...preferences,hairGoal:'statement change'}).cards['hair-color']);
  assert.notDeepEqual(cool.cards.style,stylePlan({...preferences,contrast:'bold'}).cards.style);
  const inclusive={...preferences,makeup:'no makeup',hairPresentation:'shaved or no hair',clothing:'my own garments',coverage:'covered arms, legs and neckline',headwear:'include my headwear',fastening:'easy fastenings',comfort:'seated comfort',sensory:'simple textures and fewer accessories',climate:'warm weather',personalNotes:'Keep my sari · حجاب · 私のスタイル'};
  assert.equal((await a('/style-profile',inclusive)).status,200);
  assert.equal((await a('/style-profile')).data.profile.input.personalNotes,inclusive.personalNotes);
  assert.equal((await a('/account/export')).data.style_profile.input.coverage,inclusive.coverage);
  assert.equal((await a('/style-profile',{...inclusive,personalNotes:'x'.repeat(501)})).status,400);
  assert.equal((await a('/style-profile',{...inclusive,coverage:'invented'})).status,400);
  const adapted=stylePlan(inclusive);
  assert.equal(adapted.cards.makeup.length,1);assert.match(adapted.cards.makeup[0].text,/No makeup steps/);
  assert.match(adapted.cards['hair-color'][0].text,/turned off/);
  assert(!JSON.stringify(adapted.cards.style).includes('Keep your current color'));
  assert(!JSON.stringify(adapted.cards.clothing).includes('trousers'));
  assert(adapted.cards.clothing.some(c=>c.title==='Dressing ease'));
  assert(adapted.cards.clothing.some(c=>c.text.includes('while seated')));
  assert(adapted.cards.clothing.some(c=>c.text===inclusive.personalNotes));
  assert(!adapted.cards.clothing.some(c=>c.title==='The finishing detail'));
  for(const hairPresentation of ['locs','braids or twists','wig or hairpiece','covered hair','skip hair suggestions'])assert(!JSON.stringify(stylePlan({...inclusive,hairPresentation})).includes('undefined'));
  // Records saved before the broader attributes were introduced remain readable.
  const legacy={palette:'cool',contrast:'soft',occasion:'work',expression:'minimal',texture:'coily',effort:'quick',hairGoal:'keep my color'};
  await db.tx(r=>r.put('style_profiles','user_style-user',{input:legacy,updated_at:'2026-09-07'}));
  const restored=(await a('/style-profile')).data.profile.input;
  assert.equal(restored.texture,'coily');assert.equal(restored.coverage,'not specified');assert.equal(restored.personalNotes,'');
  assert.equal((await a('/style-profile',{...legacy,consent:true})).status,200);
  console.log('Style checks passed: profile isolation, consent, migration, multilingual notes, legacy compatibility, preference overrides and comfort options.');
 }finally{await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
