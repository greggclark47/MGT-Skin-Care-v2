import {notFound} from 'next/navigation';
import {STYLE_SECTIONS} from '@mgt/domain';
import {BeautyStudio} from '../../../components/BeautyStudio';
export function generateStaticParams(){return STYLE_SECTIONS.map(s=>({segment:s.id}));}
export async function generateMetadata({params}:{params:Promise<{segment:string}>}){const {segment}=await params;return {title:(STYLE_SECTIONS.find(s=>s.id===segment)?.title||'Beauty & Style')+' | MGT'};}
export default async function Page({params}:{params:Promise<{segment:string}>}){const {segment}=await params;const match=STYLE_SECTIONS.find(s=>s.id===segment);if(!match)notFound();return <BeautyStudio section={match.id}/>;}
