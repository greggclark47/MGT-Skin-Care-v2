// Owner-approved guest access v1.3. Invitations share benefits, never identity or profile data.
import type {Express} from 'express';
import type {Records,Store} from './store';
import {account,check,hash,rate,token,wrap} from './security';
const DAYS_30=30*86400000;
type Invitation={id:string;owner_id:string;owner_actor:string;email:string;mode:'basic'|'match_owner';status:'pending'|'active'|'revoked';created_at:string;expires_at:string;guest_actor?:string;accepted_at?:string;revoked_at?:string};
const current=(invite:Invitation|undefined,at=Date.now())=>!!invite&&invite.status!=='revoked'&&Date.parse(invite.expires_at)>at;
const publicInvite=(invite:Invitation)=>({id:invite.id,email:invite.email,mode:invite.mode,status:current(invite)?invite.status:invite.status==='revoked'?'revoked':'expired',expires_at:invite.expires_at});
export async function activeGuestAccess(records:Records,actor:string,at=Date.now()){
 const membership=await records.get<{invitation_id:string}>('guest_memberships',actor);
 const invite=membership?await records.get<Invitation>('guest_invitations',membership.invitation_id):undefined;
 if(!invite||!current(invite,at)||invite.status!=='active'||invite.guest_actor!==actor||invite.owner_actor===actor)return null;
 if(!await records.get('accounts',invite.owner_id)||await records.get('deletion_requests',invite.owner_actor))return null;
 return {mode:invite.mode,expires_at:invite.expires_at,owner_actor:invite.owner_actor,owner_id:invite.owner_id};
}
export function installGuestAccess(app:Express,store:Store){
 app.get('/api/hub/guest-access',wrap(async(req,res)=>{
  const user=account(req);res.json(await store.tx(async records=>{
   const access=await activeGuestAccess(records,req.actor);
   const invitations=(await records.list<Invitation>('guest_invitations')).filter(item=>item.owner_id===user.id).map(publicInvite);
   return {access:access?{mode:access.mode,expires_at:access.expires_at}:null,invitations,limit:1,duration_days:30};
  }));
 }));
 app.post('/api/hub/guest-access/invite',wrap(async(req,res)=>{
  const user=account(req),email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
  check(email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email!==user.email.toLowerCase(),400,'invalid_guest','Use the invited person’s own email address.');
  check(['basic','match_owner'].includes(req.body.mode)&&req.body.confirm===true,400,'invalid_guest_access','Choose and approve the guest access level.');
  const secret=token(),id='invite_'+hash(secret);
  const invitation=await store.tx(async records=>{
   await records.lock('guest-owner:'+hash(user.id));
   check(!await activeGuestAccess(records,req.actor),403,'guest_cannot_invite','Invited access cannot be passed on to another guest.');
   check(!await records.get('deletion_requests',req.actor),409,'account_closing','Cancel the account deletion request before inviting a guest.');
   await rate(records,'guest-invite:'+hash(user.id),5,86400000);
   const existing=(await records.list<Invitation>('guest_invitations')).filter(item=>item.owner_id===user.id&&current(item));
   check(existing.length===0,409,'guest_limit','One invitation or active guest is allowed at a time. Revoke the existing invitation first.');
   const value:Invitation={id,owner_id:user.id,owner_actor:req.actor,email,mode:req.body.mode,status:'pending',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+DAYS_30).toISOString()};
   await records.put('guest_invitations',id,value);return value;
  });
  // A fragment avoids putting the invitation credential in server request URLs.
  res.status(201).json({invitation:publicInvite(invitation),invite_path:'/account#guest-invite='+secret});
 }));
 app.post('/api/hub/guest-access/accept',wrap(async(req,res)=>{
  const user=account(req);check(typeof req.body.token==='string'&&/^[a-f0-9]{64}$/.test(req.body.token)&&req.body.confirm===true,400,'invalid_invitation','Use a valid invitation and confirm acceptance.');
  const id='invite_'+hash(req.body.token);
  const access=await store.tx(async records=>{
   await records.lock('guest-recipient:'+hash(user.id));
   let invitation=await records.get<Invitation>('guest_invitations',id);
   check(invitation&&invitation.email===user.email.toLowerCase()&&invitation.owner_id!==user.id,404,'invitation_missing','No invitation is available for this signed-in email.');
   await records.lock('guest-owner:'+hash(invitation.owner_id));
   invitation=await records.get<Invitation>('guest_invitations',id);
   check(invitation&&current(invitation),410,'invitation_expired','This invitation has expired or was revoked.');
   check(!!await records.get('accounts',invitation.owner_id)&&!await records.get('deletion_requests',invitation.owner_actor),409,'owner_unavailable','This invitation is no longer available.');
   if(invitation.status==='active'){check(invitation.guest_actor===req.actor,409,'invitation_used','This invitation has already been accepted.');return publicInvite(invitation);}
   check(!await activeGuestAccess(records,req.actor),409,'already_invited','An active guest invitation is already linked to this account.');
   check(!(await records.list<Invitation>('guest_invitations')).some(item=>item.owner_id===user.id&&current(item)),409,'guest_chain','Revoke your own invitations before accepting guest access.');
   const accepted:Invitation={...invitation,status:'active',guest_actor:req.actor,accepted_at:new Date().toISOString(),expires_at:new Date(Date.now()+DAYS_30).toISOString()};
   await records.put('guest_invitations',id,accepted);await records.put('guest_memberships',req.actor,{invitation_id:id});return publicInvite(accepted);
  });res.json({access});
 }));
 app.post('/api/hub/guest-access/revoke',wrap(async(req,res)=>{
  const user=account(req);check(typeof req.body.id==='string'&&/^invite_[a-f0-9]{64}$/.test(req.body.id)&&req.body.confirm===true,400,'invalid_invitation','Choose an invitation and confirm revocation.');
  await store.tx(async records=>{await records.lock('guest-owner:'+hash(user.id));const invitation=await records.get<Invitation>('guest_invitations',req.body.id);
   check(invitation?.owner_id===user.id,404,'invitation_missing','No such invitation.');
   await records.put('guest_invitations',invitation.id,{...invitation,status:'revoked',revoked_at:new Date().toISOString()});
  });res.json({revoked:true});
 }));
}
