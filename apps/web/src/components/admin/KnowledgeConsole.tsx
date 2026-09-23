import React from 'react';
import { color, font, radius, space } from '../theme-tokens';
import type { KnowledgeObject, KnowledgeStatus } from '@mgt/domain';
import { Panel, StatusPill, GatedButton, Field, inputStyle, ErrorNote, AuditTrail } from './AdminPrimitives';

// The knowledge console. What approval actually controls here is RETRIEVABILITY: only an
// approved object can be returned to the model, so "approved" and "the AI is allowed to say
// this" are the same fact. The console leads with that count rather than with a table, because
// the number an SME needs at a glance is how much material the assistant is currently
// grounded in.
//
// The other thing this screen has to teach is that editing an approved object un-approves it.
// That is correct -- an edited claim has not been reviewed -- but it is surprising, and an SME
// who does not expect it will quietly shrink the retrievable set while fixing a typo.

export interface KnowledgeFormState {
  title: string;
  body: string;
  source_url: string;
  source_date: string;
  evidence_level: string;
}

export interface KnowledgeConsoleProps {
  objects: KnowledgeObject[];
  selectedId: string | null;
  form: KnowledgeFormState;
  audit: Array<{ actor_id: string; action: string; created_at: string }>;
  canWrite: boolean;
  canApprove: boolean;
  error: { code: string; message: string } | null;
  busy?: boolean;
  onSelect: (id: string) => void;
  onFormChange: (patch: Partial<KnowledgeFormState>) => void;
  onSaveEdit: () => void;
  onTransition: (to: KnowledgeStatus, reason?: string) => void;
  retireReason: string;
  onRetireReasonChange: (reason: string) => void;
}

const EVIDENCE_LEVELS = ['peer_reviewed', 'regulatory_guidance', 'manufacturer_data', 'expert_consensus', 'anecdotal'];

export function KnowledgeConsole(props: KnowledgeConsoleProps) {
  const {
    objects, selectedId, form, audit, canWrite, canApprove, error, busy,
    onSelect, onFormChange, onSaveEdit, onTransition, retireReason, onRetireReasonChange,
  } = props;

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const counts = objects.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});
  const approved = counts.approved ?? 0;

  return (
    <div>
      <ErrorNote error={error} />

      <Panel tone={approved === 0 ? 'alarm' : 'live'} title="Retrievable by the AI">
        <div style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: font.size.xxl, fontWeight: font.weight.bold, lineHeight: 1 }}>{approved}</div>
            <div style={{ fontSize: font.size.xs, color: color.textMuted }}>approved objects</div>
          </div>
          <div style={{ display: 'flex', gap: space.lg, fontSize: font.size.sm, color: color.textMuted }}>
            <span>{counts.in_review ?? 0} in review</span>
            <span>{counts.draft ?? 0} draft</span>
            <span>{counts.retired ?? 0} retired</span>
          </div>
        </div>
        <p style={{ margin: `${space.md}px 0 0`, fontSize: font.size.sm, color: color.textMuted }}>
          {approved === 0
            ? 'Nothing is approved, so retrieval returns nothing and the assistant has no grounded material to cite.'
            : 'Only these are reachable by retrieval. Drafts, in-review and retired objects are invisible to the model no matter what it is asked.'}
        </p>
      </Panel>

      <Panel title="Knowledge objects">
        {objects.length === 0 ? (
          <p style={{ margin: 0, fontSize: font.size.sm, color: color.textMuted }}>No objects yet.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {objects.map((o, i) => (
              <li
                key={o.id}
                onClick={() => onSelect(o.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: space.md, cursor: 'pointer',
                  padding: space.md, borderTop: i === 0 ? 'none' : `1px solid ${color.border}`,
                  background: o.id === selectedId ? color.accentSubtle : 'transparent',
                  borderRadius: o.id === selectedId ? radius.sm : 0,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: font.size.md,
                    fontWeight: o.id === selectedId ? font.weight.semibold : font.weight.regular,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{o.title}</div>
                  <div style={{ fontSize: font.size.xs, color: color.textFaint }}>
                    {o.id} · v{o.version} · {o.evidence_level}
                  </div>
                </div>
                <StatusPill status={o.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {selected && (
        <>
          <Panel title={`${selected.title} — v${selected.version}`}>
            <div style={{ display: 'flex', gap: space.md, alignItems: 'center', marginBottom: space.md }}>
              <StatusPill status={selected.status} />
              {selected.sme_approved_by && (
                <span style={{ fontSize: font.size.xs, color: color.textMuted }}>
                  approved by {selected.sme_approved_by}
                </span>
              )}
            </div>

            {/* Provenance is the precondition for approval, not metadata: the server refuses to
                approve an object with no source_date, and the DB refuses it a second time. */}
            <dl style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${space.xs}px ${space.md}px`,
              margin: `0 0 ${space.lg}px`, fontSize: font.size.sm,
            }}>
              <dt style={{ color: color.textMuted }}>Source</dt>
              <dd style={{ margin: 0 }}>{selected.source_url ?? <em style={{ color: color.textFaint }}>none recorded</em>}</dd>
              <dt style={{ color: color.textMuted }}>Source date</dt>
              <dd style={{ margin: 0, color: selected.source_date ? color.text : color.caution }}>
                {selected.source_date ?? 'missing — approval will be refused'}
              </dd>
              <dt style={{ color: color.textMuted }}>Evidence</dt>
              <dd style={{ margin: 0 }}>{selected.evidence_level}</dd>
            </dl>

            {selected.status === 'approved' && canWrite && (
              <div style={{
                border: `1px solid ${color.accentBorder}`, background: color.cautionSubtle,
                borderRadius: radius.sm, padding: space.md, marginBottom: space.lg,
                fontSize: font.size.sm, color: color.text,
              }}>
                This object is approved and live. <strong>Editing it returns it to review</strong> and
                removes it from retrieval until an SME approves it again — an edited claim has not
                been reviewed.
              </div>
            )}

            <Field label="Title">
              <input value={form.title} onChange={(e) => onFormChange({ title: e.target.value })}
                     style={inputStyle} disabled={!canWrite} />
            </Field>
            <Field label="Body">
              <textarea value={form.body} onChange={(e) => onFormChange({ body: e.target.value })}
                        rows={5} style={{ ...inputStyle, minHeight: 120, padding: space.md, resize: 'vertical' }}
                        disabled={!canWrite} />
            </Field>
            <Field label="Source URL">
              <input value={form.source_url} onChange={(e) => onFormChange({ source_url: e.target.value })}
                     style={inputStyle} disabled={!canWrite} />
            </Field>
            <Field label="Source date" hint="Required before an SME can approve.">
              <input type="date" value={form.source_date} onChange={(e) => onFormChange({ source_date: e.target.value })}
                     style={inputStyle} disabled={!canWrite} />
            </Field>
            <Field label="Evidence level">
              <select value={form.evidence_level} onChange={(e) => onFormChange({ evidence_level: e.target.value })}
                      style={inputStyle} disabled={!canWrite}>
                {EVIDENCE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>

            <GatedButton label="Save edit" onClick={onSaveEdit} busy={busy} variant="secondary"
                         disabledReason={canWrite ? null : 'Your role cannot edit knowledge objects.'} />
          </Panel>

          <Panel title="Approval">
            <div style={{ display: 'flex', gap: space.lg, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {selected.status === 'draft' && (
                <GatedButton label="Send to review" onClick={() => onTransition('in_review')} busy={busy}
                             variant="secondary"
                             disabledReason={canWrite ? null : 'Your role cannot move knowledge objects through the workflow.'} />
              )}
              {selected.status === 'in_review' && (
                <GatedButton
                  label="Approve — make retrievable"
                  onClick={() => onTransition('approved')}
                  busy={busy}
                  disabledReason={
                    !canApprove
                      ? 'Only an SME can approve. Approval is a clinical judgement, so it is deliberately withheld from superadmin.'
                      : !selected.source_date
                        ? 'Provenance required: this object has no source date, and approval without one is refused by both the API and the database.'
                        : null
                  }
                />
              )}
              {selected.status === 'approved' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
                  <Field label="Retire reason" hint="Retiring requires a stated reason.">
                    <input value={retireReason} onChange={(e) => onRetireReasonChange(e.target.value)}
                           style={inputStyle} disabled={!canWrite} />
                  </Field>
                  <GatedButton label="Retire" variant="danger" busy={busy}
                               onClick={() => onTransition('retired', retireReason)}
                               disabledReason={canWrite ? null : 'Your role cannot retire knowledge objects.'} />
                </div>
              )}
              {selected.status === 'retired' && (
                <GatedButton label="Revive as draft" onClick={() => onTransition('draft')} busy={busy}
                             variant="secondary"
                             disabledReason={canWrite ? null : 'Your role cannot revive knowledge objects.'} />
              )}
            </div>
          </Panel>

          <Panel title="Audit trail">
            <AuditTrail entries={audit} />
          </Panel>
        </>
      )}
    </div>
  );
}
