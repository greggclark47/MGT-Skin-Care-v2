'use client';
import {useCallback,useEffect,useState} from 'react';
let sessionRequest:Promise<any>|null=null;
export class HubError extends Error{constructor(message:string,public code:string,public status=0){super(message);}}
async function request(path:string,body?:unknown,csrf?:string){
 let response:Response;
 try{response=await fetch('/api/hub'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(path==='/admin/ai/analyze'?75000:20000),headers:body===undefined?{}:{'content-type':'application/json','x-csrf-token':csrf||''},body:body===undefined?undefined:JSON.stringify(body)});}
 catch{throw new HubError(body===undefined?'We couldn’t reach the portal. Check your connection and try again.':'The connection was interrupted. Check whether your change was saved before trying again.','connection_failed');}
 let data:any;try{data=await response.json();}catch{throw new HubError('The portal service is temporarily unavailable. Please try again shortly.','service_unavailable',response.status);}
 if(!response.ok){if(data.error?.code==='csrf_rejected')resetSession();throw new HubError(data.error?.message||'The request could not be completed.',data.error?.code||'request_failed',response.status);}
 return data;
}
export function resetSession(){sessionRequest=null;}
export function session(){if(!sessionRequest)sessionRequest=request('/session').catch(error=>{sessionRequest=null;throw error;});return sessionRequest;}
export async function hub(path:string,body?:unknown){
 const s=await session();const data=await request(path,body,s.csrf);
 if(path==='/session')sessionRequest=Promise.resolve(data);
 if(body!==undefined){if(path.startsWith('/auth/'))resetSession();window.dispatchEvent(new CustomEvent('hub:changed',{detail:path}));}
 return data;
}
export function useHub(path:string){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 const reload=useCallback(()=>setRevision(x=>x+1),[]);
 useEffect(()=>{const changed=(event:Event)=>{const mutation=(event as CustomEvent<string>).detail;const resource=path.split('?')[0];if((resource.startsWith('/billing')&&mutation.startsWith('/billing/'))||mutation.startsWith('/auth/')||mutation===path||mutation.startsWith(path+'/')||(path==='/profile'&&mutation.startsWith('/routine/')))reload();};window.addEventListener('hub:changed',changed);return()=>window.removeEventListener('hub:changed',changed);},[path,reload]);
 useEffect(()=>{let active=true;setLoading(true);setError('');hub(path).then(d=>{if(active)setData(d);}).catch(e=>{if(active){setError(e.message);setData(null);}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[path,revision]);
 return {data,error,loading,reload,setData};
}

