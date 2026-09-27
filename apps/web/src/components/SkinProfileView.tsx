import React from 'react';
import type { ProfileVector, AvoidFlags } from '@mgt/domain';
import { color, space, radius, font } from './theme-tokens';

// "My Skin" (Section G): the profile as the user's own record, with the timeline that makes
// it *dynamic* rather than a one-time quiz result (Section A.3 differentiator #2). Every
// dimension is shown as a labelled bar, not a number, because the vector is a weighting —
// presenting 0.85 as a score invites it to be read as a diagnosis.

const DIMENSION_LABELS: Record<keyof ProfileVector, string> = {
  hydration_need: 'Hydration',
  oil_control_need: 'Oil balance',
  sensitivity_ceiling: 'Tolerance to actives',
  acne_focus: 'Blemish focus',
  aging_focus: 'Ageing focus',
  brightening_focus: 'Brightening focus',
  texture_focus: 'Texture focus',
  redness_focus: 'Redness focus',
  eye_area_focus: 'Eye area focus',
  firmness_focus: 'Firmness focus',
};

const AVOID_LABELS: Record<keyof AvoidFlags, string> = {
  fragrance: 'Fragrance',
  essential_oils: 'Essential oils',
  alcohol_denat: 'Drying alcohols',
  physical_exfoliants: 'Physical scrubs',
  high_strength_actives: 'High-strength actives',
};

export interface ProfileVersion {
  version: number;
  created_at: string;
  reason: 'initial' | 'feedback' | 'retake' | 'photo';
}

export function SkinProfileView({
  vector, avoidFlags, rulesVersion, versions,
}: { vector: ProfileVector; avoidFlags: AvoidFlags; rulesVersion: string; versions: ProfileVersion[] }) {
  const active = (Object.keys(avoidFlags) as (keyof AvoidFlags)[]).filter((k) => avoidFlags[k]);

  return (
    <div data-testid="skin-profile">
      <h1 style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, margin: 0 }}>My Skin</h1>
      <p style={{ color: color.textMuted, fontSize: font.size.sm, marginTop: space.xs }}>
        This is what we match against. It updates as you give feedback.
      </p>

      <section aria-labelledby="profile-heading" style={{ marginTop: space.xl }}>
        <h2 id="profile-heading" style={{ fontSize: font.size.md, fontWeight: font.weight.semibold }}>Your profile</h2>
        <dl style={{ margin: `${space.md}px 0 0`, display: 'grid', gap: space.sm }}>
          {(Object.keys(DIMENSION_LABELS) as (keyof ProfileVector)[]).map((dim) => (
            <div key={dim} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', alignItems: 'center', gap: space.md }}>
              <dt style={{ fontSize: font.size.sm, color: color.text }}>{DIMENSION_LABELS[dim]}</dt>
              <dd style={{ margin: 0 }}>
                <div role="meter" aria-valuenow={Math.round(vector[dim] * 100)} aria-valuemin={0} aria-valuemax={100}
                     aria-label={DIMENSION_LABELS[dim]}
                     style={{ height: 6, background: color.border, borderRadius: radius.pill, overflow: 'hidden' }}>
                  <div style={{ width: `${vector[dim] * 100}%`, height: '100%', background: color.accent }} />
                </div>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="avoid-heading" style={{ marginTop: space.xl }}>
        <h2 id="avoid-heading" style={{ fontSize: font.size.md, fontWeight: font.weight.semibold }}>What we exclude for you</h2>
        {active.length === 0 ? (
          <p data-testid="no-exclusions" style={{ color: color.textMuted, fontSize: font.size.sm, marginTop: space.sm }}>
            Nothing excluded right now. Tell us about a reaction and we'll add it here.
          </p>
        ) : (
          <ul data-testid="exclusions" style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, listStyle: 'none', padding: 0, marginTop: space.sm }}>
            {active.map((k) => (
              <li key={k} style={{ fontSize: font.size.sm, color: color.caution, background: color.cautionSubtle,
                                   border: '1px solid var(--orange)', borderRadius: radius.pill, padding: `4px ${space.md}px` }}>
                {AVOID_LABELS[k]}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The timeline is the visible proof the profile is dynamic — a quiz result has no history. */}
      <section aria-labelledby="timeline-heading" style={{ marginTop: space.xl }}>
        <h2 id="timeline-heading" style={{ fontSize: font.size.md, fontWeight: font.weight.semibold }}>How it's changed</h2>
        <ol data-testid="timeline" style={{ listStyle: 'none', padding: 0, margin: `${space.md}px 0 0` }}>
          {versions.map((v) => (
            <li key={v.version} style={{ display: 'flex', gap: space.md, paddingBottom: space.md,
                                         borderLeft: `2px solid ${color.accentBorder}`, paddingLeft: space.md }}>
              <span style={{ fontSize: font.size.sm, color: color.text }}>
                {{ initial: 'Skin Match completed', feedback: 'Updated from your feedback', retake: 'You retook the Skin Match', photo: 'Updated after a photo check' }[v.reason]}
              </span>
              <time dateTime={v.created_at} style={{ marginLeft: 'auto', fontSize: font.size.xs, color: color.textFaint, whiteSpace: 'nowrap' }}>
                {new Date(v.created_at).toLocaleDateString()}
              </time>
            </li>
          ))}
        </ol>
      </section>

      <p style={{ marginTop: space.xl, fontSize: font.size.xs, color: color.textFaint }}>
        Matching rules version {rulesVersion}
      </p>
    </div>
  );
}
