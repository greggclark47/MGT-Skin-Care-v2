'use client';
import React,{useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {hub,useHub} from '../../lib/hub';
import {AppFrame,LoadState} from '../../components/HubFrames';

type GuideRole='customer_care'|'onboarding'|'routine_guidance'|'product_referral';
type GuideResult={kind:string;text:string;next_step?:{label:string;path:string}|null;citations?:{knowledge_id:string;title:string;text:string;source_url:string}[]};
const roleOptions:[GuideRole,string][]=[
 ['customer_care','Portal help'],['onboarding','Getting started'],['routine_guidance','Routine guidance'],['product_referral','Products and retailers'],
];

export default function Support(){
 const state=useHub('/support'),session=useHub('/session');
 const [subject,setSubject]=useState(''),[message,setMessage]=useState(''),[feedback,setFeedback]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [role,setRole]=useState<GuideRole>('customer_care'),[question,setQuestion]=useState(''),[consent,setConsent]=useState(false);
 const [guide,setGuide]=useState<GuideResult|null>(null),[guideQuestion,setGuideQuestion]=useState(''),[guideError,setGuideError]=useState(''),[guideBusy,setGuideBusy]=useState(false);
 const guideResultRef=useRef<HTMLDivElement>(null),guideErrorRef=useRef<HTMLParagraphElement>(null),requestFormRef=useRef<HTMLFormElement>(null),requestSubjectRef=useRef<HTMLInputElement>(null);
 const reviewed=role==='routine_guidance'||role==='product_referral';
 const reviewedReady=!!session.data?.account&&session.data?.ai_configured===true;

 useEffect(()=>{if(guideError)guideErrorRef.current?.focus();else if(guide)guideResultRef.current?.focus();},[guide,guideError]);

 async function askGuide(e:React.FormEvent){
  e.preventDefault();if(guideBusy||!question.trim())return;
  const submittedQuestion=question.trim();
  setGuideBusy(true);setGuideError('');setGuide(null);setGuideQuestion('');
  try{const result=await hub('/assistant',{role,message:submittedQuestion,ai_consent:reviewed&&consent});setGuideQuestion(submittedQuestion);setGuide(result);}
  catch(e){setGuideError((e as Error).message);}
  finally{setGuideBusy(false);}
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy||!subject.trim()||!message.trim())return;
  setBusy(true);setError('');setFeedback('');
  try{await hub('/support',{subject:subject.trim(),message:message.trim()});setSubject('');setMessage('');setGuideQuestion('');setFeedback('Saved to your portal requests.');}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 return <AppFrame title="Portal Support">
  <p className="lead">Keep track of help with your portal.</p>
  <div className="notice">For purchases, billing, shipping or returns, contact the vendor shown on your retailer receipt. <Link className="text-link" href="/orders">Retailer purchase help →</Link></div>
  <p>This development preview stores requests locally. External support delivery and response times are not enabled.</p>

  <section className="panel stack" aria-labelledby="guide-heading">
   <span className="eyebrow">QUICK PORTAL GUIDANCE</span><h2 id="guide-heading">Find your next step</h2>
   <p>Get directions for using the portal. A suggestion here does not submit a support request or confirm a retailer payment.</p>
   <form className="stack" onSubmit={askGuide} aria-busy={guideBusy}>
    <label className="field">Help topic
     <select value={role} disabled={guideBusy} onChange={e=>{setRole(e.target.value as GuideRole);setGuide(null);setGuideQuestion('');setGuideError('');}}>{roleOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    </label>
    <label className="field">Your question
     <textarea required maxLength={1800} value={question} disabled={guideBusy} aria-describedby="guide-count" placeholder="What would you like help with?" onChange={e=>setQuestion(e.target.value)}/>
    </label>
    <span className="muted" id="guide-count">{question.length} / 1,800 characters</span>
    {reviewed&&<>
     {!session.loading&&!reviewedReady&&<p className="notice">Retailer and payment directions remain available. For reviewed skincare answers, <Link className="text-link" href="/account">sign in →</Link> and use the analysis service when it is available.</p>}
     <label className="check-label"><input type="checkbox" checked={consent} disabled={guideBusy} onChange={e=>setConsent(e.target.checked)}/>Allow the platform analysis service to process this question.</label>
    </>}
    {guideError&&<p ref={guideErrorRef} tabIndex={-1} className="notice error" role="alert">{guideError}</p>}
    <button className="button" disabled={guideBusy||!question.trim()}>{guideBusy?'Finding guidance…':'Find guidance'}</button>
   </form>
   {guide&&<div ref={guideResultRef} tabIndex={-1} className="notice" role="status"><p>{guide.text}</p>{guide.next_step&&(guide.next_step.path==='/support'?<a className="text-link" href="#portal-request" onClick={e=>{e.preventDefault();requestFormRef.current?.focus();}}>{guide.next_step.label} →</a>:<Link className="text-link" href={guide.next_step.path}>{guide.next_step.label} →</Link>)}{guide.next_step?.path==='/support'&&guideQuestion&&!message.trim()&&<p><button type="button" className="text-button" onClick={()=>{setMessage(guideQuestion);requestSubjectRef.current?.focus();}}>Use my question as request details</button><span className="muted"> Review it below before saving.</span></p>}{!!guide.citations?.length&&<div><h3>Reviewed sources</h3>{guide.citations.map(c=><blockquote key={c.knowledge_id}><p>{c.text}</p><a className="text-link" href={c.source_url} target="_blank" rel="noopener noreferrer">{c.title} ↗</a></blockquote>)}</div>}</div>}
  </section>

  {feedback&&<p className="notice success" role="status">{feedback}</p>}{error&&<p className="notice error" role="alert">{error}</p>}
  <form ref={requestFormRef} id="portal-request" tabIndex={-1} aria-labelledby="portal-request-heading" className="panel stack support-form" onSubmit={submit}>
   <span className="eyebrow">NEW PORTAL REQUEST</span><h2 id="portal-request-heading">How can we help?</h2>
   <label className="field">Subject<input ref={requestSubjectRef} required maxLength={150} disabled={busy} value={subject} placeholder="A short summary of the issue" onChange={e=>setSubject(e.target.value)}/></label>
   <label className="field">Details<textarea required maxLength={4000} disabled={busy} value={message} placeholder="Describe what happened and which portal page you were using." aria-describedby="support-count" onChange={e=>setMessage(e.target.value)}/></label>
   <span className="muted" id="support-count">{message.length} / 4,000 characters</span>
   <button className="button primary" disabled={busy||!subject.trim()||!message.trim()}>{busy?'Saving…':'Save request'}</button>
  </form>
  <section className="support-history" aria-labelledby="requests-heading"><div className="row"><h2 id="requests-heading">Your requests</h2>{!state.loading&&!state.error&&<span className="pill">{state.data?.tickets.length||0} saved</span>}</div><LoadState {...state} retry={state.reload}/>{!state.loading&&!state.error&&<>{state.data?.tickets.map((t:any)=><article className="panel support-ticket" key={t.id}><div className="row"><h3>{t.subject}</h3><span className="pill">{String(t.status).replace(/_/g,' ')}</span></div><p className="support-message">{t.message}</p>{t.replies.length>0?<section className="support-replies" aria-label="Support replies"><h4>Replies</h4>{t.replies.map((r:any,i:number)=><blockquote key={i}>{r.text}</blockquote>)}</section>:<p className="muted">No replies yet.</p>}</article>)}{state.data?.tickets.length===0&&<div className="empty"><h3>No requests yet.</h3><p>Requests you save will appear here, together with any replies.</p></div>}</>}</section>
 </AppFrame>;
}
