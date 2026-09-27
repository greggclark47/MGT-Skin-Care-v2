import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import type {Request,Response,NextFunction} from 'express';
import type {Store,Records} from './store';
export const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export class Fault extends Error{constructor(public status:number,public code:string,message:string){super(message);}}
export function check(ok:unknown,status:number,code:string,message:string):asserts ok{if(!ok)throw new Fault(status,code,message);}
export type HubRequest=Request & {sid:string;actor:string;csrf:string;account?:{id:string,email:string,roles:string[]};requestId:string};
export type Session={id:string;actor:string;csrf:string;expires:number;userId?:string};
export const wrap=(fn:(req:HubRequest,res:Response,next:NextFunction)=>Promise<any>)=>(req:Request,res:Response,next:NextFunction)=>Promise.resolve(fn(req as HubRequest,res,next)).catch(next);
const same=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function sessionMiddleware(store:Store,origin:string,production:boolean){
 const cookie=production?'__Host-mgt':'mgt';
 return wrap(async(req,res,next)=>{
  const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1);
  const session=await store.tx(async db=>{
   const sessionId=raw&&/^[a-f0-9]{64}$/.test(raw)?hash(raw):undefined;
   if(sessionId)await db.lock('session:'+sessionId);
   let s=sessionId?await db.get<Session>('sessions',sessionId):undefined;
   if(s&&s.expires<=Date.now()){await db.remove('sessions',s.id);s=undefined;}
   if(s?.userId){const user=await db.get('accounts',s.userId);if(user)req.account=user;else{await db.remove('sessions',s.id);s=undefined;}}
   if(!s){const secret=token();s={id:hash(secret),actor:'guest_'+token(),csrf:token(),expires:Date.now()+86400000};
    await db.put('sessions',s.id,s);res.cookie(cookie,secret,{httpOnly:true,secure:production,sameSite:'lax',path:'/',maxAge:86400000});}
   return s;
  });
  req.sid=session.id;req.actor=session.actor;req.csrf=session.csrf;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   check(req.headers.origin===origin,403,'origin_rejected','This request must come from the portal.');
   check(typeof req.headers['x-csrf-token']==='string'&&same(req.headers['x-csrf-token'],session.csrf),403,'csrf_rejected','Refresh this page and try again.');
  }
  next();
 });
}
export async function rate(db:Records,key:string,limit:number,windowMs:number){
 await db.lock('rate:'+key);
 const now=Date.now();let r=await db.get('rate',key);if(!r||r.reset<=now)r={id:key,count:0,reset:now+windowMs};r.count++;await db.put('rate',key,r);
 check(r.count<=limit,429,'rate_limited','Too many requests. Please wait and try again.');
}
export function account(req:HubRequest){check(req.account,401,'sign_in_required','Please sign in to continue.');return req.account;}
export function role(req:HubRequest,allowed:string[]){const a=account(req);check(a.roles.some(r=>allowed.includes(r)),403,'forbidden','Your account does not have access to this action.');return a;}
export function text(v:unknown,max=2000){check(typeof v==='string'&&v.trim().length>0&&v.length<=max,400,'invalid_input','Please enter a valid value.');return v.trim();}
