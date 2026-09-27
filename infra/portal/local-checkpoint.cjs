const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'../..');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const outputDir=path.join(root,'work','checkpoints',stamp);
fs.mkdirSync(outputDir,{recursive:true});
const generatedNext=[path.join(root,'apps','web','.next'),path.join(root,'apps','web','.next-dev')];
let generatedOutputCleaned=false;
for(const outputPath of generatedNext){try{if(fs.existsSync(outputPath)){fs.rmSync(outputPath,{recursive:true,force:true});generatedOutputCleaned=true;}}catch(error){fs.writeFileSync(path.join(outputDir,'generated-output-cleanup.log'),String(error));}}
const checks=[
 ['infrastructure preflight tests',[['',['--test','infra/portal/preflight.test.mjs']]]],
 ['compose and image contracts',[['',['--test','infra/portal/compose-contract.test.mjs']]]],
 ['migration lineage contracts',[['',['--test','infra/db/migration-lineage.test.mjs']]]],
 ['reviewed output golden set',[
  ['packages/domain',['node_modules/typescript/bin/tsc','-p','tsconfig.json']],
  ['',['--test','packages/shared/test/golden-cases.cjs']]
 ]],
 ['analytics SDK contract',[
  ['packages/analytics-sdk',['node_modules/typescript/bin/tsc','-p','tsconfig.json']],
  ['packages/analytics-sdk',['dist/__smoke__/analytics.js']]
 ]],
 ['mobile contract gate',[['',['--test','apps/mobile/test/contract.cjs']]]],
 ['full local verification',[['',['infra/portal/verify.cjs']]]]
];
const results=[];
for(const [name,commands] of checks){
 const safe=name.replace(/[^a-z0-9]+/gi,'-').toLowerCase();
 let status=0,error,output='';
 for(const [cwd,args] of commands){
  const run=spawnSync(process.execPath,args,{cwd:path.join(root,cwd),encoding:'utf8',timeout:240000,windowsHide:true});
  output+=`> ${process.execPath} ${args.join(' ')}\n`+(run.stdout||'')+(run.stderr||'');
  if(run.status!==0||run.error){status=run.status??1;error=run.error?.message;break;}
 }
 fs.writeFileSync(path.join(outputDir,safe+'.log'),output);
 results.push({name,status:status===0&&!error?'PASS':'FAIL',exit_code:status,error,log:safe+'.log'});
}

const envFile=path.join(root,'infra','portal','.env');
let preflight={status:'BLOCKED',reason:'infra/portal/.env is not present; production configuration was not supplied.'};
if(fs.existsSync(envFile)){
 const run=spawnSync(process.execPath,['--env-file-if-exists=infra/portal/.env','infra/portal/preflight.mjs'],{cwd:root,encoding:'utf8',timeout:60000,windowsHide:true});
 const output=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(outputDir,'production-preflight.log'),output);
 preflight={status:run.status===0&&!run.error?'PASS':'FAIL',exit_code:run.status,error:run.error?.message,log:'production-preflight.log'};
}

const git=(args)=>spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim();
const branch=git(['branch','--show-current']);
const commit=git(['rev-parse','HEAD']);
const verificationRoot=path.join(root,'work','verification');
const verification=fs.existsSync(verificationRoot)?fs.readdirSync(verificationRoot,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^\d{4}-\d{2}-\d{2}T/.test(e.name)).map(e=>e.name).sort().at(-1):null;
const localPass=results.every(item=>item.status==='PASS');
const releaseReady=localPass&&preflight.status==='PASS';
const report={version:'1.0',generated_at:new Date().toISOString(),branch,commit,generated_output_cleaned:generatedOutputCleaned,results,preflight,latest_verification:verification?`work/verification/${verification}/report.md`:null,release_ready:releaseReady};
fs.writeFileSync(path.join(outputDir,'results.json'),JSON.stringify(report,null,2));
let markdown=`# MGT local release checkpoint\n\nGenerated: ${report.generated_at}\n\n- Branch: \`${branch||'unknown'}\`\n- Commit: \`${commit||'unknown'}\`\n- Local gates: **${localPass?'PASS':'FAIL'}**\n- Production preflight: **${preflight.status}**\n- Release decision: **${releaseReady?'READY FOR STAGING REVIEW':'NOT READY'}**\n\n| Gate | Status | Evidence |\n| --- | --- | --- |\n`;
for(const item of results)markdown+=`| ${item.name} | ${item.status} | [${item.log}](./${item.log}) |\n`;
markdown+=`| Production configuration preflight | ${preflight.status} | ${preflight.log?`[${preflight.log}](./${preflight.log})`:preflight.reason} |\n`;
if(generatedOutputCleaned)markdown+='\nGenerated `apps/web/.next` and `.next-dev` output was removed before verification to avoid known OneDrive reparse-point build artifacts; source files were not removed.\n';
if(report.latest_verification)markdown+=`\nLatest verification evidence: [${report.latest_verification}](../../${report.latest_verification.replaceAll('\\','/')})\n`;
markdown+='\nThis checkpoint records repository-local evidence. A PASS does not establish live PostgreSQL/RLS isolation, identity-provider behavior, backup restoration, provider availability, device interaction, container startup, or deployment.\n';
fs.writeFileSync(path.join(outputDir,'report.md'),markdown);
console.log(`Checkpoint: ${path.join(outputDir,'report.md')}`);
console.log(`Local gates: ${localPass?'PASS':'FAIL'}; production preflight: ${preflight.status}; release decision: ${releaseReady?'READY FOR STAGING REVIEW':'NOT READY'}`);
if(process.argv.includes('--require-production')&&!releaseReady)process.exitCode=2;
