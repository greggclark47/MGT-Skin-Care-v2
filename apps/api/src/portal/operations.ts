import { createHash, randomUUID } from 'node:crypto';
import {writeFile,rename} from 'node:fs/promises';
import type { Records, Store } from './store';

type Notification={id:string;actor:string;kind:'replenishment_reminder';status:'queued'|'processing'|'delivered'|'failed'|'read';scheduled_at:string;created_at:string;updated_at:string;attempts:number;payload:{product_id:string;due_at:string};lease_until?:string;delivered_at?:string;read_at?:string;last_error?:string};
type Reminder={product_id:string;due_at:string;paused?:boolean;notification_id?:string;last_notified_at?:string};
type WorkerOptions={env?:NodeJS.ProcessEnv;delivery?:NotificationDelivery;identityDeletion?:IdentityDeletion};
export type WorkerResult={run_id:string;created:number;delivered:number;failed:number;removed:number;deletions_completed:number;deletions_blocked:number;backup_status:'healthy'|'stale'|'unverified'};

export interface NotificationDelivery{kind:string;deliver(notification:Notification):Promise<void>}
export class InAppNotificationDelivery implements NotificationDelivery{
 kind='in_app';
 async deliver(_notification:Notification){}
}
export class WebhookNotificationDelivery implements NotificationDelivery{
 kind='webhook';
 constructor(private url:string,private secret?:string){}
 async deliver(notification:Notification){
  const response=await fetch(this.url,{method:'POST',headers:{'content-type':'application/json',...(this.secret?{authorization:`Bearer ${this.secret}`}:{})},body:JSON.stringify({event:'mgt.notification',notification}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Notification delivery returned ${response.status}.`);
 }
}
export interface IdentityDeletion{kind:string;remove(userId:string):Promise<void>}
class LocalIdentityDeletion implements IdentityDeletion{kind='local_only';async remove(_userId:string){}}
class MissingIdentityDeletion implements IdentityDeletion{
 kind='unconfigured';
 async remove(_userId:string){throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to delete the external sign-in identity.');}
}
export class SupabaseIdentityDeletion implements IdentityDeletion{
 kind='supabase';
 constructor(private url:string,private serviceRoleKey:string){}
 async remove(userId:string){
  const response=await fetch(`${this.url.replace(/\/$/,'')}/auth/v1/admin/users/${encodeURIComponent(userId)}`,{method:'DELETE',headers:{apikey:this.serviceRoleKey,authorization:`Bearer ${this.serviceRoleKey}`},signal:AbortSignal.timeout(10000)});
  if(!response.ok&&response.status!==404)throw new Error(`Supabase identity deletion returned ${response.status}.`);
 }
}
const iso=(ms=Date.now())=>new Date(ms).toISOString();
const timestamp=(value:any)=>typeof value==='string'&&!Number.isNaN(Date.parse(value))?Date.parse(value):undefined;
const int=(value:string|undefined,fallback:number,min:number,max:number)=>{const parsed=Number(value);return Number.isInteger(parsed)&&parsed>=min&&parsed<=max?parsed:fallback;};
const notificationId=(actor:string,reminder:Reminder)=>'reminder_'+createHash('sha256').update(`${actor}:${reminder.product_id}:${reminder.due_at}`).digest('hex').slice(0,40);

export function operationalReadiness(backup:any,runs:{value:any}[],at=Date.now(),workerMaxAgeMs=5*60000){
 const lastRun=runs.map(entry=>entry.value).filter(run=>run&&typeof run.completed_at==='string')
  .sort((a,b)=>Date.parse(b.completed_at)-Date.parse(a.completed_at))[0]||null;
 const lastCompleted=timestamp(lastRun?.completed_at);
 const workerHealthy=lastCompleted!==undefined&&lastCompleted<=at&&at-lastCompleted<=workerMaxAgeMs;
 const backupHealthy=backup?.status==='healthy'&&timestamp(backup?.last_success_at)!==undefined
  && timestamp(backup.last_success_at)!<=at;
 const issues=[!workerHealthy?'operations_worker_stale':null,!backupHealthy?'backup_unhealthy':null].filter(Boolean);
 return {healthy:issues.length===0,issues,last_run:lastRun,backup};
}

export async function writeWorkerHeartbeat(file:string,result:unknown){
 const temp=file+'.tmp';
 await writeFile(temp,JSON.stringify({updated_at:new Date().toISOString(),result}));
 await rename(temp,file);
}

export function notificationDeliveryFromEnv(env:NodeJS.ProcessEnv):NotificationDelivery{
 if(env.NOTIFICATION_DELIVERY==='webhook'){
  const url=env.NOTIFICATION_WEBHOOK_URL;
  if(!url)throw new Error('NOTIFICATION_WEBHOOK_URL is required when webhook delivery is enabled.');
  const parsed=new URL(url);
  if(env.NODE_ENV==='production'&&parsed.protocol!=='https:')throw new Error('Production notification webhooks must use HTTPS.');
  return new WebhookNotificationDelivery(parsed.toString(),env.NOTIFICATION_WEBHOOK_TOKEN);
 }
 if(env.NOTIFICATION_DELIVERY&&env.NOTIFICATION_DELIVERY!=='in_app')throw new Error('NOTIFICATION_DELIVERY must be in_app or webhook.');
 return new InAppNotificationDelivery();
}
export function identityDeletionFromEnv(env:NodeJS.ProcessEnv):IdentityDeletion{
 if(!env.SUPABASE_URL)return new LocalIdentityDeletion();
 if(!env.SUPABASE_SERVICE_ROLE_KEY)return new MissingIdentityDeletion();
 return new SupabaseIdentityDeletion(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Small, restart-safe maintenance loop. It uses durable records and leases so a
 * second worker cannot send the same notification while the first is active.
 */
export class OperationalWorker{
 private running=false;
 private env:NodeJS.ProcessEnv;
 private delivery:NotificationDelivery;
 private identityDeletion:IdentityDeletion;
 constructor(private store:Store,options:WorkerOptions={}){this.env=options.env||process.env;this.delivery=options.delivery||notificationDeliveryFromEnv(this.env);this.identityDeletion=options.identityDeletion||identityDeletionFromEnv(this.env);}
 async runOnce(at=Date.now()):Promise<WorkerResult>{
  if(this.running)throw new Error('Operational worker is already running.');
  this.running=true;
  const runId=randomUUID();
  try{
   const staged=await this.store.tx(async records=>{
    await records.lock('operations:maintenance');
    const removed=await this.prune(records,at);
    const created=await this.enqueueDueReminders(records,at);
    const backup_status=await this.verifyBackup(records,at);
    await records.put('operation_runs',runId,{id:runId,started_at:iso(at),created,removed,backup_status,delivery:this.delivery.kind});
    return {created,removed,backup_status};
   });
   const deletions=await this.processDeletionRequests(at);
   let delivered=0,failed=0;
   for(const entry of await this.store.tx(records=>records.entries<Notification>('notifications'))){
    const outcome=await this.deliver(entry.id,at);
    if(outcome==='delivered')delivered++;if(outcome==='failed')failed++;
   }
   await this.store.tx(async records=>{const run=await records.get<any>('operation_runs',runId);if(run)await records.put('operation_runs',runId,{...run,completed_at:iso(),delivered,failed,...deletions});});
   return {run_id:runId,...staged,...deletions,delivered,failed};
  }finally{this.running=false;}
 }
 private async prune(records:Records,at:number){
  const policies=[
   ['sessions',0,(v:any)=>Number(v?.expires)],
   ['rate',0,(v:any)=>Number(v?.reset)],
   ['profile_merge_pending',0,(v:any)=>timestamp(v?.expires_at)],
   ['ai_routing_log',int(this.env.OPERATIONS_AI_LOG_RETENTION_DAYS,30,1,3650),(v:any)=>timestamp(v?.at||v?.created_at||v?.timestamp)],
   ['notifications',int(this.env.OPERATIONS_NOTIFICATION_RETENTION_DAYS,90,1,3650),(v:any)=>timestamp(v?.delivered_at||v?.read_at||v?.updated_at)],
   ['billing_activity',int(this.env.OPERATIONS_BILLING_RETENTION_DAYS,730,30,3650),(v:any)=>timestamp(v?.at)],
   ['subscription_webhook_receipts',int(this.env.OPERATIONS_WEBHOOK_RECEIPT_RETENTION_DAYS,90,7,3650),(v:any)=>timestamp(v?.last_received_at||v?.first_received_at)],
   ['support_metrics',int(this.env.OPERATIONS_AGGREGATE_METRIC_RETENTION_DAYS,180,30,3650),(v:any)=>timestamp(v?.updated_at||v?.date)],
   ['referral_metrics',int(this.env.OPERATIONS_AGGREGATE_METRIC_RETENTION_DAYS,180,30,3650),(v:any)=>timestamp(v?.updated_at||v?.date)],
   ['deletion_completions',int(this.env.OPERATIONS_DELETION_PROOF_RETENTION_DAYS,730,30,3650),(v:any)=>timestamp(v?.completed_at)],
   ['operation_runs',int(this.env.OPERATIONS_RUN_RETENTION_DAYS,90,1,3650),(v:any)=>timestamp(v?.completed_at||v?.started_at)]
  ] as const;
  let removed=0;
  for(const [scope,days,date] of policies){for(const entry of await records.entries(scope)){const then=date(entry.value);if(then!==undefined&&then<at-days*86400000){await records.remove(scope,entry.id);removed++;}}}
  return removed;
 }
 private async enqueueDueReminders(records:Records,at:number){
  let created=0;
  for(const entry of await records.entries<Reminder[]>('reminders')){
   if(!Array.isArray(entry.value))continue;
   let changed=false;
   const reminders:Reminder[]=[];
   for(const reminder of entry.value){
    const due=timestamp(reminder?.due_at);
    if(!reminder||reminder.paused||due===undefined||due>at||reminder.notification_id){reminders.push(reminder);continue;}
    const id=notificationId(entry.id,reminder),created_at=iso(at);
    await records.put('notifications',id,{id,actor:entry.id,kind:'replenishment_reminder',status:'queued',scheduled_at:reminder.due_at,created_at,updated_at:created_at,attempts:0,payload:{product_id:reminder.product_id,due_at:reminder.due_at}} satisfies Notification);
    changed=true;created++;
    reminders.push({...reminder,notification_id:id,last_notified_at:created_at});
   }
   if(changed)await records.put('reminders',entry.id,reminders);
  }
  return created;
 }
 private async verifyBackup(records:Records,at:number):Promise<'healthy'|'stale'|'unverified'>{
  const maxAge=int(this.env.BACKUP_MAX_AGE_HOURS,26,1,24*30)*3600000;
  const latest=await records.get<any>('backup_status','latest');
  const completed=timestamp(latest?.completed_at);
  const status=completed===undefined?'unverified':at-completed<=maxAge?'healthy':'stale';
  await records.put('operations','backup_health',{status,checked_at:iso(at),max_age_hours:maxAge/3600000,last_success_at:completed===undefined?null:iso(completed),location_identifier:typeof latest?.location_identifier==='string'?latest.location_identifier:null});
  return status;
 }
 private async processDeletionRequests(at:number){
  let deletions_completed=0,deletions_blocked=0;
  const requests=await this.store.tx(records=>records.entries<any>('deletion_requests'));
  for(const entry of requests){
   const claimed=await this.store.tx(async records=>{
    await records.lock('account-deletion:'+createHash('sha256').update(entry.id).digest('hex'));
    const stored=await records.get<any>('deletion_requests',entry.id);
    if(!stored)return null;
    const request={...stored,request_id:stored.request_id||randomUUID(),user_id:stored.user_id||(typeof stored.actor==='string'&&stored.actor.startsWith('user_')?stored.actor.slice(5):undefined)};
    const due=timestamp(request.not_before),lease=timestamp(request.lease_until);
    if(due===undefined||due>at||!['pending','processing'].includes(request.status)||request.status==='processing'&&lease!==undefined&&lease>at)return null;
    const blockers=await this.deletionBlockers(records,request);
    if(blockers.length){
     await records.put('deletion_requests',entry.id,{...request,status:'pending',blocked_reasons:blockers,last_checked_at:iso(at),lease_until:undefined});
     return {blocked:true} as const;
    }
    const processing={...request,status:'processing',attempts:(request.attempts||0)+1,blocked_reasons:[],last_checked_at:iso(at),lease_until:iso(at+10*60000)};
    await records.put('deletion_requests',entry.id,processing);
    return {blocked:false,request:processing} as const;
   });
   if(!claimed)continue;
   if(claimed.blocked){deletions_blocked++;continue;}
   try{
    await this.identityDeletion.remove(claimed.request.user_id);
    await this.store.tx(async records=>{
     await records.lock('account-deletion:'+createHash('sha256').update(entry.id).digest('hex'));
     const current=await records.get<any>('deletion_requests',entry.id);
     if(!current||current.status!=='processing'||current.request_id!==claimed.request.request_id)return;
     await this.eraseAccount(records,current,at);
    });
    deletions_completed++;
   }catch(error){
    await this.store.tx(async records=>{
     const current=await records.get<any>('deletion_requests',entry.id);
     if(current?.request_id===claimed.request.request_id)await records.put('deletion_requests',entry.id,{...current,status:'pending',lease_until:undefined,last_error:error instanceof Error?error.message:'Identity deletion failed.',last_checked_at:iso(at)});
    });
    deletions_blocked++;
   }
  }
  return {deletions_completed,deletions_blocked};
 }
 private async deletionBlockers(records:Records,request:any){
  const actor=request.actor,userId=request.user_id;
  if(typeof actor!=='string'||typeof userId!=='string'||actor!==`user_${userId}`)return ['invalid_identity'];
  const blockers:string[]=[];
  const account=await records.get<any>('accounts',userId);
  if(Array.isArray(account?.roles)&&account.roles.length)blockers.push('operator_access_assigned');
  const terminalSubscriptions=new Set(['canceled','incomplete_expired']);
  for(const audience of ['consumer','vendor']){
   const subscription=await records.get<any>('subscriptions',`${actor}:${audience}`);
   if(subscription&&(subscription.customer_id||subscription.subscription_id)&&!terminalSubscriptions.has(subscription.status))blockers.push(`active_${audience}_subscription`);
  }
  const membership=await records.get<any>('memberships',actor);
  if(membership?.premium===true||['active','trialing','past_due','unpaid','incomplete','paused'].includes(membership?.status))blockers.push('active_legacy_membership');
  if((await records.list<any>('subscription_pending')).some(item=>item.actor===actor))blockers.push('pending_subscription_change');
  if((await records.list<any>('orders')).some(order=>order.actor===actor&&!['canceled','refunded','fulfilled'].includes(order.status)))blockers.push('open_order');
  if((await records.entries<any>('ai_budget_reservations')).some(item=>this.belongsToUser(item.value?.budget_key,actor,userId)&&item.value?.status==='reserved'))blockers.push('pending_ai_charge');
  if((await records.entries<any>('partners')).some(item=>item.id===userId||item.value?.id===userId))blockers.push('vendor_account');
  return [...new Set(blockers)];
 }
 private belongsToUser(value:unknown,actor:string,userId:string){
  return typeof value==='string'&&(value===actor||value===userId||value.includes(`:${actor}:`)||value.includes(`:${userId}:`)||value.startsWith(actor+':')||value.startsWith(userId+':')||value.endsWith(':'+actor)||value.endsWith(':'+userId));
 }
 private async eraseAccount(records:Records,request:any,at:number){
  const actor=request.actor,userId=request.user_id,tombstone=`deleted_${request.request_id}`;
  const account=await records.get<any>('accounts',userId);
  for(const item of await records.entries<any>('profile_merge_pending'))if(item.value?.account_id===userId||item.value?.guest_actor===actor)await records.remove('profile_merge_pending',item.id);
  for(const item of await records.entries<any>('guest_invitations'))if(item.value.owner_actor===actor||item.value.guest_actor===actor||item.value.email===account?.email)await records.remove('guest_invitations',item.id);
  await records.remove('guest_memberships',actor);
  for(const scope of ['profiles','profile_revisions','style_profiles','reminders','saved_retailers','carts','memberships'])await records.remove(scope,actor);
  await records.remove('checkout_requests','premium_'+actor);
  for(const audience of ['consumer','vendor'])for(const scope of ['subscriptions','billing_attempts'])await records.remove(scope,`${actor}:${audience}`);
  for(const scope of ['sessions','notifications','tickets','ai_routing_log','ai_budget','ai_budget_reservations','ai_budget_reconciliations','rate','subscription_commands','subscription_pending']){
   for(const item of await records.entries<any>(scope)){
    const value=item.value;
    const owned=value?.actor===actor||value?.userId===userId||value?.user_id===actor||value?.user_id===userId||this.belongsToUser(item.id,actor,userId)||this.belongsToUser(value?.budget_key,actor,userId);
    if(owned)await records.remove(scope,item.id);
   }
  }
  for(const item of await records.entries<any>('orders'))if(item.value?.actor===actor)await records.put('orders',item.id,{...item.value,actor:tombstone,email:null,checkout_url:undefined,customer_id:undefined});
  for(const item of await records.entries<any>('billing_activity'))if(typeof item.value?.actor==='string'&&item.value.actor.startsWith(actor+':'))await records.put('billing_activity',item.id,{...item.value,actor:tombstone+item.value.actor.slice(actor.length)});
  for(const item of await records.entries<any>('audit'))if(item.value?.actor===actor||item.value?.actor===userId||item.value?.target===actor||item.value?.target===userId)await records.put('audit',item.id,{...item.value,actor:item.value.actor===actor||item.value.actor===userId?tombstone:item.value.actor,target:item.value.target===actor||item.value.target===userId?tombstone:item.value.target});
  for(const item of await records.entries<any>('operator_role_changes'))if(item.value?.operator_id===userId||item.value?.target_id===userId)await records.put('operator_role_changes',item.id,{...item.value,operator_id:item.value.operator_id===userId?tombstone:item.value.operator_id,target_id:item.value.target_id===userId?tombstone:item.value.target_id});
  await records.remove('accounts',userId);
  await records.remove('deletion_requests',actor);
  await records.put('deletion_completions',request.request_id,{request_id:request.request_id,requested_at:request.requested_at,completed_at:iso(at),identity_provider:this.identityDeletion.kind});
 }
 private async deliver(id:string,at:number):Promise<'delivered'|'failed'|'skipped'>{
  const claimed=await this.store.tx(async records=>{
   await records.lock('notification:'+id);
   const notification=await records.get<Notification>('notifications',id);
   if(!notification||notification.status==='delivered'||notification.status==='read'||notification.status==='failed')return undefined;
   const lease=timestamp(notification.lease_until);
   if(notification.status==='processing'&&lease!==undefined&&lease>at)return undefined;
   const processing={...notification,status:'processing' as const,attempts:notification.attempts+1,lease_until:iso(at+5*60000),updated_at:iso(at)};
   await records.put('notifications',id,processing);return processing;
  });
  if(!claimed)return 'skipped';
  try{
   await this.delivery.deliver(claimed);
   await this.store.tx(async records=>{await records.lock('notification:'+id);const current=await records.get<Notification>('notifications',id);if(current)await records.put('notifications',id,{...current,status:'delivered',delivered_at:iso(),lease_until:undefined,updated_at:iso()});});
   return 'delivered';
  }catch(error){
   await this.store.tx(async records=>{await records.lock('notification:'+id);const current=await records.get<Notification>('notifications',id);if(current){const retry=current.attempts<3;await records.put('notifications',id,{...current,status:retry?'queued':'failed',lease_until:undefined,last_error:error instanceof Error?error.message:'Notification delivery failed.',updated_at:iso()});}});
   return 'failed';
  }
 }
}
