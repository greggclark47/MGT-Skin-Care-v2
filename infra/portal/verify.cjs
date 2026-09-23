// Local verification harness v1.6. Never connects to configured production services.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.join(root,'work/verification',stamp);fs.mkdirSync(out,{recursive:true});
const results=[];
async function run(name,cwd,args){
 const started=new Date().toISOString();
 const result=await new Promise(resolve=>{let stdout='',stderr='';const child=spawn(process.execPath,args,{cwd:path.join(root,cwd),timeout:120000,windowsHide:true,
  env:{...process.env,DATABASE_URL:'',SUPABASE_URL:'',SUPABASE_ANON_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',STRIPE_SECRET_KEY:'',OPENAI_API_KEY:'',OLLAMA_ENABLED:'false',OPENCLAW_ENABLED:'false',NODE_ENV:name==='web production build'?'production':'test',NEXT_TELEMETRY_DISABLED:'1'}});
  child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});child.once('error',error=>resolve({stdout,stderr,error,status:null}));child.once('close',status=>resolve({stdout,stderr,status}));});
 const output=(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:'');
 const log=name.replace(/[^a-z0-9-]/gi,'-')+'.log';fs.writeFileSync(path.join(out,log),output);
 const status=result.status===0&&!result.error?'PASSED':'FAILED';
 results.push({name,status,exit_code:result.status,started,log,command:[process.execPath,...args],cwd,output});
 console.log(status+' '+name+' ('+log+')');
 return status==='PASSED';
}
async function main(){
for(const folder of ['packages/domain','packages/ai-gateway','packages/shared','apps/api'])await run(folder+' build',folder,['node_modules/typescript/bin/tsc','-p','tsconfig.json']);
await run('web smoke compilation','apps/web',['node_modules/typescript/bin/tsc','-p','tsconfig.smoke.json']);
for(const file of ['render','admin-render','shop-state'])await run('web '+file,'apps/web',['.smoke-build/__smoke__/'+file+'.js']);
await run('web client recovery','apps/web',['src/__smoke__/hub-client.cjs']);
await run('domain deterministic pipeline','packages/domain',['dist/__smoke__/pipeline.js']);
for(const name of ['gateway','pricing'])await run('gateway '+name,'packages/ai-gateway',['dist/__smoke__/'+name+'.js']);
const tests=['apps/api/test','packages/shared/test','apps/mobile/test'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.cjs')).map(f=>dir+'/'+f));
await run('HTTP, persistence, and release-contract regressions','',['--test','--test-concurrency=1','--test-reporter=tap',...tests,'infra/portal/preflight.test.mjs','infra/portal/compose-contract.test.mjs','infra/portal/ci-contract.test.mjs','infra/db/migration-lineage.test.mjs']);
// Build uses only the server-side local API origin already in next.config.js; no service secrets.
const webBuilt=await run('web production build','apps/web',['node_modules/next/dist/bin/next','build']);
if(webBuilt)await run('production web proxy journey','',['infra/portal/production-journey.cjs']);
else results.push({name:'production web proxy journey',status:'UNTESTED',reason:'The required production build failed.'});
const staticBuilt=await run('root static build','',['infra/portal/build-static.cjs']);
const pattern=/gemini|sonnet|ollama|openai|deepseek|langchain|supabase|revenuecat|stripe|gpt-[0-9]|anthropic|claude/i;
function files(dir){return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(dir,item.name)):[path.join(dir,item.name)]):[];}
const artifactRoots=['apps/web/.next/static','dist'];
const hits=artifactRoots.flatMap(dir=>files(path.join(root,dir))).filter(f=>/\.(js|html|css|json|map)$/i.test(f)&&pattern.test(fs.readFileSync(f,'utf8'))).map(f=>path.relative(root,f));
const artifactReady=webBuilt&&staticBuilt&&artifactRoots.every(dir=>files(path.join(root,dir)).some(f=>/\.(js|html)$/i.test(f)));
const artifactStatus=artifactReady?(hits.length?'FAILED':'PASSED'):'UNTESTED';
results.push({name:'generated public artifact vendor scan',status:artifactStatus,hits,reason:artifactReady?undefined:'Missing or unsuccessful build; zero matches cannot establish a pass.'});
console.log(artifactStatus+' generated public artifact vendor scan: '+hits.length+' affected files');
const ts=require(path.join(root,'apps/api/node_modules/typescript'));
const inventory=[];
for(const base of ['apps/api/src','apps/web/src','packages/domain/src','packages/shared/src','packages/ai-gateway/src'])for(const file of files(path.join(root,base)).filter(f=>/\.tsx?$/.test(f)&&!f.includes('__smoke__'))){
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 for(const statement of source.statements){
  const exported=statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
  if(exported&&(ts.isFunctionDeclaration(statement)||ts.isClassDeclaration(statement))){
   inventory.push({file:path.relative(root,file),unit:statement.name?.text||'default export',status:'UNTESTED',evidence:'Complete valid/boundary/malformed matrix is not established by aggregate suite success.'});
   if(ts.isClassDeclaration(statement))for(const member of statement.members)if(ts.isMethodDeclaration(member)||ts.isConstructorDeclaration(member))inventory.push({file:path.relative(root,file),unit:(statement.name?.text||'default')+'.'+(member.name?.getText(source)||'constructor'),status:'UNTESTED',evidence:'Per-method input matrix not yet established.'});
  }
  if(exported&&ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(declaration.initializer&&(ts.isArrowFunction(declaration.initializer)||ts.isFunctionExpression(declaration.initializer)))inventory.push({file:path.relative(root,file),unit:declaration.name.getText(source),status:'UNTESTED',evidence:'Per-function input matrix not yet established.'});
 }
}
const endpoints=[];
for(const file of files(path.join(root,'apps/api/src')).filter(f=>f.endsWith('.ts')&&!f.includes('__smoke__'))){
 const text=fs.readFileSync(file,'utf8');
 for(const match of text.matchAll(/(?<![\w.])(?:(app|router|subscriptions|entitlement|checkout)\.)?(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g)){
  if(!match[1]&&!file.endsWith('server.ts'))continue;
  endpoints.push({file:path.relative(root,file),method:match[2].toUpperCase(),path:match[3],status:'UNTESTED',evidence:'Static route inventory; mounted behavior and all input classes require explicit coverage. Data-repository calls are excluded where identifiable.'});
 }
}
const report={version:'1.6',generated_at:new Date().toISOString(),scope:'Local fixtures only. Live services, browser interaction, PostgreSQL/RLS and imported-store reconciliation remain UNTESTED.',results,unit_inventory:inventory,endpoint_inventory:endpoints};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
const escape=value=>String(value).replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
let md='# Verification evidence — v1.6\n\n[VERIFIED] Executed local results only. No production readiness claim.\n\n'+report.scope+'\n\n| Component | Test type | Status | Evidence |\n| --- | --- | --- | --- |\n';
for(const r of results)md+=`| ${escape(r.name)} | ${r.hits?'Artifact scan':'Executed command'} | ${r.status} | ${escape(r.log||r.reason||r.hits?.join(', ')||'No matches')} |\n`;
md+='\n## Individual reported assertions\n\n| Component | Test type | Status | Evidence |\n| --- | --- | --- | --- |\n';
for(const r of results)for(const line of (r.output||'').split(/\r?\n/)){
 if(/^\s*(?:ok \d+ -|not ok \d+ -|PASS\s|FAIL\s)/.test(line))md+=`| ${escape(r.name)} | Reported assertion | ${/^\s*(not ok|FAIL)/.test(line)?'FAILED':'PASSED'} | ${escape(line.trim())} (${r.log}) |\n`;
}
md+='\n## Exhaustiveness gate\n\n[VERIFIED] The exported-unit and endpoint inventories are in results.json. They are explicitly UNTESTED for the complete three-input-class requirement, even where aggregate suites pass. This prevents suite success from being misreported as exhaustive coverage.\n';
fs.writeFileSync(path.join(out,'report.md'),md);
console.log('Evidence: '+path.join(out,'report.md'));
process.exitCode=results.some(r=>r.status!=='PASSED')?1:0;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
