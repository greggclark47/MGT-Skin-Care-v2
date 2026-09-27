'use client';
import React,{useState} from 'react';
import Link from 'next/link';
import {hub,useHub} from '../../lib/hub';
import {AppFrame,LoadState} from '../../components/HubFrames';
import {RestockAlerts} from '../../components/CustomerStatusPanels';
type Reminder={product_id:string;due_at:string};
type Notification={id:string;kind:string;status:'delivered'|'read';created_at:string;payload:{product_id:string;due_at:string}};
export default function Reminders(){
 const state=useHub('/reminders'),catalog=useHub('/catalog'),notificationsState=useHub('/notifications');
 const [product,setProduct]=useState(''),[days,setDays]=useState('30'),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
 const products=catalog.data?.products||[];
 const reminders:Reminder[]=[...(state.data?.reminders||[])].sort((a:Reminder,b:Reminder)=>Date.parse(a.due_at)-Date.parse(b.due_at));
 const today=new Date();today.setHours(0,0,0,0);
 const dayOffset=(date:string)=>{const due=new Date(date);due.setHours(0,0,0,0);return Math.round((due.getTime()-today.getTime())/86400000);};
 const due=reminders.filter(r=>dayOffset(r.due_at)<=0).length;
 const notifications:Notification[]=(notificationsState.data?.notifications||[]).filter((n:Notification)=>n.kind==='replenishment_reminder');
 const unread=notifications.filter(n=>n.status==='delivered').length;
 const name=(id:string)=>products.find((p:any)=>p.id===id)?.name||id.replace(/-/g,' ');
 const existing=reminders.some(r=>r.product_id===product);
 const formBusy=busy==='save';
 async function change(path:string,body:unknown,key:string,success:string){
  setBusy(key);setMessage('');setError('');
  try{await hub(path,body);setMessage(success);if(key==='save'){setProduct('');setDays('30');}}
  catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 return <AppFrame title="Replenishment"><p className="lead">Keep your next restock in view.</p><p>Reminders appear here when they are due. They never place an order; you remain in control of where and when you purchase.</p>
 {catalog.data?.demo&&<p className="notice">These are sample catalog products for trying the planner. They are not live retailer offers.</p>}
 <LoadState {...state} retry={state.reload}/>
 {message&&<p role="status" className="notice success">{message}</p>}{error&&<p id="reminder-error" role="alert" className="notice error">{error}</p>}
 <div className="restock-layout"><section className="panel restock-form" aria-labelledby="reminder-heading"><span className="eyebrow">PLAN AHEAD</span><h2 id="reminder-heading">{existing?'Update a reminder':'Set a reminder'}</h2>
 <LoadState {...catalog} retry={catalog.reload}/>
 {!catalog.loading&&!catalog.error&&products.length===0&&<p>No products are available for reminders yet.</p>}
 <form className="stack" aria-busy={formBusy} aria-describedby={error?'reminder-error':undefined} onSubmit={e=>{e.preventDefault();void change('/reminders',{product_id:product,days:Number(days)},'save',existing?'Your reminder date has been updated.':'Your reminder has been saved.');}}>
 <label className="field">Product<select required value={product} disabled={formBusy||catalog.loading||!!catalog.error} aria-invalid={!!error} onChange={e=>{setProduct(e.target.value);if(error)setError('');}}><option value="">Choose a product</option>{products.map((p:any)=><option value={p.id} key={p.id}>{p.name||p.id}</option>)}</select></label>
 <label className="field">Remind me in<input type="number" min="1" max="365" step="1" required value={days} disabled={formBusy} aria-invalid={!!error} aria-describedby={error?'reminder-days-help reminder-error':'reminder-days-help'} onChange={e=>{setDays(e.target.value);if(error)setError('');}}/><span id="reminder-days-help" className="muted">Days from today · choose 1–365</span></label>
 {existing&&<p className="muted">Saving replaces this product’s current reminder date.</p>}
 <button className="button primary" type="submit" disabled={formBusy||!product||catalog.loading||!!catalog.error||state.loading||!!state.error}>{formBusy?'Saving…':existing?'Update reminder':'Save reminder'}</button></form></section>
 <section className="restock-list" aria-labelledby="restock-heading"><div className="section-heading"><div><span className="eyebrow">YOUR RESTOCK LIST</span><h2 id="restock-heading">Upcoming reviews</h2></div></div>
 {!state.loading&&!state.error&&<><p className="muted" role="status" aria-live="polite" aria-atomic="true">{reminders.length} planned · {due} ready to review</p>
 {reminders.length===0?<div className="empty"><h3>Make room for your next restock.</h3><p>Choose a product and a date to add your first reminder.</p></div>:<ul className="restock-items">{reminders.map(r=>{const offset=dayOffset(r.due_at),snoozeBusy=busy===r.product_id,removeBusy=busy==='remove-'+r.product_id;return <li className="panel" key={r.product_id}><div className="row"><span className={'restock-status '+(offset<=0?'is-due':'')}>{offset<0?'Overdue':offset===0?'Due today':offset===1?'Tomorrow':`In ${offset} days`}</span><time dateTime={r.due_at}>{new Date(r.due_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time></div><h3>{name(r.product_id)}</h3><div className="restock-actions"><button type="button" className="button small" disabled={snoozeBusy} onClick={()=>void change('/reminders',{product_id:r.product_id,days:7},r.product_id,'Reminder moved to seven days from today.')} aria-label={'Remind me in seven days for '+name(r.product_id)}>{snoozeBusy?'Saving…':'Remind me in 7 days'}</button><button type="button" className="text-button" disabled={removeBusy} onClick={()=>void change('/reminders/remove',{product_id:r.product_id},'remove-'+r.product_id,'Reminder removed.')} aria-label={'Remove reminder for '+name(r.product_id)}>{removeBusy?'Removing…':'Remove'}</button></div></li>;})}</ul>}
 <Link className="text-link" href="/shop">Explore external retailers →</Link></>}
 </section></div>
 <section className="panel" aria-labelledby="restock-alerts" aria-describedby="restock-alert-count"><div className="section-heading"><div><span className="eyebrow">RESTOCK ALERTS</span><h2 id="restock-alerts">{unread?`${unread} new ${unread===1?'alert':'alerts'}`:'Your recent alerts'}</h2></div></div>
 <LoadState {...notificationsState} retry={notificationsState.reload}/>
 {!notificationsState.loading&&!notificationsState.error&&<RestockAlerts notifications={notifications} unread={unread} name={name} busy={busy} onRead={id=>void change('/notifications/read',{id},'notification-'+id,'Alert marked as read.')}/>}
 </section></AppFrame>;
}
