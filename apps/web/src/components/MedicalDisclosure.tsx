import React from 'react';
import { color, radius, space, font } from './theme-tokens';

// The non-diagnostic position, made visible (Section A.1 secondary positioning, Section G's
// trust/disclosure requirement). This is a compliance surface, not decoration: it states the
// cosmetic-only boundary and offers the escalation path.
export function MedicalDisclosure({ variant = 'inline' }: { variant?: 'inline' | 'banner' }) {
  return (
    <aside data-testid="medical-disclosure" role="note"
      style={{
        marginTop: space.lg, padding: space.md, borderRadius: radius.md,
        background: variant === 'banner' ? color.cautionSubtle : color.bgSubtle,
        border: `1px solid ${variant === 'banner' ? 'var(--orange)' : color.border}`,
        fontSize: font.size.sm, color: color.textMuted, lineHeight: 1.5,
      }}>
      <strong style={{ color: color.text, fontWeight: font.weight.medium }}>Cosmetic guidance, not medical care. </strong>
      These recommendations are for general skincare and are not a diagnosis or treatment. If you have a
      persistent, painful, or changing skin condition, please see a dermatologist or your doctor.
    </aside>
  );
}
