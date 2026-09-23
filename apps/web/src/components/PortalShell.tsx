'use client';
import React,{useEffect,useState,useRef} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Brand} from './Brand';
import {useHub} from '../lib/hub';
type Theme='light'|'dark';
export function PortalShell({children}:{children:React.ReactNode}){
 const saved=useHub('/saved-retailers');const savedCount=saved.data?.ids.length||0;
 const headerRef=useRef<HTMLElement>(null);
 const path=usePathname(); const [theme,setTheme]=useState<Theme>('dark'); const [open,setOpen]=useState(false);
 useEffect(()=>{setTheme(document.documentElement.dataset.theme==='light'?'light':'dark');
 const media=matchMedia('(prefers-color-scheme: dark)');
 const sync=()=>{try{if(localStorage.getItem('mgt-theme'))return;}catch{} const t=media.matches?'dark':'light';document.documentElement.dataset.theme=t;setTheme(t);};
 const storage=(e:StorageEvent)=>{if(e.key!=='mgt-theme')return;const t=e.newValue==='light'?'light':e.newValue==='dark'?'dark':media.matches?'dark':'light';document.documentElement.dataset.theme=t;setTheme(t);};
 media.addEventListener('change',sync);window.addEventListener('storage',storage);
 return()=>{media.removeEventListener('change',sync);window.removeEventListener('storage',storage);};
 },[]);
 useEffect(()=>setOpen(false),[path]);
 useEffect(()=>{const media=matchMedia('(min-width: 601px)');const reset=()=>{if(media.matches)setOpen(false);};media.addEventListener('change',reset);return()=>media.removeEventListener('change',reset);},[]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!headerRef.current?.contains(e.target as Node))setOpen(false);};const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);document.getElementById('menu-toggle')?.focus();}};window.addEventListener('keydown',close);document.addEventListener('pointerdown',outside);return()=>{window.removeEventListener('keydown',close);document.removeEventListener('pointerdown',outside);};},[open]);
 const toggle=()=>{const t=theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;setTheme(t);try{localStorage.setItem('mgt-theme',t);}catch{}};
 const primary=[['/','Applications'],['/shop','Shop'],['/learn','Learn'],['/company','Company']];
 const appLinks=[['/skin-match','Skin Match'],['/routine','My Routine'],['/coach','Skin Coach'],['/my-skin','My Skin'],['/replenishment','Replenishment'],['/studio','Beauty & Style']];
 const isWithin=(href:string)=>path===href||path.startsWith(href+'/');
 const activePrimary=appLinks.some(([href])=>isWithin(href))?'/':isWithin('/saved')?'/shop':path;
 return <><a className="skip" href="#main">Skip to content</a><header ref={headerRef} className="header" onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);}}><Brand/><nav id="primary-navigation" className={open?'primary-nav is-open':'primary-nav'} aria-label="Primary">{primary.map(([href,label])=><Link key={href} href={href} aria-current={path===href?'page':activePrimary===href?'true':undefined}>{label}</Link>)}<Link className="mobile-only" href="/account">My account</Link><Link className="mobile-only" href="/saved">Saved retailers {savedCount>0&&<span className="bag-count">{savedCount}</span>}</Link></nav><div className="header-actions"><button className="theme-toggle" onClick={toggle} type="button" aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{theme==='dark'?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>:<path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/>}</svg><span className="theme-label">{theme==='dark'?'Light':'Dark'}</span></button><Link className="bag-link" href="/saved" aria-label={"Saved retailers, "+savedCount+" destinations"}>Saved {savedCount>0&&<span className="bag-count">{savedCount}</span>}</Link><Link className="button small account-link" href="/account">My account</Link><button id="menu-toggle" className="menu-toggle" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="primary-navigation" type="button">{open?'Close':'Menu'}</button></div></header>{path!=='/'&&<nav className="workspace-nav" aria-label="Your workspace"><Link href="/">← All apps</Link>{appLinks.map(([href,label])=><Link key={href} href={href} data-app={href.slice(1)} aria-current={isWithin(href)?'page':undefined}>{label}</Link>)}</nav>}<main id="main" tabIndex={-1}><div className="route-enter" key={path}>{children}</div></main><footer><div><Brand/><p>Thoughtful skincare. Connected.</p><small>Cosmetic guidance, not diagnosis or medical treatment.</small></div><nav aria-label="Company and policies">{[['company','Company'],['trust','Trust & AI'],['support','Support'],['privacy','Privacy'],['terms','Terms'],['shipping','Shipping & returns'],['partners','Partners'],['membership','Plans & Billing']].map(([p,l])=><Link key={p} href={'/'+p}>{l}</Link>)}</nav><small>© {new Date().getFullYear()} MGT Skin Care</small></footer></>;
}
