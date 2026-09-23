import { Pool } from 'pg';
import { PgIngredientRuleRepository } from '../persistence/postgres';
import { compileMatrix } from '@mgt/domain';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 200) : ''); }
}

async function main() {
  const pool = new Pool({ host: '/tmp', port: 5499, user: 'postgres', database: 'postgres' });
  const repo = new PgIngredientRuleRepository(pool);
  const SME = '00000000-0000-0000-0000-000000000001';

  console.log('\n== Ingredient rules against real Postgres ==');
  const active = await repo.listActive();
  check('seed migration produced a live matrix', active.length === 14, active.length);
  const compiled = compileMatrix(active);
  check('matrix compiles from DB rows', compiled.rules.size === 14 && compiled.matrix_version.startsWith('im-'), compiled.matrix_version);
  const beforeDigest = compiled.matrix_version;

  check('numeric threshold parsed as a number', typeof active[0].sensitivity_ceiling_required === 'number');
  const retinol = await repo.get('retinol');
  check('approved retinol threshold is the seeded value', retinol?.sensitivity_ceiling_required === 0.6, retinol?.sensitivity_ceiling_required);

  // Draft a tighter threshold; the live matrix must not move.
  await repo.saveDraft({
    ingredient_key: 'retinol', display_name: 'Retinol', sensitivity_ceiling_required: 0.95,
    triggers_avoid_flag: 'high_strength_actives', rationale: 'Tightened after irritation reports.',
    version: 2, status: 'draft', sme_approved_by: null, sme_approved_at: null,
  });
  const stillLive = compileMatrix(await repo.listActive());
  check('pending draft does not change the live matrix', stillLive.matrix_version === beforeDigest);
  check('draft retrievable separately', (await repo.getDraft('retinol'))?.sensitivity_ceiling_required === 0.95);

  await repo.approve({
    ingredient_key: 'retinol', display_name: 'Retinol', sensitivity_ceiling_required: 0.95,
    triggers_avoid_flag: 'high_strength_actives', rationale: 'Tightened after irritation reports.',
    version: 2, status: 'approved', sme_approved_by: SME, sme_approved_at: new Date().toISOString(),
  });
  const afterActive = await repo.listActive();
  check('still exactly one approved rule per ingredient', afterActive.filter((r) => r.ingredient_key === 'retinol').length === 1, afterActive.filter((r) => r.ingredient_key === 'retinol').length);
  check('new threshold now in force', (await repo.get('retinol'))?.sensitivity_ceiling_required === 0.95);
  check('matrix digest changed after approval', compileMatrix(afterActive).matrix_version !== beforeDigest);
  check('superseded version retained for audit', (await repo.list()).some((r) => r.ingredient_key === 'retinol' && r.version === 1 && r.status === 'retired'));
  check('no pending draft remains', (await repo.getDraft('retinol')) === null);

  await pool.end();
  console.log(failures === 0 ? '\nINGREDIENT RULES PERSISTENCE: ALL CHECKS PASSED (real Postgres 16)' : `\n${failures} FAILED`);
  if (failures > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
