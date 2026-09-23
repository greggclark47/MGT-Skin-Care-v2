import path from 'node:path';
import { LocalStore, PgStore, startupMigrations, type Store } from './store';
import { OperationalWorker, identityDeletionFromEnv, notificationDeliveryFromEnv, writeWorkerHeartbeat } from './operations';

const env=process.env;
const interval=Math.max(15,Math.min(3600,Number(env.WORKER_INTERVAL_SECONDS)||60))*1000;
const healthFile=env.WORKER_HEALTH_FILE||'/tmp/mgt-worker-health.json';
async function openStore():Promise<Store>{
 const migrate=startupMigrations(env);
 if(env.DATABASE_URL)return new PgStore(env.DATABASE_URL).init(migrate);
 if(env.NODE_ENV==='production')throw new Error('A reviewed production database connection is required.');
 return new LocalStore(env.PORTAL_DB_PATH||path.resolve(process.cwd(),'../../work/data/portal.sqlite'));
}
async function main(){
 const store=await openStore();const worker=new OperationalWorker(store,{env,delivery:notificationDeliveryFromEnv(env),identityDeletion:identityDeletionFromEnv(env)});
 const run=async()=>{try{const result=await worker.runOnce();await writeWorkerHeartbeat(healthFile,result);console.log(JSON.stringify({worker:'portal-operations',...result}));}catch(error){console.error(error);}};
 await run();const timer=setInterval(run,interval);
 const stop=async()=>{clearInterval(timer);await store.close();process.exitCode=0;};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
