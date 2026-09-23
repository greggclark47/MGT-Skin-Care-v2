'use client';
import React,{useState} from 'react';
import Link from 'next/link';
import {CORE_STEPS,OPTIONAL_STEPS} from '@mgt/shared';
import {hub,useHub} from '../../lib/hub';
import {AppFrame,LoadState,NoProfile,SampleNotice} from '../../components/HubFrames';
const labels:Record<string,string>={skin_type:'Skin type',concerns:'Your priorities',sensitivity:'Sensitivity',age_band:'Age range',current_routine:'Current routine',desired_outcome:'Desired outcome',budget_range:'Budget per product',ingredient_avoidances:'Ingredients you avoid'};
function display(key:string,value:unknown):string{
 const choices=[...CORE_STEPS,...OPTIONAL_STEPS].find(s=>s.id===key)?.choices;
 const format=(item:unknown)=>choices?.find(c=>c.value===item)?.label||String(item).replace(/_/g,' ');
 return Array.isArray(value)?value.map(format).join(', ')||'None selected':value==null?'Not set':format(value);
}
export default function MySkin(){
 const state=useHub('/profile'),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');const p=state.data?.profile;
 async function feedback(value:string){setBusy(value);setMessage('');setError('');try{const result=await hub('/profile/feedback',{feedback:value,expected_revision:state.data?.revision??null});setMessage(result.text);}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <AppFrame title="My Skin"><p className="lead">Your preferences, connected to your daily care.</p><LoadState {...state} retry={state.reload}/>{message&&<p role="status" className="notice success">{message}</p>}{error&&<p role="alert" className="notice error">{error}</p>}
 {!state.loading&&!state.error&&(p?<>{p.sample&&<SampleNotice/>}<section className="skin-overview" aria-label="Profile overview">{['skin_type','sensitivity','desired_outcome'].map(key=><div key={key}><span>{labels[key]}</span><strong>{display(key,p.input[key])}</strong></div>)}</section>
 <section className="panel skin-preferences" aria-labelledby="preferences-heading"><div className="row"><div><span className="eyebrow">YOUR PROFILE</span><h2 id="preferences-heading">Saved preferences</h2></div><Link className="button small" href="/skin-match">Update preferences</Link></div><dl className="profile-details">{Object.entries(p.input).map(([key,value])=><div key={key}><dt>{labels[key]||key.replace(/_/g,' ')}</dt><dd>{display(key,value)}</dd></div>)}</dl><Link className="text-link" href="/routine">View my routine →</Link></section>
 <section className="panel skin-feedback" aria-labelledby="feedback-heading"><span className="eyebrow">ROUTINE CHECK-IN</span><h2 id="feedback-heading">How is your routine feeling?</h2><p>Reporting irritation makes your saved sensitivity preference more cautious and rebuilds your routine.</p><div className="skin-feedback-options">{[['comfortable','Comfortable','My routine feels comfortable.'],['no_change','No change','I haven’t noticed a change.'],['irritation','Irritated','Use more cautious preferences.']].map(([id,label,hint])=><button type="button" key={id} className={'skin-feedback-option feedback-'+id} disabled={!!busy} onClick={()=>void feedback(id)}><strong>{busy===id?'Saving…':label}</strong><span>{hint}</span></button>)}</div>{p.last_feedback&&<p className="skin-last-feedback">Last check-in: <strong>{({comfortable:'Comfortable',no_change:'No change',irritation:'Irritated'} as Record<string,string>)[p.last_feedback]||p.last_feedback}</strong>{p.feedback_at&&<> · <time dateTime={p.feedback_at}>{new Date(p.feedback_at).toLocaleDateString()}</time></>}</p>}</section></>:<NoProfile/>)}</AppFrame>;
}
