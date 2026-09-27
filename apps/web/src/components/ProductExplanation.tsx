import React from 'react';
import type { ProductExplanation } from '@mgt/domain';
import { color, radius, space, font } from './theme-tokens';

// Renders the E.6 explanation contract. Every field except `blurb` is deterministic engine
// output; `blurb` is the ONLY AI-generated field and is rendered as supporting copy, never
// as the reason itself. That separation is the visible half of the explainability claim in
// Section A.3 — if the AI is unavailable, this component still explains the match fully.
export function ProductExplanationCard({ explanation, productName }: { explanation: ProductExplanation; productName: string }) {
  const { match_score, why_matched, ingredients, sensitivity_compatibility, routine_placement, cautions, blurb } = explanation;

  const compatibilityStyle = {
    safe:     { label: 'Suitable for your sensitivity', bg: color.accentSubtle, fg: color.success },
    caution:  { label: 'Introduce slowly',              bg: color.cautionSubtle, fg: color.caution },
    excluded: { label: 'Not recommended for you',       bg: 'var(--danger-bg)',           fg: color.danger },
  }[sensitivity_compatibility];

  return (
    <article data-testid="product-explanation"
      style={{ border: `1px solid ${color.border}`, borderRadius: radius.lg, padding: space.lg, background: color.bg }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md }}>
        <h3 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.text }}>
          {productName}
        </h3>
        <span data-testid="match-score" aria-label={`Match score ${match_score} out of 100`}
          style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: 'var(--purple)',
                   background: color.accentSubtle, border: `1px solid ${color.accentBorder}`,
                   borderRadius: radius.pill, padding: `2px ${space.sm}px`, whiteSpace: 'nowrap' }}>
          {match_score}% match
        </span>
      </header>

      <p style={{ fontSize: font.size.sm, color: color.textMuted, marginTop: space.xs }}>
        {routine_placement.slot} · {routine_placement.time.toUpperCase().replace('_', '/')} · {routine_placement.frequency.replace(/_/g, ' ')}
      </p>

      {/* Deterministic reasons first — this is the "why", and it renders with or without AI. */}
      <ul data-testid="why-matched" style={{ margin: `${space.md}px 0 0`, paddingLeft: space.lg, color: color.text, fontSize: font.size.sm }}>
        {why_matched.map((reason) => <li key={reason}>{humanizeReason(reason)}</li>)}
      </ul>

      {ingredients.length > 0 && (
        <p style={{ fontSize: font.size.sm, color: color.textMuted, marginTop: space.md }}>
          <strong style={{ color: color.text, fontWeight: font.weight.medium }}>Key ingredients: </strong>
          {ingredients.map((i) => `${i.name} (${i.role})`).join(', ')}
        </p>
      )}

      <p data-testid="compatibility" style={{ display: 'inline-block', marginTop: space.md, fontSize: font.size.sm,
             color: compatibilityStyle.fg, background: compatibilityStyle.bg,
             borderRadius: radius.sm, padding: `${space.xs}px ${space.sm}px` }}>
        {compatibilityStyle.label}
      </p>

      {cautions.length > 0 && (
        <ul data-testid="cautions" style={{ margin: `${space.sm}px 0 0`, paddingLeft: space.lg, color: color.caution, fontSize: font.size.sm }}>
          {cautions.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}

      {/* AI-generated supporting copy, explicitly labelled. Absent when generation failed or
          has not completed — the card must never depend on it. */}
      {blurb && (
        <p data-testid="ai-blurb" style={{ marginTop: space.md, fontSize: font.size.sm, color: color.textMuted,
               borderLeft: `2px solid ${color.accentBorder}`, paddingLeft: space.md, fontStyle: 'italic' }}>
          {blurb}
          <span style={{ display: 'block', fontStyle: 'normal', fontSize: font.size.xs, color: color.textFaint, marginTop: space.xs }}>
            AI-written summary
          </span>
        </p>
      )}
    </article>
  );
}

// Deterministic reason codes -> human copy. Cosmetic framing only, no efficacy claims
// (Section M.3's messaging guardrails).
export function humanizeReason(code: string): string {
  const map: Record<string, string> = {
    'targets:primary_concern': 'Targets the concern you picked first',
    'fits:skin_type': 'Suits your skin type',
    'fits:budget': 'Within your budget range',
    'brand:preferred': 'From a brand you already like',
  };
  return map[code] ?? code.replace(/[:_]/g, ' ');
}
