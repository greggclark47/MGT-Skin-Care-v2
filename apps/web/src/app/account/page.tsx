'use client';
import React,{useState} from 'react';
import Link from 'next/link';
import {HubError,hub,useHub} from '../../lib/hub';
import {AppFrame,LoadState} from '../../components/HubFrames';
import {ConfirmDialog} from '../../components/ConfirmDialog';
import {GuestAccess} from '../../components/GuestAccess';

export default function Account(){
 const state=useHub('/session');
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[mergeConflict,setMergeConflict]=useState(false),[privacyAction,setPrivacyAction]=useState<'request'|'cancel'|null>(null);
 async function act(path:string,body:unknown){
  if(busy)return;setBusy(true);setMessage('');setError('');
  try{
   await hub(path,body);
   if(path==='/auth/email'){setSent(true);setCode('');setMessage('Check your email for the verification code.');}
   else{setSent(false);setCode('');setMergeConflict(false);setMessage(path==='/auth/logout'?'You are signed out.':path==='/auth/merge'?'Your profiles are connected using the choice you made.':'Your account is connected.');state.reload();}
  }catch(e){const failure=e instanceof HubError?e:null;setMergeConflict(failure?.code==='profile_merge_conflict');setError((e as Error).message);}finally{setBusy(false);}
 }
 async function privacy(path:string){
  if(busy)return;setBusy(true);setMessage('');setError('');
  try{
   await hub(path,{confirm:true});
   setMessage(path.endsWith('cancel')?'Your account deletion request was cancelled.':'Your deletion request is scheduled. You can cancel it before processing begins.');
   setPrivacyAction(null);state.reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const deletion=state.data?.deletion_request;
 return <AppFrame title="My Account">
  <p className="lead">Your skincare, connected to you.</p>
 <LoadState {...state} retry={state.reload}/>
  {state.data&&<GuestAccess signedIn={!!state.data.account}/>}
  {message&&<p className="notice success" role="status">{message}</p>}{error&&<p id="account-error" className="notice error" role="alert">{error}</p>}{mergeConflict&&<section className="notice error" aria-labelledby="merge-conflict-title"><h3 id="merge-conflict-title">Account linking needs your choice</h3><p>Your browser profile and account profile are different. Both were kept safely, and nothing was overwritten.</p><p>Choose which saved profile should become the connected account. The other profile will be removed only after you choose.</p><div className="actions"><button type="button" className="button primary" disabled={busy} onClick={()=>void act('/auth/merge',{choice:'guest'})}>{busy?'Please wait…':'Keep this browser profile'}</button><button type="button" className="button" disabled={busy} onClick={()=>void act('/auth/merge',{choice:'account'})}>Use my account profile</button><Link className="button" href="/support">Ask for help</Link></div></section>}
  {!state.loading&&!state.error&&state.data&&(state.data.account?<>
   <section className="panel account-panel"><span className="eyebrow">CONNECTED ACCOUNT</span><h2>Welcome back.</h2><p className="account-email">{state.data.account.email}</p><div className="actions"><Link className="button primary" href="/my-skin">View my profile</Link><button disabled={busy} type="button" className="button" onClick={()=>void act('/auth/logout',{})}>{busy?'Please wait…':'Sign out'}</button></div></section>
   <div className="actions"><Link className="button" href="/subscription">Your subscriptions</Link><Link className="button" href="/membership">Plans & Billing</Link></div>
   <section className="account-tools" aria-label="Account tools"><a href="/api/hub/account/export"><strong>Download my data <span aria-hidden="true">↓</span></strong><span>Export the information saved to your account.</span></a><Link href="/orders"><strong>Retailer purchase help <span aria-hidden="true">→</span></strong><span>Find where to ask about payments, delivery and returns.</span></Link></section>
   <section className="panel"><span className="eyebrow">PRIVACY CONTROL</span><h2>Account deletion</h2>{deletion?<><p>Your request is scheduled for {new Date(deletion.not_before).toLocaleString()}. Active billing, unfinished transactions, operator access, or unsettled AI charges must be resolved before deletion can finish.</p>{deletion.blocked_reasons?.length>0&&<p className="notice">Processing is paused while account obligations are resolved.</p>}<button className="button" disabled={busy||deletion.status!=='pending'} onClick={()=>setPrivacyAction('cancel')}>Cancel deletion request</button></>:<><p>Request deletion of your portal data and sign-in identity. A 30-day cancellation window applies. Legally required transaction records may be retained in anonymized form.</p><button className="button" disabled={busy} onClick={()=>setPrivacyAction('request')}>Request account deletion</button></>}</section>
   <ConfirmDialog open={privacyAction!==null} title={privacyAction==='cancel'?'Keep this account?':'Delete this account?'} busy={busy} onCancel={()=>setPrivacyAction(null)} onConfirm={()=>void privacy(privacyAction==='cancel'?'/account/deletion-cancel':'/account/deletion-request')} confirmLabel={privacyAction==='cancel'?'Keep my account':'Schedule deletion'}><p>{privacyAction==='cancel'?'This cancels the pending deletion and keeps your account and saved portal data.':'Deletion begins after 30 days. Before then, download your data or cancel this request from this page.'}</p></ConfirmDialog>
  </>:<form className="panel stack account-panel" aria-busy={busy} aria-describedby={error?'account-error':undefined} onSubmit={e=>{e.preventDefault();void act(sent?'/auth/verify':'/auth/email',sent?{email:email.trim(),code}:{email:email.trim()});}}><span className="eyebrow">{sent?'STEP 2 OF 2 · VERIFY':'STEP 1 OF 2 · EMAIL'}</span><h2>{sent?'Check your inbox.':'Keep your skincare connected.'}</h2><p>{sent?'Enter the verification code sent to your email address.':'Sign in with a code sent to your email. Your current browser’s profile can be linked to your account.'}</p>{!state.data.auth_configured&&<p className="notice">Email sign-in is awaiting service configuration. Your sample profile can still be saved in this browser’s portal session.</p>}<label className="field">Email address<input type="email" required autoComplete="email" disabled={busy||sent} value={email} aria-invalid={!!error&&!sent} onChange={e=>{setEmail(e.target.value);if(error)setError('');}}/></label>{sent&&<label className="field">Verification code<input className="verification-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} disabled={busy} value={code} onChange={e=>{setCode(e.target.value);if(error)setError('');}} aria-invalid={!!error} aria-describedby={error?'code-help account-error':'code-help'}/><span className="muted" id="code-help">Enter the 6–8 digit code from your email.</span></label>}<button className="button primary" disabled={busy||!state.data.auth_configured}>{busy?'Please wait…':sent?'Verify and sign in':'Email me a code'}</button>{sent&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setSent(false);setCode('');setMessage('');setError('');}}>Use a different email or request a new code</button>}</form>)}
 </AppFrame>;
}
