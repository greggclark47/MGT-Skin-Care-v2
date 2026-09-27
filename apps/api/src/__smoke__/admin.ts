import http from 'http';
import { transition, applyEdit, isRetrievable, can, permissionsFor, type KnowledgeObject } from '@mgt/domain';
import { createApp } from '../server';
import { InMemoryOrderRepository, InMemoryWebhookEventRepository, InMemoryKnowledgeRepository, InMemoryAdminUserRepository, InMemoryAdminAuditRepository } from '../persistence/in-memory';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 240) : ''); }
}

const draft = (over: Partial<KnowledgeObject> = {}): KnowledgeObject => ({
  id: 'kb-1', title: 'Niacinamide basics', body: 'Niacinamide supports the skin barrier.',
  evidence_level: 'peer_reviewed', source_url: 'https://example.org/x', source_date: '2025-01-01',
  version: 1, status: 'draft', sme_approved_by: null, sme_approved_at: null, retired_reason: null, ...over,
});

async function main() {
  console.log('\n== 1. Approval state machine ==');
  {
    const d = draft();
    const bad = transition({ object: d, to: 'approved', actor_id: 'a1', actor_is_sme: true });
    check('cannot approve straight from draft', !bad.ok && bad.error.startsWith('illegal_transition'), bad);

    const review = transition({ object: d, to: 'in_review', actor_id: 'a1', actor_is_sme: false });
    check('draft -> in_review allowed', review.ok === true);

    const notSme = transition({ object: (review as any).object, to: 'approved', actor_id: 'editor', actor_is_sme: false });
    check('non-SME cannot approve', !notSme.ok && notSme.error === 'sme_role_required', notSme);

    const approved = transition({ object: (review as any).object, to: 'approved', actor_id: 'sme-7', actor_is_sme: true });
    check('SME can approve', approved.ok === true);
    check('reviewer recorded', (approved as any).object.sme_approved_by === 'sme-7' && !!(approved as any).object.sme_approved_at);

    const noDate = transition({ object: draft({ status: 'in_review', source_date: null }), to: 'approved', actor_id: 'sme-7', actor_is_sme: true });
    check('approval blocked without provenance', !noDate.ok && noDate.error === 'missing_source_date', noDate);

    const noReason = transition({ object: draft({ status: 'approved' }), to: 'retired', actor_id: 'sme-7', actor_is_sme: true });
    check('retire requires a reason', !noReason.ok && noReason.error === 'retire_reason_required', noReason);

    const retired = transition({ object: draft({ status: 'approved', sme_approved_by: 'sme-7' }), to: 'retired', actor_id: 'sme-7', actor_is_sme: true, reason: 'Superseded' });
    check('retire with reason works', retired.ok === true && (retired as any).object.retired_reason === 'Superseded');

    const revived = transition({ object: (retired as any).object, to: 'draft', actor_id: 'a1', actor_is_sme: false });
    check('retired revives only as draft', revived.ok === true && (revived as any).object.status === 'draft');
    check('revived object bumps version', (revived as any).object.version === 2, (revived as any).object.version);
    check('revived object carries no stale approval', (revived as any).object.sme_approved_by === null);
  }

  console.log('\n== 2. Editing an approved object invalidates its approval ==');
  {
    const approved = draft({ status: 'approved', sme_approved_by: 'sme-7', sme_approved_at: '2026-01-01T00:00:00Z' });
    const edited = applyEdit(approved, { body: 'Rewritten claim about niacinamide.' });
    check('edit forces re-review', edited.status === 'in_review', edited.status);
    check('approval stamp cleared on edit', edited.sme_approved_by === null && edited.sme_approved_at === null);
    check('version incremented', edited.version === approved.version + 1);
    check('edited object is no longer retrievable by RAG', isRetrievable(edited) === false);
  }

  console.log('\n== 3. Only approved content is retrievable ==');
  {
    const repo = new InMemoryKnowledgeRepository([
      draft({ id: 'k-approved', title: 'Retinoid guidance', status: 'approved', sme_approved_by: 'sme-1' }),
      draft({ id: 'k-draft', title: 'Retinoid rumours', status: 'draft' }),
      draft({ id: 'k-review', title: 'Retinoid pending', status: 'in_review' }),
      draft({ id: 'k-retired', title: 'Retinoid outdated', status: 'retired' }),
    ]);
    const found = await repo.searchRetrievable('retinoid', 10);
    check('only the approved object is retrievable', found.length === 1 && found[0].id === 'k-approved', found.map((f) => f.id));
    check('list() still shows everything for admins', (await repo.list()).length === 4);
    check('list(status) filters', (await repo.list('draft')).length === 1);
  }

  console.log('\n== 4. RBAC separation of duties ==');
  {
    check('SME can approve knowledge', can(['sme'], 'knowledge.approve'));
    check('catalog editor cannot approve knowledge', !can(['catalog_editor'], 'knowledge.approve'));
    check('viewer cannot write', !can(['viewer'], 'knowledge.write'));
    // The deliberate constraint: the most powerful admin role still cannot bless safety content.
    check('superadmin CANNOT approve knowledge', !can(['superadmin'], 'knowledge.approve'));
    check('superadmin CANNOT approve ingredient rules', !can(['superadmin'], 'ingredient_rules.approve'));
    check('SME cannot refund orders', !can(['sme'], 'orders.refund'));
    check('SME cannot edit the catalog', !can(['sme'], 'catalog.write'));
    check('only superadmin manages roles', can(['superadmin'], 'admin.manage_roles') && !can(['sme', 'compliance'], 'admin.manage_roles'));
    check('roles combine additively', can(['viewer', 'sme'], 'knowledge.approve') && can(['viewer', 'sme'], 'orders.read'));
    check('unknown role contributes nothing', permissionsFor(['nope' as any]).size === 0);
  }

  console.log('\n== 5. Admin API end to end (RBAC + audit) ==');
  {
    const users = new InMemoryAdminUserRepository();
    users.set({ id: 'u-editor', email: 'editor@mgt', roles: ['catalog_editor', 'viewer'] });
    users.set({ id: 'u-sme', email: 'sme@mgt', roles: ['sme'] });
    users.set({ id: 'u-super', email: 'super@mgt', roles: ['superadmin'] });
    const audit = new InMemoryAdminAuditRepository();
    const knowledge = new InMemoryKnowledgeRepository();

    const app = createApp({
      orders: new InMemoryOrderRepository(), webhookEvents: new InMemoryWebhookEventRepository(),
      knowledge, adminUsers: users, adminAudit: audit,
    });
    const server = app.listen(4501);
    const call = (method: string, path: string, actor?: string, body?: unknown): Promise<{ status: number; body: any }> =>
      new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const headers: Record<string, string> = {};
        if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = String(Buffer.byteLength(data)); }
        if (actor) headers['x-admin-user-id'] = actor;
        const req = http.request({ host: 'localhost', port: 4501, path, method, headers }, (res) => {
          let c = ''; res.on('data', (d) => (c += d));
          res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(c || '{}') }));
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
      });

    try {
      const anon = await call('GET', '/admin/knowledge');
      check('no identity -> 401', anon.status === 401, anon.status);

      const stranger = await call('GET', '/admin/knowledge', 'u-nobody');
      check('non-admin account -> 403', stranger.status === 403, stranger.body);

      const created = await call('POST', '/admin/knowledge', 'u-sme', { id: 'kb-9', title: 'Vitamin C', body: 'Antioxidant support.', source_date: '2025-06-01', evidence_level: 'peer_reviewed' });
      check('SME can create', created.status === 201, created.body);
      check('new object starts as draft', created.body.object.status === 'draft', created.body.object?.status);

      const toReview = await call('POST', '/admin/knowledge/kb-9/transition', 'u-sme', { to: 'in_review' });
      check('moved to in_review', toReview.body.object.status === 'in_review', toReview.body);

      const editorApprove = await call('POST', '/admin/knowledge/kb-9/transition', 'u-editor', { to: 'approved' });
      check('catalog editor forbidden from approving', editorApprove.status === 403, editorApprove.body);

      const superApprove = await call('POST', '/admin/knowledge/kb-9/transition', 'u-super', { to: 'approved' });
      check('superadmin also forbidden from approving', superApprove.status === 403, superApprove.body);

      const smeApprove = await call('POST', '/admin/knowledge/kb-9/transition', 'u-sme', { to: 'approved' });
      check('SME approval succeeds', smeApprove.status === 200 && smeApprove.body.object.status === 'approved', smeApprove.body);
      check('reviewer stamped', smeApprove.body.object.sme_approved_by === 'u-sme');

      const retrievable = await knowledge.searchRetrievable('vitamin', 5);
      check('approved object now reachable by RAG', retrievable.length === 1, retrievable.map((r) => r.id));

      const edit = await call('PATCH', '/admin/knowledge/kb-9', 'u-sme', { body: 'Revised antioxidant claim.' });
      check('edit returns it to review', edit.body.object.status === 'in_review', edit.body.object?.status);
      check('edit surfaces why', typeof edit.body.note === 'string', edit.body.note);
      const afterEdit = await knowledge.searchRetrievable('vitamin', 5);
      check('edited object drops out of RAG until re-approved', afterEdit.length === 0, afterEdit.map((r) => r.id));

      const trail = await call('GET', '/admin/knowledge/kb-9/audit', 'u-sme');
      const actions = trail.body.entries.map((e: any) => e.action);
      check('every mutation audited', actions.join(',') === 'knowledge.create,knowledge.in_review,knowledge.approved,knowledge.edit', actions);
      check('audit captures before/after', trail.body.entries[2].before.status === 'in_review' && trail.body.entries[2].after.status === 'approved');
      check('audit names the actor', trail.body.entries.every((e: any) => e.actor_id === 'u-sme'));

      // /admin/me — what the admin console gates its UI on. It must report exactly the
      // permissions the API will actually honour, or the console will offer actions that 403
      // (or hide ones that would have worked).
      const anonMe = await call('GET', '/admin/me');
      check('/admin/me requires identity', anonMe.status === 401, anonMe.status);

      const smeMe = await call('GET', '/admin/me', 'u-sme');
      check('/admin/me reports roles', smeMe.status === 200 && smeMe.body.roles.includes('sme'), smeMe.body);
      check('/admin/me flags SME', smeMe.body.is_sme === true, smeMe.body);
      check('/admin/me grants knowledge.approve to SME', smeMe.body.permissions.includes('knowledge.approve'));
      check('/admin/me grants ingredient_rules.approve to SME', smeMe.body.permissions.includes('ingredient_rules.approve'));

      const superMe = await call('GET', '/admin/me', 'u-super');
      // The separation of duties has to be visible to the UI, not just enforced on write.
      check('/admin/me withholds knowledge.approve from superadmin', !superMe.body.permissions.includes('knowledge.approve'), superMe.body.permissions);
      check('/admin/me withholds ingredient_rules.approve from superadmin', !superMe.body.permissions.includes('ingredient_rules.approve'));
      check('/admin/me is not SME for superadmin', superMe.body.is_sme === false);

      const editorMe = await call('GET', '/admin/me', 'u-editor');
      check('/admin/me gives catalog editor no knowledge.write', !editorMe.body.permissions.includes('knowledge.write'), editorMe.body.permissions);
    } finally {
      server.close();
    }
  }

  console.log(failures === 0 ? '\nADMIN: ALL CHECKS PASSED' : `\nADMIN: ${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
