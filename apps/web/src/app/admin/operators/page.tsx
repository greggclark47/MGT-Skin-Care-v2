'use client';
import React,{useState} from 'react';
import {hub,useHub} from '../../../lib/hub';
import {LoadState} from '../../../components/HubFrames';

const roles=[
 {id:'superadmin',label:'Superadmin',detail:'Full portal operations and role management'},
 {id:'catalog_editor',label:'Catalog editor',detail:'Draft catalog products and knowledge'},
 {id:'sme',label:'Subject matter expert',detail:'Review product, ingredient, and knowledge drafts'},
 {id:'compliance',label:'Compliance',detail:'Review operations, support, and AI spending'},
 {id:'viewer',label:'Viewer',detail:'Read-only administration access'},
] as const;
type OperatorAccount={id:string;email:string;roles:string[];revision:number};

export default function OperatorsPage(){
 const session=useHub('/session');
 const [email,setEmail]=useState('');
 const [target,setTarget]=useState<OperatorAccount|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [confirm,setConfirm]=useState(false);
 const [lookupBusy,setLookupBusy]=useState(false),[saveBusy,setSaveBusy]=useState(false);
 const [lookupError,setLookupError]=useState(''),[saveError,setSaveError]=useState('');
 const [message,setMessage]=useState('');
 const allowed=session.data?.account?.roles?.includes('superadmin');
 const changed=target&&JSON.stringify([...selected].sort())!==JSON.stringify([...target.roles].sort());
 const busy=lookupBusy||saveBusy;

 async function lookup(event:React.FormEvent){
  event.preventDefault();setLookupBusy(true);setLookupError('');setSaveError('');setMessage('');setTarget(null);setConfirm(false);
  try{const result=await hub('/admin/operators/lookup',{email});setTarget(result.account);setSelected(result.account.roles);}
  catch(err){setLookupError((err as Error).message);}
  finally{setLookupBusy(false);}
 }
 async function save(event:React.FormEvent){
  event.preventDefault();if(!target)return;
  setSaveBusy(true);setSaveError('');setMessage('');
  try{
   const result=await hub('/admin/operators/roles',{id:target.id,email:target.email,roles:selected,expected_roles:target.roles,expected_revision:target.revision,confirm});
   setTarget(result.account);setSelected(result.account.roles);setConfirm(false);setMessage('Operator roles updated.');
  }catch(err){setSaveError((err as Error).message);}
  finally{setSaveBusy(false);}
 }
 function toggle(id:string){setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);setConfirm(false);setSaveError('');setMessage('');}
 return <main><h1 className="app-page-title">Operator access</h1>
  <p>Assign portal roles only to accounts that have already completed sign-in. Changes take effect on their next request and are recorded in the audit log.</p>
  <LoadState {...session} retry={session.reload}/>
  {session.data&&!allowed&&<p role="alert" className="notice error">Only a superadmin can manage operator access.</p>}
  {allowed&&<>
   <form className="panel stack" aria-busy={lookupBusy} aria-describedby={lookupError?'operator-lookup-error':undefined} onSubmit={event=>void lookup(event)}><h2>Find an existing account</h2>
    <label className="field">Exact account email<input type="email" value={email} maxLength={254} required aria-invalid={!!lookupError&&!target} onChange={event=>{setEmail(event.target.value);setTarget(null);setConfirm(false);setMessage('');setSaveError('');if(lookupError)setLookupError('');}}/></label>
    <button className="button primary" type="submit" disabled={busy}>{lookupBusy?'Checking…':'Find account'}</button>
   </form>
   {lookupError&&<p id="operator-lookup-error" role="alert" className="notice error">{lookupError}</p>}
   {saveError&&<p id="operator-save-error" role="alert" className="notice error">{saveError}</p>}
   {message&&<p role="status" className="notice success">{message}</p>}
   {target&&<form className="panel stack" aria-busy={saveBusy} aria-describedby={saveError?'operator-save-error':'operator-role-summary'} onSubmit={event=>void save(event)}><h2>Roles for {target.email}</h2>
    <p className="muted">Account ID: {target.id}</p>
    <p id="operator-role-summary" className="muted" role="status" aria-live="polite">{selected.length?selected.map(label=>roles.find(role=>role.id===label)?.label||label).join(', '):'No operator roles selected.'}</p>
    {roles.map(role=><label className="check-label" key={role.id}><input type="checkbox" checked={selected.includes(role.id)} disabled={saveBusy} onChange={()=>toggle(role.id)}/><span><strong>{role.label}</strong><br/>{role.detail}</span></label>)}
    <label className="check-label"><input type="checkbox" checked={confirm} disabled={saveBusy} onChange={event=>{setConfirm(event.target.checked);setSaveError('');}}/> I verified this account and approve these role changes.</label>
    <button className="button primary" type="submit" disabled={busy||!changed||!confirm}>{saveBusy?'Saving…':'Save roles'}</button>
   </form>}
  </>}
 </main>;
}
