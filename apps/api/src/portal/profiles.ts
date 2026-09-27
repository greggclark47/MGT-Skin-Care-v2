// Profile persistence v1.2: one transaction for preferences, revision, and audit.
import {randomUUID} from 'node:crypto';
import type {Records} from './store';
import {check} from './security';
export async function readProfile(records:Records,actor:string){
 const profile=await records.get('profiles',actor)||null;
 const version=await records.get<{revision:string}>('profile_revisions',actor);
 return {profile,revision:version?.revision||profile?.revision||(profile?'legacy':null)};
}
export async function lockProfile(records:Records,actor:string,expected:unknown){
 await records.lock('profile:'+actor);
 const current=await readProfile(records,actor);
 check(expected===undefined||expected===null||typeof expected==='string'&&expected.length<=80,400,'invalid_revision','Use the profile reference returned by the portal.');
 check((expected??null)===current.revision,409,'profile_changed','Your profile changed in another session. Reload it before saving again.');
 return current.profile;
}
export async function saveProfile(records:Records,actor:string,value:any,action='profile.saved'){
 const revision=randomUUID(),profile=value?{...value,revision}:null;
 if(profile)await records.put('profiles',actor,profile);else await records.remove('profiles',actor);
 // Preserve a revision after removal so a stale client cannot resurrect deleted preferences.
 await records.put('profile_revisions',actor,{revision});
 const id=randomUUID();await records.put('audit',id,{id,actor,action,target:'self',at:new Date().toISOString()});
 return {profile,revision};
}
