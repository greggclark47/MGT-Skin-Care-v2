import React from 'react';import Link from 'next/link';
export function AppFrame({title,children}:{title:string;children:React.ReactNode}){return <div className="page"><div className="content"><span className="eyebrow">YOUR CONNECTED WORKSPACE</span><h1 className="app-page-title">{title}</h1>{children}</div></div>;}
export function LoadState({loading,error,retry}:{loading:boolean;error:string;retry:()=>void}){return loading?<p role="status">Loading your workspace…</p>:error?<div className="notice error" role="alert"><p>{error}</p><button className="button" onClick={retry}>Try again</button></div>:null;}
export function NoProfile(){return <section className="panel"><h2>Start with your skin.</h2><p>Complete a Skin Match to build your profile and routine.</p><Link className="button primary" href="/skin-match">Find my Skin Match ↗</Link></section>;}
export function SampleNotice(){return <p className="notice">Routine preview · these sample products illustrate the matching flow. They are not live retailer offers. External purchases are made directly with the retailer.</p>;}

