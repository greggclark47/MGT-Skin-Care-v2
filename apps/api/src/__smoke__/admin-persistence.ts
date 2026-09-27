import { Pool } from 'pg';
import { PgKnowledgeRepository, PgAdminAuditRepository, PgAdminUserRepository } from '../persistence/postgres';
import { transition, type KnowledgeObject } from '@mgt/domain';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 240) : ''); }
}

const obj = (over: Partial<KnowledgeObject> = {}): KnowledgeObject => ({
  id: 'pg-kb-1', title: 'Ceramides', body: 'Barrier support ingredient.',
  evidence_level: 'peer_reviewed', source_url: null, source_date: '2025-03-01',
  version: 1, status: 'draft', sme_approved_by: null, sme_approved_at: null, retired_reason: null, ...over,
});

async function main() {
  const pool = new Pool({ host: '/tmp', port: 5499, user: 'postgres', database: 'postgres' });
  const knowledge = new PgKnowledgeRepository(pool);
  const audit = new PgAdminAuditRepository(pool);
  const users = new PgAdminUserRepository(pool);
  const SME = '22222222-2222-2222-2222-222222222222';

  console.log('\n== Knowledge repo against real Postgres ==');
  await knowledge.save(obj());
  const loaded = await knowledge.get('pg-kb-1');
  check('round-trips a draft', loaded?.status === 'draft' && loaded?.evidence_level === 'peer_reviewed', loaded);
  check('source_date normalised to a date string', loaded?.source_date === '2025-03-01', loaded?.source_date);

  check('draft not retrievable', (await knowledge.searchRetrievable('ceramides', 5)).length === 0);

  const reviewed = transition({ object: loaded!, to: 'in_review', actor_id: SME, actor_is_sme: true });
  await knowledge.save((reviewed as any).object);
  const approved = transition({ object: (reviewed as any).object, to: 'approved', actor_id: SME, actor_is_sme: true });
  await knowledge.save((approved as any).object);

  const retrievable = await knowledge.searchRetrievable('ceramides', 5);
  check('approved object becomes retrievable', retrievable.length === 1 && retrievable[0].id === 'pg-kb-1', retrievable.map((r) => r.id));
  check('reviewer persisted', (await knowledge.get('pg-kb-1'))?.sme_approved_by === SME);

  // Retire it; RAG must lose access immediately.
  const retired = transition({ object: (approved as any).object, to: 'retired', actor_id: SME, actor_is_sme: true, reason: 'Superseded by kb-2' });
  await knowledge.save((retired as any).object);
  check('retired object leaves the retrievable set', (await knowledge.searchRetrievable('ceramides', 5)).length === 0);
  check('retire reason persisted', (await knowledge.get('pg-kb-1'))?.retired_reason === 'Superseded by kb-2');

  check('list() sees all statuses', (await knowledge.list()).length >= 1);
  check('list(approved) excludes the retired row', (await knowledge.list('approved')).every((o) => o.id !== 'pg-kb-1'));

  console.log('\n== Audit repo ==');
  await audit.record({ actor_id: SME, action: 'knowledge.approved', target_type: 'knowledge_object', target_id: 'pg-kb-1', before: { status: 'in_review' }, after: { status: 'approved' }, created_at: new Date().toISOString() });
  const entries = await audit.listForTarget('knowledge_object', 'pg-kb-1');
  check('audit entry persisted with jsonb before/after', entries.length === 1 && (entries[0].after as any).status === 'approved', entries);

  console.log('\n== Admin user repo ==');
  await pool.query(`insert into admin_users (id, email, roles) values ($1, $2, $3) on conflict (id) do nothing`, [SME, 'sme@mgt.test', ['sme']]);
  const admin = await users.get(SME);
  check('roles round-trip as an array', admin?.roles.length === 1 && admin.roles[0] === 'sme', admin);
  check('unknown admin returns null', (await users.get('33333333-3333-3333-3333-333333333333')) === null);

  await pool.end();
  console.log(failures === 0 ? '\nADMIN PERSISTENCE: ALL CHECKS PASSED (real Postgres 16)' : `\nADMIN PERSISTENCE: ${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
