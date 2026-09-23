'use client';
// Subscription workspace v1.1.
import React,{useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {SubscriptionApi,type SubscriptionSnapshot,type PortalSubscription} from '@mgt/shared';
import {AppFrame} from '../../components/HubFrames';
import {hub,session,resetSession} from '../../lib/hub';

const api=new SubscriptionApi('',(...args)=>fetch(...args),async()=>(await session()).csrf);
const labels:Record<string,string>={trialing:'Trial active',active:'Active',past_due:'Payment attention needed',canceled:'Ended',incomplete:'Setup incomplete',incomplete_expired:'Setup expired',unpaid:'Payment required',paused:'Paused',unknown:'Awaiting review'};
type Choice={id:string;cancel:boolean;key:string};

export default function SubscriptionPage(){
 const [data,setData]=useState<SubscriptionSnapshot|null>(null),[signedIn,setSignedIn]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [choice,setChoice]=useState<Choice|null>(null),[revision,setRevision]=useState(0);
 const generation=useRef(0),confirmation=useRef<HTMLHeadingElement>(null),refreshButton=useRef<HTMLButtonElement>(null);
 const reload=useCallback(()=>setRevision(value=>value+1),[]);
 useEffect(()=>{
  const changed=()=>{generation.current++;setData(null);setChoice(null);setError('');setNotice('');setBusy(false);reload();};
  window.addEventListener('hub:changed',changed);
  return()=>{generation.current++;window.removeEventListener('hub:changed',changed);};
 },[reload]);
 useEffect(()=>{
  let active=true;setLoading(true);setError('');
  (async()=>{try{const current=await hub('/session');if(!active)return;setSignedIn(!!current.account);
    if(!current.account){setData(null);return;}
    const snapshot=await api.list();if(active)setData(snapshot);
   }catch{if(active){setData(null);setError('Subscription status is unavailable. Refresh or sign in again.');}}
   finally{if(active)setLoading(false);}})();
  return()=>{active=false;};
 },[revision]);
 const pending=data?.subscriptions.some(item=>item.pending_command)===true;
 useEffect(()=>{
  if(!pending)return;
  let attempts=0;
  const timer=window.setInterval(()=>{if(document.visibilityState!=='visible')return;
   if(++attempts>12){window.clearInterval(timer);setNotice('Confirmation is taking longer than expected. You can refresh status without submitting another change.');return;}
   reload();
  },5000);
  return()=>window.clearInterval(timer);
 },[pending,reload]);
 useEffect(()=>{if(choice)confirmation.current?.focus();},[choice]);
 function choose(item:PortalSubscription){setError('');setNotice('');setChoice({id:item.id,cancel:item.can_cancel,key:crypto.randomUUID()});}
 async function submit(){
  if(!choice||busy)return;
  const current=choice,version=generation.current;setBusy(true);setError('');
  try{const result=await api.setRenewal(current.id,current.cancel,current.key);if(version!==generation.current)return;
   setChoice(null);setNotice(result.status==='confirmed'?'Your renewal change has been confirmed.':'Your request was received. Renewal status stays unchanged until confirmation arrives.');resetSession();reload();refreshButton.current?.focus();
  }catch{if(version===generation.current){setError('The change could not be confirmed. Refresh status first. If you retry below, the same request reference will be reused.');resetSession();}}
  finally{if(version===generation.current)setBusy(false);}
 }
 return <AppFrame title="Your subscriptions">
  <p className="lead">Review confirmed access and manage renewal from one place.</p>
  <p>New plans and prices are still under review. Demo prices remain USD placeholders; this page cannot enroll you in a new plan.</p>
  <div className="actions"><button ref={refreshButton} className="button" disabled={loading||busy} onClick={reload}>Refresh status</button><Link className="text-link" href="/account">Account</Link></div>
  {loading&&<p role="status">Checking your subscriptions…</p>}
  {error&&<p className="notice error" role="alert">{error}</p>}
  {notice&&<p className="notice" role="status">{notice}</p>}
  {!loading&&!signedIn&&!error&&<Link className="button primary" href="/account">Sign in to view subscriptions</Link>}
  {data&&<>
   <section className="panel" aria-labelledby="access-heading"><h2 id="access-heading">Confirmed access</h2>
    <p>{data.entitlement.premium?'Your paid access is active.':'No active paid access is confirmed.'}</p>
    {data.entitlement.valid_until&&<p>Current access period ends {new Date(data.entitlement.valid_until).toLocaleString()}.</p>}
   </section>
   {!data.subscriptions.length&&<p className="notice">No subscriptions are linked to this signed-in account.</p>}
   {data.subscriptions.map(item=><section className="panel" key={item.id} aria-label={item.audience==='consumer'?'Personal subscription':'Business subscription'}>
    <h2>{item.audience==='consumer'?'Personal subscription':'Business subscription'}</h2>
    <p>Status: <strong>{labels[item.status]}</strong></p>
    {item.current_period_end&&<p>Current period ends {new Date(item.current_period_end).toLocaleString()}.</p>}
    <p>{item.cancel_at_period_end?'Renewal is off. Turning it off does not itself end the current confirmed access period.':'Renewal is not scheduled to stop.'}</p>
    {item.platform_managed?<p className="notice">Manage this subscription in the store where you purchased it. Renewal controls are not available here.</p>:
     item.pending_command?<p className="notice" role="status">A renewal change is awaiting confirmation. Status refreshes automatically for about one minute.</p>:
     (item.can_cancel||item.can_resume)?<button className="button" disabled={busy||loading||!!choice} onClick={()=>choose(item)}>{item.can_cancel?'Turn off renewal':'Resume renewal'}</button>:
     <p>Renewal changes are unavailable for this record. Contact support if you need help.</p>}
   </section>)}
  </>}
  {choice&&<section className="panel" aria-labelledby="renewal-confirmation">
   <h2 ref={confirmation} tabIndex={-1} id="renewal-confirmation">{choice.cancel?'Turn off renewal?':'Resume renewal?'}</h2>
   <p>{choice.cancel?'This requests cancellation at the end of the current period, not an immediate refund.':'This requests future renewal on the existing subscription terms. Review your original billing agreement before continuing.'}</p>
   <div className="actions"><button className="button primary" disabled={busy||loading} onClick={()=>void submit()}>{busy?'Submitting request…':'Confirm request'}</button>
    <button className="button" disabled={busy} onClick={()=>{setChoice(null);refreshButton.current?.focus();}}>Back</button></div>
  </section>}
 </AppFrame>;
}
