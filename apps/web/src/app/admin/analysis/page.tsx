'use client';
import React,{useState} from 'react';
import {hub,useHub} from '../../../lib/hub';
import {LoadState} from '../../../components/HubFrames';

function BudgetReservations({canReconcile}:{canReconcile:boolean}){
 const holds=useHub('/admin/ai/reservations');
 const [busyId,setBusyId]=useState('');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 async function reconcile(event:React.FormEvent<HTMLFormElement>,id:string){
  event.preventDefault();setBusyId(id);setError('');setMessage('');
  const form=new FormData(event.currentTarget);
  try{
   await hub('/admin/ai/reservations/reconcile',{id,
    actual_cents:Number(form.get('actual_cents')),
    billing_reference:String(form.get('billing_reference')||''),
    confirmed_no_charge:form.get('confirmed_no_charge')==='on',
    confirm:form.get('confirm')==='on'});
   setMessage('Reservation reconciled.');holds.reload();
  }catch(err){setError((err as Error).message);}
  finally{setBusyId('');}
 }
 return <section className="panel"><h2>Unresolved AI spending holds</h2>
  <p className="muted">Only holds older than {holds.data?.minimum_age_minutes??10} minutes appear. Compare each with the service billing record before entering an actual cost. Unknown charges continue to count against the daily allowance.</p>
  <LoadState {...holds} retry={holds.reload}/>
  {error&&<p id="reservation-error" role="alert" className="notice error">{error}</p>}
  {message&&<p role="status" className="notice success">{message}</p>}
  {holds.data?.pending?.length===0&&<p>No older pending holds.</p>}
  {holds.data?.pending?.map((hold:any)=><article key={hold.id} className="panel">
   <h3>Reservation {hold.id}</h3>
   <p>Account and budget: {hold.budget_key}<br/>Reserved: ${(Number(hold.reserved_cents)/100).toFixed(4)} · Created: {new Date(hold.created_at).toLocaleString()}</p>
   {canReconcile&&<form className="stack" aria-busy={busyId===hold.id} aria-describedby={error?'reservation-error':undefined} onSubmit={event=>void reconcile(event,hold.id)}>
    <label className="field">Verified service cost in cents<input name="actual_cents" type="number" min="0" step="0.000001" required/></label>
    <label className="field">Billing reference<input name="billing_reference" required minLength={8} maxLength={200}/></label>
    <label className="check-label"><input name="confirmed_no_charge" type="checkbox"/> Provider confirms there was no charge (required when cost is zero)</label>
    <label className="check-label"><input name="confirm" type="checkbox" required/> I checked the service billing record and confirm this amount.</label>
    <button className="button" disabled={busyId===hold.id}>{busyId===hold.id?'Reconciling…':'Reconcile hold'}</button>
   </form>}
  </article>)}
  {holds.data&&<><h3>Recent reconciliations</h3>
   {holds.data.recent?.length===0?<p>No holds have been reconciled yet.</p>:<div className="table-wrap"><table><thead><tr><th>Reservation</th><th>Budget</th><th>Reserved</th><th>Verified cost</th><th>Provider reference</th><th>Reconciled by</th><th>Time</th></tr></thead><tbody>
    {holds.data.recent?.map((item:any)=><tr key={item.id}><td>{item.id}</td><td>{item.budget_key}</td><td>${(Number(item.reserved_cents)/100).toFixed(4)}</td><td>${(Number(item.actual_cents)/100).toFixed(4)}</td><td>{item.billing_reference}</td><td>{item.operator_id}</td><td>{new Date(item.reconciled_at).toLocaleString()}</td></tr>)}
   </tbody></table></div>}</>}
 </section>;
}

export default function AnalysisPage(){
 const admin=useHub('/admin');
 const [question,setQuestion]=useState('');
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [result,setResult]=useState<any>(null);
 const allowed=admin.data?.roles?.some((role:string)=>['superadmin','compliance'].includes(role));
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');setResult(null);
  try{setResult(await hub('/admin/ai/analyze',{question,ai_consent:consent}));}
  catch(err){setError((err as Error).message);}
  finally{setBusy(false);}
 }
 return <main><h1 className="app-page-title">Portal AI analysis</h1>
  <p>For authorized operators to review complex portal operations questions. Responses are advisory and do not change the portal.</p>
  <LoadState {...admin} retry={admin.reload}/>
  {admin.data&&!allowed&&<p role="alert" className="notice error">Your account cannot use this tool.</p>}
  {allowed&&<form className="panel stack" aria-busy={busy} aria-describedby={error?'analysis-error':'analysis-help'} onSubmit={submit}>
   <label className="field">Operational question<textarea value={question} aria-invalid={!!error} aria-describedby={error?'analysis-help analysis-error':'analysis-help'} onChange={event=>{setQuestion(event.target.value);if(error)setError('');}} maxLength={1200} required/></label>
   <p id="analysis-help" className="muted">Do not include customer details, medical information, passwords, or access credentials. Complex analysis is limited to three requests per day.</p>
   <label className="check-label"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/> I allow this question to be processed by the platform analysis service.</label>
   <button className="button primary" disabled={busy||!consent}>{busy?'Analyzing…':'Analyze question'}</button>
  </form>}
  {error&&<p id="analysis-error" role="alert" className="notice error">{error}</p>}
  {result&&<section className="panel" role="status" aria-live="polite"><h2>Analysis</h2><p>{result.analysis?.analysis}</p>
   <h3>Risks</h3><ul>{result.analysis?.risks?.map((item:string,index:number)=><li key={index}>{item}</li>)}</ul>
   <h3>Recommendations</h3><ul>{result.analysis?.recommendations?.map((item:string,index:number)=><li key={index}>{item}</li>)}</ul>
   <p className="muted">Estimated usage cost: ${(Number(result.cost_cents)/100).toFixed(4)}</p>
  </section>}
  {allowed&&<BudgetReservations canReconcile={admin.data.roles.includes('superadmin')}/>}
 </main>;
}
