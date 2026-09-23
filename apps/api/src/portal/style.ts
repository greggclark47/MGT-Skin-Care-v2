import type {Express} from 'express';
import {STYLE_OPTIONS,DEFAULT_STYLE,normalizeStyle,type StyleProfile,type StyleOptionKey} from '@mgt/domain';
import type {Store} from './store';
import {check,wrap} from './security';
export function installStyle(app:Express,db:Store){
 app.get('/api/hub/style-profile',wrap(async(req,res)=>{const profile=await db.tx(r=>r.get('style_profiles',req.actor));res.json({profile:profile?{...profile,input:normalizeStyle(profile.input)}:null});}));
 app.post('/api/hub/style-profile',wrap(async(req,res)=>{
  check(req.body?.consent===true,400,'consent_required','Please agree to save your beauty and style preferences.');
  const input={} as StyleProfile;
  for(const key of Object.keys(STYLE_OPTIONS) as StyleOptionKey[]){
   const value=req.body[key]===undefined?DEFAULT_STYLE[key]:req.body[key];check((STYLE_OPTIONS[key] as readonly string[]).includes(value),400,'invalid_style','Choose a listed option for each style preference.');
   (input as any)[key]=value;
  }
  const notes=req.body.personalNotes===undefined?'':req.body.personalNotes;
  check(typeof notes==='string'&&notes.length<=500,400,'invalid_style_notes','Keep your styling brief to 500 characters.');
  input.personalNotes=notes.trim();
  const profile={input,updated_at:new Date().toISOString(),consent_version:'2026-09-07'};
  await db.tx(r=>r.put('style_profiles',req.actor,profile));res.json({profile});
 }));
}
