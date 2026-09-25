import React from 'react';
import {PortalShell} from '../components/PortalShell';
import './globals.css';
import './theme.css';
export const metadata={title:{default:'MGT Skin Care — Your skincare, connected',template:'%s · MGT Skin Care'},description:'A personal workspace for skincare routines, ingredient guidance and considered shopping.',icons:{icon:'/mgt-mark.svg'}};
const themeScript="try{var t=localStorage.getItem('mgt-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}";
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body><PortalShell>{children}</PortalShell></body></html>}
