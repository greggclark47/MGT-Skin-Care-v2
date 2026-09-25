'use client';
import {useEffect,useRef} from 'react';
import Link from 'next/link';
export default function ErrorPage({reset}:{reset:()=>void}){const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>{heading.current?.focus();},[]);return <div className="page"><div className="content panel"><span className="eyebrow">LET’S TRY THAT AGAIN</span><h1 ref={heading} tabIndex={-1} className="app-page-title">This page couldn’t load.</h1><p>Please try again, or return to your applications.</p><div className="actions"><button className="button primary" onClick={reset}>Try again</button><Link className="text-link" href="/">Back to applications</Link></div></div></div>;}

