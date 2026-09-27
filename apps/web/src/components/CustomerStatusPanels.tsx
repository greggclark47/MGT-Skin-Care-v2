import React from 'react';
import {Timestamp} from './HubFrames';

type DeletionRequest={not_before:string;status:string;blocked_reasons?:string[]};
type Notification={id:string;kind:string;status:'delivered'|'read';created_at:string;payload:{product_id:string;due_at:string}};
type SupportTicket={id:string;subject:string;message:string;status:string;request_type:string;created_at?:string|null;updated_at?:string|null;replies:{text:string;at?:string|null}[]};
type FeedbackOption=[id:string,label:string,hint:string];

const label=(value:string)=>value.replace(/_/g,' ');
const feedbackOptions:FeedbackOption[]=[['comfortable','Comfortable','My routine feels comfortable.'],['no_change','No change','I haven’t noticed a change.'],['irritation','Irritated','Use more cautious preferences.']];

export function AccountDeletionPanel({deletion,busy,onRequest,onCancel}:{deletion?:DeletionRequest|null;busy:boolean;onRequest:()=>void;onCancel:()=>void}){
 const blocked=deletion?.blocked_reasons||[];
 const describedBy=deletion?`deletion-schedule ${blocked.length?'deletion-blockers':''}`:'deletion-empty';
 return <section className="panel" aria-labelledby="account-deletion-heading" aria-describedby={describedBy}><span className="eyebrow">PRIVACY CONTROL</span><h2 id="account-deletion-heading">Account deletion</h2>{deletion?<><p id="deletion-schedule">Your request is scheduled for <Timestamp value={deletion.not_before}/>. Active billing, unfinished transactions, operator access, or unsettled AI charges must be resolved before deletion can finish.</p>{blocked.length>0&&<div id="deletion-blockers" className="notice" role="status"><p>Processing is paused while account obligations are resolved.</p><ul>{blocked.map(reason=><li key={reason}>{label(reason)}</li>)}</ul></div>}<button type="button" className="button" disabled={busy||deletion.status!=='pending'} onClick={onCancel}>Cancel deletion request</button></>:<><p id="deletion-empty">Request deletion of your portal data and sign-in identity. A 30-day cancellation window applies. Legally required transaction records may be retained in anonymized form.</p><button type="button" className="button" disabled={busy} onClick={onRequest}>Request account deletion</button></>}</section>;
}

export function RestockAlerts({notifications,unread,name,busy,onRead}:{notifications:Notification[];unread:number;name:(id:string)=>string;busy:string;onRead:(id:string)=>void}){
 return <>
  <p id="restock-alert-count" className="muted" role="status" aria-live="polite" aria-atomic="true">{notifications.length} recent {notifications.length===1?'alert':'alerts'} · {unread} unread</p>
  {notifications.length===0?<p className="muted">When a reminder is due, its alert will appear here.</p>:<ul className="restock-items">{notifications.map(n=>{const headingId=`restock-alert-${n.id.replace(/[^a-zA-Z0-9_-]/g,'')}`,actionBusy=busy==='notification-'+n.id;return <li className="panel" key={n.id} aria-labelledby={headingId}><div className="row"><span className={'restock-status '+(n.status==='delivered'?'is-due':'')}>{n.status==='delivered'?'New alert':'Read'}</span><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div><h3 id={headingId}>Time to review {name(n.payload.product_id)}</h3><p className="muted">Your reminder was scheduled for <time dateTime={n.payload.due_at}>{new Date(n.payload.due_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time>. Visit a retailer only when you are ready.</p>{n.status==='delivered'&&<button type="button" className="text-button" disabled={actionBusy} onClick={()=>onRead(n.id)} aria-describedby={headingId}>{actionBusy?'Saving…':'Mark as read'}</button>}</li>;})}</ul>}
 </>;
}

export function SupportHistory({tickets}:{tickets:SupportTicket[]}){
 return <>{tickets.map(t=>{const headingId=`customer-ticket-${t.id.replace(/[^a-zA-Z0-9_-]/g,'')}`;return <article className="panel support-ticket" key={t.id} aria-labelledby={headingId}><div className="row"><h3 id={headingId}>{t.subject}</h3><span className="pill">{label(String(t.status))}</span></div><p className="muted">{label(String(t.request_type))}</p><p className="muted support-reference">Reference: {t.id}{t.created_at&&<> · Saved <Timestamp value={t.created_at}/></>}{t.updated_at&&t.updated_at!==t.created_at&&<> · Updated <Timestamp value={t.updated_at}/></>}</p><p className="support-message">{t.message}</p>{t.replies.length>0?<section className="support-replies" aria-label="Customer-visible replies"><h4>Customer-visible replies</h4>{t.replies.map((r,i)=><blockquote key={`${r.at||'reply'}-${i}`}><p>{r.text}</p>{r.at&&<small><Timestamp value={r.at}/></small>}</blockquote>)}</section>:<p className="muted">No customer-visible replies yet.</p>}</article>;})}</>;
}

export function SkinFeedbackOptions({busy,onFeedback}:{busy:string;onFeedback:(id:string)=>void}){
 return <div className="skin-feedback-options">{feedbackOptions.map(([id,title,hint])=>{const actionBusy=busy===id;return <button type="button" key={id} className={'skin-feedback-option feedback-'+id} disabled={actionBusy} onClick={()=>onFeedback(id)}><strong>{actionBusy?'Saving…':title}</strong><span>{hint}</span></button>;})}</div>;
}
