'use client';
import React from 'react';import Link from 'next/link';
export default function AdminLayout({children}:{children:React.ReactNode}){return <div className="page"><nav className="tabs" aria-label="Administration"><Link href="/admin">Operations</Link><Link href="/admin/analysis">AI analysis</Link><Link href="/admin/operators">Operator access</Link><Link href="/admin/knowledge">Knowledge</Link><Link href="/admin/ingredient-rules">Ingredient rules</Link><Link href="/account">Account</Link></nav>{children}</div>;}
