'use client';
// Guest invitation controls v1.3; no owner profile or billing delegation.
import React,{useEffect,useState} from 'react';
import Link from 'next/link';
import {hub,useHub,resetSession} from '../lib/hub';
import {LoadState} from './HubFrames';
export function GuestAccess({signedIn}:{signedIn:boolean}){
 const [inviteToken,setInviteToken]=useState('');
 useEffect(()=>{const read=()=>{const match=window.location.hash.match(/^#guest-invite=([a-f0-9]{64})$/);if(match)setInviteToken(match[1]);};read();window.addEventListener('hashchange',read);return()=>window.removeEventListener('hashchange',read);},[]);
 return <section className="panel" aria-labelledby="guest-access-heading"><h2 id="guest-access-heading">30-day invited access</h2>
  <p>An account owner can invite one person to use basic features or match their plan for 30 days. Your profile stays private. Billing and administration are never shared.</p>
  {signedIn?<GuestControls token={inviteToken} clearToken={()=>{setInviteToken('');history.replaceState(null,'',location.pathname+location.search);}}/>:<p>Sign in with your own email to accept an invitation or manage access. Never use the owner’s sign-in code. {inviteToken?'Your invitation is ready to review after sign-in.':''}</p>}
 </section>;
}
function GuestControls({token,clearToken}:{token:string;clearToken:()=>void}){
 const state=useHub('/guest-access');const [email,setEmail]=useState(''),[mode,setMode]=useState('basic'),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[link,setLink]=useState(''),[notice,setNotice]=useState('');
 async function act(action:string,body:unknown){setBusy(true);setError('');setNotice('');try{const result=await hub('/guest-access/'+action,body);if(result.invite_path)setLink(new URL(result.invite_path,location.origin).href);else setLink('');if(action==='accept')clearToken();resetSession();state.reload();setNotice(action==='revoke'?'Invited access was revoked.':action==='accept'?'Invitation accepted. Your access period is shown below.':'Invitation created. Send the link only to the email address you entered.');setConfirmed(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const occupied=state.data?.invitations.some((item:any)=>['pending','active'].includes(item.status));
 return <><LoadState {...state} retry={state.reload}/>{error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  {token&&<div className="notice"><h3>Accept your invitation?</h3><p>Acceptance requires the invited email. No primary profile is copied or exposed.</p><button className="button primary" disabled={busy} onClick={()=>void act('accept',{token,confirm:true})}>Accept 30-day invitation</button></div>}
  {state.data?.access&&<div className="notice"><p>{state.data.access.mode==='match_owner'?'Your personal features match the owner’s current plan. Usage shares their allowance.':'Your invitation includes basic personal features.'}</p><p>Access ends {new Date(state.data.access.expires_at).toLocaleString()}. The owner may revoke it earlier.</p><p>Want independent full access? <Link className="text-link" href="/subscription">Review your subscription</Link></p></div>}
  {state.data&&!state.data.access&&<form className="stack" onSubmit={e=>{e.preventDefault();void act('invite',{email,mode,confirm:confirmed});}}>
   <label className="field">Guest email<input type="email" required autoComplete="off" value={email} disabled={busy||occupied} onChange={e=>setEmail(e.target.value)}/></label>
   <label className="field">Guest access<select value={mode} disabled={busy||occupied} onChange={e=>setMode(e.target.value)}><option value="basic">Basic features · 30 days</option><option value="match_owner">Match my current plan · 30 days</option></select></label>
   <p>One pending invitation or active guest at a time. Invitations expire if unaccepted within 30 days; accepted access lasts 30 days from acceptance. Matching access shares your existing allowance and follows plan changes.</p>
   <label><input type="checkbox" checked={confirmed} disabled={busy||occupied} onChange={e=>setConfirmed(e.target.checked)}/> I approve this guest and the selected access.</label>
   <button className="button primary" disabled={busy||occupied||!confirmed}>Create invitation</button>
  </form>}
  {link&&<label className="field">Invitation link — shown only now<input readOnly value={link} onFocus={e=>e.target.select()}/></label>}
  {state.data?.invitations.map((item:any)=><div className="notice" key={item.id}><p>{item.email} · {item.mode==='basic'?'Basic':'Matches owner'} · {item.status}</p><p>Expires {new Date(item.expires_at).toLocaleString()}</p>{['pending','active'].includes(item.status)&&<button className="button" disabled={busy} onClick={()=>void act('revoke',{id:item.id,confirm:true})}>Revoke guest access</button>}</div>)}
 </>;
}
