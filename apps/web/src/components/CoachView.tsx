'use client';
import React, { useState } from 'react';
import type { Routine } from '@mgt/domain';
import { color, space, radius, font, TAP_TARGET_MIN } from './theme-tokens';

// "Coach" (Section G): quick intents plus DIFF CARDS. When the coach changes the routine, the
// user sees exactly what changed before accepting — the change is proposed, never applied
// silently. That is what makes a deterministic routine command safe to expose in a chat
// surface, and it is how the "0 model-authored routine changes" KPI stays true in the UI as
// well as in the engine.

export interface RoutineDiff {
  removed: { slot: string; product_id: string }[];
  added: { slot: string; product_id: string }[];
  unchanged: number;
}

export function diffRoutines(before: Routine, after: Routine): RoutineDiff {
  const key = (s: { slot: string; product_id: string }) => `${s.slot}:${s.product_id}`;
  const beforeKeys = new Set(before.steps.map(key));
  const afterKeys = new Set(after.steps.map(key));
  return {
    removed: before.steps.filter((s) => !afterKeys.has(key(s))).map((s) => ({ slot: s.slot, product_id: s.product_id })),
    added: after.steps.filter((s) => !beforeKeys.has(key(s))).map((s) => ({ slot: s.slot, product_id: s.product_id })),
    unchanged: before.steps.filter((s) => afterKeys.has(key(s))).length,
  };
}

const QUICK_INTENTS = [
  'Make my routine simpler',
  'Make it cheaper',
  "I'm travelling for 5 days",
  'Which one goes first?',
];

export interface CoachViewProps {
  onSend: (text: string) => void;
  messages: { role: 'user' | 'coach'; text: string }[];
  pendingDiff?: { diff: RoutineDiff; explanation: string } | null;
  productName: (productId: string) => string;
  onAcceptDiff?: () => void;
  onRejectDiff?: () => void;
}

export function CoachView({ onSend, messages, pendingDiff, productName, onAcceptDiff, onRejectDiff }: CoachViewProps) {
  const [draft, setDraft] = useState('');

  return (
    <div data-testid="coach-view">
      <h1 style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, margin: 0 }}>Coach</h1>
      <p style={{ color: color.textMuted, fontSize: font.size.sm, marginTop: space.xs }}>
        Ask about your routine, or tap a shortcut.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
        {QUICK_INTENTS.map((intent) => (
          <button key={intent} onClick={() => onSend(intent)} data-testid="quick-intent"
            style={{ minHeight: 36, padding: `0 ${space.md}px`, cursor: 'pointer', borderRadius: radius.pill,
                     border: `1px solid ${color.accentBorder}`, background: color.accentSubtle,
                     color: 'var(--purple)', fontFamily: font.family, fontSize: font.size.sm }}>
            {intent}
          </button>
        ))}
      </div>

      <ol data-testid="messages" style={{ listStyle: 'none', padding: 0, margin: `${space.lg}px 0 0`, display: 'grid', gap: space.md }}>
        {messages.map((m, i) => (
          <li key={i} style={{ justifySelf: m.role === 'user' ? 'end' : 'start', maxWidth: '85%',
                               background: m.role === 'user' ? color.accent : color.bgSubtle,
                               color: m.role === 'user' ? '#fff' : color.text,
                               borderRadius: radius.lg, padding: `${space.sm}px ${space.md}px`, fontSize: font.size.sm }}>
            {m.text}
          </li>
        ))}
      </ol>

      {pendingDiff && (
        <section data-testid="diff-card" aria-labelledby="diff-heading"
          style={{ marginTop: space.lg, border: `1px solid ${color.accentBorder}`, borderRadius: radius.lg,
                   background: color.accentSubtle, padding: space.lg }}>
          <h2 id="diff-heading" style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
            Proposed change
          </h2>
          <p style={{ margin: `${space.sm}px 0 0`, fontSize: font.size.sm, color: color.textMuted }}>
            {pendingDiff.explanation}
          </p>

          {pendingDiff.diff.removed.length > 0 && (
            <ul data-testid="diff-removed" style={{ margin: `${space.md}px 0 0`, paddingLeft: space.lg, fontSize: font.size.sm }}>
              {pendingDiff.diff.removed.map((s) => (
                <li key={`r-${s.slot}-${s.product_id}`} style={{ color: color.danger }}>
                  Remove {productName(s.product_id)} ({s.slot.replace(/_/g, ' ')})
                </li>
              ))}
            </ul>
          )}
          {pendingDiff.diff.added.length > 0 && (
            <ul data-testid="diff-added" style={{ margin: `${space.sm}px 0 0`, paddingLeft: space.lg, fontSize: font.size.sm }}>
              {pendingDiff.diff.added.map((s) => (
                <li key={`a-${s.slot}-${s.product_id}`} style={{ color: color.success }}>
                  Add {productName(s.product_id)} ({s.slot.replace(/_/g, ' ')})
                </li>
              ))}
            </ul>
          )}
          <p style={{ margin: `${space.sm}px 0 0`, fontSize: font.size.xs, color: color.textFaint }}>
            {pendingDiff.diff.unchanged} step{pendingDiff.diff.unchanged === 1 ? '' : 's'} unchanged
          </p>

          <div style={{ display: 'flex', gap: space.sm, marginTop: space.md }}>
            <button onClick={onAcceptDiff} data-testid="accept-diff"
              style={{ flex: 1, minHeight: TAP_TARGET_MIN, borderRadius: radius.pill, border: 'none', cursor: 'pointer',
                       background: color.accent, color: '#fff', fontFamily: font.family,
                       fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
              Apply change
            </button>
            <button onClick={onRejectDiff} data-testid="reject-diff"
              style={{ minHeight: TAP_TARGET_MIN, padding: `0 ${space.lg}px`, borderRadius: radius.pill, cursor: 'pointer',
                       border: `1px solid ${color.border}`, background: color.bg, color: color.text,
                       fontFamily: font.family, fontSize: font.size.sm }}>
              Keep as is
            </button>
          </div>
        </section>
      )}

      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onSend(draft.trim()); setDraft(''); } }}
            style={{ display: 'flex', gap: space.sm, marginTop: space.lg }}>
        <label htmlFor="coach-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Message the coach
        </label>
        <input id="coach-input" value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about your routine…" data-testid="coach-input"
          style={{ flex: 1, minHeight: TAP_TARGET_MIN, padding: `0 ${space.md}px`, borderRadius: radius.pill,
                   border: `1px solid ${color.border}`, fontFamily: font.family, fontSize: font.size.md }} />
        <button type="submit" style={{ minHeight: TAP_TARGET_MIN, padding: `0 ${space.lg}px`, borderRadius: radius.pill,
                     border: 'none', background: color.accent, color: '#fff', cursor: 'pointer',
                     fontFamily: font.family, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
          Send
        </button>
      </form>

      <p style={{ marginTop: space.md, fontSize: font.size.xs, color: color.textFaint }}>
        The Coach gives cosmetic skincare guidance only — not medical advice.
      </p>
    </div>
  );
}
