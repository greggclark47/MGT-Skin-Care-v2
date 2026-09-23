import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

const migrationsDirectory=()=>process.env.PORTAL_MIGRATIONS_DIR||path.resolve(__dirname,'../../../../infra/portal/migrations');

/** Applies immutable, checked-in portal migrations before serving traffic. */
export async function applyPortalMigrations(pool:Pool){
 const directory=migrationsDirectory();
 if(!fs.existsSync(directory))throw new Error(`Portal migration directory is missing: ${directory}`);
 const files=fs.readdirSync(directory).filter(file=>/^\d+_.+\.sql$/.test(file)).sort();
 const client=await pool.connect();
 try{
  // API and worker can start together. This startup-only lock prevents both from applying the same migration.
  await client.query("SELECT pg_advisory_lock(hashtext('portal:migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS portal_schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for(const id of files){
   const applied=await client.query('SELECT 1 FROM portal_schema_migrations WHERE id=$1',[id]);
   if(applied.rowCount)continue;
   try{await client.query('BEGIN');await client.query(fs.readFileSync(path.join(directory,id),'utf8'));await client.query('INSERT INTO portal_schema_migrations(id) VALUES($1)',[id]);await client.query('COMMIT');}
   catch(error){await client.query('ROLLBACK');throw error;}
  }
 }finally{try{await client.query("SELECT pg_advisory_unlock(hashtext('portal:migrations'))");}finally{client.release();}}
}
