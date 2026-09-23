import React from 'react';
import { color, font, radius, space } from '../theme-tokens';
import type { VersionedIngredientRule } from '@mgt/domain';
import { Panel, StatusPill, GatedButton, Field, inputStyle, ErrorNote, AuditTrail } from './AdminPrimitives';

// The ingredient-rules console. Its single most important job is to make the gap between
// WHAT IS LIVE and WHAT IS PROPOSED impossible to misread.
//
// The server already guarantees a pending edit cannot change the live matrix (every write
// lands as a draft; only an SME approval promotes it). But an admin who *believes* their edit
// took effect will stop watching for the approval, and a safety threshold everyone thinks is
// tightened but which is not is worse than one nobody touched. So the live matrix is stated
// first, with its digest, and any draft is rendered beside it as explicitly not-in-force.

export interface RuleDraftForm {
  sensitivity_ceiling_required: string;
  rationale: string;
}

export interface IngredientRulesConsoleProps {
  matrixVersion: string | null;
  ruleCount: number;
  liveRules: VersionedIngredientRule[];
  drafts: VersionedIngredientRule[];
  selectedKey: string | null;
  form: RuleDraftForm;
  audit: Array<{ actor_id: string; action: string; created_at: string }>;
  canWrite: boolean;
  canApprove: boolean;
  /** Set when GET /active returned 503 empty_safety_matrix — scoring is halted. */
  matrixOutage: boolean;
  error: { code: string; message: string } | null;
  busy?: boolean;
  onSelect: (key: string) => void;
  onFormChange: (patch: Partial<RuleDraftForm>) => void;
  onSubmitDraft: () => void;
  onApprove: (key: string) => void;
}

function threshold(n: number): string {
  return n.toFixed(2);
}

// A tightened threshold blocks the ingredient for MORE users; a loosened one exposes more
// users to it. Naming the direction is the difference between an SME reviewing a number and
// an SME reviewing a decision.
function describeDelta(live: number | undefined, proposed: number): { text: string; tone: 'tighter' | 'looser' | 'same' } {
  if (live === undefined) return { text: 'New rule — no approved version yet.', tone: 'same' };
  if (proposed > live) {
    return { text: `Tighter than live (${threshold(live)} → ${threshold(proposed)}). Blocks this ingredient for more users.`, tone: 'tighter' };
  }
  if (proposed < live) {
    return { text: `Looser than live (${threshold(live)} → ${threshold(proposed)}). Exposes this ingredient to more users.`, tone: 'looser' };
  }
  return { text: `Unchanged from live (${threshold(live)}).`, tone: 'same' };
}

export function IngredientRulesConsole(props: IngredientRulesConsoleProps) {
  const {
    matrixVersion, ruleCount, liveRules, drafts, selectedKey, form, audit,
    canWrite, canApprove, matrixOutage, error, busy,
    onSelect, onFormChange, onSubmitDraft, onApprove,
  } = props;

  const liveByKey = new Map(liveRules.map((r) => [r.ingredient_key, r]));
  const draftByKey = new Map(drafts.map((r) => [r.ingredient_key, r]));
  const selectedLive = selectedKey ? liveByKey.get(selectedKey) : undefined;
  const selectedDraft = selectedKey ? draftByKey.get(selectedKey) : undefined;

  return (
    <div>
      <ErrorNote error={error} />

      {matrixOutage ? (
        <Panel tone="alarm" title="Safety matrix empty — scoring halted">
          <p style={{ margin: 0, fontSize: font.size.sm, color: color.text }}>
            No approved ingredient rules are loaded, so recommendation scoring refuses to run.
            This is an outage, not an empty list: an empty matrix would silently turn every hard
            safety filter into a no-op. Approve at least one rule to restore scoring.
          </p>
        </Panel>
      ) : (
        <Panel tone="live" title="Live safety matrix">
          <div style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: font.size.xxl, fontWeight: font.weight.bold, lineHeight: 1 }}>{ruleCount}</div>
              <div style={{ fontSize: font.size.xs, color: color.textMuted }}>approved rules in force</div>
            </div>
            <div>
              <code style={{ fontSize: font.size.sm, color: color.text }}>{matrixVersion ?? '—'}</code>
              <div style={{ fontSize: font.size.xs, color: color.textMuted }}>
                matrix digest — stamped on every recommendation
              </div>
            </div>
          </div>
          <p style={{ margin: `${space.md}px 0 0`, fontSize: font.size.sm, color: color.textMuted }}>
            This is what is gating recommendations right now. The digest changes only when an SME
            approves a rule — never when one is edited.
          </p>
        </Panel>
      )}

      {drafts.length > 0 && (
        <Panel tone="proposed" title={`${drafts.length} pending edit${drafts.length === 1 ? '' : 's'} — not in force`}>
          <p style={{ margin: 0, fontSize: font.size.sm, color: color.text }}>
            These are drafts awaiting SME approval. The live matrix above is unchanged until
            each is approved.
          </p>
        </Panel>
      )}

      <Panel title="Rules">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm }}>
            <thead>
              <tr style={{ textAlign: 'left', color: color.textMuted, fontSize: font.size.xs }}>
                <th style={{ padding: space.sm, fontWeight: font.weight.semibold }}>Ingredient</th>
                <th style={{ padding: space.sm, fontWeight: font.weight.semibold }}>Live ceiling</th>
                <th style={{ padding: space.sm, fontWeight: font.weight.semibold }}>Avoid flag</th>
                <th style={{ padding: space.sm, fontWeight: font.weight.semibold }}>Version</th>
                <th style={{ padding: space.sm, fontWeight: font.weight.semibold }}>Pending</th>
              </tr>
            </thead>
            <tbody>
              {liveRules.map((r) => {
                const draft = draftByKey.get(r.ingredient_key);
                const selected = r.ingredient_key === selectedKey;
                return (
                  <tr
                    key={r.ingredient_key}
                    onClick={() => onSelect(r.ingredient_key)}
                    style={{
                      cursor: 'pointer',
                      background: selected ? color.accentSubtle : 'transparent',
                      borderTop: `1px solid ${color.border}`,
                    }}
                  >
                    <td style={{ padding: space.sm, fontWeight: selected ? font.weight.semibold : font.weight.regular }}>
                      {r.display_name}
                      <div style={{ fontSize: font.size.xs, color: color.textFaint }}>{r.ingredient_key}</div>
                    </td>
                    <td style={{ padding: space.sm }}><code>{threshold(r.sensitivity_ceiling_required)}</code></td>
                    <td style={{ padding: space.sm, color: r.triggers_avoid_flag ? color.caution : color.textFaint }}>
                      {r.triggers_avoid_flag ?? '—'}
                    </td>
                    <td style={{ padding: space.sm, color: color.textMuted }}>v{r.version}</td>
                    <td style={{ padding: space.sm }}>
                      {draft
                        ? <StatusPill status="draft" />
                        : <span style={{ color: color.textFaint }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {selectedKey && (
        <Panel title={`Edit — ${selectedLive?.display_name ?? selectedKey}`}>
          {selectedDraft && (
            <div style={{
              border: `1px solid ${color.accentBorder}`, background: color.accentSubtle,
              borderRadius: radius.sm, padding: space.md, marginBottom: space.lg,
            }}>
              <div style={{ display: 'flex', gap: space.md, alignItems: 'baseline', marginBottom: space.sm }}>
                <StatusPill status="draft" />
                <strong style={{ fontSize: font.size.sm }}>v{selectedDraft.version} proposed</strong>
              </div>
              <div style={{ fontSize: font.size.sm, marginBottom: space.sm }}>
                {(() => {
                  const d = describeDelta(selectedLive?.sensitivity_ceiling_required, selectedDraft.sensitivity_ceiling_required);
                  return (
                    <span style={{ color: d.tone === 'looser' ? color.caution : color.text }}>
                      {d.text}
                    </span>
                  );
                })()}
              </div>
              <div style={{ fontSize: font.size.sm, color: color.textMuted }}>
                <em>Rationale:</em> {selectedDraft.rationale}
              </div>
              <div style={{ marginTop: space.md }}>
                <GatedButton
                  label="Approve — put in force"
                  onClick={() => onApprove(selectedKey)}
                  busy={busy}
                  disabledReason={canApprove ? null
                    : 'Only an SME can approve a safety rule. Approval is a clinical judgement, so it is deliberately withheld from superadmin.'}
                />
              </div>
            </div>
          )}

          <Field
            label="Sensitivity ceiling required (0–1)"
            hint="A profile must tolerate at least this level for the ingredient to be recommendable. Higher = blocked for more users."
          >
            <input
              type="number" step="0.05" min="0" max="1"
              value={form.sensitivity_ceiling_required}
              onChange={(e) => onFormChange({ sensitivity_ceiling_required: e.target.value })}
              style={inputStyle}
              disabled={!canWrite}
            />
          </Field>

          <Field
            label="Rationale (required)"
            hint="A threshold with no stated reason cannot be reviewed, only rubber-stamped. The server rejects a write without one."
          >
            <textarea
              value={form.rationale}
              onChange={(e) => onFormChange({ rationale: e.target.value })}
              rows={3}
              style={{ ...inputStyle, minHeight: 80, padding: space.md, resize: 'vertical' }}
              disabled={!canWrite}
            />
          </Field>

          <GatedButton
            label="Save as draft"
            onClick={onSubmitDraft}
            busy={busy}
            variant="secondary"
            disabledReason={canWrite ? null : 'Your role cannot edit ingredient rules.'}
          />
          <p style={{ margin: `${space.md}px 0 0`, fontSize: font.size.xs, color: color.textMuted }}>
            Saving creates a new version as a draft. The currently approved rule stays in force
            until an SME approves the draft, so editing can never weaken the live matrix as a
            side effect.
          </p>
        </Panel>
      )}

      {selectedKey && (
        <Panel title="Audit trail">
          <AuditTrail entries={audit} />
        </Panel>
      )}
    </div>
  );
}
