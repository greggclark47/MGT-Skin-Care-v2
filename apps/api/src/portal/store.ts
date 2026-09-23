import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { applyPortalMigrations } from './migrations';
export type Stored<T=any>={id:string;value:T};
export interface Records {
 get<T=any>(scope:string,id:string):Promise<T|undefined>;
 put(scope:string,id:string,value:unknown):Promise<void>;
 list<T=any>(scope:string):Promise<T[]>;
 entries<T=any>(scope:string):Promise<Stored<T>[]>;
 remove(scope:string,id:string):Promise<void>;
 /** Serializes only the business record being changed, not every portal request. */
 lock(key:string):Promise<void>;
}
export interface Store { tx<T>(fn:(r:Records)=>Promise<T>):Promise<T>; close():Promise<void>; kind:string }
const schema='CREATE TABLE IF NOT EXISTS hub_records (scope TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(scope,id))';
export class PgStore implements Store{
 kind='postgres'; private pool:Pool;
 constructor(url:string){this.pool=new Pool({connectionString:url,max:10,connectionTimeoutMillis:5000,statement_timeout:10000});}
 async init(migrate=false){
  try{
   if(migrate)await applyPortalMigrations(this.pool);
   // Connecting an imported database must not implicitly choose a migration lineage.
   await this.pool.query('SELECT scope,id,body FROM hub_records LIMIT 0');
   return this;
  }catch(error){await this.pool.end();throw error;}
 }
 async tx<T>(fn:(r:Records)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('BEGIN');const r:Records={
 get:async(s,i)=>{const q=await c.query('SELECT body FROM hub_records WHERE scope=$1 AND id=$2',[s,i]);return q.rows[0]?JSON.parse(q.rows[0].body):undefined;},
 put:async(s,i,v)=>{await c.query('INSERT INTO hub_records(scope,id,body) VALUES($1,$2,$3) ON CONFLICT(scope,id) DO UPDATE SET body=excluded.body',[s,i,JSON.stringify(v)]);},
 list:async(s)=>{const q=await c.query('SELECT body FROM hub_records WHERE scope=$1 ORDER BY id',[s]);return q.rows.map(x=>JSON.parse(x.body));},
 entries:async(s)=>{const q=await c.query('SELECT id,body FROM hub_records WHERE scope=$1 ORDER BY id',[s]);return q.rows.map(x=>({id:x.id,value:JSON.parse(x.body)}));},
 remove:async(s,i)=>{await c.query('DELETE FROM hub_records WHERE scope=$1 AND id=$2',[s,i]);},
 lock:async(key)=>{if(!/^[a-zA-Z0-9:_-]{1,240}$/.test(key))throw new Error('Invalid transaction lock key.');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);}
 };const result=await fn(r);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async close(){await this.pool.end();}
}
export function startupMigrations(env:NodeJS.ProcessEnv){
 if(env.NODE_ENV==='production'&&env.PORTAL_AUTO_MIGRATE==='true')throw new Error('Production database changes require a separately reviewed migration.');
 return env.PORTAL_AUTO_MIGRATE==='true';
}
// SQLite is a persistent local development adapter. Production requires PostgreSQL.
// Only this queue accesses the connection; asynchronous callbacks cannot overlap transactions.
export class LocalStore implements Store{
 kind='sqlite';private db:any;private tail:Promise<any>=Promise.resolve();
 constructor(file:string){if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});const {DatabaseSync}=require('node:sqlite');this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');this.db.exec(schema);}
 tx<T>(fn:(r:Records)=>Promise<T>):Promise<T>{const run=async()=>{this.db.exec('BEGIN IMMEDIATE');const r:Records={
 get:async(s,i)=>{const v=this.db.prepare('SELECT body FROM hub_records WHERE scope=? AND id=?').get(s,i);return v?JSON.parse(v.body):undefined;},
 put:async(s,i,v)=>{this.db.prepare('INSERT INTO hub_records(scope,id,body) VALUES(?,?,?) ON CONFLICT(scope,id) DO UPDATE SET body=excluded.body').run(s,i,JSON.stringify(v));},
 list:async(s)=>this.db.prepare('SELECT body FROM hub_records WHERE scope=? ORDER BY id').all(s).map((x:any)=>JSON.parse(x.body)),
 entries:async(s)=>this.db.prepare('SELECT id,body FROM hub_records WHERE scope=? ORDER BY id').all(s).map((x:any)=>({id:x.id,value:JSON.parse(x.body)})),
 remove:async(s,i)=>{this.db.prepare('DELETE FROM hub_records WHERE scope=? AND id=?').run(s,i);},
 lock:async()=>{}
 };try{const result=await fn(r);this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}};
 const pending=this.tail.then(run);this.tail=pending.catch(()=>{});return pending;}
 async close(){await this.tail;this.db.close();}
}
