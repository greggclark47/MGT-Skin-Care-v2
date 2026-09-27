import http from 'http';
import {
  compileMatrix, assertUsableMatrix, EmptySafetyMatrixError, ingredientAllowedByMatrix,
  unreviewedIngredients, isActiveRule, SEED_INGREDIENT_RULES, type VersionedIngredientRule, type AvoidFlags,
} from '@mgt/domain';
import { createApp } from '../server';
import { InMemoryOrderRepository, InMemoryWebhookEventRepository, InMemoryKnowledgeRepository, InMemoryAdminUserRepository, InMemoryAdminAuditRepository, InMemoryIngredientRuleRepository } from '../persistence/in-memory';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 240) : ''); }
}

const approvedSeed = (): VersionedIngredientRule[] =>
  SEED_INGREDIENT_RULES.map((r) => ({ ...r, status: 'approved' as const, sme_approved_by: 'sme-seed', sme_approved_at: '2026-01-01T00:00:00Z' }));

const noFlags: AvoidFlags = { fragrance: false, essential_oils: false, alcohol_denat: false, physical_exfoliants: false, high_strength_actives: false };

async function main() {
  console.log('\n== 1. FAIL CLOSED on an empty safety matrix ==');
  {
    let threw = false;
    try { assertUsableMatrix([]); } catch (e) { threw = e instanceof EmptySafetyMatrixError; }
    check('empty rule set throws rather than returning []', threw);

    let threwDrafts = false;
    const draftsOnly = SEED_INGREDIENT_RULES.map((r) => ({ ...r, status: 'draft' as const, sme_approved_by: null, sme_approved_at: null }));
    try { assertUsableMatrix(draftsOnly); } catch (e) { threwDrafts = e instanceof EmptySafetyMatrixError; }
    // The dangerous case: rows exist, so a naive length check passes, but NONE are approved.
    check('drafts-only matrix also fails closed', threwDrafts);

    let compileThrew = false;
    try { compileMatrix([]); } catch (e) { compileThrew = e instanceof EmptySafetyMatrixError; }
    check('compileMatrix refuses to build an empty matrix', compileThrew);
  }

  console.log('\n== 2. Only approved rules gate recommendations ==');
  {
    const mixed: VersionedIngredientRule[] = [
      ...approvedSeed().filter((r) => r.ingredient_key === 'niacinamide'),
      { ingredient_key: 'retinol', display_name: 'Retinol', sensitivity_ceiling_required: 0.6, triggers_avoid_flag: 'high_strength_actives', rationale: 'proposed', version: 2, status: 'draft', sme_approved_by: null, sme_approved_at: null },
    ];
    const compiled = compileMatrix(mixed);
    check('draft rule excluded from the compiled matrix', compiled.rules.has('niacinamide') && !compiled.rules.has('retinol'), [...compiled.rules.keys()]);
    check('isActiveRule gates on approved only', isActiveRule({ status: 'approved' }) && !isActiveRule({ status: 'draft' }) && !isActiveRule({ status: 'retired' }));
  }

  console.log('\n== 3. Matrix behaviour and reproducibility ==');
  {
    const compiled = compileMatrix(approvedSeed());
    // A highly reactive profile (low ceiling) must be excluded from strong actives.
    check('reactive profile excluded from retinol', ingredientAllowedByMatrix('retinol', compiled, 0.15, noFlags, []) === false);
    check('tolerant profile allowed retinol', ingredientAllowedByMatrix('retinol', compiled, 0.8, noFlags, []) === true);
    check('gentle ingredient allowed at low tolerance', ingredientAllowedByMatrix('ceramides', compiled, 0.15, noFlags, []) === true);
    check('avoid flag overrides tolerance', ingredientAllowedByMatrix('fragrance', compiled, 0.95, { ...noFlags, fragrance: true }, []) === false);
    check('user-declared avoidance always wins', ingredientAllowedByMatrix('ceramides', compiled, 0.9, noFlags, ['ceramides']) === false);
    check('unreviewed ingredient is not blocked', ingredientAllowedByMatrix('some_new_peptide', compiled, 0.5, noFlags, []) === true);

    // The digest must be stable across ordering and change when a threshold changes —
    // that is what makes it usable as an audit key on a stored recommendation.
    const shuffled = [...approvedSeed()].reverse();
    check('matrix_version is order-independent', compileMatrix(shuffled).matrix_version === compiled.matrix_version, [compileMatrix(shuffled).matrix_version, compiled.matrix_version]);
    const changed = approvedSeed().map((r) => r.ingredient_key === 'retinol' ? { ...r, sensitivity_ceiling_required: 0.9 } : r);
    check('matrix_version changes when a threshold changes', compileMatrix(changed).matrix_version !== compiled.matrix_version);

    const backlog = unreviewedIngredients(['niacinamide', 'some_new_peptide', 'bakuchiol', 'niacinamide'], compiled);
    check('unreviewed backlog reported and deduped', backlog.length === 2 && backlog[0] === 'bakuchiol', backlog);
  }

  console.log('\n== 4. Admin API: edits never weaken the live matrix ==');
  {
    const users = new InMemoryAdminUserRepository();
    users.set({ id: 'u-sme', email: 'sme@mgt', roles: ['sme'] });
    users.set({ id: 'u-super', email: 'super@mgt', roles: ['superadmin'] });
    const rules = new InMemoryIngredientRuleRepository(approvedSeed());
    const audit = new InMemoryAdminAuditRepository();

    const app = createApp({
      orders: new InMemoryOrderRepository(), webhookEvents: new InMemoryWebhookEventRepository(),
      knowledge: new InMemoryKnowledgeRepository(), adminUsers: users, adminAudit: audit, ingredientRules: rules,
    });
    const server = app.listen(4502);
    const call = (method: string, path: string, actor?: string, body?: unknown): Promise<{ status: number; body: any }> =>
      new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const headers: Record<string, string> = {};
        if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = String(Buffer.byteLength(data)); }
        if (actor) headers['x-admin-user-id'] = actor;
        const req = http.request({ host: 'localhost', port: 4502, path, method, headers }, (res) => {
          let c = ''; res.on('data', (d) => (c += d));
          res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(c || '{}') }));
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
      });

    try {
      const active = await call('GET', '/admin/ingredient-rules/active', 'u-sme');
      check('live matrix served with a digest', active.status === 200 && typeof active.body.matrix_version === 'string' && active.body.rule_count === SEED_INGREDIENT_RULES.length, active.body?.rule_count);
      const originalDigest = active.body.matrix_version;

      const noRationale = await call('PUT', '/admin/ingredient-rules/retinol', 'u-sme', { sensitivity_ceiling_required: 0.9 });
      check('rationale is mandatory', noRationale.status === 400 && noRationale.body.error.code === 'rationale_required', noRationale.body);

      const badRange = await call('PUT', '/admin/ingredient-rules/retinol', 'u-sme', { sensitivity_ceiling_required: 1.7, rationale: 'x' });
      check('threshold must be within 0..1', badRange.status === 400, badRange.body);

      const edit = await call('PUT', '/admin/ingredient-rules/retinol', 'u-sme', { sensitivity_ceiling_required: 0.95, rationale: 'Tightening after irritation reports.' });
      check('edit accepted as a draft', edit.status === 200 && edit.body.rule.status === 'draft', edit.body?.rule?.status);
      check('edit explains that the live rule still applies', typeof edit.body.note === 'string', edit.body.note);

      const afterEdit = await call('GET', '/admin/ingredient-rules/active', 'u-sme');
      // The safety-critical property: a pending edit must not change what is in force.
      check('live matrix UNCHANGED by a pending edit', afterEdit.body.matrix_version === originalDigest, [afterEdit.body.matrix_version, originalDigest]);
      check('live retinol threshold still the approved one', (await rules.get('retinol'))?.sensitivity_ceiling_required === 0.6, (await rules.get('retinol'))?.sensitivity_ceiling_required);

      const superApprove = await call('POST', '/admin/ingredient-rules/retinol/approve', 'u-super');
      check('superadmin cannot approve a safety rule', superApprove.status === 403, superApprove.body);

      const smeApprove = await call('POST', '/admin/ingredient-rules/retinol/approve', 'u-sme');
      check('SME approval succeeds', smeApprove.status === 200 && smeApprove.body.rule.status === 'approved', smeApprove.body);
      check('reviewer stamped on the rule', smeApprove.body.rule.sme_approved_by === 'u-sme');

      const afterApprove = await call('GET', '/admin/ingredient-rules/active', 'u-sme');
      check('live matrix digest changes only after approval', afterApprove.body.matrix_version !== originalDigest);
      check('new threshold now in force', (await rules.get('retinol'))?.sensitivity_ceiling_required === 0.95);
      check('version incremented', (await rules.get('retinol'))?.version === 2, (await rules.get('retinol'))?.version);

      const missing = await call('POST', '/admin/ingredient-rules/glycerin/approve', 'u-sme');
      check('approving with no pending draft 404s', missing.status === 404, missing.body);

      const trail = await audit.listForTarget('ingredient_rule', 'retinol');
      check('rule changes audited with before/after', trail.length === 2 && trail[0].action === 'ingredient_rule.write' && trail[1].action === 'ingredient_rule.approve', trail.map((t) => t.action));

      // Empty matrix surfaces as an outage, not a silent empty success.
      const emptyApp = createApp({
        orders: new InMemoryOrderRepository(), webhookEvents: new InMemoryWebhookEventRepository(),
        knowledge: new InMemoryKnowledgeRepository(), adminUsers: users, adminAudit: new InMemoryAdminAuditRepository(),
        ingredientRules: new InMemoryIngredientRuleRepository([]),
      });
      const s2 = emptyApp.listen(4503);
      try {
        const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
          const req = http.request({ host: 'localhost', port: 4503, path: '/admin/ingredient-rules/active', method: 'GET', headers: { 'x-admin-user-id': 'u-sme' } }, (r) => {
            let c = ''; r.on('data', (d) => (c += d)); r.on('end', () => resolve({ status: r.statusCode!, body: JSON.parse(c || '{}') }));
          });
          req.on('error', reject); req.end();
        });
        check('empty matrix reported as 503, not empty 200', res.status === 503 && res.body.error.code === 'empty_safety_matrix', res.body);
      } finally { s2.close(); }
    } finally {
      server.close();
    }
  }

  console.log(failures === 0 ? '\nINGREDIENT RULES: ALL CHECKS PASSED' : `\nINGREDIENT RULES: ${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
