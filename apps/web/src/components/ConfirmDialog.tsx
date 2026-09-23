'use client';
import React,{useEffect,useId,useRef} from 'react';
export function ConfirmDialog({open,title,children,busy=false,onCancel,onConfirm,confirmLabel='Confirm'}:{open:boolean;title:string;children:React.ReactNode;busy?:boolean;onCancel:()=>void;onConfirm:()=>void;confirmLabel?:string}){
 const dialog=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const el=dialog.current;if(open&&!el?.open)el?.showModal();else if(!open&&el?.open)el.close();return()=>{if(el?.open)el.close();};},[open]);
 return <dialog ref={dialog} className="confirm-dialog" aria-labelledby={id} onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}><h2 id={id}>{title}</h2><div>{children}</div><div className="actions"><button type="button" className="button" disabled={busy} autoFocus onClick={onCancel}>Cancel</button><button type="button" className="button primary" disabled={busy} onClick={onConfirm}>{busy?'Saving…':confirmLabel}</button></div></dialog>;
}

