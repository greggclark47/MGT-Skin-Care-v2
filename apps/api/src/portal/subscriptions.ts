// SC-P28 adaptation v1.1: shared portal sessions and storage; billing state remains webhook-owned.
import express from 'express';
import type Stripe from 'stripe';
import type { Store, Records } from './store';
import { account, check, hash, wrap } from './security';
import { createV1Router } from '../routes/v1';
import {activeGuestAccess} from './guest-access';

type SubscriptionRecord = {
  subscription_id?: string; customer_id?: string; source?: string;
  status?: string; active?: boolean; premium?: boolean; cancel_at_period_end?: boolean;
  current_period_end?: number; updated_at?: string; cycle?: string;
};
type Owned = { scope: 'subscriptions' | 'memberships'; key: string; audience: string; record: SubscriptionRecord };
type Command = {
  id: string; actor: string; subscription: string; requested_cancel: boolean;
  status: 'pending_confirmation' | 'confirmed'; created_at: string; confirmed_at?: string;
};

const handle = (scope: string, key: string, record: SubscriptionRecord) =>
  'ss_' + hash(scope + ':' + key + ':' + record.subscription_id).slice(0,40);
const supportedStatus = (value: unknown) => typeof value === 'string' &&
  ['trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused'].includes(value)
    ? value : 'unknown';
const periodEnd = (record: SubscriptionRecord): string | null => {
  const seconds = record.current_period_end;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const platformManaged = (record: SubscriptionRecord) => record.source === 'revenuecat';
const sourceKnown = (record: SubscriptionRecord) => record.source === undefined || record.source === 'stripe' || platformManaged(record);

async function ownedRecords(records: Records, actor: string): Promise<Owned[]> {
  const result: Owned[] = [];
  for (const audience of ['consumer','vendor']) {
    const key = actor + ':' + audience;
    const record = await records.get<SubscriptionRecord>('subscriptions', key);
    if (record?.subscription_id) result.push({scope:'subscriptions',key,audience,record});
  }
  const legacy = await records.get<SubscriptionRecord>('memberships',actor);
  if (legacy?.subscription_id && !result.some(item => item.record.subscription_id === legacy.subscription_id)) {
    result.push({scope:'memberships',key:actor,audience:'consumer',record:legacy});
  }
  return result;
}

const OVERDUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

// Keep portal entitlement checks aligned with the database/domain rule: active and
// trialing access follows the recorded period, while past-due access has three days
// to recover before premium access is removed.
export async function ownEntitlement(records: Records, actor: string) {
  const membership = await records.get<SubscriptionRecord>('memberships',actor);
  const consumer = await records.get<SubscriptionRecord>('subscriptions',actor+':consumer');
  const eligible = [membership?.premium === true ? membership : undefined,
    consumer && (consumer.active === true || consumer.status === 'past_due') ? consumer : undefined].filter((record): record is SubscriptionRecord =>
      !!record && sourceKnown(record) && ['active','trialing','past_due'].includes(record.status || ''));
  const now = Date.now();
  const current = eligible.filter(record => periodEnd(record) === null || record.current_period_end! * 1000 > now - (record.status === 'past_due' ? OVERDUE_GRACE_MS : 0));
  const ends = current.map(periodEnd);
  return { premium: current.length > 0, valid_until: current.length === 0 || ends.includes(null)
    ? null : ends.filter((end): end is string => end !== null).sort().reverse()[0] };
}

export async function portalEntitlement(records:Records,actor:string){
 const own=await ownEntitlement(records,actor);
 if(own.premium)return own;
 const access=await activeGuestAccess(records,actor);
 if(!access||access.mode!=='match_owner')return own;
 const owner=await ownEntitlement(records,access.owner_actor);
 return {premium:owner.premium,valid_until:owner.premium?[access.expires_at,...(owner.valid_until?[owner.valid_until]:[])].sort()[0]:null};
}
export async function portalUsageAccount(records:Records,actor:string,userId:string){
 const access=await activeGuestAccess(records,actor);
 return access?.mode==='match_owner'?{actor:access.owner_actor,userId:access.owner_id}:{actor,userId};
}

async function publicSubscription(records: Records, owned: Owned, configured: boolean) {
  const {record,scope,key,audience} = owned;
  const id = handle(scope,key,record);
  const pending = await records.get<{id:string}>('subscription_pending',id);
  const command = pending ? await records.get<Command>('subscription_commands',pending.id) : undefined;
  const canChange = configured && scope === 'subscriptions' && sourceKnown(record) && !platformManaged(record) && !!record.customer_id &&
    ['active','trialing','past_due'].includes(record.status || '') && command?.status !== 'pending_confirmation';
  return {
    id, audience, status: supportedStatus(record.status), current_period_end: periodEnd(record),
    cancel_at_period_end: record.cancel_at_period_end === true,
    platform_managed: platformManaged(record),
    can_cancel: canChange && !record.cancel_at_period_end,
    can_resume: canChange && record.cancel_at_period_end === true,
    pending_command: command?.status === 'pending_confirmation' ? command.id : null,
  };
}

// Called only by the existing verified webhook, inside its transaction.
export async function confirmSubscriptionCommand(records: Records, scope: string, key: string,
  record: SubscriptionRecord, eventCreated: number | undefined) {
  const id = handle(scope,key,record);
  const pending = await records.get<{id:string}>('subscription_pending',id);
  if (!pending) return;
  const command = await records.get<Command>('subscription_commands',pending.id);
  if (!command || command.status !== 'pending_confirmation') return;
  if (typeof eventCreated !== 'number' || eventCreated < Math.floor(Date.parse(command.created_at)/1000)) return;
  if (record.cancel_at_period_end !== command.requested_cancel) return;
  await records.put('subscription_commands',command.id,{...command,status:'confirmed',confirmed_at:new Date().toISOString()});
  await records.remove('subscription_pending',id);
}

export function portalV1Router(db: Store, stripe: Stripe | undefined, env: NodeJS.ProcessEnv) {
  const subscriptions = express.Router();
  subscriptions.use(wrap(async(req,_res,next) => {account(req);next();}));
  const configured = () => env.SUBSCRIPTIONS_ENABLED === 'true' && !!stripe && !!env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
  const writable = () => check(configured(),503,'billing_unconfigured','Subscription changes are awaiting setup.');

  subscriptions.get('/',wrap(async(req,res) => {
    res.json(await db.tx(async records => ({
      subscriptions: await Promise.all((await ownedRecords(records,req.actor)).map(item => publicSubscription(records,item,configured()))),
      entitlement: await portalEntitlement(records,req.actor),
      enrollment_available: false,
    })));
  }));

  subscriptions.get('/commands/:id',wrap(async(req,res) => {
    const result = await db.tx(records => records.get<Command>('subscription_commands',String(req.params.id)));
    check(result?.actor === req.actor,404,'command_not_found','No such subscription request.');
    res.json({id:result.id,status:result.status});
  }));

  subscriptions.get('/:id',wrap(async(req,res) => {
    res.json(await db.tx(async records => {
      const found = (await ownedRecords(records,req.actor)).find(item => handle(item.scope,item.key,item.record) === req.params.id);
      check(found,404,'subscription_not_found','No such subscription.');
      return {subscription:await publicSubscription(records,found,configured())};
    }));
  }));

  // Demo plan placeholders must never become payable prices by inference.
  subscriptions.post('/',wrap(async(_req,_res) => {
    check(false,503,'plan_review_required','New enrollment is awaiting finalized plans.');
  }));
  subscriptions.put('/:id',wrap(async(req,_res) => {
    const found = await db.tx(async records => (await ownedRecords(records,req.actor)).find(item => handle(item.scope,item.key,item.record) === req.params.id));
    check(found,404,'subscription_not_found','No such subscription.');
    check(!platformManaged(found.record),409,'platform_managed','Manage this subscription in the store where you purchased it.');
    check(false,503,'plan_review_required','Plan changes are awaiting finalized plans.');
  }));

  subscriptions.delete('/:id',wrap(async(req,res) => {
    check(typeof req.body?.cancel_at_period_end === 'boolean',400,'invalid_request','Choose whether to stop or resume renewal.');
    const cancel = req.body.cancel_at_period_end;
    const requestId = req.header('idempotency-key');
    check(typeof requestId === 'string' && /^[a-zA-Z0-9_-]{8,120}$/.test(requestId),400,'invalid_request','A valid request reference is required.');
    const id = 'cmd_' + hash(req.actor + ':' + requestId).slice(0,40);
    const result = await db.tx(async records => {
      await records.lock('subscription-command:'+id);
      const previous = await records.get<Command>('subscription_commands',id);
      if (previous) {
        check(previous.subscription === req.params.id && previous.requested_cancel === cancel,409,'request_conflict','This request reference was already used for a different change.');
        return {id:previous.id,status:previous.status};
      }
      const match = (await ownedRecords(records,req.actor)).find(item => handle(item.scope,item.key,item.record) === req.params.id);
      check(match,404,'subscription_not_found','No such subscription.');
      await records.lock('billing:'+match.key);
      const record = await records.get<SubscriptionRecord>(match.scope,match.key);
      check(record && handle(match.scope,match.key,record) === req.params.id,409,'subscription_changed','Refresh your subscription before making this change.');
      check(!platformManaged(record),409,'platform_managed','Manage this subscription in the store where you purchased it.');
      check(match.scope === 'subscriptions',409,'billing_review_required','This earlier subscription needs a billing review before changes can be made here.');
      check(sourceKnown(record),409,'billing_review_required','This subscription needs a billing review.');
      check(!(await records.get('subscription_pending',String(req.params.id))),409,'change_pending','A subscription change is still awaiting confirmation.');
      writable();
      check(record.subscription_id && record.customer_id,409,'not_provisioned','This subscription has no confirmed billing record yet.');
      const remote = await stripe!.subscriptions.retrieve(record.subscription_id);
      const customer = typeof remote.customer === 'string' ? remote.customer : remote.customer.id;
      check(customer === record.customer_id && remote.metadata.actor === match.key &&
        remote.metadata.audience === match.audience && remote.metadata.kind === 'mgt_subscription',409,'owner_mismatch','Subscription ownership could not be confirmed.');
      check(['active','trialing','past_due'].includes(remote.status),409,'subscription_ended','This subscription cannot be changed.');
      const createdAt = new Date().toISOString();
      // Both cancellation and resumption reach billing. No local access/renewal flag is changed here.
      await stripe!.subscriptions.update(remote.id,{cancel_at_period_end:cancel},{idempotencyKey:'mgt_'+id});
      const command:Command = {id,actor:req.actor,subscription:String(req.params.id),requested_cancel:cancel,status:'pending_confirmation',created_at:createdAt};
      await records.put('subscription_commands',id,command);
      await records.put('subscription_pending',String(req.params.id),{id,actor:req.actor});
      return {id,status:command.status};
    });
    res.status(result.status === 'confirmed' ? 200 : 202).json(result);
  }));

  const entitlement = express.Router();
  entitlement.get('/',wrap(async(req,res) => {account(req);res.json(await db.tx(records=>portalEntitlement(records,req.actor)));}));
  const checkout = express.Router();
  checkout.use(wrap(async(req,_res) => {account(req);check(false,409,'external_commerce_only','Product purchases remain with the retailer.');}));
  return createV1Router({checkout,subscriptions,entitlement});
}
