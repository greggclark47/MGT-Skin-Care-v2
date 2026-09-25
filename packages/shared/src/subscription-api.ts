// Subscription contract v1.1. Public fields are product-owned; account identity is session-bound.
export type SubscriptionStatus = 'trialing'|'active'|'past_due'|'canceled'|'incomplete'|'incomplete_expired'|'unpaid'|'paused'|'unknown';
export interface PortalSubscription {
  id: string; audience: 'consumer'|'vendor'; status: SubscriptionStatus;
  current_period_end: string|null; cancel_at_period_end: boolean;
  platform_managed: boolean; can_cancel: boolean; can_resume: boolean; pending_command: string|null;
}
export interface SubscriptionSnapshot {
  subscriptions: PortalSubscription[];
  entitlement: {premium: boolean; valid_until: string|null};
  enrollment_available: false;
}
export interface SubscriptionCommand {id: string; status: 'pending_confirmation'|'confirmed'}
const messages: Record<string,string> = {
  sign_in_required: 'Sign in to manage your subscriptions.',
  unauthenticated: 'Sign in to manage your subscriptions.',
  csrf_rejected: 'Your session needs refreshing. Reload this page before continuing.',
  platform_managed: 'Manage this subscription in the store where you purchased it.',
  billing_review_required: 'This subscription needs a billing review before changes can be made here.',
  billing_unconfigured: 'Subscription changes are awaiting setup.',
  change_pending: 'A subscription change is still awaiting confirmation.',
  request_conflict: 'This request reference was already used. Refresh before making another change.',
  subscription_not_found: 'No such subscription.',
  command_not_found: 'No such subscription request.',
  plan_review_required: 'New enrollment and plan changes are awaiting finalized plans.',
};
export class SubscriptionApiError extends Error {
  constructor(public code: string, public status = 0) {super(messages[code] || 'The request could not be confirmed. Refresh your subscription status before retrying.');this.name='SubscriptionApiError';}
}
const object = (value: unknown): value is Record<string,any> => !!value && typeof value === 'object' && !Array.isArray(value);
const opaque = (value: unknown, prefix: string): value is string => typeof value === 'string' && new RegExp('^'+prefix+'_[a-f0-9]{40}$').test(value);
const date = (value: unknown): value is string|null => value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
function subscription(value: unknown): PortalSubscription {
  if (!object(value) || !opaque(value.id,'ss') || !['consumer','vendor'].includes(value.audience) ||
      !['trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused','unknown'].includes(value.status) ||
      !date(value.current_period_end) || ['cancel_at_period_end','platform_managed','can_cancel','can_resume'].some(key=>typeof value[key] !== 'boolean') ||
      !(value.pending_command === null || opaque(value.pending_command,'cmd'))) throw new SubscriptionApiError('invalid_response');
  return {id:value.id,audience:value.audience,status:value.status,current_period_end:value.current_period_end,
    cancel_at_period_end:value.cancel_at_period_end,platform_managed:value.platform_managed,
    can_cancel:value.can_cancel,can_resume:value.can_resume,pending_command:value.pending_command};
}
function command(value: unknown): SubscriptionCommand {
  if (!object(value) || !opaque(value.id,'cmd') || !['pending_confirmation','confirmed'].includes(value.status)) throw new SubscriptionApiError('invalid_response');
  return {id:value.id,status:value.status};
}
export class SubscriptionApi {
  constructor(private baseUrl = '', private fetcher: typeof fetch = (...args)=>fetch(...args),
    private csrf: ()=>Promise<string> = async()=> '') {}
  private async request(path: string, method = 'GET', body?: unknown, requestId?: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),20000);
    try {
      const headers: Record<string,string> = {'accept':'application/json'};
      if (body !== undefined) {headers['content-type']='application/json';headers['x-csrf-token']=await this.csrf();}
      if (requestId) headers['idempotency-key']=requestId;
      const response = await this.fetcher(this.baseUrl.replace(/\/$/,'')+'/api/v1/subscriptions'+path,
        {method,headers,credentials:'same-origin',cache:'no-store',signal:controller.signal,body:body===undefined?undefined:JSON.stringify(body)});
      let data: unknown;
      try {data=await response.json();} catch {throw new SubscriptionApiError('invalid_response',response.status);}
      if (!response.ok) {
        const code=object(data)&&object(data.error)&&typeof data.error.code==='string'&&Object.prototype.hasOwnProperty.call(messages,data.error.code)?data.error.code:'request_failed';
        throw new SubscriptionApiError(code,response.status);
      }
      return data;
    } catch(error) {if(error instanceof SubscriptionApiError)throw error;throw new SubscriptionApiError('connection_failed');}
    finally {clearTimeout(timer);}
  }
  async list(): Promise<SubscriptionSnapshot> {
    const data=await this.request('');
    if (!object(data)||!Array.isArray(data.subscriptions)||!object(data.entitlement)||typeof data.entitlement.premium!=='boolean'||!date(data.entitlement.valid_until)||data.enrollment_available!==false) throw new SubscriptionApiError('invalid_response');
    return {subscriptions:data.subscriptions.map(subscription),entitlement:{premium:data.entitlement.premium,valid_until:data.entitlement.valid_until},enrollment_available:false};
  }
  async get(id: string): Promise<PortalSubscription> {const data=await this.request('/'+encodeURIComponent(id));return subscription(data?.subscription);}
  async setRenewal(id: string, cancelAtPeriodEnd: boolean, requestId: string): Promise<SubscriptionCommand> {
    return command(await this.request('/'+encodeURIComponent(id),'DELETE',{cancel_at_period_end:cancelAtPeriodEnd},requestId));
  }
  async command(id: string): Promise<SubscriptionCommand> {return command(await this.request('/commands/'+encodeURIComponent(id)));}
}
