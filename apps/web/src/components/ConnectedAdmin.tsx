'use client';

import React, { useId, useState } from 'react';
import { hub, useHub } from '../lib/hub';
import { LoadState } from './HubFrames';

type Metric = [label: string, value: React.ReactNode];
type SupportTicket = {
  id: string;
  subject: string;
  message: string;
  status?: string;
  request_type?: string;
  assigned_to?: string | null;
  escalation_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  replies?: Array<{ text: string; at?: string | null }>;
};

const label = (value: string) => value.replace(/_/g, ' ');
const readableDate = (value?: string | null) => {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString();
};

function Timestamp({ value }: { value?: string | null }) {
  return value ? <time dateTime={value}>{readableDate(value)}</time> : <>Unknown</>;
}

export function MetricSummary({ label: summaryLabel, items }: { label: string; items: Metric[] }) {
  return <dl className="skin-overview" aria-label={summaryLabel}>{items.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>;
}

export function DataTable({ label: tableLabel, caption, children }: { label: string; caption: string; children: React.ReactNode }) {
  return <div className="table-wrap" role="region" aria-label={tableLabel} tabIndex={0}><table><caption className="sr-only">{caption}</caption>{children}</table></div>;
}

function RefreshButton({ children, loading, onClick }: { children: React.ReactNode; loading: boolean; onClick: () => void }) {
  return <button className="button" type="button" disabled={loading} onClick={onClick}>{loading ? 'Refreshing…' : children}</button>;
}

function Readiness() {
  const state = useHub('/admin/readiness');
  return <><section className="panel" aria-labelledby="launch-setup-heading" aria-busy={state.loading}>
    <h2 id="launch-setup-heading">Launch setup</h2><LoadState {...state} retry={state.reload}/>
    {state.data && <><p>{state.data.note}</p><dl className="profile-details">{state.data.checks.map((c: any) => <div key={c.name}><dt>{c.name}</dt><dd>{c.configured ? 'Configured' : 'Needs setup'}</dd></div>)}</dl><RefreshButton loading={state.loading} onClick={state.reload}>Refresh checks</RefreshButton></>}
  </section><CatalogHealth/></>;
}

function CatalogHealth() {
  const state = useHub('/admin/catalog-health');
  return <section className="panel" aria-labelledby="catalog-health-heading" aria-busy={state.loading}><div className="section-heading"><div><span className="eyebrow">DATA QUALITY</span><h2 id="catalog-health-heading">Catalog readiness</h2></div></div><LoadState {...state} retry={state.reload}/>{state.data && <><p>{state.data.note}</p>{state.data.ready ? <p className="notice success">Catalog metadata meets the current readiness checks.</p> : <ul className="notice error">{state.data.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}</ul>}
    <MetricSummary label="Catalog readiness totals" items={[["Products", state.data.products.total], ["Active", state.data.products.active], ["Approved", state.data.products.approved], ["Sample", state.data.products.sample], ["Approved rules", state.data.rules.approved]]}/>
    <DataTable label="Required catalog slot coverage" caption="Required catalog slots and their active, approved and sample product coverage"><thead><tr><th scope="col">Required slot</th><th scope="col">Active</th><th scope="col">Approved</th><th scope="col">Sample</th></tr></thead><tbody>{state.data.slot_coverage.map((row: any) => <tr key={row.slot}><th scope="row">{label(row.slot)}</th><td>{row.active}</td><td>{row.approved}</td><td>{row.sample}</td></tr>)}</tbody></DataTable>
    {state.data.rules.unreviewed_ingredients.length > 0 && <p className="muted">Unreviewed ingredient keys: {state.data.rules.unreviewed_ingredients.join(', ')}</p>}<RefreshButton loading={state.loading} onClick={state.reload}>Refresh catalog health</RefreshButton></>}
  </section>;
}

function AiRouting() {
  const state = useHub('/admin/ai-routing');
  return <section className="panel" aria-labelledby="ai-routing-heading" aria-busy={state.loading}><div className="section-heading"><div><span className="eyebrow">QUALITY OPERATIONS</span><h2 id="ai-routing-heading">Analysis routing · last 24 hours</h2></div></div><LoadState {...state} retry={state.reload}/>{state.data && <>{state.data.requests === 0 ? <p className="muted">No analysis calls have been recorded in this window.</p> : <><p className="muted">{state.data.requests} telemetry records · ${(Number(state.data.cost_cents) / 100).toFixed(4)} estimated usage cost</p><DataTable label="Analysis routing activity" caption="Analysis records, fallbacks, validation state and latency by configuration"><thead><tr><th scope="col">Configuration</th><th scope="col">Records</th><th scope="col">Fallbacks</th><th scope="col">Validation</th><th scope="col">P95</th></tr></thead><tbody>{state.data.routes.map((route: any) => <tr key={route.route}><th scope="row">{route.route}</th><td>{route.requests}</td><td>{route.fallbacks}</td><td>{route.validation_failures ? 'Review needed' : 'Clear'}</td><td>{route.p95_latency_ms} ms</td></tr>)}</tbody></DataTable></>}<RefreshButton loading={state.loading} onClick={state.reload}>Refresh routing</RefreshButton></>}
  </section>;
}

function AiEconomics() {
  const state = useHub('/admin/ai-economics');
  const pct = (value: number) => `${(Number(value) * 100).toFixed(1)}%`;
  return <section className="panel" aria-labelledby="ai-economics-heading" aria-busy={state.loading}><div className="section-heading"><div><span className="eyebrow">ANALYSIS ECONOMICS</span><h2 id="ai-economics-heading">Spend, quality and exposure</h2></div></div><LoadState {...state} retry={state.reload}/>{state.data && <>{state.data.alerts?.length ? <ul className="notice error">{state.data.alerts.map((alert: string) => <li key={alert}>{alert}</li>)}</ul> : <p className="notice success">No analysis cost or validation alerts in this window.</p>}
    <MetricSummary label="Analysis economics totals" items={[["Requests", state.data.totals.requests], ["Success rate", pct(state.data.totals.success_rate)], ["Fallback rate", pct(state.data.totals.fallback_rate)], ["Usage cost", '$' + (Number(state.data.totals.cost_cents) / 100).toFixed(4)], ["Pending holds", state.data.pending_reservations], ["Stale holds", state.data.stale_reservations]]}/>
    {state.data.by_route?.length > 0 && <DataTable label="Analysis economics by route" caption="Analysis requests, estimated cost, failures and validation failures by route"><thead><tr><th scope="col">Configuration</th><th scope="col">Requests</th><th scope="col">Cost</th><th scope="col">Failures</th><th scope="col">Validation</th></tr></thead><tbody>{state.data.by_route.map((row: any) => <tr key={row.route}><th scope="row">{row.route}</th><td>{row.requests}</td><td>${(Number(row.cost_cents) / 100).toFixed(4)}</td><td>{row.failures}</td><td>{row.validation_failures}</td></tr>)}</tbody></DataTable>}<RefreshButton loading={state.loading} onClick={state.reload}>Refresh economics</RefreshButton></>}
  </section>;
}

function PrivacyOperations() {
  const state = useHub('/admin/deletions');
  return <section className="panel" aria-labelledby="privacy-operations-heading" aria-busy={state.loading}><div className="section-heading"><div><span className="eyebrow">PRIVACY OPERATIONS</span><h2 id="privacy-operations-heading">Account deletion queue</h2></div></div><LoadState {...state} retry={state.reload}/>{state.data && <><p>{state.data.privacy_note}</p>{!state.data.identity_deletion_configured && <p className="notice error">Account identity deletion is not configured. Due requests will pause before portal data is erased.</p>}
    <MetricSummary label="Account deletion totals" items={[["Queued", state.data.summary.total], ["Due", state.data.summary.due], ["Blocked", state.data.summary.blocked], ["Processing", state.data.summary.processing], ["Completed · 30 days", state.data.summary.completed_30_days]]}/>
    {state.data.queue.length ? <DataTable label="Account deletion queue" caption="Queued deletion requests, scheduled times, states and blockers"><thead><tr><th scope="col">Request</th><th scope="col">Scheduled</th><th scope="col">Status</th><th scope="col">Blockers</th></tr></thead><tbody>{state.data.queue.map((item: any) => <tr key={item.request_id || item.not_before}><th scope="row">{item.request_id ? item.request_id.slice(0, 8) : 'Legacy request'}</th><td><Timestamp value={item.not_before}/></td><td>{item.status}{item.due ? ' · due' : ''}</td><td>{[...(item.blocked_reasons || []).map(label), ...(item.service_error ? ['identity service error'] : [])].join(', ') || 'None'}</td></tr>)}</tbody></DataTable> : <p className="notice success">No account deletion requests are waiting.</p>}
    {state.data.recent_completions.length > 0 && <p className="muted">{state.data.recent_completions.length} anonymous completion proof{state.data.recent_completions.length === 1 ? '' : 's'} recorded in the last 30 days.</p>}<RefreshButton loading={state.loading} onClick={state.reload}>Refresh privacy operations</RefreshButton></>}
  </section>;
}

function SubscriptionWebhooks() {
  const state = useHub('/admin/subscription-webhooks');
  return <section className="panel" aria-labelledby="subscription-webhooks-heading" aria-busy={state.loading}><div className="section-heading"><div><span className="eyebrow">BILLING OPERATIONS</span><h2 id="subscription-webhooks-heading">Subscription webhook reconciliation</h2></div></div><LoadState {...state} retry={state.reload}/>{state.data && <><p>{state.data.privacy_note}</p>{!state.data.configured && <p className="notice error">Subscription webhook processing is not fully configured.</p>}{state.data.alerts?.length ? <ul className="notice error">{state.data.alerts.map((alert: string) => <li key={alert}>{alert}</li>)}</ul> : <p className="notice success">No failed or stalled signed subscription events in the last 24 hours.</p>}
    <MetricSummary label="Subscription event totals" items={[["Events", state.data.summary.events], ["Deliveries", state.data.summary.delivery_attempts], ["Processed", state.data.summary.processed], ["Duplicates", state.data.summary.duplicates], ["Failed", state.data.summary.failed], ["Stalled", state.data.summary.stalled]]}/>
    {state.data.receipts.length > 0 && <DataTable label="Subscription webhook receipts" caption="Recent subscription events, types, outcomes and delivery times"><thead><tr><th scope="col">Event</th><th scope="col">Type</th><th scope="col">Outcome</th><th scope="col">Last delivery</th></tr></thead><tbody>{state.data.receipts.map((item: any) => <tr key={item.event_id}><th scope="row">{item.event_id}</th><td>{label(item.type)}</td><td>{item.stalled ? 'stalled' : label(item.status)}{item.error_code ? ' · ' + label(item.error_code) : ''}</td><td><Timestamp value={item.last_received_at}/></td></tr>)}</tbody></DataTable>}<RefreshButton loading={state.loading} onClick={state.reload}>Refresh webhook activity</RefreshButton></>}
  </section>;
}

function SupportMetrics() {
  const state = useHub('/admin/support-metrics');
  return <section className="panel" aria-labelledby="support-metrics-heading" aria-busy={state.loading}><div className="section-heading"><div><span className="eyebrow">SUPPORT OPERATIONS</span><h2 id="support-metrics-heading">Guidance and request flow · last 30 days</h2></div></div><LoadState {...state} retry={state.reload}/>{state.data && <><p>{state.data.interpretation}</p><p className="muted">{state.data.privacy_note}</p>
    <MetricSummary label="Support flow totals" items={[["Guidance", state.data.events.guidance_requested || 0], ["Handoffs offered", state.data.handoff_funnel.offered], ["Support opened", state.data.handoff_funnel.support_opened], ["Handoffs saved", state.data.handoff_funnel.request_saved], ["Escalations", state.data.events.escalation_marked || 0], ["Resolved", state.data.statuses.closed]]}/>
    {state.data.guidance_by_role.length > 0 && <DataTable label="Guidance requests by topic" caption="Guidance request totals by supported topic"><thead><tr><th scope="col">Guidance topic</th><th scope="col">Requests</th></tr></thead><tbody>{state.data.guidance_by_role.map((row: any) => <tr key={row.role}><th scope="row">{label(row.role)}</th><td>{row.requests}</td></tr>)}</tbody></DataTable>}
    {state.data.escalation_reasons.length > 0 && <DataTable label="Support escalations by reason" caption="Escalation totals by approved internal reason"><thead><tr><th scope="col">Escalation reason</th><th scope="col">Marked</th></tr></thead><tbody>{state.data.escalation_reasons.map((row: any) => <tr key={row.reason}><th scope="row">{label(row.reason)}</th><td>{row.count}</td></tr>)}</tbody></DataTable>}<RefreshButton loading={state.loading} onClick={state.reload}>Refresh support flow</RefreshButton></>}
  </section>;
}

function ReferralMetrics() {
  const state = useHub('/admin/referral-metrics');
  return <section className="panel" aria-labelledby="referral-metrics-heading" aria-busy={state.loading}><div className="section-heading"><div><span className="eyebrow">REFERRAL DISCOVERY</span><h2 id="referral-metrics-heading">Retailer engagement · last 30 days</h2></div></div><LoadState {...state} retry={state.reload}/>{state.data && <><p>{state.data.interpretation}</p><p className="muted">{state.data.privacy_note}</p>
    <MetricSummary label="Retailer engagement totals" items={[["Outbound opens", state.data.summary.outbound], ["Saved", state.data.summary.saved], ["Unsaved", state.data.summary.unsaved]]}/>
    {state.data.by_retailer.length ? <DataTable label="Retailer engagement by destination" caption="Outbound opens and saved-list changes by retailer destination"><thead><tr><th scope="col">Retailer</th><th scope="col">Outbound</th><th scope="col">Saved</th><th scope="col">Unsaved</th></tr></thead><tbody>{state.data.by_retailer.map((row: any) => <tr key={row.retailer_id}><th scope="row">{row.name}</th><td>{row.outbound}</td><td>{row.saved}</td><td>{row.unsaved}</td></tr>)}</tbody></DataTable> : <p className="muted">No retailer engagement has been recorded in this window.</p>}
    <p className="notice">Commercial agreements: {state.data.commercial_agreements}. Do not interpret these actions as retailer orders or revenue.</p><RefreshButton loading={state.loading} onClick={state.reload}>Refresh referral engagement</RefreshButton></>}
  </section>;
}

export function SupportTicketEditor({ ticket, onSaved }: { ticket: SupportTicket; onSaved: () => void }) {
  const formId = useId();
  const [status, setStatus] = useState(ticket.status || 'open');
  const [escalationReason, setEscalationReason] = useState(ticket.escalation_reason || 'none');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [replyInvalid, setReplyInvalid] = useState(false);
  const replyRequired = status !== 'in_review';
  const helpId = `${formId}-help`, errorId = `${formId}-error`, messageId = `${formId}-message`;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const customerReply = reply.trim();
    setError(''); setMessage('');
    if (replyRequired && !customerReply) { setReplyInvalid(true); setError(`Add a customer-facing reply before changing this request to ${label(status)}.`); return; }
    setReplyInvalid(false);
    setBusy(true);
    try {
      await hub('/admin/ticket', { id: ticket.id, reply: customerReply, status, escalation_reason: escalationReason });
      setMessage(customerReply ? 'Request updated. The reply is now visible in the customer’s Support history.' : 'Request moved to In review. No customer reply was added.');
      setReply('');
      onSaved();
    } catch (err) { setReplyInvalid(false); setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const describedBy = [helpId, error ? errorId : '', message ? messageId : ''].filter(Boolean).join(' ');
  return <form className="stack support-update" aria-busy={busy} aria-describedby={describedBy} onSubmit={submit} noValidate>
    <p id={helpId} className="muted">A reply is required for Open, Waiting for customer, and Resolved. In review may be saved without a customer message.</p>
    <label className="field">Request status<select name="status" value={status} disabled={busy} onChange={event => { setStatus(event.target.value); setReplyInvalid(false); setError(''); setMessage(''); }}><option value="open">Open</option><option value="in_review">In review</option><option value="waiting_customer">Waiting for customer</option><option value="closed">Resolved</option></select></label>
    <label className="field">Escalation reason<select name="escalation_reason" value={escalationReason} disabled={busy} onChange={event => { setEscalationReason(event.target.value); setError(''); setMessage(''); }}><option value="none">No escalation</option><option value="content_safety">Content safety</option><option value="account_privacy">Account or privacy</option><option value="billing_scope">Billing scope</option><option value="retailer_purchase">Retailer purchase</option><option value="technical_issue">Technical issue</option><option value="specialist_review">Specialist review</option><option value="other">Other</option></select></label>
    <label className="field">Customer reply {replyRequired && <span aria-hidden="true">(required)</span>}<textarea name="reply" value={reply} maxLength={4000} required={replyRequired} disabled={busy} aria-invalid={replyInvalid} aria-describedby={describedBy} placeholder={replyRequired ? 'Tell the customer what changed or what you need next.' : 'Optional while the request is under internal review.'} onChange={event => { setReply(event.target.value); setReplyInvalid(false); setError(''); setMessage(''); }}/></label>
    {error && <p id={errorId} role="alert" className="notice error">{error}</p>}{message && <p id={messageId} role="status" className="notice success">{message}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? 'Updating request…' : 'Update request'}</button>
  </form>;
}

function SupportTicketCard({ ticket, accountId, canOperate, onSaved }: { ticket: SupportTicket; accountId?: string; canOperate: boolean; onSaved: () => void }) {
  const headingId = `support-ticket-${ticket.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const replies = Array.isArray(ticket.replies) ? ticket.replies : [];
  return <article className="panel support-ticket" aria-labelledby={headingId}><div className="row"><h3 id={headingId}>{ticket.subject}</h3><span className="pill">{label(ticket.status || 'open')}</span></div>
    <p className="muted">{label(ticket.request_type || 'portal_help')} · {ticket.assigned_to ? (ticket.assigned_to === accountId ? 'Assigned to you' : 'Assigned to another operator') : 'Unassigned'}{ticket.escalation_reason ? ' · ' + label(ticket.escalation_reason) : ''}</p>
    <p className="muted support-reference">Reference: {ticket.id}{ticket.created_at && <> · Saved <Timestamp value={ticket.created_at}/></>}{ticket.updated_at && ticket.updated_at !== ticket.created_at && <> · Updated <Timestamp value={ticket.updated_at}/></>}</p>
    <p className="support-message">{ticket.message}</p>
    {replies.length > 0 ? <section className="support-replies" aria-label="Customer-visible replies"><h4>Customer-visible replies</h4>{replies.map((reply, index) => <blockquote key={`${reply.at || 'reply'}-${index}`}><p>{reply.text}</p>{reply.at && <small><Timestamp value={reply.at}/></small>}</blockquote>)}</section> : <p className="muted">No customer-visible replies yet.</p>}
    {canOperate && <SupportTicketEditor ticket={ticket} onSaved={onSaved}/>}</article>;
}

export function AuditTable({ entries }: { entries: Array<{ id: string; action: string; at?: string | null }> }) {
  if (!entries.length) return <div className="empty"><h3>No audit activity yet.</h3><p>Recorded operator actions will appear here.</p></div>;
  return <DataTable label="Recent audit activity" caption="The 20 most recent recorded portal actions and their timestamps"><thead><tr><th scope="col">Action</th><th scope="col">Time</th></tr></thead><tbody>{entries.slice(-20).reverse().map(entry => <tr key={entry.id}><th scope="row">{entry.action}</th><td><Timestamp value={entry.at}/></td></tr>)}</tbody></DataTable>;
}

export function ConnectedAdmin({ kind }: { kind: 'knowledge' | 'rule' | 'operations' }) {
  const state = useHub('/admin'), session = useHub('/session');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function save(path: string, body: unknown) { setBusy(true); setError(''); setMessage(''); try { await hub(path, body); state.reload(); setMessage('Saved.'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }
  const data = state.data, roles: string[] = data?.roles || [];
  const canDraft = kind === 'knowledge' ? roles.some(role => ['superadmin', 'sme', 'catalog_editor'].includes(role)) : roles.some(role => ['superadmin', 'sme'].includes(role));
  const supportOperator = roles.some(role => ['superadmin', 'compliance'].includes(role));
  return <>
    <h1 className="app-page-title">{kind === 'operations' ? 'Portal operations' : kind === 'knowledge' ? 'Knowledge review' : 'Ingredient rules'}</h1>
    <p>Access uses your signed-in account and assigned roles.</p><LoadState {...state} retry={state.reload}/>
    {error && <p id="admin-save-error" role="alert" className="notice error">{error}</p>}{message && <p id="admin-save-message" role="status" className="notice success">{message}</p>}
    {data && <>{kind === 'operations' ? <>
      {supportOperator && <><Readiness/><SupportMetrics/><ReferralMetrics/><PrivacyOperations/><SubscriptionWebhooks/><AiEconomics/><AiRouting/></>}
      <MetricSummary label="Portal content and support totals" items={[["Products", data.products.length], ["Articles", data.knowledge.length], ["Support requests", data.tickets.length]]}/>
      <section aria-labelledby="support-requests-heading"><div className="row"><h2 id="support-requests-heading">Support requests</h2><span className="pill">{data.tickets.length} saved</span></div>
        {data.tickets.length ? data.tickets.map((ticket: SupportTicket) => <SupportTicketCard key={ticket.id} ticket={ticket} accountId={session.data?.account?.id} canOperate={supportOperator} onSaved={state.reload}/>) : <div className="empty"><h3>No support requests yet.</h3><p>New customer requests will appear here for review.</p></div>}
      </section>
      <section aria-labelledby="recent-audit-heading"><h2 id="recent-audit-heading">Recent audit activity</h2><AuditTable entries={data.audit}/></section>
    </> : <>
      {canDraft && <form className="panel stack" aria-busy={busy} aria-describedby={error ? 'admin-save-error' : message ? 'admin-save-message' : undefined} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const body = Object.fromEntries(form); void save('/admin/' + kind, kind === 'rule' ? { ...body, sensitivity_ceiling_required: Number(form.get('sensitivity_ceiling_required')) } : body); }}><h2>Create a draft</h2>{(kind === 'knowledge' ? ['title', 'source_url', 'body'] : ['ingredient_key', 'display_name', 'sensitivity_ceiling_required', 'rationale']).map(field => <label className="field" key={field}>{label(field)}{['body', 'rationale'].includes(field) ? <textarea required name={field} disabled={busy} maxLength={field === 'body' ? 4000 : 1000} onChange={() => setError('')}/> : <input required name={field} disabled={busy} type={field === 'source_url' ? 'url' : field === 'sensitivity_ceiling_required' ? 'number' : 'text'} step={field === 'sensitivity_ceiling_required' ? '.01' : undefined} min={field === 'sensitivity_ceiling_required' ? 0 : undefined} max={field === 'sensitivity_ceiling_required' ? 1 : undefined} onChange={() => setError('')}/>}</label>)}<button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving draft…' : 'Save draft'}</button></form>}
      {(kind === 'knowledge' ? data.knowledge : data.rules).map((item: any) => <article className="panel" key={item.id || item.ingredient_key}><div className="row"><h3>{item.title || item.display_name}</h3><span className="pill">{item.status}</span></div><p style={{ whiteSpace: 'pre-wrap' }}>{item.body || item.rationale}</p>{item.status !== 'approved' && !item.sample && roles.includes('sme') && item.author_id !== session.data?.account?.id && <button className="button" type="button" disabled={busy} onClick={() => void save('/admin/' + kind + '/approve', kind === 'knowledge' ? { id: item.id } : { ingredient_key: item.ingredient_key })}>{busy ? 'Approving…' : 'Approve reviewed draft'}</button>}</article>)}
    </>}</>}
  </>;
}
