// Production web -> same-origin proxy -> API -> SQLite journey v1.2.
// Auth is a fixed test double. This never loads .env or connects to production.
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const next=require(path.join(root,'apps/web/node_modules/next'));
const {createPortal}=require(path.join(root,'apps/api/dist/portal/server'));
const {LocalStore}=require(path.join(root,'apps/api/dist/portal/store'));
async function listen(server,port){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
async function close(server){if(!server?.listening)return;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
async function main(){
 const store=new LocalStore(':memory:');let apiServer,webServer,web;
 try{
  // The existing compiled rewrite targets this local port. Never terminate an existing listener.
  const webOrigin='http://127.0.0.1:4320';
  const app=await createPortal({store,env:{NODE_ENV:'test',DEMO_MODE:'true',PUBLIC_ORIGIN:webOrigin},verifyOtp:async email=>({id:'journey-user',email})});
  apiServer=http.createServer(app);await listen(apiServer,3100);
  web=next({dev:false,dir:path.join(root,'apps/web'),hostname:'127.0.0.1',port:4320});await web.prepare();
  webServer=http.createServer(web.getRequestHandler());await listen(webServer,4320);
  let cookie='',csrf='';
  async function call(route,body){const response=await fetch(webOrigin+route,{method:body===undefined?'GET':'POST',headers:{cookie,origin:webOrigin,'content-type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return{status:response.status,data};}
  const browserRoutes=['/','/account','/skin-match','/skin-match/results','/my-skin','/routine','/coach','/shop','/saved','/replenishment','/membership','/subscription','/orders','/support','/learn','/company','/trust','/privacy','/terms','/shipping','/partners','/studio','/studio/personal-color','/studio/makeup','/studio/haircare','/studio/hair-color','/studio/style','/studio/clothing','/admin'];
  for(const route of browserRoutes){const response=await fetch(webOrigin+route);assert.equal(response.status,200,route);const html=await response.text();assert.match(html,/<html/);assert.match(html,/mgt-mark\.svg/,route+' shared logo');assert.match(html,/id="main"/,route+' main landmark');console.log('PASS production page '+route);}
  assert.equal((await call('/api/hub/session')).status,200);
  assert.equal((await call('/api/v1/subscriptions')).status,401);
  assert.equal((await call('/api/hub/auth/verify',{email:'journey@test.invalid',code:'123456'})).status,200);await call('/api/hub/session');
  const input={skin_type:'dry',concerns:['hydration'],sensitivity:'none',age_band:'26_35',current_routine:'basic',desired_outcome:'glow',budget_range:'between_25_50',ingredient_avoidances:[],consent:true};
  const created=await call('/api/hub/profile',input);assert.equal(created.status,200);
  assert.deepEqual((await call('/api/hub/profile')).data,created.data);
  const updated=await call('/api/hub/profile',{...input,skin_type:'oily',expected_revision:created.data.revision});assert.equal(updated.status,200);
  assert.equal((await call('/api/hub/profile',{...input,expected_revision:created.data.revision})).status,409);
  assert.deepEqual((await call('/api/hub/account/export')).data.profile,updated.data.profile);
  assert.equal((await call('/api/v1/subscriptions')).status,200);
  const retailers=(await call('/api/hub/retailers')).data.retailers;assert.equal((await call('/api/hub/saved-retailers',{id:retailers[0].id,saved:true})).status,200);
  assert((await call('/api/hub/saved-retailers')).data.ids.includes(retailers[0].id));
  assert.equal((await call('/api/hub/profile/remove',{confirm:true,expected_revision:updated.data.revision})).status,200);
  assert.equal((await call('/api/hub/profile')).data.profile,null);
  console.log('PASS production web proxy: auth, CSRF cookie forwarding, profile create/read/update/delete, stale edit rejection, export consistency, subscription reads, saved retailer');
 }finally{await close(webServer);await web?.close();await close(apiServer);await store.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
