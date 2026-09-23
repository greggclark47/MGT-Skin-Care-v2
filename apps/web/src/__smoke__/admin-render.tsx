import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IngredientRulesConsole } from '../components/admin/IngredientRulesConsole';
import { KnowledgeConsole } from '../components/admin/KnowledgeConsole';
import type { KnowledgeObject, VersionedIngredientRule } from '@mgt/domain';

// These assert the admin console's SAFETY-RELEVANT claims, not its layout. Each check below
// corresponds to a way the console could mislead an SME into thinking a safety change is in
// force when it is not, or into believing an action is available when the API would refuse it.

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ''); }
}

const liveRetinol: VersionedIngredientRule = {
  ingredient_key: 'retinol', display_name: 'Retinol', sensitivity_ceiling_required: 0.6,
  triggers_avoid_flag: 'high_strength_actives', rationale: 'Retinoids commonly irritate on introduction.',
  version: 1, status: 'approved', sme_approved_by: 'sme-seed', sme_approved_at: '2026-01-01T00:00:00Z',
};

const tighterDraft: VersionedIngredientRule = {
  ...liveRetinol, sensitivity_ceiling_required: 0.95, version: 2, status: 'draft',
  rationale: 'Tightening after irritation reports.', sme_approved_by: null, sme_approved_at: null,
};

const looserDraft: VersionedIngredientRule = {
  ...tighterDraft, sensitivity_ceiling_required: 0.3, rationale: 'Loosening for broader catalog coverage.',
};

function renderRules(over: Partial<React.ComponentProps<typeof IngredientRulesConsole>> = {}) {
  return renderToStaticMarkup(
    <IngredientRulesConsole
      matrixVersion="im-14-abc123" ruleCount={14}
      liveRules={[liveRetinol]} drafts={[]} selectedKey="retinol"
      form={{ sensitivity_ceiling_required: '0.60', rationale: '' }}
      audit={[]} canWrite canApprove matrixOutage={false} error={null}
      onSelect={() => {}} onFormChange={() => {}} onSubmitDraft={() => {}} onApprove={() => {}}
      {...over}
    />,
  );
}

console.log('\n== 1. The live matrix is stated, with its digest ==');
{
  const html = renderRules();
  check('live rule count shown', html.includes('14'));
  check('matrix digest shown', html.includes('im-14-abc123'));
  check('states that it gates recommendations now', html.includes('gating recommendations right now'));
}

console.log('\n== 2. A pending edit is never presented as being in force ==');
{
  const html = renderRules({ drafts: [tighterDraft] });
  check('draft labelled not in force', html.includes('not in force'));
  check('says live matrix is unchanged', html.includes('live matrix above is unchanged'));
  check('draft rationale surfaced for review', html.includes('Tightening after irritation reports.'));
  // The digest must still be the LIVE one — showing a draft must not change the number an SME
  // reads as "what is live".
  check('digest still reads as the live one', html.includes('im-14-abc123'));
}

console.log('\n== 3. Threshold changes are described by direction, not just value ==');
{
  const tighter = renderRules({ drafts: [tighterDraft] });
  check('tightening names who it blocks', tighter.includes('Blocks this ingredient for more users'));
  check('tightening shows the transition', tighter.includes('0.60') && tighter.includes('0.95'));

  const looser = renderRules({ drafts: [looserDraft] });
  // Loosening is the direction that can hurt someone, so it must be stated in those terms.
  check('loosening names who it exposes', looser.includes('Exposes this ingredient to more users'));
}

console.log('\n== 4. Approval is gated on the SME role, and says why ==');
{
  const notSme = renderRules({ drafts: [tighterDraft], canApprove: false });
  check('approve disabled for non-SME', notSme.includes('disabled=""'));
  check('reason names the SME requirement', notSme.includes('Only an SME can approve a safety rule'));
  check('reason explains superadmin exclusion', notSme.includes('withheld from superadmin'));

  const sme = renderRules({ drafts: [tighterDraft], canApprove: true });
  check('approve offered to an SME', sme.includes('Approve — put in force'));
}

console.log('\n== 5. A write-less role cannot edit, and is told so ==');
{
  const readOnly = renderRules({ canWrite: false });
  check('inputs disabled', readOnly.includes('disabled=""'));
  check('reason given for the disabled save', readOnly.includes('cannot edit ingredient rules'));
}

console.log('\n== 6. An empty safety matrix reads as an outage, not an empty list ==');
{
  const html = renderRules({ matrixOutage: true, liveRules: [], ruleCount: 0, matrixVersion: null });
  check('outage headline', html.includes('scoring halted'));
  check('explains the fail-closed reason', html.includes('no-op'));
  check('does NOT show a live digest', !html.includes('im-14-abc123'));
}

// ---- Knowledge console ----

const approvedObj: KnowledgeObject = {
  id: 'kb-1', title: 'Niacinamide basics', body: 'Niacinamide supports the skin barrier.',
  evidence_level: 'peer_reviewed', source_url: 'https://example.org/x', source_date: '2025-01-01',
  version: 2, status: 'approved', sme_approved_by: 'sme-7', sme_approved_at: '2026-01-01T00:00:00Z',
  retired_reason: null,
};

const inReviewNoProvenance: KnowledgeObject = {
  ...approvedObj, id: 'kb-2', title: 'Undated claim', status: 'in_review',
  source_date: null, sme_approved_by: null, sme_approved_at: null, version: 1,
};

function renderKnowledge(over: Partial<React.ComponentProps<typeof KnowledgeConsole>> = {}) {
  return renderToStaticMarkup(
    <KnowledgeConsole
      objects={[approvedObj]} selectedId="kb-1"
      form={{ title: approvedObj.title, body: approvedObj.body, source_url: '', source_date: '2025-01-01', evidence_level: 'peer_reviewed' }}
      audit={[]} canWrite canApprove error={null}
      onSelect={() => {}} onFormChange={() => {}} onSaveEdit={() => {}} onTransition={() => {}}
      retireReason="" onRetireReasonChange={() => {}}
      {...over}
    />,
  );
}

console.log('\n== 7. Approval is presented as what controls retrieval ==');
{
  const html = renderKnowledge();
  check('leads with the retrievable count', html.includes('approved objects'));
  check('states unapproved content is invisible to the model', html.includes('invisible to the model'));
}

console.log('\n== 8. Editing an approved object warns that it drops out of retrieval ==');
{
  const html = renderKnowledge();
  check('warns editing returns it to review', html.includes('Editing it returns it to review'));
  check('explains why', html.includes('an edited claim has not been reviewed'));
}

console.log('\n== 9. Approval without provenance is blocked, with the reason ==');
{
  const html = renderKnowledge({ objects: [inReviewNoProvenance], selectedId: 'kb-2' });
  check('missing source date called out', html.includes('missing — approval will be refused'));
  check('approve disabled', html.includes('disabled=""'));
  check('reason names provenance', html.includes('Provenance required'));
}

console.log('\n== 10. Zero approved objects reads as a grounding problem ==');
{
  const html = renderKnowledge({ objects: [], selectedId: null });
  check('warns the assistant has nothing grounded', html.includes('no grounded material to cite'));
}

console.log(failures === 0
  ? '\nADMIN UI: ALL CHECKS PASSED'
  : `\nADMIN UI: ${failures} CHECK(S) FAILED`);
if (failures > 0) process.exitCode = 1;
